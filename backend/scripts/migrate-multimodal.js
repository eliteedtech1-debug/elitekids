#!/usr/bin/env node
/**
 * Migration: Add promptMode + responseMode to all existing game configs.
 * Smart detection: identifies answer-revealing text→text configs and auto-fixes them.
 *
 * Usage: node scripts/migrate-multimodal.js [--dry-run]
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const { Sequelize, Op } = require('sequelize');

const DRY_RUN = process.argv.includes('--dry-run');

const sequelize = new Sequelize(
  process.env.CONTENT_DB_NAME || 'elite_content',
  process.env.DB_USER || 'elite',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    dialect: 'mysql',
    logging: false,
    dialectOptions: { connectTimeout: 10000 },
  }
);

// ── Default multimodal config per template ──
const MULTIMODAL_DEFAULTS = {
  matching:          { promptMode: 'text',  responseMode: 'image' },
  // Cross-modal: show image (no text), child picks the correct text label
  'tap-recognition': { promptMode: 'image', responseMode: 'text' },
  'drag-sort':       { promptMode: 'text',  responseMode: 'image' },
  quiz:              { promptMode: 'image', responseMode: 'text' },
  'fill-in-blank':   { promptMode: 'text',  responseMode: 'text' },
  'puzzle-split':    { promptMode: 'image', responseMode: 'image' },
};

// ── Answer-revealing detection ─────────────────────────────

// Severity: critical = child can cheat without any understanding
//           warning = suboptimal learning, but not a direct giveaway
const SEVERITY = { CRITICAL: 'critical', WARNING: 'warning' };

/**
 * Helper: extract readable text from an item, stripping emojis.
 */
function stripEmojis(s) {
  return (s || '').replace(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F?/gu, '').trim();
}

/**
 * Helper: check if a string contains meaningful text (after stripping emojis).
 */
function hasText(s) {
  return stripEmojis(s).length > 0;
}

/**
 * Helper: fuzzy match — does the prompt contain the answer as a whole word?
 * Avoids false positives like prompt "Find fox" matching answer "ox".
 */
function promptContainsAnswer(prompt, answer) {
  if (!prompt || !answer) return false;
  const p = prompt.toLowerCase();
  const a = answer.toLowerCase();
  // Exact substring match
  if (p.includes(a)) return true;
  // Word-boundary match (handles partial words)
  try {
    return new RegExp(`\\b${a}\\b`).test(p);
  } catch {
    return false;
  }
}

/**
 * Detect answer-revealing patterns in a game config.
 *
 * Returns an array of { type, severity, detail, fix } objects.
 *
 * SEVERITY levels:
 *   critical — child can answer correctly without understanding
 *              (e.g. text prompt + text options = direct word-matching)
 *   warning  — suboptimal for learning but not a direct giveaway
 *              (e.g. text-only items with no images = less engaging)
 */
