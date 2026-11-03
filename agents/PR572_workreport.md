# PR572 — VIB-COVERAGE-01 mechanism coverage / completeness

## Recovery control

```text
PR = #572
ISSUE = #570
BRANCH = agent/vib-coverage-570-completeness-contract
BASE_MAIN = 24080a49647c7802ff8ab496ccd37421b8d53b68
LATEST_ENGINEERING_CHANGE = 402512b75556cac640fc56bf4de7392380acaa3c
HEAD_BEFORE_REPORT_SYNC = 07e7f36e88fe8180e97483092c1d68549edefc35
APPENDIX_A_COMMENT = 5311508175
APPENDIX_A_SCORE = 94/100
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_COVERAGE_IMPLEMENTATION
PR_STATE = DRAFT_OPEN
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
```

## Mission

Implement the bounded #570 truth layer:

```text
MechanismIdentification
        -> RequiredAssessmentSet
        -> MechanismCoverage
        -> AssessmentCompleteness
        -> facility mechanism-matrix projection
        -> truthful UI projection
```

A valid partial mechanism result, partial identification list, stale result, candidate-only result, FIT row state, or static UI catalogue label must never masquerade as a complete vibration assessment.

**EI main-line LOF aggregation is not implemented in this PR.**

## Core invariant

```text
FIT ROW CALCULATED
!= mechanism identified
!= identification universe complete
!= required assessment complete
!= family AssessmentCompleteness.COMPLETE
!= EI main-line aggregate established
```

## Pure coverage contract

`converters/vibration/mechanisms/coverage.js` adds:

```text
VibrationMechanismIdentification.v1
RequiredAssessmentSet.v1
MechanismCoverage.v1
AssessmentCompleteness.v1
```

Identification disposition:

```text
REQUIRED | NOT_APPLICABLE | UNRESOLVED
```

Completeness state:

```text
COMPLETE | INCOMPLETE | NOT_APPLICABLE
```

`knownMechanismIds` is the explicit expected mechanism universe for an evaluation. Every expected mechanism must have explicit identification evidence before identification can resolve. Missing categories are exposed as:

```text
missingIdentificationMechanismIds[]
MISSING_MECHANISM_IDENTIFICATION:<mechanismId>
```

The contract fails closed on unknown/duplicate expected IDs, duplicate or contradictory identification, duplicate required-assessment identity, malformed/schema-forged identification evidence, malformed assessment-set identity/cardinality/item scope, missing/zero assessment sets, stale/unrun/failed evidence and insufficient qualification.

Default required qualification is `SCREENING`. A Screening requirement is satisfied only by current `IMPLEMENTED_SCREENING` / `qualification.effective=SCREENING` evidence. Candidate Mechanical/SBC evidence cannot satisfy it simply because a numerical result exists.

## Facility matrix projection

`tabs/vibration-integrity-mechanisms.js` now returns:

```text
requiredAssessmentSet
mechanismCoverage
assessmentCompleteness
```

from an optional explicit `context.coverage` bundle:

```text
expectedMechanismIds
identifications
assessmentSets[]  // optional additional qualified mechanism sets
```

Safety boundaries:

1. no coverage bundle -> deterministic `INCOMPLETE`;
2. static `VIBRATION_INTEGRITY_MECHANISMS` catalogue is not identification authority;
3. zero-cardinality static/unavailable sets are not positive coverage evidence;
4. FIT/Mechanical/SBC sets participate only when explicitly expected;
5. independently supplied qualified sets can represent mechanisms such as current AIV without trusting stale catalogue implementation text;
6. `screeningGoverning`, `candidateGoverning`, retained governing fields and `fullScreeningGoverningEstablished=false` remain unchanged;
7. no universal vibration score or EI main-line aggregate is created.

## UI truthfulness repair

The existing facility FIT register already exposes `row.completenessStatus`, but its source contract proves it means only:

```text
CALCULATED
DATA_INCOMPLETE
CALCULATION_FAILED
UNKNOWN
```

for the **FIT facility row**.

It is not cross-mechanism assessment completeness.

`tabs/vibration-integrity-view.js` now makes that distinction explicit:

```text
old visible heading/filter: Completeness
new visible heading/filter: FIT row state
new separate column:        Assessment completeness
```

The new family column is populated from:

```text
matrix.assessmentCompleteness
```

not `row.completenessStatus`.

The live tab currently has no governed mechanism-identification bundle in state. The view therefore does not invent one and does not consume static UI catalogue data as authority. Until a governed upstream provider exists, the visible family column remains fail-closed:

```text
INCOMPLETE
IDENTIFICATION_EVIDENCE_MISSING
```

The authority banner also states that assessment completeness remains incomplete until governed mechanism-identification evidence is supplied.

## Defects found and repaired during self-review

