# WIP-vib-t1-ident-01 — governed T1 identification producer

```text
ISSUE = #573
BRANCH = agent/vib-t1-ident-573-governed-producer
STACK_BASE = PR #572 head d54eab7be75d55d3fb0226b0aa5d5dc893d2ed72
MAIN_AT_START_AND_RECHECK = 24080a49647c7802ff8ab496ccd37421b8d53b68
LATEST_ENGINEERING_HEAD_BEFORE_WIP_SYNC = 29a863de33d2ac1443c73536a69a7721f3ba5c17
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_T1_IDENTIFICATION_PRODUCER
APPENDIX_A_COMMENT = 5312289150
APPENDIX_A_SCORE = 97/100
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
```

## Mission

Create one governed producer for the expected vibration mechanism universe plus explicit provenance-bearing identification evidence, then feed that bundle into the #572 coverage/completeness seam so production callers cannot choose a partial universe.

## Implemented architecture

```text
VibrationMechanismRegistry.v1
  KNOWN_MECHANISM_UNIVERSE_ONLY
        +
explicit VibrationMechanismIdentification.v1 evidence
        ↓
VibrationMechanismIdentificationBundle.v1
        ↓
#572 evaluateVibrationCoverageAndCompleteness()
        ↓
facility matrix AssessmentCompleteness
```

Production orchestration now rejects the old caller-owned coverage object:

```text
context.coverage -> CALLER_DEFINED_COVERAGE_CONFIG_FORBIDDEN
```

and consumes only:

```text
context.mechanismIdentifications
context.coverageAssessmentSets   // supplemental assessment evidence only
```

The expected mechanism universe always comes from the governed registry. Supplemental assessment sets cannot change that universe.

## Governed registry

Current deterministic registry IDs:

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

Registry authority:

```text
registryAuthority = KNOWN_MECHANISM_UNIVERSE_ONLY
automaticApplicabilityRules = false
engineeringAuthority = NONE
screeningAuthority = NOT_AUTHORIZED
designAuthority = false
```

Registry membership never means REQUIRED, applicable, qualified, or authorized.

## Identification producer authority

```text
identificationAuthority = EXPLICIT_EVIDENCE_ONLY
automaticApplicabilityRules = false
engineeringAuthority = NONE
screeningAuthority = NOT_AUTHORIZED
designAuthority = false
codeCompliance = false
```

The producer rejects caller attempts to supply/override:

```text
expectedMechanismIds
knownMechanismIds
registry
registryRevision
registryFingerprint
```

It also rejects `VibrationUserEngineeringData` blocker/value-shaped rows as identification evidence.

## Protected invariants

```text
KNOWN_MECHANISM != REQUIRED
KNOWN_MECHANISM != APPLICABLE
EXPLICIT_IDENTIFICATION != METHOD_QUALIFICATION
PRODUCER_OUTPUT != SCREENING_OR_DESIGN_AUTHORITY
STATIC_UI_CATALOGUE != IDENTIFICATION_AUTHORITY
USER_ENGINEERING_DATA != IDENTIFICATION_AUTHORITY
AssessmentCompleteness.COMPLETE != EI_MAIN_LINE_AGGREGATE_ESTABLISHED
```

No automatic EI T1 rules, numerical method changes, benchmarks/tolerances, authority promotion, Product Freeze changes, workflow edits, aggregation, or PR #546 technical work.

## Changed-file ledger

```text
NEW  converters/vibration/mechanisms/registry.js
NEW  converters/vibration/mechanisms/identification-producer.js
NEW  tests/vibration-mechanism-identification-producer.test.mjs
NEW  agents/WIP-vib-t1-ident-01_workreport.md
EDIT converters/vibration/mechanisms/index.js
EDIT tabs/vibration-integrity-mechanisms.js
EDIT tests/vibration-integrity-mechanism-matrix.test.mjs
```

Exact pre-edit and intermediate backups are retained under:

```text
.backups/connector-20260817-vib-t1-ident-573/
```

## Falsification coverage

Permanent source tests now pin:

```text
registry contains all adopted IDs exactly once
registry fingerprint is deterministic/truth-sensitive
producer universe always registry-derived
caller universe override rejected
empty evidence -> full registry universe / downstream INCOMPLETE
FIT-only identification cannot shrink family universe
explicit N/A requires evidence
unknown / duplicate / contradictory identification fails closed
producer remains non-authorizing
blocker/value rows cannot become T1 evidence
registry/producer contain no numerical or automatic applicability rules
matrix cannot reintroduce config.expectedMechanismIds
static catalogue IDs mirror registry IDs while implementation labels remain separate projections
Mechanical candidate cannot satisfy required SCREENING coverage
existing FIT/candidate governing semantics remain unchanged
```

Primary falsifier remains:

> If `buildVibrationMechanismMatrixRow()` can report family `COMPLETE` by accepting a caller-selected partial expected mechanism universe, the implementation fails.

## Validation ledger

```text
PASS     main re-ground = 24080a49647c7802ff8ab496ccd37421b8d53b68
PASS     dependency #572 head remains d54eab7be75d55d3fb0226b0aa5d5dc893d2ed72
PASS     branch merge base = exact #572 head; behind = 0
PASS     Appendix A = 97/100 before mutation
PASS     registry.js < 300 physical lines
PASS     identification-producer.js < 300 physical lines
PASS     producer test < 300 physical lines
PASS     mechanism matrix source < 300 physical lines
PASS     matrix regression < 300 physical lines
PASS     reconstructed producer syntax / focused behavior seam = 10/10, Node v22.16.0
PASS     stacked diff has no workflow/numerical/benchmark/freeze/#546 technical paths
NOT_RUN  native exact-checkout producer test
NOT_RUN  native exact-checkout mechanism-matrix regressions
NOT_RUN  full repository-native VIB/FIT/AIV suites
NOT_RUN  browser
```

The 10/10 producer execution used a reconstructed seam with the authored registry/producer logic and the #572 identification contract behavior. It is supporting executable evidence, not a native exact-checkout repository PASS.

## Highest residual risk

The governed producer now controls the universe, but there is still no user/project workflow that creates the explicit identification records. Until such governed evidence exists, the product remains intentionally `INCOMPLETE`; this PR must not invent process-data applicability rules merely to clear that state.

## EXACT_NEXT_ACTION

Open a stacked draft PR with base `agent/vib-coverage-570-completeness-contract`, then create the PR-numbered workreport and inspect exact-head hosted execution. Do not retarget to `main` before #572 lands/replay, do not begin EI aggregation, and do not merge without explicit Owner authorization.