function detectAnswerRevealing(template, config) {
  const issues = [];

  // ── tap-recognition ───────────────────────────────────────
  if (template === 'tap-recognition') {
    const prompt = (config.prompt || '').toLowerCase();
    const promptText = stripEmojis(config.prompt || '');
    const items = config.items || config.assets?.objects || [];
    const correctId = config.correctId || config.assets?.correctId;
    const correctItem = items.find(i => i.id === correctId);

    // CRITICAL: Prompt contains the exact answer text
    if (correctItem) {
      const correctLabel = stripEmojis(correctItem.label || correctItem.text || '');
      if (correctLabel && promptContainsAnswer(prompt, correctLabel)) {
        issues.push({
          type: 'prompt-contains-answer',
          severity: SEVERITY.CRITICAL,
          detail: `Prompt "${config.prompt}" contains answer "${correctLabel}" — child reads prompt and taps matching text`,
          fix: 'Use image prompt (show emoji/image only) + text response (labels only)',
        });
      }
    }

    // CRITICAL: Prompt text matches any option label (word-matching cheat)
    for (const item of items) {
      const label = stripEmojis(item.label || item.text || '');
      if (label && promptContainsAnswer(prompt, label)) {
        issues.push({
          type: 'prompt-matches-option',
          severity: SEVERITY.CRITICAL,
          detail: `Prompt text matches option "${label}" — child can text-match without understanding`,
          fix: 'Use image prompt (show emoji/image only) + text response (labels only)',
        });
        break;
      }
    }

    // CRITICAL: General text→text — prompt has readable text AND options have readable text
    // Even if prompt doesn't contain the exact answer, showing text + text options
    // lets the child use elimination or partial matching
    const promptHasReadableText = hasText(config.prompt);
    const optionsHaveText = items.some(i => hasText(i.label || i.text));
    const optionsHaveImage = items.some(i => i.image || i.imageUrl);
    if (promptHasReadableText && optionsHaveText && !optionsHaveImage) {
      // No images in options at all — pure text→text
      issues.push({
        type: 'text-to-text-tap',
        severity: SEVERITY.CRITICAL,
        detail: `Prompt is text + ${items.length} options are text-only (no images) — child can match words without recognizing images`,
        fix: 'Use image prompt (show the item image) + text response (labels only)',
      });
    }

    // WARNING: Options have both emoji AND text — emoji gives visual hint
    const optionsWithEmojiAndText = items.filter(i => i.emoji && hasText(i.label || i.text));
    if (optionsWithEmojiAndText.length === items.length && items.length > 1) {
      issues.push({
        type: 'emoji-text-options',
        severity: SEVERITY.WARNING,
        detail: `All ${items.length} options show emoji + text — child can match emoji from prompt to emoji in options`,
        fix: 'Show text labels only in options (remove emojis)',
      });
    }
  }

  // ── matching ──────────────────────────────────────────────
  if (template === 'matching') {
    const pairs = config.pairs || config.assets?.items || [];
    if (pairs.length === 0) return issues;

    // CRITICAL: All pairs are text↔text — no images on either side
    const allTextPairs = pairs.every(p => !p.image && !p.imageUrl && !p.audio);
    if (allTextPairs) {
      issues.push({
        type: 'text-only-matching',
        severity: SEVERITY.CRITICAL,
        detail: `All ${pairs.length} pairs are text↔text — child can word-match without comprehension`,
        fix: 'Add images to items; use text→image (prompt=text, response=image)',
      });
    }

    // CRITICAL: Both sides have emoji — child matches emoji-to-emoji, ignores text
    const hasEmojiOnBothSides = pairs.every(p => {
      const aHasEmoji = /\p{Emoji}/u.test(p.a);
      const bHasEmoji = /\p{Emoji}/u.test(p.b);
      return aHasEmoji && bHasEmoji;
    });
    if (hasEmojiOnBothSides) {
      issues.push({
        type: 'emoji-hint-matching',
        severity: SEVERITY.CRITICAL,
        detail: `All ${pairs.length} pairs have emoji on both sides — child matches emoji-to-emoji without reading`,
        fix: 'Show text-only on one side, image/emoji-only on the other',
      });
    }

    // WARNING: Pairs have matching text labels (same word on both sides)
    const duplicateTextPairs = pairs.filter(p => {
      const aText = stripEmojis(p.a).toLowerCase();
      const bText = stripEmojis(p.b).toLowerCase();
      return aText && bText && aText === bText;
    });
    if (duplicateTextPairs.length > 0) {
      issues.push({
        type: 'duplicate-text-matching',
        severity: SEVERITY.WARNING,
        detail: `${duplicateTextPairs.length} pair(s) have identical text on both sides — trivial to match`,
        fix: 'Ensure left and right sides show different representations (image↔text, not text↔text)',
      });
    }
  }

  // ── quiz ──────────────────────────────────────────────────
  if (template === 'quiz') {
    const question = (config.question || config.prompt || '').toLowerCase();
    const options = config.options || [];
    if (options.length === 0) return issues;

    // CRITICAL: Question contains the correct answer text
    const correctIdx = config.correctIndex;
    if (correctIdx != null && options[correctIdx]) {
      const correctLabel = stripEmojis(options[correctIdx].label || '');
      if (correctLabel && promptContainsAnswer(question, correctLabel)) {
        issues.push({
          type: 'question-contains-answer',
          severity: SEVERITY.CRITICAL,
          detail: `Question contains the answer "${options[correctIdx].label}" — child reads question and finds matching word`,
          fix: 'Rewrite question without the answer word, or use image prompt + text options',
        });
      }
    }

    // CRITICAL: Question is text AND all options are text — pure text→text quiz
    const questionHasText = hasText(config.question || config.prompt);
    const allTextOptions = options.every(o => !o.image && !o.emoji);
    const anyOptionHasImage = options.some(o => o.image);
    if (questionHasText && allTextOptions && !anyOptionHasImage) {
      issues.push({
        type: 'text-to-text-quiz',
        severity: SEVERITY.CRITICAL,
        detail: `Question is text + all ${options.length} options are text-only — child can process purely in text mode`,
        fix: 'Use image prompt (show picture) + text response (labels only)',
      });
    }

    // WARNING: Question is text + options have images (text→image is OK but less ideal)
    if (questionHasText && anyOptionHasImage && allTextOptions) {
      // This case: options have images but no text labels — that's fine
    } else if (questionHasText && !allTextOptions && options.length > 0) {
      // Options have images — OK for cross-modal
    }

    // WARNING: Options have both emoji AND text — emoji makes it too easy
    const optionsWithBoth = options.filter(o => o.emoji && hasText(o.label));
    if (optionsWithBoth.length === options.length && options.length > 1) {
      issues.push({
        type: 'emoji-text-quiz-options',
        severity: SEVERITY.WARNING,
        detail: `All ${options.length} options show emoji + text — child can match visuals without reading`,
        fix: 'Show text labels only in options',
      });
    }
  }

  // ── drag-sort ─────────────────────────────────────────────
  if (template === 'drag-sort') {
    const items = config.items || config.assets?.items || [];
    const buckets = config.buckets || config.assets?.buckets || [];
    if (items.length === 0) return issues;

    // WARNING: All items are text-only — less engaging
    const allTextItems = items.every(i => !i.image && !i.imageUrl);
    if (allTextItems) {
      issues.push({
        type: 'text-only-sort',
        severity: SEVERITY.WARNING,
        detail: `All ${items.length} items are text-only — add images for better engagement`,
        fix: 'Add images to items for visual learners',
      });
    }

    // CRITICAL: Bucket labels match item labels — child text-matches
    const bucketLabels = buckets.map(b => (b.label || '').toLowerCase());
    const matchedItems = items.filter(i => bucketLabels.includes((i.label || '').toLowerCase()));
    if (matchedItems.length > 0) {
      issues.push({
        type: 'bucket-label-match',
        severity: SEVERITY.CRITICAL,
        detail: `${matchedItems.length} item(s) have same name as a bucket — child can text-match without understanding categories`,
        fix: 'Rename buckets or use image-only buckets',
      });
    }
  }

  return issues;
}

