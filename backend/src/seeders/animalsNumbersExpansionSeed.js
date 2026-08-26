'use strict';
/**
 * Animals & Numbers Series Expansion — U5–U10 Ladder (Sprint 8 S8-2)
 *
 * Creates 6 new units per series (Animals, Numbers) with 3 games each.
 * Each game has ≥5 questions/items per brief requirement.
 *
 * Idempotent: upserts by fixed PKs. Run: node src/seeders/animalsNumbersExpansionSeed.js
 */
require('dotenv').config();
const db = require('../models');

const SCHOOL = { school_id: 'SCH-KIDS', branch_id: 'BR-MAIN', created_by: 'SYSTEM' };

// ── Animals Series ────────────────────────────────────────────────────────────
const ANIMALS_SERIES_ID = 'eb386a93-6843-4928-9b75-59a1d17d613a';
const ANIMALS_UNITS = [
  {
    id: 'unit-animals-u9', unit_number: 9, title: 'Arctic Animals: Penguins, Polar Bears, Seals',
    age: 'Primary', tier: 3, prereq: 'unit-animals-u8',
    objective: 'Identify arctic animals and their adaptations; understand extreme habitats.',
    xp: 35, threshold: 55, duration: 150,
    games: [
      {
        key: 'tap', template: 'tap-recognition', domain: 'cognitive',
        itemTitle: 'Find the Arctic Animal',
        prompt: 'Tap the arctic animal!',
        items: [
          { emoji: '🐧', label: 'Penguin' },
          { emoji: '🐻‍❄️', label: 'Polar Bear' },
          { emoji: '🦭', label: 'Seal' },
          { emoji: '🦊', label: 'Arctic Fox' },
          { emoji: '🐋', label: 'Beluga Whale' },
          { emoji: '🦦', label: 'Otter' },
        ],
        responseMode: 'image',
      },
      {
        key: 'quiz', template: 'quiz', domain: 'cognitive',
        itemTitle: 'Arctic Animal Quiz',
        questions: [
          {
            id: 'q-penguin', prompt: 'Which arctic animal cannot fly but swims very well?',
            options: [
              { id: 'penguin', label: '🐧 Penguin' },
              { id: 'fox', label: '🦊 Arctic Fox' },
              { id: 'bear', label: '🐻‍❄️ Polar Bear' },
              { id: 'seal', label: '🦭 Seal' },
            ], correctIndex: 0,
          },
          {
            id: 'q-bear', prompt: 'Which animal is white and very strong?',
            options: [
              { id: 'whale', label: '🐋 Beluga Whale' },
              { id: 'bear', label: '🐻‍❄️ Polar Bear' },
              { id: 'otter', label: '🦦 Otter' },
              { id: 'penguin', label: '🐧 Penguin' },
            ], correctIndex: 1,
          },
          {
            id: 'q-fox', prompt: 'Which arctic animal changes its coat to white in winter?',
            options: [
              { id: 'fox', label: '🦊 Arctic Fox' },
              { id: 'seal', label: '🦭 Seal' },
              { id: 'whale', label: '🐋 Beluga Whale' },
              { id: 'bear', label: '🐻‍❄️ Polar Bear' },
            ], correctIndex: 0,
          },
          {
            id: 'q-seal', prompt: 'Which animal has whiskers and lives on ice and water?',
            options: [
              { id: 'penguin', label: '🐧 Penguin' },
              { id: 'otter', label: '🦦 Otter' },
              { id: 'seal', label: '🦭 Seal' },
              { id: 'fox', label: '🦊 Arctic Fox' },
            ], correctIndex: 2,
          },
          {
            id: 'q-whale', prompt: 'Which arctic animal sings underwater?',
            options: [
              { id: 'bear', label: '🐻‍❄️ Polar Bear' },
              { id: 'whale', label: '🐋 Beluga Whale' },
              { id: 'penguin', label: '🐧 Penguin' },
              { id: 'fox', label: '🦊 Arctic Fox' },
            ], correctIndex: 1,
          },
        ],
      },
      {
        key: 'match', template: 'matching', domain: 'cognitive',
        itemTitle: 'Match Arctic Animal to Adaptation',
        pairs: [
          { a: '🐧 Penguin', b: 'Swims underwater' },
          { a: '🐻‍❄️ Polar Bear', b: 'Thick white fur' },
          { a: '🦭 Seal', b: 'Blubber layer' },
          { a: '🦊 Arctic Fox', b: 'White coat' },
          { a: '🐋 Beluga', b: 'Echolocation' },
        ],
      },
    ],
  },
  {
    id: 'unit-animals-u10', unit_number: 10, title: 'Animal Champions: Speed, Strength, Camouflage',
    age: 'Primary', tier: 3, prereq: 'unit-animals-u9',
    objective: 'Compare animal abilities; understand superlatives and adaptations for survival.',
    xp: 40, threshold: 60, duration: 160,
    games: [
      {
        key: 'tap', template: 'tap-recognition', domain: 'cognitive',
        itemTitle: 'Find the Animal Champion',
        prompt: 'Tap the champion animal!',
        items: [
          { emoji: '🐆', label: 'Cheetah (Fastest)' },
          { emoji: '🐘', label: 'Elephant (Strongest)' },
          { emoji: '🦎', label: 'Chameleon (Camouflage)' },
          { emoji: '🦅', label: 'Eagle (Sharpest Eyes)' },
          { emoji: '🐬', label: 'Dolphin (Smartest)' },
          { emoji: '🦑', label: 'Squid (Biggest Eye)' },
        ],
        responseMode: 'image',
      },
      {
        key: 'quiz', template: 'quiz', domain: 'cognitive',
        itemTitle: 'Animal Champions Quiz',
        questions: [
          {
            id: 'q-speed', prompt: 'Which animal is the fastest on land?',
            options: [
              { id: 'lion', label: '🦁 Lion' },
              { id: 'cheetah', label: '🐆 Cheetah' },
              { id: 'horse', label: '🐴 Horse' },
              { id: 'dog', label: '🐕 Dog' },
            ], correctIndex: 1,
          },
          {
            id: 'q-strong', prompt: 'Which animal is the strongest?',
            options: [
              { id: 'elephant', label: '🐘 Elephant' },
              { id: 'tiger', label: '🐯 Tiger' },
              { id: 'bear', label: '🐻 Bear' },
              { id: 'cow', label: '🐄 Cow' },
            ], correctIndex: 0,
          },
          {
            id: 'q-camo', prompt: 'Which animal can change its color to match surroundings?',
            options: [
              { id: 'frog', label: '🐸 Frog' },
              { id: 'snake', label: '🐍 Snake' },
              { id: 'chameleon', label: '🦎 Chameleon' },
              { id: 'fish', label: '🐟 Fish' },
            ], correctIndex: 2,
          },
          {
            id: 'q-eyes', prompt: 'Which animal has the biggest eyes relative to its body?',
            options: [
              { id: 'owl', label: '🦉 Owl' },
              { id: 'squid', label: '🦑 Squid' },
              { id: 'cat', label: '🐱 Cat' },
              { id: 'frog', label: '🐸 Frog' },
            ], correctIndex: 1,
          },
          {
            id: 'q-smart', prompt: 'Which animal is known as one of the smartest in the ocean?',
            options: [
              { id: 'shark', label: '🦈 Shark' },
              { id: 'whale', label: '🐋 Whale' },
              { id: 'dolphin', label: '🐬 Dolphin' },
              { id: 'turtle', label: '🐢 Turtle' },
            ], correctIndex: 2,
          },
        ],
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'cognitive',
        itemTitle: 'Order by Speed',
        context: 'Put these animals from slowest to fastest.',
        items: [
          { num: 1, label: '🐢 Tortoise' },
          { num: 2, label: '🐘 Elephant' },
          { num: 3, label: '🐴 Horse' },
          { num: 4, label: '🐆 Cheetah' },
          { num: 5, label: '🦅 Peregrine Falcon' },
        ],
      },
    ],
  },
];


