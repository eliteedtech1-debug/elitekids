'use strict';

/**
 * Q3 Classroom Collaboration controller (REST). See q3-village-planning.md §3.1.
 *
 * Endpoints:
 *   POST /kids/teams/create                 — create a team (teacher or auto)
 *   GET  /kids/teams/:id                    — team details
 *   POST /kids/teams/:id/join               — student joins
 *   GET  /kids/teams/:id/challenge          — current active challenge
 *   POST /kids/teams/:id/challenge/submit   — submit an answer
 *   POST /kids/peer-teach/record            — record a peer explanation (text)
 *   GET  /kids/peer-teach/board?subject=     — browse approved explanations
 *   GET  /kids/class-quest/active           — current class quest
 *   POST /kids/class-quest/contribute       — contribute (answer/play)
 *   GET  /kids/class-quest/leaderboard      — class standings
 *
 * Realtime events are broadcast via sockets/collaboration.js through
 * collaborationNotifier (set in index.js attach).
 */

const db = require('../models');
const { Op } = require('sequelize');
const { formTeams, teamCreatePayload } = require('../services/teamFormation');
const { scoreQuest, applyContribution } = require('../services/classQuestScoring');
const { isStaffRole } = require('../config/config');
const { requireClassAccess } = require('../services/routesHelper');

// Set by sockets/collaboration.js attach() so REST writes fan out live.
let collaborationNotifier = null;
function setNotifier(fn) {
  collaborationNotifier = fn;
}

function emit(room, event, payload) {
  if (collaborationNotifier) {
    collaborationNotifier(room, event, payload).catch((e) =>
      console.error('collab emit error:', e.message)
    );
  }
}

function roleOf(user) {
  return String((user && (user.user_type || user.role)) || '').toLowerCase();
}

function isStaff(user) {
  return isStaffRole(roleOf(user));
}

function studentAdmission(user) {
  const r = roleOf(user);
  if (r === 'student') return String(user.admission_no || user.id || '');
  return null;
}

