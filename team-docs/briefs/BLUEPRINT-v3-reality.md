# EliteKids → Global Modern Learning Platform
# COMPLETE TRANSFORMATION BLUEPRINT
# Version 3.0 — 2026-08-24
# GROUNDED IN CURRENT REALITY (No Cloud Migration)

---

## WHAT THIS DOCUMENT IS

This is the single source of truth for transforming EliteKids into a globally competitive
modern learning platform. Everything in this document can be built on our current VPS
with our current stack. No cloud migration. No new infrastructure. Just code.

**Target**: A platform that rivals Duolingo/Khan Academy for Nigerian/African schools.
Offline-first, adaptive, culturally relevant, fun.

**Current Server**: Hostinger VPS — 4 cores, 15GB RAM, 193GB disk, MySQL, Express, React
**This server is more than enough for everything below.**

---

## TABLE OF CONTENTS

1. Product Vision
2. Current State Audit
3. What We're Building (4 Layers)
4. LAYER 1: Fun Engine
5. LAYER 2: Intelligence Engine
6. LAYER 3: Engagement Engine
7. LAYER 4: Platform Engine
8. Database Schema (All Tables)
9. API Endpoints (Complete)
10. Frontend Components
11. Implementation Plan (Phased)
12. What's Already Built vs What's New
13. Risk Assessment

---

## 1. PRODUCT VISION

**What we're building**: A learning platform where every child gets a personal tutor
that adapts to their level, reviews what they've forgotten, and makes learning feel
like play — even offline.

**Three pillars**:
1. **Intelligence** — The system learns from each child (adaptive difficulty, spaced repetition)
2. **Engagement** — Learning feels like a game, not a test (boss battles, combos, stories)
3. **Accessibility** — Works offline, works on any phone, works for every school

**Who we serve**:
- Students (Nursery → Primary, 3-12 years old)
- Teachers (create content, track progress, manage competitions)
- Parents (see what their child is learning, get notified)
- Schools (multi-class analytics, curriculum alignment)

---

## 2. CURRENT STATE AUDIT

### What Exists (Strong Foundation)
| Component | Status | Quality |
|-----------|--------|---------|
| Game engine (6 templates) | ✅ LIVE | Good |
| Learn → Practice → Test loop | ✅ LIVE | Excellent |
| Curriculum (10-week JP ladder) | ✅ LIVE | Excellent |
| Offline gameplay (IndexedDB) | ✅ LIVE | Essential |
| Live audio (teacher ↔ kids) | ✅ LIVE | Good |
| Voice notes (async) | ✅ LIVE | Good |
| Leaderboard + badges | ✅ LIVE | Good |
| Weekend challenges | ✅ LIVE | Good |
| Arena (tug + trophy) | ✅ BUILT | Needs fun layer |
| Boss battles | ✅ BUILT | Needs fun layer |
| Competition analytics | ✅ BUILT | Basic |

### What We're Adding
| Feature | Layer | Priority |
|---------|-------|----------|
| Adaptive difficulty | Intelligence | P0 |
| Spaced repetition | Intelligence | P0 |
| Combo chains + rage meter | Fun | P0 |
| Power-ups from practice | Fun | P0 |
| Victory ceremonies | Fun | P0 |
| Dice-roll team assignment | Fun | P0 |
| Real-time rope animation | Fun | P0 |
| Sound effects engine | Fun | P1 |
| Milestone celebrations | Fun | P1 |
| Effort badges | Fun | P1 |
| Boss personality lines | Fun | P1 |
| Parent dashboard | Engagement | P1 |
| Teacher quick-create | Engagement | P1 |
| Tournament lobby | Fun | P2 |
| Social reactions | Fun | P2 |
| Match history / rivalry | Fun | P2 |
| Story-driven learning | Intelligence | P2 |
| Difficulty tiers (boss) | Fun | P2 |
| Festival of Guardians | Fun | P3 |
| Multi-school analytics | Platform | P3 |

---

