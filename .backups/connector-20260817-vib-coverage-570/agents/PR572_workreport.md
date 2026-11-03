# PR572 — VIB-COVERAGE-01 mechanism coverage / completeness

## Recovery control

```text
PR = #572
ISSUE = #570
BRANCH = agent/vib-coverage-570-completeness-contract
BASE_MAIN = 24080a49647c7802ff8ab496ccd37421b8d53b68
IMPLEMENTATION_HEAD_BEFORE_PR_REPORT = 6aa4ca8b95db0f03b8f22fa388458cd3c5c48e62
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_COVERAGE_IMPLEMENTATION
APPENDIX_A_COMMENT = 5311508175
APPENDIX_A_SCORE = 94/100
PR_STATE = DRAFT_OPEN
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
```

## Mission

Deliver the first fail-closed #570 slice only:

```text
MechanismIdentification
        -> RequiredAssessmentSet
        -> MechanismCoverage
        -> AssessmentCompleteness
```

so a valid partial mechanism result is never sufficient evidence for a complete vibration assessment.

EI main-line LOF aggregation is deliberately not part of this PR.

## Current implementation

### Identification contract

`VibrationMechanismIdentification.v1` requires explicit evidence and one disposition:

```text
REQUIRED
NOT_APPLICABLE
UNRESOLVED
```

`NOT_APPLICABLE` is explicit evidence, never inferred from an absent/zero assessment. This PR does not implement automatic EI T1 mechanism-selection logic.

### Required-assessment contract

`RequiredAssessmentSet.v1` derives deterministic assessment identities from the existing mechanism assessment-set identity contract. It fails closed on:

```text
unknown mechanism ID
duplicate identification
contradictory identification
malformed identification evidence
```

No identification evidence is represented as `identificationState=MISSING` and can never produce complete status.

### Coverage contract

`MechanismCoverage.v1` distinguishes:

```text
MISSING_ASSESSMENT_SET
ZERO_CARDINALITY_NOT_APPLICABLE_NOT_PROVEN
NOT_IMPLEMENTED
REQUIRED_ASSESSMENT_REPORTED_NOT_APPLICABLE
FAILED_OR_REVIEW_REQUIRED
STALE_RESULT
APPLICABILITY_UNKNOWN
APPLICABLE_INCOMPLETE
NOT_EVALUATED
READY_OR_NOT_EXECUTED
CANDIDATE_OR_UNQUALIFIED_RESULT
CURRENT_REQUIRED_AUTHORITY_EVIDENCE
```

### Completeness contract

`AssessmentCompleteness.v1` exposes:

```text
COMPLETE
INCOMPLETE
NOT_APPLICABLE
```

plus required/complete/incomplete/N/A/unresolved counts, missing required assessment IDs and reasons.

## Authority invariants

```text
REQUIRED != IMPLEMENTED
IMPLEMENTED != QUALIFIED
QUALIFIED != CURRENT_RESULT
CURRENT_RESULT != COMPLETE_FAMILY_ASSESSMENT
SCREENING != DESIGN
```

Default required qualification for `REQUIRED` identification is `SCREENING`.

A Screening requirement is satisfied only by current mechanism assessment items with:

```text
implementationState = IMPLEMENTED_SCREENING
assessmentState = CALCULATED
resultState = CURRENT_RESULT
qualification.effective = SCREENING
```

Candidate-only Mechanical/SBC-style evidence therefore remains incomplete under a Screening requirement.

An explicit weaker `CURRENT_RESULT` requirement may accept current candidate evidence. That is a coverage requirement only and does not promote engineering/screening/design authority.

## Critical defect found and repaired during implementation

Initial edge behavior retained an empty internal known-mechanism list when identification records were absent. Existing assessment sets could therefore cause an unknown-mechanism exception instead of the required deterministic `INCOMPLETE` result.

Repair:

```text
no identification + known mechanism registry + existing current results
-> identificationState=MISSING
-> INCOMPLETE / IDENTIFICATION_EVIDENCE_MISSING
```

Permanent regression added in:

```text
tests/vibration-mechanism-coverage-missing-identification.test.mjs
```

A subsequent post-PR check found the edge fix had pushed the new JS file over the repository `<300 physical lines` limit. Formatting only was tightened after exact backup; line 300 is now absent.

## Changed-file ledger

Production/API:

```text
converters/vibration/mechanisms/coverage.js
converters/vibration/mechanisms/index.js
```

Tests:

