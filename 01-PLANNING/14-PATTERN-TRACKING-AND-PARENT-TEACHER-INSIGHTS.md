# EliteKids — Pattern Tracking & Parent/Teacher Insights
*Descriptive learning-pattern insights for parents and teachers — explicitly NOT behavioral/personality inference and NOT a developmental/psychological assessment. See "What This Is Not" before implementing anything here.*

## What This Is Not (read first)
This layer does not label a child (kind, aggressive, gifted, delayed) and does not attempt developmental or psychological assessment (chronological age estimation, intellectual stage). Those require validated clinical instruments and licensed expertise EliteKids does not have and is not attempting to replicate. This layer only describes **how a specific child engages with and progresses through content**, compared to their own history — never to other children, never to population norms.

## Signals to Capture

### Learning style signals
- Content-format engagement duration: songs vs. stories vs. matching games vs. quizzes
- Modality preference: accuracy/speed with audio narration on vs. visual-only
- Response time pattern per tier: consistently fast (confident), slow-but-correct (careful), fast-and-wrong (guessing) — logged as a pattern, never surfaced as a trait label

### Mastery & progress signals (using the Association Ladder, Doc 12)
- Practice-attempts-before-Test-readiness, per item/tier
- Category-level strength/struggle map (e.g., strong in Shapes, slower progress in Letters)
- Regression flags: a previously-mastered item/tier now missed more often — surfaced neutrally as "worth a look," not as an alarm

### Engagement signals
- Session length and time-of-day patterns
- Drop-off points within a game sequence
- Customization behavior (emoji/sticker choices) — shown to parents as a fun preference summary only, never analyzed beyond that

## Data Model
- `game_item_responses` (already planned: per-tap logging) — extend with `tier`, `distractor_count`, `response_time_ms`, `mode` (learning/practice/test)
- `engagement_snapshots` — session_id, start/end time, drop_off_point (nullable), content_format_breakdown (JSON)
- `mastery_progress` — student_id, category, item_id, tier, attempts_to_mastery, last_regression_flag_at (nullable)

## Presentation Rules (non-negotiable)
1. **Always relative to the child's own history** — "faster at letter games than last month," never "below average for age" or any population comparison.
2. **Always framed as what helps them learn**, never what's wrong with them.
3. **No composite score.** No single number resembling an IQ or developmental score — this is the exact line that turns a helpful pattern into an implied diagnosis. Explicitly disallowed.
4. **Plain-language digest format**, same style as the EliteFees "what changed" weekly digest — a teacher/parent view in sentences, not raw charts, with charts available one tap deeper for those who want them.
5. Any regression flag must include a neutral, non-alarming framing ("worth a look this week") — never urgent/warning language, since normal variation is common and this is not a diagnostic signal.

## Who Sees What
| Role | Sees |
|---|---|
| Parent | Their own child's patterns only, plain-language digest |
| Teacher | All students in their class, category-level strength/struggle map, for lesson planning |
| Proprietor/Principal | Aggregate, anonymized class/school-level engagement trends only — never individual child patterns |

## Explicitly Out of Scope (for now)
- Any inference about personality, temperament, or emotional state
- Any chronological-age or developmental-stage estimation
- Any composite "readiness" or "intelligence" score
- Cross-child comparison of any kind visible to a parent

If a genuine developmental-screening feature is pursued later, it requires a licensed validated instrument and a named child development specialist collaborator — this doc does not authorize or scope that; see the separate discussion on developmental assessment risk.
