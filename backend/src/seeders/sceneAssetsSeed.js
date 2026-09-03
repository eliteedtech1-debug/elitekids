'use strict';

/**
 * Scene asset library + story template scaffolds (Phase 3 — scene engine backend).
 *
 * GET /kids/scene-library     → backgrounds + characters + transitions (pickers)
 * GET /kids/story-templates   → per-game-type arc + 3–5 scene-card scaffolds
 *
 * Library v1 is seeded JSON keys (art comes via the B2 media pipeline; every
 * entry carries an emoji fallback so nothing renders broken). No DB writes.
 */

const SCENE_BACKGROUNDS = [
  { key: 'farm-daytime', label: 'Farm — daytime', emoji: '🌾', palette: ['#a8e063', '#56ab2f'], tags: ['farm', 'outdoor'] },
  { key: 'classroom', label: 'Classroom', emoji: '🏫', palette: ['#fdfbfb', '#ebedee'], tags: ['school', 'indoor'] },
  { key: 'garden', label: 'Garden', emoji: '🪴', palette: ['#c9e265', '#4a7c59'], tags: ['nature', 'outdoor'] },
  { key: 'kitchen', label: 'Kitchen', emoji: '🍲', palette: ['#ffe8c2', '#f6d365'], tags: ['home', 'indoor'] },
  { key: 'space', label: 'Outer space', emoji: '🚀', palette: ['#0f0c29', '#302b63'], tags: ['space'] },
  { key: 'park', label: 'Park / playground', emoji: '🌳', palette: ['#d4fc79', '#96e6a1'], tags: ['outdoor', 'play'] },
  { key: 'market', label: 'Market', emoji: '🛒', palette: ['#ffecd2', '#fcb69f'], tags: ['outdoor', 'community'] },
  { key: 'home', label: 'Home', emoji: '🏠', palette: ['#fdfcfb', '#e2d1c3'], tags: ['home', 'indoor'] },
];

const SCENE_CHARACTERS = [
  { key: 'maya-the-farmer', name: 'Maya', emoji: '👩🏾‍🌾', defaultAnimation: 'idle', defaultPosition: 'center', tags: ['story'] },
  { key: 'buddy-the-fox', name: 'Buddy', emoji: '🦊', defaultAnimation: 'idle', defaultPosition: 'center', tags: ['animal', 'story'] },
  { key: 'tobi-the-boy', name: 'Tobi', emoji: '👦🏾', defaultAnimation: 'idle', defaultPosition: 'center', tags: ['child'] },
  { key: 'zara-the-girl', name: 'Zara', emoji: '👧🏾', defaultAnimation: 'idle', defaultPosition: 'center', tags: ['child'] },
  { key: 'koko-the-bird', name: 'Koko', emoji: '🐦', defaultAnimation: 'idle', defaultPosition: 'center', tags: ['animal'] },
  { key: 'milo-the-cat', name: 'Milo', emoji: '🐱', defaultAnimation: 'idle', defaultPosition: 'center', tags: ['animal'] },
  { key: 'auntie-nkechi', name: 'Auntie Nkechi', emoji: '👩🏾', defaultAnimation: 'idle', defaultPosition: 'center', tags: ['adult', 'teacher'] },
  { key: 'papa-ade', name: 'Papa Ade', emoji: '👨🏾', defaultAnimation: 'idle', defaultPosition: 'center', tags: ['adult'] },
];

const SCENE_TRANSITIONS = [
  { key: 'fade', label: 'Fade' },
  { key: 'slide', label: 'Slide' },
  { key: 'none', label: 'None (instant)' },
];

/** Arc shapes per playable template. Each template gets: arc (ordered phase
 * names), scaffolds (3–5 prefilled scene cards using {topic}/{count}-style
 * placeholders the teacher replaces), glue (story↔gameplay alignment hints). */
