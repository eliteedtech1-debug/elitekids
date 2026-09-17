# Practical-First Feature Pause Policy

**Product:** EliteKids  
**Date:** 2026-09-04  
**Status:** Active product constraint  
**Applies to:** backend, frontend, workers, sockets and teacher/parent/child surfaces

## 1. Decision

Existing features are part of the product history and must **not be deleted, renamed away or destructively migrated**. However, a zero-funding startup must be able to pause features that consume network, AI, storage, Redis, WebSocket or operational support capacity.

The rollout priority is:

```text
1. Curriculum → lesson bridge → game → observation → practical next step
2. Authentication, child safety, age isolation, unit locks and progress
3. Offline play and low-bandwidth reliability
4. Teacher authoring and review
5. Parent plain-language learning summary
6. Optional engagement/social features
7. Cost-intensive intelligence, live media and commerce
```

A paused feature is **not removed**. Its code, routes, models, schemas and tests remain available for a later re-enable.

## 2. What is practical now

These remain available during the practical-first rollout:

- Published lesson and game delivery.
- Game-chain lessons and the 5–10 item rule per standalone component.
- Series, units, age isolation and prerequisite locks.
- Teacher lesson bridge authoring and review.
- Teacher observation evidence and neutral learning summaries.
- Existing child progress, offline cache/sync and session resume.
- Existing authentication, tenancy and privacy controls.
- Basic teacher lesson list, preview and approval flow.

## 3. What may be paused

| Capability | Why it may be paused | Pause boundary |
|---|---|---|
| AI lesson/game generation | External model cost and unpredictable generation volume | Stop new generation jobs; manual authoring continues |
| B2/media processing workers | Storage, egress and worker cost | Stop workers or disable optional asset saving; existing approved assets still serve |
| Live class/WebRTC/PCM | Persistent connections, TURN/STUN and support burden | Do not attach live transport; normal lessons remain available |
| Socket.IO chat | Persistent connections and moderation/support burden | Keep REST/history code; do not attach chat socket |
| Classroom collaboration/social feeds | Persistent sockets, fan-out and class activity writes | Keep REST/history and data; disable live fan-out and optional UI |
| Leaderboards, competitions and class quests | Social comparison and extra aggregation; not required for learning evidence | Hide/return paused state at the feature boundary; child learning path remains intact |
| Predictive/AI teacher and parent intelligence | Repeated aggregation and optional AI/analytics cost | Disable optional insight/prediction calls; basic evidence summary remains |
| Marketplace, push and paid integrations | Operational and third-party service cost | Disable entry points without deleting purchase/history code |

Pausing social features must never pause the learning path, lesson bridge, observation form, child progress or safety gates.

## 4. Runtime flag contract

Backend flags are environment variables. `1`, `true`, `on` and `yes` enable a feature; `0`, `false`, `off` and `no` pause it. Unknown values use the documented default.

| Environment variable | Default | Controls |
|---|---:|---|
| `KIDS_REALTIME_ENABLED` | `true` | Live audio, WebRTC signaling, chat Socket.IO and collaboration Socket.IO attachment |
| `KIDS_AI_GENERATION_ENABLED` | `true` | New AI generation enqueue/fallback work; manual lessons remain enabled |
| `KIDS_MEDIA_WORKERS_ENABLED` | `true` | Optional media/generation worker processing |
| `KIDS_SOCIAL_ENABLED` | `true` | Optional leaderboard, competition, collaboration and class-quest surfaces |
| `KIDS_INTELLIGENCE_ENABLED` | `true` | Optional predictive/AI insight endpoints and calls |
| `KIDS_PUSH_ENABLED` | `true` | Push scheduler and push delivery |
| `KIDS_MARKETPLACE_ENABLED` | `true` | Marketplace entry points |

Defaults preserve the current deployed behavior. To run the practical-first pilot, set the relevant flags to `0`; do not delete routes or tables.

Example low-cost pilot settings:

```dotenv
KIDS_REALTIME_ENABLED=0
KIDS_AI_GENERATION_ENABLED=0
KIDS_MEDIA_WORKERS_ENABLED=0
KIDS_SOCIAL_ENABLED=0
KIDS_INTELLIGENCE_ENABLED=0
KIDS_PUSH_ENABLED=0
KIDS_MARKETPLACE_ENABLED=0
```

## 5. Pause behavior

1. The backend remains the authority. A paused feature returns a stable `FEATURE_PAUSED` response for API requests that require that feature.
2. Socket transports are not attached when realtime is paused; this avoids accepting persistent connections and avoids frontend reconnect storms.
3. Frontend build/runtime gates should avoid opening a paused socket or rendering a paused feature's primary CTA.
4. Existing records remain readable where the read is inexpensive and privacy-safe; no historical data is deleted.
5. Core lesson/game routes do not depend on social, live, predictive or marketplace flags.
6. Manual teacher authoring and lesson bridge work do not require AI generation.
7. Re-enabling a flag requires no migration. Restart/redeploy the relevant process and run the targeted smoke test.

## 6. Low-cost operational playbook

### Pause immediately

1. Set the selected backend flags to `0` in the deployment environment.
2. Set matching frontend `VITE_KIDS_*_ENABLED=0` values before the next frontend build where applicable.
3. Restart only the API/frontend/workers affected by the change.
4. Confirm `/health`, login, lesson list, published game, progress and lesson bridge routes.
5. Confirm paused sockets do not connect and paused UI does not repeatedly retry.

### Resume later

1. Set the flag to `1`.
2. Restart the relevant process.
3. Run the feature's focused test and a single smoke path.
4. Monitor connection count, AI calls, storage/egress, Redis queue depth and error rate before widening rollout.

## 7. Acceptance criteria

- No existing feature files, routes, models or data are deleted for cost control.
- A paused feature cannot create new expensive work or persistent connections.
- Core learning remains usable when all optional flags are paused.
- A paused optional feature produces a clear, non-fatal state rather than a blank page or endless retry loop.
- Re-enabling a feature restores its prior code path without a schema migration.
- Tests prove both enabled and paused behavior for every new gate.

## 8. Scope rule for current bridge work

Phase 1 and Phase 3 must implement practical teacher value first. They may add thin bridge/observation tables and simple SQL summaries in the dedicated kids database. They must not add a new feed, ranking, live transport, paid integration, AI dependency or expensive analytics pipeline.
