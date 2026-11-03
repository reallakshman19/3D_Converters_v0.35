# PR503 — AIV Readiness-to-Screening Runtime Bridge Fix

## Recovery header

| Field | Current state |
|---|---|
| Mission | Fix `Run AIV screening` failure `Cannot read properties of null (reading 'caseId')` after readiness. |
| Work intent | IMPLEMENT |
| Criticality | ENGINEERING_CRITICAL |
| PR | `#503` — OPEN; owner merge authorized |
| Branch | `agent/aiv-screening-caseid-null-fix` |
| Original base | `main@b13797d23db1f01200a2349e77f39c883e62a84c` |
| Current reconciled main | `main@2a80e0aacba20bdff5f3d88e79042187cf80bcce` |
| Reconciliation commit | `457d0bea84a84620f6b7b1718ee55d232c8be4a7` |
| Authority impact | NONE |
| Merge authority | AUTHORIZED by owner on 2026-08-15 |
| Exact next action | Re-check final head/scope, mark ready, squash-merge with exact-head protection, then verify `main`. |

## User-observed failure

AIV readiness completed and exposed the screening action, but pressing `Run AIV screening` produced:

`Cannot read properties of null (reading 'caseId')`

The production action is expected to execute readiness-qualified records through the registered `VIB.AIV.ACOUSTIC` Engineering Calculation API.

## Production trace

`Run AIV screening`
→ `createAivExecutionActions.runScreening()`
→ readiness-envelope Sources / Assessments / Source→Assessment / topology
→ `buildAivEngineeringScreeningRequest()`
→ registered `calculateEngineering()`
→ `VIB.AIV.ACOUSTIC` adapter
→ `calculateAiv()`.

## Implemented fix

### Fail-closed screening request bridge

New `tabs/vibration-aiv-screening-request.js` validates before central API execution:

- readiness envelope/schema and topology exist;
- at least one `READY_FOR_QUALIFICATION` relationship exists;
- no `NOT_READY` or `METHOD_GAP` blocker exists;
- Source, Assessment, Source→Assessment and readiness records are non-null objects;
- Source Canonical ID, Assessment Canonical ID and Operating Case identities are nonblank;
- every Source→Assessment record joins an exact Source+case and Assessment identity from the readiness envelope.

Violations fail closed with `AIV_SCREENING_REQUEST_*` errors. No record is filtered, defaulted, invented or dropped.

### Browser action

`tabs/vibration-aiv-execution.js` builds the request through `buildAivEngineeringScreeningRequest()` and continues to call registered `calculateEngineering()`. No direct `calculateAiv()` bypass was introduced. The screening catalogue import revision changes from `aiv-screening-1` to `aiv-screening-2`, and bridge error codes are retained in the UI message.

### Exact controlled-mock regression

`tests/vibration-aiv-screening-runtime-bridge.test.mjs` exercises:

`two-RV controlled flare mock`
→ generated visible tables
→ assumption resolution
→ FLARE_NETWORK readiness
→ screening request bridge
→ registered `calculateEngineering(VIB.AIV.ACOUSTIC)`.

It pins two READY relationships, `RV-101`/`RV-102` in `RELIEF-COMBINED`, one Assessment result retaining both source IDs, `screeningResultScope=ASSESSMENT`, 10 kernel stages, non-authoritative Line/Case and `designAuthority=false`.

A second regression injects a null Source→Assessment record and requires `AIV_SCREENING_REQUEST_RECORD_INVALID` rather than a raw `caseId` dereference.

### Release wiring

The regression is wired into `verify:aiv-screening-release` and `verify:aiv-input-model`, therefore into the AIV release chain.

## Changed-file ledger

| Path | Change | Authority impact |
|---|---|---|
| `tabs/vibration-aiv-screening-request.js` | fail-closed request bridge | None |
| `tabs/vibration-aiv-execution.js` | bridge use, code-preserving error, cache revision | None |
| `tests/vibration-aiv-screening-runtime-bridge.test.mjs` | exact product-path regression | Test only |
| `package.json` | release-test wiring | Test wiring only |
| `agents/PR503_workreport.md` | living handoff | None |

## Recovery authority

Connector-only runtime cannot execute the repository backup CLI. Immutable pre-edit blobs remain recovery authority:

- `tabs/vibration-aiv-execution.js` — `12ffe3f60544135e2853e779636749609d219239`
- `package.json` — `9d8feafb1c01de57738d7a6225239186c2668dd9`

New files had no pre-edit blob.

## Authority boundary / negative assurance

Unchanged:

