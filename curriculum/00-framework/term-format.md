# Canonical Term Format

Use the exact display names below in all teacher-facing curriculum files, APIs, lesson plans, game
metadata, reports and review dashboards:

```text
First Term
Second Term
Third Term
```

Do not use `Term 1`, `Term 2`, `Term 3`, `T1`, `T2` or `T3` as display values. If a compact internal
identifier is needed, use a documented slug:

```text
first-term
second-term
third-term
```

The compact slug may appear inside IDs, for example:

```text
kg2-first-term-w03-numeracy-01
nursery-1-second-term-w07-comm-literacy-01
creche-third-term-w10-health-selfcare-01
```

The human-readable metadata must still carry the full term name:

```json
{
  "termName": "First Term",
  "week": 3,
  "subjectId": "numeracy",
  "minimumGames": 1
}
```

## Term length

Each term has **10 teaching weeks**. Week numbers are always integers `1` through `10`. Each subject
must have at least one playable game seed in each week. A missing game may be marked `deferred` only
with an approved replacement week and reason.
