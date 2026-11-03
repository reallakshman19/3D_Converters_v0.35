# WIP — VIB-PROCESS-BASIS-04 / issue #587

## Mission

Establish a non-executable, machine-readable source-authority gate for FIT `STANDARD | NORMAL -> ACTUAL` process-property actualization without inventing reference-condition constants, pressure conventions, compressibility assumptions or a gas-law resolver.

## Exact base

```text
main at branch creation = 9bc8856ce7be1131396b68837b329be3f8cfed36
branch = agent/vib-process-basis-587-authority-gate
issue = #587
Appendix A comment = 5315418426
score = 98/100
qualification = QUALIFIED_FOR_VIB_PROCESS_BASIS_SOURCE_RECONCILIATION_M5
production mutation = BLOCKED_PROCESS_ACTUALIZATION_AUTHORITY
```

Active PR #584 remains separate:

```text
head = f3832d9d6dc1864068432a73b4e31a4d1bca260f
behind main at #587 creation = 1
runtime engineering-basis seam = DO NOT EDIT
```

## Source truth

Current family rule #429 requires an explicit traceable path from standard/normal process data to actual density/velocity before use.

Current merged runtime already blocks non-ACTUAL basis in:

```text
converters/vibration/facility/fit-engineering-basis.js
blob bc673ad368f2b88d0228ca31437adfde9700b962
```

with:

```text
PROCESS_BASIS_CONVERSION_REQUIRED:<field>
```

Current operating-case data model can carry:

```text
massFlow
density
pressure
temperature
dynamicViscosity
velocity
```

but no controlled VIB/FIT source fixes the STANDARD/NORMAL reference conditions or actualization model.

## Foreign-authority inventory

These are explicitly non-adopted for process-reference actualization:

```text
ENGINEERING_UNIT_CONVERSION
  converters/engineering-calculations/units.js
  blob bbc788f5da22ac39d6b694ccf9fbadb57078ee1e
  dimensional unit conversion only

VIBRATION_UI_UNIT_EDITING
  tabs/vibration-integrity-input-units.js
  blob bee61c8d38201b8f4aa047fc1dfc6a35a6e8100d
  visible value/unit editing only

FIT_WORKED_EXAMPLE_ACTUAL_VECTORS
  Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json
  actual-condition benchmark inputs, not a conversion oracle
```

No source was found authorizing:

```text
standard reference T/P
normal reference T/P
absolute/gauge inference
atmospheric offset
ideal-gas assumption
Z=1 / compressibility model
gas constant for this resolver
mass-flow/volumetric-flow/velocity invariant choice
```

## Test-first evidence

First failing test committed before module creation:

```text
3c8d86dfab6c912e0716f48799ccab6a843d2ffd
```

File:

```text
tests/vibration-fit-process-basis-authority.test.mjs
```

It imports a module that did not yet exist and therefore is a genuine pre-repair falsifier.

## Source-only implementation

Implementation commit:

```text
516e23c162320d339e8cecee76b51b711db10017
```

New module:

```text
converters/vibration/fit/process-basis-authority.js
schema = FitProcessBasisAuthority.v1
ruleId = FIT-M5-PROCESS-REFERENCE-ACTUALIZATION
state = BLOCKED_PROCESS_ACTUALIZATION_AUTHORITY
sourceBases = STANDARD | NORMAL
targetBasis = ACTUAL
productionExecutionAllowed = false
```

Blocked fields are all explicitly null:

```text
referenceConditions
conversionModel
compressibilityModel
gasConstant
atmosphericPressure
pressureReferenceRule
invariantQuantityRule
```

Evaluator behavior:

```text
ACTUAL
  -> DIRECT_ACTUAL_BASIS
  -> conversionRequired=false

STANDARD | NORMAL
  -> BLOCKED_SOURCE_AUTHORITY
  -> blocker=PROCESS_ACTUALIZATION_METHOD_NOT_AUTHORIZED
  -> conversionRequired=true
  -> productionExecutionAllowed=false
```

The ACTUAL result reflects existing runtime semantics only; this source-only module is not imported into production and creates no new execution authority.

## Protected scope

No changes to:

```text
#584 branch/runtime geometry seam
FIT equations/correlations/applicability
FIT B1/B2 benchmark values/tolerances
screening/design/code authority
Product Freeze
geometry-consistency blocked authority from #586
schedule/NPS catalogue resolution
scenario synthesis
.github/workflows/*
PR #546 technical work
T2.9 numerical/source work
```

## File/edit custody

All Phase-A mutation files are new. No existing production file was edited, so no backup operation was required.

## Validation truth

Source/static checks:

```text
PASS Appendix A 98/100 before mutation
PASS first failing test predates implementation
PASS blocked record has no reference-condition numeric constants
PASS STANDARD and NORMAL remain distinct
PASS foreign unit/benchmark utilities adopted=false
PASS productionExecutionAllowed=false for conversion
PASS no existing runtime file edited
PASS no #584 technical mutation
```

Execution checks:

```text
NOT_RUN native focused Node test — connector-only private checkout unavailable
NOT_RUN full repository-native VIB/FIT/AIV suites
NOT_RUN browser
NOT_RUN PR Actions — PR not yet created at this report point
```

Static/source evidence is not native execution PASS.

## Next gate

Open a draft PR for Phase A only. Runtime Phase B remains blocked until an exact controlled STANDARD/NORMAL actualization method is approved and the #584 engineering-basis seam is released/re-grounded.

MERGE_AUTHORITY = OWNER_ONLY / NOT_GRANTED_FOR_FUTURE_PR
