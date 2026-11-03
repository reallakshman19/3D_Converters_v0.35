# WIP-vib-coverage-570 — Mechanism coverage / completeness

## Mission control

```text
ISSUE = #570 VIB-COVERAGE-01
CRITICALITY = ENGINEERING_CRITICAL
BRANCH = agent/vib-coverage-570-completeness-contract
BASE_MAIN = 24080a49647c7802ff8ab496ccd37421b8d53b68
IMPLEMENTATION_HEAD_BEFORE_REPORT = b0930a78ec26b9f2a51383d25c7331682639dac5
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_COVERAGE_IMPLEMENTATION
ISSUE_QUALIFICATION_COMMENT = 5311508175
APPENDIX_A = 94/100
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
```

## Single mission

Implement the first #570 slice only:

```text
explicit MechanismIdentification
        -> RequiredAssessmentSet
        -> MechanismCoverage
        -> AssessmentCompleteness
```

so missing, unresolved, stale, not-implemented or insufficient-authority mechanism evidence cannot silently become a complete vibration assessment.

This slice does not implement EI main-line LOF aggregation and does not infer T1 applicability from process data.

## Current live truth

- `main@24080a49647c7802ff8ab496ccd37421b8d53b68` contains merged generic Engineering Work Pack infrastructure and current AIV drift hardening.
- Existing `VibrationMechanismAssessmentItem.v1` / `VibrationMechanismAssessmentSet.v1` already distinguish implementation, assessment and result state.
- Existing zero assessment-set cardinality is explicit `ZERO`; it is not proof of non-applicability.
- Current FIT mechanism state is `IMPLEMENTED_SCREENING`.
- Current Mechanical and SBC mechanism paths are candidate-only, not authorized Screening evidence.
- The family UI has a static `fullScreeningGoverningEstablished=false` disclaimer, but there is no machine required-assessment/completeness contract.
- Static UI mechanism labels are not engineering identification authority.

## Appendix A disposition

Recorded on #570 before implementation:

```text
A1 Production Trace              19/20
A2 Current Failure Isolation     19/20
A3 Authority / Invariant         19/20
A4 Independent Validation        18/20
A5 Next-Commit / Minimal Patch   19/20
TOTAL                             94/100
NO_HARD_FAIL                     true
```

Disposition:

```text
QUALIFIED_FOR_VIB_COVERAGE_IMPLEMENTATION
```

## Scope lock

First slice changed files are new files only:

```text
converters/vibration/mechanisms/coverage.js
tests/vibration-mechanism-coverage.test.mjs
agents/WIP-vib-coverage-570_workreport.md
```

No existing production file has been edited yet. Therefore the existing-file backup rule has not been bypassed. Any later edit to `converters/vibration/mechanisms/index.js`, facility UI or another existing path requires exact pre-edit backup custody first.

Forbidden in this PR:

```text
T1 automatic applicability rules
EI main-line LOF aggregation
FIT/AIV/Mechanical/SBC numerical changes
benchmark expected-value/tolerance changes
screening/design/code authority promotion
Product Freeze state changes
runtime/writer/canvas ownership changes
.github/workflows/*
PR #546 technical SBC Type-3 source/freeze work
```

## Implemented pure contract

`converters/vibration/mechanisms/coverage.js` adds:

```text
VibrationMechanismIdentification.v1
RequiredAssessmentSet.v1
MechanismCoverage.v1
AssessmentCompleteness.v1
```

Identification disposition:

```text
REQUIRED
NOT_APPLICABLE
UNRESOLVED
```

Assessment completeness:

```text
COMPLETE
INCOMPLETE
NOT_APPLICABLE
```

Key fail-closed behavior:

- no identification evidence -> `INCOMPLETE`;
- unknown mechanism ID -> hard error;
- duplicate or contradictory identification -> hard error;
- required missing assessment set -> `INCOMPLETE`;
- zero cardinality -> `INCOMPLETE`, never implicit N/A;
- `NOT_IMPLEMENTED`, stale, failed/review-required, unresolved applicability, applicable-incomplete and unrun/ready evidence -> `INCOMPLETE`;
- candidate/current evidence cannot satisfy a required `SCREENING` assessment;
- explicit evidenced `NOT_APPLICABLE` remains separate from missing;
- only all current/qualified required coverage can produce `COMPLETE`;
- a weaker explicit `CURRENT_RESULT` requirement may accept current candidate evidence without promoting it to Screening.

The core imports only the existing assessment-contract seam. It contains no vibration equations, LOF constants, T1 rules or source-derived numerical values.

## Falsification tests

`tests/vibration-mechanism-coverage.test.mjs` currently covers:

```text
VIB-COV-001 missing identification cannot be COMPLETE
VIB-COV-002 required missing assessment -> INCOMPLETE
VIB-COV-003 required NOT_IMPLEMENTED -> INCOMPLETE
VIB-COV-004 stale result -> INCOMPLETE
VIB-COV-005 candidate-only cannot satisfy SCREENING
VIB-COV-006 explicit NOT_APPLICABLE distinct from missing
VIB-COV-007 unresolved identification blocks completeness
VIB-COV-008 all required current SCREENING -> COMPLETE
VIB-COV-009 all explicitly N/A -> NOT_APPLICABLE
VIB-COV-010 duplicate identification fails closed
VIB-COV-011 contradictory identification fails closed
VIB-COV-012 unknown mechanism fails closed
VIB-COV-013 deterministic identity changes with governing truth
VIB-COV-014 no mechanism numerical rules in coverage core
ZERO cardinality regression
explicit CURRENT_RESULT-vs-SCREENING authority separation
```

## Active overlap

```text
PR #539/#540 = SAFE for pure first slice; FIT authority/UI drafts, no new-file overlap
PR #546      = SAFE BY STRICT NON-ABSORPTION; no technical mutation permitted
#513/#545    = SAFE; no AIV Product Freeze or T2.9 numerical/source work
```

No open PR was found claiming the new coverage/completeness paths.

## Validation ledger

```text
STATUS   OBSERVATION                                         ORACLE
PASS     branch created from exact main                      GitHub branch ref
PASS     Appendix A 94/100 recorded before mutation          issue comment 5311508175
PASS     coverage.js is below 300 physical lines             branch source line boundary
PASS     coverage core source contains no intended equations source inspection
PASS     test source is below 300 physical lines              branch source line boundary
NOT_RUN  node --check coverage.js                            executable validation pending
NOT_RUN  node --check / node --test coverage regression       executable validation pending
NOT_RUN  repository-native broader VIB/FIT/AIV suites         no private checkout in runtime
NOT_RUN  browser                                              not required for pure first slice
```

No `NOT_RUN` item is represented as PASS.

## Current hypothesis / falsifier

Hypothesis: family completeness can be added as a pure layer over existing mechanism assessment sets without changing any mechanism calculator or authority state.

Falsifier: if empty identification evidence, a stale required result, zero cardinality, or candidate-only evidence under a Screening requirement can produce `COMPLETE`, stop and repair the contract before integration.

## Highest risk

Accidentally allowing an implementation/result-presence signal to stand in for engineering identification or required authority. The implementation therefore keeps identification evidence, mechanism execution state, result currency and required qualification as separate inputs.

## EXACT_NEXT_ACTION

Reconstruct the exact branch `contracts.js + coverage.js + coverage test` seam locally from connected GitHub source, run Node syntax/tests, repair any falsifier failures, then decide whether only the backed-up `mechanisms/index.js` export seam is required for this first PR. Do not add EI aggregation or UI authority semantics and do not merge.