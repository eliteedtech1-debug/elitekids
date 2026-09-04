# NGEd-game Q3 “The Village” — Human Validation & Iteration Closure

**Date:** 2026-09-04
**Scope:** Q32–Q38 — collaboration, parent intelligence, teacher assistant, integration
**Implementation owner:** freebuff worker
**Closure principle:** Automated tests prove the software behaves as specified; educators, parents, and learners decide whether it is understandable, safe, useful, and worth returning to.

## 1. Implementation status

| Area | Code evidence | Automated evidence | Status |
|---|---|---:|---|
| Classroom collaboration backend | 5 Q3 tables, models, REST controller, Socket.IO hub | `backend/test/q3-collab.test.js` included in 60/60 | Implemented |
| Parent intelligence backend | 8 deterministic insight rules, digest, opt-in comparison, action acknowledgement | `backend/test/q3-parent.test.js` included in 60/60 | Implemented |
| Teacher assistant backend | class aggregation, content-gap detection, auto-assign heuristic, weekly report | `backend/test/q3-teacher.test.js` included in 60/60 | Implemented |
| Cross-track data contract | quest → parent insight → teacher report shared fixture | `backend/test/q3-integration.test.js` included in 60/60 | Implemented |
| Student collaboration UI | teams tab, class quest, team challenge, peer teaching, live socket hook, real peer-tip badge | TypeScript + frontend Q3 suites green | Implemented |
| Parent UI | insight cards, action items, nudge, weekly digest, opt-in comparison | TypeScript + build green | Implemented |
| Teacher UI | AI insights and suggestions tabs, class-scoped loading, assignment dialog | TypeScript + build green | Implemented |
| Human validation | teacher, parent, and learner walkthroughs | No external human sign-off yet | **Pending** |
| Production go-live | deployment and live smoke | Not performed in this session | **Pending explicit release approval** |

## 2. Corrections made during closure audit

1. Fixed the collaboration hook contract: components use the existing `frontend/src/lib/live/useCollabSocket.ts` path.
2. Fixed `StudentHome` prop contracts for `ClassQuest`, `TeamChallenge`, `PeerTeachingBoard`, and `CollaborationBadge`.
3. Wired parent intelligence into the selected-child view instead of leaving the backend unrepresented.
4. Loaded teacher insights and suggestions after the analytics response identifies a class; Q3 failure does not hide the existing analytics view.
5. Fixed the parent dashboard race guard and nullable selected-child rendering.
6. Made the collaboration badge query the current class and show the signed-in child’s real approved peer-tip count; it no longer displays hard-coded zero activity.
7. Class-scoped the peer-teaching board query so a child cannot be shown tips from another class when a class is supplied.
8. Kept content-gap suggestions as “Review gap” rather than pretending a class-level gap can be assigned to a fake child.

## 3. Human validation protocol

### Participants

- **Learner:** one child in each supported age band where possible; use a supervised, non-production account.
- **Parent:** one parent linked to a test child, with explicit explanation of anonymous-comparison opt-in.
- **Teacher:** one teacher with a real or seeded class containing at least two children and mixed mastery signals.
- **Safety reviewer:** confirms that the experience does not expose another child’s identity, raw comparison data, or unmoderated unsafe text.

Do not use real child names or personal data in screenshots or reports. Record only test IDs, role, date, and observations.

### A. Learner walkthrough (15–20 minutes)

1. Open Student Home and find the **Teams** entry point without coaching.
2. Open the class quest; explain what the target and progress bar mean.
3. Join a team and submit a challenge answer; confirm the score and live update are understandable.
4. Open Coach Corner, read one peer tip, and submit a short text explanation.
5. Confirm the learner can tell whether a tip was shared and can identify “You” without seeing unnecessary personal information.
6. Repeat once on a narrow mobile viewport and once with the app’s accessibility settings used by the learner.

**Ask the learner:**

- “What do you think you should do next?”
- “Which part felt confusing or too grown-up?”
- “Did anything make you feel compared, embarrassed, or left out?”
- “Would you use Coach Corner again? Why?”

**Accept when:** the learner completes the path without adult intervention, understands the next action, and reports the tone as encouraging rather than competitive pressure.

### B. Parent walkthrough (15 minutes)

1. Sign in and select one linked child.
2. Find “What this means” and explain one insight in their own words.
3. Mark one action item done and confirm it remains scoped to that child.
4. Open Weekly Digest and compare it with the child’s known test activity.
5. Review anonymous comparison while opted out; verify no peer data is visible.
6. Opt in, inspect the age-band-only result, then opt out and verify the result disappears.
7. Check that another linked child’s data is not mixed into the selected child’s view.

