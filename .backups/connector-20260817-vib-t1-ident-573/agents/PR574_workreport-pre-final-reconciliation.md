# PR574 — VIB-T1-IDENT-01 governed mechanism universe / explicit identification producer

## Recovery control

```text
PR = #574
ISSUE = #573
BRANCH = agent/vib-t1-ident-573-governed-producer
STACK_BASE_PR = #572
STACK_BASE_BRANCH = agent/vib-coverage-570-completeness-contract
STACK_BASE_SHA = d54eab7be75d55d3fb0226b0aa5d5dc893d2ed72
MAIN_AT_IMPLEMENTATION = 24080a49647c7802ff8ab496ccd37421b8d53b68
IMPLEMENTATION_HEAD_BEFORE_PR_REPORT = 46fefda1dcdb66158b7afbbb60f75d881b7a0872
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_T1_IDENTIFICATION_PRODUCER
APPENDIX_A_COMMENT = 5312289150
APPENDIX_A_SCORE = 97/100
PR_STATE = DRAFT_OPEN
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
```

## Mission

Prevent a production caller from defining a partial mechanism universe and then obtaining family completeness against only that subset.

```text
GOVERNED MECHANISM REGISTRY
        +
EXPLICIT IDENTIFICATION EVIDENCE
        ↓
VibrationMechanismIdentificationBundle.v1
        ↓
#572 coverage / completeness
        ↓
facility AssessmentCompleteness
```

This PR is stacked on #572 because it consumes the coverage contract introduced there. It is not independently mergeable to `main` as an architectural unit until #572 lands or this delta is replayed.

## Root failure closed

#572's low-level coverage contract is correct for the universe it is given, but the facility integration still accepted:

```text
context.coverage.expectedMechanismIds
```

A caller could therefore choose `['fit']`, supply FIT identification/current Screening evidence, and make completeness truthful only for that caller-defined subset.

PR574 makes that production attack impossible:

```text
context.coverage != null
-> CALLER_DEFINED_COVERAGE_CONFIG_FORBIDDEN
```

Production callers may supply evidence, not the universe.

## Governed mechanism registry

`converters/vibration/mechanisms/registry.js` adds:

```text
VibrationMechanismRegistry.v1
revision = VIB-FAMILY-MECHANISMS-2026-08-17
registryAuthority = KNOWN_MECHANISM_UNIVERSE_ONLY
automaticApplicabilityRules = false
engineeringAuthority = NONE
screeningAuthority = NOT_AUTHORIZED
designAuthority = false
```

Registry IDs, in deterministic current-product order:

```text
fit
mechanicalExcitation
reciprocatingPulsation
rotatingStall
deadlegPulsation
corrugationPulsation
slugFlow
aiv
valveTransients
cavitationFlashing
thermowells
smallBoreConnections
```

The registry contains no applicability outcome, LOF, equation, coefficient, process threshold, or hidden default.

## Explicit identification producer

`converters/vibration/mechanisms/identification-producer.js` adds:

```text
VibrationMechanismIdentificationBundle.v1
```

It normalizes explicit evidence through #572 `createVibrationMechanismIdentification()` and derives the full expected universe from `VIBRATION_MECHANISM_IDS`.

Producer authority:

```text
identificationAuthority = EXPLICIT_EVIDENCE_ONLY
automaticApplicabilityRules = false
engineeringAuthority = NONE
screeningAuthority = NOT_AUTHORIZED
designAuthority = false
codeCompliance = false
```

Forbidden caller universe inputs:

```text
expectedMechanismIds
knownMechanismIds
registry
registryRevision
registryFingerprint
```

The producer also refuses blocker/value-shaped `VibrationUserEngineeringData` rows as T1 identification evidence. That existing data surface remains user/project value input, not mechanism-disposition authority.

## Facility integration

`tabs/vibration-integrity-mechanisms.js` now accepts for coverage only:

```text
context.mechanismIdentifications
context.coverageAssessmentSets
```

`coverageAssessmentSets` supplies assessment evidence only. It cannot alter the expected mechanism universe.

The returned matrix now carries:

```text
mechanismIdentificationBundle
requiredAssessmentSet
mechanismCoverage
assessmentCompleteness
```

while preserving:

```text
screeningGoverning
candidateGoverning
retainedScreeningGoverning
retainedCandidateGoverning
implementedGoverning
retainedImplementedGoverning
fullScreeningGoverningEstablished = false
```

No EI main-line aggregate is introduced.

## Static catalogue boundary

`VIBRATION_INTEGRITY_MECHANISMS` remains a UI/assessment projection containing labels and implementation presentation state, including historical/stale projection risk such as AIV.

Permanent regression now requires its mechanism IDs to mirror `VIBRATION_MECHANISM_IDS`, so drift is detected while the registry remains primary. The catalogue still does not decide `REQUIRED`, `NOT_APPLICABLE`, or `UNRESOLVED`.

## Changed-file ledger relative to #572

Production/API:

```text
converters/vibration/mechanisms/registry.js                         NEW
converters/vibration/mechanisms/identification-producer.js         NEW
converters/vibration/mechanisms/index.js                           EDIT
tabs/vibration-integrity-mechanisms.js                             EDIT
```

