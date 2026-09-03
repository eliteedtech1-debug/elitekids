# RUN AS ROOT — PAT EXPOSURE REMEDIATION + GIT REMOTE CLEANUP

**Audited:** 2026-09-03 (takeover session) · **Severity:** HIGH — 13 repos on this
shared box embed `ghp_` GitHub PATs in their `.git/config` (world-readable by
default). Tokens have appeared in session logs/terminal output → **treat all as
compromised**. Deploys do NOT need them (see §0), so cleanup is zero-risk.

> NEVER paste a token into chat, logs, or this file. Run the commands below
> verbatim; they never echo token values. For anything requiring a token
> (creating/revoking at GitHub), do it in the GitHub web UI.

---

## §0 Why it is safe to strip the tokens (verified)

`.github/workflows/deploy.yml` line 47 injects auth at run time:
`git remote set-url origin "https://x-access-token:${ELITEKIDS_TOKEN}@github.com/eliteedtech1-debug/elitekids.git"`
(`ELITEKIDS_TOKEN` = repo Actions secret). So the **static** tokens in the
`.git/config` files below are leftover exposure with no runtime dependency.

## §1 Exposure inventory (13 repos, 10 distinct tokens)

Run this (read-only, masked) to re-verify before/after:
```bash
find /var/www/html -name config -path "*/.git/config" | while read f; do
  grep -q "ghp_" "$f" 2>/dev/null && { tok=$(grep -oE "ghp_[A-Za-z0-9]+" "$f" | head -1)
    echo "$f | $(echo -n "$tok" | md5sum | cut -c1-8)"; }; done
```
Audit result (token shown only as md5 — match by that when revoking):

| Token md5 (first 8) | Repos |
|---|---|
| `43a3701e` | `/var/www/html/elite/elite-kids` **← elitekids (this repo)**, `/var/www/html/elite/elitefin`, `/var/www/html/elite/elite-cbt`, `/var/www/html/elite/backups`, `/var/www/html/elite/archived-elite-api` |
| `ed20fc09` | `/var/www/html/Task-management-backend`, `/var/www/html/NHIA-EDMS-BACKEND` |
| `458cb939` | `/var/www/html/bitcollect-backend` |
| `6aee3129` | `/var/www/html/foundrWorks_backend` |
| `855fd345` | `/var/www/html/NHIA-URMS-BACKEND` |
| `9e306686` | `/var/www/html/foodcrisis-backend` |
| `f4572db9` | `/var/www/html/kasuwa-api` |
| `25052d21` | `/var/www/html/flowbooks_api` |
| `1f6f1507` | `/var/www/html/psn` |
| (elite-cbt per earlier note) | see `43a3701e` row |

## §2 Execution order (zero-downtime: reissue BEFORE revoke)

### Step 1 — (GitHub UI, human) Reissue a scoped token for the Elite suite
1. github.com → `eliteedtech1-debug` → Settings → Developer settings → Fine-grained tokens → **Generate new**.
2. Scope: **Repository access = `elitekids` only** (add `elitefin`, `exam-app-backend` if their repos need manual pushes). **Permissions: Contents → Read and write** (deploy fast-forwards the live checkout). No other scopes.
3. Copy it ONLY into the Actions secret field below — never into a terminal or this file.

### Step 2 — (GitHub UI, human) Update the deploy secret
Repo `eliteedtech1-debug/elitekids` → Settings → Secrets and variables → Actions →
**`ELITEKIDS_TOKEN` = the new token**. Next auto-deploy uses it automatically.

### Step 3 — (GitHub UI, human) Revoke ALL 10 exposed tokens
github.com/settings/tokens → for **each** of the 10 tokens (identify by the md5
map above / by repo URLs they were used on): **Revoke**. Revoking does not break
the running services or the injected-secret deploys. Also revoke any token that
ever appeared in a session log even if not in the inventory.

### Step 4 — (ROOT shell) Strip tokens from every repo remote
```bash
for f in $(find /var/www/html -name config -path "*/.git/config"); do
  if grep -q "ghp_" "$f"; then
    perl -pi -e 's#https://(?:[^@/]+@)?github\.com/#https://github.com/#g' "$f"
    chmod 600 "$f"
    echo "cleaned: $f"
  fi
done
chown -R dev:dev /var/www/html/elite/elite-kids /var/www/html/elite/elitefin /var/www/html/elite/elite-cbt   # optional
```

### Step 5 — (ROOT shell) Verify clean
```bash
# expect: no output (zero tokens remain)
find /var/www/html -name config -path "*/.git/config" | while read f; do grep -l "ghp_" "$f"; done
# expect: tokenless URLs
git -C /var/www/html/elite/elite-kids remote -v
git -C /var/www/html/elite/elitefin remote -v
```

### Step 6 — (ROOT shell) Manual-push convenience (optional, NOT in repo config)
For repos dev agents push from directly, store the new token once in the USER
credential store (never in `.git/config`):
```bash
sudo -u dev git config --global credential.helper store    # once
# then push once as dev; git will prompt for username + paste token once
```

### Step 7 — Prove the deploy path still works
Trigger `.github/workflows/deploy.yml` (Actions → Run workflow, `workflow_dispatch`)
OR wait for the next push — deploy must go green using the reissued secret.

## §3 Guardrails going forward (agents + humans)
- Never write a token into a repo `.git/config`; use Actions secrets + `credential.helper`.
- `chmod 600` any `.git/config` that must hold credentials.
- If a token appears in ANY tool output/log, assume compromised → revoke immediately.
- Keep this file updated if the inventory changes (re-run §1 after changes).
