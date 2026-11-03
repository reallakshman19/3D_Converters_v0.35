# PR572 — VIB-COVERAGE-01 mechanism coverage / completeness

## Recovery control

```text
PR = #572
ISSUE = #570
BRANCH = agent/vib-coverage-570-completeness-contract
BASE_MAIN = 24080a49647c7802ff8ab496ccd37421b8d53b68
IMPLEMENTATION_HEAD = cf4f0f60ef889da9c0de3a05cf9a642e0bcf454b
BRANCH_HEAD_BEFORE_THIS_REPORT_UPDATE = 985c7f73f333ec2ef8c8b9903dc196a6a24e2c0a
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_COVERAGE_IMPLEMENTATION
APPENDIX_A_COMMENT = 5311508175
APPENDIX_A_SCORE = 94/100
PR_STATE = DRAFT_OPEN
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
```

## Mission

Implement only:

```text
MechanismIdentification
        -> RequiredAssessmentSet
        -> MechanismCoverage
        -> AssessmentCompleteness
```

so a partial mechanism result or a partial mechanism-identification set can never masquerade as a complete vibration assessment.

EI main-line LOF aggregation remains out of scope.

## Current contract

### Identification

`VibrationMechanismIdentification.v1` requires explicit evidence plus:

```text
REQUIRED | NOT_APPLICABLE | UNRESOLVED
```

No automatic EI T1 applicability rules are introduced.

`knownMechanismIds` is treated as the expected mechanism universe for this evaluation. Every expected mechanism must have at least one explicit identification record before identification state may be resolved. Missing categories are machine-visible:

```text
missingIdentificationMechanismIds[]
MISSING_MECHANISM_IDENTIFICATION:<mechanismId>
```

Therefore this is impossible:

```text
expected = FIT + Mechanical
identification supplied = FIT only
FIT current Screening result exists
=> COMPLETE
```

The result is `INCOMPLETE` until Mechanical is explicitly `REQUIRED`, `NOT_APPLICABLE`, or `UNRESOLVED`.

### Required assessment

`RequiredAssessmentSet.v1` fails closed on:

```text
unknown mechanism ID
duplicate expected mechanism ID
duplicate identification identity
contradictory identification disposition
duplicate required assessment identity
malformed / schema-labelled forged identification evidence
```

All identification objects are normalized through the contract factory even if they already carry the expected schema string.

### Mechanism coverage

Coverage distinguishes:

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

Assessment sets are rechecked for deterministic set identity, cardinality/item consistency, item schema, mechanism identity and scope identity before they may satisfy coverage.

### Family completeness

`AssessmentCompleteness.v1` exposes only:

```text
COMPLETE
INCOMPLETE
NOT_APPLICABLE
```

plus required/complete/incomplete/N/A/unresolved/missing-identification counts, missing identification mechanism IDs, missing required assessment IDs and reasons.

## Authority invariants

```text
REQUIRED != IMPLEMENTED
IMPLEMENTED != QUALIFIED
QUALIFIED != CURRENT_RESULT
CURRENT_RESULT != COMPLETE_FAMILY_ASSESSMENT
SCREENING != DESIGN
```

Default required qualification is `SCREENING`. Such a requirement needs current items with:

```text
implementationState = IMPLEMENTED_SCREENING
assessmentState = CALCULATED
resultState = CURRENT_RESULT
qualification.effective = SCREENING
```

Candidate-only evidence cannot satisfy a Screening requirement. An explicit weaker `CURRENT_RESULT` coverage requirement may accept current candidate evidence but does not promote engineering/screening/design authority.

## Defects found and repaired during implementation

