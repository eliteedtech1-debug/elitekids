# STANDING CONSTRAINTS — ALL AGENTS (Supervisor-mandated, permanent)

## C1 — Database separation
Game/kids-related tables MUST NOT live in `elite_db` (it serves other production apps).
Target state: dedicated kids database (e.g. `elite_kids`). Migration plan required before any table moves: create target DB -> replicate tables -> dual-verify -> repoint Sequelize connections -> leave originals untouched during transition. Other apps must never notice.

## C2 — Safe schema changes only
Every `ALTER TABLE ... ADD/MODIFY COLUMN` MUST specify a DEFAULT value (or be NULLable). No exceptions — co-hosted apps must never break. All new model fields get `defaultValue:` in Sequelize definitions.

## C3 — Enforcement
- Any brief/task touching models or migrations must re-state C1+C2.
- Reviewers must reject diffs violating C1/C2 regardless of gate results.
- Boot-time reconcile code pattern (existence-check + defaulted additive columns, as in backend/src/index.js) is the approved template.

## C4 — Document containment
ALL generated documents (reports, roadmaps, QA notes) and screenshot/artifact folders MUST be written inside `/var/www/html/elite-kids/team-docs/` (`reports/`, `screenshots/<task>/`). Never write deliverables to /tmp, $HOME or elsewhere. Transient run logs in /tmp are tolerated but final outputs are not. `team-docs/` is gitignored; nothing inside it may be committed without supervisor approval.

Issued by supervisor 2026-08-23; enforced by team lead. Violations = blocked push.

## C5 — No idle partners (Supervisor directive)
Every commissioned agent (prod dev, freebuff, gemini, workers, sub-agents) MUST always hold a current task. The moment an agent delivers, team lead assigns the next brief or retires the slot. Idle-at-prompt while its meter runs = team-lead failure. Advisory agents get non-conflicting work (audits, sweeps, reviews); never two agents on one file.

## C6 — Non-blocking operations (Supervisor directive)
Team lead must NEVER run blocking waits: no command >60s, no sleep-polling loops. On any wait>1min: switch to other productive work immediately, check back in 1-2 min. Periodic agent status reports are mandatory; use the server-side watcher (team-status every 5 min -> team-docs/reports/agent-status.log) so reporting survives lead-side network loss.

## C7 — Team roster (Master directive 2026-08-23)
- MASTER: ox-alpha (local, off-box) — sole dispatcher; slaves never take orders from each other.
- WORKERS: opencode on production (tmux phase*) — execute briefs, checkpoint to reports.
- ADVISOR: freebuff (tmux fb-review) — reliable; read-only advisory tasks (audits/sweeps/reviews), never co-edit files with workers.
- GEMINI: DEPRECATED — short free-token budget makes it unreliable. Do NOT commission. Existing ~/bin/gemini-*.sh left inert.

## C8 — Freebuff session economy (Master directive)
NEVER relaunch freebuff casually: each relaunch burns 1 premium hour. One long-lived fb-review tmux; feed it sequential tasks via send-keys. Premium-first models; on daily quota exhaustion master rotates additional accounts.

## C9 — Local token economy (Master directive)
Local opencode (master) runs lean: no heavy reads/pulls; all execution and exploration delegated to prod slaves. Master only dispatches, samples status, decides.

## C10 — Hostinger stealth (Master directive)
Max <=2 req/s for any external HTTP sweep/burst; no CPU-saturating job >5 min continuous (stagger jest/E2E); SSH strictly via ControlMaster; never commit agent-ops docs/credentials to public repos; assume public-repo crawlers and provider abuse scanners read everything we publish.
