# Testing Strategy

Two testers: the AI coding agent (automated) and a human (judgment calls). Neither
substitutes for the other.

## Automated (AI agent owns this)
| Layer | Test type | Tooling |
| --- | --- | --- |
| Auth (users/parents/students login, verify-token) | Integration — real JWT against a test school DB | Jest + Supertest |
| Tenancy (subdomain → school lookup, tenant headers) | Integration | Jest + Supertest |
| Kids schema (Game Config / Scene Script validation) | Unit — valid/invalid JSON cases | Jest/Vitest + ajv |
| Content Config Generator | Integration — mock AI response → validated output or safe fallback | Jest |
| Content state machine | Integration — a `generated`/`recalled` config returns 404 on child-facing routes; only `published` is served | Supertest |
| Safety pipeline (classifier + denylist + audit) | Integration — failing content auto-rejected + audit row written | Jest |
| B2 upload pipeline | Integration — mock S3 client, assert resize + correct bucket/key | Jest |
| Progress Service API | Integration — auth, persistence, idempotency of `game:complete` | Supertest |
| GameEngine mount/unmount | Unit — no memory leaks, Phaser instance destroyed on unmount | React Testing Library |
| End-to-end play flow | E2E — load lesson → play matching game → complete → progress recorded | Playwright |

Run on every task completion, not just before merge.

## Human QA (agent flags, human decides)
- Age-appropriateness of generated text/imagery per level (Creche/Nursery/KG1/KG2/Primary)
- Difficulty and pacing of each game template with a real child-age target in mind
- Audio/voice clarity and tone
- Cultural/local-context accuracy (Nigerian English, local examples)
- Reward pacing (not too easy/hard to earn stars)
- Module-gate sanity: a school without `kids_stand_alone=1` cannot reach the app

Human QA checklist lives in `SPRINT_N_NOTES.md` per sprint (see orchestration guide).

## Definition of "tested"
A task is only checked off in the roadmap when: automated test passes AND (if it
touches child-facing content) a human QA note exists, even if just "looks fine."
