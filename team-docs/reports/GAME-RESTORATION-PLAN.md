# EliteKids Game Restoration Plan

**Date:** 2026-09-17  
**Scope:** All 1,718 seeded games across all templates  
**Live URL tested:** `https://demo.elitekids.com.ng/student/game/fp-n1-tt-w01-digital?mode=learning`  
**Student:** Demo5 (David Emmanuel Johnson) — Nursery 1  

---

## Executive Summary

The EliteKids game engine is **structurally sound** — the frontend renderer, backend API, and game-mode logic all work correctly. The problem is **content quality**: every single one of the 1,718 games in the database was seeded with inline SVG placeholder images and nonsensical audio/text data. The game engine renders exactly what it receives, but what it receives is junk. A child tapping through the game sees identical blue cards with a 🎮 emoji, hears the same sentence repeated for every option, and has no way to identify the correct answer.

**The engine has structural bugs. The content is broken.**

Three critical behavioral issues compound the content problems:
1. **Learn mode doesn't auto-play** — TapGame has no auto-play useEffect (MatchingGame does)
2. **Student Home tab renders blank** — All four content sections can independently return null
3. **Test mode disappears** — The `hideTestTab` gate hides Test until practice is completed, but the transition is jarring and the first-load flash confuses children

---

## Part 1: What the Screen Shows vs. What the Code Assumes

### 1.1 The Option Cards (CRITICAL)

