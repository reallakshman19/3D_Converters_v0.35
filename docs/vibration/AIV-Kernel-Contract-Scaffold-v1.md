# AIV Kernel Contract Scaffold v1

## Purpose

This document defines the first production-shaped contract layer for `VIB.AIV.ACOUSTIC` after the isolated qualification examples were solved.

It does **not** move qualification arithmetic into the production calculator. It freezes stage names, result-scope handoffs and benchmark-comparison semantics while execution remains blocked.

## Authority

```text
calculationState      = BLOCKED
qualificationState    = BLOCKED
engineeringAuthority  = NONE
productionEquationAuthorized = false
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
```

No file in this slice changes those values.

## Kernel stage contract

Implementation:

```text
converters/vibration/aiv/aiv-kernel-contract.js
AivKernelContract.v1
```

Frozen order:

```text
1  VALIDATE_INPUT
2  RESOLVE_INPUT
3  EVALUATE_APPLICABILITY
4  CALCULATE_SOURCE_PWL
5  APPLY_SOURCE_MODIFIERS
6  CALCULATE_POINT_ATTENUATION
7  COMBINE_SIMULTANEOUS_SOURCES
8  CALCULATE_DISCONTINUITY_RESULT
9  AGGREGATE_LINE_CASE_RESULT
10 ASSESS_RESULT
```

Every stage is marked:

```text
implementationState = CONTRACT_ONLY
numericalExecutionAuthorized = false
```

The contract binds the already-frozen product result scopes:

```text
AivSourceResult.v1
AivAssessmentResult.v1
AivLineCaseSummary.v1
AivResultSet.v1
```

`assertAivKernelExecutionAuthorized()` always throws `AIV_KERNEL_EXECUTION_NOT_AUTHORIZED` at the current authority.

The module contains no source-PWL equation, attenuation equation, dB-combination equation, T2-6 equation, FLM rule, threshold, or pass/safe classification.

## Benchmark comparison contract

Implementation:

```text
converters/vibration/aiv/aiv-benchmark-comparison.js
AivBenchmarkComparison.v1
```

This module accepts externally supplied qualification results plus controlled expected values and explicit absolute tolerances. It does not calculate AIV engineering results.

Statuses:

```text
PASS
FAIL
REVIEW_REQUIRED
NOT_APPLICABLE_INPUTS_MODIFIED
```

### REVIEW_REQUIRED

A numerical item can remain an engineering-review item even when its arithmetic is known. The D.2.3 FLM1 discrepancy is the governing example:

```text
published     1.2133
recalculated  1.2109758194311824
```

The comparison contract records this as `REVIEW_REQUIRED`, not PASS and not an automatic source correction.

### Modified benchmark inputs

If the visible benchmark working tables are no longer the exact controlled input reference:

```text
inputIdentityState != CONTROLLED_INPUT_REFERENCE
```

then official parity becomes:

```text
NOT_APPLICABLE_INPUTS_MODIFIED
```

The software does not claim benchmark parity merely because modified inputs happen to produce similar numbers.

## Isolation boundary

The new modules are intentionally **not** exported from:

```text
converters/vibration/aiv/index.js
```

and are not imported by:

```text
tabs/vibration-aiv-qualification-tab.js
tabs/vibration-aiv-qualification-view.js
converters/engineering-calculations/default-registry.js
```

So there is still no AIV `Run`, `calculate`, central Engineering Calculation API execution, screening path, or design path.

## Why this stage exists

The isolated qualification harness has already demonstrated machine parity for D.2.3, sonic SFF=6 and simultaneous-source addition. The next safe architecture step is therefore to freeze the product-facing numerical boundaries before any authority transition.

This prevents later implementation from collapsing:

```text
Source Result
Assessment Result
Line / Case Summary
```

or embedding equations into UI/controller code.

## Tests

```text
tests/vibration-aiv-kernel-contract.test.mjs
tests/vibration-aiv-benchmark-comparison.test.mjs
```

They verify:

- exact stage order;
- every stage remains contract-only;
- execution fails closed;
- no qualification equations/constants appear in the kernel contract module;
- controlled benchmark tolerance handling;
- FLM1-style `REVIEW_REQUIRED` behavior;
- numerical mismatch -> `FAIL`;
- modified input -> official parity not applicable;
- no facade/UI/API wiring.

Focused repository command:

```bash
npm run verify:aiv-input-model
```

## Next authority-dependent step

Only after the named T2.7, FLM1, result-scope, independent benchmark and workbook reviews are genuinely completed—and the independent vibration engineer supports an explicit transition—may a later change implement these stages numerically and expose `BENCHMARK_ONLY` execution.
