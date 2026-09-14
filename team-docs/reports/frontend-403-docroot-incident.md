# INCIDENT — 403 Forbidden (nginx/1.24.0) on EliteKids frontend

**Date:** 2026-09-14 · **Status:** RESOLVED — site back to 200; deploy hardened and verified

## Symptom
`https://kids.elitekids.com.ng/` (and every SPA route) returned the stock nginx
`403 Forbidden` page. Reproduced on-box:

```
curl -sk --resolve kids.elitekids.com.ng:443:127.0.0.1 https://kids.elitekids.com.ng/
→ 403 Forbidden  nginx/1.24.0 (Ubuntu)
```

## Root cause
**The nginx docroot had no `index.html`.**

`deploy/nginx/elitekids.conf` sets:
```
root /var/www/html/elite/elite-kids/frontend/dist;   # the repo checkout is the docroot
index index.html;
location / { try_files $uri $uri/ /index.html; }
```
With `index index.html` and `autoindex` off, a directory with no index file yields
**403** (not 404); the SPA fallback targets the same missing `/index.html`, so
every route 403s.

The docroot contained only `assets/ audio/ logo.svg sw.js` — no `index.html`, no
CSS at all, and the 28 files in `assets/` were **all `*-legacy-*` chunks**. A
healthy build of the same source emits 57 assets (`index.html`, `assets/index-*.css`,
29 modern + 28 legacy chunks), so the docroot held a **partial/aborted build**,
frozen at Sep 11 02:33.

## Why it happened and why it went unnoticed
1. The docroot **was** the build output dir (`frontend/dist`), so `vite build`
   emptied the live app before rewriting it. A run that ended mid-build left a
   shell-less tree.
2. The CI frontend step was `set +e` ("non-fatal by design") and then
   `rsync -a --delete dist/ "$DOCROOT/"` — so even a failed build was **mirrored
   over the last good one**.
3. `scripts/rebuild-frontend.sh` (run by the `post-receive` hook on
   `git push production`) did the same in-place `npm run build` with no gate.
4. The `Verify externally` step only *echoed* status codes; nothing failed.
   `npm run build`'s own final gate (`check-compat-css.mjs`, exit 1 when
   `assets/index-compat.css` is absent) was being swallowed by the same step.

## Resolution
Rebuilt and published through the new path (log:
`frontend-publish-script-test-2026-09-14.log`):

```
[rebuild] gate OK: 11540 byte shell, 2 css, 56 js
[rebuild] published: .../frontend/dist → .../frontend/releases/20260914T230805Z-b142333
```

Live after publish: `/` → 200, `/login` → 200 (SPA fallback), hashed entry chunk
→ 200, `demo.elitekids.com.ng` → 200, `/health` → 200, and the shell carries
`Cache-Control: no-cache, no-store, must-revalidate`. The new run also surfaced
the guard the old deploy had been failing: `✓ guard:compat-css passed — 192.8KB,
0 modern-only features, braces balanced`.

## Hardening (this change)
`scripts/rebuild-frontend.sh` is now the **single source of truth for publishing**,
used by both deploy paths (the deploy workflow and the post-receive hook):

| File | Change |
|------|--------|
| `scripts/rebuild-frontend.sh` | Staging build → publish gate → atomic release swap. Builds into `frontend/dist.staging`; refuses to publish unless the staged tree has a non-empty `index.html`, a hashed entry chunk, **every** `/assets/*` the shell references on disk, and ≥2 stylesheets; then flips a `ln -sfn` + `mv -Tf` symlink onto `releases/<timestamp>-<sha>`. Keeps the 5 newest releases. Honours `DOCROOT=` override. |
| `.github/workflows/deploy.yml` | Frontend step is fatal, delegates to that script, and logs to `/tmp/elitekids-frontend-publish-*.log`. |
| `.github/workflows/deploy.yml` | `Verify externally` fails the job on **any non-200**, and additionally asserts the shell is served with `Cache-Control: no-cache` (a cacheable shell referencing later-deleted assets is the other half of this incident class). |
| `frontend/package.json` | New `build:staging` script (`vite build --outDir dist.staging` + compat guard against that dir). |
| `frontend/vite.config.ts` | `compatCssPlugin` honours the resolved `build.outDir` instead of hardcoding `dist` — hardcoded, a staging build wrote its compat sheet into the live docroot (my first probe run skipped it entirely). |
| `.gitignore` | Ignore `dist.staging/` and `releases/`. |

### Layout after the change
`frontend/dist` is now a **symlink** into `frontend/releases/<version>/`
(nginx config unchanged — it follows the symlink). `releases/legacy-*` holds the
tree that was live before the migration.

## Verification (all run on this box)
| Check | Result |
|-------|--------|
| Fresh publish via `scripts/rebuild-frontend.sh` | rc=0, new release, symlink flipped |
| **Failing build** (PATH with a stub `npm` that exits 1) | rc=1, `FAIL: build failed — docroot NOT touched`, symlink target unchanged, site still **200**, no staging leftovers |
| Rollback (`ln -sfn` to the previous release) | instant, served **200**; flipped back to 200 |
| Cache-header assertion (fixtures) | `no-cache` → PASS; `max-age` shell → FAIL; `403` with no header → FAIL |
| Workflow | YAML parses, all four `run:` blocks pass `bash -n` |
| Live routes | `/` 200 · `/login` 200 · hashed asset 200 · `demo.*` 200 · `/health` 200 |

## Still open (not in scope)
- `deploy.sh` and `deploy-multimodal.sh` are legacy dev-machine→VPS rsync scripts
  that still push straight into a remote `frontend/dist` with no gate; they should
  be retired or pointed at the script.
- The gate proves a release is *self-consistent*, not that its content is correct;
  a post-publish content check would catch a "successful but wrong" build.
- `frontend/dist` being a symlink into `releases/` means a stray `npm run build`
  in this checkout would empty the live release. The script prints a warning; a
  pre-commit/pre-build guard would be stronger.
