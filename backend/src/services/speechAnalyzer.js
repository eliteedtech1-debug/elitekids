'use strict';
/**
 * Q2 2027 — Speech Analyzer (Voice-First Learning, roadmap §2.5 / W1-3).
 *
 * Scores a child's spoken attempt against the expected text. The client
 * captures audio via the Web Speech API (roadmap: client-side STT is the
 * primary path, <500ms) and sends the TRANSCRIPT here for server-side
 * scoring + logging — so low-end devices without Web Speech can fall back
 * to typing, and all attempts are recorded for the portfolio (Q2-E).
 *
 * Pure module (no I/O) so it is unit-testable without a DB, mirroring the
 * Q1 economyService convention.
 *
 * Scoring model (kid-friendly, phonics-aware):
 *  - wordAccuracy  — fraction of expected words recognised
 *  - letterAccuracy — fraction of expected letters present (for letter drills)
 *  - fluency       — pace score from duration vs expected reading time
 *  - overall       — weighted 0..100
 */

/** Normalise for comparison: lowercase, strip punctuation/diacritics, collapse spaces. */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein similarity 0..1 between two words (tolerates kid near-misses). */
function wordSimilarity(a, b) {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/**
 * Score a speech attempt.
 * @param {object} p
 * @param {string} p.expectedText   what the child was asked to say
 * @param {string} p.transcript     what the recogniser heard
 * @param {number} [p.durationMs]   how long the attempt took (fluency)
 * @param {string} [p.mode]        'letter' | 'word' | 'sentence'
 * @returns {{overall:number, wordAccuracy:number, letterAccuracy:number, fluency:number,
 *              wordMatches:Array, heardWordCount:number, expectedWordCount:number}}
 */
function scoreAttempt({ expectedText, transcript, durationMs = 0, mode = 'word' }) {
  const expected = normalize(expectedText);
  const heard = normalize(transcript);
  const expectedWords = expected ? expected.split(' ') : [];
  const heardWords = heard ? heard.split(' ') : [];

  // ── Word accuracy: greedy best-match per expected word (similarity ≥ 0.6 counts)
  const SIM_THRESHOLD = 0.6;
  const usedHeard = new Set();
  let matchedScore = 0;
  const wordMatches = expectedWords.map((ew) => {
    let bestIdx = -1;
    let bestSim = 0;
    heardWords.forEach((hw, idx) => {
      if (usedHeard.has(idx)) return;
      const sim = wordSimilarity(ew, hw);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = idx;
      }
    });
    const hit = bestSim >= SIM_THRESHOLD;
    if (hit && bestIdx >= 0) usedHeard.add(bestIdx);
    matchedScore += hit ? bestSim : 0;
    return { expected: ew, heard: hit ? heardWords[bestIdx] : null, similarity: Number(bestSim.toFixed(2)), hit };
  });
  const wordAccuracy = expectedWords.length ? matchedScore / expectedWords.length : 0;

  // ── Letter accuracy (letter drills + partial credit for words)
  const expectedLetters = expected.replace(/\s/g, '').split('');
  const heardLetters = heard.replace(/\s/g, '').split('');
  const pool = {};
  heardLetters.forEach((c) => { pool[c] = (pool[c] || 0) + 1; });
  let letterHits = 0;
  expectedLetters.forEach((c) => {
    if (pool[c] > 0) { pool[c] -= 1; letterHits += 1; }
  });
  const letterAccuracy = expectedLetters.length ? letterHits / expectedLetters.length : 0;

  // ── Fluency: expected pace ≈ 400ms per short unit (letter/word), 300ms per word
  // for sentences. 1.0 at ideal pace, decaying both for too-fast (guessing) and slow.
  const unitMs = mode === 'sentence' ? 300 : 400;
  const idealMs = Math.max(unitMs * Math.max(1, expectedWords.length || expectedLetters.length), 600);
  let fluency = 1;
  if (durationMs > 0) {
    const ratio = durationMs / idealMs;
    fluency = ratio >= 1 ? Math.max(0.4, 1 - (ratio - 1) * 0.3) : Math.max(0.4, ratio);
  }

  const weights = mode === 'letter'
    ? { letters: 0.6, words: 0.1, fluency: 0.3 }
    : mode === 'sentence'
      ? { letters: 0.15, words: 0.6, fluency: 0.25 }
      : { letters: 0.3, words: 0.5, fluency: 0.2 };

  const overall = Math.round(
    100 * (weights.letters * letterAccuracy + weights.words * wordAccuracy + weights.fluency * fluency),
  );

  return {
    overall: Math.max(0, Math.min(100, overall)),
    wordAccuracy: Number(wordAccuracy.toFixed(2)),
    letterAccuracy: Number(letterAccuracy.toFixed(2)),
    fluency: Number(fluency.toFixed(2)),
    wordMatches,
    heardWordCount: heardWords.length,
    expectedWordCount: expectedWords.length,
  };
}

/** Kid-facing feedback band. */
function feedbackBand(overall) {
  if (overall >= 85) return { band: 'amazing', message: 'Perfect! Your voice is crystal clear! 🌟' };
  if (overall >= 65) return { band: 'good', message: 'Great job! Almost perfect — try once more! 💪' };
  if (overall >= 40) return { band: 'getting_there', message: 'Good try! Listen again and say it slowly. 🌱' };
  return { band: 'try_again', message: 'Nice effort! Let’s listen together and try again. 💛' };
}

module.exports = { normalize, wordSimilarity, scoreAttempt, feedbackBand };
