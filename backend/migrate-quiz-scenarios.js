/**
 * Migration: Transform existing quiz configs to scenario-based story style.
 * Adds characters, scenarios, hints, feedback, speechText to each question.
 * Preserves all existing correct answers and options.
 */
const db = require('./src/models');

const TRANSFORMS = {
  // ── gc-jp-u9-quiz: Primary Grammar (he/she/was/I/to) ──
  'gc-jp-u9-quiz': {
    characters: [
      { name: 'Alex', emoji: '👦', personality: 'curious' },
      { name: 'Maya', emoji: '👧', personality: 'playful' },
      { name: 'Tobi', emoji: '🧒', personality: 'brave' },
    ],
    questions: [
      {
        id: 'q-u9-1',
        prompt: '___ is my best friend.',
        scenario: "Alex is talking about his friend Sam. Sam is a boy. Alex says:\n\"Sam is my best friend. ___ is very funny!\"",
        characterName: 'Alex',
        characterEmoji: '👦',
        setting: 'at school',
        hint: "Sam is a boy, so let's use the word we say for boys!",
        speechText: "Alex is talking about his friend Sam. Sam is a boy. Alex says: Sam is my best friend. Who should Alex say?",
        feedbackCorrect: 'Awesome! You know your pronouns!',
        feedbackWrong: "Almost! Sam is a boy — let's think about which word we use for boys.",
        options: [
          { id: 'he', label: 'He' },
          { id: 'she', label: 'She' },
          { id: 'was', label: 'Was' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q-u9-2',
        prompt: '___ is my best friend.',
        scenario: "Maya is talking about her friend Zara. Zara is a girl. Maya says:\n\"Zara is my best friend. ___ is so kind!\"",
        characterName: 'Maya',
        characterEmoji: '👧',
        setting: 'at the playground',
        hint: "Zara is a girl, so let's use the word we say for girls!",
        speechText: "Maya is talking about her friend Zara. Zara is a girl. Maya says: Zara is my best friend. Who should Maya say?",
        feedbackCorrect: "Great job! You're a star!",
        feedbackWrong: "Hmm, Zara is a girl. Which word do we use for girls?",
        options: [
          { id: 'she', label: 'She' },
          { id: 'he', label: 'He' },
          { id: 'to', label: 'To' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q-u9-3',
        prompt: '___ am ready for school.',
        scenario: "Tobi is getting ready for school. He's putting on his shoes and says:\n\"___ am ready for school!\"",
        characterName: 'Tobi',
        characterEmoji: '🧒',
        setting: 'at home',
        hint: 'When we talk about ourselves, we say...',
        speechText: "Tobi is getting ready for school. He says: I am ready for school! Which word goes at the start?",
        feedbackCorrect: "Yes! 'I' is the word for yourself!",
        feedbackWrong: "When we talk about ourselves, we use a special word. Can you find it?",
        options: [
          { id: 'i', label: 'I' },
          { id: 'we', label: 'We' },
          { id: 'be', label: 'Be' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q-u9-4',
        prompt: 'Give the book ___ my teacher.',
        scenario: "Alex has a book for his teacher. He walks up and says:\n\"Give the book ___ my teacher.\"",
        characterName: 'Alex',
        characterEmoji: '👦',
        setting: 'at school',
        hint: 'We give something TO someone.',
        speechText: "Alex has a book for his teacher. He says: Give the book to my teacher. Which word fits?",
        feedbackCorrect: "Perfect! You're so clever!",
        feedbackWrong: "When we give something, we give it TO someone. Try again!",
        options: [
          { id: 'to', label: 'to' },
          { id: 'was', label: 'was' },
          { id: 'he', label: 'he' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q-u9-5',
        prompt: 'Yesterday it ___ sunny.',
        scenario: "Maya looks out the window and remembers yesterday:\n\"Yesterday it ___ sunny! We played outside.\"",
        characterName: 'Maya',
        characterEmoji: '👧',
        setting: 'at home',
        hint: 'When we talk about yesterday, we say it WAS sunny.',
        speechText: "Maya remembers yesterday. She says: Yesterday it was sunny! We played outside. Which word fits?",
        feedbackCorrect: "Brilliant! 'Was' is for yesterday!",
        feedbackWrong: "When we talk about yesterday, we use a special word. Try again!",
        options: [
          { id: 'was', label: 'was' },
          { id: 'the', label: 'the' },
          { id: 'she', label: 'she' },
        ],
        correctIndex: 0,
      },
    ],
  },

  // ── gc-jp-u3-quiz: KG1 Phonics (g, o, u, l, f, b) ──
  'gc-jp-u3-quiz': {
    characters: [
      { name: 'Leo', emoji: '🦁', personality: 'friendly' },
      { name: 'Zara', emoji: '🧒', personality: 'curious' },
    ],
    questions: [
      {
        id: 'q-g3-g',
        prompt: 'Which picture starts with the g sound?',
        scenario: "Leo the lion is at the zoo. He points at animals and says:\n\"One of these animals starts with the g sound. Can you help me find it?\"",
        characterName: 'Leo',
        characterEmoji: '🦁',
        setting: 'at the zoo',
        hint: 'The g sound is like "guh". Which animal starts with "guh"?',
        speechText: "Leo the lion is at the zoo. He says: One of these animals starts with the g sound. Can you find it?",
        feedbackCorrect: "Roar! You found it! Goat starts with g!",
        feedbackWrong: "Not quite! The g sound is like 'guh'. Try again!",
        options: [
          { id: 'goat', label: '🐐 Goat' },
          { id: 'fish', label: '🐟 Fish' },
          { id: 'sun', label: '☀️ Sun' },
          { id: 'ant', label: '🐜 Ant' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q-g3-o',
        prompt: 'Which picture starts with the o sound?',
        scenario: "Zara is exploring the ocean exhibit. She sees many sea creatures and says:\n\"One of these starts with the o sound. Which one?\"",
        characterName: 'Zara',
        characterEmoji: '🧒',
        setting: 'at the ocean',
        hint: 'The o sound is like "oh". Which word starts with "oh"?',
        speechText: "Zara is at the ocean exhibit. She says: One of these starts with the o sound. Which one?",
        feedbackCorrect: "Splash! Octopus starts with o!",
        feedbackWrong: "The o sound is like 'oh'. Can you find the word?",
        options: [
          { id: 'octopus', label: '🐙 Octopus' },
          { id: 'tiger', label: '🐯 Tiger' },
          { id: 'hen', label: '🐔 Hen' },
          { id: 'rat', label: '🐀 Rat' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q-g3-u',
        prompt: 'Which picture starts with the u sound?',
        scenario: "Leo is walking in the rain. He sees something that keeps him dry:\n\"This thing starts with the u sound. What is it?\"",
        characterName: 'Leo',
        characterEmoji: '🦁',
        setting: 'outside in the rain',
        hint: 'The u sound is like "uh". What do you use when it rains?',
        speechText: "Leo is in the rain. He sees something that keeps him dry. It starts with the u sound. What is it?",
        feedbackCorrect: "Dry as a bone! Umbrella starts with u!",
        feedbackWrong: "The u sound is like 'uh'. What keeps you dry in the rain?",
        options: [
          { id: 'lion', label: '🦁 Lion' },
          { id: 'umbrella', label: '☂️ Umbrella' },
          { id: 'goat', label: '🐐 Goat' },
          { id: 'pig', label: '🐷 Pig' },
        ],
        correctIndex: 1,
      },
      {
        id: 'q-g3-l',
        prompt: 'Which picture starts with the l sound?',
        scenario: "Zara is in the garden. She picks up something green from a tree:\n\"This starts with the l sound. What did I find?\"",
        characterName: 'Zara',
        characterEmoji: '🧒',
        setting: 'in the garden',
        hint: 'The l sound is like "lll". It falls from trees in autumn.',
        speechText: "Zara is in the garden. She picks up something green from a tree. It starts with the l sound. What is it?",
        feedbackCorrect: "Beautiful! Leaf starts with l!",
        feedbackWrong: "The l sound is like 'lll'. It grows on trees!",
        options: [
          { id: 'leaf', label: '🍃 Leaf' },
          { id: 'dog', label: '🐕 Dog' },
          { id: 'cat', label: '🐈 Cat' },
          { id: 'nest', label: '🪺 Nest' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q-g3-f',
        prompt: 'Which picture starts with the f sound?',
        scenario: "Leo is at the pond. He sees a small green animal that jumps:\n\"This animal starts with the f sound. What is it?\"",
        characterName: 'Leo',
        characterEmoji: '🦁',
        setting: 'at the pond',
        hint: 'The f sound is like "fff". This animal is green and hops!',
        speechText: "Leo is at the pond. He sees a small green animal that jumps. It starts with the f sound. What is it?",
        feedbackCorrect: "Ribbit! Frog starts with f!",
        feedbackWrong: "The f sound is like 'fff'. This animal is green and hops!",
        options: [
          { id: 'frog', label: '🐸 Frog' },
          { id: 'bat', label: '🦇 Bat' },
          { id: 'iguana', label: '🦎 Iguana' },
          { id: 'tin', label: '🥫 Tin' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q-g3-b',
        prompt: 'Which picture starts with the b sound?',
        scenario: "Zara looks up at the sky. She sees something flying with colorful wings:\n\"This starts with the b sound. What do you see?\"",
        characterName: 'Zara',
        characterEmoji: '🧒',
        setting: 'looking at the sky',
        hint: 'The b sound is like "buh". This animal can fly!',
        speechText: "Zara looks at the sky. She sees something flying with colorful wings. It starts with the b sound. What is it?",
        feedbackCorrect: "Tweet tweet! Bird starts with b!",
        feedbackWrong: "The b sound is like 'buh'. This animal flies in the sky!",
        options: [
          { id: 'bird', label: '🐦 Bird' },
          { id: 'sun', label: '☀️ Sun' },
          { id: 'peg', label: '📌 Peg' },
          { id: 'owl', label: '🦉 Owl' },
        ],
        correctIndex: 0,
      },
    ],
  },

  // ── 0d34f765: KG2 Science (animal homes) ──
  '0d34f765-8f76-4015-a67e-9a0e1247c5cc': {
    characters: [
      { name: 'Maya', emoji: '👧', personality: 'adventurous' },
      { name: 'Tobi', emoji: '🧒', personality: 'curious' },
    ],
    questions: [
      {
        id: 'q1',
        prompt: 'Where does a fish live?',
        scenario: "Maya and Tobi visit the aquarium. Maya points at a fish and asks:\n\"Where does a fish live? Let's find out!\"",
        characterName: 'Maya',
        characterEmoji: '👧',
        setting: 'at the aquarium',
        hint: 'Fish swim in water. Which place has water?',
        speechText: "Maya and Tobi are at the aquarium. Maya asks: Where does a fish live?",
        feedbackCorrect: "Splash! Fish live in water!",
        feedbackWrong: "Fish need water to swim. Which place has water?",
        options: [
          { id: 'o1', label: 'Water 💧' },
          { id: 'o2', label: 'Nest 🪺' },
          { id: 'o3', label: 'Den 🕳️' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q2',
        prompt: 'Where does a bird sleep?',
        scenario: "Tobi looks up at a tree. He sees a bird sitting in a cozy spot:\n\"Where does a bird sleep at night?\"",
        characterName: 'Tobi',
        characterEmoji: '🧒',
        setting: 'in the garden',
        hint: 'Birds build cozy homes in trees.',
        speechText: "Tobi is in the garden. He sees a bird in a tree. He asks: Where does a bird sleep?",
        feedbackCorrect: "Tweet! Birds sleep in nests!",
        feedbackWrong: "Birds build their homes in trees. Look for something cozy!",
        options: [
          { id: 'o4', label: 'Kennel' },
          { id: 'o5', label: 'Nest 🪺' },
          { id: 'o6', label: 'Barn' },
        ],
        correctIndex: 1,
      },
      {
        id: 'q3',
        prompt: 'A bee lives in a...',
        scenario: "Maya sees bees buzzing around flowers. She watches them fly back to their home:\n\"Where do all those bees live?\"",
        characterName: 'Maya',
        characterEmoji: '👧',
        setting: 'at the flower garden',
        hint: 'Bees make something sweet in their home.',
        speechText: "Maya sees bees at the flower garden. She asks: Where do bees live?",
        feedbackCorrect: "Bzzz! Bees live in a hive!",
        feedbackWrong: "Bees make honey in their home. It's wax and sweet!",
        options: [
          { id: 'o7', label: 'Hive 🍯' },
          { id: 'o8', label: 'Web 🕸️' },
          { id: 'o9', label: 'Pond 🏞️' },
        ],
        correctIndex: 0,
      },
    ],
  },

  // ── 375ce882: KG2 Numeracy (count and choose) ──
  '375ce882-6aa8-491a-8557-8cb731184d84': {
    characters: [
      { name: 'Leo', emoji: '🦁', personality: 'playful' },
      { name: 'Alex', emoji: '👦', personality: 'helpful' },
    ],
    questions: [
      {
        id: 'q1',
        prompt: 'How many apples do you see?',
        scenario: "Leo and Alex are at the fruit market. Leo points at a basket:\n\"Wow, look at all those apples! How many can you count?\"",
        characterName: 'Leo',
        characterEmoji: '🦁',
        setting: 'at the market',
        hint: 'Count each apple carefully. One, two, three...',
        speechText: "Leo and Alex are at the fruit market. Leo asks: How many apples can you count?",
        feedbackCorrect: "Yummy! You counted perfectly!",
        feedbackWrong: "Let's count together! Tap each apple as you count.",
        options: [
          { id: 'o1', label: '3' },
          { id: 'o2', label: '5' },
          { id: 'o3', label: '7' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q2',
        prompt: 'How many stars are there?',
        scenario: "Alex is looking at the night sky with his telescope:\n\"I can see stars! Let me count... How many stars do you see?\"",
        characterName: 'Alex',
        characterEmoji: '👦',
        setting: 'looking at the sky',
        hint: 'Look at each star and count them one by one.',
        speechText: "Alex is looking at the night sky. He asks: How many stars can you see?",
        feedbackCorrect: "Stellar! You counted all the stars!",
        feedbackWrong: "Look at the sky again. Count each star carefully!",
        options: [
          { id: 'o4', label: '4' },
          { id: 'o5', label: '6' },
          { id: 'o6', label: '2' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q3',
        prompt: 'How many birds are in the tree?',
        scenario: "Leo is sitting under a big tree. He hears chirping:\n\"Listen! There are birds in this tree. How many can you count?\"",
        characterName: 'Leo',
        characterEmoji: '🦁',
        setting: 'under a tree',
        hint: 'Listen to the chirps. Each bird makes one sound.',
        speechText: "Leo is under a big tree. He asks: How many birds are in the tree?",
        feedbackCorrect: "Tweet tweet! You counted them all!",
        feedbackWrong: "Listen carefully. Each chirp is one bird!",
        options: [
          { id: 'o7', label: '5' },
          { id: 'o8', label: '2' },
          { id: 'o9', label: '8' },
        ],
        correctIndex: 0,
      },
    ],
  },

  // ── gc-jp-u4-quiz-aff: KG2 Phonics (ai, j, oa, ie, ee, or) ──
  'gc-jp-u4-quiz-aff': {
    characters: [
      { name: 'Zara', emoji: '👧', personality: 'clever' },
      { name: 'Tobi', emoji: '🧒', personality: 'adventurous' },
    ],
    questions: [
      {
        id: 'q1',
        prompt: 'Which word has the ai sound?',
        scenario: "Zara is at the beach. She sees the blue water stretching far away:\n\"Look at the big ___! It's so blue!\" Which word fits?",
        characterName: 'Zara',
        characterEmoji: '👧',
        setting: 'at the beach',
        hint: 'The ai sound makes the long "ay" sound. Think of water at the beach!',
        speechText: "Zara is at the beach. She sees the blue water. She says: Look at the big ai sound! Which word fits?",
        feedbackCorrect: "Splash! 'Rain' has the ai sound!",
        feedbackWrong: "The ai sound makes 'ay'. Think of water falling from the sky!",
        options: [
          { id: 'rain', label: 'rain' },
          { id: 'run', label: 'run' },
          { id: 'cat', label: 'cat' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q2',
        prompt: 'Which word has the oa sound?',
        scenario: "Tobi is on a boat. He's sailing across the lake:\n\"I'm on a ___! It floats on the water!\" Which word fits?",
        characterName: 'Tobi',
        characterEmoji: '🧒',
        setting: 'on the lake',
        hint: 'The oa sound makes the long "oh" sound. You ride this on water!',
        speechText: "Tobi is on the lake. He says: I am on a boat! Which word has the oa sound?",
        feedbackCorrect: "Sail away! 'Boat' has the oa sound!",
        feedbackWrong: "The oa sound makes 'oh'. You ride this on water!",
        options: [
          { id: 'boat', label: 'boat' },
          { id: 'fish', label: 'fish' },
          { id: 'tree', label: 'tree' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q3',
        prompt: 'Which word has the ee sound?',
        scenario: "Zara sees a tall plant in the garden. It's very long and green:\n\"Look at that tall ___!\" Which word fits?",
        characterName: 'Zara',
        characterEmoji: '👧',
        setting: 'in the garden',
        hint: 'The ee sound is like "eee". It grows tall and green!',
        speechText: "Zara is in the garden. She sees something tall and green. It has the ee sound. What is it?",
        feedbackCorrect: "Green and tall! 'Tree' has the ee sound!",
        feedbackWrong: "The ee sound is like 'eee'. It grows in the ground and is tall!",
        options: [
          { id: 'tree', label: 'tree' },
          { id: 'cat', label: 'cat' },
          { id: 'sun', label: 'sun' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q4',
        prompt: 'Which word has the j sound?',
        scenario: "Tobi is at the playground. He jumps high on something bouncy:\n\"I love to ___! It's so fun!\" Which word fits?",
        characterName: 'Tobi',
        characterEmoji: '🧒',
        setting: 'at the playground',
        hint: 'The j sound is like "juh". You go UP in the air!',
        speechText: "Tobi is at the playground. He says: I love to jump! Which word has the j sound?",
        feedbackCorrect: "Boing! 'Jump' has the j sound!",
        feedbackWrong: "The j sound is like 'juh'. You do this to go up in the air!",
        options: [
          { id: 'jump', label: 'jump' },
          { id: 'sit', label: 'sit' },
          { id: 'run', label: 'run' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q5',
        prompt: 'Which word has the ie sound?',
        scenario: "Zara is making a drawing. She uses her favorite color:\n\"I want to paint it ___! It's my favorite!\" Which word fits?",
        characterName: 'Zara',
        characterEmoji: '👧',
        setting: 'at art class',
        hint: "The ie sound makes 'eye'. It is a color!",
        speechText: "Zara is painting. She wants to use her favorite color. It has the ie sound. What color?",
        feedbackCorrect: "Colorful! 'Pie' has the ie sound!",
        feedbackWrong: "The ie sound makes 'eye'. It's a color you can paint with!",
        options: [
          { id: 'pie', label: 'pie' },
          { id: 'red', label: 'red' },
          { id: 'big', label: 'big' },
        ],
        correctIndex: 0,
      },
    ],
  },
};

async function migrate() {
  let updated = 0;
  let skipped = 0;

  for (const [id, transform] of Object.entries(TRANSFORMS)) {
    try {
      const [rows] = await db.sequelize.query(
        'SELECT config_json FROM elite_content.kids_game_configs WHERE id = ?',
        { replacements: [id] }
      );

      if (!rows || rows.length === 0) {
        console.log(`⚠️  Config ${id} not found — skipping`);
        skipped++;
        continue;
      }

      const config = rows[0].config_json;
      const newConfig = { ...config };

      // Add characters at top level
      newConfig.characters = transform.characters;

      // Transform questions — preserve existing correct answers
      if (newConfig.questions && Array.isArray(newConfig.questions)) {
        newConfig.questions = newConfig.questions.map((q, i) => {
          const t = transform.questions[i];
          if (!t) return q; // Keep original if no transform defined
          return {
            ...q, // Preserve original id, prompt, options, correctIndex
            scenario: t.scenario,
            characterName: t.characterName,
            characterEmoji: t.characterEmoji,
            setting: t.setting,
            hint: t.hint,
            speechText: t.speechText,
            feedbackCorrect: t.feedbackCorrect,
            feedbackWrong: t.feedbackWrong,
          };
        });
      }

      // Update in database
      await db.sequelize.query(
        'UPDATE elite_content.kids_game_configs SET config_json = ? WHERE id = ?',
        { replacements: [JSON.stringify(newConfig), id] }
      );

      console.log(`✅ Updated: ${id} (${newConfig.questions?.length || 0} questions)`);
      updated++;
    } catch (err) {
      console.error(`❌ Failed ${id}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
