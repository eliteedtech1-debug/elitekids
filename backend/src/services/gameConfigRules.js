'use strict';

/**
 * Per-template game-config validation for MANUAL saves (createLessonManual).
 *
 * Two layers, applied to the two NEW bridge templates:
 *   1. JSON Schema (game-engine/schemas/*.schema.json) — structural contract.
 *   2. Template-specific pedagogy rules that JSON Schema cannot express
 *      (unique labels/ids, labelBank distractor coverage, ordered narration,
 *      no duplicate clock times, o'clock sequences ascending).
 *
 * Legacy templates are NOT schema-gated here: their stored shape historically
 * mixes schema-style (assets.*) and flat runtime shapes, so forcing them
 * through ajv now would break existing teacher-created content. Their rules
 * live in the legacy pedagogy path. New templates store the SAME canonical
 * shape the renderer consumes (flat, top-level), so full validation is safe.
 */

const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');

const SCHEMA_DIR = path.join(__dirname, '..', '..', '..', 'game-engine', 'schemas');
const ajv = new Ajv({ allErrors: true, strict: false });

// Templates validated end-to-end on manual save (schema + pedagogy rules).
const SCHEMA_GATED_TEMPLATES = ['label-diagram', 'stage-sequence', 'game-chain'];

// Sub-game templates allowed inside a game-chain round. game-chain itself is
// excluded (no nesting) and puzzle-split is excluded (its difficulty-ladder
// scoring is not a linear chain round).
const CHAIN_ROUND_TEMPLATES = [
  'matching',
  'tap-recognition',
  'drag-sort',
  'quiz',
  'fill-in-blank',
  'memory-pairs',
  'label-diagram',
  'stage-sequence',
];

const _schemaCache = {};

function loadSchema(template) {
  if (_schemaCache[template]) return _schemaCache[template];
  const file = path.join(SCHEMA_DIR, `${template}.schema.json`);
  try {
    const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
    const compiled = { schema, validate: ajv.compile(schema) };
    _schemaCache[template] = compiled;
    return compiled;
  } catch (e) {
    return null;
  }
}

/** Parse config_json that may arrive as string or object. */
function parseConfig(raw) {
  if (raw && typeof raw === 'object') return { config: raw, error: null };
  if (typeof raw === 'string') {
    try {
      return { config: JSON.parse(raw), error: null };
    } catch (e) {
      return { config: null, error: `config_json is not valid JSON: ${e.message}` };
    }
  }
  return { config: null, error: 'config_json must be a JSON object' };
}

