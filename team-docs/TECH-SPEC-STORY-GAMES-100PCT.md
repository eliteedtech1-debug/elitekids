# Tech Specification — Story→Game Pipeline at 100% Stated Goals

**Date:** 2026-09-03 · **Owner:** opencode (worker) + freebuff (fb-review, read-only)
**Depends on:** `team-docs/reports/story-game-preview-gap-analysis.md`,
`team-docs/reports/GAP-ANALYSIS-2026-09-01.md`, `docs/teacher-game-maker-guide.md`,
`game-engine/schemas/scene-script.schema.json`, `EXECUTION-PLAN-ELITE-SCHOOL.md`
**Sibling spec:** `team-docs/TECH-SPEC-LABEL-DIAGRAM-CLOCK-GAMES.md` — two new game
types (`label-diagram`, `stage-sequence` + `AnalogClock` SVG) discovered missing during
academic-content review; their registry/enum cleanup is that spec's Phase 1 and should
land before or with Phase A here.
**Sibling spec 2:** `team-docs/TECH-SPEC-LEARNING-PATH.md` — replace the student "All
Games" tab with a series-driven visual Learning Path (units = one topic each), strict
server-side age isolation (Year N never sees Year N+1), spill-over recovery, and weekly
goals. The series/units/lock engine already exists server-side; the student UI doesn't
use it. Sits on the same series structure this spec's story games flow through.
**Compliance:** C1 (no kids tables in `elite_db`), C2 (additive, defaulted columns only),
C4 (all artifacts in `team-docs/`), deploy-on-push (`git push production main` auto-runs
tests → build → nginx serves `dist/`; workers do NOT self-commit prod code — MASTER commits).

Legend: ✅ done · 🟦 in progress · ⬜ todo

---

## 0. Stated goals (the 100% target)

| # | Goal (as stated by supervisor/user) | Current state | Status |
|---|-------------------------------------|---------------|--------|
| G1 | **Game Maker GUI active** — create, preview, test game | SceneEditor GUI (4 types), Test Play (Step 4), Preview Game (Step 5), `/teacher/preview/:lessonId` + `/teacher/preview-draft` | ✅ shipped `c5b8bb5` + `87e077b`, live |
| G2 | **Admin can play-test a game before approval** | Staff-only `GET /kids/lessons/:id/game/preview` serves any `content_state`; Preview button on every TeacherApprovals card; preview mode skips progress/adaptive/offline | ✅ shipped `87e077b`, live |
| G3 | **Learning story + clear academic objectives → successful, tangible game scenes** | Linear scene intro works (text cards + TTS, 4 types); visual layer missing (backgrounds, scene images, animated characters, transitions, auto-advance, `game_checkpoint`); guide exists but no pre-built story templates | 🟦 partial — this spec bridges it |
| G4 | **Teacher can author the visual story end-to-end without code** | SceneEditor has text/type only; no image/background/character/duration/transition fields; no template starter | ⬜ Phase A–C below |
| G5 | **Verification that the story game is real** (not a bare matching game) | First teacher game ("Counting Fruits 1–5") was text-only; no test that story ↔ gameplay align | ⬜ Phase D (acceptance tests + smoke) |

**Definition of 100%:** a teacher can (1) pick a template, (2) write scenes with
images/backgrounds/characters that express a NERDC-style objective, (3) embed a live
game checkpoint mid-story, (4) Test Play before submit, (5) admin Preview + play the
pending game before approval, (6) the child sees an illustrated narrated story that
funnels into the objective's gameplay — all verified by automated + manual tests.

---

## 1. Gap matrix (current → 100%)

Verified 2026-09-03 against live code (backend running @ `f642eb6`, dist rebuilt 05:50Z).

