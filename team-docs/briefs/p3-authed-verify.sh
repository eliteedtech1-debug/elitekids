#!/usr/bin/env bash
# p3-authed-verify.sh — DRAFT ONLY (DO NOT execute against production).
# Authed student checks for GET /kids/leaderboard, /kids/leaderboard/me, /kids/badges.
# Asserts: response shape, own-class scope enforcement, privacy (no admission_no / full-name / photo leakage).
#
# Usage (against local dev only):
#   STUDENT_TOKEN=eyJ... CLASS_CODE=CLS0611 bash team-docs/briefs/p3-authed-verify.sh
#
# Env vars:
#   STUDENT_TOKEN  — JWT for a student user (required)
#   CLASS_CODE     — expected class_code for scope checks (required)
#   BASE_URL       — API base (default: http://127.0.0.1:8484)

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8484}"
TOKEN="${STUDENT_TOKEN:?Set STUDENT_TOKEN env var}"
CLASS="${CLASS_CODE:?Set CLASS_CODE env var}"

PASS=0
FAIL=0
TOTAL=0

# ── Helpers ──────────────────────────────────────────────────────────────────

assert_contains() {
  local label="$1" body="$2" needle="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$body" | grep -qi "$needle"; then
    echo "  ✅ $label"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label (missing: $needle)"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local label="$1" body="$2" needle="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$body" | grep -qi "$needle"; then
    echo "  ❌ $label (found forbidden: $needle)"
    FAIL=$((FAIL + 1))
  else
    echo "  ✅ $label"
    PASS=$((PASS + 1))
  fi
}

assert_field_is_number() {
  local label="$1" body="$2" field="$3"
  local val
  val=$(echo "$body" | grep -o "\"$field\"[[:space:]]*:[[:space:]]*[0-9]" | head -1 | grep -o '[0-9].*')
  TOTAL=$((TOTAL + 1))
  if [ -n "$val" ]; then
    echo "  ✅ $label (=$val)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label (not a number)"
    FAIL=$((FAIL + 1))
  fi
}

assert_http_ok() {
  local label="$1" status="$2"
  TOTAL=$((TOTAL + 1))
  if [ "$status" = "200" ]; then
    echo "  ✅ $label (HTTP $status)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label (HTTP $status, expected 200)"
    FAIL=$((FAIL + 1))
  fi
}

assert_http_forbidden() {
  local label="$1" status="$2"
  TOTAL=$((TOTAL + 1))
  if [ "$status" = "403" ]; then
    echo "  ✅ $label (HTTP $status)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label (HTTP $status, expected 403)"
    FAIL=$((FAIL + 1))
  fi
}

# ── Test: GET /kids/leaderboard ──────────────────────────────────────────────
echo ""
echo "━━━ GET /kids/leaderboard (student: own class only) ━━━"

