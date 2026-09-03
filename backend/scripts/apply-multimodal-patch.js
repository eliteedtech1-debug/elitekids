#!/usr/bin/env node
/**
 * Backend patch: Inject multimodal defaults into getPublishedGame + getPublishedScenes.
 *
 * Run this once on the VPS to patch the running controllers:
 *   node scripts/apply-multimodal-patch.js
 *
 * Or better: restart the backend after deploying the updated controllers.
 */

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.join(__dirname, '../src/controllers/kids.js');

// ── The patch to inject into getPublishedGame ──
const PATCH_MARKER = '// ── MULTIMODAL_PATCH_START ──';
const PATCH_END_MARKER = '// ── MULTIMODAL_PATCH_END ──';

const PATCH_BLOCK = `${PATCH_MARKER}
    // Auto-inject multimodal defaults for backward-compatible configs
    const MULTIMODAL_DEFAULTS = {
      matching:          { promptMode: 'text',  responseMode: 'image' },
      // Cross-modal: show image (no text), child picks the correct text label
      'tap-recognition': { promptMode: 'image', responseMode: 'text' },
      'drag-sort':       { promptMode: 'text',  responseMode: 'image' },
      quiz:              { promptMode: 'image', responseMode: 'text' },
      'fill-in-blank':   { promptMode: 'text',  responseMode: 'text' },
      'puzzle-split':    { promptMode: 'image', responseMode: 'image' },
      'label-diagram':   { promptMode: 'text',  responseMode: 'image' },
      'stage-sequence':  { promptMode: 'image', responseMode: 'text' },
      'game-chain':      { promptMode: 'image', responseMode: 'text' },
    };
    try {
      const cfg = typeof config.config_json === 'string' ? JSON.parse(config.config_json) : (config.config_json || {});
      if (!cfg.promptMode || !cfg.responseMode) {
        const defaults = MULTIMODAL_DEFAULTS[cfg.template] || { promptMode: 'text', responseMode: 'text' };
        if (!cfg.promptMode) cfg.promptMode = defaults.promptMode;
        if (!cfg.responseMode) cfg.responseMode = defaults.responseMode;
        config.config_json = cfg;
      }
    } catch {}
${PATCH_END_MARKER}`;

function main() {
  let content = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  // Check if already patched
  if (content.includes(PATCH_MARKER)) {
    console.log('✅ Already patched — removing old patch to re-apply...');
    const startIdx = content.indexOf(PATCH_MARKER);
    const endIdx = content.indexOf(PATCH_END_MARKER) + PATCH_END_MARKER.length;
    content = content.slice(0, startIdx) + content.slice(endIdx);
  }

  // Find the target insertion point: after "No published game for this lesson" in getPublishedGame
  const target = "return res.status(404).json({ success: false, message: 'No published game for this lesson.' });\n    }\n\n    const config = await db.KidGameConfig.findOne(";
  const targetAlt = "if (!config) {\n      return res.status(404).json({ success: false, message: 'No published game for this lesson.' });\n    }";

  // Find the getPublishedGame function's config null check
  const searchPattern = /if \(!config\) \{\s*return res\.status\(404\)\.json\(\{[^}]+\}\);\s*\}\s*\n\s*\/\*\* GET/;
  const match = content.match(searchPattern);

  if (match) {
    // Insert the patch right after the null check
    const insertPoint = match.index + match[0].indexOf('\n}\n');
    content = content.slice(0, insertPoint + 3) + '\n\n' + PATCH_BLOCK + '\n' + content.slice(insertPoint + 3);
    fs.writeFileSync(CONTROLLER_PATH, content, 'utf8');
    console.log('✅ Patch applied to getPublishedGame');
  } else {
    // Fallback: find the second "No published game" in the file
    // (first is in listLessons, second is in getPublishedGame)
    const occurrences = [];
    let idx = 0;
    while ((idx = content.indexOf("'No published game for this lesson.'", idx)) !== -1) {
      occurrences.push(idx);
      idx += 30;
    }

    if (occurrences.length >= 2) {
      // The second occurrence is in getPublishedGame
      const targetIdx = occurrences[1];
      // Find the closing } of the if block after this occurrence
      const afterTarget = content.slice(targetIdx);
      const closingBraceIdx = afterTarget.indexOf('}\n');
      const insertAt = targetIdx + closingBraceIdx + 2;
      content = content.slice(0, insertAt) + '\n\n' + PATCH_BLOCK + '\n' + content.slice(insertAt);
      fs.writeFileSync(CONTROLLER_PATH, content, 'utf8');
      console.log('✅ Patch applied to getPublishedGame (fallback)');
    } else {
      console.log('⚠️  Could not find getPublishedGame null check. Manual patch needed.');
      console.log('   Insert the following after the config null check in getPublishedGame:');
      console.log('');
      console.log(PATCH_BLOCK);
    }
  }
}

main();
