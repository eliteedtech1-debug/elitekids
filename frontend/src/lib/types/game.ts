/**
 * Multimodal Game Types
 *
 * Supports cross-modal learning interactions where the concept is presented
 * in one modality and the learner responds in a complementary modality.
 *
 * Core principle: The prompt should present a concept in one modality,
 * while the learner demonstrates understanding through a different modality.
 */

/* ── Modalities ─────────────────────────────────────────── */

/** How the concept/question is presented to the learner. */
export type PromptMode = 'text' | 'image' | 'audio' | 'context';

/** How the learner responds/demonstrates understanding. */
export type ResponseMode = 'text' | 'image' | 'audio';

/* ── Learning Item ──────────────────────────────────────── */

/** A concept that can be represented in multiple modalities. */
export interface LearningItem {
  id: string;
  text?: string;    // e.g. "Cat"
  image?: string;   // URL to image
  audio?: string;   // URL to audio file
  context?: string; // e.g. "An animal that says meow"
}

/* ── Supported Interactions per Game Type ───────────────── */

export interface GameTypeInteractions {
  promptModes: PromptMode[];
  responseModes: ResponseMode[];
}

/** Which prompt/response combinations each game template supports. */
export const GAME_INTERACTIONS: Record<string, GameTypeInteractions> = {
  matching: {
    promptModes: ['text', 'image', 'audio'],
    responseModes: ['text', 'image', 'audio'],
  },
  'tap-recognition': {
    promptModes: ['text', 'image', 'audio', 'context'],
    responseModes: ['text', 'image'],
  },
  'drag-sort': {
    promptModes: ['text', 'image'],
    responseModes: ['text', 'image'],
  },
  quiz: {
    promptModes: ['text', 'image', 'audio', 'context'],
    responseModes: ['text', 'image', 'audio'],
  },
  'fill-in-blank': {
    promptModes: ['text', 'image', 'audio', 'context'],
    responseModes: ['text'],
  },
  'puzzle-split': {
    promptModes: ['image'],
    responseModes: ['image'],
  },
};

/* ── Validation ─────────────────────────────────────────── */

export interface ValidationWarning {
  type: 'answer-revealed' | 'redundant' | 'unsupported';
  message: string;
  suggestion?: string;
}

/**
 * Check if a prompt/response combination would reveal the answer.
 *
 * Returns warnings if the configuration allows the learner to match
 * the answer directly from the prompt without understanding.
 */
export function validateInteraction(
  template: string,
  promptMode: PromptMode,
  responseMode: ResponseMode,
  promptText?: string,
  correctAnswer?: string,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Check if the game type supports this combination
  const supported = GAME_INTERACTIONS[template];
  if (supported) {
    if (!supported.promptModes.includes(promptMode)) {
      warnings.push({
        type: 'unsupported',
        message: `${template} does not support "${promptMode}" prompt mode.`,
      });
    }
    if (!supported.responseModes.includes(responseMode)) {
      warnings.push({
        type: 'unsupported',
        message: `${template} does not support "${responseMode}" response mode.`,
      });
    }
  }

  // Check for answer-revealing text→text configuration
  if (promptMode === 'text' && responseMode === 'text') {
    if (promptText && correctAnswer) {
      const promptLower = promptText.toLowerCase();
      const answerLower = correctAnswer.toLowerCase();
      // If the prompt contains the exact answer, it's answer-revealing
      if (promptLower.includes(answerLower)) {
        warnings.push({
          type: 'answer-revealed',
          message: `The prompt "${promptText}" contains the answer "${correctAnswer}". The learner can match text directly without understanding.`,
          suggestion: 'Use image response mode, or rewrite the prompt to not include the answer word.',
        });
      }
    }
  }

  // Text→text is redundant for matching (both sides are text)
  if (template === 'matching' && promptMode === 'text' && responseMode === 'text') {
    warnings.push({
      type: 'redundant',
      message: 'Text-to-text matching allows direct word matching without comprehension.',
      suggestion: 'Use image→text or text→image for better learning outcomes.',
    });
  }

  return warnings;
}

/**
 * Auto-suggest the best response mode for a given prompt mode and game type.
 *
 * Prioritizes cross-modal interactions over same-modal ones.
 */
