#!/usr/bin/env bash
#
# scripts/run-tests.sh — hermetic-env jest --runInBand wrapper (Q5 CI runner).
#
# WHAT IT DOES
#   Builds a hermetic environment for the backend jest suite and execs
#   `npx jest --runInBand` from backend/:
#     - TEST_DB_USER / TEST_DB_PASSWORD are sourced via bash grep from
#       backend/.env (never printed, never logged). Explicit `TEST_DB_USER=`
#       / `TEST_DB_PASSWORD=` lines win if present; otherwise the app DB
#       credentials (`DB_USERNAME=` / `DB_PASSWORD=`) are mapped onto them —
#       test/setup-env.js + global-setup.js use these ONLY to create and seed
#       the throwaway local `elite_kids_test` database (see
#       backend/test/helpers/test-db.js), never to touch real data.
#     - NODE_ENV=test and DISABLE_RATE_LIMIT=1 are forced.
#       test/setup-env.js additionally blanks B2/Redis vars, so no network
#       side-effects are possible regardless of what .env contains.
#
# USAGE
#   scripts/run-tests.sh                  # full suite:  npx jest --runInBand --forceExit
#   scripts/run-tests.sh <jest args...>   # passthrough: npx jest --runInBand <args...>
#                                         # e.g. scripts/run-tests.sh test/b1-regression.test.js --forceExit
#                                         # e.g. scripts/run-tests.sh --json --outputFile=/tmp/out.json
#
# EXIT CODES
#   0   jest green          (mirrors jest)
#   1   jest failures       (mirrors jest)
#   2   harness error       (backend/.env missing or DB username unresolvable)
#
# NOTES
#   - Secrets handling follows slave protocol #3: backend/.env is only ever
#     touched with bash grep/cut here; values are exported, never echoed.
#   - stdout/stderr pass through untouched — redirect as you see fit.
#     scripts/ci-gate.sh is the blessed caller for CI gating.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
ENV_FILE="$BACKEND/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: $ENV_FILE not found — cannot resolve TEST_DB credentials." >&2
  exit 2
fi

# Source TEST_DB creds strictly via bash grep (protocol: no file-tool reads).
# Prefer explicit TEST_DB_* lines; fall back to mapping DB_USERNAME/DB_PASSWORD.
TEST_DB_USER="$(grep -E '^TEST_DB_USER=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
if [[ -z "$TEST_DB_USER" ]]; then
  TEST_DB_USER="$(grep -E '^DB_USERNAME=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
fi
TEST_DB_PASSWORD="$(grep -E '^TEST_DB_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
if [[ -z "$TEST_DB_PASSWORD" && -z "$(grep -E '^TEST_DB_PASSWORD=' "$ENV_FILE")" ]]; then
  TEST_DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
fi

if [[ -z "$TEST_DB_USER" ]]; then
  echo "FATAL: neither TEST_DB_USER nor DB_USERNAME present in backend/.env." >&2
  exit 2
fi

export TEST_DB_USER TEST_DB_PASSWORD
export NODE_ENV="test"
export DISABLE_RATE_LIMIT="1"

cd "$BACKEND" || exit 2

if [[ $# -eq 0 ]]; then
  exec npx jest --runInBand --forceExit
else
  exec npx jest --runInBand "$@"
fi
