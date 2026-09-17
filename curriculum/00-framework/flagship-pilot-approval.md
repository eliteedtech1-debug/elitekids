# Flagship Pilot Approval and Curriculum Activity Contract

**Status:** pilot operating contract, not a production curriculum approval or database migration
**Scope:** one approved flagship school, one branch, one class, one subject, one term/week at a time

## Pilot decision

The flagship school is the controlled pilot. Adults may create and play-test games before children use
 them. A pilot game can publish without a second human approval click only when the server receives all
four validation assertions:

- `played`: an adult played the complete game;
- `story_checked`: the story/scenes match the learning objective;
- `game_checked`: controls, answers, feedback and completion work;
- `safety_checked`: age, language, accessibility and safeguarding checks passed.

This is a convenience mode, not a safety bypass. Schema and pedagogy validation still run on the server,
child-facing endpoints still serve only `published` content, and the mode is disabled by default.
It can be enabled only with:

```text
KIDS_FLAGSHIP_PILOT_ENABLED=true
KIDS_FLAGSHIP_PILOT_SCHOOLS=SCH-ELITE
```

The school allow-list is intentionally separate from `SMS_CONTEXT_BRIDGE_SCHOOLS`. The pilot does not
make EliteSMS credentials available to the browser and does not enable non-flagship authoring.

## Reversible editing rule

Flagship staff can edit a pilot lesson through the pilot editor. The update is atomic: lesson, game
configuration and (when supplied) scene scripts are replaced together, then remain `published` only
if the same four adult validation assertions are supplied. Template changes are rejected; create a new
lesson when the instructional interaction changes. Other schools cannot use this endpoint.

If the pilot is paused, set `KIDS_FLAGSHIP_PILOT_ENABLED=false`; no content is deleted and the normal
approval workflow remains available for existing/new content. If an already-published pilot item must
be withdrawn, use the existing recall/content-state workflow rather than destructive deletion.

## Curriculum activity representation awaiting final backbone approval

The activity seed must remain a versioned, idempotent artifact until the master approves the schema
representation and subject set. Each activity cell is identified by:

```text
<class>-<term-slug>-w<01..10>-<subject-id>-01
```

with metadata:

```json
{
  "classLabel": "Kindergarten",
  "ageBand": "Kindergarten",
  "termName": "First Term",
  "week": 1,
  "subjectId": "numeracy",
  "learningObjective": "Match groups of up to five objects to the matching numeral.",
  "gameSeedId": "kindergarten-first-term-w01-numeracy-01",
  "minimumGames": 1,
  "state": "planned"
}
```

The working planning scaffold uses **3 terms × 10 teaching weeks** and nine cross-band domains:
`comm-literacy`, `writing`, `numeracy`, `science-nature`, `social-habits`, `health-selfcare`,
`movement`, `creative-arts`, `digital`. This is a proposed pilot planning grid, not yet a destructive
or authoritative production seed. Each cell has one concrete experience, one observable success
statement and one game seed; Crèche/Playgroup use adult observation rather than a child-facing test.

## Decisions still recorded as pending

Before any production schema alteration, curriculum-point reseed or bulk activity seeding, confirm:

1. scheme-of-work representation: new `kids_scheme_of_work` table versus lesson term/week columns;
2. exact subject set per band and school timetable exceptions;
3. final academic grid (currently proposed: three terms, ten teaching weeks each);
4. mapping/reseed treatment for the two old-label curriculum points.

Until those four decisions are explicitly confirmed, this document and the files under `curriculum/`
are planning artifacts only. No production write, schema alteration or destructive rename is authorized.