## 3. ARCHITECTURE (Current Stack)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT VPS (62.72.0.209)                     │
│                    4 cores, 15GB RAM, 193GB disk                 │
│                                                                  │
│  ┌─── PROCESSES ──────────────────────────────────────────────┐  │
│  │  nginx (port 80/443) — static + reverse proxy              │  │
│  │  elite-kids-api (port 8484) — Express backend              │  │
│  │  kids-web (port 5173) — Vite dev server (or nginx static)  │  │
│  │  elite-api (port 8383) — main school API                   │  │
│  │  elite-cbt-api — CBT system                                │  │
│  │  MySQL — database                                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─── BACKEND (Express) ─────────────────────────────────────┐  │
│  │  controllers/kids.js              — core game engine       │  │
│  │  controllers/kidsLeaderboard.js   — weekly points, badges  │  │
│  │  controllers/kidsSeries.js        — curriculum, units      │  │
│  │  controllers/kidsModeLock.js      — practice/test gate     │  │
│  │  controllers/e3fArena.js          — competition engine     │  │
│  │  controllers/e3fLive.js           — live audio WebSocket   │  │
│  │  controllers/e4VoiceNotes.js      — voice notes            │  │
│  │  controllers/e3fPush.js           — push notifications     │  │
│  │  controllers/kidsBoss.js          — boss battles           │  │
│  │  controllers/kidsCompetition.js   — enhanced arena         │  │
│  │                                                                  │
│  │  NEW:                                                           │  │
│  │  controllers/kidsAdaptive.js      — adaptive difficulty    │  │
│  │  controllers/kidsSpacedRep.js     — spaced repetition      │  │
│  │  controllers/kidsParent.js        — parent dashboard       │  │
│  │  controllers/kidsQuickCreate.js   — teacher quiz creator   │  │
│  │  controllers/kidsFestival.js      — Festival of Guardians  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─── DATA ──────────────────────────────────────────────────┐  │
│  │  MySQL (elite_content) — all kids_* tables                 │  │
│  │  MySQL (elite_db) — shared school data (read-only)         │  │
│  │  Redis (optional, can use in-memory for now)               │  │
│  │  Filesystem — game assets, audio files, backups            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─── FRONTEND (React/Vite) ────────────────────────────────┐  │
│  │  StudentHome.tsx       — game list, arena, boss, reviews   │  │
│  │  GamePlay.tsx          — game engine (3300 lines)          │  │
│  │  StudentArenaPanel.tsx — tug + trophy view                 │  │
│  │  TeacherLive.tsx       — live audio console                │  │
│  │  TeacherDashboard.tsx  — analytics + management            │  │
│  │                                                                  │  │
│  │  NEW:                                                           │  │
│  │  BossBattleOverlay.tsx — boss sprite + HP + combo + rage   │  │
│  │  VictoryCeremony.tsx   — confetti + stats + badge          │  │
│  │  ReviewZone.tsx        — due reviews list                  │  │
│  │  ParentDashboard.tsx   — parent progress view              │  │
│  │  TeacherQuickCreate.tsx — phone-first quiz creator         │  │
│  │  sound-effects.ts      — audio engine                     │  │
│  │  combo.ts              — combo + rage state                │  │
│  │  power-ups.ts          — power-up bank                     │  │
│  │  milestones.ts         — milestone detection               │  │
│  │  dice-roll.ts          — team assignment animation         │  │
│  │  victory.ts            — confetti + shake + reactions      │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. LAYER 1: FUN ENGINE (Competition + Boss Battles)

### 4.1 Tug-of-War Enhancements

#### Dice-Roll Team Assignment
When teacher creates a match, teams are assigned via animated dice roll.
Not alphabetical. Kids see the animation. Gets them excited.

- Backend: Fisher-Yates shuffle, seed stored for reproducibility
- Frontend: 80ms stagger between assignments, sound effect
- Already coded: `lib/game/dice-roll.ts`

#### Real-Time Rope Animation
Rope physically pulls when a kid scores. Knot slides with easing.

- Poll `GET /kids/arena/active` every 10s
- Rope position = team_a_pts / (team_a_pts + team_b_pts) * 100
- CSS transition on rope knot (1s ease-out)
- Sound: "creak" on pull
- Rubber band: trailing team gets ×1.15 points

#### Milestone Bursts
Confetti + sound + banner when rope crosses 25%, 50%, 75%.

- Frontend tracks last known rope position
- Crossing threshold → fire confetti + play milestone sound
- Banner: "🦁 TEAM LION TAKES THE LEAD!"
- Already coded: `lib/game/milestones.ts`

#### Match History / Rivalry
Track past matchups. "🏆 Rivalry: Lions lead 3-2".

- Store result in `kids_match_history` after match ends
- Display on match card
- Kids want revenge — drives re-engagement

### 4.2 Tournament Enhancements

#### Tournament Lobby
60-second countdown before tournament starts.

- Team assignment reveal
- Game list preview
- "Get Ready!" countdown with sound at 3, 2, 1
- Creates anticipation

#### Effort Badges
Beyond 1st/2nd/3rd — more kids get recognized.

- "🏆 Most Improved" — biggest score jump
- "⚡ Speed Demon" — fastest avg response
- "🎯 Perfectionist" — 100% accuracy on 5+ questions
- "💪 Never Give Up" — completed all games even if low scores
- "🔥 Combo King/Queen" — highest combo chain
- Stored in `kids_badges` with tournament title

#### Social Reactions
After someone scores, other kids tap 👏🔥💪 to send reaction.

- Floating emoji animation near scorer's name
- 5s TTL, ephemeral
- No chat (safety)
- Stored in memory, broadcast via polling

#### Tournament MVP Spotlight
After tournament ends, highlight the MVP with full stats.

