# FB-16 — Emoji usage policy (supervisor directive, 2026-08-23)

## Rule
Emoji can and should NOT replace text or real images. It is a **partial
demonstration aid** permitted only where sourcing a real image is difficult.
This is a standing RECOMMENDATION to teachers and dev teams — not a hard
system block.

## Why
TTS reads glyph names ("🐱" → "cat face"), teaching kids wrong labels
("Cat cat face"). Visually, an emoji cartoon hides the innocent feature and
nature of the real thing (a real cat vs a cat-face glyph).

## Implementation status
- FIXED (code): frontend/src/lib/utils/sound.ts — central speak() now strips
  emoji pictographs before SpeechSynthesis; silent skip when nothing textual
  remains. All speakItem/speakScene/speakAnimal/etc. inherit the fix.
- RECOMMENDED (content): authors should attach real photo/image URLs to game
  items wherever possible; keep emoji strictly last-resort fallback in the
  ItemIcon chain (image → emoji → color → text).
- PENDING (validator): add a NON-BLOCKING GameCreator advisory warning when
  items ship emoji-only visuals (needs GameCreator.tsx recon round).

Refs: STANDING-CONSTRAINTS.md C7 roster; FB-12 numeric-speech fix (answer.ts).
