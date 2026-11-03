# WIP-vib-t1-evidence-01 — explicit T1 identification authoring / scope custody

```text
ISSUE = #575
BRANCH = agent/vib-t1-evidence-575-authoring-scope
STACK_BASE = PR #574 head 1beaeb0675168162de1b94e89e65fc5d68442318
MAIN_AT_START = 24080a49647c7802ff8ab496ccd37421b8d53b68
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_T1_EVIDENCE_AUTHORING
APPENDIX_A_COMMENT = 5312422599
APPENDIX_A_SCORE = 98/100
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
```

## Mission

Create a separate explicit mechanism-identification authoring surface and exact-scope resolver, then feed only READY evidence for the current `{line, caseId, canonicalId}` into PR #574's governed identification producer.

## Protected invariants

```text
PROJECT_IDENTIFICATION_EVIDENCE != CONTROLLED_SOURCE_AUTHORITY
SOURCE_ID_TEXT != SOURCE_QUALIFICATION
SCOPE_A_EVIDENCE != SCOPE_B_EVIDENCE
READY_IDENTIFICATION != ASSESSMENT_COMPLETE
USER_ENGINEERING_DATA != T1_IDENTIFICATION_DATA
AssessmentCompleteness.COMPLETE != EI_MAIN_LINE_AGGREGATE_ESTABLISHED
```

No automatic EI T1 rules, mechanism-to-unit defaults, numerical method changes, benchmark/tolerance edits, authority promotion, Product Freeze, aggregation, workflow, runtime/writer/canvas, or PR #546 technical work.

## Live failure

PR #574 governs the mechanism universe but current product state has no mechanism-identification authoring table. `tabs/vibration-integrity-view.js` therefore supplies no `mechanismIdentifications` to `buildVibrationMechanismMatrixRow()`.

A future multi-scope authoring table must not be passed wholesale: #574's matrix trusts the explicit evidence array supplied by the caller. Exact scope filtering belongs in this authoring/custody seam.

## Planned files

```text
NEW  tabs/vibration-integrity-identification-model.js
NEW  tabs/vibration-integrity-identification-view.js
NEW  tests/vibration-integrity-identification-authoring.test.mjs
EDIT tabs/vibration-integrity-user-data-shell.js
EDIT tabs/vibration-integrity-ui-contract.js
EDIT tabs/vibration-integrity-view.js
```

Existing files require exact pre-edit backup before mutation.

## Validation ledger

```text
PASS     live main grounding
PASS     dependency PR #574 exact head grounding
PASS     Appendix A 98/100
NOT_RUN  authoring test — implementation not present yet
NOT_RUN  native exact-checkout integration tests
NOT_RUN  full repository suites
NOT_RUN  browser
```

## Primary falsifier

Create a READY identification row for scope A. Resolve/render scope B. If any A evidence reaches B's `mechanismIdentificationBundle`, the implementation fails.

## Highest risk

Do not treat a convenience selection, user-entered source ID, or static catalogue label as engineering applicability/source authority. All engineering selections remain explicit and scope-bound.

## EXACT_NEXT_ACTION

Commit the protective authoring/scope-isolation regression before implementation. Then add the pure authoring model and exact-scope resolver. Do not edit shell/UI/view until exact pre-edit backups are committed.