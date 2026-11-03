# FIT Facility Preflight v1

## Purpose

`VibrationFacilityFitPreflight.v1` checks whether the imported table data can prepare FIT benchmark requests **without executing any FIT calculation**.

It exists so an engineer can review topology integrity, assessment-point coverage and missing/invalid inputs before choosing **Run FIT benchmark**.

## Authority

```text
schema               = VibrationFacilityFitPreflight.v1
authority            = PREFLIGHT_ONLY
engineeringAuthority = NONE
screeningAuthorized  = false
qualificationMode    = benchmark
```

Preflight does not produce LOF, Fv, reference band, pass/fail or any numerical screening result.

## Core pipeline

```text
parsed VibrationTableExchange.v1
        +
operating-case records
        +
vibration enrichment
        |
        v
assembleVibrationIntegrityDataset()
        |
        v
buildVibrationFacilityFitPlan()
        |
        v
STOP
```

`fit-preflight.js` imports neither the facility executor nor the central Engineering Calculation engine.

## Result rows

Each row contains only planning/readiness state:

```text
canonicalId
line
caseId
status              READY | NOT_READY
missing[]
invalid[]
reasons[]
requestPrepared     boolean
sourceTrace
```

`requestPrepared=true` means the existing planner constructed a benchmark-mode request. The preflight intentionally does not execute or return that request as a numerical result.

## Counts

```text
assessmentPoints
rows
ready
notReady
```

These are data-readiness counts, not engineering-risk counts.

## Limited topology input

A complete exchange is required by default.

Current Elements-only CSV fails unless the caller explicitly supplies:

```js
{ allowLimitedExchange: true }
```

When accepted, the dataset retains `LIMITED_ELEMENTS_ONLY` integrity status and its warning. The preflight never upgrades CSV provenance.

## Tabular preflight

`buildVibrationFacilityFitPreflightFromTables()` reuses the same parser boundary as the benchmark workflow:

```text
3D EDIT XLSX / Elements CSV
Operating-case CSV v1
Enrichment CSV v1
        |
        v
parseVibrationFacilityFitTables()
        |
        v
buildVibrationFacilityFitPreflight()
```

The parser is separated from the benchmark workflow so readiness does not import the numerical execution workflow.

## Visible UI

The Vibration Integrity tab exposes two distinct actions:

```text
Check readiness
Run FIT benchmark
```

**Check readiness** displays:

```text
Topology integrity
Assessment points
Plan rows
Ready
Not ready

Line | Case | Canonical ID | Readiness | Missing | Invalid | Reasons | Request
```

There are deliberately no LOF or assessment-result columns in this panel.

The benchmark workflow module is dynamically imported only after the operator selects **Run FIT benchmark**.

## Safety invariants

- no central calculation during preflight;
- no FIT equation in preflight/UI;
- no unit conversion or engineering default in preflight;
- no automatic promotion from NOT_READY to READY;
- no zero substituted for missing values;
- no pass/safe label;
- no universal score;
- no screening/design authority;
- no 3D/canvas/viewer.
