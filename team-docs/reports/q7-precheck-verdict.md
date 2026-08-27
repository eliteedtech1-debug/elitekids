# Q7 PRECHECK VERDICT — verify-before-Q7 sweep

**Date:** 2026-08-23 · **Agent:** fb-review (advisory, read-only) · **Scope:** A) b1-regression.test.js vs c-test-matrix-expansion.md invariants; B) 4 B2 media fixes in `git diff HEAD~3 -- frontend` (609 lines total, read in full); C) fail-set 40→4 claim from c-progress.md evidence chain. **Zero code modified.**

---

## A) backend/test/b1-regression.test.js vs brief c-test-matrix-expansion.md — **PASS (with gaps)**

Brief invariants → coverage in file (25 `it()`s, 4 describe blocks — count verified):

| Invariant | Coverage | Status |
|---|---|---|
| 1. Auth + series flow (login → Bearer → /kids/series) | 6 tests: login ok/wrong-pw, series list w/ unit_count, owned CRUD series+unit, category filter, 401 unauthed | ✅ |
| 2. get-details contract `{success, data:[school]}` | 3 tests: short-name resolve, unknown → `{success:false,data:[]}` HTTP 200, school_id query | ✅ |
| 3. Mode-lock endpoint 200 `{success:true,data}` | 11 tests incl. null-lock contract, param validation, role hierarchy (parent<teacher), class-wide, list, remove (equal-rank unlock, lower blocked) | ✅ |
| 4. Round-count ≥5 invariant | 5 tests: template→key map lock, direct violation flags (incl. unmapped + bad JSON), deterministic published universe, legacy-exemption proof, negative controls (draft + puzzle-split) | ✅ |
| Wire into CI-ish runner | `infra/ci/run-backend-tests.sh` (regression/full modes, hermetic creds from backend/.env without echo, logs + summary) + `npm run test:regression` | ✅ |

Fixtures grounded: test-db.js seeds SCH-TEST/NUR-001..006/admin@kids.test/parent@kids.test/other@kids.test/LESSON-1 and kids_mode_locks DDL was added (test-db.js:180). Helper `game-config-invariant.js` is sound (exempts puzzle-split + LEGACY_EXEMPT_IDS GAME-1 trio; fails loudly on unmapped/bad JSON).

**Gaps (no code touched — advisory):**
- **G1 — Invariant scope is a subset, not the universe.** The ≥5 test only scans `B1CFG-%` + GAME-1 trio, by design (avoid cross-suite races). C-DRIFT-02 itself documents prod published configs that violate (matching min=1, quiz 12/15 lacking `questions`, etc.). No automated prod-wide scan exists; new prod violations would not be caught by CI. Ticketed, but flagging as a coverage hole.
- **G2 — Helper registry is incomplete vs runtime templates.** GamePlay.tsx renders **7** templates (matching, tap-recognition, drag-sort, quiz, fill-in-blank, **memory-pairs**, puzzle-split; :3178-3196). `ROUNDS_KEY_BY_TEMPLATE` maps only 5 + exempts puzzle-split — **memory-pairs is unmapped** → any published memory-pairs config would be a *false-positive* "unmapped template" if scanned, and it's absent from the deterministic universe so never exercised. Also **fill-in-blank is shape-strict**: helper checks `sentences[]`, but FillBlankGame (:900) supports a legacy single-sentence shape (`blanks[]` with no `sentences`) — a valid ≥5-blank legacy config would be falsely flagged, and the runtime round counter (:2475) reads `config.blanks`, not `sentences`. Recommend either mapping memory-pairs (≥10 items ⇒ ≥5 pairs) and normalizing fill-in-blank, or documenting the shape contract.
- **G3 — One assertion is vacuous.** "allows class-wide locks" test ends with `expect([200]).toContain(get.status)` and a comment claiming "effective-lock resolution via class_code is covered by the direct table read below" — **there is no table read below**; only HTTP 200 is asserted, `data` is unchecked. Effective class-wide lock resolution for a student is not actually verified.
- **G4 — No enforcement-side test.** The frontend now depends on the game-config fetch returning `data:null` when a lock blocks (lock-aware error screen added in this diff), but no backend test asserts that contract. b1 locks the GET/POST/role behavior, not the game-fetch gate.
- **G5 — Shared-DB mutation.** The owned-CRUD test creates a series + unit that persist in the hermetic DB (pollution class C-DEBT-04). Mitigated by tolerant seeded-row checks, but the file still leaves rows behind.
- **G6 — CI "full" gate is still red.** 3 suites fail in run4 (garden-companion, kids-routes, series-units) → a wired full-mode gate would fail. Residuals are ticketed (C-DEBT-01..04) with "blocker: no", but there is no green CI gate yet.

---

## B) 4 B2 media fixes in `git diff HEAD~3 -- frontend` — **PASS (verified 200s; caveats)**

Fixes identified from b2-progress.md + diff, each independently verified (my own CDN curls this session):

