# PR572 — VIB-COVERAGE-01 mechanism coverage / completeness

## Recovery control

```text
PR = #572
ISSUE = #570
BRANCH = agent/vib-coverage-570-completeness-contract
BASE_MAIN = 24080a49647c7802ff8ab496ccd37421b8d53b68
LATEST_ENGINEERING_CHANGE = c69cedf4f0266be3a6e0655697d9966318d08cb3
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_COVERAGE_IMPLEMENTATION
APPENDIX_A_COMMENT = 5311508175
APPENDIX_A_SCORE = 94/100
PR_STATE = DRAFT_OPEN
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
```

## Mission

Implement the #570 coverage/completeness slice without introducing EI aggregation:

```text
MechanismIdentification
        -> RequiredAssessmentSet
        -> MechanismCoverage
        -> AssessmentCompleteness
        -> facility matrix projection
```

A partial numerical result, partial identification list, candidate-only result, stale result, or static UI implementation label must not masquerade as complete vibration coverage.

## Current contract

`VibrationMechanismIdentification.v1` requires explicit evidence and:

```text
REQUIRED | NOT_APPLICABLE | UNRESOLVED
```

No automatic EI T1 rules are introduced.

`knownMechanismIds` is the caller-supplied expected mechanism universe for the evaluation. Every expected mechanism must have explicit identification before the identification set is resolved. Missing categories remain machine-visible:

```text
missingIdentificationMechanismIds[]
MISSING_MECHANISM_IDENTIFICATION:<mechanismId>
```

`RequiredAssessmentSet.v1` fails closed on unknown/duplicate expected IDs, duplicate or contradictory identification, duplicate required-assessment identity, and malformed identification evidence. Schema-labelled objects are revalidated through the factory.

`MechanismCoverage.v1` distinguishes missing, zero-cardinality, not-implemented, stale, failed/review-required, unresolved applicability, unrun/ready, candidate/unqualified and current required-authority evidence. Assessment sets are rechecked for deterministic identity, cardinality/item consistency, item schema, mechanism identity and scope identity.

`AssessmentCompleteness.v1` exposes only:

```text
COMPLETE | INCOMPLETE | NOT_APPLICABLE
```

plus required/complete/incomplete/N/A/unresolved/missing-identification counts and reasons.

## Facility matrix integration

`tabs/vibration-integrity-mechanisms.js` now projects:

```text
requiredAssessmentSet
mechanismCoverage
assessmentCompleteness
```

from an explicit optional `context.coverage` bundle:

```text
expectedMechanismIds
identifications
assessmentSets[]   // optional additional qualified mechanism sets
```

Important boundaries:

1. No coverage bundle -> deterministic `INCOMPLETE`; current FIT/other results cannot substitute for identification evidence.
2. The static `VIBRATION_INTEGRITY_MECHANISMS` catalogue is **not** used as the expected mechanism universe.
3. Zero-cardinality static/unavailable sets are not promoted into coverage evidence.
4. Existing non-zero FIT/Mechanical/SBC assessment sets may participate only when their mechanism ID is explicitly expected.
5. Additional externally qualified assessment sets allow mechanisms such as current AIV to participate without trusting the stale static AIV `NOT_IMPLEMENTED` catalogue label.
6. Duplicate/malformed additional evidence still fails in the pure coverage contract.
7. Existing `screeningGoverning`, `candidateGoverning`, retained governing fields and `fullScreeningGoverningEstablished=false` remain unchanged. **No EI main-line aggregate is created.**

## Authority invariants

```text
REQUIRED != IMPLEMENTED
IMPLEMENTED != QUALIFIED
QUALIFIED != CURRENT_RESULT
CURRENT_RESULT != COMPLETE_FAMILY_ASSESSMENT
SCREENING != DESIGN
COVERAGE COMPLETE != EI MAIN-LINE AGGREGATE ESTABLISHED
```

Default required qualification is `SCREENING`, requiring current `IMPLEMENTED_SCREENING` / `qualification.effective=SCREENING` evidence. Candidate Mechanical/SBC evidence cannot satisfy it. An explicit weaker `CURRENT_RESULT` coverage requirement may accept a current candidate result but does not promote authority.

## Defects found and repaired

1. Current results could not safely coexist with absent identification evidence; fixed to deterministic `INCOMPLETE`.
2. Intermediate `coverage.js` exceeded the `<300` new-JS limit; tightened after exact backup.
3. Partial identification universe could resolve `COMPLETE`; fixed by explicit expected universe + missing-category reasons.
4. Schema-string trust could bypass identification validation; fixed by unconditional normalization.
5. Malformed assessment-set identity/cardinality/item scope could satisfy coverage; now rejected.
6. Facility integration could have been tempted to use the stale static catalogue as mechanism authority; instead the matrix consumes an explicit coverage bundle and can accept independent AIV assessment-set evidence.