// ── Numbers Series ────────────────────────────────────────────────────────────
const NUMBERS_SERIES_ID = '766a9eb2-2744-412c-87bc-d0ee54c4c256';
const NUMBERS_UNITS = [
  {
    id: 'unit-numbers-u5', unit_number: 5, title: 'Counting 11–20',
    age: 'KG1', tier: 2, prereq: null,
    objective: 'Count and recognize numbers 11–20; understand teen numbers as ten plus ones.',
    xp: 25, threshold: 50, duration: 120,
    games: [
      {
        key: 'tap', template: 'tap-recognition', domain: 'cognitive',
        itemTitle: 'Tap the Teen Number',
        prompt: 'Tap the number I say!',
        items: [
          { label: '11', num: 11 },
          { label: '12', num: 12 },
          { label: '13', num: 13 },
          { label: '14', num: 14 },
          { label: '15', num: 15 },
          { label: '16', num: 16 },
          { label: '17', num: 17 },
          { label: '18', num: 18 },
          { label: '19', num: 19 },
          { label: '20', num: 20 },
        ],
        responseMode: 'text',
      },
      {
        key: 'match', template: 'matching', domain: 'cognitive',
        itemTitle: 'Match Number to Words',
        pairs: [
          { a: '11', b: 'Eleven' },
          { a: '12', b: 'Twelve' },
          { a: '13', b: 'Thirteen' },
          { a: '14', b: 'Fourteen' },
          { a: '15', b: 'Fifteen' },
        ],
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Order Teen Numbers',
        context: 'Put numbers 11–20 in order.',
        items: [
          { num: 1, label: '11' },
          { num: 2, label: '12' },
          { num: 3, label: '13' },
          { num: 4, label: '14' },
          { num: 5, label: '15' },
          { num: 6, label: '16' },
          { num: 7, label: '17' },
          { num: 8, label: '18' },
          { num: 9, label: '19' },
          { num: 10, label: '20' },
        ],
      },
    ],
  },
  {
    id: 'unit-numbers-u6', unit_number: 6, title: 'Adding Within 20',
    age: 'KG1', tier: 2, prereq: 'unit-numbers-u5',
    objective: 'Add single-digit numbers to make sums within 20; use number bonds.',
    xp: 25, threshold: 50, duration: 130,
    games: [
      {
        key: 'quiz', template: 'quiz', domain: 'cognitive',
        itemTitle: 'Addition Quiz',
        questions: [
          {
            id: 'q-1', prompt: 'What is 3 + 4?',
            options: [{ id: '6', label: '6' }, { id: '7', label: '7' }, { id: '8', label: '8' }, { id: '9', label: '9' }], correctIndex: 1,
          },
          {
            id: 'q-2', prompt: 'What is 5 + 6?',
            options: [{ id: '9', label: '9' }, { id: '10', label: '10' }, { id: '11', label: '11' }, { id: '12', label: '12' }], correctIndex: 2,
          },
          {
            id: 'q-3', prompt: 'What is 8 + 7?',
            options: [{ id: '13', label: '13' }, { id: '14', label: '14' }, { id: '15', label: '15' }, { id: '16', label: '16' }], correctIndex: 2,
          },
          {
            id: 'q-4', prompt: 'What is 9 + 9?',
            options: [{ id: '16', label: '16' }, { id: '17', label: '17' }, { id: '18', label: '18' }, { id: '19', label: '19' }], correctIndex: 2,
          },
          {
            id: 'q-5', prompt: 'What is 6 + 5?',
            options: [{ id: '9', label: '9' }, { id: '10', label: '10' }, { id: '11', label: '11' }, { id: '12', label: '12' }], correctIndex: 2,
          },
        ],
      },
      {
        key: 'match', template: 'matching', domain: 'cognitive',
        itemTitle: 'Match Sum to Answer',
        pairs: [
          { a: '2 + 3', b: '5' },
          { a: '4 + 4', b: '8' },
          { a: '6 + 3', b: '9' },
          { a: '7 + 5', b: '12' },
          { a: '8 + 6', b: '14' },
        ],
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Order by Sum',
        context: 'Put addition problems from smallest to largest sum.',
        items: [
          { num: 1, label: '1 + 1' },
          { num: 2, label: '2 + 3' },
          { num: 3, label: '4 + 4' },
          { num: 4, label: '6 + 5' },
          { num: 5, label: '8 + 7' },
        ],
      },
    ],
  },
  {
    id: 'unit-numbers-u7', unit_number: 7, title: 'Subtracting Within 20',
    age: 'KG2', tier: 2, prereq: 'unit-numbers-u6',
    objective: 'Subtract single-digit numbers from numbers within 20; understand take-away.',
    xp: 30, threshold: 55, duration: 140,
    games: [
      {
        key: 'quiz', template: 'quiz', domain: 'cognitive',
        itemTitle: 'Subtraction Quiz',
        questions: [
          {
            id: 'q-1', prompt: 'What is 10 − 3?',
            options: [{ id: '5', label: '5' }, { id: '6', label: '6' }, { id: '7', label: '7' }, { id: '8', label: '8' }], correctIndex: 2,
          },
          {
            id: 'q-2', prompt: 'What is 15 − 6?',
            options: [{ id: '7', label: '7' }, { id: '8', label: '8' }, { id: '9', label: '9' }, { id: '10', label: '10' }], correctIndex: 2,
          },
          {
            id: 'q-3', prompt: 'What is 12 − 5?',
            options: [{ id: '5', label: '5' }, { id: '6', label: '6' }, { id: '7', label: '7' }, { id: '8', label: '8' }], correctIndex: 2,
          },
          {
            id: 'q-4', prompt: 'What is 20 − 8?',
            options: [{ id: '10', label: '10' }, { id: '11', label: '11' }, { id: '12', label: '12' }, { id: '13', label: '13' }], correctIndex: 2,
          },
          {
            id: 'q-5', prompt: 'What is 18 − 9?',
            options: [{ id: '7', label: '7' }, { id: '8', label: '8' }, { id: '9', label: '9' }, { id: '10', label: '10' }], correctIndex: 2,
          },
        ],
      },
      {
        key: 'match', template: 'matching', domain: 'cognitive',
        itemTitle: 'Match Subtraction to Answer',
        pairs: [
          { a: '10 − 2', b: '8' },
          { a: '15 − 5', b: '10' },
          { a: '12 − 4', b: '8' },
          { a: '18 − 7', b: '11' },
          { a: '20 − 10', b: '10' },
        ],
      },
      {
        key: 'fib', template: 'fill-in-blank', domain: 'cognitive',
        itemTitle: 'Fill the Missing Number',
        sentences: [
          { sentence: '10 − __ = 7', blanks: [{ id: 0, answer: '3' }], wordBank: ['2', '3', '4', '5'], context: '10 take away 3 is 7' },
          { sentence: '15 − __ = 9', blanks: [{ id: 0, answer: '6' }], wordBank: ['5', '6', '7', '8'], context: '15 take away 6 is 9' },
          { sentence: '12 − __ = 5', blanks: [{ id: 0, answer: '7' }], wordBank: ['6', '7', '8', '9'], context: '12 take away 7 is 5' },
          { sentence: '20 − __ = 12', blanks: [{ id: 0, answer: '8' }], wordBank: ['7', '8', '9', '10'], context: '20 take away 8 is 12' },
          { sentence: '18 − __ = 9', blanks: [{ id: 0, answer: '9' }], wordBank: ['8', '9', '10', '11'], context: '18 take away 9 is 9' },
        ],
      },
    ],
  },
  {
    id: 'unit-numbers-u8', unit_number: 8, title: 'Place Value: Tens and Ones',
    age: 'KG2', tier: 2, prereq: 'unit-numbers-u7',
    objective: 'Understand place value — tens digit and ones digit; compose and decompose numbers.',
    xp: 30, threshold: 55, duration: 140,
    games: [
      {
        key: 'quiz', template: 'quiz', domain: 'cognitive',
        itemTitle: 'Place Value Quiz',
        questions: [
          {
            id: 'q-1', prompt: 'In the number 23, how many tens are there?',
            options: [{ id: '1', label: '1 ten' }, { id: '2', label: '2 tens' }, { id: '3', label: '3 tens' }, { id: '23', label: '23 tens' }], correctIndex: 1,
          },
          {
            id: 'q-2', prompt: 'In the number 47, how many ones?',
            options: [{ id: '4', label: '4 ones' }, { id: '7', label: '7 ones' }, { id: '47', label: '47 ones' }, { id: '11', label: '11 ones' }], correctIndex: 1,
          },
          {
            id: 'q-3', prompt: 'What is 3 tens and 5 ones?',
            options: [{ id: '35', label: '35' }, { id: '53', label: '53' }, { id: '8', label: '8' }, { id: '305', label: '305' }], correctIndex: 0,
          },
          {
            id: 'q-4', prompt: 'How many ones in one ten?',
            options: [{ id: '1', label: '1' }, { id: '5', label: '5' }, { id: '10', label: '10' }, { id: '100', label: '100' }], correctIndex: 2,
          },
          {
            id: 'q-5', prompt: 'Which number has 6 tens and 2 ones?',
            options: [{ id: '26', label: '26' }, { id: '62', label: '62' }, { id: '602', label: '602' }, { id: '8', label: '8' }], correctIndex: 1,
          },
        ],
      },
      {
        key: 'match', template: 'matching', domain: 'cognitive',
        itemTitle: 'Match Number to Place Value',
        pairs: [
          { a: '14', b: '1 ten 4 ones' },
          { a: '27', b: '2 tens 7 ones' },
          { a: '35', b: '3 tens 5 ones' },
          { a: '42', b: '4 tens 2 ones' },
          { a: '58', b: '5 tens 8 ones' },
        ],
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Order by Tens',
        context: 'Put numbers from smallest to largest.',
        items: [
          { num: 1, label: '12' },
          { num: 2, label: '25' },
          { num: 3, label: '34' },
          { num: 4, label: '41' },
          { num: 5, label: '56' },
        ],
      },
    ],
  },
  {
    id: 'unit-numbers-u9', unit_number: 9, title: 'Skip Counting and Patterns',
    age: 'Primary', tier: 3, prereq: 'unit-numbers-u8',
    objective: 'Skip count by 2s, 5s, and 10s; identify number patterns.',
    xp: 35, threshold: 60, duration: 150,
    games: [
      {
        key: 'quiz', template: 'quiz', domain: 'cognitive',
        itemTitle: 'Skip Counting Quiz',
        questions: [
          {
            id: 'q-1', prompt: 'Count by 2s: 2, 4, 6, __, 10',
            options: [{ id: '7', label: '7' }, { id: '8', label: '8' }, { id: '9', label: '9' }, { id: '12', label: '12' }], correctIndex: 1,
          },
          {
            id: 'q-2', prompt: 'Count by 5s: 5, 10, 15, __, 25',
            options: [{ id: '18', label: '18' }, { id: '20', label: '20' }, { id: '22', label: '22' }, { id: '30', label: '30' }], correctIndex: 1,
          },
          {
            id: 'q-3', prompt: 'Count by 10s: 10, 20, __, 40, 50',
            options: [{ id: '25', label: '25' }, { id: '30', label: '30' }, { id: '35', label: '35' }, { id: '22', label: '22' }], correctIndex: 1,
          },
          {
            id: 'q-4', prompt: 'What comes next? 3, 6, 9, __',
            options: [{ id: '10', label: '10' }, { id: '11', label: '11' }, { id: '12', label: '12' }, { id: '13', label: '13' }], correctIndex: 2,
          },
          {
            id: 'q-5', prompt: 'What comes next? 5, 10, 15, __',
            options: [{ id: '17', label: '17' }, { id: '18', label: '18' }, { id: '20', label: '20' }, { id: '25', label: '25' }], correctIndex: 2,
          },
        ],
      },
      {
        key: 'match', template: 'matching', domain: 'cognitive',
        itemTitle: 'Match Pattern to Sequence',
        pairs: [
          { a: 'By 2s', b: '2, 4, 6, 8, 10' },
          { a: 'By 5s', b: '5, 10, 15, 20, 25' },
          { a: 'By 10s', b: '10, 20, 30, 40, 50' },
          { a: 'By 3s', b: '3, 6, 9, 12, 15' },
          { a: 'By 4s', b: '4, 8, 12, 16, 20' },
        ],
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Order Skip Count Pattern',
        context: 'Put these numbers in order: count by 5s from 5 to 25.',
        items: [
          { num: 1, label: '5' },
          { num: 2, label: '10' },
          { num: 3, label: '15' },
          { num: 4, label: '20' },
          { num: 5, label: '25' },
        ],
      },
    ],
  },
  {
    id: 'unit-numbers-u10', unit_number: 10, title: 'Money and Time Basics',
    age: 'Primary', tier: 3, prereq: 'unit-numbers-u9',
    objective: 'Recognize coins and notes; tell time to the hour and half-hour.',
    xp: 40, threshold: 60, duration: 160,
    games: [
      {
        key: 'quiz', template: 'quiz', domain: 'cognitive',
        itemTitle: 'Money & Time Quiz',
        questions: [
          {
            id: 'q-1', prompt: 'How many kobo make 1 naira?',
            options: [{ id: '10', label: '10' }, { id: '50', label: '50' }, { id: '100', label: '100' }, { id: '1000', label: '1000' }], correctIndex: 2,
          },
          {
            id: 'q-2', prompt: 'What time is it when the short hand is on 3 and long hand on 12?',
            options: [{ id: '3:30', label: '3:30' }, { id: '3:00', label: '3:00' }, { id: '12:30', label: '12:30' }, { id: '12:00', label: '12:00' }], correctIndex: 1,
          },
          {
            id: 'q-3', prompt: 'Which coin is worth 50 kobo?',
            options: [{ id: '5', label: '5 kobo' }, { id: '10', label: '10 kobo' }, { id: '50', label: '50 kobo' }, { id: '100', label: '100 kobo' }], correctIndex: 2,
          },
          {
            id: 'q-4', prompt: 'What time is half past 2?',
            options: [{ id: '2:00', label: '2:00' }, { id: '2:30', label: '2:30' }, { id: '3:00', label: '3:00' }, { id: '1:30', label: '1:30' }], correctIndex: 1,
          },
          {
            id: 'q-5', prompt: 'If you have ₦5 and spend ₦2, how much is left?',
            options: [{ id: '₦1', label: '₦1' }, { id: '₦2', label: '₦2' }, { id: '₦3', label: '₦3' }, { id: '₦7', label: '₦7' }], correctIndex: 2,
          },
        ],
      },
      {
        key: 'match', template: 'matching', domain: 'cognitive',
        itemTitle: 'Match Time to Clock',
        pairs: [
          { a: '3:00', b: '🕐' },
          { a: '6:00', b: '🕕' },
          { a: '9:00', b: '🕘' },
          { a: '12:00', b: '🕛' },
          { a: '1:30', b: '🕜' },
        ],
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Order by Value',
        context: 'Put money from smallest to largest value.',
        items: [
          { num: 1, label: '₦5' },
          { num: 2, label: '₦10' },
          { num: 3, label: '₦20' },
          { num: 4, label: '₦50' },
          { num: 5, label: '₦100' },
        ],
      },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildConfig(seriesId, unit, game) {
  return {
    gameId: `gc-${seriesId}-u${unit.unit_number}-${game.key}`,
    template: game.template,
    lessonId: `lesson-${seriesId}-u${unit.unit_number}-${game.key}`,
    ageLevel: unit.age,
    category: seriesId === ANIMALS_SERIES_ID ? 'Animals' : 'Numbers',
    tier: unit.tier,
    item_id: `${seriesId}-u${unit.unit_number}-${game.key}`,
    series_id: seriesId,
    unit_number: unit.unit_number,
    domain: game.domain,
    rewards: { starsOnComplete: 3, xp: unit.xp },
    successThresholdPct: unit.threshold,
    durationSec: unit.duration,
    durationTargetSec: unit.duration,
    ...(game.prompt ? { prompt: game.prompt } : {}),
    ...(game.context ? { context: game.context } : {}),
    ...(game.items ? { items: game.items } : {}),
    ...(game.pairs ? { pairs: game.pairs } : {}),
    ...(game.questions ? { questions: game.questions } : {}),
    ...(game.sentences ? { sentences: game.sentences } : {}),
  };
}

async function upsert(model, pk, values) {
  const [row] = await model.upsert({ ...values, id: pk });
  return row;
}

async function seedSeries(seriesId, seriesName, category, description, units, startAfterUnitId = null) {
  // 1) Series
  await upsert(db.KidGameSeries, seriesId, {
    name: seriesName,
    category,
    description,
    subject_code: category === 'Animals' ? 'Sci-Animals' : 'Math-Numbers',
    created_by: 'SYSTEM',
  });
  console.log(`✅ series upserted: ${seriesId}`);

  let prevUnitId = startAfterUnitId;
  for (const unit of units) {
    // 2) Lessons + configs per game
    const contentItems = [];
    for (const game of unit.games) {
      const lessonId = `lesson-${seriesId}-u${unit.unit_number}-${game.key}`;
      const subject = seriesId === ANIMALS_SERIES_ID ? 'Science — Animals' : 'Mathematics — Numbers';
      await upsert(db.KidLesson, lessonId, {
        ...SCHOOL,
        title: `${unit.title} — ${game.itemTitle}`,
        subject,
        age_level: unit.age,
        is_global: 1,
        lesson_text: `${game.itemTitle} (${game.domain} domain, Tier ${unit.tier})`,
        content_state: 'published',
        lesson_type: 'game',
        duration_target_sec: unit.duration,
        published_at: new Date(),
      });
      const cfg = buildConfig(seriesId, unit, game);
      await upsert(db.KidGameConfig, `gc-${seriesId}-u${unit.unit_number}-${game.key}`, {
        lesson_id: lessonId,
        template: game.template,
        age_level: unit.age,
        config_json: cfg,
        schema_version: '1.0',
        item_id: cfg.item_id,
        tier: unit.tier,
        category,
        content_state: 'published',
        model_version: `${seriesId}-v1`,
        approved_by: 'SYSTEM',
        approved_at: new Date(),
      });
      contentItems.push({
        lesson_id: lessonId,
        game_config_id: `gc-${seriesId}-u${unit.unit_number}-${game.key}`,
        item_id: cfg.item_id,
        template: game.template,
        title: game.itemTitle,
        domain: game.domain,
        tier: unit.tier,
      });
      console.log(`  ✅ game published: ${cfg.gameId} [${game.domain}]`);
    }

    // 3) Unit (prerequisite chain)
    await upsert(db.KidGameUnit, unit.id, {
      series_id: seriesId,
      unit_number: unit.unit_number,
      prerequisite_unit_id: prevUnitId,
      content_items: contentItems,
      title: unit.title,
    });
    console.log(`✅ unit upserted: ${unit.id} (prereq=${prevUnitId})`);

    // 4) Curriculum points — one per game
    for (const ci of contentItems) {
      await upsert(db.KidCurriculumPoint, `cp-${ci.item_id}`, {
        curriculum_source: `${seriesName} — Unit ${unit.unit_number}`,
        age_band: unit.age,
        learning_objective: `${unit.objective} Domain: ${ci.domain}.`,
        category,
        mapped_item_ids: [ci.item_id],
      });
    }
    prevUnitId = unit.id;
  }
}

(async () => {
  try {
    await db.content.authenticate();

    await seedSeries(
      ANIMALS_SERIES_ID,
      'Animals — Nigerian Farm & Wild',
      'Animals',
      'Explore farm, jungle, ocean, arctic, and nocturnal animals — learn habitats, adaptations, and survival skills across 10 developmental units.',
      ANIMALS_UNITS,
      'c04a0723-25f7-4c6d-b066-5f4c6ecedccd',  // existing U8 unit ID
    );

    await seedSeries(
      NUMBERS_SERIES_ID,
      'Number Sense Gym (Counting 1-10)',
      'Numbers',
      'Master counting 11–20, addition, subtraction, place value, skip counting, and money/time across 10 developmental units.',
      NUMBERS_UNITS,
    );

    console.log('\n🎉 Animals & Numbers Expansion seeded: 2 series × 6 units × 3 games = 36 new lessons+games');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
})();
