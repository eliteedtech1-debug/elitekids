# Risk Mitigation & Child Safety Architecture

> **Superseded by Doc 13 — Pedagogy Validator is a new mandatory gate, separate from safety pipeline**
> 
> The safety architecture below is unchanged, but now sits alongside the Pedagogy
> Validator (Doc 13) as two independent, mandatory gates. Pedagogy validation runs
> FIRST; safety validation runs on every generated asset regardless of pedagogy outcome.
> See Doc 13 for the full pipeline diagram.

Hard requirement layer, not a nice-to-have. Every rule here is enforced in code, not
left to workflow expectations. Storage locations follow 02-ELITE-INTEGRATION/02.

## 1. Content state machine — the core gate
All generated content (lesson text, story, images, scene scripts, game configs, audio)
has an explicit state:
```
generated → pre_screened → pending_human_review → approved → published
                 │
                 └── auto-rejected (fails denylist/classifier) → discarded, logged
recalled ← (any published state, for incidents — single UPDATE removes from all children)
```
**There is no code path from `generated` directly to any child-facing screen or API
response.** Enforced at the database/API layer (`content_state` column + every
child-facing query filters `content_state = 'published'` — never an application-level
"remember to check this" convention).

Tables: `kids_lessons`, `kids_game_configs`, `kids_scene_scripts` (elite_content).

## 2. Pre-screen classifier (before a human ever sees it)
A fast, cheap model call scores every generated asset against a fixed rubric before it
enters the human review queue:
- Age-appropriate vocabulary and concepts for the stated level
- No violent, frightening, or otherwise unsuitable imagery/text
- Curriculum/topic alignment (catches off-topic drift)

Failing content is auto-rejected and logged, never shown to a reviewer as if it were a
normal candidate. Results persist in `kids_prescreen_log` (elite_content).

## 3. Deterministic denylist (independent of any AI)
A human-curated, version-controlled list of disallowed topics/imagery categories/
phrases, checked as a hard filter on every generated asset — separate from and in
addition to the AI classifier. Deterministic rules can't drift, hallucinate, or be
argued around by a clever prompt. Auditable (who added/changed a rule, when) via
`kids_denylist_rules.added_by` + timestamps. Ships seeded with age-appropriate defaults
(`backend/src/seeders/denylistSeed.js`).

## 4. Structured-output-only rule (extends to everything)
Every AI-generated content type is schema-validated structured data (Game Config JSON,
Scene Script JSON — see 10-VIDEO-ANIMATION-ARCHITECTURE-REVISION.md) before it is ever
rendered. No raw, unbounded model output reaches a rendering step. This makes human
review meaningful — a reviewer checks bounded, structured content.

## 5. Permanent audit log
Every generated asset is logged permanently in the AI DB
(`kids_content_generation_audit` — `elite_bot` on this server, see DEC-002):
prompt, model provider + pinned version, raw output, classifier score, denylist result,
reviewer identity, approval timestamp, publish timestamp. If a parent, school, or
regulator ever asks "why did my child see this," the answer must be retrievable in
minutes. (elite-api already connects to an AI DB — see DEC-002 in 09-DECISIONS-LOG.md
for the `elite_ai` vs `elite_bot` default.)

## 6. AI provider version pinning
External AI providers can silently update models. Pin exact model versions in config
(`AI_MODEL`, `CLASSIFIER_MODEL`); never auto-upgrade in production. Any provider/model
version change re-runs the full eval suite (pre-screen classifier + denylist + a fixed
set of known test prompts) before going live. Maintain a fallback provider per content
type where feasible.

## 7. Staged rollout by trust tier
New content types (subject area, game template, age level) start in a
**sandbox/pilot-only tier** — visible only to a small set of designated pilot teachers,
never general availability. Promotion to all schools requires N consecutive
human-approved generations with zero flagged issues. At the school level, the module
gate (`school_setup.kids_stand_alone`) is the trust switch: pilot schools only until
the threshold is met.

## 8. Incident response plan (written before it's needed)
If inappropriate content does reach a child:
1. Immediate: `content_state` flipped to `recalled` — removed from all child-facing
   queries instantly (single UPDATE; the state machine makes this trivial).
2. Within 24h: root cause identified using the audit log (AI DB) — which pipeline
   stage let it through.
3. Affected school(s)/parent(s) notified per an agreed communication template —
   decide this template now, not during a live incident.
4. Denylist and/or classifier rubric updated to prevent recurrence; entry added to
   09-DECISIONS-LOG.md.

Having this written in advance is what separates "we take this seriously" from an
improvised response under pressure.

## Roadmap impact
Sprint 2 (Content Config Generator): pre-screen classifier, denylist filter, content
state machine, audit log table.
Sprint 6 (QA & pilot readiness): staged rollout gating, incident response runbook
reviewed by a human, provider version pinning confirmed in config.