- "🏅 MVP: Amina answered 47 questions, 96% correct, avg 2.3s"
- Full-screen card with confetti

### 4.3 Boss Battle System

#### Guardians (Boss Characters)
**IP RULE**: ZERO Sony God of War references. Original Nigerian/African mythology.

| Slug | Name | Title | Subject | Emoji | HP/Q | Rage |
|------|------|-------|---------|-------|------|------|
| sango | Ṣàngó | Guardian of Thunder | Math | ⚡ | 10 | 3 |
| anansi | Anansi | The Web-Trickster | English | 🕸️ | 8 | 4 |
| amina | Queen Amina | Fortress Guardian | Numbers | 🏰 | 12 | 3 |
| baobab | Great Baobab | Spirit of Nature | Science | 🌳 | 9 | 5 |
| mami | Mami Wata | Guardian of Waters | Colors | 🌊 | 7 | 4 |
| elena | Elegua | Keeper of Paths | Letters | 🚪 | 10 | 3 |

#### Combo Chains
Consecutive correct answers build 🔥×N chain.

- Each correct: combo += 1
- Each incorrect: combo resets to 0
- Visual: fire emoji stack grows (×1 small flame → ×5 inferno)
- Sound: pitch rises with each level
- Combo max tracked per run
- Already coded: `lib/game/combo.ts`

#### Rage Meter
Fill 3 correct in a row → rage mode → next 3 questions deal DOUBLE damage.

- `rageCounter` increments on correct
- When `rageCounter >= 3`: activate rage, `rageRemaining = 3`
- While rage active: damage × 2
- Rage persists through wrong answers
- Visual: ⚡ meter fills, pulses with lightning
- Sound: thunder rumble on activation
- Already coded: `lib/game/combo.ts`

#### Boss Personality Lines
Each guardian has voice lines displayed during battle.

```
Ṣàngó:  Attack: "THUNDER STRIKES!"
        Half HP: "You withstand my storm..."
        Defeated: "You are wiser than the thunder itself."

Anansi: Attack: "Solve my riddle!"
        Half HP: "Hmm, you're cleverer than most..."
        Defeated: "The web cannot trap a sharp mind."

Amina:  Attack: "My fortress stands strong!"
        Half HP: "Your answers crack my walls..."
        Defeated: "A true warrior fights with knowledge."
```

#### Boss Attacks Back
Wrong answer = boss counter-attack animation.

- Screen shake (5px, 300ms)
- Red flash overlay (0.3s fade)
- Shield energy -1
- At 0 shield: "Retreat & Regroup" screen
- "Every champion retries! +3 bonus damage on your next try!"
- Already coded: `lib/game/victory.ts` — screenShake()

#### Victory Ceremony
Boss defeat celebration with wisdom quote.

- Boss bow animation (sprite shrinks + fades)
- Wisdom quote: "You are wiser than I thought, young scholar."
- Confetti burst (80 particles, 3s)
- Badge awarded: guardian-specific badge
- Already coded: `lib/game/victory.ts` — launchConfetti()

#### Power-Ups from Practice
Great practice earns banked power-ups for boss battles.

- 🪤 Hint Charm (score ≥80%): removes 2 wrong options
- ⚔️ Double Strike (score ≥90%): next question 2× damage
- 🛡️ Amina's Shield (score ≥100%): absorbs 1 wrong answer
- Stored in localStorage, used during boss battles only
- Already coded: `lib/game/power-ups.ts`

#### Difficulty Tiers
Teacher selects Easy/Normal/Hard for boss battles.

- Easy: 10 HP/question (basic badge)
- Normal: 15 HP/question (standard badge)
- Hard: 25 HP/question (exclusive badge)
- HP scales accordingly

#### Class Raid Contribution
Show collective progress on StudentHome.

- "The class has dealt 847/1000 damage to Ṣàngó!"
- Progress bar fills as kids play
- "Only 160 HP left! Keep fighting!"

### 4.4 Festival of Guardians (Term-End)

Last academic week — all 6 guardians return sequentially.

- Teacher schedules Festival, picks date + guardians
- Class fights them one by one (each is a raid)
- Exclusive 🌟 Guardian badges:
  - "Voice of Ṣàngó"
  - "Anansi's Riddle-Master"
  - "Amina's Shield-Bearer"
  - "Baobab's Wisdom-Keeper"
  - "Mami Wata's Flow-Master"
  - "Elegua's Path-Walker"
- Collect all 6 = "Guardian of the Storm" mega badge

---

## 5. LAYER 2: INTELLIGENCE ENGINE

### 5.1 Adaptive Difficulty Engine

The system adjusts game difficulty per child per topic.
Every child should be in the "flow zone" — not bored, not frustrated.

