# QA Instructions — Step by Step

Companion to 05-TESTING-STRATEGY.md. That file says *what kind* of testing each layer
needs; this file says exactly *what to do*, task by task.

## For the AI coding agent — run this after every roadmap task
1. **Write the test before/alongside the code** for the task (unit or integration, per
   the table in 05-TESTING-STRATEGY.md).
2. **Run the full test suite**, not just the new test — catch regressions.
   - Backend: `cd backend && npm test` (Jest)
   - Frontend: `cd frontend && npm test` (Vitest / React Testing Library)
   - E2E (Sprint 3+): `npx playwright test`
3. **If a test fails:** fix it before moving to the next task. Do not comment out or
   skip a failing test to keep momentum.
4. **If the task touches child-facing content or data** (lesson text, images, game
   config, any child/parent-visible screen): add a line to that sprint's
   `SPRINT_N_NOTES.md` under `## Needs Human QA`.
5. **Check the box** in 03-EXECUTION-ROADMAP.md only once 2–4 are done.

## For the human tester — per sprint
Open `SPRINT_N_NOTES.md`, work through `## Needs Human QA`, fill in the checklist
below, commit it back.

### Human QA checklist (copy into SPRINT_N_NOTES.md per sprint)
```
## Human QA — Sprint N
Tester: __________  Date: __________

Content & age-appropriateness
[ ] Lesson/story text matches the stated age level (Creche/Nursery/KG1/KG2/Primary)
[ ] No content is scary, violent, or confusing for the target age
[ ] Local/Nigerian context is accurate where used (names, foods, animals, English)

Game/interaction quality
[ ] Game template matches the lesson topic sensibly
[ ] Difficulty feels right for the age group (not frustrating, not trivial)
[ ] Instructions/prompts are understandable without reading (icons/audio help)
[ ] Reward pacing feels fair (stars/xp not too easy or too hard to earn)

Audio/visual
[ ] Narration/voice is clear and correctly paced
[ ] Images/animations load correctly, no broken assets
[ ] Colors/branding match 06-BRANDING-AND-UIUX.md (Yale Blue / Harvard Red usage)

Functional smoke test (elite-core addon specifics)
[ ] Login works with an existing EliteCore teacher account (shared JWT)
[ ] Parent login works (user_type='parent', child picker lists the right children)
[ ] School with kids_stand_alone=0 sees the "Access Restricted" gate
[ ] Lesson generation completes; content sits in pending_human_review until approved
[ ] Game loads, is playable start to finish, completion is recorded (no double count)
[ ] Teacher dashboard reflects the completed game/lesson
[ ] Sign-out does not break the EliteCore session elsewhere (token is shared — be careful)

Result: PASS / PASS WITH NOTES / BLOCKED
Notes: ________________________________________
```

> **Shared-session caution for human testers:** the same `JWT_SECRET_KEY` signs all
> ecosystem tokens. Logging out of elite-kids must clear *its* token storage without
> assuming it can invalidate elite-core's tokens. Test sign-out behavior per app.

## Acceptance criteria by sprint
| Sprint | Automated bar | Human bar |
| --- | --- | --- |
| 0 — Repo/env | Migration dry-run clean; boot seeds SCH-KIDS; health OK | n/a |
| 1 — Core services | Auth/tenancy CRUD + queue integration tests pass | n/a (no child-facing content yet) |
| 2 — Content Config Generator | Schema validation for all 4 templates incl. malformed input → fallback; state machine + audit tests | Spot-check 3 generated configs |
| 3 — Game Engine | Each scene mount/interact/complete test; unmount shows no leaked listeners | Play all 4 templates on a phone-sized viewport |
| 4 — Rewards/progress | `game:complete` persistence + idempotency tests | Dashboards correct after 2–3 real play sessions |
| 5 — Asset pipeline | Upload pipeline resize + correct bucket/key | No compression artifacts on sample images |
| 6 — Pilot readiness | Full E2E green | Full checklist for KG1 "Animals Around Us" end to end |

## Bug/issue logging
Log failures as `## Issue` in `SPRINT_N_NOTES.md`:
```
## Issue
Sprint: N
Found by: agent / human
Severity: blocker / major / minor
Description: ...
Steps to reproduce: ...
```
Blockers stop that task's checkbox from being marked done.
