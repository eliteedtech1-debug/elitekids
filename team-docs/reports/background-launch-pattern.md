# Background long-run launch pattern (run_terminal_command) — VERIFIED 2026-09-09

## Problem
Tool-launched child processes are killed when a SYNC `run_terminal_command` call
returns (process-group cleanup). Consequences seen twice on 2026-09-09:
- `nohup … &` from a SYNC call → child dies instantly → 0-byte log
  (`full-run-launch.log`), no `ci-last-run.txt` row, run silently lost.
- `process_type: "BACKGROUND"` → **not implemented** on this runner (hard error).

## Verified working pattern (used for both Q46 full-suite runs)
```bash
LOG="team-docs/reports/c-full-suite-$(date -u +%Y%m%dT%H%M%SZ).log"
echo "$LOG" > /tmp/current-run.path   # so later SYNC calls can find the log
setsid nohup bash -c 'scripts/run-tests.sh > "$1" 2>&1; ec=$?;
  { date -u +%Y-%m-%dT%H:%M:%SZ | tr -d "\n"; printf " | mode=full | ";
    grep -E "Test Suites:" "$1" | tail -1 | sed "s/^ *//";
    grep -E "^Tests:" "$1" | tail -1 | sed "s/^ *//"; echo "exit=$ec";
  } >> team-docs/reports/ci-last-run.txt' _ "$LOG" >/dev/null 2>&1 < /dev/null &
sleep 3
pgrep -f "jest --runInBand" >/dev/null && echo RUNNING || echo "not started"
```

Key ingredients:
- `setsid` → new session; the tool's process-group cleanup can't reach it.
  (`nohup` alone does NOT survive; it only ignores SIGHUP.)
- `< /dev/null` and stdout/stderr → /dev/null or the log (no inherited TTY).
- Summary is appended to `ci-last-run.txt` by the wrapper itself, so the
  result lands even if the session vanishes before polling finishes.
- Verify liveness in the SAME call (`sleep 3; pgrep …`) — do not trust launch
  output alone; a 0-byte log on next poll means the launch pattern was wrong.

## Polling (protocol: no blocking waits >60s)
```bash
sleep 60; LOG=$(cat /tmp/current-run.path); pgrep -f "jest --runInBand" >/dev/null \
  && echo "RUNNING $(stat -c%s "$LOG") bytes" || tail -6 "$LOG"
```
Full suite ≈ 80–120 s on the VPS → 1–2 polls.

## Unused but available fallback
`systemd-run --user --unit=NAME cmd` would also survive (transient unit), but
needs lingering enabled; setsid is simpler and proven here.
