# Student Tab Restructure Plan

**Date:** 2026-09-15
**Status:** Implemented (2026-09-15) — see `team-docs/reports/student-tab-restructure-progress.md`
**Goal:** Minimize cognitive load for nursery/primary kids, zero component overlap between tabs

---

## Current State (7 tabs — too many)

| Tab | Components | Issues |
|-----|-----------|--------|
| HOME | Companion, streak, garden, RevisionCard, ReviewZone | Revision/Review mixed in |
| PLAY | Game cards grid | Fallback `else` — also renders on HOME |
| PATH | Learning path | Overlaps with PLAY (explore subjects) |
| STATS | Progress, economy, goals, per-game stats | Rendered TWICE (duplicate blocks) |
| FESTIVAL | Festival content | Low usage, seasonal |
| LEADERBOARD | Leaderboard | Belongs in progress/social |
| TEAMS | Class quests, team challenges, peer teaching | Belongs in progress/social |

### Bugs Found
- `StatsTab` renders twice (lines 943 and 1047 in StudentHome.tsx)
- `PlayTab` is the `else` fallback — `activeTab === 'home'` renders BOTH HomeTab AND PlayTab
- `SUBJECT_FILTERS`, `HOME_SECTION_LABEL`, `FloatingDeco`, `getAgeColor` duplicated across files

---

## Proposed Structure (5 tabs, zero overlap)

```
┌──────────────────────────────────────────────────┐
│  🏠 HOME       🎮 PLAY       📚 LEARN           │
│                                                   │
│  Companion     Game cards     Learning Path       │
│  Streak        Subject grid   Explore subjects    │
│  Garden                                          │
│                                                   │
│                           ⭐ REVIEW     👤 ME     │
│                           Revision Card           │
│                           Review Zone             │
│                           Stats & Goals           │
│                           Teams & Social          │
└──────────────────────────────────────────────────┘
```

### Tab Definitions

| Tab | Key | Icon | Purpose | Components |
|-----|-----|------|---------|-----------|
| HOME | `home` | `Home` | Welcome & motivation | CompanionBubble, StreakReminder, GardenScene |
| PLAY | `play` | `Gamepad2` | Pick a game | Subject chips, Game cards grid, Seasonal banners |
| LEARN | `path` | `Route` | Structured lessons | LearningPath, Explore subjects |
| REVIEW | `review` | `BookOpen` | Revision & practice | RevisionCard, ReviewZone, Spaced repetition |
| ME | `me` | `User` | Progress & social | StatsTab, Economy, Goals, Teams, Leaderboard |

### Removed / Merged

| Old Tab | Merged Into | How |
|---------|------------|-----|
| FESTIVAL | PLAY | Seasonal banner in PLAY tab header |
| LEADERBOARD | ME | Section inside ME tab |
| STATS | ME | Section inside ME tab |
| TEAMS | ME | Section inside ME tab |

---

## Key Principles

1. **One tab = one job** — no component renders in two tabs
2. **5 tabs max** — nursery kids can't navigate more
3. **No fallback `else`** — every tab key has an explicit branch
4. **Shared helpers** — `FloatingDeco`, `getAgeColor`, `SUBJECT_FILTERS` live in one place, imported everywhere
5. **Header stays global** — logo, ReviewDueBadge, mic, shop remain in header across all tabs

---

## Header (Global — all tabs)

Always visible regardless of active tab:
- School logo + name
- Greeting ("Good morning, {name}!")
- ReviewDueBadge (scrolls to REVIEW tab)
- Mic/Speech button
- Shop button
- AppSwitcher
- A11ySettings
- Logout

---

## Migration Steps

1. Fix duplication bugs (StatsTab double render, PlayTab else fallback)
2. Create `review` tab key with RevisionCard + ReviewZone
3. Create `me` tab with StatsTab, Teams, Leaderboard
4. Remove FESTIVAL and LEADERBOARD as separate tabs
5. Move festival content to PLAY banner
6. Extract shared helpers to `utils/`
7. Test all 5 tabs render correctly with no overlap
8. Update i18n keys for tab labels

---

## Files to Modify

| File | Change |
|------|--------|
| `StudentHome.tsx` | Restructure TABS array, fix render blocks |
| `tabs/HomeTab.tsx` | Remove RevisionCard/ReviewZone (moved to REVIEW) |
| `tabs/PlayTab.tsx` | Add seasonal banner slot, remove shared helpers |
| `tabs/StatsTab.tsx` | Remove standalone, merge into ME |
| `tabs/TeamsTab.tsx` | Remove standalone, merge into ME |
| `tabs/ReviewTab.tsx` | **NEW** — RevisionCard + ReviewZone |
| `tabs/MeTab.tsx` | **NEW** — Stats + Teams + Leaderboard + Economy |
| `utils/helpers.ts` | **NEW** — shared FloatingDeco, getAgeColor, SUBJECT_FILTERS |

---

*EliteKids — Minimizing cognitive load, maximizing learning fun*
