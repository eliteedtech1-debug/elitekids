#!/usr/bin/env bash
#
# scripts/ci-gate.sh — CI quality gate against the phase-C baseline-4 (Q5).
#
# WHAT IT DOES
#   1. Runs the backend jest suite via scripts/run-tests.sh (hermetic env,
#      --runInBand; see usage docs atop that script) with `--json` output.
#   2. Extracts the exact fail-set as "<test file> :: <full test title>" ids.
#   3. Compares it against the BASELINE of 4 pre-existing failures documented
#      in team-docs/reports/c-progress.md (FINAL C9) and ticketed in
#      team-docs/reports/c-preexisting-failures.md:
#         C-DEBT-01 garden-companion.test.js  :: auto-initializes garden ...
#         C-DEBT-02 garden-companion.test.js  :: does not downgrade when tier is lower
#         C-DEBT-03 kids-routes.test.js       :: returns the published game config JSON for LESSON-1
#         C-DEBT-04 series-units.test.js      :: returns locked for unit with incomplete prerequisite
#   4. A current failure counts as KNOWN only if BOTH its file basename AND a
#      case-insensitive title substring match one baseline entry. Anything
#      else — including a crashed/empty suite or a known-failing test that
#      now fails in a different file — is a NEW failure.
#
# EXIT CODES
#   0  green, or fail-set ⊆ baseline-4        → gate PASSES
#   1  at least one NEW failure               → gate FAILS (list printed)
#   2  harness error (.env missing, jest produced no usable results) → gate FAILS
#
# USAGE
#   scripts/ci-gate.sh                        # gate the FULL suite (default)
#   scripts/ci-gate.sh <run-tests.sh args...> # gate a subset, e.g.:
#                                             #   scripts/ci-gate.sh test/b1-regression.test.js --forceExit
#   GATE_JSON=path/to/prior-run.json scripts/ci-gate.sh   # self-test: skip the run,
#                                             # re-evaluate the compare logic on a saved
#                                             # jest --json artifact (no DB needed)
#
# ARTIFACTS (all under team-docs/reports/)
#   q5-ci-run-<ts>.log     full jest console output
#   q5-ci-run-<ts>.json    raw jest JSON results
#   q5-ci-gate-history.txt one-line verdict ledger (appended per invocation)

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORTS="$ROOT/team-docs/reports"
RUN_TESTS="$ROOT/scripts/run-tests.sh"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$REPORTS"

LOG="$REPORTS/q5-ci-run-$TS.log"
JSON="$REPORTS/q5-ci-run-$TS.json"

if [[ -n "${GATE_JSON:-}" ]]; then
  JSON="$GATE_JSON"
  echo "[gate] self-test mode: comparing saved artifact $JSON (no run)"
else
  echo "[gate] running suite -> $LOG"
  # --forceExit: media/generation worker handles keep the event loop alive
  # after results are written; without it jest hangs post-summary (same flag
  # infra/ci/run-backend-tests.sh uses). Duplicate flags are harmless.
  "$RUN_TESTS" "$@" --json --outputFile="$JSON" --forceExit >"$LOG" 2>&1
  JEST_EXIT=$?
  echo "[gate] jest exit=$JEST_EXIT log=$LOG"
fi

if [[ ! -s "$JSON" ]]; then
  echo "GATE=FAIL reason=no-jest-json artifact=$JSON"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | GATE=FAIL(2) reason=no-json | artifact=$JSON" >>"$REPORTS/q5-ci-gate-history.txt"
  exit 2
fi

