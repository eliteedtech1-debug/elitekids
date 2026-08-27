# Quiz Experience Redesign Plan — Fun Educational Game for Children

## Goal
Transform the quiz experience from a boring worksheet/exam feel into an engaging game with characters, scenarios, varied interactions, voice reading (especially in test mode), and game rewards.

---

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `game-engine/schemas/quiz.schema.json` | Add scenario, character, hint, feedback, interaction_type fields |
| 2 | `backend/src/services/contentGeneratorService.js` | Rewrite quiz prompt to generate scenario-based questions |
| 3 | `frontend/src/pages/Student/GamePlay.tsx` | Rebuild `QuizGame` component (~lines 1292-1524) |
| 4 | `frontend/src/lib/utils/sound.ts` | Add game feedback sounds (celebration, hint, streak) |

---

## Step 1: Update Quiz Schema (`quiz.schema.json`)

Add optional fields to each question and the top-level config:

**Top-level additions:**
- `characters`: array of `{ name, emoji, personality }` — recurring characters
- `scenario`: string — the story context wrapping the quiz
- `scenarioEmoji`: string — visual scene indicator

**Per-question additions:**
- `scenario`: string — short story/situation text (replaces plain prompt)
- `characterName`: string — which character is speaking/involved
- `characterEmoji`: string — character visual
- `hint`: string — encouraging hint for wrong answers
- `speechText`: string — what to read aloud (TTS)
- `feedbackCorrect`: string — custom correct feedback
- `feedbackWrong`: string — custom wrong feedback

All new fields are optional for backward compatibility with existing configs.

## Step 2: Rewrite AI Quiz Prompt (`contentGeneratorService.js`)

Replace `quizPrompt()` with a scenario-driven generator:

**New prompt instructs the AI to:**
1. Create 3-5 recurring characters (child-friendly names + emojis)
2. Place each question in a mini-scenario (at school, playground, zoo, etc.)
3. Make questions conversational — something a character would say
4. Include hints, custom feedback, and speechText
5. Vary interaction context across questions (different settings, characters)

**Pipeline:**
```
Learning Objective → Age/Difficulty → Scenario → Character → Question → Hint → Feedback → Reward
```

## Step 3: Rebuild `QuizGame` Component

This is the biggest change. The current component (lines 1292-1524) shows:
- Plain text question
- 2x2 grid of text options
- Minimal feedback

**New design:**

### 3a. Character Introduction Phase
- When quiz starts, show a brief character + scenario card
- Character emoji appears with a speech bubble
- Text is read aloud via TTS

### 3b. Question Display
- Character name + emoji shown at top
- Scenario text in a speech-bubble style card
- The question appears as something the character is saying
- Large, colorful, child-friendly layout

### 3c. Answer Options
- Large touch targets with clear text
- Fun hover/press animations
- Stagger entrance animation

### 3d. Feedback System
- **Correct**: character jumps/celebrates, +10 XP shown, encouraging message, stars/coins animation, correct sound
- **Wrong**: gentle "thinking" reaction from character, hint appears, allow retry (practice mode), encouraging sound
- **Streak tracking**: show streak counter for consecutive correct answers

### 3e. Test Mode — Read Aloud
- In test mode, each question is automatically read aloud via TTS
- Character speech bubble appears while TTS plays
- SpeechText field used if available, falls back to scenario + prompt

### 3f. Learning Mode
- Auto-plays: speaks question, highlights correct answer, speaks answer
- Enhanced with character reactions

### 3g. Varied Rhythm
- Every 3rd question, show a mini-celebration or encouragement
- Character mood changes based on performance

## Step 4: Add Game Sound Effects (`sound.ts`)

- `playStreak()` — ascending chime for streak milestones (3, 5, 7 correct)
- `playHint()` — soft encouraging tone
- `playCelebration()` — brief confetti/celebration burst

## Backward Compatibility

- All new schema fields are optional
- Existing configs without scenario/character fields render with a fallback (plain prompt text)
- No changes to other game templates (matching, tap, drag, etc.)
- No database migrations required (config is JSON blob)

---

## Implementation Order

1. Update quiz schema (5 min)
2. Update AI quiz prompt (15 min)
3. Add new sound effects (5 min)
4. Rebuild QuizGame component (60 min)
5. Verify TTS in test mode works (5 min)
