# PHONIX — Phonics-Aware Speech Engine (design)

**Problem.** The Web Speech TTS reads phonics content as alphabet NAMES:
`/sh/` → "ess aitch", `s h` → "ess aych", isolated digraphs → letter names.
Jolly Phonics teaches SOUNDS ("shh", "sss") — hearing "S.H." is actively wrong
for early readers.

**Existing partial fix.** `sound.ts` had `PHONICS_SOUND_MAP` +
`toPhonicsSound()`, but it only fired via `speakLabel()` for 1–2 char labels
in `category === 'Letters'` games. Prompts like "Tap the letter I say: /sh/"
and labels like "s h" bypassed it entirely.

**Design — central phoneme pipeline inside `speak()`.**

1. `phonix.ts` (new, pure + testable) exports:
   - `PHONEME_MAP` — grapheme → TTS-friendly pronunciation ("sh"→"shh",
     "th"→"thh", "ch"→"chuh", "ai"→"ay", "oo"→"ooh", "ng"→"nng", …).
     Longest-match-first tokenizer so "sh" wins over "s"+"h".
   - `phonixTokenize(text)` — split into word/phoneme/grapheme tokens.
   - `phonixToSpeech(text)` — full-text transform:
     * `/x/` slash notation → sound ("Tap /sh/" → "Tap shh")
     * split graphemes ("s h", "S-H", "c a t" in phonics contexts) →
       joined sounds ("sss hhh", "cuh aah tuh")
     * plain words are left untouched (normal sentences must keep reading
       naturally — we do NOT respell ordinary text)
   - `isPhonicsNotation(text)` — heuristic: has /x/ tokens, or is a
     space/hyphen-separated 1–2 letter grapheme sequence.
2. `sound.ts:speak()` pipes ALL text through `phonixToSpeech()` after emoji
   stripping, before SpeechSynthesisUtterance — one choke point, every
   caller benefits (games, onboarding, LabelDiagram, speech lessons).
3. Rate: phonics segments play at the user rate; `speakPhonicsSound()`
   keeps its slower 0.72 rate for drills.
4. NOT done here (future): true IPA/audio-bank phonemes. Web Speech has no
   phoneme API; respelling ("shh") is the pragmatic approximation. If quality
   is insufficient later, swap phonixToSpeech for a recorded-audio bank —
   the call sites won't change.

**Tests.** `phonix.test.ts`: slash notation, split graphemes, digraph
precedence over single letters, plain-word passthrough, mixed sentences,
idempotency (no double-transform on already-respelled text).
