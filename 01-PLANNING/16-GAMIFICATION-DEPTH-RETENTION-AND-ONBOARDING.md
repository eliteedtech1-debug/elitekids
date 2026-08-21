# EliteKids — Gamification Depth: Retry Logic, Retention, Reward Equity, Multilingual Audio, Fatigue & Onboarding
*Gaps in the current Association Ladder / mode design that only show up once a child actually struggles, forgets, or gets tired — not visible when designing the "happy path" alone.*

## 1. Test-Mode Failure Handling (Retry / Adaptive Difficulty)
The Association Ladder (Doc 12) defines forward progression but not what happens on repeated failure. Without an explicit rule, a child can get silently stuck or silently advanced past something unmastered — both defeat the purpose of the tier system.

**Rule:**
- **First Test-mode failure on an item/tier** → routed back to Practice mode for that same item/tier, not immediately retested. No visible "you failed" framing — reframed neutrally as "let's practice this one more" (consistent with the "intelligent, not scary" tone principle already established for EliteFees, applied here too).
- **After 2 full Practice-mode passes with consistent correct answers** → Test mode is offered again for that item/tier.
- **Repeated failure across 3+ cycles** → flagged to the teacher (not the child) as "this child may need direct support with {item/tier}" — a plain-language, non-alarming flag, same presentation rules as Doc 14 (no urgent/warning language, no composite score).
- **A child is never blocked from moving to a different item/category** while stuck on one — struggling with "Cow" shouldn't prevent starting "Dog."

**Data model addition:** `test_attempts` — `student_id`, `item_id`, `tier`, `result`, `attempt_number`, `routed_to` (retest/practice/teacher_flag), `timestamp`.

## 2. Spaced Repetition (Mastery Decays Without Review)
Mastery checked once in Test mode is not mastery retained. Without scheduled review, a child who passed "Cow" in week 1 will likely forget it by week 6 — a well-known gap in a lot of edtech gamification.

**Rule:**
- Every mastered item/tier is scheduled for a **light-touch review prompt** at increasing intervals: 3 days → 1 week → 3 weeks → 6 weeks (standard spaced-repetition curve, simplified for early years — no need for a complex algorithm, fixed intervals are sufficient at this age band).
- Review prompts are **short and low-stakes** — a single Practice-mode question, not a full Test-mode session — folded naturally into a session rather than presented as "revision."
- If a review prompt is missed (child gets it wrong), the item quietly re-enters the normal Practice cycle rather than being flagged as a regression immediately — one missed review isn't a pattern (ties to the regression-flag caution already in Doc 14).

**Data model addition:** `review_schedule` — `student_id`, `item_id`, `tier`, `next_review_at`, `interval_stage` (1–4), `last_result`.

## 3. Reward/Sticker Equity (Avoid Doubling Discouragement)
If emoji/sticker unlocks are tied to speed or correctness, a slower or struggling child falls behind in customization too, compounding discouragement on top of academic struggle.

**Rule:**
- Reward unlocks are tied to **participation and effort**, not performance: completing a session, trying a new category, returning after a few days away — not "answered fastest" or "got it right first try."
- Every child reaches new customization options at a broadly similar pace regardless of academic progress — the reward system and the learning system are deliberately decoupled.
- Exception: a small number of "mastery badges" can exist for genuine milestones (completed a full tier ladder), but these are additive celebration, never a prerequisite for the fun customization content (emoji/stickers) everyone should have equal access to.

## 4. Multilingual & Local-Language Audio (Ladder Currently Assumes One Language)
The original EliteKids vision explicitly calls for Nigerian English, local languages, and cultural context — but Doc 12's Tier 0–3 audio pairings were specified assuming a single narration language.

**Rule:**
- Every audio asset in the Modality Maps (animal sounds excepted — a cow's "moo" isn't language-dependent) needs a **language variant field**: `audio_asset_id`, `language` (Nigerian English / Hausa / Yoruba / Igbo, extensible), so Tier 1/3 (which depend on spoken narration or phonics) can serve the school's/family's preferred language.
- **Letters category is the most language-sensitive** — phonics differ meaningfully across languages; the Modality Map for Letters needs a language-specific variant, not a direct translation of English phonics.
- This doesn't need to launch with all languages — but the schema should support it from the start so it isn't a retrofit later (same principle as Doc 07's AI-upgrade-path pattern in EliteFees: build the seam now, fill it in later).

## 5. Session Fatigue & Natural Stopping Points
Nothing currently nudges a break for a 3–5 year old whose attention has genuinely dropped, beyond the teacher manually stopping the session.

**Rule:**
- After a defined active-play duration appropriate to age band (roughly 7–10 minutes for Creche/Nursery, slightly longer for KG, to be confirmed with the ECE center per Doc 15's partnership) — the game suggests a natural break ("Great job! Let's take a little rest 🌟") rather than continuing indefinitely.
- This is a suggestion, not a hard lock — a teacher can continue the session if appropriate for their classroom flow — but the default should protect against overuse, not assume adult supervision will always catch it.
- Session-length data (already captured per Doc 14's engagement signals) should inform this threshold over time, per age band, once real usage data exists.

## 6. Interface Onboarding (Separate From Content Onboarding)
Tier 0 teaches *what a cow is* — nothing currently teaches *how to interact with the screen* before a child's first real lesson. A child unfamiliar with touchscreens could fail Tier 1 not from not knowing the content, but from not knowing how to tap/drag/respond.

**Rule:**
- A **one-time Interface Onboarding sequence** runs before a child's very first lesson (any category): teaches tap-to-select, drag-to-sort, and what the feedback icons (correct/incorrect, if shown) look like — using neutral, content-free objects (big colorful shapes, not curriculum items), so it doesn't consume or bias any actual learning item.
- Tracked per student (`interface_onboarding_completed_at`) so it only runs once, not before every session.
- This is a genuine MVP-scope addition, not a nice-to-have — without it, early Tier 1 failures are unattributable (content gap vs. interface confusion), which corrupts every pattern-tracking signal in Doc 14.

## Integration Notes
- All six items above are additive to the existing Association Ladder (Doc 12) and Pedagogy Enforcement Layer (Doc 13) — no existing rule is contradicted, these fill gaps the "happy path" design didn't cover.
- Recommended build order: **Interface Onboarding first** (cheapest, and corrupts other data if missing), then **Retry/Adaptive Difficulty**, then **Reward Equity** (mostly a policy/tagging change, low engineering cost), then **Spaced Repetition**, with **Multilingual Audio** and **Session Fatigue** timed alongside the Curriculum Mapping work (Doc 15) since both benefit from ECE center input on the right thresholds/language priorities.