function timeToMinutes(t) {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(String(t || ''));
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// ── label-diagram pedagogy ─────────────────────────────────────────────────
function labelDiagramErrors(cfg) {
  const errors = [];
  const hotspots = Array.isArray(cfg.hotspots) ? cfg.hotspots : [];

  const seen = new Set();
  for (const h of hotspots) {
    const label = String(h.label || '').trim().toLowerCase();
    if (!label) errors.push(`hotspot "${h.id || '?'}" has an empty label`);
    if (seen.has(label)) errors.push(`duplicate hotspot label: "${h.label}" (labels must be unique)`);
    seen.add(label);
  }

  const bank = Array.isArray(cfg.labelBank) ? cfg.labelBank.map((l) => String(l).trim().toLowerCase()) : [];
  for (const h of hotspots) {
    const label = String(h.label || '').trim().toLowerCase();
    if (label && !bank.includes(label)) errors.push(`labelBank is missing hotspot label "${h.label}"`);
  }
  if (cfg.mode === 'part-to-label' || cfg.mode === 'mixed') {
    const distractorCount = new Set(bank.filter((l) => !seen.has(l))).size;
    if (distractorCount < 3) {
      errors.push(`mode "${cfg.mode}" needs >= 3 distractor labels in labelBank (labels not on the diagram); found ${distractorCount}`);
    }
  }
  return errors;
}

// ── stage-sequence pedagogy ────────────────────────────────────────────────
function stageSequenceErrors(cfg) {
  const errors = [];
  const steps = Array.isArray(cfg.steps) ? cfg.steps : [];
  const assessment = Array.isArray(cfg.assessment) ? cfg.assessment : [];

  // Unique ids across steps and assessment.
  const stepIds = new Set();
  for (const s of steps) {
    if (!s || !s.id) errors.push('every step needs an id');
    else if (stepIds.has(s.id)) errors.push(`duplicate step id: "${s.id}"`);
    stepIds.add(s && s.id);
  }
  const asmtIds = new Set();
  for (const a of assessment) {
    if (!a || !a.id) errors.push('every assessment item needs an id');
    else if (asmtIds.has(a.id)) errors.push(`duplicate assessment id: "${a.id}"`);
    asmtIds.add(a && a.id);
  }

  // Every step must be narratable (TTS reads it aloud as it auto-advances).
  for (const s of steps) {
    if (!s || !String(s.narration || '').trim()) {
      errors.push(`step "${s && s.id ? s.id : '?'}" is missing narration text (read aloud by TTS)`);
    }
  }

  // Clock topic: no duplicate analog times; pure o'clock runs must ascend.
  if (String(cfg.topic || '').toLowerCase() === 'clock') {
    const times = steps
      .filter((s) => s && s.kind === 'analog-clock')
      .map((s) => ({ id: s.id, minutes: timeToMinutes(s.time) }));
    const bad = times.filter((t) => t.minutes === null);
    for (const b of bad) errors.push(`analog-clock step "${b.id}" has invalid time`);
    const valid = times.filter((t) => t.minutes !== null);
    const dup = new Set();
    for (const t of valid) {
      if (dup.has(t.minutes)) errors.push(`duplicate clock time on step "${t.id}" (a sequence should not repeat a time)`);
      dup.add(t.minutes);
    }
    const allOClock = valid.length > 0 && valid.every((t) => t.minutes % 60 === 0);
    if (allOClock) {
      for (let i = 1; i < valid.length; i += 1) {
        if (valid[i].minutes <= valid[i - 1].minutes) {
          errors.push(`o'clock steps must ascend simple→complex: "${valid[i - 1].id}" (${steps.find((s) => s.id === valid[i - 1].id).time}) is not before "${valid[i].id}" (${steps.find((s) => s.id === valid[i].id).time})`);
        }
      }
    }
    for (const a of assessment) {
      if (a && a.kind === 'analog-clock' && timeToMinutes(a.time) === null) {
        errors.push(`assessment "${a.id}" has invalid analog time "${a.time}"`);
      }
    }
  }

  // label-diagram checks inside assessment need their target hotspot to exist.
  const allHotspotIds = new Set();
  for (const a of assessment) {
    if (a && a.kind === 'label-diagram' && Array.isArray(a.hotspots)) {
      for (const h of a.hotspots) allHotspotIds.add(h.id);
      if (!a.correctId || !a.hotspots.some((h) => h.id === a.correctId)) {
        errors.push(`label-diagram check "${a.id}" correctId "${a.correctId}" does not match any hotspot`);
      }
    }
  }

  return errors;
}

// ── game-chain pedagogy ────────────────────────────────────────────────────
/** Errors for the heterogeneous multi-round chain (recurses into every round's
 * own template validation, so a bad label-diagram round is caught by the same
 * rules that gate a standalone label-diagram game). */
function gameChainErrors(cfg) {
  const errors = [];
  const rounds = Array.isArray(cfg.rounds) ? cfg.rounds : [];
  if (rounds.length < 2) {
    errors.push('a game-chain needs at least 2 rounds');
  }

  const seen = new Set();
  rounds.forEach((round, i) => {
    const pos = `round[${i}]`;
    if (!round || typeof round !== 'object') {
      errors.push(`${pos} must be an object`);
      return;
    }
    if (!round.id || seen.has(round.id)) errors.push(`${pos} needs a unique id`);
    seen.add(round && round.id);

    if (!CHAIN_ROUND_TEMPLATES.includes(round.template)) {
      errors.push(`${pos} ("${round.id}") has invalid sub-template "${round.template}" — allowed: ${CHAIN_ROUND_TEMPLATES.join(', ')}`);
      return;
    }

    const sub = validateManualConfig(round.template, round.config);
    if (!sub.valid) {
      for (const e of sub.errors) errors.push(`${pos} ("${round.id}" · ${round.template}): ${e}`);
    } else if (round.config && typeof round.config === 'object') {
      // The nested config must declare the same template the round claims.
      if (round.config.template && round.config.template !== round.template) {
        errors.push(`${pos} config.template "${round.config.template}" does not match round template "${round.template}"`);
      }
    }
  });
  return errors;
}

/**
 * Validate a manual config for the gated new templates.
 * Returns { valid: boolean, errors: string[] } — never throws.
 */
function validateManualConfig(template, rawConfig) {
  const { config, error } = parseConfig(rawConfig);
  if (error) return { valid: false, errors: [error] };

  if (!SCHEMA_GATED_TEMPLATES.includes(template)) {
    // Legacy/ungated templates: schema files exist, but stored shapes are
    // historically mixed — only structural sanity here, preserving behavior.
    return { valid: config && typeof config === 'object' && !Array.isArray(config), errors: [] };
  }

  const errors = [];
  const loaded = loadSchema(template);
  if (!loaded) {
    return { valid: false, errors: [`No schema for template '${template}'`] };
  }
  if (!loaded.validate(config)) {
    errors.push(`${template} config failed schema validation: ${ajv.errorsText(loaded.validate.errors)}`);
  }

  const specific =
    template === 'label-diagram'
      ? labelDiagramErrors(config)
      : template === 'stage-sequence'
      ? stageSequenceErrors(config)
      : template === 'game-chain'
      ? gameChainErrors(config)
      : [];
  errors.push(...specific);

  return { valid: errors.length === 0, errors };
}

// ── Scene card rules (Phase 3 — scene engine backend) ─────────────────────

const SCENE_TYPES = ['intro', 'teach', 'reinforce', 'recap', 'game_checkpoint'];
const SCENE_TRANSITIONS = ['fade', 'slide', 'none'];

/** Canonical type of a stored card: `type` wins, legacy `sceneType` alias
 * accepted, default teach. (GUI sends `type`; old backend read `sceneType`
 * and always persisted 'teach' — fixed by using this everywhere.) */
function canonicalSceneType(card) {
  if (card && typeof card === 'object') {
    if (typeof card.type === 'string' && card.type.trim()) return card.type;
    if (typeof card.sceneType === 'string' && card.sceneType.trim()) return card.sceneType;
  }
  return 'teach';
}

/** Synchronous shape checks for a scene card. Returns string[] (empty = ok). */
function sceneCardErrors(card) {
  const errors = [];
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    return ['scene card must be an object'];
  }

  const type = canonicalSceneType(card);
  if (!SCENE_TYPES.includes(type)) {
    errors.push(`invalid scene type "${type}" — must be one of: ${SCENE_TYPES.join(', ')}`);
  }

  if (card.durationSec !== undefined && card.durationSec !== null) {
    const d = Number(card.durationSec);
    if (!Number.isInteger(d) || d < 3 || d > 60) {
      errors.push('durationSec must be an integer between 3 and 60');
    }
  }

  if (card.transition !== undefined && card.transition !== null && !SCENE_TRANSITIONS.includes(card.transition)) {
    errors.push(`invalid transition "${card.transition}" — must be one of: ${SCENE_TRANSITIONS.join(', ')}`);
  }

  if (card.image !== undefined && card.image !== null && typeof card.image !== 'string') {
    errors.push('image must be a URL string when present');
  }

  if (type === 'game_checkpoint') {
    if (!card.gameId || typeof card.gameId !== 'string') {
      errors.push('game_checkpoint scenes require a gameId (lesson id of the embedded game)');
    }
  }

  return errors;
}

module.exports = {
  SCENE_TYPES,
  SCENE_TRANSITIONS,
  SCHEMA_GATED_TEMPLATES,
  CHAIN_ROUND_TEMPLATES,
  loadSchema,
  validateManualConfig,
  gameChainErrors,
  timeToMinutes,
  canonicalSceneType,
  sceneCardErrors,
};