RESP=$(curl -s -w '\n%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/kids/leaderboard")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

assert_http_ok "status 200" "$HTTP"

# Response shape
assert_contains "has .success" "$BODY" '"success":true'
assert_contains "has .data.term" "$BODY" '"term"'
assert_contains "has .data.class_code" "$BODY" '"class_code"'
assert_contains "has .data.entries" "$BODY" '"entries"'
assert_contains "has .data.my_rank" "$BODY" '"my_rank"'

# Scope enforcement: class_code in response must match student's class
assert_contains "class_code matches student" "$BODY" "\"$CLASS\""

# Privacy: no admission_no, no full name, no photo in entries
assert_not_contains "no admission_no in response" "$BODY" '"admission_no"'
assert_not_contains "no full name in response" "$BODY" '"first_name"'
assert_not_contains "no last_name in response" "$BODY" '"last_name"'
assert_not_contains "no photo in response" "$BODY" '"photo"'
assert_not_contains "no avatar_url in response" "$BODY" '"avatar_url"'
assert_not_contains "no email in response" "$BODY" '"email"'

# Entry shape (if entries exist)
assert_contains "entries have rank" "$BODY" '"rank"'
assert_contains "entries have display_name" "$BODY" '"display_name"'
assert_contains "entries have avatar (hashed)" "$BODY" '"avatar"'
assert_contains "entries have points" "$BODY" '"points"'
assert_contains "entries have attempts" "$BODY" '"attempts"'
assert_contains "entries have medal" "$BODY" '"medal"'

assert_field_is_number "rank is numeric" "$BODY" "rank"
assert_field_is_number "points is numeric" "$BODY" "points"

# ── Test: GET /kids/leaderboard/me ───────────────────────────────────────────
echo ""
echo "━━━ GET /kids/leaderboard/me (student-only endpoint) ━━━"

RESP=$(curl -s -w '\n%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/kids/leaderboard/me")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

assert_http_ok "status 200" "$HTTP"

# Response shape
assert_contains "has .success" "$BODY" '"success":true'
assert_contains "has .data.ranked" "$BODY" '"ranked"'
assert_contains "has .data.points" "$BODY" '"points"'
assert_contains "has .data.attempts" "$BODY" '"attempts"'
assert_contains "has .data.rank" "$BODY" '"rank"'
assert_contains "has .data.free_access_active" "$BODY" '"free_access_active"'
assert_contains "has .data.free_access_until" "$BODY" '"free_access_until"'
assert_contains "has .data.badge" "$BODY" '"badge"'

assert_field_is_number "points is numeric" "$BODY" "points"
assert_field_is_number "attempts is numeric" "$BODY" "attempts"

# Privacy: own data only — no admission_no echoed back
assert_not_contains "no admission_no in response" "$BODY" '"admission_no"'
assert_not_contains "no full name in response" "$BODY" '"first_name"'
assert_not_contains "no class_code leak" "$BODY" '"class_code"'

# ── Test: GET /kids/badges ──────────────────────────────────────────────────
echo ""
echo "━━━ GET /kids/badges (student-only badge shelf) ━━━"

RESP=$(curl -s -w '\n%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/kids/badges")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

assert_http_ok "status 200" "$HTTP"

# Response shape
assert_contains "has .success" "$BODY" '"success":true'

# Empty-array guard: badge shelf is legitimately [] before first Sunday rollover.
if echo "$BODY" | grep -q '"data":\[\]'; then
  echo "  ⏭  badge shelf empty (pre-rollover) — row-shape asserts skipped"
else
  assert_contains "has .data rows (academic_year)" "$BODY" '"academic_year"'
  assert_contains "has term" "$BODY" '"term"'
  assert_contains "has week_number" "$BODY" '"week_number"'
  assert_contains "has badge" "$BODY" '"badge"'
  assert_contains "has position" "$BODY" '"position"'
  assert_contains "has awarded_at" "$BODY" '"awarded_at"'
fi

# Privacy: no admission_no, no full name, no photo
assert_not_contains "no admission_no in response" "$BODY" '"admission_no"'
assert_not_contains "no full name in response" "$BODY" '"first_name"'
assert_not_contains "no last_name in response" "$BODY" '"last_name"'
assert_not_contains "no photo in response" "$BODY" '"photo"'

# ── Test: student GET /kids/leaderboard (unauthenticated) ────────────────────
echo ""
echo "━━━ Unauthenticated access should fail ━━━"

RESP=$(curl -s -w '\n%{http_code}' \
  "$BASE_URL/kids/leaderboard")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

assert_http_forbidden "unauthenticated → 401/403" "$HTTP"

# ── Test: teacher token can see class_code param ────────────────────────────
echo ""
echo "━━━ Staff scope test (if TEACHER_TOKEN provided) ━━━"
if [ -n "${TEACHER_TOKEN:-}" ]; then
  RESP=$(curl -s -w '\n%{http_code}' \
    -H "Authorization: Bearer $TEACHER_TOKEN" \
    "$BASE_URL/kids/leaderboard?class_code=$CLASS")
  HTTP=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')

  assert_http_ok "staff leaderboard → 200" "$HTTP"
  assert_contains "staff sees class_code" "$BODY" "\"$CLASS\""
  assert_not_contains "staff response: no admission_no" "$BODY" '"admission_no"'
else
  echo "  ⏭  Skipped (set TEACHER_TOKEN to test staff scope)"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: $PASS/$TOTAL passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAIL" -gt 0 ]; then
  echo "❌ SOME TESTS FAILED"
  exit 1
else
  echo "✅ ALL TESTS PASSED"
  exit 0
fi