**Ask the parent:**

- “Does this help you decide what to do with your child this week?”
- “Is any wording alarming, judgmental, or too certain for an estimate?”
- “Was the comparison consent choice clear?”
- “Which card would you ignore or want removed?”

**Accept when:** the parent can describe one calm next step, understands that insights are guidance rather than diagnosis, and can enable/disable comparison without assistance.

### C. Teacher walkthrough (20 minutes)

1. Open Teacher Analytics and verify the existing overview still works.
2. Open AI Insights for a class with mixed mastery; locate the struggling-student signal.
3. Open Suggestions; distinguish a content gap from a child-specific review/assign suggestion.
4. Confirm a class-level content gap is not shown as a fake child assignment.
5. Review the weekly report and compare active students, XP, score, and insight counts with the seeded class data.
6. Trigger auto-assign only after reviewing the proposed intents; cancel once and confirm no assignment was made.
7. Confirm a teacher sees only their authorized class and that another class cannot be selected through a query-string edit.

**Ask the teacher:**

- “Does this save time or create another dashboard to interpret?”
- “Would you act on this alert? What evidence would you need first?”
- “Are the labels ‘struggling’, ‘review’, and ‘content gap’ appropriate for staff use?”
- “What should be hidden from a teacher until they open a student record?”

**Accept when:** the teacher can identify a useful next action in under two minutes, understands that heuristics are not diagnoses, and does not expect auto-assign to happen without confirmation.

## 4. Feedback severity and iteration loop

| Severity | Example | Response target | Release rule |
|---|---|---:|---|
| P0 safety/privacy | cross-child data, unsafe peer text exposure, misleading comparison identity | stop validation immediately | no-go until fixed and retested |
| P1 comprehension/access | learner cannot identify next action, parent misreads risk as diagnosis, keyboard/mobile blocker | next iteration before pilot | no-go for affected role |
| P2 usefulness/tone | teacher gets noisy alerts, parent wording feels cold, learner ignores the card | triage in 48h | pilot may continue only with reviewer approval |
| P3 polish | spacing, icon, copy preference with no task failure | backlog | does not block pilot |

For every observation, record:

```text
Observation ID:
Role / test account:
Scenario:
What the person expected:
What actually happened:
Exact words or behaviour (no personal data):
Severity:
Proposed change:
Owner:
Retest evidence:
Reviewer disposition: accept / revise / defer
```

After each iteration, rerun the affected automated test, repeat the human scenario with a different participant where possible, and append the result rather than deleting the original observation. Two consecutive sessions without a P0/P1 issue are required before pilot recommendation.

## 5. Automated validation completed

- Backend Q3 suites: **4 suites, 60 tests passed** (`q3-collab`, `q3-parent`, `q3-teacher`, `q3-integration`).
- Frontend Q3 realtime suites: **3 files, 37 tests passed**.
- Frontend TypeScript check: **passed** (`npx tsc --noEmit`).
- Frontend production build: **passed** (`npm run build`). Existing Vite warnings are bundle-size/dynamic-import warnings, not build failures.
- Backend Q3 syntax checks: **passed** for controllers, socket, and migration script.
- `git diff --check`: **clean** for the Q3 implementation changes.
- Database-backed Q3 contracts ran against the hermetic test DB and passed; no production database writes were performed.

## 6. Human sign-off record

| Role | Reviewer | Date | Result | Notes |
|---|---|---|---|---|
| Learner | __________________ | __________ | PENDING | supervised walkthrough required |
| Parent | __________________ | __________ | PENDING | consent/comparison walkthrough required |
| Teacher | __________________ | __________ | PENDING | class analytics/assignment walkthrough required |
| Safety/privacy | __________________ | __________ | PENDING | NDPR/COPPA and peer-text review required |
| Release owner | __________________ | __________ | PENDING | deployment/live-smoke decision |

## 7. Closure decision

**Current decision: READY FOR HUMAN VALIDATION — NOT YET CLOSED FOR PRODUCTION.**

The implementation is code-complete for Q32–Q38 and passes the available automated gates. It must not be described as human-validated or fully deployed until the participant walkthroughs above are completed, observations are triaged, any P0/P1 issues are fixed and retested, and the release owner records a go/no-go decision. No deployment or push was performed by this session.