#### How It Works
1. Track per-child, per-topic: accuracy (last 10 attempts), response time, mistakes
2. After each game complete, compute difficulty score
3. Difficulty levels 1-5:
   - 1: Very Easy (simplified questions, more hints)
   - 2: Easy (basic questions)
   - 3: Medium (standard — default)
   - 4: Hard (tricky questions, less time)
   - 5: Expert (complex questions, timed)
4. Game engine reads difficulty before rendering questions
5. Adjusts gradually (max ±1 per game complete)

#### Algorithm
```
difficulty_update(old_difficulty, accuracy_7d, avg_response_ms):
  if accuracy_7d >= 90 AND avg_response_ms < 3000:
    new_difficulty = min(old_difficulty + 1, 5)  // getting harder
  elif accuracy_7d < 50 OR avg_response_ms > 8000:
    new_difficulty = max(old_difficulty - 1, 1)  // getting easier
  else:
    new_difficulty = old_difficulty  // stay in flow zone
  return new_difficulty
```

#### New Table
```sql
CREATE TABLE kids_adaptive_profiles (
  id CHAR(36) PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  school_id VARCHAR(40) NOT NULL,
  subject VARCHAR(50) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  current_difficulty TINYINT DEFAULT 3,
  accuracy_7d FLOAT DEFAULT 0,
  avg_response_ms_7d INT DEFAULT 0,
  total_attempts INT DEFAULT 0,
  correct_attempts INT DEFAULT 0,
  streak_days INT DEFAULT 0,
  last_practiced_at DATETIME,
  next_review_at DATETIME,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_adaptive_child_topic (child_admission_no, subject, topic),
  KEY idx_adaptive_child (child_admission_no),
  KEY idx_adaptive_review (next_review_at)
) ENGINE=InnoDB;
```

### 5.2 Spaced Repetition System

Schedule reviews at optimal intervals to fight forgetting.
Kids forget 70% of what they learn within 24 hours without review.

#### Ebbinghaus Curve Intervals
After completing a lesson, schedule next reviews:
- Quality ≥80%: 1 day → 3 days → 7 days → 14 days → 30 days
- Quality 50-79%: 12 hours → 1 day → 3 days → 7 days
- Quality <50%: 6 hours → 12 hours → 1 day → 3 days

#### Implementation
- Table `kids_review_schedule` already exists in models (currently unused)
- Add columns: `quality`, `interval_days`, `next_review_at`, `status`
- Cron job (setInterval in backend, runs daily): find due reviews, flag for child
- "📚 Review Zone" tab in StudentHome showing what's due today
- After completing review, schedule next interval
- Badge: "🧠 Memory Master" — completed 30+ reviews in a week

### 5.3 Per-Child Learning Path

Not linear — branching based on performance.

- If score ≥90%: skip ahead, unlock bonus content, award bonus XP
- If score <50%: loop back with easier questions, flag for teacher
- If hasn't practiced in 7 days: auto-schedule review
- Teacher sees: "Amina is 2 weeks ahead in Numbers, 1 week behind in Phonics"

### 5.4 Story-Driven Learning

Wrap quiz questions in narrative context.

- Instead of: "Which letter makes this sound?"
- Use: "Anansi needs your help! Which sound opens the magic door?"
- Each game config gets optional `story_intro`, `story_outro`, `story_context`
- Story pauses at "cliffhangers" between questions
- Not a new game engine — it's a content wrapper around existing configs

---

## 6. LAYER 3: ENGAGEMENT ENGINE

### 6.1 Parent Dashboard

Simple mobile-first app for parents to track their child's learning.

#### Features
- Phone number + OTP login (reuse existing auth or simple PIN)
- Child's weekly summary: games played, time spent, topics completed
- Upcoming reviews due
- Push notifications: "Amina completed 3 games today! 🌟"
- Achievement alerts: "Amina earned the 🥇 Gold badge this week!"

#### New Tables
```sql
CREATE TABLE kids_parent_links (
  id CHAR(36) PRIMARY KEY,
  parent_phone VARCHAR(20) NOT NULL,
  child_admission_no VARCHAR(64) NOT NULL,
  school_id VARCHAR(40) NOT NULL,
  verified TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_parent_child (parent_phone, child_admission_no)
) ENGINE=InnoDB;

CREATE TABLE kids_parent_notifications (
  id CHAR(36) PRIMARY KEY,
  parent_phone VARCHAR(20) NOT NULL,
  type ENUM('daily_summary','achievement','milestone','review_due') NOT NULL,
  title VARCHAR(120),
  body TEXT,
  read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pn_parent (parent_phone, read_at)
) ENGINE=InnoDB;
```

### 6.2 Teacher Quick-Create (Phone-First)

Create a quiz in 2 minutes from a phone. No desktop needed.

#### Flow
1. Teacher taps "Create Quiz" → title + subject
2. Taps "Add Question" → types question + 4 options + marks correct
3. Can add image (camera/gallery)
4. Taps "Publish" → instantly available to class
5. Students see it in their game list