- AIV equations and numerical coefficients;
- Stage 8/9/10 numerical mechanics;
- assumption profile values and explicit-user-value precedence;
- topology connectivity authority;
- physical-distance engineering authority;
- readiness statuses and screening qualification rule;
- Assessment LOF screening authority;
- configured Line/Case non-authoritative status;
- persistence/export contracts;
- `designAuthority=false`.

## Reconciliation with live main

Before merge authorization, `main` advanced from `b13797d...` to `2a80e0aacba20bdff5f3d88e79042187cf80bcce` through PR499 (`feat(fit): qualify bounded production screening`). PR499 changed FIT/Facility/working-state/test/evidence paths and did not overlap any of PR503's five paths.

PR503 was reconciled using a two-parent commit:

- PR503 parent: `c8203e3cf7a8863cfcf0cdb92afa164267e672d5`
- current main parent: `2a80e0aacba20bdff5f3d88e79042187cf80bcce`
- reconciliation: `457d0bea84a84620f6b7b1718ee55d232c8be4a7`

Post-reconciliation compare: **9 ahead / 0 behind**, exactly five intended changed files.

## Validation ledger

| Check | Status | Observation | Oracle |
|---|---|---|---|
| Live main grounding | PASS | Current main `2a80e0aac...` inspected | GitHub ref |
| PR499 overlap | PASS | No overlap with PR503 five paths | GitHub changed-file list |
| Reconciliation | PASS | `457d0bea...`; 9 ahead / 0 behind | GitHub compare |
| Production action trace | PASS | UI action→request bridge→registered API | SOURCE_INSPECTION |
| No direct-kernel bypass | PASS | registered `calculateEngineering` remains execution path | SOURCE_INSPECTION |
| Fail-closed null handling | PASS | explicit record/identity/join guards | SOURCE_INSPECTION |
| Controlled-mock regression source | PASS | exact readiness→registered-API test present | SOURCE_INSPECTION |
| Native focused test | NOT_RUN | Connector-only runtime | NONE |
| Native full AIV release suite | NOT_RUN | Connector-only runtime | NONE |
| Real-browser reproduction/acceptance | NOT_RUN | Browser runtime unavailable | NONE |
| Hosted Topology workflow on earlier exact head | NOT_RUN / INFRASTRUCTURE_BLOCKED | `steps=[]`, `runner_id=0`, no runner | NONE |
| Hosted AIV workflow on earlier exact head | NOT_RUN / INFRASTRUCTURE_BLOCKED | `steps=[]`, `runner_id=0`, no runner | NONE |

Owner merge authorization does not convert any NOT_RUN check to PASS.

## Active items

- `ISS-001` FIXED_IN_SOURCE — malformed/null records cannot enter AIV central screening through the browser bridge without an explicit AIV error.
- `ISS-002` FIXED_IN_SOURCE — controlled mock now has readiness→registered-API regression coverage.
- `IMP-001` IMPLEMENTED — screening import revision refreshed to `aiv-screening-2`.
- `DEC-001` ACTIVE — no silent record filtering/defaulting to obtain a result.
- `DEC-002` ACTIVE — registered Engineering Calculation API remains execution authority.
- `RISK-001` OPEN — native/browser execution remains NOT_RUN.

## Appendix A — engineering-critical takeover gate

### A1 Production trace — 19/20
Exact UI action, request bridge, registered adapter and domain kernel are identified; live browser stack trace for the original exception is unavailable.

### A2 Failure isolation — 19/20
The unguarded browser→API contract gap is closed without numerical changes; original runtime stack was not independently reproduced here.

### A3 Authority / invariant — 20/20
Assessment-only screening authority, non-authoritative Line/Case status, assumption precedence, physical-distance authority and `designAuthority=false` are preserved.

### A4 Independent validation — 18/20
Controlled generator/readiness data execute through the registered Engineering API rather than direct kernel; native/browser execution remains NOT_RUN.

### A5 Minimal patch / merge readiness — 19/20
Patch remains five files after live-main reconciliation and owner has authorized merge; one point withheld because runtime execution remains unavailable.

**Current written takeover score: 95/100; each section >=18/20. Runtime qualification remains NOT_RUN where not executed.**

## History

- 2026-08-15 — branch created from `main@b13797d...`; source fix and exact bridge regression implemented.
- 2026-08-15 — draft PR503 opened.
- 2026-08-15 — hosted AIV/Topology jobs repeatedly returned zero steps with `runner_id=0`; classified NOT_RUN / INFRASTRUCTURE_BLOCKED.
- 2026-08-15 — owner explicitly authorized merge.
- 2026-08-15 — live main had advanced via PR499 to `2a80e0aac...`; non-overlap verified and PR503 reconciled to `457d0bea...` with 9 ahead / 0 behind.
