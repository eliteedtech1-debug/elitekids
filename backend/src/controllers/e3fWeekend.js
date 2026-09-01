'use strict';
/**
 * E3f-FLOW — Weekend Challenge: personalized test assembled from what the child
 * actually played/learned in the last 10 days. Generated ONCE per ISO week
 * (deterministic id), served Sat/Sun, playable through the normal GamePlay quiz path.
 */
const { Op } = require('sequelize');

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3); // Thursday of this ISO week
  const isoYear = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Thu = new Date(Date.UTC(isoYear, 0, 4));
  week1Thu.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  const weekNo = 1 + Math.round((t - week1Thu) / (7 * 86400000));
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
}

/** Convert one published game config into up to `limit` review questions (MCQ). */
function questionsFromConfig(cfgRow, seen, limit) {
  const cj = cfgRow.config_json || {};
  const out = [];
  const base = String(cj.item_id || cfgRow.item_id || cfgRow.id);
  const push = (id, prompt, opts) => {
    if (out.length >= limit || seen.has(id)) return;
    shuffleArr(opts);
    seen.add(id);
    out.push({ id, prompt, options: opts.map((o) => ({ id: o.label, label: o.label })), correctIndex: opts.findIndex((o) => o.correct) });
  };

  if (Array.isArray(cj.questions)) {
    for (const q of cj.questions) {
      if (out.length >= limit) break;
      if (!Array.isArray(q.options) || typeof q.correctIndex !== 'number' || !q.options[q.correctIndex]) continue;
      push(`wk-${base}-q-${q.id || out.length}`, q.prompt,
        q.options.map((o, i) => ({ label: String(o.label), correct: i === q.correctIndex })));
    }
  }
  if (Array.isArray(cj.pairs) && cj.pairs.length >= 3) {
    for (const p of cj.pairs) {
      if (out.length >= limit) break;
      if (!p.a || !p.b) continue;
      const distractors = shuffleArr(cj.pairs.filter((x) => x.b && x.b !== p.b).map((x) => x.b)).slice(0, 2);
      push(`wk-${base}-m-${p.a}`, `Which one matches “${p.a}”?`,
        [{ label: p.b, correct: true }, ...distractors.map((l) => ({ label: l, correct: false }))]);
    }
  }
  if (Array.isArray(cj.sentences)) {
    for (const s of cj.sentences) {
      if (out.length >= limit) break;
      const ans = s.blanks && s.blanks[0] && s.blanks[0].answer;
      if (!ans) continue;
      const distractors = shuffleArr((s.wordBank || []).filter((w) => w && w !== ans)).slice(0, 2);
      push(`wk-${base}-f-${ans}`, s.sentence,
        [{ label: ans, correct: true }, ...distractors.map((l) => ({ label: l, correct: false }))]);
    }
  }
  if (cj.template === 'drag-sort' && Array.isArray(cj.items) && cj.items.length >= 3) {
    const labels = cj.items.map((it) => it.label).filter(Boolean);
    if (labels.length >= 3) {
      const first = labels[0];
      const distractors = shuffleArr(labels.slice(1)).slice(0, 2);
      push(`wk-${base}-s-${first}`, `You sorted: ${labels.join(' · ')}. Which came FIRST?`,
        [{ label: first, correct: true }, ...distractors.map((l) => ({ label: l, correct: false }))]);
    }
  }
  // tap-recognition intentionally skipped: audio-driven prompts don't translate to MCQ.
  return out;
}

async function getWeekendTest(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    if (!admission) return res.status(403).json({ success: false, message: 'Student profile required.' });

    const now = new Date();
    const isWeekend = now.getUTCDay() === 6 || now.getUTCDay() === 0;
    if (!isWeekend && process.env.FORCE_WEEKEND_TEST !== '1') {
      return res.json({ success: true, data: { available: false, reason: 'Comes back on Saturday!' } });
    }

    const weekKey = isoWeekKey(now);
    const lessonId = `lesson-weekend-${weekKey}`;

    const existing = await db.KidLesson.findByPk(lessonId);
    if (existing) {
      return res.json({ success: true, data: { available: true, lesson_id: lessonId, title: existing.title } });
    }

    // Harvest this child's recent played lessons (last 10 days)
    const hist = await db.KidProgress.findAll({
      attributes: ['lesson_id'],
      where: {
        child_admission_no: admission,
        lesson_id: { [Op.ne]: null },
        completed_at: { [Op.gte]: new Date(Date.now() - 10 * 86400000) },
      },
      raw: true,
    });
    const lessonIds = [...new Set(hist.map((h) => h.lesson_id).filter(Boolean))];

    const seen = new Set();
    let questions = [];
    const takeFrom = async (where, perCfg, total) => {
      if (questions.length >= total) return;
      const cfgs = await db.KidGameConfig.findAll({
        where: {
          content_state: 'published',
          template: { [Op.in]: ['quiz', 'matching', 'fill-in-blank', 'drag-sort'] },
          ...where,
        },
        limit: 40,
      });
      shuffleArr(cfgs);
      for (const c of cfgs) {
        if (questions.length >= total) break;
        questions = questions.concat(questionsFromConfig(c, seen, Math.max(1, Math.min(perCfg, total - questions.length))));
      }
    };
    if (lessonIds.length) await takeFrom({ lesson_id: { [Op.in]: lessonIds } }, 2, 10);
    if (questions.length < 5) await takeFrom({ id: { [Op.notLike]: 'gc-weekend-%' } }, 2, 10); // backfill so every kid gets a real challenge
    if (questions.length < 5) {
      return res.json({ success: true, data: { available: false, reason: 'Learn more games first!' } });
    }
    questions = questions.slice(0, 10);

    await db.KidLesson.upsert({
      id: lessonId,
      school_id: 'SCH-ELITE',
      branch_id: 'BR-MAIN',
      title: `Weekend Challenge — ${weekKey}`,
      subject: 'Review',
      age_level: 'KG2',
      is_global: 1,
      source_lesson_id: null,
      owner_school_id: null,
      lesson_text: `A personalized review built from your week of learning (${questions.length} questions).`,
      created_by: 'SYSTEM',
      content_state: 'published',
      lesson_type: 'game',
      duration_target_sec: 300,
      published_at: new Date(),
      nerdc_code: `NERDC-ECC-LIT-REVIEW-${weekKey}`,
      nerdc_strand: 'Literacy',
      nerdc_sub_strand: 'Consolidation',
    });
    await db.KidGameConfig.upsert({
      id: `gc-weekend-${weekKey}`,
      lesson_id: lessonId,
      template: 'quiz',
      age_level: 'KG2',
      item_id: `weekend-${weekKey}`,
      tier: 3,
      category: 'Review',
      content_state: 'published',
      schema_version: '1.0',
      config_json: {
        gameId: `gc-weekend-${weekKey}`,
        item_id: `weekend-${weekKey}`,
        lessonId,
        template: 'quiz',
        category: 'Review',
        ageLevel: 'KG2',
        tier: 3,
        rewards: { xp: 40, starsOnComplete: 3 },
        responseMode: 'text',
        successThresholdPct: 50,
        durationSec: 300,
        durationTargetSec: 300,
        personalized: true,
        built_from: lessonIds.slice(0, 8),
        questions,
      },
    });
    console.log(`getWeekendTest: generated ${lessonId} (${questions.length}q from ${lessonIds.length} lessons)`);
    return res.json({ success: true, data: { available: true, lesson_id: lessonId, title: `Weekend Challenge — ${weekKey}`, questions_count: questions.length } });
  } catch (err) {
    console.error('getWeekendTest error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { getWeekendTest };
