# Empirical Weight Validation Report

Read-only validation API for checking an observed/accepted component weight against the two empirical methods defined by `docs/EmpericalWeightconceptNote.md` and exposed by `converters/empirical-weight/index.js`.

This report is **not weight authority**. It must not write source XML weight, `RigidMatch1`, `Rigidmatch2`, or any final CII weight. It only identifies weights that are materially inconsistent with the empirical basis.

## Governing abnormality rule

Default limit:

```text
±30%
```

Operational deviation is defined as:

```text
Deviation % = (Observed kg - Empirical estimate kg) / Empirical estimate kg * 100
```

Therefore:

```text
Observed < 0.70 * estimate  -> abnormal LOW
Observed > 1.30 * estimate  -> abnormal HIGH
Observed = 0.70 * estimate  -> acceptable
Observed = 1.30 * estimate  -> acceptable
```

Only `abs(Deviation %) > 30` is reported as an abnormality. The threshold can be changed explicitly by a caller, but 30% is the production default.

The report also retains:

```text
Prediction error % of observed = (Estimate kg - Observed kg) / Observed kg * 100
```

as a secondary audit field because this denominator convention is commonly used for APE/MAPE model metrics. It is **not** the operational ±30% abnormality gate.

## Why Exact lookup is excluded

The validation report calls Approach 1 and Approach 2 independently:

```text
Approach 1 -> A1_SIZE_BAND equation
Approach 2 -> A2_MATRIX stack
```

It deliberately does **not** use the unified production route:

```text
EXACT -> A2_MATRIX -> A1_SIZE_BAND
```

An exact lookup against the same master would make many validation rows trivially equal to the master value and would provide no independent abnormality check.

## Public API

```js
import {
  validateEmpiricalWeight,
  buildEmpiricalWeightValidationReport,
  empiricalWeightValidationReportToCsv,
  createEmpiricalWeightValidator,
} from './converters/empirical-weight/index.js';
```

### One component

```js
const result = validateEmpiricalWeight({
  rowId: 'VALVE-529',
  componentRefNo: '134234934/XXXXX',
  typeDesc: 'Flanged Gate Valve',
  ns: 10,
  rating: 900,
  target: 'BW',
  observedWeightKg: 128.895,
});

if (result.reportableAbnormality) {
  console.log(result.status);
  console.log(result.approach1.deviationPct);
  console.log(result.approach2.deviationPct);
}
```

### Batch report

```js
const report = buildEmpiricalWeightValidationReport(rows);

console.table(report.abnormalities);
```

The report contains both the complete row set and an abnormal-only set:

```js
{
  schema: 'empirical-weight-validation-report/v1',
  abnormalityThresholdPct: 30,
  exactLookupUsed: false,
  authority: 'READ_ONLY_VALIDATION_NOT_WEIGHT_AUTHORITY',
  summary: { ... },
  abnormalities: [ ... ],
  rows: [ ... ]
}
```

`abnormalities` is sorted from the largest absolute A1/A2 deviation downward.

## Custom/uploaded master

Use one cached validator when the calling module owns uploaded/custom valve master rows:

```js
const validator = createEmpiricalWeightValidator({
  masterRows: masterContext.weightMasterRows,
});

const report = validator.buildReport(weightRows);
```

Approach 1 remains the frozen 270-equation model registry. Approach 2 rebuilds its matrix support from the supplied master rows, consistent with the estimator API.

## Row status

Possible overall row states are:

```text
WITHIN_THRESHOLD
WITHIN_THRESHOLD_PARTIAL
ABNORMAL_A1
ABNORMAL_A2
ABNORMAL_BOTH
UNVALIDATED
```

Per-approach states are:

```text
WITHIN_THRESHOLD
ABNORMAL_HIGH
ABNORMAL_LOW
ESTIMATE_UNAVAILABLE
INVALID_OBSERVED_WEIGHT
```

An unavailable A1 or A2 estimate is not silently treated as a pass. The row is marked partial or unvalidated and the estimator error code is retained.

Approach 1 extrapolation is disabled by default for validation. A caller must explicitly pass:

```js
{ allowA1Extrapolation: true }
```

and any such result retains its `EXTRAPOLATED / LOW` provenance.

## CSV abnormality report

By default the CSV exporter returns abnormal rows only:

```js
const csv = empiricalWeightValidationReportToCsv(report);
```

To include every validated row:

```js
const csv = empiricalWeightValidationReportToCsv(report, {
  abnormalOnly: false,
});
```

CSV fields include observed kg, A1/A2 estimated kg, signed deviation %, status, confidence, model ID, overall status, maximum absolute deviation and threshold.

## Important validation distinction

This API is an **operational weight consistency report**. If rows being checked are themselves part of the same master used to build the Approach 2 matrices, the A2 result may use information from that catalog. It is therefore not a replacement for the leave-one-cell-out / fold-based model-validation methodology documented in `docs/EmpericalWeightconceptNote.md`.

Use the specification's LOO/fold metrics when validating the empirical model itself. Use this report when validating a source, vendor, mapped, reviewed, or accepted component weight before or after Weight Match.

## Intended XML -> CII use

Recommended app integration is read-only:

```text
source/vendor/reviewed component kg
        |
        +--> Approach 1 comparator
        |
        +--> Approach 2 comparator
        |
        +--> empirical validation report
                  |
                  +--> > +30% HIGH abnormality
                  +--> < -30% LOW abnormality
                  +--> otherwise within threshold
```

The result may be displayed in Preview, Weight Match, Final review, diagnostics, or the evidence ZIP. It must not automatically accept, reject, or overwrite a physical-component weight.
