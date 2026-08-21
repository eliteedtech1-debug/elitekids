# Manual Game Maker — Extensive Plan

> Teachers create games step-by-step with a fun, visual wizard.
> No AI needed — pure manual creation with instant preview.

---

## 1. Goals & Principles

| Principle | How It's Achieved |
|-----------|-------------------|
| **Easy** | Step-by-step wizard, one question per screen, smart defaults |
| **Standard** | Every template follows the same 4-step flow: Pick → Build → Style → Test |
| **Memorable** | Visual previews at every step, drag-to-reorder, live demo |
| **Fun** | Emoji headers, confetti on save, "Your game is ready! 🎉" celebration |
| **Good UI/UX** | Mobile-first, large touch targets, inline validation, undo support |

---

## 2. The 4-Step Wizard Flow

Every game (regardless of template) follows the same journey:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  STEP 1     │───▶│  STEP 2     │───▶│  STEP 3     │───▶│  STEP 4     │
│  🎮 Pick    │    │  🧩 Build   │    │  🎨 Style   │    │  🧪 Test    │
│  Template   │    │  Content    │    │  & Settings │    │  & Publish  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Progress bar at top (always visible):
```
● ─── ○ ─── ○ ─── ○     Step 1 of 4: Choose Game Type
```

---

## 3. STEP 1 — Pick Template (🎮)

**Screen: "What kind of game do you want to make?"**

