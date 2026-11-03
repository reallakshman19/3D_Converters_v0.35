# FIT Facility Tabular Workflow v1

Status: **TABLE-INPUT BENCHMARK WORKFLOW — NO SCREENING OR DESIGN AUTHORITY**

## 1. Purpose

`VibrationFacilityFitTabularWorkflow.v1` is the file/table ingestion façade for the table-first FIT facility workflow.

It accepts:

- a 3D EDIT topology/table source;
- optional operating-case CSV;
- optional vibration-enrichment CSV;
- optional explicit FIT data-blocker CSV for missing engineering data.

and delegates immediately to the existing `VibrationFacilityFitWorkflow.v1`.

No dataset join, readiness rule, engineering calculation or read-model logic is duplicated here.

## 2. API

```js
runVibrationFacilityFitBenchmarkFromTables({
  topology: {
    format,
    data,
    sourceFileName,
  },
  operatingCaseCsv,
  enrichmentCsv,
  dataBlockerCsv,
}, {
  allowLimitedExchange: false,
})
```

## 3. Authority

Every returned object contains:

```text
authority = TABULAR_WORKFLOW_ORCHESTRATION_ONLY
engineeringAuthority = NONE
screeningAuthorized = false
qualificationMode = benchmark
```

The façade cannot change FIT qualification mode.

Unsupported options such as `qualificationMode` or `designAuthority` are rejected by the underlying workflow option contract.

Manual data-blocker values are evidence-bearing user inputs. Their presence never grants screening or design authority.

## 4. Topology input formats

Supported `topology.format` values:

```text
PARSED_EXCHANGE
XLSX
CSV_ELEMENTS_ONLY
```

### PARSED_EXCHANGE

`topology.data` is an already parsed:

```text
VibrationTableExchange.v1
```

This is useful for callers that separately manage file parsing or cached exchange state.

### XLSX

`topology.data` is XLSX bytes accepted by:

```text
parseVibrationTableExchangeXlsx()
```

The existing five-sheet `TopologyEditTableHumanExport.v1` contract applies.

For the editable FIT workspace, preserved complete-XLSX execution additionally requires the captured Elements projection fingerprint and complete workbook-byte fingerprint to remain unchanged.

### CSV_ELEMENTS_ONLY

`topology.data` is the current 3D EDIT Elements-only CSV.

It parses as:

```text
integrityStatus = LIMITED_ELEMENTS_ONLY
completeExchange = false
```

The overall workflow rejects it by default.

The caller must explicitly opt in:

```js
{ allowLimitedExchange: true }
```

All limited-exchange warnings remain visible downstream.

## 5. Operating-case input

When `operatingCaseCsv` is present, it is parsed only through:

```text
parseVibrationOperatingCaseCsv()
```

When it is absent/null/empty string:

```text
operatingCases = []
```

No default process case is created by the source-table parser.

## 6. Enrichment input

When `enrichmentCsv` is present, it is parsed only through:

```text
parseVibrationEnrichmentCsv()
```

When absent/null/empty string:

```text
enrichment = []
```

No default FIT assessment point or geometry enrichment is created.

## 7. Explicit data-blocker input

Missing engineering data may be supplied through the separately governed:

```text
VibrationFitDataBlockerCsv.v1
```

This is a manual gap-resolution layer, not a fallback-default layer.

Each row records:

```text
Canonical ID
Line
Operating Case
Field
Value
Unit
Source
Source Revision
Record ID
Status
Reviewer
Notes
```

Supported statuses are:

```text
ACTIVE    participates in benchmark input preparation
HOLD      retained for audit only; does not satisfy readiness
RESOLVED  retained for audit only; does not satisfy readiness
```

Numeric ACTIVE values require an explicit engineering unit. Every row requires explicit source provenance.

Supported data fields cover the current FIT engineering-input gaps:

```text
ASSESSMENT_POINT
OUTSIDE_DIAMETER
WALL_THICKNESS
INSIDE_DIAMETER
MAX_UNSUPPORTED_SPAN
NATURAL_FREQUENCY
PHASE
MASS_FLOW
DENSITY
DYNAMIC_VISCOSITY
VELOCITY
MULTIPHASE_RESOLUTION_MODE
GAS_MASS_FLOW
GAS_DENSITY
LIQUID_MASS_FLOW
LIQUID_DENSITY
```

### Fill-only authority rule

The blocker table may fill a missing value only.

```text
existing source value + ACTIVE blocker value
    -> FIT_DATA_BLOCKER_SOURCE_COLLISION
    -> fail closed
```

The manual table never silently overwrites operating-case or enrichment data.

### Case creation

When a valid case-scoped ACTIVE blocker row names a Line + Operating Case that is not otherwise present, the tabular compiler may create a minimal case identity record so the explicit blocker values can be joined. It does not invent phase, flow, density, viscosity or other engineering values.

