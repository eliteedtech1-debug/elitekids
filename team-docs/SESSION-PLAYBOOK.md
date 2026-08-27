# ELITE-KIDS OPS PLAYBOOK — Lessons codified 2026-08-23

## 1. Heterogeneous agent team — doctrine
- opencode/big-pickle = EXECUTOR (dev+tester). Long tasks ONLY inside tmux on server. It dies silently every ~30-60min: mandate per-step checkpoint files (*-progress.md) in every brief; relaunch = "resume from last checkpoint".
- freebuff (DeepSeek V4 Flash) = ADVISORY ONLY (audits/specs/suggestions), never executor. Session is TIME-based (~1h) — keep it fed back-to-back or the meter burns wasted. Caps: Luna 2/day, V4 Pro 1/day. Read panes ONLY via ~/bin/fbcapture (strips ads/noise).
- gemini CLI = cold spare / reviewer. Quota dies fast: rotate with ~/bin/gemini-run.sh + ~/bin/gemini-cycle.sh (5 keys: GEMINI_API_KEY,_1.._4 in backend/.env).
- Team-lead local sub-agents = independent verification of agent claims; never let dev grade its own homework.
- C5 no-redundancy: idle metered agent = lead failure. Deliver -> immediately assign next brief or retire slot.
- Never two agents editing one file; advisory agents get read-only audit/sweep/review work.

## 2. Network fragility (Hostinger)
- Hostinger blocks our IP without warning (ALL ports timeout, DNS fine). Escape order: (a) jump host `ssh -J u119379431@72.60.93.4:65002 dev@server.brainstorm.ng` = config alias `production-jump`; (b) VPN from supervisor if jump also blocked.
- Server-side watcher logs status every 5min to team-docs/reports/agent-status.log — reporting survives lead outages. During blocks: do local work (briefs/playbooks/drafts).

## 3. Non-blocking ops (C6)
- No command >60s. No sleep-polling. Wait = switch tasks, check back 1-2 min.

## 4. Guardrails (team-docs/STANDING-CONSTRAINTS.md)
- C1: kids tables OUT of shared elite_db. Reality found: they live in elite_content; elite_kids DB created + db.kids pool wired. INVENTORY FIRST, move only what exists where you think.
- C2: every ALTER needs DEFAULT; boot reconcile = existence-check + defaulted additive columns.
- C4: deliverables only in repo team-docs/ (gitignored). Never /tmp or $HOME for reports.

## 5. Verification discipline
- Probe APIs by CONTENT-TYPE AND BODY — nginx SPA fallback fakes HTTP 200 with index.html.
- Real browser = ground truth. LAN curls passed while ALL real users were broken (bundle shipped http://localhost:34600 baked from frontend/.env dev value).
- Pre-deploy check: grep built bundles for localhost/127.0.0.1 URLs and fail; assert VITE_API_URL is explicitly set (empty OK for same-origin nginx routing).
- Independent audit before every push (freebuff/gemini/sub-agent).

## 6. Git discipline
- Backup refs before risky ops: backup/local-main, backup/remote-main pattern.
- Trial merge: git merge-tree base ours theirs BEFORE touching tree.
- git stash -u (untracked included!) before builds/migrations; plain stash loses untracked files and breaks later builds.
- Batch fixes per phase; supervisor reviews diff summaries at gates; push pre-approved after green gates.

## 7. Ops patterns that worked
- Briefs as files, scp to server /tmp/, launch: tmux new-session -d -s NAME 'opencode run --model opencode/big-pickle "$(cat /tmp/brief.md)" > log 2>&1'
- Append RUN-RULES to every brief: never Read .env (bash grep only); checkpoint each step; small tool calls.
- Permission trap: opencode auto-rejects file-read of .env -> always route secrets through bash.
- Status snapshot tool: ~/bin/team-status (tmux panes + progress files + proc count). Watcher loop appends every 5 min.