| Capability | Schema (scene-script.schema.json) | SceneEditor GUI | Runtime (GamePlay) | Gap to close |
|---|---|---|---|---|
| Scene types | `teach`/`reinforce`/`game_checkpoint` | `intro`/`teach`/`reinforce`/`match` | text cards only | **enum mismatch**: GUI `intro`/`match` ∉ schema enum; `scene_type` column always saves `'teach'` (renderer reads `type`, backend reads `sceneType`) — align one contract |
| Scene image | ❌ no field | ❌ no field | ❌ n/a | **A1/A4**: add `image` (URL) + render |
| Background | `background` key exists ("farm-daytime") | ❌ no field | ❌ **not rendered** | **A2–A5**: render + picker + asset library |
| Characters | `characters[] {rigId,animation,position}` exists | ❌ no field | static emoji badge only, no animation | **A3/A4**: animate / position / pose |
| Narration audio | `narrationAudio` exists | ❌ no field | TTS only, audio ignored | **A3**: play `narrationAudio` if present, else TTS |
| Auto-advance | `durationSec` (3–60) exists | ❌ no field | click-only, not enforced | **A3**: timer + pause-on-tap |
| Transitions | ❌ | ❌ | ❌ | **A1/A3**: `transition` field + fade/slide |
| Mid-scene game embed | `game_checkpoint` + `gameId` exists | ❌ not exposed | ❌ **not implemented** | **Phase B**: embed game, resume scenes |
| Story/recap types | ❌ | `intro`/`match` used as de-facto | intro = first card only | **A1**: formalize `intro`/`recap` semantics |
| Story templates (D2-C) | ❌ | ❌ | ❌ | **Phase C**: template scaffolds per game type |
| Preview any state | ✅ `getGamePreview` (staff) | ✅ buttons | ✅ `?preview=1` skips writes | done |
| Objective→story guidance | ✅ guide §"Turning a learning objective into a story game" | ❌ in-GUI hints | n/a | **C3**: link guide + in-GUI hint text |

**Effort budget (S/M/L):** A=2 sprints (S/M), B=1 sprint (S), C=½ sprint (S), D=½ sprint (S).

---

## 2. Target architecture (spec)

### 2.1 Scene Script v2 — one contract everywhere