## Changed-file ledger

Production / projection:

```text
converters/vibration/mechanisms/coverage.js
converters/vibration/mechanisms/index.js
tabs/vibration-integrity-mechanisms.js
```

Tests:

```text
tests/vibration-mechanism-coverage.test.mjs
tests/vibration-mechanism-coverage-missing-identification.test.mjs
tests/vibration-integrity-mechanism-matrix.test.mjs
```

Handoff:

```text
agents/WIP-vib-coverage-570_workreport.md
agents/PR572_workreport.md
```

Exact pre-edit copies are retained under `.backups/connector-20260817-vib-coverage-570/`, including `index.js`, coverage-contract states, mechanism-matrix source/test, primary coverage test and report states.

No numerical mechanism kernel, benchmark expected data/tolerance, Product Freeze artifact, `.github/workflows/*`, T2.9 technical file, or PR #546 technical SBC Type-3 file is changed.

## Falsification coverage

Pure coverage tests include:

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
unknown/duplicate/contradictory IDs -> hard fail
universe changes deterministic identity
forged schema-labelled identification -> hard fail
malformed assessment set -> hard fail
no mechanism numerical rules in coverage core
```

Facility matrix regressions added to source prove the intended contract:

```text
no governed coverage bundle -> INCOMPLETE
FIT-only explicit required coverage may be COMPLETE while family aggregate remains unestablished
external qualified AIV set may satisfy coverage despite stale static AIV catalogue label
partial FIT+AIV identification remains INCOMPLETE
Mechanical candidate cannot satisfy required Screening coverage
```

## Validation ledger

```text
STATUS   OBSERVATION                                                        ORACLE
PASS     base/merge-base = main@24080a49647c7802ff8ab496ccd37421b8d53b68  live GitHub refs
PASS     Appendix A 94/100 completed before mutation                        #570 comment 5311508175
PASS     coverage.js has no physical line 300                               exact branch line probe
PASS     mechanism matrix source has no physical line 300                   exact branch line probe
PASS     primary coverage test has no physical line 300                     exact branch line probe
PASS     mechanism matrix test has no physical line 300                     exact branch line probe
PASS     public mechanism index exports coverage contract                   source inspection
PASS     reconstructed pure coverage behavioral suite                       19/19, Node v22.16.0
PASS     final diff inspection preserves existing governing fields          PR patch inspection
NOT_RUN  native exact-checkout mechanism-matrix test suite                  private checkout unavailable
NOT_RUN  full repository-native VIB/FIT/AIV suites                          private checkout unavailable
NOT_RUN  hosted Actions as product validation                               zero-step runner/budget pattern
NOT_RUN  browser                                                            no UI rendering change in this slice
```

The 19/19 execution is supporting executable evidence from a reconstructed pure contract seam, not a full exact-checkout repository pass. The newly added matrix integration tests have **not** been executed in a native checkout in this environment and are recorded `NOT_RUN`.

Hosted Actions previously inspected on #572 showed `runner_id=0` and `steps=[]`; any final-head run must be inspected separately and classified by execution evidence rather than its display label.

## Active overlap / protected scope

```text
PR #539/#540 = SAFE; changed files are FIT adapter + engineering console/family UI, not this matrix path
PR #546      = STRICT NON-ABSORPTION; no Type-3 source/freeze technical work
#513         = no AIV Product Freeze work
#545         = no T2.9 numerical/source work
```

Do not add EI aggregation, universal vibration scoring, automatic T1 rules, numerical method changes, benchmark/tolerance changes, authority promotion, Product Freeze changes, runtime/writer/canvas ownership changes, workflow edits, or PR #546 technical work.

## Highest residual risk

The authoritative producer of the facility `context.coverage` bundle does not exist yet. The matrix is intentionally fail-closed until a governed T1/identification workflow supplies the expected mechanism universe and records. Static UI catalogue content must not be substituted for that producer.

## EXACT_NEXT_ACTION

On a native private checkout, run `tests/vibration-mechanism-coverage*.test.mjs`, `tests/vibration-integrity-mechanism-matrix.test.mjs`, and relevant existing FIT/Mechanical/SBC mechanism regressions. If unavailable, retain `NOT_RUN`. Inspect final-head Actions jobs for actual steps. Keep PR #572 draft and unmerged until Owner authorizes merge; do not begin EI main-line aggregation in this PR.