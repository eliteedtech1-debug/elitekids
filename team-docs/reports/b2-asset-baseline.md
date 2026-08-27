# B2 ASSET BASELINE — read-only inventory sweep (Q3 advisory)

_Generated 2026-08-23T06:40Z, updated 06:50Z by fb-review (freebuff). READ-ONLY; nothing modified._

## Scope & method
- Enumerated every image/media URL ref across the kids-web frontend (static src) and the kids content DB (`elite_content`), covering hero cards, lesson thumbs, companion/garden state, uploads and all `kids_%` tables.
- Sources scanned: `kids_game_configs.config_json`, `kids_game_units.content_items`, `kids_companion_state.customization`, `kids_garden_state.garden_elements`, `kids_curriculum_points.mapped_item_ids`, plus a wildcard scan of **all 28 `kids_%` tables** for image/url/text/json columns (children, lessons, scene_scripts, game_series, content_approvals, denylist, etc.).
- Static frontend refs enumerated by source review of `frontend/src` (img/CachedImg/`url()`/Twemoji mapping).
- Local server under test: `http://127.0.0.1:8484` (elite-kids backend). Public media base configured: `http://62.72.0.209/kids/media`.
- Each unique URL HTTP-checked (GET, follow redirects). A ref is **broken** if status is not 2xx, or on network error/timeout. Local public-media paths (`…/kids/media/<key>` and `/media/<key>`) are rewritten to `http://127.0.0.1:8484/media/<key>` for the local check.

## Totals

| Metric | Count |
|---|---|
| Total references found (all columns/tables) | 16 |
| Unique URLs | 4 |
| By class | example-placeholder=3, external-other=1 |
| Local `/media/<key>` refs in content | 0 |
| HTTP OK (2xx) | 1* (Twemoji CDN spot-check; see below) |
| **BROKEN** (data-layer unique URLs) | **4** |

\* The 4 data-layer URLs all fail; the healthy 200 is the external Twemoji CDN that powers game/companion icons (verified, not one of the content URLs).

### Broken data-layer refs (owned by published configs)

| # | URL | status | Owning config (lesson) |
|---|---|---|---|
| 1 | `https://example.com/green-apple.png` | 404 | `5a31483e-…619-52b` (lesson `7a9aef68-…1f17`, tap-recognition, published) |
| 2 | `https://example.com/red-apple.png` | 404 | same config |
| 3 | `https://example.com/banana.png` | 404 | same config |
| 4 | `https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cat_November_2010-1a.jpg/481px-Cat_November_2010-1a.jpg` | 400 | **5 published puzzle-split configs** share it: `17f1a4f6-…ef2a` (lesson `ee8197da-…eaef`), `66771248-…8e30` (lesson `34d38c9a-…b799`), `da76430a-…75a3` (lesson `b9f6bc25-…f718`), `f43da108-…59a` (lesson `5d33dee4-…d8c3`), `fbf6391e-…b8f02` (lesson `f46a7073-…dae2`) |

## On-disk uploads & local-media serving

| Asset | Path | Local check `:8484` | Note |
|---|---|---|---|
| QA test upload | `backend/uploads/opensource/qa/b2test-cat-e13ac0113ab4.png` | **404** | not referenced by any content (thrown-away QA fixture) |
| `frontend/public/logo.svg` | served by kids-web (`/logo.svg`) | n/a (frontend asset) | healthy, local asset |

**Key finding — opensource assets not served by the media route:** the serve route `GET /media/:key` (backend/src/routes/media.js) validates `:key` against `/^[a-f0-9-]{36}(?:-[a-z0-9]+)?(\.[a-z0-9]+)?$/i` (a bare UUID). Nested `opensource/<cat>/<file>` keys never match, so the AssetLibrary listing URL shape (`/media/opensource/…`) 404s/400s in local mode. All current open-source assets are Twemoji CDN URLs fetched client-side; the local `backend/uploads/opensource/` tree is effectively unreachable through that route while empty of referenced content. (Not blocking today — no published config references it — but flagged for B3 hardening.)

## External CDN health (powers rendered icons/companion)

| CDN | check | result |
|---|---|---|
| Twemoji `cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f431.png` | GET | **200** image/png — healthy |

Game items and companions are emoji-keyed; the frontend maps them to Twemoji CDN at render time (`icons.ts`, `MediaLibrary.tsx`, `EmojiPicker.tsx`). No game/companion data stores an image URL — visuals are derived client-side.

## Static frontend image refs (non-data-driven)

| file | ref | note |
|---|---|---|
| `frontend/public/logo.svg` | `/logo.svg` (app logo) | local static asset |
| `src/pages/Login/Login.tsx` | `school.badge_url || /logo.svg` | dynamic (school_setup badge_url) |
| `src/pages/Parent/ParentChildren.tsx` / `ParentActivities.tsx` | `child.avatar_url` | dynamic (children.avatar_url) |
| `src/lib/utils/icons.ts`, `MediaLibrary.tsx`, `EmojiPicker.tsx` | Twemoji CDN `…/72x72/{codepoint}.png` | external CDN (verified 200) |
| `src/pages/Teacher/GameCreator.tsx` | `https://example.com/*.png` template seeds | placeholders, not runtime assets |
| `src/pages/Student/GamePlay.tsx`, `StudentHome.tsx`, `Dashboard/*`, `AdminNav.tsx` | `CachedImg src={config.image}/item.image/piece.imageUrl` + `/logo.svg` | data-driven/`/logo.svg` (no broken local refs) |

## Notes
- Content is **emoji-first**: published Jolly Phonics/Animals configs store emoji, not image URLs; images are derived client-side via Twemoji. Hence the DB URL surface is tiny (4 unique).
- The `example.com` and `wikimedia` URLs are **real, published-config references** (not dead scaffolding) — the tap-recognition and 5 puzzle-split configs would try to load them in-game and fail (404/400). Recommended for B3: replace with saved open-source assets or emoji.
- Local public-media check rewrites `…/kids/media/<key>` and `/media/<key>` to `http://127.0.0.1:8484/media/<key>`.
- `VITE_API_URL` is empty in `frontend/.env`, so the built frontend resolves API/media via same-origin; at dev, kids-web (`:5173`) and backend (`:8484`) are different origins (no proxy in `vite.config.ts`) — worth noting for any future local media fetch against `:8484`.

## Artifacts
- Raw cache (enumerated refs + per-URL status): `team-docs/reports/q3-asset-cache.json`
- Re-runnable enum+check script (read-only): `team-docs/reports/q3-asset-sweep.js`
