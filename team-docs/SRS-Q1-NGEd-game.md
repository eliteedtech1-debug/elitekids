# Software Requirements Specification — NGEd-game Q1 2027

**Document ID:** SRS-NGEd-game-Q1-001
**Version:** 1.0.0
**Date:** 2026-09-03
**Author:** MASTER planning session
**Status:** DRAFT — pending review

---

## Table of Contents

1. [Overview & Scope](#1-overview--scope)
2. [Adaptive Difficulty Engine (ADE)](#2-adaptive-difficulty-engine-ade)
3. [Spaced Repetition Engine (SRE)](#3-spaced-repetition-engine-sre)
4. [Engagement Economy](#4-engagement-economy)
5. [API Contracts](#5-api-contracts)
6. [Database Schemas (DDL)](#6-database-schemas-ddl)
7. [TypeScript Types](#7-typescript-types)
8. [Algorithm Specifications](#8-algorithm-specifications)
9. [Test Plans](#9-test-plans)
10. [Error Handling & Edge Cases](#10-error-handling--edge-cases)
11. [Security & Privacy](#11-security--privacy)
12. [Integration & Migration](#12-integration--migration)

---

## 1. Overview & Scope

### 1.1 Purpose

This SRS defines the complete software requirements for NGEd-game Q1 2027, covering three interconnected systems:

1. **Adaptive Difficulty Engine (ADE)** — Real-time difficulty adjustment using Bayesian Knowledge Tracing
2. **Spaced Repetition Engine (SRE)** — SM-2+ algorithm for optimal review scheduling
3. **Engagement Economy** — XP, levels, streaks, shop, and progression system

### 1.2 Scope

| In Scope | Out of Scope |
|----------|-------------|
| ADE backend service + algorithm | Voice/speech recognition (Q2) |
| SRE backend service + SM-2+ | Drawing recognition (Q2) |
| Economy backend (XP, levels, shop) | Content marketplace (Q4) |
| All associated frontend components | Offline-first 2.0 (Q4) |
| API endpoints (new + modified) | Parent intelligence dashboard (Q3) |
| Database migrations | Teacher AI assistant (Q3) |
| Integration with existing gameplay | Predictive analytics (Q4) |
| Test suites (backend + frontend) | |

### 1.3 Existing System Context

The current codebase has scaffolding for adaptive and spaced repetition features:

| Existing Component | File | State | Q1 Action |
|-------------------|------|-------|-----------|
| Adaptive profiles | `kidsAdaptive.js` | Rule-based v1, raw SQL | **Replace** with BKT algorithm |
| Spaced repetition | `kidsSpacedRep.js` | Ebbinghaus doubling | **Replace** with SM-2+ |
| Mastery tracking | `KidMasteryProgress.js` | Sequelize model | **Enhance** with skill-level granularity |
| Review schedule | `KidReviewSchedule.js` | Sequelize model | **Replace** with SRE scheduling |
| Item responses | `KidGameItemResponse.js` | Sequelize model | **Extend** with response quality scoring |
| Engagement snapshots | `KidEngagementSnapshot.js` | Sequelize model | **Keep** — feed into ADE |
| Streak tracking | `streak.ts` (frontend) | localStorage only | **Migrate** to backend |
| XP tracking | `KidProgress.js` | Basic xp field | **Extend** with economy system |

### 1.4 Architecture Decision Records

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-01 | Use raw SQL for new tables (ADE, economy) | Matches existing `kidsAdaptive.js` pattern; avoids Sequelize model overhead for new tables |
| ADR-02 | BKT over simple Elo | BKT provides mastery probability per skill; Elo only gives item difficulty. Both needed. |
| ADR-03 | SM-2+ over Ebbinghaus doubling | SM-2+ is proven in Anki/Memrise; handles difficulty variation; Ebbinghaus is too rigid |
| ADR-04 | Backend-streak over localStorage-only | Cross-device sync; server-authoritative for rewards |
| ADR-05 | Separate economy tables from progress | Clean separation of concerns; economy is additive, not replacing existing XP |

### 1.5 User Stories

#### ADE User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|------------|----------|
| ADE-US-01 | Student | Get easier questions when I'm struggling | I don't get frustrated and quit | P0 |
| ADE-US-02 | Student | Get harder questions when I'm acing them | I stay challenged and engaged | P0 |
| ADE-US-03 | Student | See my mastery level for each skill | I know what I've learned | P1 |
| ADE-US-04 | Teacher | See which students are struggling | I can provide targeted help | P1 |
| ADE-US-05 | Parent | See my child's mastery levels | I understand their progress | P2 |

#### SRE User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|------------|----------|
| SRE-US-01 | Student | Have review items scheduled at optimal times | I remember what I've learned | P0 |
| SRE-US-02 | Student | See how many reviews are due today | I know what to focus on | P0 |
| SRE-US-03 | Student | Get notified of due reviews | I don't forget to review | P1 |
| SRE-US-04 | Teacher | See class review statistics | I know if the class is retaining content | P1 |

#### Economy User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|------------|----------|
| ECO-US-01 | Student | Earn XP for completing games | I feel rewarded for learning | P0 |
| ECO-US-02 | Student | Maintain a daily streak | I'm motivated to play every day | P0 |
| ECO-US-03 | Student | Level up and see my progress | I have long-term goals | P0 |
| ECO-US-04 | Student | Buy items in the shop with XP | I can personalize my experience | P1 |
| ECO-US-05 | Student | See my XP bar grow | I have visible progress | P1 |
| ECO-US-06 | Student | Get streak bonuses | I'm rewarded for consistency | P1 |

---

## 2. Adaptive Difficulty Engine (ADE)

### 2.1 System Overview

The ADE maintains a mastery probability for each (child, skill) pair using Bayesian Knowledge Tracing. It feeds difficulty recommendations to the game engine and identifies skills needing review.

```
┌─────────────────────────────────────────────────────────────┐
│                    ADE SYSTEM BOUNDARY                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  INPUTS                    PROCESSING               OUTPUTS│
│  ───────                   ──────────               ───────│
│  • Item response           • BKT update             • Difficulty level (1-5)
│    (correct/incorrect,     • Elo rating             • Mastery probability
│     response time,         • ZPD calculation        • Next item recommendation
│     quality 0-5)           • Struggle detection     • Review scheduling trigger
│  • Session context         • Engagement scoring     • Teacher alerts
│  • Historical data         • Session end prediction • Parent insights
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Skill Key Convention

Skills are identified by a dot-separated key:

```
{subject}.{topic}.{subtopic}

Examples:
  phonics.letter_recognition.a
  phonics.letter_recognition.m
  phonics.blending.cv
  math.counting.1-10
  math.counting.11-20
  math.addition.single_digit
  science.animals.mammals
  colors.primary
  shapes.basic
```

The skill key is derived from the lesson's `subject` + `category` + `item_id` fields. If `item_id` is null, the skill key falls back to `{subject}.{topic}`.

### 2.3 Difficulty Levels

| Level | Name | Game Behavior | Hints | Time Pressure |
|-------|------|---------------|-------|---------------|
| 1 | Very Easy | Simplified questions, fewer distractors | 3 free hints | None |
| 2 | Easy | Basic questions, standard distractors | 2 free hints | None |
| 3 | Medium | Standard (default) | 1 free hint | Optional |
| 4 | Hard | Tricky questions, more distractors | None | Yes |
| 5 | Expert | Complex questions, timed | None | Strict |

### 2.4 Adjustment Rules

```
IF mastery_probability >= 0.85 AND avg_response_time < 5000ms:
    difficulty = min(current + 1, 5)
ELIF mastery_probability < 0.40 OR struggle_count >= 3:
    difficulty = max(current - 1, 1)
ELIF mastery_probability >= 0.70 AND avg_response_time < 3000ms:
    difficulty = min(current + 1, 5)  // fast + accurate = ready for more
ELSE:
    difficulty = current  // stay in zone of proximal development
```

### 2.5 Struggle Detection

A child is "struggling" when ANY of these conditions are true:
1. 3+ consecutive incorrect responses on the same skill
2. Response time increasing trend (> 2x average over last 5 responses)
3. Hint usage rate > 60% in current session
4. Accuracy dropped > 20 percentage points from session start

When struggle is detected:
- Emit `struggle_detected` event (for UI response)
- Reduce difficulty by 1
- Schedule review within 1 hour
- Optionally alert teacher (if 5+ struggles in one day)

### 2.6 Mastery Thresholds

| Probability | State | Visual | Label |
|-------------|-------|--------|-------|
| 0.00 – 0.29 | Not Started | Empty circle | "New" |
| 0.30 – 0.49 | Learning | 1/4 filled | "Learning" |
| 0.50 – 0.69 | Practicing | 2/4 filled | "Practicing" |
| 0.70 – 0.84 | Nearly There | 3/4 filled | "Almost!" |
| 0.85 – 1.00 | Mastered | Full circle + glow | "Mastered!" |

### 2.7 Data Flow

```
GAME COMPLETE EVENT
        │
        ▼
┌──────────────────┐
│ recordItemResponse│  ← per-item: correct, response_time_ms, quality
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  BKT UPDATE      │  ← update mastery_probability for this skill
│  (per skill)     │
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────────┐
│ ELO    │ │ STRUGGLE   │
│ UPDATE │ │ DETECTION  │
└───┬────┘ └─────┬──────┘
    │            │
    ▼            ▼
┌────────────────────────┐
│  NEXT ITEM SELECTION   │  ← picks optimal difficulty + skill
│  (ZPD-aware)           │
└────────────────────────┘
```

---

## 3. Spaced Repetition Engine (SRE)

### 3.1 System Overview

The SRE schedules reviews at scientifically optimal intervals using a modified SM-2+ algorithm. It replaces the current Ebbinghaus doubling approach.

### 3.2 SM-2+ Algorithm

#### Quality Rating Scale (mapped from game performance)

| Quality (q) | Game Performance | Meaning |
|-------------|-----------------|---------|
| 0 | 0% correct | Blackout — no recall |
| 1 | 1-20% correct | Incorrect, but recognized after seeing answer |
| 2 | 21-40% correct | Incorrect, but felt close |
| 3 | 41-60% correct | Correct with significant difficulty |
| 4 | 61-80% correct | Correct with hesitation |
| 5 | 81-100% correct | Perfect, instant recall |

#### Algorithm

```
function sm2Plus(card, quality):
    // card: { ease, interval, repetitions, lastReview }
    // quality: 0-5 integer

    if card.repetitions == 0:
        // First learning — always start at 1 day
        if quality >= 3:
            return {
                ease: max(1.3, 2.5 - 0.8 + 0.28 * quality - 0.02 * quality * quality),
                interval: 1,
                repetitions: 1,
                nextReview: today + 1 day
            }
        else:
            return {
                ease: card.ease,
                interval: 0,  // review again this session
                repetitions: 0,
                nextReview: today  // immediate retry
            }

    if quality >= 3:
        // Correct response
        newEase = max(1.3, card.ease + (0.1 - (0.08 + 0.02 * (5 - quality)) * (5 - quality)))

        if card.repetitions == 1:
            newInterval = 6
        else:
            newInterval = round(card.interval * newEase)

        // Cap at 365 days
        newInterval = min(365, newInterval)

        return {
            ease: newEase,
            interval: newInterval,
            repetitions: card.repetitions + 1,
            nextReview: today + newInterval days
        }
    else:
        // Incorrect — reset to learning phase
        return {
            ease: max(1.3, card.ease - 0.2),
            interval: 1,
            repetitions: 0,
            nextReview: today + 1 day
        }
```

#### Interval Growth Example

| Review # | Quality | Ease | Interval | Days Until Next |
|----------|---------|------|----------|-----------------|
| 1 | 5 | 2.50 | 1 | 1 day |
| 2 | 5 | 2.50 | 6 | 6 days |
| 3 | 4 | 2.42 | 15 | 15 days |
| 4 | 5 | 2.50 | 37 | 37 days |
| 5 | 3 | 2.22 | 82 | 82 days |
| 6 (fail) | 1 | 2.02 | 1 | 1 day (reset) |
| 7 | 4 | 2.12 | 6 | 6 days |

### 3.3 Interleaving Strategy

When a game session starts, items are interleaved:

```
function buildGameQueue(childId, skillKey):
    dueReviews = getDueReviews(childId, skillKey)  // items past their next_review_at
    newContent = getNewContent(childId, skillKey)   // items never seen

    queue = []

    // 30% of queue = due reviews (if any)
    reviewCount = min(dueReviews.length, ceil(dueQueueSize * 0.3))
    queue.push(...shuffle(dueReviews).slice(0, reviewCount))

    // 70% of queue = new content
    remainingSlots = dueQueueSize - queue.length
    queue.push(...shuffle(newContent).slice(0, remainingSlots))

    // Sort by difficulty (easy first, ramp up)
    queue.sort(byDifficultyAsc)

    return queue
```

### 3.4 Review Session Flow

```
STUDENT OPENS GAME
        │
        ▼
┌──────────────────┐
│ GET /kids/reviews │
│ /today            │  ← returns due reviews + count
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ GamePlay.tsx     │
│ checks due count │
│ shows badge      │
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────────┐
│ PLAY   │ │ REVIEW     │
│ NEW    │ │ DUE ITEMS  │
│ CONTENT│ │ FIRST      │
└───┬────┘ └─────┬──────┘
    │            │
    ▼            ▼
┌────────────────────────┐
│  GAME COMPLETE         │
│  → POST /kids/reviews  │
│    /complete           │
│  (for each item)       │
└────────────────────────┘
         │
         ▼
┌────────────────────────┐
│  SM-2+ ALGORITHM       │
│  → schedule next review│
│  → update mastery      │
└────────────────────────┘
```

### 3.5 Notification Rules

| Trigger | Notification | Channel |
|---------|-------------|---------|
| 3+ reviews due | "You have {n} items to review!" | In-app badge |
| Review overdue by 2+ days | "Don't forget! {n} items need review" | Push notification |
| Review overdue by 7+ days | "We miss you! {n} items are waiting" | Push notification |
| All reviews complete | "All caught up! Great work!" | In-app celebration |
| Streak at risk | "Play today to keep your streak!" | Push notification |

---

## 4. Engagement Economy

### 4.1 XP Earning Rules

| Action | XP Earned | Condition |
|--------|-----------|-----------|
| Daily login | 10 XP | Once per day |
| Game complete | 20 XP | Base reward |
| Perfect score (100%) | 50 XP | All items correct |
| Review completed | 15 XP | Per review item |
| Streak day bonus | streak × 5 XP | Streak = consecutive days |
| Boss defeated | 100 XP | Boss battle victory |
| Festival complete | 200 XP | Festival boss chain |
| Help classmate | 25 XP | Peer teaching recorded |
| First game of day | 10 XP bonus | First game session |

### 4.2 XP Multipliers

| Streak Length | Multiplier | Bonus |
|---------------|------------|-------|
| 0-2 days | 1.0× | None |
| 3-6 days | 1.2× | 20% bonus XP |
| 7-13 days | 1.5× | 50% bonus XP + 1 free review |
| 14-29 days | 2.0× | 100% bonus XP + exclusive companion color |
| 30+ days | 3.0× | 200% bonus XP + "Legend" badge + party mode |

### 4.3 Level System

| Level | XP Required | Cumulative XP | Unlocks |
|-------|-------------|---------------|---------|
| 1 | 0 | 0 | Basic companion (Fox) |
| 2 | 50 | 50 | Garden hat |
| 3 | 150 | 200 | Second companion (Owl) |
| 5 | 500 | 700 | Theme: Ocean |
| 7 | 1,200 | 1,900 | Third companion (Bunny) |
| 10 | 5,000 | 6,900 | Theme: Space |
| 15 | 15,000 | 21,900 | Fourth companion (Bear) |
| 20 | 35,000 | 56,900 | Theme: Forest |
| 25 | 65,000 | 121,900 | Fifth companion (Cat) |
| 30 | 100,000 | 221,900 | "Legend" title + all themes |

### 4.4 Streak Mechanics

```
function recordStreak(lastPlayDate, today):
    if lastPlayDate == today:
        // Already played today, no change
        return currentStreak

    if lastPlayDate == yesterday:
        // Consecutive day — increment
        return currentStreak + 1

    if lastPlayDate < yesterday:
        // Streak broken
        return 1  // restart
```

**Streak Freeze:**
- Earned: 1 freeze per 7-day streak
- Effect: Protects streak for 1 missed day
- Max stored: 3 freezes
- Consumed automatically if day missed

### 4.5 Shop Items

| Category | Item | Cost | Effect |
|----------|------|------|--------|
| Companion Skins | Blue Fox | 500 XP | Visual only |
| Companion Skins | Golden Owl | 500 XP | Visual only |
| Companion Skins | Rainbow Bunny | 500 XP | Visual only |
| Garden Decorations | Flower Bed | 200 XP | Visual only |
| Garden Decorations | Fountain | 400 XP | Visual only |
| Garden Decorations | Gazebo | 800 XP | Visual only |
| Themes | Ocean Theme | 1,500 XP | Full UI theme |
| Themes | Space Theme | 1,500 XP | Full UI theme |
| Themes | Forest Theme | 1,500 XP | Full UI theme |
| Badge Frames | Silver Frame | 800 XP | Profile badge frame |
| Badge Frames | Gold Frame | 800 XP | Profile badge frame |
| Background Music | Upbeat | 300 XP | Game background music |
| Background Music | Calm | 300 XP | Game background music |

### 4.6 Economy Data Flow

```
GAME COMPLETE EVENT
        │
        ▼
┌──────────────────┐
│ calculateXP()    │  ← base XP + streak bonus + multipliers
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ POST /kids/      │
│ economy/earn     │  ← server validates + records
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────────┐
│ UPDATE │ │ CHECK      │
│ XP     │ │ LEVEL UP   │
│ BALANCE│ │ CHECK      │
└───┬────┘ └─────┬──────┘
    │            │
    ▼            ▼
┌────────────────────────┐
│  RESPONSE              │
│  { xp_earned, new_total│
│    level_up: bool,     │
│    new_level: int }    │
└────────────────────────┘
```

---

## 5. API Contracts

### 5.1 Common Response Envelope

All endpoints return:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
```

### 5.2 Authentication

All endpoints require JWT in `Authorization: Bearer <token>` header.
Student-only endpoints verify `req.user.user_type === 'student'`.
Headers: `x-school-id`, `x-branch-id` (from existing middleware).

### 5.3 ADE Endpoints

#### POST /kids/adaptive/v2/update

**Purpose:** Record item response and update adaptive state.

**Request:**
```json
{
  "skill_key": "phonics.letter_recognition.a",
  "item_id": "item_abc123",
  "correct": true,
  "quality": 5,
  "response_time_ms": 2300,
  "mode": "learning",
  "distractor_count": 3
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "mastery_probability": 0.72,
    "difficulty": 3,
    "mastery_state": "practicing",
    "struggle_detected": false,
    "next_item_recommended": {
      "skill_key": "phonics.blending.cv",
      "difficulty": 3,
      "reason": "next_in_sequence"
    },
    "xp_earned": 20,
    "streak_multiplier": 1.2
  }
}
```

**Validation:**
- `skill_key`: required, string, max 100 chars
- `item_id`: required, string, max 50 chars
- `correct`: required, boolean
- `quality`: required, integer 0-5
- `response_time_ms`: optional, integer, min 0, max 300000
- `mode`: optional, enum ["learning", "practice", "test"], default "learning"
- `distractor_count`: optional, integer, min 0, max 20

---

#### GET /kids/adaptive/v2/profile

**Purpose:** Get adaptive profile for a skill.

**Query params:**
- `skill_key` (required): e.g., `phonics.letter_recognition.a`

**Response:**
```json
{
  "success": true,
  "data": {
    "skill_key": "phonics.letter_recognition.a",
    "mastery_probability": 0.72,
    "difficulty": 3,
    "mastery_state": "practicing",
    "total_attempts": 15,
    "correct_attempts": 11,
    "avg_response_time_ms": 2800,
    "last_practiced_at": "2027-01-15T10:30:00Z",
    "next_review_at": "2027-01-22T10:30:00Z",
    "streak_days": 5,
    "elo_rating": 1150
  }
}
```

---

#### GET /kids/adaptive/v2/next-item

**Purpose:** Get the next optimal item for the child to play.

**Query params:**
- `subject` (optional): filter by subject
- `count` (optional): number of items, default 5, max 20

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "skill_key": "phonics.blending.cv",
        "item_id": "item_xyz",
        "difficulty": 3,
        "reason": "next_in_sequence",
        "mastery_probability": 0.45,
        "lesson_id": "lesson_123"
      }
    ],
    "review_items": [
      {
        "skill_key": "phonics.letter_recognition.a",
        "item_id": "item_abc",
        "next_review_at": "2027-01-15T10:30:00Z",
        "reason": "review_due"
      }
    ],
    "session_recommendation": {
      "focus_skill": "phonics.blending.cv",
      "estimated_duration_min": 8,
      "difficulty_range": [2, 4]
    }
  }
}
```

---

#### GET /kids/adaptive/v2/skills

**Purpose:** Get all skills and their mastery states for the child.

**Response:**
```json
{
  "success": true,
  "data": {
    "skills": [
      {
        "skill_key": "phonics.letter_recognition.a",
        "mastery_probability": 0.92,
        "mastery_state": "mastered",
        "difficulty": 4,
        "last_practiced_at": "2027-01-14T09:00:00Z"
      },
      {
        "skill_key": "phonics.blending.cv",
        "mastery_probability": 0.45,
        "mastery_state": "learning",
        "difficulty": 2,
        "last_practiced_at": "2027-01-15T10:30:00Z"
      }
    ],
    "summary": {
      "total_skills": 24,
      "mastered": 8,
      "practicing": 10,
      "learning": 6,
      "new": 0
    }
  }
}
```

---

### 5.4 SRE Endpoints

#### GET /kids/reviews/v2/today

**Purpose:** Get today's review queue.

**Response:**
```json
{
  "success": true,
  "data": {
    "due_count": 5,
    "overdue_count": 2,
    "reviews": [
      {
        "review_id": "rev_123",
        "skill_key": "phonics.letter_recognition.a",
        "item_id": "item_abc",
        "lesson_id": "lesson_456",
        "lesson_title": "Letter A",
        "next_review_at": "2027-01-15T00:00:00Z",
        "days_overdue": 2,
        "current_interval_days": 6,
        "mastery_probability": 0.72,
        "quality_last": 4
      }
    ],
    "streak": {
      "current": 5,
      "longest": 12,
      "freeze_available": 2
    }
  }
}
```

---

#### POST /kids/reviews/v2/complete

**Purpose:** Record review completion and schedule next interval.

**Request:**
```json
{
  "review_id": "rev_123",
  "skill_key": "phonics.letter_recognition.a",
  "quality": 4,
  "response_time_ms": 1800,
  "correct": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "next_review_at": "2027-02-05T00:00:00Z",
    "interval_days": 21,
    "mastery_probability": 0.78,
    "mastery_state": "practicing",
    "xp_earned": 15,
    "reviews_remaining": 4
  }
}
```

---

#### GET /kids/reviews/v2/stats

**Purpose:** Get review statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "total_items": 45,
    "due_today": 5,
    "overdue": 2,
    "mastered": 18,
    "streak_days": 5,
    "best_streak": 12,
    "avg_accuracy": 76,
    "reviews_this_week": 23,
    "avg_interval_days": 8.5
  }
}
```

---

### 5.5 Economy Endpoints

#### GET /kids/economy/balance

**Purpose:** Get current XP balance, level, and streak.

**Response:**
```json
{
  "success": true,
  "data": {
    "xp_total": 2450,
    "xp_current_level": 350,
    "xp_next_level": 500,
    "level": 3,
    "level_name": "Explorer",
    "streak": {
      "current": 5,
      "longest": 12,
      "freeze_count": 2,
      "last_play_date": "2027-01-15"
    },
    "multiplier": 1.2,
    "title": "Explorer",
    "badges": ["first_game", "streak_7", "perfect_score"]
  }
}
```

---

#### POST /kids/economy/earn

**Purpose:** Award XP for an action.

**Request:**
```json
{
  "action": "game_complete",
  "amount": 20,
  "context": {
    "lesson_id": "lesson_123",
    "score": 100,
    "perfect": true
  }
}
```

**Validation:**
- `action`: required, enum ["daily_login", "game_complete", "perfect_score", "review_complete", "boss_defeated", "festival_complete", "help_classmate", "first_game_of_day"]
- `amount`: required, integer, min 1, max 500
- `context`: optional, object

**Response:**
```json
{
  "success": true,
  "data": {
    "xp_earned": 75,
    "base_amount": 20,
    "streak_bonus": 15,
    "multiplier_applied": 1.2,
    "new_total": 2525,
    "level_up": false,
    "new_level": 3,
    "xp_to_next_level": 275
  }
}
```

---

#### POST /kids/economy/streak/record

**Purpose:** Record daily play for streak tracking.

**Response:**
```json
{
  "success": true,
  "data": {
    "streak": 6,
    "streak_increased": true,
    "freeze_used": false,
    "multiplier": 1.2,
    "milestone_reached": null,
    "congrats_message": "6 days in a row! Keep going!"
  }
}
```

---

#### GET /kids/economy/shop

**Purpose:** Get available shop items.

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "companion_skins",
        "name": "Companion Skins",
        "items": [
          {
            "id": "skin_blue_fox",
            "name": "Blue Fox",
            "description": "A cool blue variant of your Fox companion",
            "cost": 500,
            "type": "companion_skin",
            "preview_url": "/media/shop/blue_fox.png",
            "owned": false,
            "equipped": false
          }
        ]
      }
    ],
    "balance": 2525
  }
}
```

---

#### POST /kids/economy/shop/buy

**Purpose:** Purchase a shop item.

**Request:**
```json
{
  "item_id": "skin_blue_fox"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "item_id": "skin_blue_fox",
    "cost": 500,
    "new_balance": 2025,
    "owned_items": ["skin_blue_fox"]
  }
}
```

**Error (insufficient XP):**
```json
{
  "success": false,
  "message": "Not enough XP. You need 500 XP but have 200 XP.",
  "data": {
    "required": 500,
    "available": 200,
    "shortfall": 300
  }
}
```

---

#### POST /kids/economy/shop/equip

**Purpose:** Equip an owned item.

**Request:**
```json
{
  "item_id": "skin_blue_fox"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "equipped": "skin_blue_fox",
    "category": "companion_skin"
  }
}
```

---

### 5.6 Modified Existing Endpoints

#### POST /kids/progress/game-complete (MODIFIED)

**Additional fields in request:**
```json
{
  "lesson_id": "...",
  "game_config_id": "...",
  "score": 100,
  "stars_earned": 3,
  "xp": 50,
  "mode": "learning",
  "difficulty": 3,
  "idempotency_key": "...",
  "item_responses": [
    {
      "item_id": "item_abc",
      "correct": true,
      "quality": 5,
      "response_time_ms": 2300,
      "distractor_count": 3
    }
  ],
  "session_duration_ms": 480000,
  "hints_used": 1,
  "combo_max": 7
}
```

**Additional fields in response:**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "xp_earned": 75,
    "xp_breakdown": {
      "base": 20,
      "perfect_bonus": 30,
      "streak_bonus": 15,
      "multiplier": 1.2
    },
    "level_up": false,
    "new_level": 3,
    "mastery_updates": [
      {
        "skill_key": "phonics.letter_recognition.a",
        "old_probability": 0.65,
        "new_probability": 0.72,
        "mastery_state": "practicing"
      }
    ],
    "reviews_scheduled": 2,
    "streak": {
      "current": 6,
      "multiplier": 1.2
    }
  }
}
```

---

## 6. Database Schemas (DDL)

### 6.1 New Tables

#### kids_adaptive_state_v2

```sql
CREATE TABLE IF NOT EXISTS kids_adaptive_state_v2 (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  school_id VARCHAR(40) NOT NULL,
  skill_key VARCHAR(100) NOT NULL,

  -- BKT parameters
  mastery_probability DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  bkt_p_learning DECIMAL(5,4) NOT NULL DEFAULT 0.3000,     -- P(learn on each attempt)
  bkt_p_guess DECIMAL(5,4) NOT NULL DEFAULT 0.2500,        -- P(correct when not learned)
  bkt_p_slip DECIMAL(5,4) NOT NULL DEFAULT 0.1000,         -- P(incorrect when learned)
  bkt_p_transit DECIMAL(5,4) NOT NULL DEFAULT 0.1000,      -- P(learn on next attempt)

  -- Elo rating
  elo_rating INT NOT NULL DEFAULT 1000,

  -- Difficulty
  current_difficulty TINYINT NOT NULL DEFAULT 3,

  -- Performance metrics
  total_attempts INT NOT NULL DEFAULT 0,
  correct_attempts INT NOT NULL DEFAULT 0,
  avg_response_time_ms INT NOT NULL DEFAULT 0,
  last_5_response_times JSON,  -- ring buffer of last 5 response times

  -- Struggle tracking
  consecutive_wrong INT NOT NULL DEFAULT 0,
  struggle_count_today INT NOT NULL DEFAULT 0,
  last_struggle_at DATETIME NULL,

  -- Streak
  streak_days INT NOT NULL DEFAULT 0,
  last_practiced_at DATETIME NULL,

  -- ZPD (Zone of Proximal Development)
  zpd_lower DECIMAL(5,3) NOT NULL DEFAULT 0.300,
  zpd_upper DECIMAL(5,3) NOT NULL DEFAULT 0.700,

  -- Timestamps
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_adaptive_v2_child_skill (child_admission_no, skill_key),
  KEY idx_adaptive_v2_child (child_admission_no),
  KEY idx_adaptive_v2_mastery (mastery_probability),
  KEY idx_adaptive_v2_difficulty (current_difficulty),
  KEY idx_adaptive_v2_review (last_practiced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### kids_review_schedule_v2

```sql
CREATE TABLE IF NOT EXISTS kids_review_schedule_v2 (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  skill_key VARCHAR(100) NOT NULL,
  item_id VARCHAR(50) NOT NULL,

  -- SM-2+ parameters
  ease DECIMAL(5,3) NOT NULL DEFAULT 2.500,
  interval_days INT NOT NULL DEFAULT 1,
  repetitions INT NOT NULL DEFAULT 0,
  last_quality TINYINT NULL,

  -- Scheduling
  next_review_at DATETIME NOT NULL,
  last_reviewed_at DATETIME NULL,

  -- Status
  status ENUM('active', 'completed', 'suspended') NOT NULL DEFAULT 'active',

  -- Timestamps
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_review_v2_child_item (child_admission_no, skill_key, item_id),
  KEY idx_review_v2_child (child_admission_no),
  KEY idx_review_v2_next (next_review_at),
  KEY idx_review_v2_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### kids_economy

```sql
CREATE TABLE IF NOT EXISTS kids_economy (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  school_id VARCHAR(40) NOT NULL,

  -- XP
  xp_total INT NOT NULL DEFAULT 0,
  xp_session_today INT NOT NULL DEFAULT 0,

  -- Level
  level INT NOT NULL DEFAULT 1,
  level_name VARCHAR(50) NOT NULL DEFAULT 'Beginner',

  -- Streak
  streak_current INT NOT NULL DEFAULT 0,
  streak_longest INT NOT NULL DEFAULT 0,
  streak_freeze_count TINYINT NOT NULL DEFAULT 0,
  last_play_date DATE NULL,

  -- Multiplier
  current_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.00,

  -- Title
  title VARCHAR(100) NULL,

  -- Timestamps
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_economy_child (child_admission_no),
  KEY idx_economy_level (level),
  KEY idx_economy_xp (xp_total)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### kids_economy_transactions

```sql
CREATE TABLE IF NOT EXISTS kids_economy_transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  action VARCHAR(50) NOT NULL,
  amount INT NOT NULL,
  base_amount INT NOT NULL,
  streak_bonus INT NOT NULL DEFAULT 0,
  multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  context JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_econ_tx_child (child_admission_no),
  KEY idx_econ_tx_action (action),
  KEY idx_econ_tx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### kids_shop_items

```sql
CREATE TABLE IF NOT EXISTS kids_shop_items (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  cost INT NOT NULL,
  item_type VARCHAR(50) NOT NULL,
  preview_url VARCHAR(500) NULL,
  metadata JSON,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_shop_category (category),
  KEY idx_shop_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### kids_shop_purchases

```sql
CREATE TABLE IF NOT EXISTS kids_shop_purchases (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  item_id VARCHAR(50) NOT NULL,
  cost INT NOT NULL,
  equipped BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_purchase_child_item (child_admission_no, item_id),
  KEY idx_purchase_child (child_admission_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### kids_economy_milestones

```sql
CREATE TABLE IF NOT EXISTS kids_economy_milestones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  milestone_type VARCHAR(50) NOT NULL,  -- 'streak_7', 'level_5', 'perfect_10'
  milestone_value INT NOT NULL,
  achieved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reward_type VARCHAR(50) NULL,
  reward_value VARCHAR(200) NULL,

  UNIQUE KEY uq_milestone_child_type (child_admission_no, milestone_type),
  KEY idx_milestone_child (child_admission_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6.2 Modified Tables

#### kids_game_item_responses (ADD COLUMNS)

```sql
ALTER TABLE kids_game_item_responses
  ADD COLUMN quality TINYINT NULL COMMENT 'SM-2 quality rating 0-5' AFTER correct,
  ADD COLUMN skill_key VARCHAR(100) NULL COMMENT 'ADE skill key' AFTER quality,
  ADD COLUMN mastery_before DECIMAL(5,4) NULL COMMENT 'mastery before this response' AFTER skill_key,
  ADD COLUMN mastery_after DECIMAL(5,4) NULL COMMENT 'mastery after this response' AFTER mastery_before;
```

#### kids_progress (ADD COLUMNS)

```sql
ALTER TABLE kids_progress
  ADD COLUMN xp_breakdown JSON NULL COMMENT 'detailed XP calculation' AFTER xp,
  ADD COLUMN mastery_updates JSON NULL COMMENT 'per-skill mastery changes' AFTER xp_breakdown,
  ADD COLUMN reviews_scheduled INT NULL COMMENT 'number of reviews scheduled' AFTER mastery_updates,
  ADD COLUMN streak_current INT NULL COMMENT 'streak at time of completion' AFTER reviews_scheduled;
```

### 6.3 Migration Order

```sql
-- 1. Create new tables (no dependencies)
-- kids_adaptive_state_v2
-- kids_review_schedule_v2
-- kids_economy
-- kids_economy_transactions
-- kids_shop_items
-- kids_shop_purchases
-- kids_economy_milestones

-- 2. Alter existing tables (safe additive columns)
-- kids_game_item_responses ADD quality, skill_key, mastery_before, mastery_after
-- kids_progress ADD xp_breakdown, mastery_updates, reviews_scheduled, streak_current

-- 3. Seed shop items (INSERT INTO kids_shop_items ...)

-- 4. Migrate existing adaptive data (one-time script)
-- INSERT INTO kids_adaptive_state_v2 (child_admission_no, school_id, skill_key, ...)
-- SELECT child_admission_no, school_id, CONCAT(subject, '.', topic), ...
-- FROM kids_adaptive_profiles
```

---

## 7. TypeScript Types

### 7.1 Shared Types (frontend/src/lib/types/adaptive.ts)

```typescript
// ─── ADE Types ─────────────────────────────────────────

export type MasteryState = 'new' | 'learning' | 'practicing' | 'nearly_there' | 'mastered';

export interface AdaptiveSkillState {
  skill_key: string;
  mastery_probability: number;  // 0.0 - 1.0
  mastery_state: MasteryState;
  difficulty: 1 | 2 | 3 | 4 | 5;
  total_attempts: number;
  correct_attempts: number;
  avg_response_time_ms: number;
  last_practiced_at: string | null;
  next_review_at: string | null;
  streak_days: number;
  elo_rating: number;
}

export interface AdaptiveProfileResponse {
  skills: AdaptiveSkillState[];
  summary: {
    total_skills: number;
    mastered: number;
    practicing: number;
    learning: number;
    new: number;
  };
}

export interface ItemResponse {
  skill_key: string;
  item_id: string;
  correct: boolean;
  quality: 0 | 1 | 2 | 3 | 4 | 5;
  response_time_ms?: number;
  mode?: 'learning' | 'practice' | 'test';
  distractor_count?: number;
}

export interface AdaptiveUpdateResponse {
  mastery_probability: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  mastery_state: MasteryState;
  struggle_detected: boolean;
  next_item_recommended: {
    skill_key: string;
    difficulty: number;
    reason: string;
  } | null;
  xp_earned: number;
  streak_multiplier: number;
}

// ─── SRE Types ─────────────────────────────────────────

export interface ReviewItem {
  review_id: string;
  skill_key: string;
  item_id: string;
  lesson_id: string;
  lesson_title: string;
  next_review_at: string;
  days_overdue: number;
  current_interval_days: number;
  mastery_probability: number;
  quality_last: number | null;
}

export interface ReviewStats {
  total_items: number;
  due_today: number;
  overdue: number;
  mastered: number;
  streak_days: number;
  best_streak: number;
  avg_accuracy: number;
  reviews_this_week: number;
  avg_interval_days: number;
}

export interface ReviewCompleteResponse {
  next_review_at: string;
  interval_days: number;
  mastery_probability: number;
  mastery_state: MasteryState;
  xp_earned: number;
  reviews_remaining: number;
}

// ─── Economy Types ─────────────────────────────────────

export type EconomyAction =
  | 'daily_login'
  | 'game_complete'
  | 'perfect_score'
  | 'review_complete'
  | 'boss_defeated'
  | 'festival_complete'
  | 'help_classmate'
  | 'first_game_of_day';

export interface EconomyBalance {
  xp_total: number;
  xp_current_level: number;
  xp_next_level: number;
  level: number;
  level_name: string;
  streak: {
    current: number;
    longest: number;
    freeze_count: number;
    last_play_date: string | null;
  };
  multiplier: number;
  title: string | null;
  badges: string[];
}

export interface EarnXPResponse {
  xp_earned: number;
  base_amount: number;
  streak_bonus: number;
  multiplier_applied: number;
  new_total: number;
  level_up: boolean;
  new_level: number;
  xp_to_next_level: number;
}

export interface StreakResponse {
  streak: number;
  streak_increased: boolean;
  freeze_used: boolean;
  multiplier: number;
  milestone_reached: string | null;
  congrats_message: string;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: string;
  preview_url: string;
  owned: boolean;
  equipped: boolean;
}

export interface ShopCategory {
  id: string;
  name: string;
  items: ShopItem[];
}

export interface LevelDefinition {
  level: number;
  xp_required: number;
  cumulative_xp: number;
  title: string;
  unlocks: string[];
}

// ─── Constants ─────────────────────────────────────────

export const MASTERY_THRESHOLDS = {
  NEW: 0,
  LEARNING: 0.30,
  PRACTICING: 0.50,
  NEARLY_THERE: 0.70,
  MASTERED: 0.85,
} as const;

export const DIFFICULTY_NAMES = {
  1: 'Very Easy',
  2: 'Easy',
  3: 'Medium',
  4: 'Hard',
  5: 'Expert',
} as const;

export const XP_ACTIONS: Record<EconomyAction, number> = {
  daily_login: 10,
  game_complete: 20,
  perfect_score: 50,
  review_complete: 15,
  boss_defeated: 100,
  festival_complete: 200,
  help_classmate: 25,
  first_game_of_day: 10,
};

export const STREAK_MULTIPLIERS = [
  { min_days: 0, multiplier: 1.0 },
  { min_days: 3, multiplier: 1.2 },
  { min_days: 7, multiplier: 1.5 },
  { min_days: 14, multiplier: 2.0 },
  { min_days: 30, multiplier: 3.0 },
] as const;

export const LEVELS: LevelDefinition[] = [
  { level: 1, xp_required: 0, cumulative_xp: 0, title: 'Beginner', unlocks: ['Basic companion (Fox)'] },
  { level: 2, xp_required: 50, cumulative_xp: 50, title: 'Explorer', unlocks: ['Garden hat'] },
  { level: 3, xp_required: 150, cumulative_xp: 200, title: 'Adventurer', unlocks: ['Second companion (Owl)'] },
  { level: 5, xp_required: 500, cumulative_xp: 700, title: 'Scholar', unlocks: ['Theme: Ocean'] },
  { level: 7, xp_required: 1200, cumulative_xp: 1900, title: 'Expert', unlocks: ['Third companion (Bunny)'] },
  { level: 10, xp_required: 5000, cumulative_xp: 6900, title: 'Master', unlocks: ['Theme: Space'] },
  { level: 15, xp_required: 15000, cumulative_xp: 21900, title: 'Champion', unlocks: ['Fourth companion (Bear)'] },
  { level: 20, xp_required: 35000, cumulative_xp: 56900, title: 'Legend', unlocks: ['Theme: Forest'] },
  { level: 25, xp_required: 65000, cumulative_xp: 121900, title: 'Hero', unlocks: ['Fifth companion (Cat)'] },
  { level: 30, xp_required: 100000, cumulative_xp: 221900, title: 'Grandmaster', unlocks: ['All themes + "Legend" title'] },
];
```

### 7.2 API Endpoint Types (frontend/src/lib/api/endpoints.ts additions)

```typescript
// Add to ENDPOINTS object:

ADE_V2: {
  UPDATE: '/kids/adaptive/v2/update',
  PROFILE: (skillKey: string) => `/kids/adaptive/v2/profile?skill_key=${encodeURIComponent(skillKey)}`,
  NEXT_ITEM: (subject?: string, count?: number) =>
    `/kids/adaptive/v2/next-item${subject ? `?subject=${encodeURIComponent(subject)}` : ''}${count ? `${subject ? '&' : '?'}count=${count}` : ''}`,
  SKILLS: '/kids/adaptive/v2/skills',
},

REVIEWS_V2: {
  TODAY: '/kids/reviews/v2/today',
  COMPLETE: '/kids/reviews/v2/complete',
  STATS: '/kids/reviews/v2/stats',
},

ECONOMY: {
  BALANCE: '/kids/economy/balance',
  EARN: '/kids/economy/earn',
  STREAK_RECORD: '/kids/economy/streak/record',
  SHOP: '/kids/economy/shop',
  SHOP_BUY: '/kids/economy/shop/buy',
  SHOP_EQUIP: '/kids/economy/shop/equip',
},
```

---

## 8. Algorithm Specifications

### 8.1 Bayesian Knowledge Tracing (BKT)

#### Parameters

| Parameter | Symbol | Default | Meaning |
|-----------|--------|---------|---------|
| P(learn) | p_L | 0.30 | Probability of learning the skill on each attempt |
| P(guess) | p_G | 0.25 | Probability of correct response when not learned |
| P(slip) | p_S | 0.10 | Probability of incorrect response when learned |
| P(transition) | p_T | 0.10 | Probability of learning on next attempt (forgetting correction) |

#### Update Algorithm

```
function bktUpdate(skill_state, correct):
    // skill_state: { p_knows, p_L, p_G, p_S, p_T }

    p_knows = skill_state.p_knows

    if correct:
        // P(knows | correct) = P(correct | knows) * P(knows) / P(correct)
        p_correct_given_knows = 1 - p_S
        p_correct_given_not_knows = p_G
        p_correct = p_correct_given_knows * p_knows + p_correct_given_not_knows * (1 - p_knows)

        p_knows_given_correct = (p_correct_given_knows * p_knows) / p_correct

        // Apply transition (learning might have happened)
        p_knows_after = p_knows_given_correct + (1 - p_knows_given_correct) * p_T
    else:
        // P(knows | incorrect) = P(incorrect | knows) * P(knows) / P(incorrect)
        p_incorrect_given_knows = p_S
        p_incorrect_given_not_knows = 1 - p_G
        p_incorrect = p_incorrect_given_knows * p_knows + p_incorrect_given_not_knows * (1 - p_knows)

        p_knows_given_incorrect = (p_incorrect_given_knows * p_knows) / p_incorrect

        // No transition on incorrect (standard BKT assumption)
        p_knows_after = p_knows_given_incorrect

    return clamp(p_knows_after, 0.001, 0.999)
```

#### Mastery State Mapping

```
function getMasteryState(probability):
    if probability >= 0.85: return 'mastered'
    if probability >= 0.70: return 'nearly_there'
    if probability >= 0.50: return 'practicing'
    if probability >= 0.30: return 'learning'
    return 'new'
```

### 8.2 Elo Rating System

#### Parameters

| Parameter | Value | Meaning |
|-----------|-------|---------|
| K-factor | 32 | Sensitivity of rating changes |
| Initial rating | 1000 | Starting Elo for new skills |
| Min rating | 100 | Floor |
| Max rating | 3000 | Ceiling |

#### Update Algorithm

```
function eloUpdate(student_elo, item_elo, correct):
    // Expected score
    expected = 1 / (1 + Math.pow(10, (item_elo - student_elo) / 400))

    // Actual score
    actual = correct ? 1 : 0

    // New rating
    new_elo = student_elo + K * (actual - expected)

    return clamp(new_elo, MIN_RATING, MAX_RATING)
```

### 8.3 Struggle Detection Algorithm

```
function detectStruggle(adaptive_state, current_response):
    signals = []

    // Signal 1: Consecutive wrong answers
    if adaptive_state.consecutive_wrong >= 3:
        signals.push({ type: 'consecutive_wrong', count: adaptive_state.consecutive_wrong })

    // Signal 2: Response time increasing
    last_5 = adaptive_state.last_5_response_times || []
    if last_5.length >= 3:
        trend = calculateTrend(last_5)
        if trend > 1.5:  // 50% slower than average
            signals.push({ type: 'slowing_down', trend })

    // Signal 3: Hint abuse
    if current_response.hints_used > current_response.total_items * 0.6:
        signals.push({ type: 'hint_abuse', rate: current_response.hints_used / current_response.total_items })

    // Signal 4: Accuracy drop
    session_start_accuracy = current_response.session_accuracy_start
    current_accuracy = current_response.session_accuracy_current
    if session_start_accuracy - current_accuracy > 20:
        signals.push({ type: 'accuracy_drop', drop: session_start_accuracy - current_accuracy })

    return {
        struggling: signals.length > 0,
        signals,
        severity: signals.length >= 3 ? 'high' : signals.length >= 2 ? 'medium' : 'low'
    }
```

### 8.4 SM-2+ Full Implementation

```
function sm2PlusUpdate(card, quality):
    // card: { ease, interval_days, repetitions, last_quality }
    // quality: 0-5

    q = clamp(quality, 0, 5)

    if card.repetitions === 0:
        // First review
        if q >= 3:
            newEase = Math.max(1.3, 2.5 - 0.8 + 0.28 * q - 0.02 * q * q)
            newInterval = 1
            newReps = 1
        else:
            newEase = card.ease
            newInterval = 0  // retry immediately
            newReps = 0
    else:
        if q >= 3:
            // Correct
            newEase = Math.max(1.3, card.ease + (0.1 - (0.08 + 0.02 * (5 - q)) * (5 - q)))

            if card.repetitions === 1:
                newInterval = 6
            else:
                newInterval = Math.round(card.interval_days * newEase)

            newInterval = Math.min(365, newInterval)
            newReps = card.repetitions + 1
        else:
            // Incorrect — reset
            newEase = Math.max(1.3, card.ease - 0.2)
            newInterval = 1
            newReps = 0

    nextReview = addDays(today, newInterval)

    return {
        ease: round(newEase, 3),
        interval_days: newInterval,
        repetitions: newReps,
        last_quality: q,
        next_review_at: nextReview
    }
```

### 8.5 XP Calculation

```
function calculateXP(action, context):
    base = XP_TABLE[action]

    // Perfect score bonus
    perfect_bonus = (action === 'game_complete' && context.score === 100) ? 30 : 0

    // Streak bonus
    streak_bonus = context.streak_current * 5

    // Total before multiplier
    subtotal = base + perfect_bonus + streak_bonus

    // Apply multiplier
    multiplier = getStreakMultiplier(context.streak_current)
    total = Math.round(subtotal * multiplier)

    return {
        xp_earned: total,
        base_amount: base,
        perfect_bonus,
        streak_bonus,
        multiplier_applied: multiplier
    }
```

### 8.6 Level Calculation

```
function calculateLevel(xp_total):
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (xp_total >= LEVELS[i].cumulative_xp) {
            return {
                level: LEVELS[i].level,
                level_name: LEVELS[i].title,
                xp_in_level: xp_total - LEVELS[i].cumulative_xp,
                xp_to_next: (LEVELS[i + 1]?.cumulative_xp || LEVELS[i].cumulative_xp) - LEVELS[i].cumulative_xp,
                level_up: false
            }
        }
    }
    return { level: 1, level_name: 'Beginner', xp_in_level: 0, xp_to_next: 50, level_up: false }
```

---

## 9. Test Plans

### 9.1 Backend Test Matrix

#### ADE Tests

| Test ID | Description | Input | Expected | Priority |
|---------|-------------|-------|----------|----------|
| ADE-T01 | BKT update — correct response | p_knows=0.3, correct=true | p_knows > 0.3 | P0 |
| ADE-T02 | BKT update — incorrect response | p_knows=0.7, correct=false | p_knows < 0.7 | P0 |
| ADE-T03 | BKT boundary — starts at 0.001 | p_knows=0.001, correct=false | p_knows = 0.001 (clamped) | P0 |
| ADE-T04 | BKT boundary — caps at 0.999 | p_knows=0.999, correct=true | p_knows = 0.999 (clamped) | P0 |
| ADE-T05 | Elo update — correct | elo=1000, item_elo=1000, correct=true | elo > 1000 | P0 |
| ADE-T06 | Elo update — incorrect | elo=1000, item_elo=1000, correct=false | elo < 1000 | P0 |
| ADE-T07 | Difficulty increase | mastery=0.9, response_time=2000 | difficulty + 1 (max 5) | P0 |
| ADE-T08 | Difficulty decrease | mastery=0.2 | difficulty - 1 (min 1) | P0 |
| ADE-T09 | Struggle detection — 3 consecutive wrong | consecutive_wrong=3 | struggling=true | P0 |
| ADE-T10 | Struggle detection — no struggle | consecutive_wrong=0, fast responses | struggling=false | P1 |
| ADE-T11 | Mastery state mapping | probability=0.85 | state='mastered' | P0 |
| ADE-T12 | New skill creation | first response | new row in kids_adaptive_state_v2 | P0 |
| ADE-T13 | Existing skill update | second response | row updated, not duplicated | P0 |
| ADE-T14 | Next item — no data | new child | returns default difficulty 3 items | P1 |
| ADE-T15 | Next item — skill filtering | subject='phonics' | only phonics skills returned | P1 |

#### SRE Tests

| Test ID | Description | Input | Expected | Priority |
|---------|-------------|-------|----------|----------|
| SRE-T01 | SM-2+ — quality 5, first review | ease=2.5, reps=0, q=5 | interval=1, reps=1 | P0 |
| SRE-T02 | SM-2+ — quality 5, second review | ease=2.5, reps=1, q=5 | interval=6, reps=2 | P0 |
| SRE-T03 | SM-2+ — quality 1 (fail) | reps=3, q=1 | interval=1, reps=0 (reset) | P0 |
| SRE-T04 | SM-2+ — ease never below 1.3 | q=0 repeatedly | ease >= 1.3 | P0 |
| SRE-T05 | SM-2+ — interval cap at 365 | high ease, many reps | interval <= 365 | P0 |
| SRE-T06 | Due reviews — today | next_review_at = today | included in results | P0 |
| SRE-T07 | Due reviews — overdue | next_review_at = 3 days ago | included, days_overdue=3 | P0 |
| SRE-T08 | Due reviews — not due | next_review_at = tomorrow | excluded | P0 |
| SRE-T09 | Mark complete | quality=4 | next_review_at updated | P0 |
| SRE-T10 | Review stats | various reviews | correct counts returned | P1 |

#### Economy Tests

| Test ID | Description | Input | Expected | Priority |
|---------|-------------|-------|----------|----------|
| ECO-T01 | Earn XP | action='game_complete' | xp_earned=20, new_total updated | P0 |
| ECO-T02 | XP with streak multiplier | streak=7, action='game_complete' | xp_earned > 20 (1.5x) | P0 |
| ECO-T03 | Level up | xp crosses threshold | level_up=true, new_level correct | P0 |
| ECO-T04 | Streak increment | last_play=yesterday | streak + 1 | P0 |
| ECO-T05 | Streak reset | last_play=3 days ago | streak = 1 | P0 |
| ECO-T06 | Streak freeze | freeze_count=1, missed day | streak preserved, freeze_count=0 | P1 |
| ECO-T07 | Buy item | balance=500, cost=300 | owned=true, balance=200 | P0 |
| ECO-T08 | Buy item — insufficient | balance=100, cost=300 | error, balance unchanged | P0 |
| ECO-T09 | Equip item | owned item | equipped=true | P1 |
| ECO-T10 | Daily login XP | action='daily_login' | 10 XP, once per day | P0 |
| ECO-T11 | Transaction history | after earning | transaction record created | P1 |
| ECO-T12 | Milestone — streak 7 | streak reaches 7 | milestone recorded, reward given | P1 |

### 9.2 Frontend Test Matrix

| Test ID | Component | Description | Priority |
|---------|-----------|-------------|----------|
| FE-T01 | XPBar | Renders with correct XP and level | P0 |
| FE-T02 | XPBar | Level-up animation triggers | P0 |
| FE-T03 | StreakCounter | Shows correct streak count | P0 |
| FE-T04 | StreakCounter | Freeze indicator shows when available | P1 |
| FE-T05 | MasteryGlow | Correct visual for each mastery state | P0 |
| FE-T06 | StruggleAlert | Shows when struggle detected | P0 |
| FE-T07 | Shop | Lists categories and items | P1 |
| FE-T08 | Shop | Buy button disabled when insufficient XP | P1 |
| FE-T09 | ReviewDueBadge | Shows correct count | P0 |
| FE-T10 | LevelUpOverlay | Triggers on level up | P1 |

### 9.3 Integration Tests

| Test ID | Flow | Steps | Expected | Priority |
|---------|------|-------|----------|----------|
| INT-T01 | Full game → ADE → SRE → Economy | Complete game with 5 items | All systems updated correctly | P0 |
| INT-T02 | Struggle → Difficulty drop → Recovery | 3 wrong → difficulty drops → 2 right → difficulty rises | Smooth difficulty curve | P0 |
| INT-T03 | Review due → Play → Schedule next | Play game with due reviews | Reviews completed, next scheduled | P0 |
| INT-T04 | Streak day 7 → Multiplier → XP bonus | Play 7 consecutive days | 1.5x multiplier applied | P0 |
| INT-T05 | Level up → Shop unlock | Reach level 3 | Owl companion available in shop | P1 |

---

## 10. Error Handling & Edge Cases

### 10.1 Error Response Format

> Use the centralized `backend/src/services/responseHelper.js` (`sendError`/`sendSuccess`)
> so error codes are exposed as `error_code` and consumed by the frontend `mapApiError()`
> (`frontend/src/lib/api/mapApiError.ts`). This matches the codebase-wide envelope convention.

```json
{
  "success": false,
  "message": "Human-readable error message",
  "error_code": "ADE_INVALID_SKILL_KEY",
  "data": null
}
```

### 10.2 Error Codes

| Code | HTTP | Message | Cause |
|------|------|---------|-------|
| `ADE_INVALID_SKILL_KEY` | 400 | "skill_key is required and must be a string" | Missing or invalid skill_key |
| `ADE_INVALID_QUALITY` | 400 | "quality must be an integer between 0 and 5" | Invalid quality value |
| `ADE_INVALID_ITEM_ID` | 400 | "item_id is required" | Missing item_id |
| `ADE_SKILL_NOT_FOUND` | 404 | "Skill not found for this student" | GET profile for non-existent skill |
| `SRE_NO_REVIEWS_DUE` | 200 | "No reviews due today" | Success with empty array |
| `SRE_REVIEW_NOT_FOUND` | 404 | "Review not found" | Invalid review_id |
| `SRE_INVALID_QUALITY` | 400 | "quality must be an integer between 0 and 5" | Invalid quality |
| `ECO_INSUFFICIENT_XP` | 400 | "Not enough XP" | Balance < cost |
| `ECO_ITEM_NOT_FOUND` | 404 | "Item not found in shop" | Invalid item_id |
| `ECO_ITEM_ALREADY_OWNED` | 409 | "You already own this item" | Duplicate purchase |
| `ECO_ITEM_NOT_OWNED` | 400 | "You don't own this item" | Equip non-owned item |
| `ECO_DAILY_LIMIT_REACHED` | 429 | "Daily login XP already claimed" | Double daily login |
| `ECO_INVALID_ACTION` | 400 | "Invalid action type" | Unknown action |

### 10.3 Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Child plays multiple games in one session | Each game update is independent; streak counted once per day |
| Network failure during game complete | Client queues update in IndexedDB; sync on reconnect |
| Two concurrent game completes | Idempotency key prevents duplicate XP |
| Skill key doesn't match any lesson | ADE creates profile with default parameters; no crash |
| All items mastered — nothing to practice | Return new content from unmastered skills; if all mastered, return "mastery challenge" (harder variants) |
| Review schedule has 0 items | SRE returns empty array; no error |
| Level 30+ reached | XP continues to accumulate; no more level-ups; "Grandmaster" title displayed |
| Streak freeze used on last freeze | Streak resets; no error |
| Shop item deleted after purchase | Purchase record kept; item marked as "discontinued" in shop |
| BKT probability reaches 0.999 | Clamped; skill marked as "mastered" |
| Response time = 0ms | Treated as suspicious; excluded from avg calculation |
| Response time > 300s | Capped at 300s for calculation purposes |
| Child's school changes | Adaptive state is per-child; school_id updated on next interaction |

### 10.4 Fallback Behavior

| System | Fallback |
|--------|----------|
| ADE unavailable | Default difficulty 3; game plays normally |
| SRE unavailable | Reviews skipped; new content only |
| Economy unavailable | XP not awarded; game plays normally |
| BKT calculation error | Use simple accuracy-based difficulty (existing v1 logic) |
| SM-2+ calculation error | Use Ebbinghaus doubling (existing logic) |

---

## 11. Security & Privacy

### 11.1 Authentication

- All endpoints require valid JWT in `Authorization: Bearer <token>` header
- Student-only endpoints verify `req.user.user_type === 'student'`
- `child_admission_no` is derived from JWT — never accepted from client body for student endpoints
- School ID from `x-school-id` header, validated against JWT

### 11.2 Authorization

| Endpoint | Who Can Access |
|----------|---------------|
| ADE update | Student (own data only) |
| ADE profile | Student (own data), Teacher (own class), Parent (linked child) |
| ADE skills | Student (own data) |
| SRE endpoints | Student (own data only) |
| Economy balance | Student (own data), Parent (linked child) |
| Economy earn | System only (server-side) — client cannot self-award XP |
| Shop buy | Student (own data, own balance) |
| Shop equip | Student (own data, owned items) |

### 11.3 Data Protection

| Concern | Mitigation |
|---------|------------|
| XP manipulation | Server-authoritative; client sends action + context, server calculates amount |
| Streak manipulation | Server tracks last_play_date; client cannot set directly |
| Level manipulation | Derived from xp_total; cannot be set directly |
| Shop exploits | Balance checked server-side before purchase; atomic transaction |
| Child data exposure | All queries filtered by child_admission_no from JWT |
| Cross-child data access | `denyForeignChildData` middleware blocks access to other children's data |

### 11.4 COPPA Compliance

| Requirement | Implementation |
|-------------|---------------|
| Parental consent | Required before account creation (existing flow) |
| Data minimization | Only collect learning-relevant data |
| No behavioral advertising | No ad tracking; no third-party analytics on child data |
| Data deletion | Parent can request deletion via existing support flow |
| No social features without consent | Peer teaching requires opt-in |

### 11.5 Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| ADE update | 60 req/min per child | Sliding window |
| SRE complete | 30 req/min per child | Sliding window |
| Economy earn | 10 req/min per child | Sliding window |
| Shop buy | 5 req/min per child | Sliding window |
| Shop equip | 10 req/min per child | Sliding window |

---

## 12. Integration & Migration

### 12.1 Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                    INTEGRATION MAP                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  EXISTING SYSTEM              Q1 NEW SYSTEM                │
│  ───────────────              ──────────────                │
│                                                             │
│  GamePlay.tsx ──────────────► ADE next-item request        │
│       │                          │                          │
│       ▼                          ▼                          │
│  game-complete ──────────────► ADE update + Economy earn   │
│       │                          │                          │
│       ▼                          ▼                          │
│  KidProgress ────────────────► XP breakdown stored         │
│       │                          │                          │
│       ▼                          ▼                          │
│  StudentHome ────────────────► XP bar + Streak + Level     │
│       │                          │                          │
│       ▼                          ▼                          │
│  ReviewZone ─────────────────► SRE today + complete        │
│       │                          │                          │
│       ▼                          ▼                          │
│  ParentDashboard ────────────► Mastery levels + Economy    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 Migration Strategy

#### Phase 1: Shadow Mode (Week 1-2)
- Deploy new tables alongside existing
- ADE v2 runs in parallel with v1 (read-only)
- Economy tables created but not wired to gameplay
- No user-facing changes

#### Phase 2: ADE Activation (Week 3-4)
- GamePlay.tsx switches to ADE v2 for next-item selection
- ADE v1 still runs for backward compatibility
- SRE v2 replaces Ebbinghaus in markReviewComplete
- ReviewZone updated to use v2 endpoints

#### Phase 3: Economy Activation (Week 5-6)
- XP bar, streak counter, level display added to StudentHome
- Economy earn triggered on game-complete
- Shop enabled for XP spending
- Existing XP field in KidProgress preserved (read-only)

#### Phase 4: Cleanup (Week 7-8)
- ADE v1 code removed
- Old Ebbinghaus code removed
- Legacy streak.ts localStorage migration
- Documentation updated

### 12.3 Feature Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `ADE_V2_ENABLED` | false | Toggle ADE v2 on/off |
| `SRE_V2_ENABLED` | false | Toggle SRE v2 on/off |
| `ECONOMY_ENABLED` | false | Toggle economy system on/off |
| `SHOP_ENABLED` | false | Toggle shop on/off |

### 12.4 Rollback Plan

If any system causes issues:
1. Set feature flag to false → system reverts to v1 behavior
2. No data loss (new tables untouched)
3. Old code paths remain until cleanup phase

### 12.5 Deployment Checklist

- [ ] Database migrations run (new tables + altered columns)
- [ ] Shop items seeded
- [ ] Feature flags set to false
- [ ] Backend deployed with new endpoints
- [ ] Frontend deployed with new components (hidden behind flags)
- [ ] Smoke tests pass on staging
- [ ] Enable ADE_V2 in staging → verify 24h
- [ ] Enable SRE_V2 in staging → verify 24h
- [ ] Enable ECONOMY in staging → verify 24h
- [ ] Enable SHOP in staging → verify 24h
- [ ] Production rollout: one flag at a time, 24h apart
- [ ] Monitor error rates, response times, user feedback
- [ ] Full cleanup after 2 weeks of stable operation

---

## Appendix A: File Inventory

### New Files to Create

| File | Purpose |
|------|---------|
| `backend/src/services/adaptiveEngine.js` | BKT + Elo + ZPD algorithms |
| `backend/src/services/spacedRepetition.js` | SM-2+ algorithm |
| `backend/src/services/economyService.js` | XP calculation + level + streak |
| `backend/src/services/shopService.js` | Shop CRUD + purchase logic |
| `backend/src/controllers/kidsAdaptiveV2.js` | ADE v2 endpoints |
| `backend/src/controllers/kidsSpacedRepV2.js` | SRE v2 endpoints |
| `backend/src/controllers/kidsEconomy.js` | Economy endpoints |
| `backend/src/controllers/kidsShop.js` | Shop endpoints |
| `backend/src/routes/kids.js` | Add new route sections |
| `backend/test/q1-ade.test.js` | ADE test suite |
| `backend/test/q1-sre.test.js` | SRE test suite |
| `backend/test/q1-economy.test.js` | Economy test suite |
| `backend/test/q1-integration.test.js` | Integration tests |
| `frontend/src/lib/types/adaptive.ts` | Shared types |
| `frontend/src/components/XPBar.tsx` | XP progress bar |
| `frontend/src/components/StreakCounter.tsx` | Streak display |
| `frontend/src/components/MasteryGlow.tsx` | Mastery visual |
| `frontend/src/components/StruggleAlert.tsx` | Struggle notification |
| `frontend/src/components/Shop.tsx` | Shop interface |
| `frontend/src/components/LevelUpOverlay.tsx` | Level-up celebration |
| `frontend/src/components/ReviewDueBadge.tsx` | Review count badge |
| `frontend/src/lib/game/adaptive.ts` | Client-side adaptive helpers |
| `frontend/src/lib/game/economy.ts` | Client-side economy helpers |

### Files to Modify

| File | Changes |
|------|---------|
| `backend/src/routes/kids.js` | Add ADE v2, SRE v2, Economy, Shop routes |
| `backend/src/controllers/kids.js` | Modify game-complete to feed ADE + Economy |
| `frontend/src/lib/api/endpoints.ts` | Add new endpoint constants |
| `frontend/src/lib/utils/constants.ts` | Add economy constants |
| `frontend/src/pages/Student/StudentHome.tsx` | Add XP bar, streak counter |
| `frontend/src/pages/Student/GamePlay.tsx` | Integrate ADE next-item + economy earn |
| `frontend/src/components/ReviewZone.tsx` | Switch to SRE v2 endpoints |

---

*End of SRS-Q1-NGEd-game*
*Version 1.0.0 — 2026-09-03*
