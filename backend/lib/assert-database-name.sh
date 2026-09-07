#!/usr/bin/env bash
# ── backend/lib/assert-database-name.sh ───────────────────────────────────────
# Thin shell wrapper around backend/lib/db-drop-guard.js so bash scripts can ask
# the SAME guard the JS code uses before running DROP / TRUNCATE / DELETE.
#
# Usage:
#   source backend/lib/assert-database-name.sh
#   assert_database_name "elite_content" "DROP TABLE" && echo OK || echo REJECTED
#
# Returns 0 when the operation is allowed, 1 when the guard rejects it (and
# prints the reason to stderr). Never throws — the caller decides to abort.
#
# This duplicates NOTHING from db-drop-guard.js logic; it shells out to the
# shared module so prod DB names and the _test rule stay in one place.

set -euo pipefail
# Absolute path to the repo root (assumes this file lives at backend/lib/).
_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_REPO_ROOT="$(cd "$_LIB_DIR/.." && pwd)"

assert_database_name() {
  local database="${1:-}"
  local operation="${2:-DROP}"
  local allowed="${3:-}"

  if [[ -z "$database" ]]; then
    echo "[assert-database-name] database name is empty — refusing" >&2
    return 1
  fi

  # Write a small JS helper to a temp file so shell quoting cannot break the
  # script. The JS reads env vars, never shell-interpolated strings.
  _NODE_SCRIPT="$(mktemp)"
  trap 'rm -f "$_NODE_SCRIPT"' RETURN
  cat > "$_NODE_SCRIPT" <<'EOF'
"use strict";
const { assertDestructiveTarget } = require(process.env.REPO_ROOT + "/lib/db-drop-guard.js");
const database = process.env.ASSERT_DB;
const operation = process.env.ASSERT_OP || "DROP";
const rawAllowed = process.env.ASSERT_ALLOWED || "";
const allowedList = rawAllowed ? rawAllowed.split(",").map((s) => s.trim()).filter(Boolean) : [];
try {
  assertDestructiveTarget({ database, operation, allowedDatabases: allowedList });
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
EOF
  REPO_ROOT="$_REPO_ROOT" \
  ASSERT_DB="$database" \
  ASSERT_OP="$operation" \
  ASSERT_ALLOWED="$allowed" \
  node "$_NODE_SCRIPT"
}