/**
 * Given detected issues, determine the best promptMode + responseMode.
 *
 * Priority order (last wins):
 *   1. Template defaults
 *   2. Answer-revealing fixes (force cross-modal)
 *   3. Content-aware hints (context field, image field)
 */
function suggestModes(template, config, issues) {
  const defaults = { ...MULTIMODAL_DEFAULTS[template] };
  let promptMode = defaults.promptMode;
  let responseMode = defaults.responseMode;
  let changed = false;
  const fixes = [];

  // ── 1. Handle critical text→text issues (force cross-modal) ──
  const criticalIssues = issues.filter(i => i.severity === SEVERITY.CRITICAL);
  const hasCritical = criticalIssues.length > 0;

  if (hasCritical) {
    const types = criticalIssues.map(i => i.type);

    // tap-recognition: text prompt + text options → switch to image→text
    if (types.includes('text-to-text-tap') || types.includes('prompt-contains-answer') || types.includes('prompt-matches-option')) {
      promptMode = 'image';   // Show image, no text hint
      responseMode = 'text';  // Child picks the correct text label
      changed = true;
      fixes.push('text→text tap → image→text (child reads label)');
    }

    // matching: text↔text → text→image (prompt shows word, response shows image)
    if (types.includes('text-only-matching')) {
      promptMode = 'text';    // Show the word
      responseMode = 'image'; // Child picks the matching image
      changed = true;
      fixes.push('text↔text matching → text→image (child recognizes image)');
    }

    // matching: emoji hint → image→text (show image, child reads label)
    if (types.includes('emoji-hint-matching')) {
      promptMode = 'image';   // Show image only
      responseMode = 'text';  // Child picks the text label
      changed = true;
      fixes.push('emoji-hint matching → image→text (child reads label)');
    }

    // quiz: question contains answer OR text→text → image→text
    if (types.includes('question-contains-answer') || types.includes('text-to-text-quiz')) {
      promptMode = 'image';   // Show image, not text question
      responseMode = 'text';  // Child picks the text label
      changed = true;
      fixes.push('text→text quiz → image→text (child reads label)');
    }

    // drag-sort: bucket-label-match → note it (can't auto-fix, needs content change)
    if (types.includes('bucket-label-match')) {
      // Keep default modes but flag it
      fixes.push('bucket-label-match detected — needs manual content fix');
    }
  }

  // ── 2. Handle warning-level issues (prefer cross-modal) ──
  if (!hasCritical) {
    const warningIssues = issues.filter(i => i.severity === SEVERITY.WARNING);
    const warningTypes = warningIssues.map(i => i.type);

    // emoji-text options → switch to text-only response
    if (warningTypes.includes('emoji-text-options') || warningTypes.includes('emoji-text-quiz-options')) {
      if (responseMode === 'image') {
        responseMode = 'text'; // Show text labels, remove emoji from options
        changed = true;
        fixes.push('emoji+text options → text-only response (child must read)');
      }
    }

    // text-only items → prefer image response if possible
    if (warningTypes.includes('text-only-sort')) {
      if (promptMode === 'text' && responseMode === 'text') {
        responseMode = 'image';
        changed = true;
        fixes.push('text-only sort → text→image (child picks image)');
      }
    }
  }

  // ── 3. Content-aware overrides (these override issue-based fixes) ──
  // If context field exists, prefer context mode
  if (config.context) {
    promptMode = 'context';
    responseMode = 'image';
    changed = true;
    fixes.push('context field present → context→image');
  }

  // If image field exists at top level, use image prompt
  if (config.image && !config.prompt && template !== 'fill-in-blank') {
    promptMode = 'image';
    responseMode = 'text';
    changed = true;
    fixes.push('top-level image present → image→text');
  }

  return { promptMode, responseMode, changed, fixes };
}