/** GET /kids/teams/mine — discover the signed-in student's active team. */
async function getMyTeam(req, res) {
  try {
    const admission = studentAdmission(req.user);
    if (!admission) return res.status(403).json({ success: false, message: 'Only students can view their team.' });
    const member = await db.KidTeamMember.findOne({ where: { child_admission_no: admission }, order: [['id', 'DESC']] });
    if (!member) return res.json({ success: true, data: null });
    const team = await db.KidTeam.findByPk(member.team_id);
    if (!team) return res.json({ success: true, data: null });
    const classAccess = await requireClassAccess(req, team.class_id);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);
    return res.json({ success: true, data: { ...team.get({ plain: true }), member: member.get({ plain: true }) } });
  } catch (err) {
    console.error('getMyTeam error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/teams/:id */
async function getTeam(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid team id.' });
    }
    const team = await db.KidTeam.findByPk(id);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    const classAccess = await requireClassAccess(req, team.class_id);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);
    const admission = studentAdmission(req.user);
    if (admission) {
      const member = await db.KidTeamMember.findOne({ where: { team_id: id, child_admission_no: admission } });
      if (!member) return res.status(403).json({ success: false, message: 'You are not a member of this team.' });
    }
    const members = await db.KidTeamMember.findAll({
      where: { team_id: id },
      order: [['joined_at', 'ASC']],
    });
    return res.json({
      success: true,
      data: {
        ...team.get({ plain: true }),
        members: members.map((m) => m.get({ plain: true })),
      },
    });
  } catch (err) {
    console.error('getTeam error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/teams/create { class_id, name?, member_ids[] } */
async function createTeam(req, res) {
  try {
    const user = req.user;
    const classId = String((req.body && req.body.class_id) || req.query.class_id || '').trim();
    if (!classId) return res.status(400).json({ success: false, message: 'class_id is required.' });
    const classAccess = await requireClassAccess(req, classId);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);

    const memberIds = Array.isArray(req.body.member_ids) ? req.body.member_ids.map((m) => String(m).trim()).filter(Boolean) : [];

    let name = String(req.body.name || '').trim();
    let createdBy = String(user.id || user.user_id || '');
    let classSize = memberIds.length;

    if (name && memberIds.length === 0) {
      // Teacher created a shell team; members join later.
    } else if (!name && memberIds.length > 0) {
      // Auto-balance demand → form teams. Use declared age bands when present.
      const rows = await db.KidChild.findAll({
        where: { admission_no: { [Op.in]: memberIds } },
        attributes: ['admission_no', 'age_level', 'class_code'],
      });
      const bandOf = {};
      for (const r of rows) bandOf[r.admission_no] = r.age_level || null;
      const students = memberIds.map((m) => ({ child_admission_no: m, age_band: bandOf[m] || null, recent_xp: 0 }));
      const formed = formTeams(students);
      const first = formed[0];
      if (first) {
        name = first.name;
        // only leaders of that formed team are added here for simplicity
      }
    }

    if (!name) {
      return res.status(400).json({ success: false, message: 'Provide a name or member_ids to auto-form a team.' });
    }

    const team = await db.KidTeam.create({
      school_id: String(req.body.school_id || user.school_id || ''),
      class_id: classId,
      name,
      created_by: createdBy,
      status: 'active',
    });

    // Add the creator as the leader (for teachers the leader is the class).
    if (memberIds.length > 0) {
      for (const adm of memberIds.slice(0, 8)) {
        await db.KidTeamMember.create({ team_id: team.id, child_admission_no: adm, role: 'member' }).catch(() => {});
      }
    }

    emit(`class:${classId}`, 'team:created', { team_id: team.id, name: team.name, class_id: classId });
    return res.status(201).json({ success: true, data: { id: team.id, name: team.name, class_id: classId } });
  } catch (err) {
    console.error('createTeam error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/teams/:id/join */
async function joinTeam(req, res) {
  try {
    const id = Number(req.params.id);
    const admission = studentAdmission(req.user);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'Invalid team id.' });
    if (!admission) return res.status(403).json({ success: false, message: 'Only students can join a team.' });

    const team = await db.KidTeam.findByPk(id);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    const classAccess = await requireClassAccess(req, team.class_id);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);
    if (team.status !== 'active') return res.status(400).json({ success: false, message: 'Team is closed.' });

    const [member, created] = await db.KidTeamMember.findOrCreate({
      where: { team_id: id, child_admission_no: admission },
      defaults: { team_id: id, child_admission_no: admission, role: 'member' },
    });
    emit(`team:${id}`, 'team:joined', { team_id: id, child_admission_no: admission });
    emit(`class:${team.class_id}`, 'team:joined', { team_id: id, child_admission_no: admission });
    return res.json({ success: true, data: { joined: created, member_id: member.id } });
  } catch (err) {
    console.error('joinTeam error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/teams/:id/challenge — current active challenge */
async function getTeamChallenge(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'Invalid team id.' });
    const team = await db.KidTeam.findByPk(id);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    const classAccess = await requireClassAccess(req, team.class_id);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);
    const admission = studentAdmission(req.user);
    if (admission) {
      const member = await db.KidTeamMember.findOne({ where: { team_id: id, child_admission_no: admission } });
      if (!member) return res.status(403).json({ success: false, message: 'You are not a member of this team.' });
    }
    const challenge = await db.KidTeamChallenge.findOne({
      where: { team_id: id, status: { [Op.in]: ['lobby', 'active'] } },
      order: [['id', 'DESC']],
    });
    if (!challenge) return res.json({ success: true, data: null });
    return res.json({ success: true, data: challenge.get({ plain: true }) });
  } catch (err) {
    console.error('getTeamChallenge error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/teams/:id/challenge/submit { challenge_id?, lesson_id, answer_score } */
async function submitChallenge(req, res) {
  try {
    const id = Number(req.params.id);
    const admission = studentAdmission(req.user);
    if (!admission) return res.status(403).json({ success: false, message: 'Only students can submit.' });
    const team = await db.KidTeam.findByPk(id);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    const classAccess = await requireClassAccess(req, team.class_id);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);
    const member = await db.KidTeamMember.findOne({ where: { team_id: id, child_admission_no: admission } });
    if (!member) return res.status(403).json({ success: false, message: 'You are not a member of this team.' });

    let challenge = await db.KidTeamChallenge.findOne({
      where: { team_id: id, status: 'active' },
      order: [['id', 'DESC']],
    });
    if (!challenge) {
      // Lobby → auto-start on first submit.
      challenge = await db.KidTeamChallenge.create({
        team_id: id,
        lesson_id: String(req.body.lesson_id || ''),
        status: 'active',
        started_at: new Date(),
        max_questions: Number(req.body.max_questions) || 5,
      });
      emit(`team:${id}`, 'challenge:started', { team_id: id, challenge_id: challenge.id });
    }

    let scores = challenge.scores || {};
    const base = Number(scores[admission]) || 0;
    scores[admission] = base + (Number(req.body.answer_score) || 0);
    const nextIndex = Number(challenge.current_index) + 1;
    await challenge.update({ scores, current_index: nextIndex, scores });
    emit(`team:${id}`, 'challenge:answer', { team_id: id, child_admission_no: admission, answer_score: Number(req.body.answer_score) || 0 });

    if (nextIndex >= challenge.max_questions) {
      await challenge.update({ status: 'ended', ended_at: new Date() });
      emit(`team:${id}`, 'challenge:ended', { team_id: id, challenge_id: challenge.id, scores: challenge.scores });
    } else {
      emit(`team:${id}`, 'challenge:tick', { team_id: id, current_index: nextIndex });
    }
    return res.json({ success: true, data: { challenge_id: challenge.id, current_index: nextIndex } });
  } catch (err) {
    console.error('submitChallenge error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/peer-teach/record { subject, skill_key, lesson_id, explanation_text } */
async function recordPeerTeaching(req, res) {
  try {
    const admission = studentAdmission(req.user);
    if (!admission) return res.status(403).json({ success: false, message: 'Only students can record.' });

    const classId = String(req.body.class_id || '').trim();
    if (!classId) return res.status(400).json({ success: false, message: 'class_id is required.' });
    const classAccess = await requireClassAccess(req, classId);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);

    const text = String(req.body.explanation_text || '').trim();
    if (!text || text.length > 2000) return res.status(400).json({ success: false, message: 'Provide a short explanation (max 2000 chars).' });

    const peer = await db.KidPeerTeaching.create({
      school_id: String(req.user.school_id || ''),
      class_id: classId,
      child_admission_no: admission,
      subject: String(req.body.subject || '').trim() || null,
      skill_key: String(req.body.skill_key || '').trim() || null,
      lesson_id: String(req.body.lesson_id || '').trim() || null,
      explanation_text: text,
      status: 'approved', // v1: auto-approve; screening hook lives in safetyPipeline.
    });
    emit(`class:${peer.class_id}`, 'peer-teach:new', { id: peer.id, subject: peer.subject, author: admission });
    return res.status(201).json({ success: true, data: { id: peer.id } });
  } catch (err) {
    console.error('recordPeerTeaching error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/peer-teach/board?subject= */
async function getPeerTeachingBoard(req, res) {
  try {
    const subject = String(req.query.subject || '').trim();
    const classId = String(req.query.class_id || '').trim();
    if (!classId) return res.status(400).json({ success: false, message: 'class_id is required.' });
    const classAccess = await requireClassAccess(req, classId);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);
    const where = { status: 'approved' };
    if (subject) where.subject = subject;
    if (classId) where.class_id = classId;
    const rows = await db.KidPeerTeaching.findAll({
      where,
      order: [['helps_count', 'DESC']],
      limit: 100,
    });
    return res.json({ success: true, data: rows.map((r) => r.get({ plain: true })) });
  } catch (err) {
    console.error('getPeerTeachingBoard error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/class-quest/active */
async function getActiveClassQuest(req, res) {
  try {
    const classId = String(req.query.class_id || req.body.class_id || '').trim();
    if (!classId) return res.status(400).json({ success: false, message: 'class_id is required.' });
    const classAccess = await requireClassAccess(req, classId);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);
    const where = { status: { [Op.in]: ['active', 'completed'] }, class_id: classId };
    const quest = await db.KidClassQuest.findOne({ where, order: [['id', 'DESC']] });
    if (!quest) return res.json({ success: true, data: null });
    const scored = scoreQuest({ target_value: quest.target_value, contributions: quest.contributions });
    return res.json({ success: true, data: { ...quest.get({ plain: true }), ...scored } });
  } catch (err) {
    console.error('getActiveClassQuest error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/class-quest/contribute { quest_id, amount, metric? } */
async function contributeClassQuest(req, res) {
  try {
    const admission = studentAdmission(req.user);
    if (!admission) return res.status(403).json({ success: false, message: 'Only students can contribute.' });

    const questId = Number(req.body.quest_id);
    const amount = Math.max(0, Number(req.body.amount) || 0);
    if (!Number.isInteger(questId) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid quest_id and amount are required.' });
    }
    const quest = await db.KidClassQuest.findByPk(questId);
    if (!quest) return res.status(404).json({ success: false, message: 'Quest not found.' });
    const classAccess = await requireClassAccess(req, quest.class_id);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);
    if (quest.status !== 'active') return res.status(400).json({ success: false, message: 'Quest is not active.' });

    const newContributions = applyContribution(quest.contributions, admission, amount);
    const scored = scoreQuest({ target_value: quest.target_value, contributions: newContributions });
    const status = scored.is_complete ? 'completed' : quest.status;

    await quest.update({ contributions: newContributions, current_value: scored.total_progress, status });
    emit(`quest:${questId}`, 'class-quest:progress', { quest_id: questId, progress_pct: scored.progress_pct, child_admission_no: admission });
    emit(`class:${quest.class_id}`, 'class-quest:progress', { quest_id: questId, progress_pct: scored.progress_pct });
    if (scored.is_complete) {
      emit(`quest:${questId}`, 'class-quest:completed', { quest_id: questId, total_progress: scored.total_progress });
      emit(`class:${quest.class_id}`, 'class-quest:completed', { quest_id: questId });
    }
    return res.json({ success: true, data: scored });
  } catch (err) {
    console.error('contributeClassQuest error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/class-quest/leaderboard */
async function getClassQuestLeaderboard(req, res) {
  try {
    const questId = req.query.quest_id ? Number(req.query.quest_id) : null;
    const where = questId ? { id: questId } : { status: 'active' };
    const quest = await db.KidClassQuest.findOne({ where, order: [['id', 'DESC']] });
    if (!quest) return res.json({ success: true, data: [] });
    const classAccess = await requireClassAccess(req, quest.class_id);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);
    const scored = scoreQuest({ target_value: quest.target_value, contributions: quest.contributions });
    return res.json({ success: true, data: scored.leaderboard });
  } catch (err) {
    console.error('getClassQuestLeaderboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  setNotifier,
  getMyTeam,
  getTeam,
  createTeam,
  joinTeam,
  getTeamChallenge,
  submitChallenge,
  recordPeerTeaching,
  getPeerTeachingBoard,
  getActiveClassQuest,
  contributeClassQuest,
  getClassQuestLeaderboard,
};
