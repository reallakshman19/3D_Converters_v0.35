# WIP-vib-t1-ident-01 — governed T1 identification producer

```text
ISSUE = #573
BRANCH = agent/vib-t1-ident-573-governed-producer
STACK_BASE = PR #572 head d54eab7be75d55d3fb0226b0aa5d5dc893d2ed72
MAIN_AT_START = 24080a49647c7802ff8ab496ccd37421b8d53b68
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_T1_IDENTIFICATION_PRODUCER
APPENDIX_A_COMMENT = 5312289150
APPENDIX_A_SCORE = 97/100
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
```

## Mission

Create one governed producer for the expected vibration mechanism universe plus explicit provenance-bearing identification evidence, then feed that bundle into the #572 coverage/completeness seam so production callers cannot choose a partial universe.

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

## Current failure

#572 production orchestration accepts `context.coverage.expectedMechanismIds`. The low-level coverage contract is correct for a supplied universe, but a production caller can define that universe. This WIP replaces the production seam with a registry-derived universe.

## Planned files

```text
NEW  converters/vibration/mechanisms/registry.js
NEW  converters/vibration/mechanisms/identification-producer.js
NEW  tests/vibration-mechanism-identification-producer.test.mjs
EDIT converters/vibration/mechanisms/index.js
EDIT tabs/vibration-integrity-mechanisms.js
EDIT tests/vibration-integrity-mechanism-matrix.test.mjs
```

Existing files require exact pre-edit backup before mutation.

## Validation ledger

```text
PASS     live main grounding
PASS     dependency PR #572 exact head grounding
PASS     Appendix A 97/100
NOT_RUN  producer tests — implementation not present yet
NOT_RUN  native matrix regressions
NOT_RUN  full repository suites
```

## Primary falsifier

If `buildVibrationMechanismMatrixRow()` can still report family `COMPLETE` by accepting a caller-selected partial expected mechanism universe, the implementation fails.

## Highest risk

Do not turn the registry into an applicability engine. It defines IDs only; explicit records decide `REQUIRED | NOT_APPLICABLE | UNRESOLVED`.

## EXACT_NEXT_ACTION

Add the protective VIB-T1 producer test before production implementation, then create the registry and producer. Do not edit matrix/index until exact pre-edit backups are committed.