```text
tests/vibration-mechanism-coverage.test.mjs
tests/vibration-mechanism-coverage-missing-identification.test.mjs
```

Handoff:

```text
agents/WIP-vib-coverage-570_workreport.md
agents/PR572_workreport.md
```

Exact connector backup custody:

```text
.backups/connector-20260817-vib-coverage-570/converters/vibration/mechanisms/index.js
.backups/connector-20260817-vib-coverage-570/converters/vibration/mechanisms/coverage.js
.backups/connector-20260817-vib-coverage-570/converters/vibration/mechanisms/coverage-after-edge.js
```

No path under `.github/workflows/`, numerical mechanism kernels, benchmark expected data, AIV Product Freeze, T2.9 numerical/source implementation, or PR #546 technical scope is changed.

## Existing-file custody

`index.js` was copied exactly to connector backup before edit.

`coverage.js` was a new PR file. Before each subsequent edit after creation, its then-current content was copied to the connector backup area because the repository backup CLI is unavailable in this connector-only environment.

## Validation ledger

```text
STATUS  OBSERVATION                                                     ORACLE
PASS    main remains 24080a49647c7802ff8ab496ccd37421b8d53b68         live GitHub main ref
PASS    branch merge base is exact current main                         GitHub compare
PASS    Appendix A 94/100 completed before mutation                     #570 comment 5311508175
PASS    exact branch coverage.js has no physical line 300               GitHub file line probe
PASS    public mechanism index exports coverage contract                branch source inspection
PASS    reconstructed Node syntax for coverage/index/focused tests      Node v22.16.0 behavioral seam
PASS    reconstructed focused behavioral suite                          16/16
NOT_RUN full native private-repository VIB/FIT/AIV suites               no authenticated private checkout in runtime
NOT_RUN browser                                                          not required for pure contract slice
```

### Validation classification

The 16/16 execution used a locally reconstructed behavioral seam based on the current repository `VibrationMechanismAssessmentItem/Set` contract and this PR's coverage behavior. It is supporting executable evidence, not a claim that an exact full private checkout was executed.

No `NOT_RUN` item is represented as PASS.

## Falsification coverage

Permanent focused source tests exercise:

```text
no identification evidence -> INCOMPLETE
current mechanism result cannot substitute for identification
required missing -> INCOMPLETE
required NOT_IMPLEMENTED -> INCOMPLETE
required stale -> INCOMPLETE
candidate-only under Screening requirement -> INCOMPLETE
explicit N/A distinct from missing
unresolved identification -> INCOMPLETE
all required current Screening -> COMPLETE
all explicit N/A -> NOT_APPLICABLE
zero assessment cardinality != N/A
duplicate identification -> hard fail
contradictory identification -> hard fail
unknown mechanism -> hard fail
deterministic identity reacts to governing truth changes
coverage core does not contain mechanism numerical rules
```

## Active overlap / coordination

```text
PR #539/#540 = SAFE for this PR; FIT authority/UI proposal scope only
PR #546      = STRICT NON-ABSORPTION BOUNDARY; no Type-3 source/freeze technical work performed
#513         = no AIV Product Freeze work absorbed
#545         = no T2.9 numerical/source work absorbed
```

## Protected non-goals

Do not add to this PR:

```text
EI main-line LOF aggregation
universal vibration score
T1 automatic applicability rules
FIT/AIV/Mechanical/SBC numerical changes
benchmark/tolerance changes
screening/design/code authority promotion
Product Freeze changes
runtime/writer/canvas ownership changes
workflow changes
PR #546 technical changes
```

## Highest risk

The main residual architectural risk is choosing the authoritative provider of `knownMechanismIds` and explicit identification evidence when this pure contract is integrated into facility orchestration. This PR intentionally does not solve that by inventing a static UI catalogue or T1 rules. The next integration must bind those inputs to governed machine evidence and remain fail closed if that evidence is unavailable.

## Current hypothesis / falsifier

Hypothesis: this pure layer can be integrated without changing numerical mechanism kernels or result authority.

Falsifier: any facility integration that can produce `COMPLETE` without explicit identification evidence, or that satisfies a Screening requirement using candidate/stale/zero-cardinality evidence, must fail review.

## EXACT_NEXT_ACTION

Review PR #572 final diff and hosted check state. On a native private checkout, run the two focused coverage tests and relevant existing vibration mechanism regressions. If exact-head execution is unavailable, retain `NOT_RUN`; do not weaken the contract. Do not begin EI aggregation in this PR and do not merge without explicit Owner authorization.