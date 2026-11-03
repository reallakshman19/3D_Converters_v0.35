# PR578 — VIB-BENCH-REG-01 family benchmark registry / VIB-BENCH-001 custody

## Recovery control

```text
PR = #578
ISSUE = #577
BRANCH = agent/vib-bench-reg-577-family-custody
BASE_MAIN = ab3184705e8d1f476de985e5dfc60a3051fdec3c
IMPLEMENTATION_HEAD_BEFORE_PR_REPORT = 0bf7dc194d47e8b13735260ed5d50046df5199f9
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_BENCHMARK_REGISTRY
APPENDIX_A_COMMENT = 5312733740
APPENDIX_A_SCORE = 98/100
PR_STATE = DRAFT_OPEN
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED_FOR_THIS_NEW_PR
```

## Mission

Close M3 of #429 by creating one family benchmark-custody registry and fail-closed `VIB-BENCH-001` evaluator before any M4 EI main-line aggregation implementation.

```text
VibrationMechanismRegistry.v1
 + active VIB Engineering Calculation capabilities
 + existing FIT/AIV benchmark custody
 -> VibrationBenchmarkRegistry.v1
 -> VibrationBenchmarkCompliance.v1
```

## Dependency boundary

```text
M1 identification                     MERGED
M2 coverage/completeness              MERGED
M3 benchmark registry                 THIS PR
M4 EI main-line aggregation           NOT IMPLEMENTED
```

No M4 code, `eiMainLineLOF`, cross-mechanism max, or aggregate result is introduced.

## Machine contract

`converters/vibration/benchmark-registry.js` exports:

```text
VIBRATION_BENCHMARK_REGISTRY_SCHEMA
VIBRATION_BENCHMARK_COMPLIANCE_SCHEMA
VIBRATION_BENCHMARK_REGISTRY_REVISION
VIBRATION_BENCHMARK_REGISTRY
vibrationBenchmarkRegistryFingerprint()
validateVibrationBenchmarkRegistry()
evaluateVibrationBenchmarkRegistry()
```

Registry authority:

```text
registryAuthority = BENCHMARK_CUSTODY_ONLY
engineeringAuthority = NONE
screeningAuthority = NOT_AUTHORIZED
designAuthority = false
codeCompliance = false
```

## Current executable custody

### FIT

```text
capability = VIB.FIV.FLOW_TURBULENCE
B1 = FIT-EI-D2
B1 = FIT-EI-D4
B2 = FIT-INDEPENDENT-HAND-V1
branchCoverage = FROZEN_WITHIN_QUALIFIED_SCOPE
```

Custody references existing `VIB-FIT.json`, the EI worked-example fixture, independent-hand fixture and FIT qualification-coverage register. No expected output is copied into M3.

### AIV

```text
capability = VIB.AIV.ACOUSTIC
B1 = AIV-EI-D2.3
B2 = AIV-INDEPENDENT-ANALYTICAL-V1
branchCoverage = FROZEN_WITHIN_QUALIFIED_SCOPE
```

Custody references current `VIB-AIV.json`, D2.3 benchmark/product-path evidence and AIV independent benchmark evidence/test. Historical BLOCKED authority fields in retained benchmark evidence are not current product authority.

### Other governed mechanisms

The other ten mechanism-registry IDs are:

```text
executionRequirement = NOT_EXECUTABLE
benchmarkStatus = BENCHMARK_REQUIREMENT_PENDING
compliance state = NOT_REQUIRED
```

They are not fabricated as benchmark-ready.

## Fail-closed semantics

