# FIT Facility Workflow v1

Status: **TABLE-FIRST BENCHMARK WORKFLOW — NO SCREENING OR DESIGN AUTHORITY**

## 1. Purpose

`VibrationFacilityFitWorkflow.v1` is the high-level API for the current table-first FIT facility workflow.

It composes existing public layers rather than introducing new engineering logic:

```text
VibrationTableExchange.v1
  -> assembleVibrationIntegrityDataset()
  -> buildVibrationFacilityFitPlan()
  -> executeVibrationFacilityFitPlan()
  -> buildVibrationFacilityFitRegister()
```

The workflow returns every intermediate artifact so operators, tests and future UI views can inspect the exact data, readiness, central calculation result and read projection independently.

## 2. API

```js
runVibrationFacilityFitBenchmark({
  exchange,
  operatingCases,
  enrichment,
}, {
  allowLimitedExchange: false,
})
```

The only workflow option in v1 is:

```text
allowLimitedExchange
```

The workflow rejects unsupported options such as:

```text
qualificationMode
designAuthority
screening
```

Benchmark mode is fixed by the FIT facility plan.

## 3. Authority

Every workflow result contains:

```text
authority = WORKFLOW_ORCHESTRATION_ONLY
engineeringAuthority = NONE
screeningAuthorized = false
qualificationMode = benchmark
```

The high-level API cannot promote FIT from `BENCHMARK_ONLY`.

## 4. Returned artifacts

```text
dataset
plan
result
register
summary
warnings
```

### `dataset`

The complete `VibrationIntegrityDataset.v1` including exchange authority, operating cases, enrichment and data-completeness warnings.

### `plan`

The complete `VibrationFacilityFitPlan.v1` including READY/NOT_READY rows, exact central requests and source trace.

### `result`

The complete `VibrationFacilityFitResult.v1` including central immutable Engineering Calculation results for READY rows and explicit non-numerical states for incomplete/failed rows.

### `register`

The complete `VibrationFacilityFitRegister.v1` table read model.

### `summary`

A direct reference to the register summary. It contains workflow counts/reference-band distribution only and no pass/fail/universal risk score.

## 5. No hidden logic

The workflow function does not:

- parse XLSX itself;
- normalize engineering units;
- infer missing process data;
- derive OD/wall from DN/schedule;
- implement FIT equations;
- assess FIT outside the central kernel;
- convert benchmark mode to screening mode;
- create a facility pass/fail conclusion.

Each responsibility stays in its existing lower-level API.

## 6. Complete exchange behavior

A complete `VibrationTableExchange.v1` is required by default.

Elements-only CSV datasets can enter the workflow only when the caller explicitly sets:

```js
{ allowLimitedExchange: true }
```

The downstream dataset and plan retain their limited-exchange warnings. The workflow does not suppress or upgrade them.

## 7. Incomplete data

Example:

```text
FIT assessment point exists
outside diameter exists
wall thickness exists
maximum unsupported span missing
```

Workflow behavior:

```text
dataset     -> enrichment preserved
plan        -> NOT_READY, missing=[maximumUnsupportedSpan], request=null
result      -> NOT_ASSESSED_DATA_INCOMPLETE, centralResult=null
register    -> DATA_INCOMPLETE, LOF cells=null
```

No central request is executed and no LOF is synthesized.

## 8. Successful benchmark calculation

For a complete READY row:

```text
plan request
  -> calculateEngineeringBatch()
  -> BENCHMARK_ONLY FIT result
  -> facility result CALCULATED_BENCHMARK
  -> register CALCULATED row
```

The workflow retains central:

```text
qualification
provenance
evidence
qualificationCoverage
screeningCandidate
```

No downstream layer upgrades those objects.

## 9. Stage-separated warnings

Warnings are grouped by origin:

```text
warnings.dataset
warnings.plan
warnings.result
warnings.register
```

They are not flattened into one generic message list because the meaning differs:

- dataset warning = data assembly/source completeness;
- plan warning = request readiness;
- result warning = central execution/incomplete calculation rows;
- register warning = table/read-model visibility.

## 10. Table workspace consumption

A future table-only workspace can call the workflow after the exchange/process/enrichment inputs are available and bind primarily to:

```text
workflow.register.rows
workflow.register.summary
workflow.warnings
```

Then row details can drill into:

```text
workflow.result.rows[sourceRowIndex]
workflow.plan.items[sourceRowIndex]
workflow.dataset
```

This provides RESULT -> WHY -> EVIDENCE without a 3D model viewer.

## 11. Product state while qualification remains open

Until issue #429 authorizes a bounded `SCREENING` implementation:

- workflow name remains benchmark-oriented;
- calculated rows must be labeled benchmark/reference;
- candidate-for-engineering-review metadata is not acceptance;
- `LOF >= 1` is not converted to a universal facility failure score;
- other vibration mechanisms remain separate, independently qualified columns/workflows.

## 12. Next implementation choice

The backend table-first FIT vertical is now sufficiently composed for one of two next tracks:

1. **Product UI track:** build the facility register/line-detail table views on top of this workflow, with benchmark/incomplete/evidence states prominent.
2. **Engineering qualification track:** complete full EI T2.2/project-procedure review, full repository regression and independent vibration-engineering approval before any screening-authority promotion.

These tracks can proceed independently as long as the UI continues to present the current benchmark-only authority honestly.