**What the screen shows:**  
Five cards in a 3+2 grid. Each card displays an identical inline SVG: a light blue rounded rectangle (#EAF3FF) with a 🎮 game controller emoji in the center and truncated text below (e.g., "🎮 tap — Tap, match, replay audio and reco..."). All five cards look nearly identical — a child cannot distinguish between them.

**What the code assumes:**  
The `TapGame` component (`GamePlay.tsx:926-988`) renders each option card using a priority chain:
```
image (CachedImg) → emoji (span) → hex color swatch (div) → text label ("?")
```
The code expects `item.image` to be a meaningful visual — a photo, illustration, or at minimum a distinct emoji. The `CachedImg` component (`CachedImg.tsx:14-75`) faithfully caches and renders whatever URL it receives, even if that URL is a data:image/svg placeholder.

**The gap:**  
The seeder (`flagshipAnnualPilotSeed.js:239-243`) generates all images via `fallbackImage(label, emoji)`:
```js
function fallbackImage(label, emoji) {
  const text = safeText(`${emoji} ${label}`.slice(0, 42));
  return `data:image/svg+xml,${encodeURIComponent(`<svg ...>
    <rect fill="#EAF3FF" />
    <text>${emoji}</text>          <!-- always 🎮 for "digital" subject -->
    <text>${text}</text>           <!-- truncated to 42 chars -->
  </svg>`)}`;
}
```
Every item in the "digital" subject gets the same 🎮 emoji because the seeder maps `subjectId === 'digital'` to `emoji = '🎮'` for all items. The text labels ("tap", "listen", "match", "retry", "stop") are truncated to fit the SVG and rendered at 20px font size inside a 320x200 SVG — unreadable at card display size.

**Impact:** The game is visually broken. A Nursery 1 child (age 3-4) cannot read truncated text on a small card. The identical 🎮 emoji on every card provides zero visual differentiation. The game is unplayable.

### 1.2 The "Play Answer" Button (CRITICAL)

**What the screen shows:**  
A purple "Play answer 🔊" button at the bottom of the game area. When tapped, it plays audio and highlights the correct card.

**What the code assumes:**  
The `playLearningAnswer` callback (`GamePlay.tsx:794-811`) calls:
```ts
await speakOrPlay(currentRound?.audio, stimulusText || speakLabel(...));
```
The `speakOrPlay` helper (`GamePlay.tsx:280-298`) first tries `new Audio(audioUrl).play()`, then falls back to TTS.

**The gap:**  
Each item's `audio` field contains:
```
"tap — Tap, match, replay audio and recognise gentle feedback without needing to read."
```
This is **plain text, not an audio URL**. When `speakOrPlay` tries `new Audio("tap — Tap, match...")`, the browser treats the string as a URL, fails to fetch it, and falls back to TTS — which reads the entire sentence aloud. The same sentence plays for every round because every item has nearly identical audio text.

**Impact:** The "Play Answer" button plays the same long sentence for every option. The child hears "Tap, match, replay audio and recognise gentle feedback without needing to read" five times in a row. This is not educational — it's confusing and tedious.

### 1.3 The Character "Tobi" (MINOR)

**What the screen shows:**  
A yellow face emoji (🧒) with the name "Tobi" and personality tag "curious" rendered above the question.

**What the code assumes:**  
Characters are defined in `config.characters[]` with `name`, `emoji`, and optional `image`. The renderer (`GamePlay.tsx:842-858`) uses: `image (CachedImg) → emoji (span) → initial letter (circle)`.

**The gap:**  
The seeder produces `characters: [{ name: "Tobi", emoji: "🧒", personality: "curious" }]` — no `image` field. The emoji fallback works correctly, but the character has no visual distinctiveness beyond the generic child emoji.

**Impact:** Minor. The emoji renders fine, but all games use the same "Tobi" character with no visual variety.

### 1.3b Learn Mode Doesn't Auto-Play (CRITICAL)

**What the screen shows:**  
The game loads in Learning mode. The scenario text appears. A "Play answer 🔊" button sits at the bottom. The child must manually tap this button to hear the answer and advance. Nothing happens automatically.

**What the code assumes:**  
The `MatchingGame` component (`GamePlay.tsx:457-485`) has a fully automated learning sequence:
```tsx
useEffect(() => {
  if (mode !== 'learning' || !current) return;
  // Stage 1: speak the pair (700ms)
  // Stage 2: highlight the correct match (2000ms)
  // Stage 3: play celebration (3300ms)
  // Stage 4: advance to next round (4300ms)
}, [mode, q]);
```
This auto-plays through all rounds without any user interaction.

**The gap:**  
`TapGame` (`GamePlay.tsx:656-1065`) has **no equivalent auto-play useEffect**. The comment at lines 789-790 explicitly states:
```tsx
// Learning mode: scenario auto-speaks via effect above.
// Answer does NOT auto-play — child taps "Play Answer" to hear it.
```
The only auto-behavior in TapGame learning mode is the scenario auto-speak on mount (lines 729-738). The child must manually tap "Play Answer" for each round. For a Nursery 1 child (age 3-4) who cannot read, this is a dead end — they see identical cards, don't know what to tap, and the "Play Answer" button is the only interactive element that works.

**Additionally:** Since the game data produces only 1 `tapRound` (single-round path at lines 682-692), tapping "Play Answer" once completes the entire game immediately (`currentIdx + 1 >= tapRounds.length` → `onComplete(0)`). The child never gets to see multiple rounds auto-play.

**Impact:** The learning mode — designed to be the "watch and learn" entry point for young children — requires manual interaction and ends after a single tap. This defeats its purpose entirely.

### 1.3c Student Home Tab Renders Blank (HIGH)

**What the screen shows:**  
The student logs in, sees the header ("Hello, David Emmanuel Johnson!"), a companion greeting from "Whiskers", a motivational banner ("Yay — you're back!"), a garden indicator (🌱 1 🌱), and then... nothing. The main content area shows "Loading games..." for 5+ seconds, then goes blank. No stats, no recent activity, no call-to-action, no game recommendations.

**What the code assumes:**  
`HomeTab.tsx` renders four sections, each independently conditional:

| Section | Visibility Condition | Can Be Null? |
|---------|---------------------|--------------|
| Welcome Card | `!isReturningStudent` (new students only) | Yes — hidden for returning students |
| Companion Bubble | `companion && !showOnboarding && !showCompanionSelect` | Yes — hidden if no companion |
| Streak Reminder | `playedToday === false` (shows only when child hasn't played today) | Yes — hidden if already played |
| Garden Preview | `elements.length > 0` (has garden plants) | Yes — hidden if garden is empty |

**The gap:**  
For a **returning student who has already played today, has no companion, and has an empty garden**, ALL FOUR sections produce null output:
1. Welcome Card → hidden (returning student)
2. Companion Bubble → hidden (`companion === null` or `showCompanionSelect === true`)
3. Streak Reminder → hidden (`playedToday === true`)
4. Garden Preview → hidden (`elements.length === 0`)

The code comment at lines 43-48 acknowledges this was a known problem:
```tsx
{/* First-time welcome — HOME must never be a blank screen for a brand-new
    student. (Opening the dashboard used to record a play day so the streak
    reminder stayed quiet; it does not any more...) An empty garden renders
    nothing, which previously left this tab blank until the child found PLAY. */}
```
The fix addressed new students, but returning students with the conditions above still get a completely blank tab.

**Impact:** The Home tab — the first thing a child sees — is empty. There are no stats, no progress indicators, no "continue where you left off" prompts, no game recommendations. The child must discover the Play tab on their own.

### 1.3d Test Mode Disappears (HIGH)

**What the screen shows:**  
On first load, all three mode tabs (Learn, Practice, Test) are visible. After 1-2 seconds (when the learning path API responds), the Test tab vanishes. The child sees only Learn and Practice. After completing Practice, the Test tab reappears.

**What the code assumes:**  
The `hideTestTab` variable (`GamePlay.tsx:4144-4151`) gates Test visibility:
```tsx
const hideTestTab = !isTeacher && !isPreview
  && (ownRequiresTest === false || (pathData !== null && ownLessonState === 'none'));
```
For a student: Test is hidden when `pathData` has loaded AND `ownLessonState === 'none'` (not yet practiced). This enforces the "practice before test" progression.

**The gap:**  
The problem is the **timing**:
1. **t=0**: Game loads. `pathData` is `null` (API not yet responded). `hideTestTab = false` → Test IS visible.
2. **t=1-2s**: Learning path API responds. `pathData` is set, `ownLessonState = 'none'`. `hideTestTab = true` → Test DISAPPEARS.
3. **After practice**: `ownLessonState = 'practice_done'`. `hideTestTab = false` → Test REAPPEARS.

This creates a jarring flash: the child sees Test, it disappears, then reappears later. For a Nursery 1 child, this is confusing — they may try to tap Test during the brief window, or wonder where it went.

**Additionally:** The `requiredAfterPractice: true` field in `gamePlan.test` is **never read by the frontend**. The frontend relies solely on the learning path's `ownLessonState` to determine progression. This means the gamePlan's intent (test required after practice) is only enforced indirectly through the path state, not through explicit UI gating.

**Impact:** The Test tab flickers in and out on first load. Children may be confused by the disappearing button. The intended progression (Learn → Practice → Test) is not clearly communicated in the UI.

### 1.3e Design Intent vs. Current Implementation: Mode Progression

**The intended design (per the user/owner):**

```
Learn (watch) → pass → Practice (play) → pass with good score → Test (assess)
```

Each mode unlocks the next. The child must complete Learn before Practice is offered, and Practice with sufficient accuracy before Test appears. This is a **sequential gate** — not a tab switcher.

**Current implementation issues:**

1. **Learn → Practice transition is broken**: Learn mode ends with a `LearningComplete` screen that says "Watch Again" or "Back to Games" — but does NOT prominently offer "Now try Practice". The child must navigate back to the game and manually switch tabs.

2. **Practice → Test transition is implicit**: The `hideTestTab` logic enforces the gate, but the child doesn't know WHY Test disappeared or WHEN it will reappear. There's no "Practice well to unlock Test!" message.

3. **Test is a per-game event**: Each game has its own Test mode. For a child playing 5 games in a row, they take 5 separate tests. This is tedious and doesn't assess cumulative learning.

**Proposed improvement: Unit-Level Assessment**

Instead of per-game Test mode, aggregate assessment at the end of each unit (group of 3-5 games):

```
Game 1 (Learn → Practice) → Game 2 (Learn → Practice) → Game 3 (Learn → Practice)
                                                                    ↓
                                                          Unit Assessment
                                                          (5-10 questions
                                                           covering all 3 games)
                                                                    ↓
                                                          Unit Complete ✓
```

**Benefits:**
- Children stay in the Learn → Practice flow without mode-switching friction
- Assessment covers cumulative learning, not single-game recall
- Fewer test events = less anxiety, more natural progression
- Teachers get one assessment result per unit instead of per game
- The "Test" tab can be removed from the per-game UI entirely

**Implementation sketch:**
- After completing Practice for the last game in a unit, show a "Unit Challenge" prompt
- The challenge pulls questions from all games in the unit (randomized subset)
- Results feed into the learning path's unit lock state
- The existing `issueCheckpoint` / `submitCheckpoint` endpoints already support this pattern

### 1.4 The Learning Mode Flow (WORKING BUT HOLLOW)

**What the screen shows:**  
- Three mode tabs: 📺 Learn (active), 🎯 Practice, 📝 Test
- A "Learning Mode — Watch and learn!" banner
- The scenario text auto-displayed
- A "Listen" button next to the scenario
- The question text
- Five option cards
- A "Play answer 🔊" button

**What the code assumes:**  
Learning mode (`GamePlay.tsx:457-485`) is fully automated:
1. Scenario auto-speaks on mount
2. Child taps "Play Answer" → answer is spoken, correct card highlighted
3. After 1.2s, auto-advances to next round
4. After all rounds, shows `LearningComplete` screen

**The gap:**  
The flow structure works, but the content inside it is broken:
- The scenario text is generic ("Nursery 1 learning time: Tap, match, replay audio...")
- The question is vague ("Tap the Digital Readiness idea we are exploring")
- All options look identical
- The correct answer ("retry") has no visual distinction
- The audio is the same sentence for every option

**Impact:** The learning mode mechanically works but teaches nothing. A child cannot learn "Digital Readiness" by tapping identical cards that all say "🎮 tap" or "🎮 listen".

### 1.5 The Student Home Dashboard (PARTIALLY WORKING)

**What the screen shows:**  
- Header with "Elite Kids" branding, "Hello, David Emmanuel Johnson!"
- Companion greeting from "Whiskers" (cat emoji)
- "Yay — you're back! We saved your spot 💛" motivational banner
- A garden progress indicator (🌱 1 🌱)
- "Loading games..." spinner (takes several seconds)
- Bottom tabs: Home, Play 814, Learn, Review, Me

**What the code assumes:**  
`StudentHome.tsx` loads: placement status, onboarding status, companion, lessons catalog, progress, economy balance, review due count, and learning path — all in parallel on mount.

**The gaps observed:**
1. **Slow game list load** — "Loading games..." persists for 5+ seconds. The catalog fetch (`GET /kids/lessons`) returns 1,718 lessons.
2. **Learning path request aborted** — `GET /kids/learning-path?student_id=Demo5` returned `net::ERR_ABORTED` (timeout or cancellation).
3. **Scene library 403** — `GET /kids/scene-library` returned Forbidden (requires staff auth, but the request may be firing for a student).
4. **Scenes 404** — `GET /kids/lessons/fp-n1-tt-w01-digital/scenes` returned Not Found (no scene scripts exist for this lesson).
5. **Garden is empty** — Only shows "🌱 1 🌱" with no visual garden elements.

**Impact:** The dashboard loads but feels sluggish. The learning path failure means the "Learn" tab may not show the structured curriculum path.

---

## Part 2: Root Cause Analysis

### 2.1 The Seeder Is the Single Point of Failure

All 1,718 games were generated by `backend/src/seeders/flagshipAnnualPilotSeed.js`. This seeder:

1. **Generates all images as inline SVG placeholders** via `fallbackImage(label, emoji)` — never produces real images, photos, or illustrations
2. **Uses the same emoji for all items in a subject** — "digital" subject always gets 🎮, "arts" always gets 🥘, etc.
3. **Sets `audio` fields to plain text sentences** — not audio URLs, not TTS-able short phrases, but full paragraph text
4. **Uses identical scenario/speechText for all items in a game** — the same sentence repeated for every option
5. **Assigns a single character ("Tobi") to all games** — no character variety

### 2.2 The AI Content Generator Was Never Used

The backend has a `contentGeneratorService.js` that can produce high-quality games with:
- Real images from Unsplash/Pexels CDN
- Unique characters per game (Zara, Tobi, Maya with distinct emojis)
- Proper audio URLs for TTS
- Meaningful scenarios and prompts

But this generator requires:
- A valid `AI_API_KEY` or `GEMINI_API_KEY` in `.env`
- The `KIDS_ANNUAL_PILOT_SEED=true` + `KIDS_ANNUAL_PILOT_SEED_CONFIRM=true` env vars
- Teacher-initiated generation via the UI

The seeder bypasses the AI generator entirely and produces static, low-quality content.

### 2.3 The Frontend Has No Image Fallback Strategy

When `item.image` is an SVG placeholder, the frontend renders it as-is. There is no detection of "this is a placeholder, show the emoji instead." The `CachedImg` component caches the SVG in IndexedDB and serves it from cache — caching junk data.

---

## Part 3: What's Actually Working

Despite the content issues, the **engine infrastructure is solid**:

| Component | Status | Notes |
|-----------|--------|-------|
| Login + JWT auth | ✅ Working | Demo5 logs in, JWT issued, cross-app handoff ready |
| Game mode switching | ✅ Working | Learn/Practice/Test tabs toggle correctly |
| Learning mode auto-play | ✅ Working | Scenario speaks, "Play Answer" works, auto-advances |
| Tap recognition renderer | ✅ Working | Cards render, tap detection works, feedback shows |
| Character rendering | ✅ Working | Emoji fallback works, name + personality display |
| XP/progress tracking | ✅ Working | Economy balance loads, streak tracking active |
| Companion system | ✅ Working | Whiskers greets the student on home |
| Mode lock system | ✅ Working | `GET /kids/mode-lock` returns correct state |
| Adaptive difficulty (v2) | ✅ Working | `GET /kids/adaptive/v2/profile` returns profile |
| Revision system | ✅ Working | `GET /kids/revision/failed-items` returns data |
| Bottom tab navigation | ✅ Working | Home/Play/Learn/Review/Me tabs functional |
| Accessibility settings | ✅ Working | A11y panel, colorblind toggle, speech settings |
| Sound system | ✅ Working | TTS, correct/wrong/celebration sounds functional |
| Offline caching | ✅ Working | IndexedDB cache layer operational |
| Backend API | ✅ Working | All endpoints respond, rate limiting active |
| Nginx proxy | ✅ Working | SPA + API routing correct |

---

## Part 4: The Fix Plan

### Phase 1: Content Triage (Immediate — 1-2 days)

**Goal:** Make the existing 1,718 games minimally playable.

#### 1A. Fix the Option Card Images

**Problem:** All cards show identical 🎮 SVG placeholders.  
**Fix:** Replace the `fallbackImage()` function in the seeder to generate distinct, meaningful SVGs per item:

```js
// CURRENT (broken): same emoji for all items in a subject
function fallbackImage(label, emoji) {
  return `data:image/svg+xml,...${emoji}...`;  // always 🎮 for digital
}

// PROPOSED: unique emoji per item based on label
const LABEL_EMOJI_MAP = {
  'tap': '👆', 'listen': '👂', 'match': '🔗', 'retry': '🔄', 'stop': '🛑',
  'apple': '🍎', 'banana': '🍌', 'cat': '🐱', 'dog': '🐶',
  // ... 200+ mappings
};
function fallbackImage(label, emoji) {
  const itemEmoji = LABEL_EMOJI_MAP[label.toLowerCase()] || emoji || '❓';
  return generateSvg(itemEmoji, label);
}
```

**Effort:** Medium. Requires updating the seeder and re-seeding the database.

#### 1B. Fix the Audio Fields

**Problem:** `audio` fields contain full sentences, not audio URLs or short TTS text.  
**Fix:** Strip the `audio` field to be either:
- A short label for TTS (e.g., "tap", "listen", "match") — the frontend's `speakLabel()` already handles this
- Or remove it entirely so the frontend falls back to the item's `label` field

**Effort:** Low. One-time DB update.

#### 1C. Fix the Scenario/Prompt Content

**Problem:** All items share the same scenario text ("Tap, match, replay audio and recognise gentle feedback without needing to read").  
**Fix:** Each item should have a unique, meaningful prompt. For a "Digital Readiness" game about tapping:
- Item 1: "Tap the screen to select" → 👆
- Item 2: "Listen to the instruction" → 👂
- Item 3: "Match the picture to the word" → 🔗
- Item 4: "Try again if you make a mistake" → 🔄
- Item 5: "Stop and think before you tap" → 🛑

**Effort:** Medium. Requires content review per subject.

### Phase 2: Content Quality (1-2 weeks)

**Goal:** Replace placeholder content with real, educational game data.

#### 2A. Run the AI Content Generator

The `contentGeneratorService.js` can produce high-quality games with:
- Real images (Unsplash/Pexels CDN URLs)
- Unique characters per game
- Proper audio prompts
- Meaningful scenarios

**Steps:**
1. Ensure `AI_API_KEY` or `GEMINI_API_KEY` is set in `.env`
2. Create a batch generation script that iterates through all 1,718 lessons
3. For each lesson, call the AI generator to produce a new `config_json`
4. Store the result in `kids_game_configs` with `content_state: 'pending_review'`
5. Auto-approve after QA spot-checks

**Effort:** High. Requires API key setup, batch script, and content review.

#### 2B. Create a Visual Asset Library

For subjects where AI-generated images aren't appropriate (e.g., Nigerian cultural content, NERDC curriculum-specific items):

1. Create a curated image library in `/backend/uploads/assets/`
2. Organize by subject: `digital/`, `literacy/`, `numeracy/`, `arts/`, etc.
3. Reference images in game configs as `/media/assets/digital/tap-screen.png`
4. The backend already serves from `storageDir()` at `/media/:key`

**Effort:** High. Requires asset creation or sourcing.

#### 2C. Add Character Variety

Currently all 1,718 games use "Tobi" as the character. Fix:

1. Define 8-10 characters in `sceneAssetsSeed.js` (already partially done)
2. Assign characters based on subject: Maya for arts, Tobi for digital, Zara for literacy, etc.
3. Add character images to the asset library
4. Update the seeder to rotate characters per lesson

**Effort:** Medium.

### Phase 3: Engine Improvements (2-4 weeks)

**Goal:** Make the game engine more resilient to bad content.

#### 3A. Add Placeholder Detection

In `GamePlay.tsx`, detect when an `item.image` is an inline SVG placeholder and fall back to emoji:

```ts
function isPlaceholderImage(src?: string): boolean {
  return !!src && src.startsWith('data:image/svg') && src.includes('EAF3FF');
}
```

Then in the card renderer:
```tsx
{item.image && !isPlaceholderImage(item.image) ? (
  <CachedImg src={item.image} ... />
) : item.emoji ? (
  <span className="text-5xl">{item.emoji}</span>
) : (
  <span className="text-2xl font-bold text-gray-400">?</span>
)}
```

**Effort:** Low. Small code change, immediate visual improvement.

#### 3B. Add Content Quality Scoring

Add a backend endpoint that scores a game config on:
- Image diversity (are all items using the same image?)
- Audio quality (are audio fields URLs or just text?)
- Prompt uniqueness (are scenarios identical across items?)
- Character variety (is there more than one character?)

Surface this in the teacher approval UI so teachers can see quality metrics before publishing.

**Effort:** Medium.

#### 3C. Fix the Learning Path Timeout

The `GET /kids/learning-path` request was aborted. This could be:
- A slow query (1,718 lessons × path computation)
- A timeout issue (the default 30s timeout in `apiClient`)
- A memory issue on the server

**Investigation needed:** Check the server logs for slow queries, add database indexes if missing, consider caching the learning path per student.

**Effort:** Medium.

#### 3D. Fix the Scene Library 403

`GET /kids/scene-library` returned 403 because it requires `requireStaff` middleware. But the student home page may be triggering this request. Check:
- Is `StudentHome.tsx` accidentally calling the scene library endpoint?
- Or is this a stale request from a previous navigation?

**Effort:** Low.

### Phase 4: Content Pipeline (Ongoing)

**Goal:** Ensure new games are always high quality.

#### 4A. Teacher Game Creator Validation

The `GameCreator.tsx` UI already has validation, but it should also:
- Reject games where all options use the same image
- Require at least one of: image, emoji, or text label per option
- Warn when audio fields are plain text (not URLs)
- Auto-suggest emoji from the label if no image is provided

**Effort:** Medium.

#### 4B. Auto-Generation on Lesson Creation

When a teacher creates a new lesson, automatically trigger the AI content generator to produce a draft game config. The teacher can then review and customize before publishing.

**Effort:** High.

#### 4C. Image Auto-Discovery

For items with only text labels (no image), automatically look up relevant images:
1. Check the local asset library first
2. Fall back to Twemoji CDN (already implemented in `getItemVisual()` in `icons.ts`)
3. Fall back to a styled text card (larger font, colored background)

The Twemoji fallback already exists but isn't being used for game option cards. Wire it in.

**Effort:** Low-Medium.

---

## Part 5: Priority Matrix

| # | Issue | Severity | Fix Effort | Priority |
|---|-------|----------|------------|----------|
| 1 | Option cards show identical SVG placeholders | CRITICAL | Medium | P0 |
| 2 | Audio fields contain text, not URLs | CRITICAL | Low | P0 |
| 3 | Learn mode doesn't auto-play (TapGame has no auto-play useEffect) | CRITICAL | Low | P0 |
| 4 | Student Home tab renders blank for returning students | HIGH | Low | P1 |
| 5 | Test mode flickers in/out on first load (timing race) | HIGH | Low | P1 |
| 6 | All items share same scenario text | HIGH | Medium | P1 |
| 7 | Learn → Practice transition doesn't offer "Next: Practice" | HIGH | Low | P1 |
| 8 | Unit-level assessment (replace per-game Test) | MEDIUM | High | P2 |
| 9 | All games use same "Tobi" character | MEDIUM | Medium | P2 |
| 10 | Learning path request aborted (timeout) | HIGH | Medium | P1 |
| 11 | Student home loads slowly (1,718 lessons) | MEDIUM | Medium | P2 |
| 12 | No placeholder detection in frontend | MEDIUM | Low | P2 |
| 13 | Scene library returns 403 for students | LOW | Low | P3 |
| 14 | Scenes endpoint returns 404 | LOW | Low | P3 |
| 15 | Character has no image, only emoji | LOW | Medium | P3 |

---

## Part 6: Recommended Execution Order

1. **P0 Quick Fix — Placeholder Detection (1 day):** ✅ DONE — Added `isPlaceholderImage()` check in `GamePlay.tsx` so cards fall back to emoji instead of showing broken SVGs. 20-line code change, immediate visual improvement for all 1,718 games.

2. **P0 Content Fix — Seeder Update (2 days):** ✅ DONE — Updated `fallbackImage()` with 100+ label-specific emoji mappings. Each item now gets a unique emoji based on its label (e.g., "tap" → 👆, "listen" → 👂, "count" → 🔢). Re-seed required for existing games.

3. **P0 Learn Mode Auto-Play (1 day):** ✅ DONE — Added learning auto-play `useEffect` to `TapGame` (mirrors `MatchingGame:457-485`). Auto-advances through rounds: speak → highlight correct → celebrate → next. No manual "Play Answer" button needed.

4. **P1 Home Tab Fallback (0.5 day):** ✅ DONE — Added fallback content block to `HomeTab.tsx` — when all four sections are null (returning student, played today, no companion, empty garden), shows XP stats, streak count, and "Play next lesson" CTA.

5. **P1 Test Mode Flash Fix (0.5 day):** ✅ DONE — Modified `hideTestTab` logic to hide Test until `pathData` has loaded (or we're staff/preview). Eliminates the flicker on first load.

6. **P1 Learn → Practice Transition (1 day):** ✅ DONE — After `LearningComplete` screen, prominently offers "Try Practice →" as the primary CTA (green button).

7. **P1 Learning Path Timeout (2-3 days):** Debug and fix the `GET /kids/learning-path` abort. Add caching, pagination, or query optimization for the 1,718-lesson catalog.

8. **P1 Scenario Content (3-5 days):** Generate unique, meaningful scenarios per item for all subjects.

9. **P2 Unit-Level Assessment (1-2 weeks):** Replace per-game Test with unit-level assessment. After completing Practice for the last game in a unit, offer a "Unit Challenge" covering all games. Use existing checkpoint infrastructure.

10. **P2 AI Generation (1-2 weeks):** Set up the AI content generator to replace placeholder games with high-quality content.

11. **P2 Character Variety (1 week):** Add character images, rotate per subject, add to asset library.

12. **P3 Polish (ongoing):** Fix scene library access, optimize load times, add content quality scoring.

---

## Appendix A: Network Requests Observed

| Request | Status | Issue |
|---------|--------|-------|
| `GET /kids/lessons/fp-n1-tt-w01-digital/game` | 304 ✅ | Game data served correctly |
| `GET /kids/lessons/fp-n1-tt-w01-digital/scenes` | 404 ❌ | No scene scripts for this lesson |
| `GET /kids/scene-library` | 403 ❌ | Staff-only endpoint |
| `GET /kids/mode-lock?child_admission_no=Demo5&lesson_id=...` | 200 ✅ | Mode lock works |
| `GET /kids/learning-path?student_id=Demo5` | ERR_ABORTED ❌ | Timeout or cancellation |
| `GET /kids/adaptive/v2/profile?skill_key=...` | 200 ✅ | Adaptive engine works |
| `GET /kids/revision/failed-items?lesson_id=...&limit=2` | 200 ✅ | Revision system works |
| `GET /kids/suggested-mode?student_id=Demo5` | 200 ✅ | Mode suggestion works |

## Appendix B: Database State

| Metric | Value |
|--------|-------|
| Total game configs | 1,718 |
| Unique lessons | 1,718 |
| Templates | tap-recognition (171), matching (342), quiz (521), drag-sort (342), stage-sequence (342) |
| Image type | 100% inline SVG placeholders |
| Audio type | 100% plain text (not URLs) |
| Character variety | 1 character (Tobi) across all games |
| Content state | All "published" |

## Appendix C: Key Code Locations

| File | Lines | Purpose |
|------|-------|---------|
| `frontend/src/pages/Student/GamePlay.tsx` | 926-988 | Option card rendering |
| `frontend/src/pages/Student/GamePlay.tsx` | 794-811 | Play answer button logic |
| `frontend/src/pages/Student/GamePlay.tsx` | 457-485 | Learning mode auto-play (**MatchingGame only — TapGame missing this**) |
| `frontend/src/pages/Student/GamePlay.tsx` | 789-790 | Comment: "Answer does NOT auto-play" (**the gap**) |
| `frontend/src/pages/Student/GamePlay.tsx` | 672-710 | tapRounds construction (single-round vs multi-round) |
| `frontend/src/pages/Student/GamePlay.tsx` | 4144-4151 | `hideTestTab` — Test tab visibility gate |
| `frontend/src/pages/Student/GamePlay.tsx` | 5158-5189 | Mode switcher bar rendering (where Test is spread/hidden) |
| `frontend/src/pages/Student/GamePlay.tsx` | 4174-4219 | Learning path fetch (sets `ownRequiresTest`, `ownLessonState`) |
| `frontend/src/pages/Student/GamePlay.tsx` | 842-858 | Character rendering |
| `frontend/src/pages/Student/tabs/HomeTab.tsx` | 41-96 | HomeTab render — four nullable sections |
| `frontend/src/pages/Student/tabs/HomeTab.tsx` | 49-69 | Welcome Card (returning students hidden) |
| `frontend/src/pages/Student/tabs/HomeTab.tsx` | 72-76 | Companion Bubble (null when no companion) |
| `frontend/src/pages/Student/tabs/HomeTab.tsx` | 79-89 | Streak Reminder (hidden when playedToday) |
| `frontend/src/pages/Student/tabs/HomeTab.tsx` | 92-94 | Garden Preview (hidden when empty) |
| `frontend/src/pages/Student/StudentHome.tsx` | 942-959 | HomeTab props passed from StudentHome |
| `frontend/src/components/CachedImg.tsx` | 14-75 | Image caching component |
| `frontend/src/lib/utils/icons.ts` | 149-177 | Twemoji CDN fallback |
| `backend/src/seeders/flagshipAnnualPilotSeed.js` | 239-243 | `fallbackImage()` — source of all placeholder SVGs |
| `backend/src/controllers/kids.js` | 972-1044 | `toRuntimeGameConfig()` — schema-to-runtime transformer |
| `backend/src/controllers/kids.js` | 1049-1081 | `getPublishedGame` — serves game data |
| `backend/src/services/contentGeneratorService.js` | 167-223 | AI content generator prompt |

---

*Document generated by EliteKids game audit — 2026-09-17*