#### New Tables
```sql
CREATE TABLE kids_teacher_quizzes (
  id CHAR(36) PRIMARY KEY,
  school_id VARCHAR(40) NOT NULL,
  class_code VARCHAR(40) NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  title VARCHAR(120) NOT NULL,
  subject VARCHAR(50),
  status ENUM('draft','published') DEFAULT 'draft',
  question_count TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME,
  KEY idx_tq_class (school_id, class_code, status)
) ENGINE=InnoDB;

CREATE TABLE kids_teacher_questions (
  id CHAR(36) PRIMARY KEY,
  quiz_id CHAR(36) NOT NULL,
  question_text TEXT NOT NULL,
  option_a VARCHAR(255) NOT NULL,
  option_b VARCHAR(255) NOT NULL,
  option_c VARCHAR(255) NOT NULL,
  option_d VARCHAR(255) NOT NULL,
  correct_option CHAR(1) NOT NULL,
  image_url VARCHAR(500),
  order_index INT DEFAULT 0,
  KEY idx_tq_quiz (quiz_id)
) ENGINE=InnoDB;
```

---

## 7. LAYER 4: PLATFORM ENGINE

### 7.1 Multi-School Analytics

School admin dashboard comparing classes, identifying struggling students.

- "Which classes are performing best?"
- "Which students need help?"
- "Which games have highest engagement?"
- Implementation: SQL views + scheduled aggregation queries
- No BigQuery needed — MySQL handles this at our scale

### 7.2 Match History / Rivalry

Track past matchups between teams.

```sql
CREATE TABLE kids_match_history (
  id CHAR(36) PRIMARY KEY,
  competition_id CHAR(36) NOT NULL,
  school_id VARCHAR(40) NOT NULL,
  class_code VARCHAR(40) NOT NULL,
  team_a_name VARCHAR(60),
  team_b_name VARCHAR(60),
  winner_team TINYINT,
  team_a_pts INT DEFAULT 0,
  team_b_pts INT DEFAULT 0,
  ended_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mh_class (school_id, class_code, ended_at)
) ENGINE=InnoDB;
```

### 7.3 Sound Effects Engine

Reusable audio module for all game events. Web Audio API, synthesized sounds.

| Event | Sound | Implementation |
|-------|-------|---------------|
| Tap | 800Hz sine, 60ms | `playTap()` |
| Score | 523→659Hz, 100ms | `playScore()` |
| Combo×3 | Rising square | `playCombo(3)` |
| Combo×5 | Triple rising | `playCombo(5)` |
| Milestone | 4-note arpeggio | `playMilestone()` |
| Rage fill | Thunder rumble | `playRageFill()` |
| Boss attack | Impact + rumble | `playBossAttack()` |
| Boss defeat | 6-note fanfare | `playBossDefeated()` |
| Victory | Celebration melody | `playVictory()` |
| Defeat | 3 gentle notes | `playDefeatEncourage()` |
| Rope pull | Creak noise | `playRopePull()` |
| Power-up | 4-note sparkle | `playPowerUp()` |
| Dice roll | 8 rapid clicks | `playDiceRoll()` |

Already coded: `lib/game/sound-effects.ts`

---

## 8. DATABASE SCHEMA (All New Tables)

