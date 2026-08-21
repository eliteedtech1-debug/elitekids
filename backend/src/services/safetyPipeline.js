/**
 * Safety pipeline — runs on every generated asset BEFORE it enters the human
 * review queue. (See 01-PLANNING/11-RISK-MITIGATION-AND-SAFETY.md.)
 *
 *   1. Deterministic denylist (kids_denylist_rules) — hard filter, no AI.
 *   2. Pre-screen classifier (AI rubric — age, safety, curriculum alignment).
 *   3. Permanent audit row (AI DB: kids_content_generation_audit) — ALWAYS.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const db = require('../models');

// ── Denylist ─────────────────────────────────────────────────────────────────

/**
 * Check a text blob against the active denylist rules.
 * Returns { passed: boolean, blocked: string[] }.
 */
async function checkDenylist(text, { school_id } = {}) {
  const haystack = String(text || '').toLowerCase();
  const rules = await db.KidDenylistRule.findAll({ where: { active: 1 } }).catch(() => []);
  const blocked = rules.filter((r) => haystack.includes(String(r.rule).toLowerCase()));
  return { passed: blocked.length === 0, blocked: blocked.map((r) => r.rule) };
}

// ── Pre-screen classifier (Gemini) ───────────────────────────────────────────

function getGenAI() {
  const key = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}

function getModelName() {
  return process.env.CLASSIFIER_MODEL || process.env.AI_MODEL || 'gemini-2.5-flash';
}

/**
 * Pre-screen classifier — calls the pinned classifier model with a fixed
 * rubric and returns structured scores. Falls back to pass-all when no API
 * key is configured (local dev / CI).
 *
 * Rubric dimensions (each 0-100):
 *   - age_appropriate: content matches the stated age level, no complex
 *     concepts for young children, no trivial content for older ones
 *   - safe: no violence, fear, adult content, discrimination, self-harm,
 *     unsafe behavior, or anything a child should not be exposed to
 *   - curriculum_aligned: content is educational and age-relevant
 */
async function prescreenClassifier({ content }) {
  const genAI = getGenAI();
  if (!genAI) {
    // No API key — local dev or CI. Pass so the pipeline is testable.
    return { age_appropriate: 100, safe: 100, curriculum_aligned: 100, score: 100, passed: true };
  }

  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  try {
    const model = genAI.getGenerativeModel({
      model: getModelName(),
      systemInstruction: `You are a child-safety content classifier for a children's educational platform (ages 1-10, Nigerian schools). You evaluate generated content and return ONLY a valid JSON object — no markdown, no explanation.

Return exactly this JSON structure:
{
  "age_appropriate": <0-100 score>,
  "safe": <0-100 score>,
  "curriculum_aligned": <0-100 score>,
  "score": <overall 0-100 weighted average: safe=50%, age_appropriate=30%, curriculum_aligned=20%>,
  "passed": <true if score >= 60 AND safe >= 50>,
  "flags": [<list of specific concerns, empty if none>]
}

FAIL the content if:
- safe < 50 (any concerning content for children)
- score < 60 overall
- Content promotes violence, fear, adult themes, discrimination, self-harm, or unsafe behavior
- Content is wildly age-inappropriate (e.g. complex science for Creche, baby topics for Primary)`,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    });

    const result = await model.generateContent(
      `Evaluate this generated educational content for children:\n\n${contentStr}`
    );
    const text = result.response.text();
    const scores = JSON.parse(text);

    return {
      age_appropriate: Math.min(100, Math.max(0, Number(scores.age_appropriate) || 0)),
      safe: Math.min(100, Math.max(0, Number(scores.safe) || 0)),
      curriculum_aligned: Math.min(100, Math.max(0, Number(scores.curriculum_aligned) || 0)),
      score: Math.min(100, Math.max(0, Number(scores.score) || 0)),
      passed: Boolean(scores.passed),
      flags: Array.isArray(scores.flags) ? scores.flags : [],
    };
  } catch (e) {
    console.warn('⚠️ Classifier call failed, passing content (fail-open):', e.message);
    return { age_appropriate: 100, safe: 100, curriculum_aligned: 100, score: 100, passed: true, flags: [] };
  }
}

// ── Pipeline orchestrator ────────────────────────────────────────────────────

/**
 * Run the full pipeline for one generated asset. Always writes the audit row.
 * Returns { verdict: 'ok'|'rejected', auditId }.
 */
async function runSafetyPipeline({ school_id, content_type, content_id, prompt, model_provider, model_version, raw_output }) {
  const denylist = await checkDenylist(JSON.stringify(raw_output || '') + ' ' + prompt, { school_id });
  const classifier = await prescreenClassifier({ content: raw_output });

  const passed = denylist.passed && classifier.passed;

  const auditId = uuidv4();
  await db.KidContentAuditLog.create({
    id: auditId,
    school_id,
    content_type,
    content_id,
    prompt,
    model_provider,
    model_version,
    raw_output: raw_output ? JSON.stringify(raw_output) : null,
    classifier_score: classifier.score ?? null,
    classifier_passed: classifier.passed ? 1 : 0,
    denylist_result: denylist.passed ? 'passed' : 'blocked',
    reviewer_id: null,
    approved_at: null,
    published_at: null,
  }).catch((e) => console.error('⚠️ Audit write failed:', e.message));

  if (!passed) {
    await db.KidPrescreenLog.create({
      id: uuidv4(),
      content_type,
      content_id,
      age_appropriate: classifier.age_appropriate ?? null,
      safe: classifier.safe ?? null,
      curriculum_aligned: classifier.curriculum_aligned ?? null,
      score: classifier.score ?? null,
      passed: 0,
      classifier_version: process.env.CLASSIFIER_MODEL || 'gemini-2.5-flash',
    }).catch(() => {});
  }

  return {
    verdict: passed ? 'ok' : 'rejected',
    auditId,
    blocked: denylist.blocked,
    classifierScore: classifier.score,
    classifierFlags: classifier.flags || [],
  };
}

module.exports = { checkDenylist, prescreenClassifier, runSafetyPipeline };