1. **Missing identification + existing result edge:** existing current results could previously encounter an empty known-ID map instead of deterministic `INCOMPLETE`. Fixed; current results cannot replace missing identification evidence.
2. **New-JS line limit:** an intermediate edge fix temporarily pushed `coverage.js` above the repository `<300 physical lines` rule. Formatting was tightened after exact backup; current source has no physical line 300.
3. **Partial identification universe:** a subset of expected mechanisms could previously resolve `COMPLETE`. Fixed by binding completeness to the expected mechanism universe and exposing missing identification categories.
4. **Schema-string trust:** a forged object carrying `VibrationMechanismIdentification.v1` could bypass factory validation. Fixed by unconditional normalization.
5. **Malformed assessment-set trust:** forged set identity/cardinality/item scope can no longer satisfy coverage.

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

Connector backup custody is under:

```text
.backups/connector-20260817-vib-coverage-570/
```

and includes exact pre-edit copies of `index.js`, each materially edited coverage-contract state, the primary coverage test before hardening, and this PR report before synchronization.

No `.github/workflows/*`, numerical mechanism kernel, benchmark expected data, Product Freeze artifact, T2.9 numerical/source file, or PR #546 technical file is changed.

## Validation ledger

```text
STATUS  OBSERVATION                                                       ORACLE
PASS    base/merge-base = main@24080a49647c7802ff8ab496ccd37421b8d53b68 live GitHub refs
PASS    Appendix A = 94/100 before mutation                               #570 comment 5311508175
PASS    current coverage.js has no physical line 300                      GitHub line probe
PASS    current primary coverage test has no physical line 300            GitHub line probe
PASS    mechanism index exports coverage contract                          branch source inspection
PASS    reconstructed Node syntax                                          Node v22.16.0 behavioral seam
PASS    reconstructed hardened behavioral suite                            19/19
NOT_RUN full native private-repository VIB/FIT/AIV suites                  private checkout unavailable
NOT_RUN hosted final-head workflow as product validation                   inspected run had runner_id=0 / steps=[]
NOT_RUN browser                                                            not required for pure contract slice
```

The 19/19 result is supporting executable evidence from a reconstructed behavioral seam using the current mechanism assessment contracts; it is not represented as a full exact-checkout repository pass.

Hosted Actions failure inspected on PR #572 had:

```text
runner_id = 0
steps = []
```

and is therefore `NOT_RUN / INFRASTRUCTURE_BLOCKED`, not product FAIL and not PASS.

## Falsification coverage

Permanent focused tests now include:

```text
no identification evidence -> INCOMPLETE
current result cannot replace identification
partial expected mechanism universe -> INCOMPLETE
required missing / NOT_IMPLEMENTED / stale -> INCOMPLETE
candidate-only under Screening requirement -> INCOMPLETE
explicit N/A distinct from missing
unresolved identification -> INCOMPLETE
all expected required current Screening -> COMPLETE
all expected mechanisms explicit N/A -> NOT_APPLICABLE
zero assessment cardinality != N/A
duplicate/contradictory identification -> hard fail
unknown/duplicate expected mechanism -> hard fail
identification-universe change changes deterministic identity
forged schema-labelled identification -> hard fail
malformed assessment set -> hard fail
coverage core contains no mechanism numerical rules
```

## Active overlap / protected scope

```text
PR #539/#540 = SAFE; FIT authority/UI proposal scope only
PR #546      = STRICT NON-ABSORPTION; no SBC Type-3 technical work performed
#513         = no AIV Product Freeze work absorbed
#545         = no T2.9 numerical/source work absorbed
```

Do not add EI aggregation, a universal vibration score, automatic T1 rules, numerical method changes, benchmark/tolerance changes, authority promotion, Product Freeze changes, runtime/writer/canvas ownership changes, workflow edits, or PR #546 technical changes to this PR.

## Highest residual risk

Facility integration must obtain the expected mechanism universe and identification records from governed machine evidence. Static UI catalogue text must not become the authority source. Until that upstream binding exists, absence or partial identification must remain fail closed.

## EXACT_NEXT_ACTION

Review PR #572 final diff and final-head check state. On a native private checkout, run both focused coverage tests plus existing vibration mechanism regressions. Retain `NOT_RUN` for anything not actually executed. Do not begin EI aggregation here and do not merge without explicit Owner authorization.