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

---

# Full-English Coverage + Synthesis Roadmap (Sept 2026)

## Coverage now (all English phonics, not just /sh/)

`PHONEME_MAP` covers the full teaching inventory:

- **Single letters** — all 26 (consonants with schwa: s→"sss", p→"puh";
  short vowels: a→"aah", e→"eh", i→"ih", o→"oh", u→"uh").
- **Digraphs/vowel teams** — sh ch th ng ph wh ck qu ai oa ie ee oo ou oi
  ue ui ea ay ow aw ew oe au ae (+ r-controlled ar er ir ur).
- **Trigraphs** — igh→"eye", tch→"chuh", dge→"juh", air, ear, ure.
- **Magic-e / split digraphs** — a_e→"ay", i_e→"eye", o_e→"oh", u_e→"yoo",
  e_e→"ee"; split runs merge ("i e"→"ie"→"eye").
- **Slash notation** up to 4 letters: /sh/, /igh/, /tch/ …
- **Oral segmentation** — `phonixSegment("ship")` → "shh ih puh";
  `phonixSegmentToSpeech("ship")` → "shh … ih … puh" for sound games.
- **Safety** — a run transforms only when EVERY token is a phoneme key;
  real-word guards (or/air/are/ear/our/ace/ice); lone "q" untouched
  (English q appears only as "qu"); ordinary sentences never respelled.
- Tests: 22/22 in `phonix.test.ts`.

## Internet research (2026-09): better synthesis options

**Web Speech API — no SSML/phoneme control.** The SSML `<phoneme>` tag
(IPA/X-SAMPA) is supported only by cloud TTS (Google Cloud TTS, Azure).
Browsers expose no phoneme API — respelling ("shh") is the *correct*
browser-native technique, and what Phonix does. Conclusion: keep Phonix as
the universal floor; it costs 0 bytes and works offline everywhere.

**In-browser neural TTS (real upgrade path):**

| Engine | Quality | Size | Runs on | Notes |
|--------|---------|------|---------|-------|
| Web Speech (current) | OS-dependent, robotic on stock Windows | 0 B | everything | No audio capture possible (spec) |
| **Piper (vits-web, WASM)** | Neural, "2021 Assistant" | 30–60 MB/voice + ~10 MB WASM | CPU only — all devices incl. tablets | Works offline after first load; needs Web Worker |
| **Kokoro-82M (kokoro-js, WebGPU)** | Near-human audiobook | ~86 MB (q8) / 326 MB (fp32) | Desktop Chrome/Edge/Brave only; OOMs on mobile | WebGPU flag on FF/Safari still rolling |
| Supertonic HD | HD neural | — | — | Seen in tts.rocks stack |

Benchmarks (M2 Air, Chrome 134): Piper warm TTFA ~250 ms, Kokoro warm
~600 ms, Web Speech ~50 ms. Kokoro RAM ~340 MB → hidden on mobile by
shippers. `kokoro-js` API: `KokoroTTS.from_pretrained("onnx-community/
Kokoro-82M-ONNX", { dtype: "q8" })` → `tts.generate(text, { voice:
"af_heart" })` → WAV blob. Sources: quick-tts.com comparison (May 2026),
@Xenova Kokoro-js announcement (HF).

## Recommended architecture: layered engine

1. **Layer 0 (shipped): Web Speech + Phonix** — universal floor. Phonix
   respelling stays the phoneme-control mechanism for all devices.
2. **Layer 1 (recommended next): Piper WASM in a Web Worker** — one
   en_GB/en_US voice (~40 MB) cached after first load; real neural audio
   for tablets/rural devices (no GPU needed). Feed it the SAME Phonix
   respelled text — it has no phoneme input either, so respelling benefits
   both layers. Decision: pick if/when parents complain about robotic
   voices on cheap Android tablets (our demographic).
3. **Layer 2 (desktop only): Kokoro-82M WebGPU** — optional "HD voice"
   toggle in SpeechSettings; graceful fallback to Layer 1/0. Ship only
   behind a feature flag; lazy `import('kokoro-js')` so the 86 MB never
   loads unless requested.
4. **Golden path (best possible phonics audio, any device): recorded
   phoneme bank** — 44 IPA phonemes as short OGG/MP3 files (~2 s each,
   < 500 KB total), recorded by an ECCE teacher. `phonixSegment()` already
   outputs the phoneme sequence; play files in sequence with Web Audio for
   gaps. Zero model download, perfect sounds, works on every device — this
   is the standard approach used by phonics apps (Jolly Phonics, Teach
   Your Monster to Read). Recommended BEFORE Layers 1–2 for the phonics
   drill use-case specifically.

## Decision (for now)

Keep Layer 0 as default (zero bytes, offline, every device). Phonix respell
quality is the pragmatic 90% win. Revisit this doc when: (a) voice-quality
complaints arrive, or (b) we budget the phoneme-audio recording session.
The Phonix API (`phonixToSpeech`, `phonixSegment`) is the stable seam — any
future engine slots in at `sound.ts:speak()` without touching call sites.
