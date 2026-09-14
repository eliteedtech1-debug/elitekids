#!/usr/bin/env bash
# rebuild-frontend.sh — build + publish the frontend for nginx.
#
# Called by the post-receive / post-merge hooks AND by the deploy workflow
# (.github/workflows/deploy.yml), so both deploy paths publish identically.
#
# Publishing is: staging build → publish gate → atomic release swap.
#   1. the nginx docroot is NEVER the build output dir, so a failed or aborted
#      build cannot wipe the live shell. 2026-09-14 incident: an in-place
#      `vite build` emptied frontend/dist (== the docroot) and the deploy
#      mirrored the shell-less tree into production → 403 Forbidden on every
#      route, silently, for three days;
#   2. nothing is published until the staged tree is proven complete: a shell,
#      a hashed entry chunk, every /assets/* the shell references, and both the
#      main and the legacy-compat stylesheet;
#   3. the swap is a single symlink flip onto releases/<version>, so nginx never
#      serves a half-copied tree and rollback is one `ln -sfn`.
#
# Env: DOCROOT=<path>  published path (default: <repo>/frontend/dist)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$ROOT/frontend"
STAGING="$FRONTEND/dist.staging"
RELEASES="$FRONTEND/releases"
DOCROOT="${DOCROOT:-$FRONTEND/dist}"
VERSION="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo nogit)"

cd "$FRONTEND"
echo "[rebuild] $FRONTEND → release $VERSION (docroot: $DOCROOT)"

# ── Staging build ───────────────────────────────────────────────────────────
# Builds into dist.staging only; the live docroot keeps serving throughout.
rm -rf "$STAGING"
if ! npm run build:staging; then
  echo "[rebuild] FAIL: build failed — docroot NOT touched"
  exit 1
fi

# ── Publish gate ────────────────────────────────────────────────────────────
if [ ! -s "$STAGING/index.html" ]; then
  echo "[rebuild] FAIL: gate — staging has no index.html"
  exit 1
fi
if ! grep -qE '/assets/index-[A-Za-z0-9_-]+\.js' "$STAGING/index.html"; then
  echo "[rebuild] FAIL: gate — index.html has no hashed entry chunk"
  exit 1
fi
while read -r asset; do
  if [ ! -e "$STAGING$asset" ]; then
    echo "[rebuild] FAIL: gate — index.html references missing $asset"
    exit 1
  fi
done < <(grep -oE '/assets/[A-Za-z0-9._-]+' "$STAGING/index.html" | sort -u)
CSS_COUNT=$(find "$STAGING/assets" -maxdepth 1 -name '*.css' | wc -l)
if [ "$CSS_COUNT" -lt 2 ]; then
  echo "[rebuild] FAIL: gate — expected index-*.css + index-compat.css, found $CSS_COUNT"
  exit 1
fi
echo "[rebuild] gate OK: $(wc -c < "$STAGING/index.html") byte shell, $CSS_COUNT css, $(find "$STAGING/assets" -maxdepth 1 -name '*.js' | wc -l) js"

# ── Atomic release swap ─────────────────────────────────────────────────────
mkdir -p "$RELEASES"
# One-time migration: deploys before 2026-09-14 left a real directory at the
# docroot. Park it as a release (keeps it rollback-able) before we start
# symlink-flipping.
if [ -e "$DOCROOT" ] && [ ! -L "$DOCROOT" ]; then
  LEGACY="$RELEASES/legacy-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$DOCROOT" "$LEGACY"
  echo "[rebuild] migrated real docroot dir → $LEGACY"
fi
mv "$STAGING" "$RELEASES/$VERSION"
ln -sfn "$RELEASES/$VERSION" "$DOCROOT.new"
mv -Tf "$DOCROOT.new" "$DOCROOT"
echo "[rebuild] published: $DOCROOT → $(readlink "$DOCROOT")"

# Keep the 5 newest releases (current + rollback targets); prune older ones.
PRUNE=$(ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +6 || true)
if [ -n "$PRUNE" ]; then
  echo "$PRUNE" | xargs -r rm -rf
  echo "[rebuild] pruned: $(echo "$PRUNE" | tr '\n' ' ')"
fi

echo "[rebuild] SUCCESS — $(readlink "$DOCROOT") at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[rebuild] rollback: ln -sfn $RELEASES/<older-release> $DOCROOT"
echo "[rebuild] note: do not run npm run build in this checkout — the docroot is a"
echo "[rebuild]       symlink into releases/, so vite would empty the live release."
