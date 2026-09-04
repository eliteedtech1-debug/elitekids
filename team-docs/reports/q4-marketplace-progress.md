# Q4 "The Future" — Content Marketplace progress (Paystack + Monnify)

Plan refs: `team-docs/NGEd-game-2027-ROADMAP.md` §2.13; risk map `team-docs/q4-conflict-risk-map.md`.
Started: 2026-09-04. Track: **Marketplace backend (W1-3 slice)** — parallel-safe, zero Q3 overlap.

## Done (code in working tree, uncommitted)
- `backend/src/services/monnifyService.js` — Monnify alternative gateway (fail-open, same contract as paystackService): token (OAuth2 basic), init-transaction (CARD), verify, webhook HMAC-SHA512, isConfigured().
- `backend/src/controllers/kidsMarketplace.js` — dual-gateway marketplace controller:
  - ensureSchema() creates 3 additive tables in elite_content: kids_marketplace_listings / kids_marketplace_purchases / kids_marketplace_reviews.
  - listListings / getListing / createListing / updateListing / deleteListing / initiatePurchase / verifyPurchase / purchaseWebhook (Paystack) / monnifyWebhook / addReview / seedMarketplace.
  - initiatePurchase accepts `gateway` (paystack|monnify, default paystack); free listings bypass payment; paid go to chosen gateway's checkout/verify.
- `backend/src/routes/kids.js` — marketplace route group under auth/requireStaff + 2 webhooks (Paystack + Monnify).
- `backend/test/marketplace.test.js` — service fail-open + controller API-surface tests (pure, no DB).

## Verified
- node --check clean on kidsMarketplace.js, monnifyService.js, kids.js, marketplace.test.js.
- Controller + both gateway services load via node require; exported API surface confirmed.
- Full jest suite BLOCKED here: `test/global-setup.js` unconditionally seeds the test DB and MySQL root access is denied in this env (same blocker as Q3). Run marketplace.test.js on a host with test-DB creds.

## Not yet done (this slice)
- Marketplace FRONTEND (ListingCard/ListingDetail/Marketplace page) — queued (Q40).
- Payout / revenue-share 70-30 rule + payout table — deferred, needs MASTER spec (human-last, per risk map).

## Notes
- MONNIFY_SECRET_KEY / MONNIFY_PUBLIC_KEY / MONNIFY_CONTRACT_CODE to be added to backend/.env when Monnify creds are provisioned (service fail-open until then).
- Used raw-SQL ensureSchema pattern (same as kidsSubscription) rather than Sequelize models — consistent with the existing commercial kids_* tables; no model registry change needed.
- No commits, no pushes (per hands-off/publish-later protocol).

## Conflicts with freebuff (Q3)
None — all-new kids_marketplace_* files/tables; no shared file with Q3 tracks.
