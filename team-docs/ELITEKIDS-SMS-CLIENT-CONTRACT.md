# EliteKids ↔ EliteSMS Server Client Contract

**Status:** Phase 2 client foundation / Phase 3 bridge integration in progress  
**Owner:** EliteKids backend  
**Authoritative system:** EliteSMS for non-flagship institutional context

## Purpose

EliteKids can have direct access to the EliteSMS database for historical compatibility, but new ECCE bridge code must cross the deployed EliteSMS API. This prevents school, branch, class, subject, academic-period and lesson data from drifting between applications.

```text
EliteSMS API → EliteKids server client → lesson bridge → Kids game/game-chain → evidence
```

The browser never receives or stores the service credential.

## Environment contract

Set these in the **EliteKids backend** environment only:

```dotenv
ELITE_SMS_API_BASE_URL=https://<deployed-elite-sms-host>
ELITE_SMS_SHARED_JWT=<short-lived or rotated server credential>
# Or, for an explicitly approved internal deployment:
ELITE_SMS_SHARED_API_KEY=<rotated service key>

ELITE_SMS_REQUEST_TIMEOUT_MS=8000
ELITE_SMS_MAX_RETRIES=2
SMS_CONTEXT_BRIDGE_ENABLED=false
```

`ELITE_SMS_SHARED_JWT` and `ELITE_SMS_SHARED_API_KEY` are mutually usable alternatives; do not place either in frontend/Vite variables. The client sends them only from the backend to:

```http
GET /api/v1/shared/kids/lesson-context
```

The API request contains class/subject/lesson/academic filters. School and branch scope are supplied through verified service claims/headers according to the EliteSMS service-auth deployment contract.

## Development and test fixture

A fixture is permitted only when all of the following are true:

- `NODE_ENV` is not production.
- `ELITE_SMS_USE_FIXTURE=true` is explicitly set.
- The fixture is injected into `EliteSmsClient` or supplied as test JSON.
- The fixture passes the same response normalization as a real API response.

A fixture is not a production fallback and must not be implemented as a direct shared-DB query. Test and development databases must still use `_test` names under `team-docs/ELITEKIDS-DATABASE-ENV-CONTRACT.md`.

## Normalized response requirements

The client accepts only a successful response with:

- `success: true` and an object `data`.
- `data.source = "elite-sms"`.
- `data.contract_version`.
- A class identity with `class.class_code` matching the request.
- Academic identity with `academic_year` and canonical term.
- An array of `subjects`.

The response remains a small institutional context. It is not a student profile, lesson-plan copy or classroom-content mirror.

## Error contract

| Code | Meaning | Bridge behavior |
|---|---|---|
| `SMS_CONTEXT_NOT_CONFIGURED` | URL/credential/client is absent | Fail closed; configuration/deployment action required |
| `SMS_CONTEXT_INVALID_REQUEST` | Required class or request field is invalid | Return field-level authoring error |
| `SMS_CONTEXT_REJECTED` | SMS rejected a non-retryable request, e.g. 4xx | Do not retry; show actionable error |
| `SMS_CONTEXT_UNAVAILABLE` | Timeout, network failure or 5xx/429 after bounded retry | Do not invent context; show retry/unavailable state |
| `SMS_CONTEXT_INVALID_RESPONSE` | SMS response is malformed or unsafe | Do not persist it |
| `SMS_CONTEXT_MISMATCH` | Returned class differs from requested class | Reject the bridge |

Only GET is retried, with a bounded maximum of three attempts and a small backoff. Secret values and upstream response bodies are not logged or returned.

## Ownership boundaries

### EliteSMS owns

- School and branch identity.
- Student admission number and DOB.
- Class and class code.
- Subject code and display subject name.
- Academic year, term, academic week.
- SMS lesson identity.
- Professional lesson plans and classroom lesson notes/content.

### EliteKids owns

- `kids_lesson_bridges` and game-chain translation.
- Game configurations, scenes, play sessions and child progress.
- Teacher observations, evidence and neutral summaries.

An SMS lesson plan is not the same thing as an SMS lesson note/content, and neither is the Kids game bridge. A bridge may reference an SMS `lesson_id` and retain a minimal context snapshot; it must not overwrite or impersonate an SMS plan/note.

## Rollout

1. Deploy and verify the EliteSMS endpoint and service authentication.
2. Set `ELITE_SMS_API_BASE_URL` and one server credential in EliteKids.
3. Keep `SMS_CONTEXT_BRIDGE_ENABLED=false` until contract tests and one controlled school/branch pass.
4. Enable for a pilot non-flagship school.
5. Keep `SCH-ELITE` and documented model-school fixtures on the explicit `flagship-local` path.
6. Observe availability and mismatch errors with low-cost logs; do not introduce a new analytics platform.

## Security checklist

- [ ] Service credential exists only in backend environment.
- [ ] EliteSMS validates service scope and school/branch claims.
- [ ] EliteKids does not trust browser `school_id` as institutional truth.
- [ ] No new bridge path reads EliteSMS tables directly.
- [ ] No private guardian/financial fields are projected.
- [ ] All dev/test databases end in `_test`.
- [ ] Published child gameplay remains available if authoring context API is unavailable.
