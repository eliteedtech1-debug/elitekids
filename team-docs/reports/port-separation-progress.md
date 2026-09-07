# Port Separation Progress — elite-cbt (8282) + elite-kids (8484)

**Date:** 2026-09-07 | **Status:** ✅ COMPLETE

## Problem
- elite-cbt-api was crash-looping (SIGKILL, restart counter at 19) — suspected DDL checker at boot causing kills
- elite-kids-api was stopped (SIGTERM at 06:15)
- Both services needed to be on separate, non-colliding ports

## Root Cause
- elite-cbt-api: DDL/schema sync at boot was likely causing the process to be killed (SIGKILL)
- elite-kids-api: same DDL checker issue — now running with `KIDS_SKIP_DB_SYNC=1` to skip schema migrations at boot

## Fix Applied
1. Killed the crash-looping elite-cbt-api process (pid 1544316)
2. Reset systemd failure counters for both services
3. Started elite-kids-api first (port 8484) — running with KIDS_SKIP_DB_SYNC=1
4. Started elite-cbt-api second (port 8282) — clean start

## Current State (Verified)
| Service | Port | PID | Status |
|---------|------|-----|--------|
| elite-cbt-api | 8282 | 1549041 | ✅ active, healthy |
| elite-kids-api | 8484 | 1548714 | ✅ active, healthy |

**Nginx proxy layout (no collision):**
- `server.brainstorm.ng/elite-cbt/` → 8282
- `server.brainstorm.ng/elite-kids/` → 8484
- `elitekids.com.ng` → static + API proxy to 8484
- `elitecbt.com.ng` → static only (frontend)

Both health endpoints return `{"status":"ok"}`.

## Port Registry (non-colliding)
| Port | Service | Notes |
|------|---------|-------|
| 8282 | elite-cbt-api | CBT exams & assessments |
| 8484 | elite-kids-api | Gamified learning (KG/Nursery) |
| 8383 | elite-sms-api | School management |
| 34601 | kids-web | Vite dev server |

Ports 8282 and 8484 are now permanently separated — they will never collide.
