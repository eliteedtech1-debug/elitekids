/**
 * Game Config Fix Script — Applied 2026-08-26
 *
 * Fixed 37 games across elite_content_test + elite_content (prod):
 *   - 12 phonics matching/sort/fib/quiz games (gc-jp-u1 through u10, g4-g6)
 *   - 3 phonics tap games updated with better characters/scenarios
 *   - 3 named math/sorting games (Amara, Fatima, Auntie Ngozi)
 *   - 19 remaining phonics game updates (speechText, feedback, characters)
 *
 * Remaining: ~106 UUID-generated games still have null scenarios.
 * These need content-aware fixes based on their specific game data.
 *
 * Run: scp fix_games_v3.js to server, then node fix_games_v3.js
 * Uses: mysql2/promise, databases elite_content_test + elite_content
 */

const mysql = require('mysql2/promise');

const UPDATES = [
  // ═══ PHONICS: Unit 1 (s, a, t, i, p, n) ═══
  { id: 'gc-jp-u1-tap', patch: {
    scenario: 'Foxy the fox is learning her very first sounds! She found six magic seeds \u2014 each one makes a special sound. Can you tap the right seed when Foxy says its sound?',
    speechText: 'Foxy the fox found magic seeds! Each seed makes a special sound. Listen carefully, then tap the right one. Ready? Here we go!',
    characters: [{ name: 'Foxy', emoji: '\uD83E\uDD8A', personality: 'curious' }],
    feedbackCorrect: 'Foxy wags her tail! You heard that sound!',
    feedbackWrong: 'Listen again \u2014 Foxy will say it one more time. You can do it!'
  }},
  { id: 'gc-jp-u1-match', patch: {
    scenario: 'Hootie the owl wants to match each sound to its picture. Can you help him find the right pair?',
    speechText: 'Hootie the owl needs your help! Match each letter sound to its picture. Tap a sound on one side, then tap its picture on the other!',
    characters: [{ name: 'Hootie', emoji: '\uD83E\uDD89', personality: 'wise' }],
    feedbackCorrect: 'Hoot hoot! Perfect match!',
    feedbackWrong: 'Hmm, Hootie is thinking... which picture starts with that sound? Try again!'
  }},
  { id: 'gc-jp-u1-sort', patch: {
    scenario: 'Bunny is putting her letters in teaching order for the garden party. Help her sort them from S to N!',
    speechText: 'Bunny wants to sort her letters in teaching order. Drag each letter to the right spot \u2014 s, a, t, i, p, n!',
    characters: [{ name: 'Bunny', emoji: '\uD83D\uDC30', personality: 'energetic' }],
    feedbackCorrect: 'Perfect order! Bunny claps her paws!',
    feedbackWrong: 'Hmm, which letter comes first? Think about the sounds and try again!'
  }},

  // ═══ PHONICS: Unit 2 (c, k, e, h, r, m, d) ═══
  { id: 'gc-jp-u2-tap', patch: {
    scenario: 'Bunny is hopping to sounds she knows! She found new sounds and needs your ears to help her hop to the right letter.',
    speechText: 'Bunny is hopping to sounds! She will say a sound. Listen carefully, then tap the right letter to help Bunny hop!',
    characters: [{ name: 'Bunny', emoji: '\uD83D\uDC30', personality: 'energetic' }],
    feedbackCorrect: 'Hop hop! Bunny jumped to the right sound!',
    feedbackWrong: 'Oops! Bunny hopped the wrong way. Listen again and try!'
  }},
  { id: 'gc-jp-u2-match', patch: {
    scenario: 'Bunny is matching sounds to pictures at her garden party! Help her put the right sound with the right picture.',
    speechText: 'Bunny is having a garden party! She needs to match each sound to its picture. Tap a letter, then tap its picture!',
    characters: [{ name: 'Bunny', emoji: '\uD83D\uDC30', personality: 'energetic' }],
    feedbackCorrect: 'Hip hip hooray! Bunny loves that match!',
    feedbackWrong: 'Not this one! Which picture starts with that sound? Help Bunny find it!'
  }},
  { id: 'gc-jp-u2-sort', patch: {
    scenario: 'Bunny is putting her picture cards in ABC order for the garden party. Help her sort them from Cat to Rain!',
    speechText: 'Bunny wants to sort her picture cards in ABC order. Drag each card to the right spot \u2014 Cat, Dog, Egg, Hat, Moon, Rain!',
    characters: [{ name: 'Bunny', emoji: '\uD83D\uDC30', personality: 'energetic' }],
    feedbackCorrect: 'Perfect order! Bunny claps her paws!',
    feedbackWrong: 'Hmm, which animal comes first in the alphabet? Try again!'
  }},

  // ═══ PHONICS: Unit 3 (g, o, u, l, f, b) ═══
  { id: 'gc-jp-u3-tap', patch: {
    scenario: 'Bear is exploring the jungle and finds pictures everywhere! He needs your help to find the one that starts with his sound.',
    speechText: 'Bear is in the jungle! He will say a sound. Listen, then tap the picture that starts with that sound. Help Bear find it!',
    characters: [{ name: 'Bear', emoji: '\uD83D\uDC3B', personality: 'brave' }],
    feedbackCorrect: 'GRRREAT! Bear found the right one!',
    feedbackWrong: 'Bear looks again... which picture starts with that sound? Try once more!'
  }},
  { id: 'gc-jp-u3-sort', patch: {
    scenario: 'Bear is sorting his jungle picture cards from G to B. Help him put Goat, Orange, Umbrella, Lion, Frog and Ball in order!',
    speechText: 'Bear is sorting his jungle cards! Drag each picture card to put them in the right order \u2014 from Goat to Ball. Can you help Bear?',
    characters: [{ name: 'Bear', emoji: '\uD83D\uDC3B', personality: 'brave' }],
    feedbackCorrect: 'Amazing! Bear roars with joy!',
    feedbackWrong: 'Hmm, which one comes first? Think about the sounds and try again!'
  }},
  { id: 'gc-jp-u3-quiz', patch: {
    scenario: 'Leo and Zara are exploring the zoo! Each animal hides a special sound. Can you find which animal starts with the right sound?',
    speechText: 'Leo and Zara are at the zoo! Each animal hides a sound. Listen to the clue, then tap the animal that matches!',
    characters: [
      { name: 'Leo', emoji: '\uD83E\uDD81', personality: 'friendly' },
      { name: 'Zara', emoji: '\uD83D\uDC76', personality: 'curious' }
    ],
    feedbackCorrect: 'Roar! You found the right animal!',
    feedbackWrong: 'Not quite! Listen to the sound clue and try again!'
  }},

  // ═══ PHONICS: Unit 4 (ai, j, oa, ie, ee, or) ═══
  { id: 'gc-jp-u4-fib', patch: {
    scenario: 'Whiskers the cat is learning kind words that start with ch and sh sounds! Help her finish each kind sentence.',
    speechText: 'Whiskers the cat loves kind words! She needs your help to finish her sentences. Listen, then pick the right word from the word bank!',
    characters: [{ name: 'Whiskers', emoji: '\uD83D\uDC31', personality: 'gentle' }],
    feedbackCorrect: 'Purrrfect! Whiskers is so pleased!',
    feedbackWrong: 'Hmm, listen to the hint again. Which word has the ch or sh sound? Try once more!'
  }},
  { id: 'gc-jp-u4-quiz-aff', patch: {
    scenario: 'Whiskers the cat is playing a kindness game! She wants to know what a truly kind friend does. Help her choose the right answer!',
    speechText: 'Whiskers the cat is playing a kindness game! Listen to the question, then tap what a kind friend would do!',
    characters: [{ name: 'Whiskers', emoji: '\uD83D\uDC31', personality: 'gentle' }],
    feedbackCorrect: 'Purrrfect kindness! Whiskers is so proud of you!',
    feedbackWrong: 'Whiskers shakes her head gently... a kind friend would choose differently. Try again!'
  }},
  { id: 'gc-jp-u4-sort-chsh', patch: {
    scenario: 'Whiskers is sorting her magic word cards into two piles \u2014 words with ch and words with sh! Help her put each card in the right pile.',
    speechText: 'Whiskers has two piles \u2014 one for ch words and one for sh words! Drag each card to the right pile. Can you help?',
    characters: [{ name: 'Whiskers', emoji: '\uD83D\uDC31', personality: 'gentle' }],
    feedbackCorrect: 'Purrrfect sorting! Whiskers is delighted!',
    feedbackWrong: 'Hmm, does that word start with ch or sh? Listen to the sound and try again!'
  }},

  // ═══ PHONICS: Unit 5 (z, w, ng, v, oo) ═══
  { id: 'gc-jp-u5-quiz-riddle', patch: {
    scenario: 'Hootie the owl has written riddles for all his friends! Each riddle hides a special sound. Read the riddle carefully and tap the right answer!',
    speechText: 'Hootie the wise owl has riddles for you! Listen carefully to each riddle \u2014 the answer has a special sound hiding inside. Can you find it?',
    characters: [{ name: 'Hootie', emoji: '\uD83E\uDD89', personality: 'wise' }],
    feedbackCorrect: 'Hoot hoot! You cracked the riddle!',
    feedbackWrong: 'Hootie tilts his head... think about the sound clue in the riddle. Try again!'
  }},
  { id: 'gc-jp-u5-fib', patch: {
    scenario: 'Foxy is writing in her diary but she forgot some letters! Help her fill in the missing sounds to complete each sentence.',
    speechText: 'Foxy is writing in her diary! Some letters are missing. Listen to the hint, then drag the right sound into the gap to complete Foxy\'s sentence!',
    characters: [{ name: 'Foxy', emoji: '\uD83E\uDD8A', personality: 'curious' }],
    feedbackCorrect: 'Foxy does a happy spin! You filled it perfectly!',
    feedbackWrong: 'Foxy peeks at her hint... listen to the sound clue and try again!'
  }},
  { id: 'gc-jp-u5-sort-patterns', patch: {
    scenario: 'Foxy is sorting her magical pattern cards! Each card has a sound pattern. Help her drag them into the right order.',
    speechText: 'Foxy has magical pattern cards! Drag each one to put them in the right order. Listen to the sounds and match the patterns!',
    characters: [{ name: 'Foxy', emoji: '\uD83E\uDD8A', personality: 'curious' }],
    feedbackCorrect: 'Foxy wagged her tail! Perfect pattern!',
    feedbackWrong: 'Hmm, listen to the sound pattern again. Which card comes next?'
  }},

  // ═══ PHONICS: Unit 8 (blending) ═══
  { id: 'gc-jp-u8-tap', patch: {
    scenario: 'Zara is practicing blending sounds into words! She mixes three sounds together. Can you tap the word she makes?',
    speechText: 'Zara is blending sounds! She will say three sounds slowly. Listen, then tap the word those sounds make!',
    characters: [{ name: 'Zara', emoji: '\uD83D\uDC67\uD83C\uDFFE', personality: 'brave' }],
    feedbackCorrect: 'Amazing! You blended the sounds into a word!',
    feedbackWrong: 'Almost! Try saying each sound slowly \u2014 then put them together!'
  }},
  { id: 'gc-jp-u8-match', patch: {
    scenario: 'Zara wants to match each blended word to its picture. Can you help her find the right pairs?',
    speechText: 'Zara has word cards and picture cards! Match each word to its picture. Tap a word, then tap the picture it matches!',
    characters: [{ name: 'Zara', emoji: '\uD83D\uDC67\uD83C\uDFFE', personality: 'brave' }],
    feedbackCorrect: 'Great job! You matched the word perfectly!',
    feedbackWrong: 'Not this one! Sound out the word slowly and try again!'
  }},
  { id: 'gc-jp-u8-fib', patch: {
    scenario: 'Zara is filling in the missing sounds in her word puzzles! Help her complete each word by dragging the right letters into the blanks.',
    speechText: 'Zara has word puzzles with missing sounds! Drag the right letters into the blanks to complete each word!',
    characters: [{ name: 'Zara', emoji: '\uD83D\uDC67\uD83C\uDFFE', personality: 'brave' }],
    feedbackCorrect: 'Brilliant! Zara can read the word now!',
    feedbackWrong: 'Hmm, sound out the word. Which letters are missing?'
  }},

  // ═══ PHONICS: Unit 9 (tricky words) ═══
  { id: 'gc-jp-u9-tap', patch: {
    scenario: 'Maya is learning tricky words that break the rules! These special words need to be remembered, not sounded out. Can you tap the right one?',
    speechText: 'Maya is learning tricky words! These words break the rules \u2014 you have to remember them. Listen, then tap the word Maya says!',
    characters: [{ name: 'Maya', emoji: '\uD83D\uDC69\uD83C\uDFFD', personality: 'cheerful' }],
    feedbackCorrect: 'You remembered the tricky word! Maya is proud!',
    feedbackWrong: 'Tricky words are hard! Remember, you can\'t sound them out. Try again!'
  }},
  { id: 'gc-jp-u9-match', patch: {
    scenario: 'Maya wants to match each tricky word to its picture sentence. Can you help her find the right pairs?',
    speechText: 'Maya has tricky word cards and sentence pictures! Match each word to the picture that shows it. Tap a word, then tap its picture!',
    characters: [{ name: 'Maya', emoji: '\uD83D\uDC69\uD83C\uDFFD', personality: 'cheerful' }],
    feedbackCorrect: 'Wonderful! You know your tricky words!',
    feedbackWrong: 'Not quite! Read the word carefully and think about what it means!'
  }},
  { id: 'gc-jp-u9-quiz', patch: {
    scenario: 'Maya is taking a tricky word quiz! She needs to pick the right word to complete each sentence. Can you help her choose?',
    speechText: 'Maya needs help with her tricky word quiz! Read each sentence, then tap the word that fits best!',
    characters: [{ name: 'Maya', emoji: '\uD83D\uDC69\uD83C\uDFFD', personality: 'cheerful' }],
    feedbackCorrect: 'You are a tricky word champion!',
    feedbackWrong: 'Hmm, read the sentence again. Which tricky word fits?'
  }},

  // ═══ PHONICS: Unit 10 (review) ═══
  { id: 'gc-jp-u10-tap', patch: {
    scenario: 'Tobi is reviewing all his Group 1 sounds! He wants to make sure he remembers them all. Can you tap the right sound?',
    speechText: 'Tobi is reviewing his sounds! He will say a sound. Listen carefully, then tap the letter that makes that sound!',
    characters: [{ name: 'Tobi', emoji: '\uD83E\uDDD2\uD83C\uDFFE', personality: 'curious' }],
    feedbackCorrect: 'Tobi gives you a high five! You know your sounds!',
    feedbackWrong: 'Tobi says: listen again! Which letter makes that sound?'
  }},
  { id: 'gc-jp-u10-match', patch: {
    scenario: 'Tobi is matching all his Group 1 sounds to pictures one last time! Can you help him find every pair?',
    speechText: 'Tobi wants to match each sound to its picture. Tap a sound, then tap its matching picture!',
    characters: [{ name: 'Tobi', emoji: '\uD83E\uDDD2\uD83C\uDFFE', personality: 'curious' }],
    feedbackCorrect: 'All matched! Tobi is a sound expert!',
    feedbackWrong: 'Not quite! Which picture starts with that sound?'
  }},
  { id: 'gc-jp-u10-quiz', patch: {
    scenario: 'Tobi is taking his Group 1 sound quiz! He needs to show what he has learned. Can you help him answer each question?',
    speechText: 'Tobi is taking his sound quiz! Listen to each question, then tap the right answer. You can do it!',
    characters: [{ name: 'Tobi', emoji: '\uD83E\uDDD2\uD83C\uDFFE', personality: 'curious' }],
    feedbackCorrect: 'Tobi cheers! You passed the quiz!',
    feedbackWrong: 'Tobi says: think carefully! You almost had it!'
  }},
  { id: 'gc-jp-u10-sort', patch: {
    scenario: 'Tobi is putting all his Group 1 letters in teaching order one more time. Help him sort them from S to D!',
    speechText: 'Tobi wants to sort his letters in teaching order. Drag each letter to the right spot!',
    characters: [{ name: 'Tobi', emoji: '\uD83E\uDDD2\uD83C\uDFFE', personality: 'curious' }],
    feedbackCorrect: 'Perfect order! Tobi knows all his letters!',
    feedbackWrong: 'Hmm, which letter comes first? Think about the teaching order!'
  }},

  // ═══ PHONICS: Group 4 ═══
  { id: 'gc-jp-g4-tap', patch: {
    scenario: 'Zara is exploring the rainforest! She hears new digraph sounds everywhere. Can you tap the right one when she says it?',
    speechText: 'Zara is in the rainforest! She hears special two-letter sounds. Listen carefully, then tap the right one!',
    characters: [{ name: 'Zara', emoji: '\uD83D\uDC67\uD83C\uDFFE', personality: 'brave' }],
    feedbackCorrect: 'Amazing! You found the right sound!',
    feedbackWrong: 'Listen again! Which two letters make that sound?'
  }},
  { id: 'gc-jp-g4-match', patch: {
    scenario: 'Zara is matching her rainforest digraph sounds to pictures! Can you help her find each pair?',
    speechText: 'Zara has digraph cards and picture cards! Match each sound to its picture. Tap a sound, then tap its picture!',
    characters: [{ name: 'Zara', emoji: '\uD83D\uDC67\uD83C\uDFFE', personality: 'brave' }],
    feedbackCorrect: 'Splash! Perfect match in the rainforest!',
    feedbackWrong: 'Not quite! Which picture starts with that digraph sound?'
  }},
  { id: 'gc-jp-g4-quiz', patch: {
    scenario: 'Zara is quizzing her friends on Group 4 digraphs! Each question asks about a special two-letter sound. Can you answer them all?',
    speechText: 'Zara has digraph quiz questions! Listen to each one, then tap the right answer. Show what you know!',
    characters: [{ name: 'Zara', emoji: '\uD83D\uDC67\uD83C\uDFFE', personality: 'brave' }],
    feedbackCorrect: 'Fantastic! You know your digraphs!',
    feedbackWrong: 'Hmm, think about which two letters make that sound together!'
  }},

  // ═══ PHONICS: Group 5 ═══
  { id: 'gc-jp-g5-tap', patch: {
    scenario: 'Maya is playing a letter game with new sounds! She found z, w, ng, v, and oo. Can you tap the right one?',
    speechText: 'Maya found new sounds! Listen carefully, then tap the letter or letters she says!',
    characters: [{ name: 'Maya', emoji: '\uD83D\uDC69\uD83C\uDFFD', personality: 'cheerful' }],
    feedbackCorrect: 'You found it! Maya is so happy!',
    feedbackWrong: 'Listen again! Maya will say it one more time!'
  }},
  { id: 'gc-jp-g5-match', patch: {
    scenario: 'Maya wants to match each Group 5 sound to its picture. Can you help her find the right pairs?',
    speechText: 'Maya has new sound cards! Match each one to its picture. Tap a sound, then tap its picture!',
    characters: [{ name: 'Maya', emoji: '\uD83D\uDC69\uD83C\uDFFD', personality: 'cheerful' }],
    feedbackCorrect: 'Buzz buzz! Perfect match!',
    feedbackWrong: 'Not this one! Which picture starts with that sound?'
  }},
  { id: 'gc-jp-g5-fib', patch: {
    scenario: 'Maya is filling in the missing sounds in her sentences! Help her drag the right letters into the blanks.',
    speechText: 'Maya needs help! Her sentences are missing sounds. Drag the right letters into the blanks to complete each one!',
    characters: [{ name: 'Maya', emoji: '\uD83D\uDC69\uD83C\uDFFD', personality: 'cheerful' }],
    feedbackCorrect: 'Wonderful! Maya can read her sentences now!',
    feedbackWrong: 'Hmm, listen to the hint. Which sound is missing?'
  }},

  // ═══ PHONICS: Group 6 ═══
  { id: 'gc-jp-g6-tap', patch: {
    scenario: 'Tobi is learning his last set of sounds! He found y, x, ch, sh, th, and qu. Can you tap the right one?',
    speechText: 'Tobi found more sounds! Listen carefully, then tap the letter or letters he says!',
    characters: [{ name: 'Tobi', emoji: '\uD83E\uDDD2\uD83C\uDFFE', personality: 'curious' }],
    feedbackCorrect: 'Tobi gives you a thumbs up! You found it!',
    feedbackWrong: 'Listen again! Tobi will say it one more time!'
  }},
  { id: 'gc-jp-g6-match', patch: {
    scenario: 'Tobi is matching his Group 6 sounds to pictures! Can you help him find every pair?',
    speechText: 'Tobi has sound cards and picture cards! Match each sound to its picture. Tap a sound, then tap its picture!',
    characters: [{ name: 'Tobi', emoji: '\uD83E\uDDD2\uD83C\uDFFE', personality: 'curious' }],
    feedbackCorrect: 'Brilliant! All sounds matched!',
    feedbackWrong: 'Not quite! Which picture starts with that sound?'
  }},
  { id: 'gc-jp-g6-quiz', patch: {
    scenario: 'Tobi is quizzing himself on Group 6 sounds! Each question asks about a tricky sound. Can you help him answer?',
    speechText: 'Tobi has quiz questions about his last set of sounds! Listen to each one, then tap the right answer!',
    characters: [{ name: 'Tobi', emoji: '\uD83E\uDDD2\uD83C\uDFFE', personality: 'curious' }],
    feedbackCorrect: 'Tobi cheers! You know all the sounds!',
    feedbackWrong: 'Hmm, think about how that sound is made. Try again!'
  }},

  // ═══ NAMED GAMES ═══
  { id: 'c7ab3462-7af5-4bf2-b579-30bf568ae716', patch: {
    scenario: 'Amara the counting bee is flying along a number train, but some carriages have lost their numbers! Can you help her fill them in?',
    speechText: 'Amara the counting bee needs your help! Some numbers on her train are missing. Listen carefully and tap the right number!',
    characters: [{ name: 'Amara', emoji: '\uD83D\uDC1D', personality: 'cheerful' }],
    feedbackCorrect: 'Buzz buzz! That is right! The train can move now!',
    feedbackWrong: 'Hmm, not quite! Count along with Amara \u2014 one, two, three...'
  }},
  { id: 'b700c24f-8a6a-4cad-b8cb-b4babebcb2b0', patch: {
    scenario: 'Fatima is lining up her toy animals for a parade! She mixed up the numbers. Help her put them back in order from one to five!',
    speechText: 'Fatima is having a toy parade! But she mixed up the numbers. Can you drag them and put them in order? One first, then two, three, four, five!',
    characters: [{ name: 'Fatima', emoji: '\uD83D\uDC67\uD83C\uDFFD', personality: 'playful' }],
    feedbackCorrect: 'Hooray! The parade is ready!',
    feedbackWrong: 'Not quite! Put the smallest number first. Which one is number one?',
    context: 'Drag the numbers to line up the parade: one, two, three, four, five!'
  }},
  { id: '86d6a45a-27b6-45d3-8c33-49cf3040709c', patch: {
    scenario: 'Auntie Ngozi is at her farm gate. Some animals ran away from the forest! Help her sort them \u2014 farm animals go back to the farm, forest animals go back to the forest.',
    speechText: 'Auntie Ngozi needs your help! Some animals got mixed up. Drag each animal to where it belongs \u2014 farm or forest!',
    characters: [{ name: 'Auntie Ngozi', emoji: '\uD83D\uDC69\uD83C\uDFFB\u200D\uD83C\uDF3E', personality: 'kind' }],
    feedbackCorrect: 'Ehh! Thank you! Auntie Ngozi is smiling!',
    feedbackWrong: 'Hmm, does that animal belong on a farm or in a forest? Think again!'
  }},
];