// ── Main ──

async function main() {
  console.log(`\n🔄 Multimodal migration — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const [rows] = await sequelize.query(`
    SELECT id, lesson_id, template, config_json, content_state
    FROM kids_game_configs
    ORDER BY createdAt ASC
  `);

  console.log(`Found ${rows.length} game config(s).\n`);

  let updated = 0;
  let skipped = 0;
  let fixed = 0;
  let issuesFound = 0;
  const issueReport = [];

  for (const row of rows) {
    const config = typeof row.config_json === 'string'
      ? JSON.parse(row.config_json)
      : row.config_json;

    if (!config) {
      console.log(`  ⚠️  ${row.id.slice(0,8)} — empty config, skipping`);
      skipped++;
      continue;
    }

    // Already has multimodal fields?
    if (config.promptMode && config.responseMode) {
      console.log(`  ✅  ${row.id.slice(0,8)} (${row.template}, ${row.content_state}) — already set: pm=${config.promptMode} rm=${config.responseMode}`);
      skipped++;
      continue;
    }

    // Detect answer-revealing issues
    const issues = detectAnswerRevealing(row.template, config);
    if (issues.length > 0) {
      issuesFound += issues.length;
      issueReport.push({
        id: row.id.slice(0,8),
        template: row.template,
        state: row.content_state,
        issues,
      });
    }

    // Suggest best modes
    const { promptMode, responseMode, changed, fixes } = suggestModes(row.template, config, issues);

    config.promptMode = promptMode;
    config.responseMode = responseMode;

    const newConfigJson = JSON.stringify(config);

    if (DRY_RUN) {
      const criticalCount = issues.filter(i => i.severity === SEVERITY.CRITICAL).length;
      const warningCount = issues.filter(i => i.severity === SEVERITY.WARNING).length;
      const issueStr = criticalCount + warningCount > 0
        ? ` ⚠️ ${criticalCount} critical, ${warningCount} warning`
        : '';
      const fixStr = fixes.length > 0 ? ` → [${fixes.join('; ')}]` : '';
      console.log(`  📝  ${row.id.slice(0,8)} (${row.template}, ${row.content_state}) → pm=${promptMode} rm=${responseMode}${issueStr}${fixStr}`);
      if (changed) fixed++;
    } else {
      try {
        await sequelize.query(`
          UPDATE kids_game_configs SET config_json = :configJson WHERE id = :id
        `, { replacements: { configJson: newConfigJson, id: row.id } });
        const icon = issues.length > 0 ? '🔧' : '✅';
        console.log(`  ${icon}  ${row.id.slice(0,8)} (${row.template}, ${row.content_state}) → pm=${promptMode} rm=${responseMode}`);
        if (issues.length > 0) {
          issues.forEach(i => {
            const sev = i.severity === SEVERITY.CRITICAL ? '🔴' : '🟡';
            console.log(`     ${sev} ${i.type}: ${i.detail}`);
          });
          if (fixes.length > 0) {
            console.log(`     ✅ Auto-fix: ${fixes.join('; ')}`);
          }
          fixed++;
        }
      } catch (err) {
        console.error(`  ❌  ${row.id.slice(0,8)} — ${err.message}`);
      }
    }
    updated++;
  }

  // ── Summary ──
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  Updated: ${updated}  Skipped: ${skipped}  Fixed answer-revealing: ${fixed}`);
  console.log(`  Issues detected: ${issuesFound}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`═══════════════════════════════════════════════════════`);

  // ── Issue Report ──
  if (issueReport.length > 0) {
    console.log(`\n📋 Issue Report:\n`);
    for (const report of issueReport) {
      console.log(`  [${report.id}] ${report.template} (${report.state}):`);
      for (const issue of report.issues) {
        const sev = issue.severity === SEVERITY.CRITICAL ? '🔴 CRITICAL' : '🟡 WARNING';
        console.log(`    ${sev} ${issue.type}`);
        console.log(`       ${issue.detail}`);
        console.log(`       Fix: ${issue.fix}`);
      }
      console.log('');
    }
  }

  await sequelize.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
