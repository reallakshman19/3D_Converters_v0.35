# Vibration CSV Templates and FIT Register Export v1

Status: **TABLE UX SUPPORT — NO ENGINEERING DEFAULTS OR SCREENING AUTHORITY**

## 1. Purpose

This contract makes the table-only vibration workflow easier to operate without duplicating CSV quoting rules or requiring users to manually reconstruct exact v1 headers.

It provides:

```text
createVibrationOperatingCaseCsvTemplate()
createVibrationEnrichmentCsvTemplate()
serializeVibrationFacilityFitRegisterCsv()
```

All three use the same deterministic vibration CSV serializer.

## 2. Deterministic CSV serializer

`serializeVibrationCsvRows(rows)` emits:

- comma-delimited fields;
- CRLF line endings by default;
- quoted fields when a value contains comma, quote, CR or LF;
- doubled quotes inside quoted fields;
- `true` / `false` for booleans;
- empty cells for `null` / `undefined`;
- finite numeric text for numbers.

Objects, arrays and non-finite numbers are rejected rather than stringified implicitly.

This keeps structured provenance/evidence from accidentally becoming `[object Object]` in an engineering export.

## 3. Input templates

### 3.1 Safe default

Templates are **header-only by default**:

```js
createVibrationOperatingCaseCsvTemplate()
createVibrationEnrichmentCsvTemplate()
```

This is deliberate. A newly downloaded template must not contain plausible-looking process values that could be mistaken for project defaults.

The headers come directly from the parser contract constants, so template and parser cannot drift independently.

### 3.2 Optional example row

For documentation/training use only:

```js
createVibrationOperatingCaseCsvTemplate({ includeExample: true })
createVibrationEnrichmentCsvTemplate({ includeExample: true })
```

Example rows use unmistakable identifiers such as:

```text
SAMPLE_LINE_DO_NOT_USE
SAMPLE_CASE_DO_NOT_USE
SAMPLE_CANONICAL_ID_DO_NOT_USE
SAMPLE_ONLY_NOT_PROJECT_DATA
```

The example values are parser demonstrations only and are not engineering defaults, masters or project data.

A normal project workflow should replace/delete every example row before import.

## 4. Facility register CSV export

`serializeVibrationFacilityFitRegisterCsv(register)` accepts only:

```text
VibrationFacilityFitRegister.v1
```

and preserves register row order.

Exact columns:

```text
Line
Operating Case
Canonical ID
Status
Completeness
Standard LOF
Refined LOF
Governing Reference LOF
Reference Band
Assessment Status
Qualification
Benchmark Authority
Engineering Authority
Screening Authorized
Phase Evidence
Correlation Evidence
Advanced Evidence
Candidate For Engineering Review
Candidate Status
Continuation Required
Missing
Invalid
Error Codes
Assessment Point Source
Operating Case Source
```

## 5. Missing and failed numerical values

For `DATA_INCOMPLETE` or `CALCULATION_FAILED` register rows, absent LOF fields are exported as blank cells.

They are never exported as:

```text
0
0.0
PASS
SAFE
```

The same row also exports explicit Status/Completeness columns so a blank numerical cell cannot be interpreted as a low result.

## 6. Multi-value diagnostic cells

The following arrays are exported as semicolon-separated text inside one CSV cell:

```text
Missing
Invalid
Error Codes
```

Example:

```text
maximumUnsupportedSpan; density
```

The export is a human/table read model. The source `VibrationFacilityFitResult.v1` remains the detailed engineering evidence object.

## 7. Authority visibility

The CSV explicitly includes:

```text
Qualification
Benchmark Authority
Engineering Authority
Screening Authorized
```

A current calculated FIT row should therefore remain visibly similar to:

```text
Qualification       = BENCHMARK_ONLY
Benchmark Authority = WORKBOOK_REFERENCE_ONLY
Engineering Authority = NONE
Screening Authorized  = false
```

The export cannot turn benchmark/reference calculations into screening-authorized results.

## 8. Evidence visibility

The CSV retains separate evidence dimensions:

```text
Phase Evidence
Correlation Evidence
Advanced Evidence
Candidate For Engineering Review
Candidate Status
Continuation Required
```

It deliberately does not combine them into one confidence/risk score.

## 9. Forbidden semantics

The v1 register export contains no columns for:

```text
Pass
Safe
Risk Score
Vibration Score
Facility Score
```

Those concepts are not authorized by the current benchmark-only FIT qualification state.

## 10. Intended UI actions

A first table-only Vibration Integrity workspace can safely provide:

```text
Download Operating Case Template
Download Enrichment Template
Export Current FIT Register CSV
```

These are file/table actions only. They require no 3D model viewer or canvas.

## 11. Validation intent

The serializer/template/export regression covers:

- quoted commas;
- embedded quotes;
- embedded newlines;
- boolean/null/number serialization;
- round-trip parsing;
- rejection of objects/non-finite values;
- exact parser-compatible template headers;
- optional sample-only rows;
- blank non-calculated LOF export;
- explicit benchmark/evidence/authority columns;
- absence of pass/safe/universal-score columns.