const STORY_TEMPLATES = {
  matching: {
    label: 'Matching pairs story',
    arc: ['hook', 'teach', 'practice', 'checkpoint', 'recap'],
    scaffolds: [
      { type: 'intro', text: '{Character} found some {topic} and needs help matching them!', durationSec: 8, transition: 'fade' },
      { type: 'teach', text: 'Here is a {firstItem} — find the picture that belongs with it.', durationSec: 10, transition: 'slide' },
      { type: 'reinforce', text: 'Great matching! {Character} is so proud of you.', durationSec: 8, transition: 'fade' },
      { type: 'game_checkpoint', text: 'Let us play the matching game!', durationSec: 6, transition: 'fade', gameId: '' },
      { type: 'recap', text: 'You matched {topic} like a champion. Well done!', durationSec: 8, transition: 'fade' },
    ],
    glue: [
      'Checkpoint game should use the SAME pairs shown in the teach scene.',
      'Do not introduce a new item in the recap scene.',
    ],
  },
  'tap-recognition': {
    label: 'Tap the right picture story',
    arc: ['hook', 'teach', 'practice', 'checkpoint', 'recap'],
    scaffolds: [
      { type: 'intro', text: '{Character} sees {count} things. Can you tap the {target}?', durationSec: 8, transition: 'fade' },
      { type: 'teach', text: 'This is a {target}. Tap it when you see it!', durationSec: 10, transition: 'slide' },
      { type: 'reinforce', text: 'Look at all the pictures — which one is the {target}?', durationSec: 8, transition: 'fade' },
      { type: 'game_checkpoint', text: 'Ready? Tap the {target}!', durationSec: 6, transition: 'fade', gameId: '' },
      { type: 'recap', text: 'You tapped the {target} every time. Fantastic!', durationSec: 8, transition: 'fade' },
    ],
    glue: [
      'Game items must include the teach-scene target plus the same distractors.',
    ],
  },
  quiz: {
    label: 'Question & answer story',
    arc: ['hook', 'teach', 'practice', 'checkpoint', 'recap'],
    scaffolds: [
      { type: 'intro', text: '{Character} wants to learn about {topic}.', durationSec: 8, transition: 'fade' },
      { type: 'teach', text: 'Remember: {fact}.', durationSec: 10, transition: 'slide' },
      { type: 'reinforce', text: 'Time for questions about {topic}!', durationSec: 8, transition: 'fade' },
      { type: 'game_checkpoint', text: 'Answer the questions to help {Character}!', durationSec: 6, transition: 'fade', gameId: '' },
      { type: 'recap', text: 'You answered all about {topic}. Awesome!', durationSec: 8, transition: 'fade' },
    ],
    glue: [
      'Quiz answers should come directly from the teach-scene fact.',
    ],
  },
  'memory-pairs': {
    label: 'Memory pairs story',
    arc: ['hook', 'teach', 'practice', 'checkpoint', 'recap'],
    scaffolds: [
      { type: 'intro', text: '{Character} shuffled some {topic} cards. Find the matching pairs!', durationSec: 8, transition: 'fade' },
      { type: 'teach', text: 'Each card has a partner. Remember where they are.', durationSec: 10, transition: 'slide' },
      { type: 'reinforce', text: 'Watch carefully — flip two cards at a time.', durationSec: 8, transition: 'fade' },
      { type: 'game_checkpoint', text: 'Flip the cards and find every pair!', durationSec: 6, transition: 'fade', gameId: '' },
      { type: 'recap', text: 'You found every {topic} pair. Amazing memory!', durationSec: 8, transition: 'fade' },
    ],
    glue: [
      'Teach scene should name the pair partners so the child knows what to look for.',
    ],
  },
  'label-diagram': {
    label: 'Label the parts story',
    arc: ['hook', 'teach', 'practice', 'checkpoint', 'recap'],
    scaffolds: [
      { type: 'intro', text: '{Character} has a picture of a {diagram} and wants to name its parts.', durationSec: 8, transition: 'fade' },
      { type: 'teach', text: 'This part is called the {part1}. This one is the {part2}.', durationSec: 12, transition: 'slide' },
      { type: 'reinforce', text: 'Can you point to the {part1} on the picture?', durationSec: 8, transition: 'fade' },
      { type: 'game_checkpoint', text: 'Tap the parts of the {diagram}!', durationSec: 6, transition: 'fade', gameId: '' },
      { type: 'recap', text: 'You named every part of the {diagram}. Brilliant!', durationSec: 8, transition: 'fade' },
    ],
    glue: [
      'Teach scenes must name the exact hotspot labels used in the game.',
      'Bigger parts first (simple) then smaller parts (complex) — never random.',
    ],
  },
  'stage-sequence': {
    label: 'Step-by-step growth story',
    arc: ['hook', 'teach', 'practice', 'checkpoint', 'recap'],
    scaffolds: [
      { type: 'intro', text: 'Watch how {topic} grows, step by step from simple to bigger!', durationSec: 8, transition: 'fade' },
      { type: 'teach', text: 'First comes the {stage1}.', durationSec: 8, transition: 'fade' },
      { type: 'teach', text: 'Then it becomes the {stage2}.', durationSec: 8, transition: 'fade' },
      { type: 'teach', text: 'Finally it becomes the {stage3}.', durationSec: 8, transition: 'fade' },
      { type: 'game_checkpoint', text: 'Now show what you learned about {topic}!', durationSec: 6, transition: 'fade', gameId: '' },
      { type: 'recap', text: '{stage1} → {stage2} → {stage3}. You know the whole journey!', durationSec: 10, transition: 'fade' },
    ],
    glue: [
      'Story scenes must follow the SAME order as the game steps — simple to complex, never shuffled.',
      'End the recap by naming the full progression in order.',
    ],
  },
};

/** Generic arc fallback for any template without a bespoke scaffold. */
const GENERIC_STORY_TEMPLATE = {
  label: 'Classic story arc',
  arc: ['hook', 'teach', 'practice', 'checkpoint', 'recap'],
  scaffolds: [
    { type: 'intro', text: '{Character} needs help with {topic}!', durationSec: 8, transition: 'fade' },
    { type: 'teach', text: 'Here is how {topic} works.', durationSec: 10, transition: 'slide' },
    { type: 'reinforce', text: 'Let us practise with {topic} together.', durationSec: 8, transition: 'fade' },
    { type: 'game_checkpoint', text: 'Now it is your turn — play the {topic} game!', durationSec: 6, transition: 'fade', gameId: '' },
    { type: 'recap', text: 'You did it! {topic} is fun when you try!', durationSec: 8, transition: 'fade' },
  ],
  glue: [
    'Keep the teach scenes simple before the game gets harder.',
  ],
};

function getStoryTemplateFor(gameTemplate) {
  return STORY_TEMPLATES[gameTemplate] || GENERIC_STORY_TEMPLATE;
}

function getSceneLibrary() {
  return {
    backgrounds: SCENE_BACKGROUNDS,
    characters: SCENE_CHARACTERS,
    transitions: SCENE_TRANSITIONS,
  };
}

function getStoryTemplates(gameTemplate) {
  const ids = gameTemplate ? [gameTemplate] : Object.keys(STORY_TEMPLATES);
  return ids.map((id) => ({ template: id, ...getStoryTemplateFor(id) }));
}

module.exports = {
  SCENE_BACKGROUNDS,
  SCENE_CHARACTERS,
  SCENE_TRANSITIONS,
  STORY_TEMPLATES,
  GENERIC_STORY_TEMPLATE,
  getSceneLibrary,
  getStoryTemplateFor,
  getStoryTemplates,
};