Align GUI, schema, persistence (`kids_scene_scripts.script_json`), and renderer on a
**single canonical shape** (superset of today's runtime wrapper):

```json
{
  "scenes": [
    {
      "id": 1,
      "type": "intro | teach | reinforce | recap | game_checkpoint",
      "text": "Maya the farmer lost her 5 fruits…",
      "image": "https://cdn.elitekids.com.ng/scenes/farm-maya.png",
      "background": "farm-daytime",
      "characters": [
        { "name": "Maya", "emoji": "👩🏾‍🌾", "image": null, "rigId": "maya-the-farmer", "animation": "idle", "position": "left" }
      ],
      "narrationAudio": null,
      "durationSec": 12,
      "transition": "fade | slide | none",
      "subtitles": true,
      "gameId": "CONFIG-42"
    }
  ]
}
```

- `gameId` required iff `type === 'game_checkpoint'`; must resolve to a config visible
  to the requester (published for children, any state for staff preview) — else **422**
  fail-closed (ECCE-ROADMAP #19 rule).
- Keep the emoji-first fallback chain: `image` → `background` palette/scene art →
  `characters[].emoji` → text-only (current). Nothing breaks if a field is absent.
- Schema file `game-engine/schemas/scene-script.schema.json` is the single source of
  truth; SceneEditor serializes to it; `toRuntimeGameConfig` / `getGamePreview` /
  `getPublishedScenes` pass it through verbatim.

### 2.2 Data model (C1/C2-compliant, no new shared-DB writes)

- `kids_scene_scripts` (kids-owned, already live): persists `script_json` (v2 shape) —
  **no ALTER needed** since fields live inside JSON. Only fix: write `scene_type` from
  the canonical `type` (today the backend reads `sceneType` while GUI sends `type` →
  column always `'teach'`; cosmetic but must match the contract).
- New kids-owned table `kids_scene_assets` (only if we later store curated assets in DB
  instead of URLs): `asset_key` PK, `kind` enum(`background`,`character`,`scene`),
  `url`, `fallback_emoji`, `tags` JSON, `is_approved` bool, `created_at`. Boot-time
  reconcile pattern (existence-check + defaulted additive columns) per C2/C3 template.
- Asset library v1 = **seeded JSON keys with CDN/asset URLs + emoji fallbacks**
  (reuse `backend/src/media/asset-saver.js` B2 pattern + `CachedImg` + `emojiData.ts`),
  not a new table — table only if/when teachers upload custom art (Phase E option).

### 2.3 API surface (additive only)

| Endpoint | Auth | Purpose | Status |
|---|---|---|---|
| `GET /kids/lessons/:id/game/preview` | `auth + requireStaff` | any content_state + scenes | ✅ `87e077b` |
| `GET /kids/lessons/:id/scenes` | `auth + requireKidsEntitlement` | published scenes (children) | ✅ exists |
| `GET /kids/scene-library` | `auth + requireStaff` | approved backgrounds/characters/transitions lists for the picker | ⬜ A5 |
| `GET /kids/story-templates?template=matching` | `auth + requireStaff` | template arc + scene-card scaffolds + glue hints | ⬜ C1 |
| `POST /kids/lessons/:id/game/checkpoint-check` (or validate inline on save) | `auth + requireStaff` | resolves `gameId` → 200/422 | ⬜ B3 |

Scene save path already persists `scenes[]` in `createLessonManual`
(`controllers/kids.js:724`) — extend validation there; no route change needed for A.

### 2.4 Frontend components

| Component | Change | Phase |
|---|---|---|
| `frontend/src/components/SceneEditor.tsx` | add per-card fields: image URL, background picker, character picker (+position/animation), transition select, duration input, type dropdown incl. `game_checkpoint` + `recap`; "Start from template" button; emit v2 canonical shape | A4, C2 |
| `frontend/src/pages/Student/GamePlay.tsx` | new `SceneRenderer`: background layer → character(s) → scene image → text card → narration (audio else TTS); `durationSec` auto-advance with pause-on-tap; transition between cards; `game_checkpoint` renders embedded game (reuse existing per-template render path) then resumes scenes | A3, B2 |
| `frontend/src/components/StoryTemplatePicker.tsx` (new) | lists templates per game type, previews arc, applies scaffolds to SceneEditor | C2 |
| `frontend/src/lib/utils/scenes.ts` (new) | `normalizeSceneScript()` — canonicalize legacy `{id,text,type}` wrappers to v2; `sceneToVisual()` fallback chain; shared by GamePlay + preview | A1 |
| `frontend/src/lib/i18n/en.ts` (+`ha.json`) | keys: `scene.*` (types, pickers, template names), `game.checkpointContinue` | A4/C2 |

### 2.5 Guide (docs)

- Extend `docs/teacher-game-maker-guide.md` "Turning a learning objective into a story
  game": add per-scene visual instructions, checkpoint example, template walkthrough,
  and an explicit "story ↔ gameplay alignment" self-check (the G5 requirement).

---

## 3. Actionable plan (phases)

### Phase A — Scene visual layer (D1: fast option A + curated backgrounds B) 🟦

**Goal:** a story scene is an illustrated, narrated card, not bare text.

| # | Task | Files | Effort |
|---|---|---|---|
| A1 | Canonical v2 shape + `normalizeSceneScript()`; extend `scene-script.schema.json` (add `type` enum incl. `intro`/`recap`/`game_checkpoint`, `image`, `transition`; document `characters[].emoji`) | `game-engine/schemas/scene-script.schema.json`, `frontend/src/lib/utils/scenes.ts` (new) | S |
| A2 | Backend: validate scenes on save against v2 (types, durationSec 3–60, gameId required for checkpoint); write real `scene_type` from canonical `type`; pass-through in `toRuntimeGameConfig`, `getGamePreview`, `getPublishedScenes` | `backend/src/controllers/kids.js`, `backend/src/models/KidSceneScript.js` | S |
| A3 | GamePlay `SceneRenderer`: background layer (key→palette/art, fallback gradient), character emoji/rig at position, scene image, text card + stagger animation (existing), narration = `narrationAudio` else `speakScene`, `durationSec` auto-advance timer (pause on tap), `transition` fade/slide | `frontend/src/pages/Student/GamePlay.tsx` | M |
| A4 | SceneEditor v2 fields + type dropdown (intro/teach/reinforce/recap/game_checkpoint) + image URL + background + character + duration + transition; Easy/JSON sync emits v2 | `frontend/src/components/SceneEditor.tsx` | M |
| A5 | `GET /kids/scene-library`: seeded approved backgrounds (`farm-daytime`, `classroom`, `garden`, `kitchen`, `space`) + characters (`maya-the-farmer`, `buddy-the-fox`, …) with emoji fallbacks; frontend pickers consume it | `backend/src/controllers/kids.js`, `backend/src/seeders/sceneAssetsSeed.js` (new), SceneEditor pickers | S |
| A6 | i18n keys + `tsc --noEmit` + build + vitest (SceneRenderer unit tests) | `frontend/src/lib/i18n/en.ts`, tests | S |

**Exit criteria:** teacher builds "Maya's Counting Farm" with background + character +
image + 12s auto-advance; Test Play shows illustrated narrated scenes; old `{id,text,type}`
lessons still play (normalizer).

### Phase B — `game_checkpoint` mid-scene embed 🟦

**Goal:** a live game runs *inside* the story, then the story resumes.

| # | Task | Files | Effort |
|---|---|---|---|
| B1 | SceneEditor: `game_checkpoint` type exposes a game picker (published lessons from this school + staff preview any) → writes `gameId` | SceneEditor.tsx | S |
| B2 | GamePlay intro: scene of type `game_checkpoint` renders the embedded game (reuse the same template render path with that config, `preview`-like, no progress write), then continues remaining scenes → final game | GamePlay.tsx | M |
| B3 | Validation: `gameId` must resolve (published for child / any for staff) → else 422 at save; checkpoint embedded games never write progress from within the story | `backend/src/controllers/kids.js`, `backend/src/routes/kids.js` | S |
| B4 | Tests: checkpoint embed happy path + 422 unknown gameId + no-progress-write | `backend/test/b2-story.test.js` (new) | S |

**Exit criteria:** a 5-scene story with a checkpoint in the middle plays: intro → teach →
**mini-game** → reinforce → recap → main game; child progress records only the real games.

### Phase C — Story templates (D2-C) + guide 🟦

**Goal:** fastest path to a repeatable, objective-driven story game.

| # | Task | Files | Effort |
|---|---|---|---|
| C1 | `GET /kids/story-templates`: per game type — arc (hook→teach→practice→checkpoint→recap), 3–5 scene-card scaffolds with placeholder text, story-glue hints (mirror the guide's table) | `backend/src/controllers/kids.js`, seed data | S |
| C2 | StoryTemplatePicker in SceneEditor Step 4: pick template → prefilled scene cards (teacher edits names/numbers) | SceneEditor.tsx, `StoryTemplatePicker.tsx` (new) | S |
| C3 | Guide update: template walkthrough + checkpoint scene + visual-layer tips + story↔gameplay self-check | `docs/teacher-game-maker-guide.md` | S |

**Exit criteria:** teacher creates "Counting 1–5" from a template in <3 min and the
story+gameplay provably line up (G5).

### Phase D — Verify to 100% 🟦

| # | Task | Files | Effort |
|---|---|---|---|
| D1 | Backend `b2-story.test.js`: preview any state (existing), v2 validation (bad type/duration/gameId), scene_type round-trip, checkpoint 422, no-write in checkpoint | `backend/test/b2-story.test.js` | S |
| D2 | Frontend vitest: `normalizeSceneScript` (legacy→v2, emoji fallback), SceneRenderer (background/image/character render, auto-advance, transition), template scaffold application | `frontend/src/lib/utils/scenes.test.ts`, component tests | S |
| D3 | Live smoke after MASTER commit+push (deploy auto-runs): teacher path (template→scenes→Test Play→submit), admin path (Preview pending → play → approve), child path (illustrated story → checkpoint → game → recap) | manual checklist in this doc | S |
| D4 | Close schema enum mismatch & `scene_type` column bug (A2) — verify stored `scene_type` matches canonical type | `backend/test` | S |

**Exit criteria:** full backend suite green (baseline 2F/355P/357T minus C-DEBT-01/02),
vitest 48/48 + new suites, live smoke passes, G1–G5 all ✅.

### Phase E — House gaps (optional stretch, unblocks "100% platform" claims)

From `GAP-ANALYSIS-2026-09-01.md` top-priority list — each has an existing plan/checklist;
queue as separate briefs so Phase A–D is not blocked:

| # | Gap | Source plan | Priority |
|---|---|---|---|
| E1 | MVP→prod DB swap (still on `_test` DBs) | `MVP-TO-PROD-DB-SWAP.md` | HIGH |
| E2 | Node 20→22 (EOL) | full-system-audit L3 | MEDIUM |
| E3 | Upsell banner on 403 → plans page | EXECUTION-PLAN Phase 2.5 | HIGH |
| E4 | Parent merged controls + weekly report | EXECUTION-PLAN Phase 4.1/4.2 | MEDIUM |
| E5 | Global library UX + `is_global` badge + copy mode | EXECUTION-PLAN Phase 5 | MEDIUM |
| E6 | Child-facing mode-change server guard | EXECUTION-PLAN Phase 4.3 | MEDIUM |
| E7 | chat `dbm()` call bug + finish kidsChat stub | s8-fb4-scenegui-progress known-issue #2 | MEDIUM |
| E8 | Orphan components cleanup (5 files) | GAP-ANALYSIS §4 | LOW |
| E9 | Scene/character art upload (teacher-owned) → `kids_scene_assets` table | §2.2 of this spec | LATER |

---

## 4. Verification & rollback

1. Every phase ends with: `tsc --noEmit` clean, `npm run build` OK, `npm run test:regression`
   25/25, full suite via `scripts/run-tests.sh` (baseline 2F/355P/357T, fail-set = C-DEBT-01/02 only).
2. Deploy only via MASTER `git push production main` (auto: run-tests → rebuild-frontend →
   nginx serves new `dist/`). No manual restarts; workers never self-commit prod code.
3. Scene changes are additive and JSON-contained (C1/C2): rollback = revert commit and re-push;
   old lessons keep working via `normalizeSceneScript()`; no schema ALTERs in this spec.
4. `backend/.env.test` stays untracked-excluded-or-committed per MASTER precedent — never stage secrets.

## 5. Risks

- **Asset sourcing/licensing** (Phase A5): use open-source/B2 assets already in the media
  pipeline; emoji fallback guarantees no broken visuals (C10: ≤2 req/s on sweeps).
- **Schema enum drift** (A2/D4): single canonical shape enforced by `normalizeSceneScript` +
  save-time validation; both GUI and backend read/write the same field names.
- **Checkpoint scope creep** (B): embedded game must NOT write progress or spawn mode-lock /
  adaptive flows — reuse preview semantics; keep B3 validation strict.
- **Enum mismatch regression** (D4): covered by `b2-story.test.js` scene_type round-trip.
- **Deploy conflict** (b7085ae precedent): VPS local edits on `main` re-conflict on stash
  pop — MASTER must ensure clean VPS checkout before push.

## 6. File touch map

**Backend:** `controllers/kids.js` (validate/pass-through/library/templates),
`models/KidSceneScript.js` (scene_type write), `seeders/sceneAssetsSeed.js` (new),
`routes/kids.js` (2 new GETs), `test/b2-story.test.js` (new).
**Frontend:** `components/SceneEditor.tsx`, `components/StoryTemplatePicker.tsx` (new),
`pages/Student/GamePlay.tsx` (SceneRenderer + checkpoint), `lib/utils/scenes.ts` (new) + test,
`lib/i18n/en.ts`/`ha.json`.
**Schema/docs:** `game-engine/schemas/scene-script.schema.json`,
`docs/teacher-game-maker-guide.md`.

---

## Acceptance checklist (100% = all ✅)

- [ ] G1 Game Maker GUI: create → scenes (illustrated) → Test Play → submit ✅ (visual fields = Phase A)
- [ ] G2 Admin play-test pending game before approval ✅ (already shipped; re-verify in D3)
- [ ] G3 Story with objective → tangible game scenes (backgrounds, characters, images, narration, auto-advance) = Phase A
- [ ] G4 Teacher authors visual story without code (template + pickers) = Phase C
- [ ] G5 Story↔gameplay alignment verified (guide self-check + D1–D3 tests)
- [ ] Full suite green except documented C-DEBT-01/02; regression 25/25; vitest + new suites
- [ ] Live smoke on elitekids.com.ng post-deploy (teacher/admin/child paths)