```sql
-- ═══════════════════════════════════════════════════════════════════
-- FUN ENGINE
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE kids_competition_analytics (
  id CHAR(36) PRIMARY KEY,
  competition_id CHAR(36) NOT NULL,
  child_admission_no VARCHAR(64) NOT NULL,
  lesson_id VARCHAR(50) NULL,
  config_id VARCHAR(50) NULL,
  question_index SMALLINT NULL,
  response_time_ms INT NULL,
  correct TINYINT(1) NULL,
  started_at DATETIME NULL,
  answered_at DATETIME NULL,
  completed_at DATETIME NULL,
  total_score INT DEFAULT 0,
  questions_answered INT DEFAULT 0,
  questions_correct INT DEFAULT 0,
  status ENUM('not_started','playing','completed','timed_out') DEFAULT 'not_started',
  UNIQUE KEY uq_ca_comp_child (competition_id, child_admission_no),
  KEY idx_ca_comp (competition_id)
) ENGINE=InnoDB;

CREATE TABLE kids_tournament_games (
  id CHAR(36) PRIMARY KEY,
  competition_id CHAR(36) NOT NULL,
  lesson_id VARCHAR(50) NOT NULL,
  config_id VARCHAR(50) NULL,
  order_index INT DEFAULT 0,
  UNIQUE KEY uq_tg_comp_lesson (competition_id, lesson_id, config_id)
) ENGINE=InnoDB;

CREATE TABLE kids_boss_runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  school_id VARCHAR(40) NOT NULL,
  class_code VARCHAR(40) NULL,
  lesson_id VARCHAR(50) NOT NULL,
  config_id VARCHAR(50) NULL,
  guardian_slug VARCHAR(30) NULL,
  score TINYINT DEFAULT 0,
  combo_max SMALLINT DEFAULT 0,
  victories SMALLINT DEFAULT 0,
  rage_used TINYINT DEFAULT 0,
  response_time_ms INT DEFAULT 0,
  duration_s INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_boss_child (child_admission_no, created_at)
) ENGINE=InnoDB;

CREATE TABLE kids_boss_raid_state (
  id CHAR(36) PRIMARY KEY,
  school_id VARCHAR(40) NOT NULL,
  class_code VARCHAR(40) NOT NULL,
  guardian_slug VARCHAR(30) NOT NULL,
  title VARCHAR(120) NOT NULL,
  difficulty ENUM('easy','normal','hard') DEFAULT 'normal',
  max_hp INT DEFAULT 100,
  current_hp INT DEFAULT 100,
  status VARCHAR(10) DEFAULT 'active',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME,
  created_by VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_raid_class (school_id, class_code, status)
) ENGINE=InnoDB;

CREATE TABLE kids_boss_raid_games (
  id CHAR(36) PRIMARY KEY,
  raid_id CHAR(36) NOT NULL,
  lesson_id VARCHAR(50) NOT NULL,
  config_id VARCHAR(50) NULL,
  order_index INT DEFAULT 0,
  UNIQUE KEY uq_brg_raid_lesson (raid_id, lesson_id, config_id)
) ENGINE=InnoDB;

CREATE TABLE kids_boss_raid_participants (
  id CHAR(36) PRIMARY KEY,
  raid_id CHAR(36) NOT NULL,
  child_admission_no VARCHAR(64) NOT NULL,
  total_damage INT DEFAULT 0,
  questions_answered INT DEFAULT 0,
  questions_correct INT DEFAULT 0,
  avg_response_ms INT NULL,
  status ENUM('not_started','playing','completed') DEFAULT 'not_started',
  UNIQUE KEY uq_brp_raid_child (raid_id, child_admission_no)
) ENGINE=InnoDB;

CREATE TABLE kids_power_ups (
  id CHAR(36) PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  power_up_type ENUM('hint','double_strike','shield') NOT NULL,
  earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  used_in_raid_id CHAR(36) NULL,
  KEY idx_pu_child (child_admission_no, used_at)
) ENGINE=InnoDB;

CREATE TABLE kids_match_history (
  id CHAR(36) PRIMARY KEY,
  competition_id CHAR(36) NOT NULL,
  school_id VARCHAR(40) NOT NULL,
  class_code VARCHAR(40) NOT NULL,
  team_a_name VARCHAR(60),
  team_b_name VARCHAR(60),
  winner_team TINYINT,
  team_a_pts INT DEFAULT 0,
  team_b_pts INT DEFAULT 0,
  ended_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mh_class (school_id, class_code, ended_at)
) ENGINE=InnoDB;

CREATE TABLE kids_festival_state (
  id CHAR(36) PRIMARY KEY,
  school_id VARCHAR(40) NOT NULL,
  class_code VARCHAR(40) NOT NULL,
  title VARCHAR(120) NOT NULL,
  status ENUM('scheduled','active','completed') DEFAULT 'scheduled',
  starts_at DATETIME NOT NULL,
  completed_guardians JSON,
  created_by VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fs_class (school_id, class_code, status)
) ENGINE=InnoDB;

-- ═══════════════════════════════════════════════════════════════════
-- INTELLIGENCE ENGINE
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE kids_adaptive_profiles (
  id CHAR(36) PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  school_id VARCHAR(40) NOT NULL,
  subject VARCHAR(50) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  current_difficulty TINYINT DEFAULT 3,
  accuracy_7d FLOAT DEFAULT 0,
  avg_response_ms_7d INT DEFAULT 0,
  total_attempts INT DEFAULT 0,
  correct_attempts INT DEFAULT 0,
  streak_days INT DEFAULT 0,
  last_practiced_at DATETIME,
  next_review_at DATETIME,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_adaptive_child_topic (child_admission_no, subject, topic),
  KEY idx_adaptive_review (next_review_at)
) ENGINE=InnoDB;

-- ═══════════════════════════════════════════════════════════════════
-- ENGAGEMENT ENGINE
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE kids_parent_links (
  id CHAR(36) PRIMARY KEY,
  parent_phone VARCHAR(20) NOT NULL,
  child_admission_no VARCHAR(64) NOT NULL,
  school_id VARCHAR(40) NOT NULL,
  verified TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_parent_child (parent_phone, child_admission_no)
) ENGINE=InnoDB;

CREATE TABLE kids_parent_notifications (
  id CHAR(36) PRIMARY KEY,
  parent_phone VARCHAR(20) NOT NULL,
  type ENUM('daily_summary','achievement','milestone','review_due') NOT NULL,
  title VARCHAR(120),
  body TEXT,
  read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pn_parent (parent_phone, read_at)
) ENGINE=InnoDB;

CREATE TABLE kids_teacher_quizzes (
  id CHAR(36) PRIMARY KEY,
  school_id VARCHAR(40) NOT NULL,
  class_code VARCHAR(40) NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  title VARCHAR(120) NOT NULL,
  subject VARCHAR(50),
  status ENUM('draft','published') DEFAULT 'draft',
  question_count TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME,
  KEY idx_tq_class (school_id, class_code, status)
) ENGINE=InnoDB;

CREATE TABLE kids_teacher_questions (
  id CHAR(36) PRIMARY KEY,
  quiz_id CHAR(36) NOT NULL,
  question_text TEXT NOT NULL,
  option_a VARCHAR(255) NOT NULL,
  option_b VARCHAR(255) NOT NULL,
  option_c VARCHAR(255) NOT NULL,
  option_d VARCHAR(255) NOT NULL,
  correct_option CHAR(1) NOT NULL,
  image_url VARCHAR(500),
  order_index INT DEFAULT 0,
  KEY idx_tq_quiz (quiz_id)
) ENGINE=InnoDB;

-- ═══════════════════════════════════════════════════════════════════
-- ALTERATIONS TO EXISTING TABLES
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE kids_progress ADD COLUMN response_time_ms INT NULL;
ALTER TABLE kids_progress ADD COLUMN question_start_ts BIGINT NULL;
ALTER TABLE kids_game_configs ADD COLUMN story_intro TEXT;
ALTER TABLE kids_game_configs ADD COLUMN story_outro TEXT;
ALTER TABLE kids_game_configs ADD COLUMN story_context VARCHAR(500);
ALTER TABLE kids_competitions ADD COLUMN milestones_reached JSON;
ALTER TABLE kids_competitions ADD COLUMN difficulty ENUM('easy','normal','hard') DEFAULT 'normal';
```