Show 6 template cards in a grid (2×3 on mobile, 3×2 on desktop):

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  🔗 Matching     │  │  👆 Tap to Find  │  │  🔤 Fill Blanks  │
│                  │  │                  │  │                  │
│  [mini preview]  │  │  [mini preview]  │  │  [mini preview]  │
│                  │  │                  │  │                  │
│  Match pairs of  │  │  Tap the right   │  │  Complete the    │
│  items together  │  │  item from a set │  │  sentence        │
│                  │  │                  │  │                  │
│  ⏱ 2-5 min      │  │  ⏱ 1-3 min      │  │  ⏱ 2-4 min      │
│  👶 Ages 3+      │  │  👶 Ages 3+      │  │  👶 Ages 5+      │
└──────────────────┘  └──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  📝 Quiz         │  │  🧩 Puzzle       │  │  📦 Drag & Sort  │
│                  │  │                  │  │                  │
│  [mini preview]  │  │  [mini preview]  │  │  [mini preview]  │
│                  │  │                  │  │                  │
│  Multiple choice │  │  Upload image,   │  │  Put items in    │
│  questions       │  │  split into grid │  │  correct order   │
│                  │  │                  │  │                  │
│  ⏱ 3-5 min      │  │  ⏱ 2-5 min      │  │  ⏱ 2-4 min      │
│  👶 Ages 5+      │  │  👶 Ages 4+      │  │  👶 Ages 4+      │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**UX Details:**
- Card has a mini animated preview (CSS animation showing gameplay)
- Tap card → card lifts with shadow, checkmark appears
- "Back" button disabled on step 1
- "Next →" button only enabled after selection
- Age recommendation shown but not enforced (teacher's call)

---

## 4. STEP 2 — Build Content (🧩)

This step varies by template. Each template has a **custom builder** with the same UX pattern.

### 4a. Matching Game Builder

**Screen: "Add your match pairs"**

```
┌─────────────────────────────────────────────┐
│  🔗 Matching Game              Step 2 of 4  │
│─────────────────────────────────────────────│
│                                             │
│  Game Title: [________________________]     │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Pair 1                    [🗑️]    │    │
│  │  ┌─────────────┐ ──── ┌──────────┐ │    │
│  │  │ Left Side   │     │ Right Side│ │    │
│  │  │             │     │           │ │    │
│  │  │ 📷 Upload   │     │ 📷 Upload │ │    │
│  │  │ or [Type]   │     │ or [Type] │ │    │
│  │  └─────────────┘     └──────────┘ │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Pair 2                    [🗑️]    │    │
│  │  ┌─────────────┐ ──── ┌──────────┐ │    │
│  │  │ Left Side   │     │ Right Side│ │    │
│  │  │             │     │           │ │    │
│  │  │ 📷 Upload   │     │ 📷 Upload │ │    │
│  │  │ or [Type]   │     │ or [Type] │ │    │
│  │  └─────────────┘     └──────────┘ │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │     ➕ Add Another Pair             │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Each side can be:                          │
│  • 📷 Upload image (photo, drawing)         │
│  • 😊 Pick emoji (emoji picker)             │
│  • 🎤 Record audio (teacher voice)          │
│  • ✏️ Type text (word/label)                │
│                                             │
│  [◀ Back]              [Next Step →]        │
└─────────────────────────────────────────────┘
```

**Per-pair inputs:**
- **Left side:** image OR emoji OR text + optional audio
- **Right side:** image OR emoji OR text + optional audio
- Drag handle (⠿) to reorder pairs
- Swipe left to delete (mobile) or tap 🗑️
- Minimum 2 pairs, maximum 8 pairs
- Smart defaults: auto-suggests emoji based on typed text

### 4b. Tap Recognition Builder

**Screen: "Build the tap challenge"**

```
┌─────────────────────────────────────────────┐
│  👆 Tap to Find               Step 2 of 4  │
│─────────────────────────────────────────────│
│                                             │
│  Game Title: [________________________]     │
│                                             │
│  Instruction (what the child sees):         │
│  [____________________________________]     │
│  Example: "Tap the red apple"               │
│                                             │
│  ── Items ────────────────────────────      │
│                                             │
│  ┌──────────────────────────────┐           │
│  │ ⭐ Correct Answer     [🗑️] │           │
│  │ ┌──────────────────────────┐ │           │
│  │ │ 📷 Image or 😊 Emoji     │ │           │
│  │ │ Label: [___________]     │ │           │
│  │ │ Audio: 🎤 Record (opt.)  │ │           │
│  │ └──────────────────────────┘ │           │
│  └──────────────────────────────┘           │
│                                             │
│  ┌──────────────────────────────┐           │
│  │  Distractor 1          [🗑️] │           │
│  │ ┌──────────────────────────┐ │           │
│  │ │ 📷 Image or 😊 Emoji     │ │           │
│  │ │ Label: [___________]     │ │           │
│  │ └──────────────────────────┘ │           │
│  └──────────────────────────────┘           │
│                                             │
│  ┌──────────────────────────────┐           │
│  │     ➕ Add Distractor        │           │
│  └──────────────────────────────┘           │
│                                             │
│  ⚡ Quick Fill: [Pick from emoji set ▼]     │
│  (🍎 🍌 🍇 🍊 🍓 🥝 🍉 🍑)              │
│                                             │
│  [◀ Back]              [Next Step →]        │
└─────────────────────────────────────────────┘
```

**Smart features:**
- "Quick Fill" button → pick from themed emoji sets (fruits, animals, colors, shapes, numbers)
- One item marked as ✅ correct, rest are distractors
- Minimum 3 items (1 correct + 2 distractors), maximum 8
- Auto-generate instruction text from labels

### 4c. Fill-in-the-Blank Builder

**Screen: "Create the sentence"**

```
┌─────────────────────────────────────────────┐
│  🔤 Fill in the Blanks          Step 2 of 4 │
│─────────────────────────────────────────────│
│                                             │
│  Game Title: [________________________]     │
│                                             │
│  Build your sentence:                       │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │  The  [cat]  is sleeping on  [mat]  │    │
│  │        ↑ blank      ↑ blank         │    │
│  │                                     │    │
│  │  [➕ Add Blank]  [✏️ Edit Blanks]   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ── Blank Answers ─────────────────────     │
│                                             │
│  Blank 1: [cat    ]  ✅ answer              │
│  Blank 2: [mat    ]  ✅ answer              │
│                                             │
│  ── Word Bank (distractors) ──────────      │
│  [dog] [hat] [ran]  [+ Add word]            │
│                                             │
│  🎤 Record teacher reading the sentence     │
│  [🎤 Record]  [▶️ Play]                     │
│                                             │
│  [◀ Back]              [Next Step →]        │
└─────────────────────────────────────────────┘
```

**Visual sentence builder:**
- Type sentence normally, then tap words to turn them into blanks
- Each blank becomes a colored chip: `The [___] is sleeping on the [___]`
- Drag words between blanks to rearrange
- Word bank auto-suggests distractors based on sentence topic

### 4d. Quiz Builder

**Screen: "Write your questions"**

```
┌─────────────────────────────────────────────┐
│  📝 Quiz                       Step 2 of 4  │
│─────────────────────────────────────────────│
│                                             │
│  Game Title: [________________________]     │
│                                             │
│  ── Question 1 of 3 ───────────────         │
│                                             │
│  Question:                                  │
│  [What color is the sky?]                   │
│                                             │
│  Options (tap ✅ to mark correct):           │
│  ┌─────────────────────────────────────┐    │
│  │ ✅ Blue          (correct answer)   │    │
│  │ ☐  Red                            │    │
│  │ ☐  Green                          │    │
│  │ ☐  Yellow                         │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [+ Add Option]                             │
│  (Minimum 2, maximum 4 options)             │
│                                             │
│  ────────────────────────────────            │
│  Q1 ● ○ ○  Q2 ○ ○ ○  Q3 ○ ○ ○             │
│                                             │
│  [◀ Back]              [Next Step →]        │
└─────────────────────────────────────────────┘
```

**Question navigation:**
- Dot indicators at bottom (Q1 ● ○ ○)
- Tap dots to jump between questions
- Swipe left/right to navigate (mobile)
- "Add Question" button after last question
- Minimum 2 questions, maximum 10
- Each question: text + 2-4 options + 1 correct

### 4e. Drag & Sort Builder

**Screen: "Set up the sorting challenge"**

```
┌─────────────────────────────────────────────┐
│  📦 Drag & Sort                 Step 2 of 4 │
│─────────────────────────────────────────────│
│                                             │
│  Game Title: [________________________]     │
│                                             │
│  Sorting mode:                              │
│  (●) Number order (1, 2, 3...)              │
│  (○) Alphabetical (A, B, C...)              │
│                                             │
│  ── Items (in correct order) ───────        │
│                                             │
│  ⠿ 1. [Cat     ] 📷 😊 [🗑️]             │
│  ⠿ 2. [Dog     ] 📷 😊 [🗑️]             │
│  ⠿ 3. [Elephant] 📷 😊 [🗑️]             │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │     ➕ Add Item                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ⚡ Quick Fill: [Animals ▼] [Colors ▼]      │
│                                             │
│  [◀ Back]              [Next Step →]        │
└─────────────────────────────────────────────┘
```

### 4f. Puzzle Builder

**Screen: "Upload your puzzle image"**

```
┌─────────────────────────────────────────────┐
│  🧩 Puzzle                      Step 2 of 4 │
│─────────────────────────────────────────────│
│                                             │
│  Game Title: [________________________]     │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │      📷                             │    │
│  │   Drop image here                   │    │
│  │   or tap to upload                  │    │
│  │                                     │    │
│  │   JPG, PNG, WebP — max 10 MB       │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ✅ Image uploaded: cat_photo.jpg (2.3 MB)  │
│  [🖼️ Preview]  [🗑️ Remove]                │
│                                             │
│  Difficulty levels will be auto-generated:  │
│  ⭐ Easy (2×2 = 4 pieces)                  │
│  ⭐⭐ Medium (3×3 = 9 pieces)              │
│  ⭐⭐⭐ Hard (4×4 = 16 pieces)            │
│  ⭐⭐⭐⭐ Expert (5×5 = 25 pieces)        │
│                                             │
│  [◀ Back]              [Next Step →]        │
└─────────────────────────────────────────────┘
```

---

## 5. STEP 3 — Style & Settings (🎨)

**Screen: "Final touches"**

Same for all templates:

```
┌─────────────────────────────────────────────┐
│  🎨 Settings                   Step 3 of 4  │
│─────────────────────────────────────────────│
│                                             │
│  ── Lesson Link ─────────────────────       │
│  Which lesson is this game for?             │
│  [Select Lesson ▼]                          │
│  (Populated from teacher's lessons)         │
│                                             │
│  ── Age Level ──────────────────────        │
│  [KG1 ▼]                                   │
│  (Auto-filled from lesson, adjustable)      │
│                                             │
│  ── Difficulty ─────────────────────        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│  │ Easy │ │Med.  │ │ Hard │ │Expert│      │
│  │  ●   │ │  ○   │ │  ○   │ │  ○   │      │
│  └──────┘ └──────┘ └──────┘ └──────┘      │
│                                             │
│  ── Timer ─────────────────────────         │
│  Duration: [45 seconds ▼]                   │
│  (Auto: Easy=30s, Medium=45s, Hard=60s)    │
│                                             │
│  ── Input Mode ────────────────────         │
│  How can children answer?                   │
│  (●) Tap only (default)                     │
│  (○) Speak only (voice)                     │
│  (○) Both (tap or speak)                    │
│                                             │
│  ── Audio ─────────────────────────         │
│  🎤 Record teacher instructions:            │
│  [🎤 Record]  [▶️ Play]  [🗑️ Remove]       │
│                                             │
│  ── Background ────────────────────         │
│  [Default ▼] [Pastel 🌈] [Night 🌙]        │
│                                             │
│  [◀ Back]              [Next Step →]        │
└─────────────────────────────────────────────┘
```

---

## 6. STEP 4 — Test & Publish (🧪)

**Screen: "Test your game!"**

```
┌─────────────────────────────────────────────┐
│  🧪 Test Game                   Step 4 of 4 │
│─────────────────────────────────────────────│
│                                             │
│  ✅ Your game is ready to test!             │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │   [🎮 Play as Child]                │    │
│  │                                     │    │
│  │   Opens the game in child mode      │    │
│  │   so you can test it yourself       │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │   [📱 Preview on Phone]             │    │
│  │                                     │    │
│  │   Shows QR code to scan and         │    │
│  │   test on a real phone/tablet       │    │
│  │                                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ── Summary ──────────────────────          │
│  Template:     Matching (🔗)                │
│  Pairs:        4                            │
│  Age Level:    KG1                          │
│  Timer:        45 seconds                   │
│  Input Mode:   Tap only                     │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  📝 Edit Content  (go back to step 2)│   │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  ✅ Save & Publish                  │    │
│  │  (Game goes live for students)      │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  💾 Save as Draft                   │    │
│  │  (Come back later to finish)        │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [◀ Back]                                   │
└─────────────────────────────────────────────┘
```

---

## 7. Celebration & Confirmation

After "Save & Publish":

```
┌─────────────────────────────────────────────┐
│                                             │
│              🎉 🎊 🎉                       │
│                                             │
│         Your game is LIVE!                  │
│                                             │
│    "Rainbow Colors Matching"                │
│     is now available for your students      │
│                                             │
│    ┌────────────────────────────────┐       │
│    │  [▶️ Play Now]  [📋 Copy Link] │       │
│    └────────────────────────────────┘       │
│                                             │
│    ┌────────────────────────────────┐       │
│    │  [➕ Create Another Game]      │       │
│    └────────────────────────────────┘       │
│                                             │
│    ┌────────────────────────────────┐       │
│    │  [📚 Back to Lessons]          │       │
│    └────────────────────────────────┘       │
│                                             │
│              🌟 ⭐ 🌟                       │
└─────────────────────────────────────────────┘
```

**Confetti animation** (CSS) fires on save.

---

## 8. UI/UX Design System

### 8a. Component Library

| Component | Usage | Style |
|-----------|-------|-------|
| `WizardCard` | Step container | White rounded-2xl, shadow-sm, max-w-lg centered |
| `WizardProgress` | Top progress bar | Dots: ● active, ○ upcoming, ✓ completed |
| `TemplateCard` | Step 1 template picker | Hover lift, emoji header, mini preview |
| `PairBuilder` | Matching pair editor | Side-by-side cards with connector line |
| `ItemBuilder` | Tap/Quiz item editor | Stackable rows with drag handle |
| `SentenceBuilder` | Fill-blank editor | Inline blanks as colored chips |
| `ImageUploader` | Puzzle photo upload | Dropzone with preview thumbnail |
| `OptionToggle` | Radio/checkbox options | Pill-style segmented controls |
| `QuickFill` | Emoji/word presets | Horizontal scrollable chip list |
| `CelebrationOverlay` | Save confirmation | Full-screen confetti + success message |

### 8b. Color Palette

```
Primary:    #0F4D92 (Elite Blue)
Success:    #22C55E (Green)
Warning:    #F59E0B (Amber)
Error:      #EF4444 (Red)
Blank:      #8B5CF6 (Purple — for blanks in sentences)
Correct:    #22C55E (Green chips)
Distractor: #6B7280 (Gray chips)
```

### 8c. Animations

| Trigger | Animation | Duration |
|---------|-----------|----------|
| Step transition | Slide left/right | 300ms ease |
| Card select | Lift + scale(1.02) + shadow | 200ms |
| Add item | Slide down + fade in | 250ms |
| Delete item | Slide left + fade out | 200ms |
| Drag reorder | Smooth position swap | 150ms |
| Validation error | Shake (3px) | 400ms |
| Save success | Confetti burst + pop | 1000ms |

### 8d. Responsive Breakpoints

```
Mobile:   < 640px  → Single column, full-width cards
Tablet:   640-1024 → 2-column grid for templates
Desktop:  > 1024px → Centered max-w-lg form, side preview
```

---

## 9. Quick Fill Presets

Teachers can bulk-add items from pre-made sets:

### Animals
🐱 Cat, 🐶 Dog, 🐘 Elephant, 🦁 Lion, 🐵 Monkey, 🐰 Rabbit, 🐻 Bear, 🐦 Bird, 🐟 Fish, 🐸 Frog, 🦊 Fox, 🐢 Turtle

### Colors
🔴 Red, 🔵 Blue, 🟢 Green, 🟡 Yellow, 🟠 Orange, 🟣 Purple, ⚫ Black, ⚪ White, 🩷 Pink, 🩵 Cyan

### Shapes
⭕ Circle, 🔺 Triangle, ⬛ Square, ⬡ Hexagon, ❤️ Heart, ⭐ Star

### Numbers
0️⃣ Zero, 1️⃣ One, 2️⃣ Two, 3️⃣ Three, 4️⃣ Four, 5️⃣ Five, 6️⃣ Six, 7️⃣ Seven, 8️⃣ Eight, 9️⃣ Nine, 🔟 Ten

### Fruits
🍎 Apple, 🍌 Banana, 🍇 Grapes, 🍊 Orange, 🍓 Strawberry, 🥝 Kiwi, 🍉 Watermelon, 🍑 Peach

### Shapes + Colors (combo)
🔴 Red Circle, 🔵 Blue Square, 🟢 Green Triangle, 🟡 Yellow Star

**Quick Fill UX:**
- Tap preset category → items appear as chips
- Tap chips to add them (toggle on/off)
- Can mix presets + manual items
- "Add All" button for the full set

---

## 10. Voice Recording (Audio)

Teachers can record voice instructions for each game:

```
┌─────────────────────────────────────┐
│  🎤 Audio Recording                 │
│                                     │
│  ┌──────────────────────────────┐   │
│  │                              │   │
│  │   🎙️ Tap to Record           │   │
│  │                              │   │
│  │   ═══════════════════════    │   │
│  │   (waveform visualization)   │   │
│  │                              │   │
│  └──────────────────────────────┘   │
│                                     │
│  Duration: 0:05 / 0:30 max         │
│                                     │
│  [▶️ Play]  [🗑️ Delete]  [✅ Save] │
│                                     │
│  💡 Tip: Speak slowly and clearly   │
│     for young children              │
└─────────────────────────────────────┘
```

Uses `MediaRecorder` API. Audio saved as WebM/Opus.

---

## 11. Validation Rules

| Template | Rule | Error Message |
|----------|------|---------------|
| All | Title required | "Give your game a name!" |
| All | ≥ 2 items/pairs/questions | "Add at least 2 items to play" |
| Matching | Each pair needs both sides | "Both sides of the match need content" |
| Tap | ≥ 1 correct + 2 distractors | "Add at least 3 items (1 correct, 2 wrong)" |
| Quiz | ≥ 2 questions, 2-4 options each | "Each question needs 2-4 options" |
| Quiz | Exactly 1 correct per question | "Mark one option as correct" |
| Fill-blank | ≥ 1 blank, sentence ≥ 10 chars | "Add at least one blank to the sentence" |
| Fill-blank | All blanks have answers | "Every blank needs an answer" |
| Drag-sort | ≥ 3 items | "Add at least 3 items to sort" |
| Puzzle | Image uploaded | "Upload an image for the puzzle" |

Inline validation (red border + message) appears as teacher types.

---

## 12. API Endpoints

```
POST   /api/kids/games/manual          — Create game config manually
PUT    /api/kids/games/:id             — Update game config
GET    /api/kids/games/:id/preview     — Get config for preview
POST   /api/kids/games/:id/publish     — Set content_state=published
POST   /api/kids/games/:id/save-draft  — Set content_state=generated
DELETE /api/kids/games/:id             — Delete draft
POST   /api/kids/media/record-audio    — Upload teacher voice recording
GET    /api/kids/quick-fill/:category  — Get preset items by category
```

---

## 13. Database Changes

```sql
-- Add manual generation flag to game configs
ALTER TABLE kids_game_configs
  ADD COLUMN generation_method ENUM('ai','manual') NOT NULL DEFAULT 'ai'
  AFTER model_version;

-- Store teacher audio recordings
CREATE TABLE IF NOT EXISTS kids_audio_records (
  id VARCHAR(50) PRIMARY KEY,
  lesson_id VARCHAR(50) NOT NULL,
  audio_url VARCHAR(500) NOT NULL,
  duration_ms INT DEFAULT 0,
  created_by VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Store game drafts (partial saves)
ALTER TABLE kids_game_configs
  ADD COLUMN is_draft TINYINT(1) NOT NULL DEFAULT 0
  AFTER generation_method;
```

---

## 14. Rollout Plan

| Phase | What | Timeline |
|-------|------|----------|
| **Phase 1** | Matching + Tap Recognition manual builder | Week 1 |
| **Phase 2** | Quiz + Fill-in-Blank + Drag-Sort builders | Week 2 |
| **Phase 3** | Puzzle image upload + split | Week 2 |
| **Phase 4** | Voice recording + Quick Fill presets | Week 3 |
| **Phase 5** | Preview/test flow + celebration animation | Week 3 |
| **Phase 6** | Polish, responsive testing, edge cases | Week 4 |

---

## 15. Teacher Flow Summary (Memory Hook)

**The 4 S's — every game follows:**

```
1️⃣  SELECT    → Pick your game type
2️⃣  BUILD     → Add your content (items, pairs, questions)
3️⃣  STYLE     → Set age, timer, input mode, audio
4️⃣  SAVE      → Test it, then publish!
```

**"Select → Build → Style → Save"** — easy to remember, same for every game type.
