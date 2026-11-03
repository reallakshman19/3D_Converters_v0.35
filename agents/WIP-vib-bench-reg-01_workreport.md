# WIP-vib-bench-reg-01 — family benchmark registry / VIB-BENCH-001 custody

```text
ISSUE = #577
BRANCH = agent/vib-bench-reg-577-family-custody
BASE_MAIN = ab3184705e8d1f476de985e5dfc60a3051fdec3c
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_BENCHMARK_REGISTRY
APPENDIX_A_COMMENT = 5312733740
APPENDIX_A_SCORE = 98/100
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED_FOR_NEW_PR
```

## Mission / dependency

Create one non-numerical `VibrationBenchmarkRegistry.v1` and pure compliance evaluator so the repository can prove current executable VIB mechanisms satisfy `VIB-BENCH-001` before M4 EI main-line aggregation begins.

Issue #429 orders `M1 -> M2 -> M3 benchmark registry -> M4 aggregation`. M1/M2 are merged. This slice closes M3 only; M4 remains absent.

## Live custody pinned before mutation

```text
main = ab3184705e8d1f476de985e5dfc60a3051fdec3c
mechanism registry blob = cab12923b3da58769eddfd84cf4335e58ce7b507
active registry blob = 47e55c8a8dcf63536b897c63401f16b5686857e1
VIB-FIT workpack blob = fb52489a737d124f003b88a9783edf352a70d3a9
VIB-AIV workpack blob = 3fe07f7dbb19ed2af019dd529d45800042cdf35e
FIT EI fixture blob = 92c589d4f347f59abd29c059b13462802f436deb
FIT independent fixture blob = 94dd711e6af5458d8569389e461fc2514872f613
AIV D2.3 benchmark doc blob = 36133bf8cbc8fc434b462136a928864b219c1ac8
AIV D2.3 validation blob = 6d3cd2f7d71ab47d2825d802628f18c0782ffdc7
AIV independent evidence blob = 21d1e687dca0c537f4170e961b2d7b1894d710cc
FIT qualification coverage blob = 778cfc32087b70af74fc81caf89b95a0769971be
AIV independent test blob = c0a1b319636e71ce61e06fc8f59ef1ceac2021c0
```

Active VIB capabilities are exactly `VIB.FIV.FLOW_TURBULENCE` and `VIB.AIV.ACOUSTIC`.

## Implemented machine contract

New `converters/vibration/benchmark-registry.js` defines:

```text
VibrationBenchmarkRegistry.v1
VibrationBenchmarkCompliance.v1
vibrationBenchmarkRegistryFingerprint()
validateVibrationBenchmarkRegistry()
evaluateVibrationBenchmarkRegistry()
```

Current executable custody:

```text
FIT
  B1 FIT-EI-D2
  B1 FIT-EI-D4
  B2 FIT-INDEPENDENT-HAND-V1
  material branch coverage = FROZEN_WITHIN_QUALIFIED_SCOPE

AIV
  B1 AIV-EI-D2.3
  B2 AIV-INDEPENDENT-ANALYTICAL-V1
  material branch coverage = FROZEN_WITHIN_QUALIFIED_SCOPE
```

The remaining governed mechanisms stay `NOT_EXECUTABLE / BENCHMARK_REQUIREMENT_PENDING`; no benchmark readiness is fabricated for them.

## Fail-closed gates

```text
active unmapped VIB capability -> BLOCKED
stored registry fingerprint drift -> hard fail
mechanism-registry binding drift -> hard fail
duplicate mechanism/capability/family -> hard fail
unknown evidence class -> hard fail
B3/B4 countable -> hard fail
<2 independent countable example families -> BLOCKED
missing B1 -> BLOCKED
missing B2 -> BLOCKED
duplicate countable engineeringExampleId -> BLOCKED
material branch coverage not frozen -> BLOCKED
false non-executable FROZEN_CUSTODY status -> hard fail
numerical oracle field in registry -> hard fail
EXPECTED_VALUE_SOURCE role in registry -> hard fail
```

## Protected invariants

```text
BENCHMARK_REGISTERED != METHOD_QUALIFIED
BENCHMARK_READY != SCREENING_AUTHORITY
BENCHMARK_READY != PRODUCT_FREEZE
BENCHMARK_READY != DESIGN_AUTHORITY
REGISTRY_METADATA != NUMERICAL_ORACLE
B3/B4 != COUNTABLE_BENCHMARK_FAMILY
SAME_ENGINEERING_EXAMPLE_IN_OTHER_UNITS != NEW_FAMILY
```

Registry authority is `BENCHMARK_CUSTODY_ONLY / engineeringAuthority NONE / screening NOT_AUTHORIZED / design false / code false`.

No expected values, tolerances, equations or coefficients are stored in the registry.

## Changed paths relative to base

```text
NEW converters/vibration/benchmark-registry.js
NEW tests/vibration-benchmark-registry.test.mjs
NEW agents/WIP-vib-bench-reg-01_workreport.md
NEW .backups/connector-20260817-vib-bench-reg-577/*
```

No existing production, Work Pack, benchmark fixture, numerical method, UI or workflow file was modified.

## Validation ledger

```text
PASS     exact branch base = current main / behind 0
PASS     Appendix A 98/100 before production mutation
PASS     active PR overlap for proposed registry paths = SAFE
PASS     final module = 220 physical lines (<300)
PASS     final focused test = 173 physical lines (<300)
PASS     every new custody reference resolved against current main
PASS     independent compliance-rule mirror = 8/8 falsifiers
PASS     changed-path ledger excludes benchmark fixtures/numerical/workflow/freeze/#546 technical paths
NOT_RUN  native exact-checkout focused Node test — connector-only private checkout unavailable
NOT_RUN  full repository-native VIB/FIT/AIV suites
NOT_RUN  browser — not required for this non-UI M3 slice, but no browser PASS is claimed
```

The independent 8/8 mirror is supporting logic evidence, not execution of the exact repository module.

## Scope exclusions

No benchmark expected-value/tolerance edits; no FIT/AIV numerical changes; no authority/freeze changes; no M4 aggregation; no automatic T1 rules; no workflows; no PR #546 technical work; no T2.9 numerical/source work.

## Primary falsifier

> Add an active `VIB.*` capability without registered B1/B2/branch custody. Family M3 must deterministically become `BLOCKED`, preventing downstream code from inferring benchmark readiness.

## EXACT_NEXT_ACTION

Open a draft PR from this exact branch, record the PR-numbered handoff, inspect exact-head hosted execution/reviews, and leave unmerged unless Owner separately authorizes the new PR merge.