---

## 9. API ENDPOINTS (Complete)

### Enhanced Existing
```
POST /kids/progress/game-complete
  + body: response_time_ms, question_start_ts
  + triggers: adaptive update, competition hook, boss damage

GET /kids/arena/active
  + returns: milestones_reached, my_contribution, reactions

POST /kids/arena/create
  + returns: team assignments with dice-roll seed
```

### New: Adaptive
```
GET  /kids/adaptive/profile?subject=&topic=
POST /kids/adaptive/update { subject, topic, score, response_time_ms, correct }
GET  /kids/adaptive/recommended
GET  /kids/adaptive/due-reviews
```

### New: Competition
```
POST /kids/arena/:id/games { lesson_ids }
GET  /kids/arena/:id/games
GET  /kids/arena/:id/dashboard
POST /kids/arena/:id/participants/start
POST /kids/arena/:id/participants/progress
POST /kids/arena/:id/reactions { emoji, to_adm }
GET  /kids/arena/:id/history
```

### New: Boss
```
POST /kids/boss/raid/create { class_code, guardian_slug, difficulty, lesson_ids }
GET  /kids/boss/raid/:id/dashboard
POST /kids/boss/raid/:id/damage { score, combo_max, rage_used, response_time_ms }
POST /kids/boss/raid/:id/games { lesson_ids }
GET  /kids/boss/raids?class_code=
```

### New: Power-Ups
```
GET  /kids/power-ups
POST /kids/power-ups/use { type }
```

### New: Parent
```
POST /kids/parent/link { phone, admission_no, school_id }
GET  /kids/parent/children
GET  /kids/parent/child/:adm/progress
GET  /kids/parent/child/:adm/achievements
```

### New: Teacher Quick-Create
```
POST /kids/teacher/quizzes { title, subject, class_code }
POST /kids/teacher/quizzes/:id/questions
POST /kids/teacher/quizzes/:id/publish
GET  /kids/teacher/quizzes?class_code=
```

---

## 10. FRONTEND COMPONENTS

### New Files
```
frontend/src/lib/game/
  sound-effects.ts     ✅ Already written
  combo.ts             ✅ Already written
  power-ups.ts         ✅ Already written
  milestones.ts        ✅ Already written
  dice-roll.ts         ✅ Already written
  reactions.ts         ✅ Already written
  victory.ts           ✅ Already written

frontend/src/pages/Student/
  BossBattleOverlay.tsx     — boss sprite + HP + combo + rage + power-ups
  VictoryCeremony.tsx       — confetti + stats + badge award
  ReviewZone.tsx            — due reviews list
  PowerUpShelf.tsx          — available power-ups

frontend/src/pages/Teacher/
  TeacherTournamentDashboard.tsx — live analytics
  TeacherQuickCreate.tsx         — phone-first quiz creator
  TeacherRaidManager.tsx         — boss raid creation

frontend/src/pages/Parent/
  ParentDashboard.tsx       — child progress view
  ParentLogin.tsx           — phone OTP login
```