export function suggestResponseMode(
  template: string,
  promptMode: PromptMode,
): ResponseMode {
  const supported = GAME_INTERACTIONS[template];
  if (!supported) return 'text';

  // Prefer cross-modal: if prompt is text/image/audio, suggest the complementary mode
  const crossModalMap: Record<PromptMode, ResponseMode> = {
    text: 'image',    // Text prompt → Image response (reading + recognition)
    image: 'text',    // Image prompt → Text response (vocabulary identification)
    audio: 'image',   // Audio prompt → Image response (listening comprehension)
    context: 'text',  // Context prompt → Text response (comprehension)
  };

  const suggested = crossModalMap[promptMode];
  if (suggested && supported.responseModes.includes(suggested)) {
    return suggested;
  }

  // Fallback to first supported response mode
  return supported.responseModes[0] || 'text';
}

/**
 * Get a human-readable description of a prompt/response interaction.
 */
export function describeInteraction(promptMode: PromptMode, responseMode: ResponseMode): string {
  const descriptions: Record<string, string> = {
    'text-image': 'Show text, pick the matching image',
    'image-text': 'Show image, pick the correct word',
    'audio-image': 'Play audio, pick the matching image',
    'audio-text': 'Play audio, type or pick the word',
    'image-audio': 'Show image, speak the word',
    'context-image': 'Read context, pick the matching image',
    'context-text': 'Read context, type or pick the answer',
    'context-audio': 'Read context, speak the answer',
    'text-text': 'Read text, pick the matching text',
    'image-image': 'Match images to images',
    'text-audio': 'Read text, speak the answer',
    'audio-audio': 'Listen and repeat',
  };
  return descriptions[`${promptMode}-${responseMode}`] || `${promptMode} → ${responseMode}`;
}

/* ── GameConfig Extension ───────────────────────────────── */

/**
 * Extended GameConfig with multimodal interaction fields.
 *
 * These fields are optional for backward compatibility.
 * When not set, the game falls back to legacy behavior.
 */
export interface MultimodalConfig {
  /** How the concept/question is presented. Defaults to 'text'. */
  promptMode?: PromptMode;
  /** How the learner responds. Defaults to 'image' for tap, 'text' for others. */
  responseMode?: ResponseMode;
  /** Learning items with multi-modal representations. */
  items?: LearningItem[];
}

/* ── Helper: determine what to show in the prompt area ──── */

export function getPromptDisplay(
  config: MultimodalConfig & Record<string, any>,
  item: any,
): { showImage: boolean; showText: boolean; showAudio: boolean; text?: string; image?: string; audio?: string } {
  const promptMode = config.promptMode || 'text';

  switch (promptMode) {
    case 'image':
      return {
        showImage: true,
        showText: false,
        showAudio: false,
        image: item?.image || item?.imageUrl,
      };
    case 'audio':
      return {
        showImage: false,
        showText: false,
        showAudio: true,
        audio: item?.audio || item?.promptAudio,
        text: item?.label || item?.text,
      };
    case 'context':
      return {
        showImage: !!item?.image,
        showText: true,
        showAudio: false,
        text: item?.context || item?.prompt,
        image: item?.image,
      };
    case 'text':
    default:
      return {
        showImage: !!item?.image,
        showText: true,
        showAudio: false,
        text: item?.text || item?.label || item?.prompt,
        image: item?.image,
      };
  }
}

/* ── Helper: determine what to show in option/response area ── */

export function getResponseDisplay(
  config: MultimodalConfig & Record<string, any>,
  option: any,
): { showImage: boolean; showText: boolean; showAudio: boolean; text?: string; image?: string } {
  const responseMode = config.responseMode || 'text';

  switch (responseMode) {
    case 'image':
      return {
        showImage: true,
        showText: false,
        showAudio: false,
        image: option?.image || option?.imageUrl,
      };
    case 'audio':
      return {
        showImage: false,
        showText: true,
        showAudio: true,
        text: option?.text || option?.label,
      };
    case 'text':
    default:
      // Text response mode: show ONLY text, never images/emojis
      return {
        showImage: false,
        showText: true,
        showAudio: false,
        text: option?.text || option?.label,
      };
  }
}
