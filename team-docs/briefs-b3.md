# BRIEF B3 — KIDS-WEB HARDENING (executor: opencode/big-pickle)

Context: Phase B1 CLOSED (zero new test failures vs origin/main; elite-api 200; mode-lock endpoint live). You inherit a green tree. Work ONLY in kids-web (+ its API routes if a fix requires it).

## Step 0 — Diagnose kids-web restarts
pm2 shows kids-web restarted 4x. Find cause (pm2 logs kids-web --err --lines 100; journal). Fix root cause if code-level; report if env-level.

## Step 1 — Error boundaries
Add route-level error boundaries to lesson/game pages so one broken asset never blanks the app. Friendly fallback UI per kid-design language.

## Step 2 — Loading states
Skeleton/spinner states for slow media and API fetches on lesson+game routes.

## Step 3 — Mode-lock UX parity
API GET /kids/mode-lock returns {success:true,data:null} when unlocked. Ensure web handles BOTH null and locked shapes; locked state must actually gate gameplay entry.

## Step 4 — Pre-deploy bundle guard
Add check script: grep built dist for localhost/127.0.0.1 URLs -> fail; assert VITE_API_URL explicitly set (empty string allowed only when nginx same-origin routing confirmed).

## Step 5 — Smoke matrix
For each JP unit page: HTTP probe by CONTENT-TYPE AND BODY (nginx SPA fallback fakes 200s); record results table.

## Rules
- Restate C1+C2 in any model/migration touch (DEFAULT values mandatory).
- C4: ALL outputs to team-docs/reports/b3-progress.md (checkpoint after EVERY step) + b3-report.md final.
- NO git commits/pushes. NO DB writes beyond read-only SELECTs.
- Verify by body-content, not status codes alone.