1. **Twemoji codepoint corrections** (emojiData.ts ×7: squid `1f991`, camel `1f42a`/two-hump `1f42b`, police `1f693`, thunderstorm `26c8`, pleading `1f97a`, anger-bubble `1f5ef`, hourglass `23f3`; MediaLibrary storm `26c8`). **All HTTP-verified 200** by me: `1fab2 1f991 1f9a7 1f42a 1f693 26c8 1f97a 1fab9 1f5ef 23f3 31-20e3 1f51f` = 200×12.
2. **FE0F-strip in `toImageUrl`** + keycap `3X-20e3`, ZWJ flag joins, broken-doll row `1f38e`, dropped (c)/(r) explicit codepoints. The (c)/(r) drop is **verified a genuine fix**: twemoji@14.0.2 serves **unpadded** `ae.png`/`a9.png` (200, real 764/744-byte PNGs) while padded `00ae`/`00a9` **404** — my initial regression hypothesis was disproved by the HTTP check. Negative control `zzzz.png` = 404 text/plain confirms no CDN error-page masking.
3. **CachedImg loading skeleton** (opacity 0.5→1, `#E7EEF6` placeholder, `img-loading-pulse`, `aria-busy`). Fallback-safe: `onError` path untouched; changes are cosmetic. Minor nit: `style.animation` shorthand in the constructed style overrides any consumer-supplied `style.animation`.
4. **BASE_URL same-origin default (`''`) + `guard:bundle` script** (constants.ts, check-bundle.mjs, `guard:bundle` npm script). Guard is strict (fails on localhost/127.0.0.1 in dist; requires VITE_API_URL defined).

**Caveats / risks (flag for Q7):**
- **R-B1 — Fixes are dormant (tree-shaken).** B2's own verification (multiple resume passes) established the entire repaired surface — icons.ts, emojiData.ts, MediaLibrary chain (StickerButton → EmojiPicker → MediaLibrary) — is **dead code in the prod bundle**: StickerButton has zero importers, PairIcon never rendered, number-icon helpers never called. Only `.png` strings in dist are example.com config fixtures. The "540 URLs / 0 bad after sweep" measures **source**, not runtime. Correctness stands, but user-facing impact is currently nil — Q7 should decide whether to wire these components or accept dormant state.
- **R-B2 — Dev boot with empty VITE_API_URL.** `frontend/.env` has `VITE_API_URL=` (length 0 verified) and vite.config.ts has **no dev proxy**. BASE_URL now defaults to `''` → in `npm run dev` (vite :34601) all API calls go same-origin to the vite server → breakage unless a local `.env.local` sets VITE_API_URL. Prod nginx proxy assumption is documented and live-verified (elitekids vhost, bundle byte-identical), so this is dev-experience risk only.
- **R-B3 — StrictMode side-effect in updater** (mode-lock enforcement, same diff): `setMode(current => { setTimerRunning(...); setTimerKey(...); return ...; })` runs side effects inside a state updater — double-invoked under React StrictMode; idempotent (timer reset) so low impact, but not idiomatic.

---

## C) Fail-set 40→4 claim — **PASS (substantiated; provenance caveats)**

Evidence chain independently verified:
- Full-suite logs exist and match c-progress.md exactly: run1 **41F/248P/289T** → run2 **40F/250P/290T** → run3 **10F/280P/290T** → run4 **4F/286P/290T** (c-full-suite-run{1..4}.log; summary lines grepped).
- run4 log shows `PASS test/b1-regression.test.js` **in-suite** (25/25), plus the 3 failing suites matching C-DEBT-01..04 (garden-companion, kids-routes, series-units).
- Standalone regression CI run recorded: `ci-last-run.txt` 2026-08-23T07:27Z — 25/25, exit 0.
- Ledger `c-preexisting-failures.md` lists C-F1..F8 (fixed prod defects) + C-DEBT-01..04 (residual) + C-DRIFT-01..03 — internally consistent, zero ALTERs claimed and no DDL drift found in my reads.

**Caveats:**
- **R-C1 — Baseline provenance.** "40F/225P/265T" is B1's *recorded* STEP5 number; C never re-ran the pre-fix suite to reconfirm 40F on the exact tree. The comparison also spans suite growth 265→290 tests (+25, all green). Direction and magnitude are corroborated by the 4 run logs, so the claim holds, but it's B1-baseline-vs-C-final, not A/B on one tree.
- **R-C2 — Residual 4 are not a subset of the original 40.** The ledger is transparent: they "never executed successfully before" — newly *reachable* post-fix ordering/pollution failures (C-DEBT-01..04). So "fail-set 40→4" means "all 40 pre-existing eliminated; 4 different failures now exposed, ticketed" — accurate but worth stating precisely.
- **R-C3 — Suite-level gate still red.** 3/21 suites fail at run4; C-DEBT tickets carry "blocker: no" but full CI is not green. Fine for a shrink target, not for a hard gate.

---

## OVERALL

| Item | Verdict |
|---|---|
| A) Regression matrix vs brief | **PASS** — 4/4 invariants + CI wiring present; gaps G1–G6 (coverage scope, memory-pairs/fill-in-blank registry, one vacuous assertion, missing enforcement test) |
| B) B2 media fixes | **PASS** — 12/12 fixed codepoints HTTP-200 verified (incl. unpadded (c)/(r) confirmed correct); fallbacks safe; caveats: tree-shaken/dead in bundle, dev-boot BASE_URL risk, StrictMode updater nit |
| C) 40→4 claim | **PASS** — run logs + ledger + in-suite b1 PASS corroborate; caveats: B1-recorded baseline, residual-4 provenance, red full gate |

**Top risks to carry into Q7:** (1) repaired media surface is dead code in the shipped bundle; (2) invariant matrix incomplete for memory-pairs/legacy fill-in-blank; (3) no enforcement-side lock test; (4) dev boot needs VITE_API_URL (empty in committed .env); (5) full CI suite still 3 suites red.