```text
mechanism registry binding mismatch                   HARD FAIL
stored M3 fingerprint mismatch                        HARD FAIL
unknown/duplicate mechanism                           HARD FAIL
duplicate executable capability mapping               HARD FAIL
unknown/duplicate benchmark family                    HARD FAIL
B3/B4 marked countable                                HARD FAIL
numerical expected/tolerance/equation/coefficient key HARD FAIL
EXPECTED_VALUE_SOURCE metadata role                   HARD FAIL
non-executable false FROZEN_CUSTODY status            HARD FAIL
active VIB capability not mapped                      FAMILY BLOCKED
<2 unique countable engineering examples              MECHANISM BLOCKED
B1 missing                                             MECHANISM BLOCKED
B2 missing                                             MECHANISM BLOCKED
duplicate countable engineeringExampleId              MECHANISM BLOCKED
material branch coverage not frozen                    MECHANISM BLOCKED
```

The independent-family count is based on unique `engineeringExampleId`, so the same example in another unit/alias cannot inflate the count.

## Source identities pinned before mutation

```text
mechanism registry        cab12923b3da58769eddfd84cf4335e58ce7b507
active calc registry      47e55c8a8dcf63536b897c63401f16b5686857e1
VIB-FIT workpack          fb52489a737d124f003b88a9783edf352a70d3a9
VIB-AIV workpack          3fe07f7dbb19ed2af019dd529d45800042cdf35e
FIT EI fixture            92c589d4f347f59abd29c059b13462802f436deb
FIT independent fixture   94dd711e6af5458d8569389e461fc2514872f613
AIV D2.3 benchmark doc    36133bf8cbc8fc434b462136a928864b219c1ac8
AIV D2.3 validation       6d3cd2f7d71ab47d2825d802628f18c0782ffdc7
AIV independent evidence  21d1e687dca0c537f4170e961b2d7b1894d710cc
FIT qualification cover   778cfc32087b70af74fc81caf89b95a0769971be
AIV independent test      c0a1b319636e71ce61e06fc8f59ef1ceac2021c0
```

## Changed-file ledger

Production/test/handoff:

```text
NEW converters/vibration/benchmark-registry.js
NEW tests/vibration-benchmark-registry.test.mjs
NEW agents/WIP-vib-bench-reg-01_workreport.md
NEW agents/PR578_workreport.md
```

Connector recovery backups:

```text
.backups/connector-20260817-vib-bench-reg-577/
```

No existing benchmark fixture, Work Pack, adapter, calculator, UI or workflow file is modified.

## Validation ledger

```text
STATUS   OBSERVATION
PASS     exact base main = ab3184705e8d1f476de985e5dfc60a3051fdec3c
PASS     branch relation before PR = ahead 11 / behind 0
PASS     Appendix A = 98/100 before production mutation
PASS     overlap search for new benchmark-registry paths = SAFE
PASS     final module = 220 physical lines (<300)
PASS     final focused test = 173 physical lines (<300)
PASS     all declared artifact and branch-coverage refs resolve on base main
PASS     independent compliance-rule mirror = 8/8 falsifiers
PASS     no existing numerical/benchmark/workpack/workflow file changed
NOT_RUN  native exact-checkout `tests/vibration-benchmark-registry.test.mjs`
NOT_RUN  full repository-native VIB/FIT/AIV suites
NOT_RUN  browser
```

The 8/8 mirror is supporting independent logic evidence, not execution of the exact repository module.

## Protected non-goals

Do not add to this PR:

```text
benchmark expected values or tolerance edits
FIT/AIV equations, coefficients, applicability or numerical defaults
screening/design/code authority changes
Product Freeze changes
M4 EI main-line aggregation
T1 automatic applicability
new numerical mechanism qualification
.github/workflows/* changes
PR #546 technical SBC Type-3 source/freeze work
T2.9 numerical/source work
```

## Highest risk

Future mechanism activation must update benchmark custody in the same governed change. The permanent active-unmapped falsifier is intended to make activation without M3 custody deterministic `BLOCKED` drift.

## EXACT_NEXT_ACTION

Re-query PR #578 after GitHub computes mergeability, inspect exact-head Actions/status/review threads, update PR and issue #577 with the final head and hosted classification, and leave draft/unmerged unless Owner explicitly authorizes this new PR merge.