### Modified Files
```
StudentHome.tsx      + Boss raid card, Review Zone tab, Competition reactions
GamePlay.tsx         + Difficulty from adaptive, Response time tracking, Boss overlay
StudentArenaPanel.tsx + Rope animation, Lobby, Reactions, Milestones
endpoints.ts         + ADAPTIVE, POWER_UPS, PARENT, QUICK_CREATE
```

---

## 11. IMPLEMENTATION PLAN

### Phase 0: Foundation (This Week)
- [ ] Response time tracking in GamePlay (question_start_ts)
- [ ] Sound effects engine (already coded — deploy)
- [ ] Combo chains + rage meter (already coded — integrate)
- [ ] Power-ups system (already coded — integrate)
- [ ] Victory ceremony (already coded — integrate)
- [ ] Dice-roll team assignment (already coded — integrate)

### Phase 1: Intelligence (Next Week)
- [ ] Adaptive difficulty engine (kidsAdaptive.js)
- [ ] kids_adaptive_profiles table
- [ ] Difficulty-driven question selection in GamePlay
- [ ] Spaced repetition scheduler (daily cron)
- [ ] Review Zone tab in StudentHome
- [ ] Due reviews API

### Phase 2: Fun Layer (Week 3)
- [ ] Real-time rope animation + milestones
- [ ] Boss personality lines + attack animations
- [ ] Tournament lobby + countdown
- [ ] Effort badges
- [ ] Social reactions
- [ ] Tournament MVP spotlight
- [ ] Difficulty tiers for bosses

### Phase 3: Engagement (Week 4)
- [ ] Parent dashboard (PWA)
- [ ] Teacher quick-create (phone-first)
- [ ] Match history / rivalry
- [ ] Festival of Guardians
- [ ] Story-driven learning wrapper

### Phase 4: Platform (Week 5-6)
- [ ] Multi-school analytics (SQL views)
- [ ] Content marketplace (teacher sharing)
- [ ] Performance optimization
- [ ] Load testing
- [ ] Documentation

---

## 12. WHAT'S ALREADY BUILT vs WHAT'S NEW

### Already Built (Deploy to Production)
| File | Status | What It Does |
|------|--------|-------------|
| `lib/game/sound-effects.ts` | ✅ Written | 15 synthesized sounds |
| `lib/game/combo.ts` | ✅ Written | Combo + rage state machine |
| `lib/game/power-ups.ts` | ✅ Written | Power-up bank management |
| `lib/game/milestones.ts` | ✅ Written | Milestone detection |
| `lib/game/dice-roll.ts` | ✅ Written | Team assignment animation |
| `lib/game/reactions.ts` | ✅ Written | Social reactions |
| `lib/game/victory.ts` | ✅ Written | Confetti + shake + float |
| `controllers/kidsBoss.js` | ✅ Written | Boss raids + damage |
| `controllers/kidsCompetition.js` | ✅ Written | Enhanced arena |

### Needs Integration (Code exists, needs wiring)
| Component | Work Needed |
|-----------|-------------|
| Sound effects | Import into GamePlay, Arena, Boss |
| Combo system | Wire into BossBattleOverlay |
| Power-ups | Wire into GamePlay + boss battle |
| Dice-roll | Wire into arena creation flow |
| Milestones | Wire into StudentArenaPanel |
| Reactions | Wire into competition view |
| Victory | Wire into boss defeat + tournament end |

### Needs Building (New code required)
| Component | Estimated Effort |
|-----------|-----------------|
| Adaptive difficulty engine | 1 day |
| Spaced repetition scheduler | 1 day |
| Parent dashboard | 2 days |
| Teacher quick-create | 2 days |
| Tournament lobby | 4 hours |
| Effort badges | 4 hours |
| Boss personality lines | 2 hours |
| Story-driven learning | 1 day |
| Festival of Guardians | 1 day |
| Multi-school analytics | 2 days |
| Match history | 2 hours |

**Total estimated effort: ~10-12 days of focused work**

---

## 13. RISK ASSESSMENT

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Feature overload | High | High | Ship Phase 0 first, iterate |
| GamePlay.tsx too complex | Medium | Medium | Extract boss overlay to separate component |
| Response time accuracy | Low | Low | Client-side clock sync, ±200ms tolerance |
| Sound not playing (autoplay) | Medium | Low | User-gesture gate, visual fallback |
| Adaptive too aggressive | Medium | Medium | Cap at ±1 difficulty per game |
| Parent OTP spam | Low | Low | Rate limit: 3 SMS/hour/phone |
| Teacher creates bad content | Medium | Low | Approval workflow for published quizzes |

---

END OF BLUEPRINT v3.0

Prepared by: opencode (AI Tech Lead)
Date: 2026-08-24
Status: READY FOR SUPERVISOR APPROVAL
Next Action: Approve Phase 0 start → deploy existing code + integrate