async function run() {
  const DBS = ['elite_content_test', 'elite_content'];
  let totalOk = 0;

  for (const DB of DBS) {
    console.log(`\n\u2550\u2550\u2550 Fixing ${DB} \u2550\u2550\u2550`);
    const conn = await mysql.createConnection({
      host: '127.0.0.1', user: 'elite', password: 'SMS2026Elite',
      database: DB, charset: 'utf8mb4'
    });
    let ok = 0;

    for (const { id, patch } of UPDATES) {
      const [rows] = await conn.execute(
        'SELECT config_json FROM kids_game_configs WHERE id=?', [id]
      );
      if (!rows.length) continue;

      const cfg = typeof rows[0].config_json === 'string'
        ? JSON.parse(rows[0].config_json)
        : rows[0].config_json;

      for (const [k, v] of Object.entries(patch)) {
        cfg[k] = v;
      }

      await conn.execute(
        'UPDATE kids_game_configs SET config_json=CAST(? AS JSON), updatedAt=NOW() WHERE id=?',
        [JSON.stringify(cfg), id]
      );
      ok++;
    }

    await conn.end();
    console.log(`  Updated: ${ok}`);
    totalOk += ok;
  }

  console.log(`\n\u2550\u2550\u2550 TOTAL: Updated ${totalOk} \u2550\u2550\u2550`);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
