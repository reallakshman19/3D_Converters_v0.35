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

## Mission

Create one non-numerical `VibrationBenchmarkRegistry.v1` and pure compliance evaluator so the repository can prove current executable VIB mechanisms satisfy `VIB-BENCH-001` before M4 EI main-line aggregation begins.

## Dependency decision

Issue #429 orders:

```text
M1 identification
M2 coverage/completeness
M3 benchmark contract + frozen benchmark registry
M4 EI main-line aggregation
```

M1/M2 are merged. M3 is missing as family machine truth, so M4 is deliberately not started.

## Current live custody

```text
main = ab3184705e8d1f476de985e5dfc60a3051fdec3c
mechanism registry blob = cab12923b3da58769eddfd84cf4335e58ce7b507
active registry blob = 47e55c8a8dcf63536b897c63401f16b5686857e1
VIB-FIT workpack blob = fb52489a737d124f003b88a9783edf352a70d3a9
VIB-AIV workpack blob = 3fe07f7dbb19ed2af019dd529d45800042cdf35e
FIT EI fixture blob = 92c589d4f347f59abd29c059b13462802f436deb
FIT independent fixture blob = 94dd711e6af5458d8569389e461fc2514872f613
AIV D2.3 benchmark doc blob = 36133bf8cbc8fc434b462136a928864b219c1ac8
AIV independent evidence blob = 21d1e687dca0c537f4170e961b2d7b1894d710cc
```

Active VIB capabilities are exactly FIT and AIV.

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

No expected values, tolerances, equations or coefficients may enter the family registry.

## Planned files

```text
NEW tests/vibration-benchmark-registry.test.mjs
NEW converters/vibration/benchmark-registry.js
```

No existing production/benchmark/workpack file is required for the first slice. Therefore no existing-file backup is needed unless scope changes.

## Primary falsifier

Add an active `VIB.*` capability not mapped by the family benchmark registry. Evaluation must become `BLOCKED` with an explicit unmapped-capability reason.

## Validation ledger

```text
PASS     live main / mechanism / Work Pack / benchmark artifact grounding
PASS     active PR overlap search for proposed registry paths = SAFE
PASS     Appendix A 98/100
NOT_RUN  protective test before module exists — expected import/module failure
NOT_RUN  native exact-checkout focused suite
NOT_RUN  full repository suites
NOT_RUN  browser
```

## Scope exclusions

No benchmark expected-value/tolerance edits; no FIT/AIV numerical changes; no authority/freeze changes; no M4 aggregation; no automatic T1 rules; no workflows; no PR #546 technical work; no T2.9 numerical/source work.

## EXACT_NEXT_ACTION

Commit the protective registry test before creating `converters/vibration/benchmark-registry.js`. Then implement only the metadata registry/evaluator needed to make that test pass without touching existing benchmark artifacts.