/**
 * Backend helper: Auto-inject multimodal defaults + smart detection.
 *
 * Used by getPublishedGame controller to ensure all configs have
 * promptMode/responseMode fields, with answer-revealing detection.
 */

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

/**
 * Detect if a config has answer-revealing patterns.
 * Returns an array of issue type strings found.
 */
function detectAnswerRevealing(template, config) {
  const issues = [];

  /** Helper: strip emojis for text comparison */
  function stripEmojis(s) { return (s || '').replace(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F?/gu, '').trim(); }
  function hasText(s) { return stripEmojis(s).length > 0; }

  if (template === 'tap-recognition') {
    const prompt = (config.prompt || '').toLowerCase();
    const promptText = stripEmojis(config.prompt || '');
    const items = config.items || config.assets?.objects || [];
    const correctId = config.correctId || config.assets?.correctId;
    const correctItem = items.find(i => i.id === correctId);

    // Prompt contains the exact answer text
    if (correctItem) {
      const label = stripEmojis(correctItem.label || correctItem.text || '');
      if (label && prompt.includes(label.toLowerCase())) {
        issues.push('prompt-contains-answer');
      }
    }

    // General text→text: prompt has text AND options have text but no images
    const promptHasText = hasText(config.prompt);
    const optionsHaveText = items.some(i => hasText(i.label || i.text));
    const optionsHaveImage = items.some(i => i.image || i.imageUrl);
    if (promptHasText && optionsHaveText && !optionsHaveImage) {
      issues.push('text-to-text-tap');
    }

    // Options have both emoji AND text — emoji makes matching too easy
    const optionsWithBoth = items.filter(i => i.emoji && hasText(i.label || i.text));
    if (optionsWithBoth.length === items.length && items.length > 1) {
      issues.push('emoji-text-options');
    }
  }

  if (template === 'matching') {
    const pairs = config.pairs || config.assets?.items || [];
    const allTextPairs = pairs.every(p => !p.image && !p.imageUrl && !p.audio);
    if (allTextPairs && pairs.length > 0) {
      issues.push('text-only-matching');
    }
    // Emoji on both sides = emoji-to-emoji matching
    const hasEmojiBoth = pairs.every(p => /\p{Emoji}/u.test(p.a) && /\p{Emoji}/u.test(p.b));
    if (hasEmojiBoth && pairs.length > 0) {
      issues.push('emoji-hint-matching');
    }
  }

  if (template === 'quiz') {
    const question = (config.question || config.prompt || '').toLowerCase();
    const options = config.options || [];
    const correctIdx = config.correctIndex;
    if (correctIdx != null && options[correctIdx]) {
      const label = (options[correctIdx].label || '').toLowerCase();
      if (label && question.includes(label)) {
        issues.push('question-contains-answer');
      }
    }
    // Text question + all text options
    const questionHasText = hasText(config.question || config.prompt);
    const allTextOptions = options.every(o => !o.image);
    if (questionHasText && allTextOptions && options.length > 0) {
      issues.push('text-to-text-quiz');
    }
    // Options have emoji + text
    const optionsWithBoth = options.filter(o => o.emoji && hasText(o.label));
    if (optionsWithBoth.length === options.length && options.length > 1) {
      issues.push('emoji-text-quiz-options');
    }
  }

  if (template === 'drag-sort') {
    const items = config.items || config.assets?.items || [];
    const buckets = config.buckets || config.assets?.buckets || [];
    const allTextItems = items.every(i => !i.image && !i.imageUrl);
    if (allTextItems && items.length > 0) {
      issues.push('text-only-sort');
    }
    const bucketLabels = buckets.map(b => (b.label || '').toLowerCase());
    const matched = items.filter(i => bucketLabels.includes((i.label || '').toLowerCase()));
    if (matched.length > 0) {
      issues.push('bucket-label-match');
    }
  }

  return issues;
}

/**
 * Smart mode suggestion based on detected issues.
 * Returns the best promptMode + responseMode to avoid answer-revealing.
 */
function suggestModes(template, config, issues) {
  const defaults = { ...MULTIMODAL_DEFAULTS[template] };
  let promptMode = defaults.promptMode;
  let responseMode = defaults.responseMode;

  const hasCritical = issues.some(t =>
    t.includes('text-to-text') ||
    t.includes('contains-answer') ||
    t.includes('matches-option') ||
    t === 'text-only-matching' ||
    t === 'emoji-hint-matching' ||
    t === 'text-to-text-quiz' ||
    t === 'bucket-label-match'
  );

  if (hasCritical) {
    // tap-recognition text→text → image→text
    if (issues.includes('text-to-text-tap') || issues.includes('prompt-contains-answer')) {
      promptMode = 'image';
      responseMode = 'text';
    }
    // matching text↔text → text→image
    if (issues.includes('text-only-matching')) {
      promptMode = 'text';
      responseMode = 'image';
    }
    // matching emoji-hint → image→text
    if (issues.includes('emoji-hint-matching')) {
      promptMode = 'image';
      responseMode = 'text';
    }
    // quiz text→text → image→text
    if (issues.includes('text-to-text-quiz') || issues.includes('question-contains-answer')) {
      promptMode = 'image';
      responseMode = 'text';
    }
  }

  // Context field → use context mode
  if (config.context) {
    promptMode = 'context';
    responseMode = 'image';
  }
  // Image at top level, no text prompt → use image mode
  else if (config.image && !config.prompt && template !== 'fill-in-blank') {
    promptMode = 'image';
    responseMode = 'text';
  }

  return { promptMode, responseMode };
}

/**
 * Inject multimodal defaults into a config_json if missing.
 * Returns the (possibly mutated) config object.
 */
function injectDefaults(configJson) {
  try {
    const cfg = typeof configJson === 'string' ? JSON.parse(configJson) : (configJson || {});
    if (!cfg.promptMode || !cfg.responseMode) {
      const defaults = MULTIMODAL_DEFAULTS[cfg.template] || { promptMode: 'text', responseMode: 'text' };
      if (!cfg.promptMode) cfg.promptMode = defaults.promptMode;
      if (!cfg.responseMode) cfg.responseMode = defaults.responseMode;

      // Smart detection: check for answer-revealing patterns
      const issues = detectAnswerRevealing(cfg.template, cfg);
      if (issues.length > 0) {
        const suggested = suggestModes(cfg.template, cfg, issues);
        cfg.promptMode = suggested.promptMode;
        cfg.responseMode = suggested.responseMode;
      }
    }
    return cfg;
  } catch {
    return configJson;
  }
}

module.exports = { injectDefaults, detectAnswerRevealing, suggestModes, MULTIMODAL_DEFAULTS };
