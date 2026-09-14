# ECCE bridge — review/approval state machine + teacher authoring screen (2026-09-14)

**Briefs:** (a) add the bridge review and approval endpoints so a submitted bridge
can reach approved and published; (b) build the teacher-facing bridge authoring
screen against the now-mounted lesson-context and lesson-bridges endpoints.

Supersedes the "still open" section of
`ecce-bridge-schema-ownership-and-routes-2026-09-14.md` for the write path.

## 1. Review → approval → child visibility (backend)

`src/controllers/kidsLessonBridges.js` + `src/routes/kids.js`:

| Route | Status required | Who | Effect |
|---|---|---|---|
| `GET /kids/lesson-bridges/:id/publish-gate` | any | staff | read-only blocker list (FR-13) |
| `POST /kids/lesson-bridges/:id/approve` | `ready_for_review` | admin | `approved`, records `approved_by` + `approved_at` |
| `POST /kids/lesson-bridges/:id/publish` | `approved` | admin | runs the gate, then `published` |
| `POST /kids/lesson-bridges/:id/recall` | `approved` \| `published` | admin | `recalled` — withdraws child visibility |

**Separation of duties.** Approve/publish/recall are admin-level (`isAdminRole`),
not merely staff: a teacher can draft, edit and submit, but the API refuses to let
the author sign off their own bridge (`403 Admin review access required.`). The
route mounts `auth` + `requireStaff`; the controller enforces the admin level, so
the two checks can never drift apart.

**Status machine.** `draft → ready_for_review → approved → published → recalled`.
Only `ready_for_review` may be approved, only `approved` may be published, and
only `approved`/`published` may be recalled. Every out-of-order call returns
`409 BRIDGE_STATUS_CONFLICT` with the current status, so the browser can never
drive a transition the server has not authorised (data contracts §7: "The API,
not the frontend, is authoritative").

**The gate** (`bridgePublishGate`) is evaluated from the stored row, so a caller
cannot assert a gate. Response shape is the contract's —
`content_id, gates, publishable, blocking_reasons` — extended with `bridge_id`,
`status` and `not_evaluated`.

| Gate | Evaluated from |
|---|---|
| `schema_passed` | `validateBridge(row)` (required text, term, week, band, 2–4 micro objectives/success evidence, evidence routes, assessment plan, game plan) |
| `objective_present` | `objective` + a reviewed `outcome_id` |
| `concrete_experience_present` | `concrete_experience` (a lesson cannot become child-visible without it) |
| `game_present` | `game_plan.components` non-empty **and** a real `kids_game_configs` row for the lesson — FR-04: a story or scene alone never satisfies the weekly game requirement |
| `item_load_valid` | every component's declared count inside the canonical band bounds imported from `gameConfigRules` (`5–10`, `5–15` for Primary) |
| `series_metadata_valid` | FR-07: a `new-representation` follow-up carries `reinforcement_of` and `representation_sequence` |
| `ece_reviewed` | the human decision, recorded on approval — never asserted by the caller |
| `bridge_complete` | aggregate of the six above |

**Honest gate reporting.** `safety_passed` and `story_alignment_reviewed` are
named in the contract but owned by the content-review phase, which does not exist
yet. Rather than claim them as passing (unsafe) or as blockers (permanently
unpublishable), the gate reports them in `not_evaluated` and neither passes nor
blocks on them. The child-facing game itself is still filtered by
`content_state='published'` in SQL — that gate is untouched.

## 2. Teacher authoring screen (frontend)

`frontend/src/pages/Teacher/BridgeAuthoring.tsx`, route `/teacher/bridge`, nav
entry "Lesson bridge" in `AdminNav`, and a `BRIDGES` block in
`src/lib/api/endpoints.ts`. It follows the flow the data contracts specify:

```
choose class context (EliteSMS) → reviewed outcome → lesson → one objective
→ concrete activity → evidence routes → game plan → assessment
→ save draft → submit for review → (reviewer) approve → publish
```

- **Class context** reuses the existing `TeacherSmsContextPanel`
  (`GET /kids/sms/lesson-context`), so the term/week/subject cell the bridge
  records is the one EliteSMS holds. The bridge itself is then cross-checked
  server-side (`SMS_CONTEXT_AGE_MISMATCH` / `SMS_CONTEXT_SUBJECT_MISMATCH`).
- **Outcomes** come from `GET /kids/learning-outcomes`, filtered by the resolved
  band + subject.
- **Game plan** offers the nine standalone templates only (a bridge component is
  never a `game-chain`), with the band's item cap enforced in the input and again
  by the API.
- **Gate panel** renders every gate, the blocking reasons and the not-evaluated
  list; **Approve / Publish / Recall** appear only for admins and surface the
  API's refusal message verbatim (including the gate body on a failed publish).
- Types live in `src/lib/types/ecceBridge.ts`; all copy is in `t()` keys added to
  `en-t-v.ts` / `en-a-c.ts` (the i18n integrity test fails the build on any
  unresolved key).

## 3. Evidence

```
backend   bash scripts/run-tests.sh --forceExit
          Test Suites: 65 passed, 65 total · Tests: 726 passed, 726 total
          (new: test/bridge-review.test.js — 15 assertions)

frontend  npx tsc --noEmit                     clean
          npx vitest run                       20 files, 229 tests passed
          npm run build:staging                ✓ built, guard:compat-css passed
          → assets/BridgeAuthoring-DC5kmkgY.js (20.50 kB, code-split)
```

`bridge-review.test.js` covers: route mounting (401, never a bare 404), the author
being refused approve/publish/recall while still reading their own gate, the gate
blocking before review with reasons, draft-cannot-approve, approval recording the
reviewer, approve-twice, publish-before-approval, the band cap failing
`item_load_valid` for a schema-legal 12-item Nursery plan, a gate-clean publish,
publish-twice, recall, publish-after-recall, and cross-school 404.

## 4. Still open

1. `safety_passed` / `story_alignment_reviewed` remain unevaluated until the
   content-review phase lands; they are declared, not silently dropped.
2. No publish **audit event** yet (roadmap: "publish audit events and failure
   diagnostics") — approval writes `approved_by`/`approved_at` but there is no
   append-only transition log.
3. The child/parent-facing payloads do not yet surface a published bridge — the
   bridge is planning data until the game payload carries it (roadmap phase 6).
