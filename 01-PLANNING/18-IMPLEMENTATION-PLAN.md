# EliteKids Implementation Plan — Reconciled Documents (12-17)

**Date:** 2026-08-20
**Status:** Ready for Execution
**Reference:** R&D Framework — Step 5: Reconcile

---

## Executive Summary

This plan reconciles the original EliteKids planning package (Docs 01-11) with the addendum documents (Docs 12-17) and implements all required features following the R&D Framework's "Build → Observe → Discover → Addendum → Reconcile" cycle.

---

## Current State Assessment

**Completed (Sprint 0-1):**
- Auth, tenancy, CRUD operations
- Media pipeline (B2 + BullMQ)
- Frontend app shell
- Test suite (124/124 passing)

**Pending Implementation:**
- Game Series & Unit Sequencing (Doc 12)
- Pedagogy Validator (Doc 13)
- Pattern Tracking (Doc 14)
- Curriculum Mapping & Library (Doc 15)
- Gamification Depth (Doc 16)
- Engagement Layer (Doc 17)

---

## Implementation Approach

### Database Strategy
**Separate migrations per feature group:**
1. Game Series & Unit Sequencing
2. Curriculum Mapping & Library
3. Pattern Tracking
4. Gamification Depth
5. Engagement Layer

### Service Architecture
**Pedagogy Validator:** Integrated service with clear separation from safety pipeline

### Frontend Architecture
**Offline:** IndexedDB with wrapper library
**Companion:** Emoji/sticker-based (upgrade path to animated)

### Testing Strategy
**Tests per feature** (following existing discipline in Doc 05/07)

---

## Phase 1: Foundation (Week 1-2)

### Database Migrations
| Table | Purpose | Doc Reference |
|---|---|---|
| kids_game_series | Game series metadata | Doc 12 |
| kids_game_units | Unit sequencing + prerequisites | Doc 12 |
| kids_curriculum_points | Curriculum mapping | Doc 15 |
| kids_library_games | Validated library content | Doc 15 |
| kids_class_game_variants | Teacher customizations | Doc 15 |
| kids_game_item_responses | Pattern tracking data | Doc 14 |
| kids_engagement_snapshots | Session engagement data | Doc 14 |
| kids_mastery_progress | Mastery tracking | Doc 14 |
| kids_test_attempts | Retry logic data | Doc 16 |
| kids_review_schedule | Spaced repetition | Doc 16 |
| kids_interface_onboarding | Onboarding tracking | Doc 16 |
| kids_garden_state | Visual progress metaphor | Doc 17 |
| kids_companion_state | Companion character | Doc 17 |
| kids_session_state | Save/resume functionality | Doc 17 |
| kids_parental_controls | Parental limits | Doc 17 |

### GDL Schema Updates
**Add to all 4 templates:**
```json
{
  "category": { "type": "string", "enum": ["Animals", "Letters", "Shapes"] },
  "tier": { "type": "integer", "minimum": 0, "maximum": 3 },
  "item_id": { "type": "string" },
  "series_id": { "type": "string" },
  "unit_number": { "type": "integer", "minimum": 1 }
}
```

### Pedagogy Validator Service
**Location:** `backend/src/services/pedagogyValidator.js`
**Methods:**
- `validateTierAwareness(gdl)` — Rule 1
- `validateSequentialUnlock(gdl)` — Rule 2
- `validateDistractorConstraints(gdl)` — Rule 3
- `validateOrphanDetection(gdl)` — Rule 5

---

## Phase 2: Core Features (Week 3-4)

### Game Series & Unit API
**Endpoints:**
- `POST /kids/series` — Create game series
- `GET /kids/series/:id/units` — List units in series
- `POST /kids/series/:id/units` — Create unit (with prerequisite linking)
- `GET /kids/units/:id/lock-status` — Check if unit is locked for student

### Interface Onboarding
**Location:** `frontend/src/components/Onboarding/`
**Features:**
- One-time sequence before first lesson
- Teaches tap-to-select, drag-to-sort
- Uses neutral, content-free objects
- Tracked per student (`interface_onboarding_completed_at`)

### Retry/Adaptive Difficulty
**Logic:**
- First Test failure → route to Practice (neutral framing)
- After 2 Practice passes → offer Test again
- 3+ failures → flag to teacher (non-alarming)
- Never block moving to different item/category

---

## Phase 3: Engagement (Week 5-6)

### Pattern Tracking
**Data Collection:**
- `game_item_responses` — per-tap logging with tier, distractor_count, response_time_ms
- `engagement_snapshots` — session length, drop-off points
- `mastery_progress` — attempts to mastery, regression flags

**Presentation Rules (Doc 14):**
- Always relative to child's own history
- No composite scores
- Plain-language digest format
- Neutral framing for regression flags

### Garden/Companion
**Garden Progress Metaphor:**
- Each mastered item/tier plants/grows something
- Wired to real progress loops (not decorative)
- Never regresses (only grows or stays)

**Companion Character:**
- One per child (chosen at first login)
- Reacts to real events (celebrates, encourages)
- Customization via existing emoji/sticker system

### Save/Resume
**Auto-save after each question/interaction**
- Resume exactly where child left off
- Undo affordance for accidental taps
- Crash/force-close recovery

---

## Phase 4: Library & Curriculum (Week 7-8)