# Extract fail-set from jest JSON: "relpath :: fullName" per failed assertion;
# suites that died wholesale (load/import error, zero assertions) become
# "relpath :: SUITE-LEVEL FAILURE: <first message line>".
FAILSET="$(node -e '
const fs = require("fs"), path = require("path");
let j;
try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
catch (e) { process.exit(3); }
const backend = path.resolve(process.argv[2]);
if (!j || !Array.isArray(j.testResults)) process.exit(3);
const ids = [];
for (const tr of j.testResults) {
  const rel = path.relative(backend, tr.testFilePath).split(path.sep).join("/");
  const failed = (tr.assertionResults || []).filter(a => a.status === "failed");
  if (failed.length === 0) {
    if (tr.status === "failed")
      ids.push(rel + " :: SUITE-LEVEL FAILURE: " + String(tr.message || "").trim().split("\n")[0]);
    continue;
  }
  for (const a of failed) ids.push(rel + " :: " + (a.fullName || a.title));
}
console.log([...new Set(ids)].sort().join("\n"));
' "$JSON" "$ROOT/backend")"
EXTRACT=$?

# node exits 3 on missing/unparseable JSON -> harness error, not a pass.
if [[ $EXTRACT -ne 0 ]]; then
  echo "GATE=FAIL reason=json-unparseable artifact=$JSON"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | GATE=FAIL(2) reason=unparseable | artifact=$JSON" >>"$REPORTS/q5-ci-gate-history.txt"
  exit 2
fi

# Empty suite = nothing ran = harness error, not a pass.
TOTAL="$(node -e '
const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
console.log((j.numTotalTests || 0) + "/" + (j.numPassedTestSuites||0));
' "$JSON" 2>/dev/null | cut -d/ -f1)"
if [[ "${TOTAL:-0}" -eq 0 ]]; then
  echo "GATE=FAIL reason=suite-ran-zero-tests artifact=$JSON"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | GATE=FAIL(2) reason=zero-tests | artifact=$JSON" >>"$REPORTS/q5-ci-gate-history.txt"
  exit 2
fi

# BASELINE-4 — sourced from c-progress.md FINAL / c-preexisting-failures.md.
# Format: <file-basename>::<case-insensitive title substring>
BASELINE=(
  "garden-companion.test.js::auto-initializes garden for a student with no data"   # C-DEBT-01
  "garden-companion.test.js::does not downgrade when tier is lower"                # C-DEBT-02
  "kids-routes.test.js::returns the published game config JSON for LESSON-1"       # C-DEBT-03
  "series-units.test.js::returns locked for unit with incomplete prerequisite"     # C-DEBT-04
)

KNOWN=()
NEW=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  file="${f%% :: *}"
  title="${f#* :: }"
  base="$(basename "$file")"
  hit=""
  for b in "${BASELINE[@]}"; do
    bfile="${b%%::*}"; btitle="${b#*::}"
    if [[ "$base" == "$bfile" && "${title,,}" == *"${btitle,,}"* ]]; then hit="$b"; break; fi
  done
  if [[ -n "$hit" ]]; then KNOWN+=("$f"); else NEW+=("$f"); fi
done <<< "$FAILSET"

echo "[gate] fail-set: ${#KNOWN[@]} known-baseline / ${#NEW[@]} new"
for k in "${KNOWN[@]}"; do echo "  KNOWN  $k"; done
for n in "${NEW[@]}";  do echo "  NEW    $n"; done

TS_H="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [[ ${#NEW[@]} -gt 0 ]]; then
  echo "GATE=FAIL reason=new-failures(${#NEW[@]}) known=${#KNOWN[@]} artifact=$JSON"
  echo "$TS_H | GATE=FAIL(1) new=${#NEW[@]} known=${#KNOWN[@]} total=$TOTAL | artifact=$JSON" >>"$REPORTS/q5-ci-gate-history.txt"
  exit 1
fi

echo "GATE=PASS fail-set-within-baseline-4 known=${#KNOWN[@]} total_tests=$TOTAL"
echo "$TS_H | GATE=PASS(0) known=${#KNOWN[@]} new=0 total=$TOTAL | artifact=$JSON" >>"$REPORTS/q5-ci-gate-history.txt"
exit 0
