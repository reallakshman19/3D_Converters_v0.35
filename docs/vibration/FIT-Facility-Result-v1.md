# FIT Facility Result v1

Status: **BENCHMARK ORCHESTRATION ONLY — NO SCREENING OR DESIGN AUTHORITY**

## 1. Purpose

`VibrationFacilityFitResult.v1` is the table-oriented execution result produced from `VibrationFacilityFitPlan.v1`.

It provides one facility row per planned `(Canonical ID, line, operating case)` while ensuring that:

- READY rows execute only through the centralized Engineering Calculation batch API;
- NOT_READY rows remain non-numerical;
- central errors remain errors;
- central qualification/evidence are preserved;
- facility orchestration does not create a second FIT calculation implementation.

## 2. Execution path

```text
VibrationFacilityFitPlan.v1
  -> READY requests only
  -> calculateEngineeringBatch()
  -> VIB.FIV.FLOW_TURBULENCE central definition
  -> same FIT domain kernel used by Console/single/batch
  -> map central results back to facility identities
```

The facility executor does not import or call `calculateFit()` directly.

## 3. Authority

Every facility result contains:

```text
authority = ORCHESTRATION_ONLY
engineeringAuthority = NONE
screeningAuthorized = false
qualificationMode = benchmark
```

`complete=true` means only that every planned row was data-ready and every central calculation completed successfully.

It does **not** mean the facility is vibration-safe, EI-qualified, project-approved or design-authorized.

## 4. Result row identities

Rows retain planner identity:

```text
canonicalId
line
caseId
calculationId = VIB.FIV.FLOW_TURBULENCE
```

Final row ordering is the plan ordering.

READY requests are sent to the central batch in the same relative order, and central results are mapped back by that order.

## 5. Calculated benchmark row

When a READY request succeeds centrally:

```text
status = CALCULATED_BENCHMARK
```

Convenience table fields are copied from the central result:

```text
standardLof
refinedLof
governingReferenceLof
referenceBand
assessmentStatus
```

The row also retains:

```text
qualification
qualificationCoverage
screeningCandidate
sourceTrace
centralResult
```

The complete immutable central result remains attached so the table projection never becomes the engineering evidence authority.

## 6. Calculation failure row

When a READY request reaches the central engine but fails validation/applicability/calculation:

```text
status = CALCULATION_FAILED
errors = centralResult.errors
centralResult = <failed immutable central result>
```

No convenience LOF fields are created.

A calculation failure is not converted to:

```text
LOF = 0
PASS
LOW RISK
NOT APPLICABLE
```

unless the central result itself explicitly carries an authorized semantic—which the current benchmark FIT path does not.

## 7. Incomplete-data row

A planner `NOT_READY` item never enters `calculateEngineeringBatch()`.

It becomes:

```text
status = NOT_ASSESSED_DATA_INCOMPLETE
centralResult = null
missing[]
invalid[]
reasons[]
sourceTrace
```

No numerical LOF field exists on the row.

This distinction is critical for facility tables:

```text
NOT ASSESSED != LOW LOF
```

## 8. Central batch contract

The executor builds:

```json
{
  "contractVersion": "engineering-calculation-batch/v1",
  "requests": [
    "READY request 1 unchanged",
    "READY request 2 unchanged"
  ]
}
```

The executor does not rewrite:

- calculation ID;
- input values;
- input units;
- qualification mode;
- includeEvidence option.

Before execution it verifies that every READY request uses:

```text
calculationId = VIB.FIV.FLOW_TURBULENCE
qualificationMode = benchmark
```

Any plan-level or request-level mutation to screening mode fails before central execution.

## 9. Counts

Result counts are explicit:

```text
total
plannedReady
calculated
calculationFailed
notAssessed
```

`centralBatchSummary` separately records:

```text
ok
total
succeeded
failed
```

The two count groups answer different questions:

- facility counts include NOT_READY planning rows;
- central batch counts include only requests actually executed.

## 10. Warnings

### `FACILITY_ROWS_NOT_ASSESSED`

One or more rows lacked required data and never entered the central engine.

### `FACILITY_CALCULATION_FAILURES`

One or more READY requests entered the central engine but failed.

These warnings should be surfaced prominently in a future facility table completeness/status view.

## 11. Table-first UX projection

The result supports a facility table such as:

```text
Line | Case | Assessment Point | FIT Status | Standard LOF | Refined LOF | Evidence
```

Example semantic rows:

```text
L-100 | NORMAL | CANON-001 | CALCULATED_BENCHMARK | 0.28 | — | EI D2 coverage
L-100 | DESIGN | CANON-002 | NOT_ASSESSED_DATA_INCOMPLETE | — | — | span missing
L-200 | NORMAL | CANON-003 | CALCULATION_FAILED | — | — | applicability error
```

The em dash is a display choice for absent data; it must never be stored or interpreted as zero.

## 12. Next safe product layer

The next layer can build a facility screening/register projection from this result:

```text
summary counts
line/case rows
completeness status
reference LOF band
qualification/evidence badges
finding creation hooks
```

Until FIT is independently qualified for `SCREENING`, the UI must label calculated rows as benchmark/reference results and must not display an authoritative production pass/fail state.