### Curriculum Mapping UI
**Features:**
- Browse by curriculum point or category
- Assign directly (no generation needed)
- ECE review workflow

### Library Browsing & Assignment
**Teacher Experience:**
- Select "KG1 → Animals → recognizes common domestic animals"
- Get full validated tier ladder ready to assign
- No authoring required for standard curriculum

### Teacher Customization
**Two Options:**
1. **Customize library game** — creates class-scoped copy (structural rules locked, surface content customizable)
2. **Request custom game** — original AI generation flow (passes full Pedagogy Validator)

---

## Phase 5: Polish (Week 9-10)

### Offline Mode
**Features:**
- Core gameplay functions fully offline
- Sync-on-reconnect model
- Content pre-downloaded per class/school
- Conflict resolver for sync conflicts

### Parental Controls
**Features:**
- Daily play-time limit (settable by parent/teacher)
- Time-of-day windows (optional)
- Controls in Parent Dashboard (not visible to child)

### Accessibility
**Features:**
- Large, well-spaced tap targets
- Colorblind-safe palette (verified against simulation)
- Reduced-motion option
- Consistent interaction patterns

### Full Integration Testing
**Tests:**
- Full offline session completes and syncs
- Force-close mid-session resumes correctly
- Garden never regresses on Test failure
- Daily play-limit enforcement blocks play
- Colorblind-safe palette verified

---

## Performance Optimizations

### Database
- Indexes on foreign keys and frequently queried columns
- Connection pooling (Sequelize configuration)
- Read replicas for parent/teacher dashboards (if needed)

### Frontend
- Code splitting (lazy-load game templates)
- Asset caching in IndexedDB
- Virtual scrolling for large curriculum libraries

### API
- Response caching for published game configs
- Batch operations for progress updates
- Queue prioritization for media processing

---

## Risk Mitigation

| Risk | Mitigation | Doc Reference |
|---|---|---|
| **Scope creep** | Follow recommended build order (Doc 16) | Doc 16 Integration Notes |
| **ECE framework misalignment** | Build framework first, customize later | Doc 15 Open Question |
| **Performance issues** | Index strategy, caching, connection pooling | Doc 05 Testing Strategy |
| **Offline sync conflicts** | Conflict resolver, last-write-wins strategy | Doc 17 §3 |
| **Accessibility gaps** | Colorblind simulation, reduced-motion option | Doc 17 §6 |

---

## Deliverables Checklist

### Database
- [ ] 15 new tables (Series, Units, Curriculum, Library, Pattern Tracking, Gamification, Engagement)
- [ ] Migration scripts (dry-run first, backups before apply)

### Backend
- [ ] Pedagogy Validator service
- [ ] Game Series & Unit CRUD API
- [ ] Pattern Tracking service
- [ ] Curriculum Mapping API
- [ ] Updated GDL schemas

### Frontend
- [ ] Interface Onboarding component
- [ ] Garden progress metaphor
- [ ] Companion character
- [ ] Offline mode with sync
- [ ] Parental controls
- [ ] Accessibility features

### Tests
- [ ] Unit tests for all new services
- [ ] Integration tests for new API endpoints
- [ ] E2E tests for critical user flows
- [ ] Performance tests for offline mode

---

## Final Verification

Before marking any task complete:
1. Automated test passes
2. Human QA note exists (if child-facing content)
3. Documentation updated
4. No regressions in existing tests

---

## Compliance with Reconciled Docs

| Doc | Key Requirement | Implementation |
|---|---|---|
| **Doc 12** | Association Ladder (Tier 0→3) | GDL schema + Pedagogy Validator |
| **Doc 12** | Game Series & Unit Sequencing | New tables + API + lock mechanism |
| **Doc 13** | Pedagogy Validator (Rules 1-5) | Integrated service |
| **Doc 14** | Pattern Tracking (non-diagnostic) | Data collection + presentation rules |
| **Doc 15** | Library-first model | Curriculum Mapping UI + teacher customization |
| **Doc 16** | Retry, spaced repetition, onboarding | Frontend logic + data models |
| **Doc 17** | Garden, companion, offline | Frontend components + sync service |

---

## Implementation Order (Per Doc 16)

**Recommended build order:**
1. **Interface Onboarding** (cheapest, corrupts other data if missing)
2. **Retry/Adaptive Difficulty** (core pedagogy enforcement)
3. **Reward Equity** (mostly policy/tagging, low engineering cost)
4. **Spaced Repetition** (requires data model)
5. **Multilingual Audio** (timed with Curriculum Mapping)
6. **Session Fatigue** (timed with Curriculum Mapping)
7. **Garden/Companion** (gives retry/repetition/reward logic visible surface)
8. **Offline Mode** (requires sync architecture)
9. **Parental Controls** (requires parent dashboard)

---

## Next Steps

1. **Create database migration scripts** (all groups)
2. **Update GDL schemas** (add tier/category/item_id fields)
3. **Implement Pedagogy Validator** (core service)
4. **Update execution roadmap** (add new tasks to Sprint 2-6)
5. **Begin Phase 1 implementation**

---

## Document History

| Date | Change | Author |
|---|---|---|
| 2026-08-20 | Initial implementation plan created | opencode |

---

**This plan follows all reconciled documents (12-17) and maintains existing architecture principles.**