1. current results could interfere with absent-identification handling;
2. an intermediate new JS state exceeded the repository `<300 physical lines` rule;
3. a partial identification universe could resolve `COMPLETE`;
4. schema-labelled forged identification could bypass normalization;
5. malformed assessment-set identity/cardinality/item scope could be trusted;
6. facility integration could have used the stale static mechanism catalogue as authority;
7. the visible generic `Completeness` column could make FIT `CALCULATED` look like complete vibration coverage.

All seven paths are now fail-closed or explicitly separated.

## Changed-file ledger

Production / projection:

```text
converters/vibration/mechanisms/coverage.js
converters/vibration/mechanisms/index.js
tabs/vibration-integrity-mechanisms.js
tabs/vibration-integrity-view.js
```

Tests:

```text
tests/vibration-mechanism-coverage.test.mjs
tests/vibration-mechanism-coverage-missing-identification.test.mjs
tests/vibration-integrity-mechanism-matrix.test.mjs
tests/vibration-integrity-assessment-completeness-view.test.mjs
```

Handoff:

```text
agents/WIP-vib-coverage-570_workreport.md
agents/PR572_workreport.md
```

Exact pre-edit custody is retained under:

```text
.backups/connector-20260817-vib-coverage-570/
```

including the mechanism index, coverage-contract states, matrix source/test, view source, static tab test and prior PR572 report states.

No `.github/workflows/*`, mechanism numerical kernel, benchmark expected value/tolerance, Product Freeze artifact, T2.9 technical file, or PR #546 Type-3 source/freeze technical file is changed.

## Falsification coverage

Pure contract tests include:

```text
no identification -> INCOMPLETE
current result cannot replace identification
partial expected universe -> INCOMPLETE
required missing / NOT_IMPLEMENTED / stale -> INCOMPLETE
candidate-only under Screening requirement -> INCOMPLETE
explicit N/A distinct from missing
unresolved identification -> INCOMPLETE
all expected required current Screening -> COMPLETE
all expected explicit N/A -> NOT_APPLICABLE
zero cardinality != N/A
unknown/duplicate/contradictory identities -> hard fail
forged identification -> hard fail
malformed assessment set -> hard fail
```

Facility matrix regression source includes:

```text
no governed coverage bundle -> INCOMPLETE
FIT-only explicit coverage can be COMPLETE while family aggregate remains unestablished
external qualified AIV set can satisfy coverage despite stale static AIV catalogue text
partial FIT+AIV identification -> INCOMPLETE
Mechanical candidate cannot satisfy required Screening coverage
```

UI truthfulness regression includes:

```text
FIT register completenessStatus is FIT-row projection only
visible FIT column says FIT row state
separate visible Assessment completeness column exists
family column uses matrix.assessmentCompleteness
old generic Completeness heading/filter is forbidden
no state.coverage authority injection exists in the view
```

## Validation ledger

```text
STATUS   OBSERVATION                                                        ORACLE
PASS     Appendix A 94/100 completed before mutation                        #570 comment 5311508175
PASS     pure coverage reconstructed behavioral suite                       19/19, Node v22.16.0
PASS     UI truthfulness reconstructed source suite                          2/2, Node
PASS     modified vibration-integrity-view.js syntax                        node --check
PASS     new UI truthfulness test < 300 physical lines                      35 lines
PASS     coverage.js / mechanism-matrix new-JS constraints preserved        exact branch probes
PASS     existing governing LOF fields remain separate from completeness    source inspection
NOT_RUN  native exact-checkout mechanism-matrix tests                       private checkout unavailable
NOT_RUN  native exact-checkout UI/static suite                              private checkout unavailable
NOT_RUN  full repository-native VIB/FIT/AIV suites                          private checkout unavailable
NOT_RUN  browser                                                            not executed here
```

No `NOT_RUN` item is represented as PASS.

## Active overlap / protected scope

```text
PR #539/#540 = SAFE; their FIT adapter + engineering console/family UI paths do not overlap this Vibration Integrity view/matrix slice
PR #546      = STRICT NON-ABSORPTION; no Type-3 source/freeze technical work performed
#513         = no AIV Product Freeze work absorbed
#545         = no T2.9 numerical/source work absorbed
```

Do not add EI aggregation, a universal vibration score, automatic T1 applicability rules, numerical method changes, benchmark/tolerance changes, authority promotion, Product Freeze changes, runtime/writer/canvas ownership changes, workflow edits, or PR #546 technical changes to this PR.

## Remaining dependency

The authoritative producer of the facility coverage bundle does not exist yet. A later governed T1/identification workflow must supply the expected mechanism universe and explicit identification records. Until then:

```text
Assessment completeness = INCOMPLETE
```

Static UI catalogue text must not be substituted for that producer.

## EXACT_NEXT_ACTION

On a native private checkout, execute the focused coverage, mechanism-matrix and UI truthfulness tests plus relevant existing vibration regressions. Retain `NOT_RUN` for anything not actually executed. Do not begin EI main-line aggregation in this PR and do not merge without explicit Owner authorization.
