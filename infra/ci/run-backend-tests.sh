#!/usr/bin/env bash
#
# CI-ish test runner for elite-kids (phase C / Q5 wiring).
#
# Usage:
#   infra/ci/run-backend-tests.sh              # regression matrix only (default)
#   infra/ci/run-backend-tests.sh regression   # same as above
#   infra/ci/run-backend-tests.sh full         # entire jest suite (--runInBand)
#
# - Injects TEST_DB_USER/TEST_DB_PASSWORD from backend/.env into the env for
#   the hermetic `elite_kids_test` DB (values are NEVER printed).
# - Writes the full log to team-docs/reports/ and a one-line summary to
#   team-docs/reports/ci-last-run.txt.
# - Exit code mirrors jest: 0 = green.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$ROOT/backend"
REPORTS="$ROOT/team-docs/reports"
MODE="${1:-regression}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$REPORTS"

if [[ ! -f "$BACKEND/.env" ]]; then
  echo "FATAL: $BACKEND/.env not found — cannot resolve TEST_DB credentials." >&2
  exit 2
fi

# Extract creds without echoing them (protocol: no .env reads via file tools).
DB_USER="$(grep -E '^DB_USERNAME=' "$BACKEND/.env" | head -1 | cut -d= -f2-)"
DB_PASS="$(grep -E '^DB_PASSWORD=' "$BACKEND/.env" | head -1 | cut -d= -f2-)"
if [[ -z "$DB_USER" ]]; then
  echo "FATAL: DB_USERNAME missing in backend/.env." >&2
  exit 2
fi

export TEST_DB_USER="$DB_USER"
export TEST_DB_PASSWORD="$DB_PASS"

LOG="$REPORTS/c-ci-run-$TS.log"

cd "$BACKEND" || exit 2
if [[ "$MODE" == "full" ]]; then
  echo "[ci] full suite: jest --runInBand --forceExit"
  npx jest --runInBand --forceExit >"$LOG" 2>&1
else
  echo "[ci] regression matrix: test/b1-regression.test.js"
  npx jest test/b1-regression.test.js --runInBand --forceExit >"$LOG" 2>&1
fi
STATUS=$?

SUMMARY="$(grep -E '^Tests:' "$LOG" | tail -1)"
SUITES="$(grep -E '^Test Suites:' "$LOG" | tail -1)"
echo "[ci] $SUITES | $SUMMARY | exit=$STATUS | log=$LOG"

{
  printf '%s | mode=%s | %s | %s | exit=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$MODE" "$SUITES" "$SUMMARY" "$STATUS"
} >>"$REPORTS/ci-last-run.txt"

exit $STATUS
