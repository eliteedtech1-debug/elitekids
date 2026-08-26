/**
 * Migration: Add scenario-based story elements to existing tap-recognition configs.
 * Adds characters, scenario, hint, feedbackCorrect, feedbackWrong, speechText.
 * Preserves all existing fields (items, correctId, prompt, etc.).
 */
require(__dirname + '/node_modules/dotenv').config({ path: __dirname + '/.env' });
const db = require('./src/models');

const CHARACTERS_LIBRARY = [
  [
    { name: 'Zara', emoji: '👧', personality: 'curious' },
    { name: 'Tobi', emoji: '🧒', personality: 'brave' },
    { name: 'Maya', emoji: '👦', personality: 'playful' },
  ],
  [
    { name: 'Leo', emoji: '🧒', personality: 'adventurous' },
    { name: 'Amina', emoji: '👧', personality: 'kind' },
    { name: 'Kofi', emoji: '👦', personality: 'funny' },
  ],
  [
    { name: 'Nia', emoji: '👧', personality: 'clever' },
    { name: 'Emeka', emoji: '🧒', personality: 'curious' },
    { name: 'Fatima', emoji: '👦', personality: 'brave' },
  ],
];

const SCENARIOS = {
  animals: [
    'Zara and Tobi went to the farm. They saw many animals. Can you help them find the right one?',
    'Maya is at the zoo! She wants to show you something special. Tap to help her!',
    'Tobi is learning about animals. He needs your help to find the right one!',
  ],
  movements: [
    'The animals at the farm are moving around! Can you show Tobi how they move?',
    'Zara is watching the animals play. She wants to know which one moves like this!',
    'Maya is playing a game with her friends. Help her find the right movement!',
  ],
  habitats: [
    'Tobi is building a home for an animal. Can you help him find the right place?',
    'Zara is learning where animals live. She needs your help!',
    'The animals need a home! Can you show Maya where they belong?',
  ],
  babies: [
    'The baby animals are looking for their families! Can you help them?',
    'Zara and Tobi found some baby animals. Help them find the right match!',
    'Maya is at the farm. She wants to know which baby goes with which animal!',
  ],
  phonics: [
    'Tobi is learning his letters! He needs your help to find the right one.',
    'Zara is practicing sounds. Can you help her tap the right letter?',
    'Maya is playing a letter game. She needs your help!',
  ],
  colors: [
    'Zara is painting a picture! She needs your help to find the right color.',
    'Tobi is sorting his crayons. Can you help him find the right one?',
    'Maya is learning about colors. She needs your help!',
  ],
  numbers: [
    'Tobi is counting things! Can you help him find the right number?',
    'Zara is playing a number game. She needs your help!',
    'Maya is counting animals. Can you show her the right number?',
  ],
  sounds: [
    'Zara is listening to sounds. She needs your help to find the right one!',
    'Tobi is playing a sound game. Can you help him tap the right answer?',
    'Maya is learning about sounds. She needs your help!',
  ],
  default: [
    'Zara needs your help! Can you find the right answer?',
    'Tobi is playing a game. Can you help him tap the right one?',
    'Maya is learning something new. She needs your help!',
  ],
};

const HINTS = {
  animals: 'Look carefully at each animal. Which one matches?',
  movements: 'Think about how the animal moves. Which one moves like this?',
  habitats: 'Where does this animal live? Think about its home!',
  babies: 'Which baby animal belongs to this family?',
  phonics: 'Listen carefully. Which letter makes this sound?',
  colors: 'Look at the colors. Which one matches?',
  numbers: 'Count carefully. Which number is this?',
  sounds: 'Listen to the sound. Which one matches?',
  default: 'Look carefully at all the options. Which one is right?',
};

function getScenarioCategory(config) {
  const prompt = (config.prompt || '').toLowerCase();
  const topic = (config.topic || '').toLowerCase();
  const items = config.items || [];

  if (prompt.includes('→') || prompt.includes('calf') || prompt.includes('chick') || prompt.includes('kid')) return 'babies';
  if (prompt.includes('walk') || prompt.includes('hop') || prompt.includes('fly') || prompt.includes('swim') || prompt.includes('jump')) return 'movements';
  if (prompt.includes('barn') || prompt.includes('forest') || prompt.includes('pond') || prompt.includes('burrow')) return 'habitats';
  if (prompt.includes('letter') || prompt.includes('sound') || prompt.includes('blend') || prompt.includes('word')) return 'phonics';
  if (prompt.includes('color') || prompt.includes('colour')) return 'colors';
  if (prompt.includes('number') || prompt.includes('count')) return 'numbers';
  if (topic === 'animals' || prompt.includes('animal')) return 'animals';
  return 'default';
}

function getConfigHash(config) {
  const prompt = config.prompt || '';
  const correctId = config.correctId || '';
  return `${prompt}::${correctId}`;
}

async function migrate() {
  const [rows] = await db.sequelize.query(
    `SELECT id, config_json FROM elite_content.kids_game_configs WHERE template = 'tap-recognition'`
  );

  console.log(`Found ${rows.length} tap-recognition configs to migrate\n`);

  let updated = 0;
  let skipped = 0;
  const seen = new Set();
  let charIdx = 0;

  for (const row of rows) {
    const config = typeof row.config_json === 'string' ? JSON.parse(row.config_json) : row.config_json;

    // Skip configs that already have scenario/characters
    if (config.scenario || (config.characters && config.characters.length > 0)) {
      console.log(`SKIP ${row.id} — already has scenario`);
      skipped++;
      continue;
    }

    // Skip minimal/broken configs (no items or no prompt)
    if (!config.items || config.items.length === 0) {
      console.log(`SKIP ${row.id} — no items`);
      skipped++;
      continue;
    }

    const category = getScenarioCategory(config);
    const characters = CHARACTERS_LIBRARY[charIdx % CHARACTERS_LIBRARY.length];
    charIdx++;

    const scenarioPool = SCENARIOS[category] || SCENARIOS.default;
    const scenario = scenarioPool[charIdx % scenarioPool.length];

    const prompt = config.prompt || 'Tap the right answer!';
    const correctItem = config.items.find(it => it.id === config.correctId) || config.items[0];
    const correctLabel = correctItem.label || correctItem.color || correctItem.id || 'the right one';

    const hintPool = HINTS[category] || HINTS.default;

    const updatedConfig = {
      ...config,
      characters,
      scenario,
      hint: hintPool,
      feedbackCorrect: `Amazing! You found ${correctLabel}!`,
      feedbackWrong: `Not quite! Look again — which one is ${correctLabel}?`,
      speechText: scenario + ' ' + prompt,
    };

    await db.sequelize.query(
      `UPDATE elite_content.kids_game_configs SET config_json = :config WHERE id = :id`,
      { replacements: { config: JSON.stringify(updatedConfig), id: row.id } }
    );

    console.log(`OK ${row.id} — category=${category}, hint added`);
    updated++;
  }

  console.log(`\nMigration complete: ${updated} updated, ${skipped} skipped`);
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