### Multiphase data

The manual table supports both governed FIT multiphase representations:

```text
AGGREGATE_EFFECTIVE
  density + (mass flow or velocity)

COMPONENT_DERIVED
  gas mass flow + gas density
  liquid mass flow + liquid density
```

If both shapes are present, `MULTIPHASE_RESOLUTION_MODE` must explicitly select the intended representation. No automatic preference is introduced.

## 8. Data blocker versus method/domain blocker

Only missing **data** may be resolved by user input.

Method, correlation and applicability uncertainty cannot be overridden through the blocker table.

In particular:

```text
219.1 mm < Dext < 273 mm
```

remains the QST-003 method/domain exclusion for the bounded production candidate. A field such as `SUPPORT_SIZE_FAMILY` is not accepted by `VibrationFitDataBlockerCsv.v1`; attempting to use manual data to bypass the unresolved method mapping fails closed.

The same principle applies to any future unresolved equation, correlation, code interpretation or authority decision: it must be qualified or explicitly excluded, not converted into a user-entered engineering datum.

## 9. Returned import metadata

The façade returns:

```text
imports.topologyFormat
imports.topologySourceFileName
imports.exchangeSchema
imports.exchangeIntegrityStatus
imports.operatingCaseCount
imports.enrichmentCount
imports.dataBlockerCount
imports.activeDataBlockerCount
```

These are ingestion facts only.

`operatingCaseCount` and `enrichmentCount` describe the original source tables. `dataBlockerCount` and `activeDataBlockerCount` make manual-input dependency explicit.

The complete underlying workflow is returned as:

```text
workflow
```

## 10. Error ordering

The façade fails as early as possible:

```text
unsupported topology format
  -> fail before parsing process tables

malformed topology table
  -> fail before dataset assembly

malformed operating/enrichment/data-blocker CSV
  -> fail before dataset assembly/calculation

manual/source collision
  -> fail before dataset assembly/calculation

invalid joins/data completeness
  -> dataset/planner stage

FIT applicability/calculation error
  -> central Engineering Calculation stage
```

This ordering keeps syntax/import defects separate from engineering applicability defects.

## 11. No hidden default behavior

If topology is valid but no process/enrichment/data-blocker tables are supplied:

```text
exchange -> parsed
operating cases -> []
enrichment -> []
data blockers -> []
dataset -> valid topology dataset
plan -> zero FIT assessment points
result/register -> zero rows
warning -> NO_FIT_ASSESSMENT_POINTS
```

The system does not assume operating conditions, FIT locations, process properties, geometry or correlation-family data merely because a topology file exists.

## 12. Intended UI use

The FIT workspace maps the contract to three user-facing input tabs:

```text
Engineering Basis
Source Data
Data Blockers
```

A typical sequence is:

```text
1. Upload 3D EDIT XLSX
2. Upload HMB operating-case CSV
3. Upload vibration-enrichment CSV
4. Check readiness
5. Inspect missing/invalid fields
6. Enter genuinely missing data in the Data Blockers table with value/unit/source/status
7. Recheck readiness
8. Run benchmark workflow
9. Display register + data-quality/manual-input facts
10. Export register and reproducibility evidence
```

The Data Blockers tab also supports CSV import, direct table editing, add/delete, cell/row/table revert and a template export.

Engineering Basis source links switch to the separate Source Data tab before focusing the exact backing cell, preserving source traceability after the tab split.

No 3D model viewer is needed.

## 13. Provenance and evidence

The tabular façade does not flatten provenance.

Detailed data remain available through:

```text
workflow.dataset
workflow.plan
workflow.result
workflow.register
```

Manual blocker provenance is retained in plan/source traces. The editable workspace also binds the blocker table and file descriptor into `FitRunSnapshot.v1`; changing manual data invalidates the audit identity and any current result becomes stale until rerun.

`FitRunEvidencePackage.v1` retains the blocker source-file descriptor alongside the other source files.

This preserves the same RESULT -> WHY -> EVIDENCE workflow as the lower-level APIs.

## 14. Qualification boundary

Even a complete and successfully calculated tabular workflow, including explicitly supplied manual data, remains:

```text
FIT = BENCHMARK_ONLY
screeningAuthorized = false
designAuthority = false
```

For this FIT candidate, controlled reproduction of the Owner-specified worked examples at `Common@7bfead910f6bca91b10748ead009e40f20c82219` (DOCX blob `ceee15ed5f7f320045d5f3979024e2e8664613f2`) is sufficient engineering benchmark qualification; no separate independent vibration-engineer sign-off is required. Promotion to bounded screening still requires controlled source/method traceability, the exact release regression, browser/real-file acceptance, bounded central API qualification, QST-003 exclusion, reproducibility controls and explicit Owner authorization of the separate authority PR.