Tests:

```text
tests/vibration-mechanism-identification-producer.test.mjs         NEW
tests/vibration-integrity-mechanism-matrix.test.mjs                EDIT
```

Handoff:

```text
agents/WIP-vib-t1-ident-01_workreport.md
agents/PR574_workreport.md
```

Exact pre-edit/intermediate custody is under:

```text
.backups/connector-20260817-vib-t1-ident-573/
```

No `.github/workflows/*`, numerical mechanism kernel, benchmark expected data/tolerance, Product Freeze artifact, T2.9 numerical/source implementation, or PR #546 technical file is changed.

## Falsification coverage

Permanent source tests pin:

```text
VIB-T1-001 registry exact/unique family universe
VIB-T1-002 deterministic truth-sensitive registry fingerprint
VIB-T1-003 producer universe comes from registry
VIB-T1-004 caller universe override is forbidden
VIB-T1-005 no evidence -> full universe + INCOMPLETE downstream
VIB-T1-006 FIT-only evidence cannot shrink family universe
VIB-T1-007 explicit NOT_APPLICABLE requires evidence
VIB-T1-008 unknown mechanism fails closed
VIB-T1-009 duplicate/contradictory identification fails closed
VIB-T1-010 no numerical/automatic-applicability rules in registry/producer
VIB-T1-011 production matrix cannot reintroduce caller expectedMechanismIds
VIB-T1-013 producer grants no numerical authority
VIB-T1-014 user blocker/value rows cannot become T1 evidence
```

Matrix regressions additionally prove:

```text
catalogue IDs mirror governed registry IDs
no evidence -> INCOMPLETE against full registry universe
old context.coverage caller universe -> hard fail
FIT-only identification -> FIT can be covered but family stays INCOMPLETE
qualified external AIV evidence can cover AIV without trusting static AIV implementation text
Mechanical candidate cannot satisfy required Screening coverage
FIT/candidate governing semantics remain unchanged
stale current-governing behavior remains unchanged
```

Primary falsifier:

> If `buildVibrationMechanismMatrixRow()` can report family `COMPLETE` by accepting a caller-selected partial expected mechanism universe, PR574 fails.

## Validation ledger

```text
STATUS   OBSERVATION                                                        ORACLE
PASS     main = 24080a49647c7802ff8ab496ccd37421b8d53b68                  live GitHub main
PASS     #572 head = d54eab7be75d55d3fb0226b0aa5d5dc893d2ed72             live PR #572
PASS     stack merge base = exact #572 head / behind 0                      GitHub compare
PASS     Appendix A = 97/100 before mutation                                #573 comment 5312289150
PASS     registry.js <300 physical lines                                    GitHub line probe
PASS     identification-producer.js <300 physical lines                     GitHub line probe
PASS     producer test <300 physical lines                                  GitHub line probe
PASS     matrix source <300 physical lines                                  GitHub line probe
PASS     matrix test <300 physical lines                                    GitHub line probe
PASS     reconstructed producer syntax/focused behavior                     Node v22.16.0, 10/10
PASS     diff scope excludes workflows/numerics/benchmarks/freeze/#546 tech GitHub compare
NOT_RUN  native exact-checkout producer test                                private checkout unavailable
NOT_RUN  native exact-checkout matrix regressions                           private checkout unavailable
NOT_RUN  full repository-native VIB/FIT/AIV suites                          private checkout unavailable
NOT_RUN  browser                                                            no browser acceptance claimed
```

The 10/10 reconstructed execution used the authored registry/producer logic with the #572 identification-contract behavior. It is supporting executable evidence and is not represented as native exact-checkout PASS.

## Protected non-goals

Do not add to this PR:

```text
process-data automatic T1 rules
EI applicability thresholds from memory
FIT/AIV/Mechanical/SBC numerical changes
T2.8/T2.9/T4 numerical changes
benchmark expected values/tolerances
EI main-line aggregation
universal vibration score
screening/design/code authority promotion
Product Freeze changes
runtime/writer/canvas ownership changes
workflow changes
PR #546 technical work
```

## Remaining dependency

PR574 controls **who defines the universe**, but it deliberately does not create a user/project workflow for authoring the explicit identification records.

Until governed evidence marks every registry mechanism as `REQUIRED`, `NOT_APPLICABLE`, or `UNRESOLVED` for the appropriate assessment scope, the product must remain family `INCOMPLETE`.

That is a correct fail-closed state, not a reason to invent automatic applicability logic.

## Highest risk

A future UI or import path could accidentally turn convenience selections, user blocker rows, or static catalogue values into identification authority. Any such integration must feed this explicit-evidence producer and preserve source/provenance; it must not bypass it.

## EXACT_NEXT_ACTION

Re-query PR #574 mergeability after GitHub computes it, inspect exact-head workflow/status evidence, and reconcile review threads. Retain draft/unmerged. If native private checkout becomes available, execute `tests/vibration-mechanism-identification-producer.test.mjs` plus `tests/vibration-integrity-mechanism-matrix.test.mjs`; otherwise keep them `NOT_RUN`. Do not retarget to `main` before #572 lands/replay and do not merge without explicit Owner authorization.