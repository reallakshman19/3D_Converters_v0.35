# FIT Facility Register v1

Status: **READ PROJECTION ONLY — BENCHMARK VALUES — NO SCREENING AUTHORITY**

## 1. Purpose

`VibrationFacilityFitRegister.v1` is the table-oriented read model built from `VibrationFacilityFitResult.v1`.

It exists so a Vibration Integrity workspace can display facility rows without embedding calculation logic in the UI and without hiding incomplete/unqualified engineering state.

The register never calls a calculation API.

## 2. Authority

Every register contains:

```text
authority = READ_PROJECTION_ONLY
engineeringAuthority = NONE
screeningAuthorized = false
qualificationMode = benchmark
```

The register may display benchmark/reference values. It cannot convert those values into production screening authority.

## 3. Row identity

Each row keeps:

```text
sourceRowIndex
canonicalId
line
caseId
status
```

The register preserves the facility-result ordering and does not rank/reorder rows by LOF.

This avoids turning a read projection into a hidden engineering prioritization algorithm.

## 4. Completeness status

Facility execution statuses map directly to display completeness:

```text
CALCULATED_BENCHMARK
  -> completenessStatus = CALCULATED

NOT_ASSESSED_DATA_INCOMPLETE
  -> completenessStatus = DATA_INCOMPLETE

CALCULATION_FAILED
  -> completenessStatus = CALCULATION_FAILED
```

These are workflow/data states, not acceptance states.

## 5. Numerical fields

Calculated benchmark rows may contain:

```text
standardLof
refinedLof
governingReferenceLof
referenceBand
assessmentStatus
```

Non-calculated rows project these fields as `null` for table rendering.

The non-calculated status must always remain visible beside those null cells.

UI rule:

```text
null + DATA_INCOMPLETE != 0
null + CALCULATION_FAILED != 0
```

A display may show an em dash for null, but downstream data must not coerce null to zero.

## 6. Qualification and evidence columns

Calculated rows expose the central result metadata rather than recomputing confidence:

```text
qualificationState
benchmarkAuthority
phaseEvidenceStrength
correlationEvidenceStrength
advancedEvidenceStrength
candidateForEngineeringReview
screeningCandidateStatus
continuationRequired
```

Evidence strengths come directly from `FIT-REFERENCE-COVERAGE-V1`.

Examples:

```text
EI_PUBLISHED_EXAMPLE
INDEPENDENT_HAND_BENCHMARK
RETAINED_PARITY_ONLY
NONE
```

The register does not combine them into one score.

## 7. Engineering authority column

Every row carries the facility result's:

```text
engineeringAuthority = NONE
screeningAuthorized = false
```

The central benchmark source authority is shown separately as `benchmarkAuthority`, such as:

```text
WORKBOOK_REFERENCE_ONLY
```

This avoids presenting workbook-reference provenance as production engineering authority.

## 8. Source columns

The v1 read model projects two high-signal source fields:

```text
assessmentPointSource
operatingCaseSource
```

Full detailed source trace remains in `VibrationFacilityFitResult.v1` and should be used by an Evidence drawer/details view.

The register deliberately does not duplicate every provenance field into the summary table.

## 9. Error and missing-data columns

Non-calculated rows retain:

```text
missing[]
invalid[]
errorCodes[]
```

Examples:

```text
missing = [maximumUnsupportedSpan]
invalid = [wallThickness]
errorCodes = [INPUT_OUTSIDE_APPLICABILITY]
```

These fields support table filters such as:

```text
Needs data
Calculation error
Benchmark calculated
```

without manufacturing a risk result.

## 10. Facility summary

The register summary contains:

```text
totalRows
calculatedRows
notAssessedRows
failedRows
referenceBandCounts
candidateForEngineeringReviewCount
benchmarkOnlyCount
```

It intentionally does not contain:

```text
safeCount
passCount
facilityRiskScore
vibrationScore
universalLOF
```

## 11. Reference-band counts

`referenceBandCounts` counts only calculated rows that actually carry a central reference band.

Example:

```json
{
  "LOF_LT_0_3": 10,
  "LOF_GE_0_3_LT_0_5": 4,
  "LOF_GE_0_5_LT_1": 2,
  "LOF_GE_1": 1
}
```

These are benchmark/reference workflow bands until screening authority is independently approved.

## 12. Candidate-for-review count

`candidateForEngineeringReviewCount` is based only on the central `FIT-SCREENING-CANDIDATE-V1` metadata.

It is not calculated from LOF thresholds in the register.

A candidate means the exact standard method slice has EI worked-example point coverage and may be suitable for engineering qualification review.

It does not mean the row is accepted or screening-authorized.

## 13. Required UI warnings

The register emits warnings when relevant:

```text
REGISTER_HAS_INCOMPLETE_DATA_ROWS
REGISTER_HAS_CALCULATION_FAILURES
REGISTER_VALUES_ARE_BENCHMARK_REFERENCE_ONLY
```

A future UI should keep these conditions visible at facility level rather than hiding them behind row expansion.

## 14. Recommended table columns

A first table-only workspace can use:

```text
Line
Case
Assessment Point
Completeness
FIT Reference Band
Standard LOF
Refined LOF
Qualification
Correlation Evidence
Candidate Review
Data Source
```

Suggested status filters:

```text
All
Calculated benchmark
Needs data
Calculation failed
Candidate for engineering review
EI worked-example covered
```

## 15. No 3D dependency

The register contains no geometry/rendering state.

Navigation is table-based:

```text
facility register row
  -> line/case detail
  -> input/evidence tables
  -> finding / mitigation / reassessment records
```

The source 3D model remains owned by Advanced_Analysis and is not embedded in the vibration product.

## 16. Next product batch

The register is sufficient to build the first table-only Vibration Integrity workspace shell:

```text
Facility Register
Line Detail
Inputs
Operating Cases
FIT Benchmark Result
Evidence
```

Until `VIB.FIV.FLOW_TURBULENCE` is promoted through issue #429, all calculated views must continue to label values as benchmark/reference rather than production screening results.
