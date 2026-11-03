# FIT Facility Plan v1

Status: **REQUEST PLANNING ONLY — BENCHMARK MODE — NO SCREENING AUTHORITY**

## 1. Purpose

`VibrationFacilityFitPlan.v1` converts a trusted `VibrationIntegrityDataset.v1` into explicit FIT readiness records and central Engineering Calculation requests.

The planner does not calculate FIT and contains no empirical equations.

Its job is:

```text
Dataset
  -> select explicit FIT assessment locations
  -> resolve required geometry/process evidence
  -> report missing/invalid inputs
  -> create central API request only when READY
```

All numerical execution remains in the centralized Engineering Calculation API under calculation ID:

```text
VIB.FIV.FLOW_TURBULENCE
```

Current generated requests use:

```text
qualificationMode = benchmark
```

The planner cannot enable screening mode.

## 2. Authority

Every plan contains:

```text
authority = REQUEST_PLANNING_ONLY
engineeringAuthority = NONE
screeningAuthorized = false
qualificationMode = benchmark
```

A `READY` row means only that the required explicit request inputs are available.

It does not mean:

- FIT is applicable under an approved project method;
- the result will be below a threshold;
- screening authority exists;
- the piping is acceptable;
- the result has design authority.

## 3. Explicit assessment locations

The planner never assumes that every 3D EDIT element is a main-line FIT assessment point.

An element is included only when its global enrichment contains:

```text
property = FIT_ASSESSMENT_POINT
value = true
```

Example:

```json
{
  "canonicalId": "CANON-001",
  "property": "FIT_ASSESSMENT_POINT",
  "value": true,
  "source": "VIB-REVIEW-01"
}
```

This marker is an assessment-location decision, not method qualification.

## 4. Required geometry evidence

For each assessment point, READY status requires global enrichment for:

```text
OUTSIDE_DIAMETER
WALL_THICKNESS
MAX_UNSUPPORTED_SPAN
```

Each must contain a finite numeric value and explicit unit.

Example:

```json
{
  "canonicalId": "CANON-001",
  "property": "OUTSIDE_DIAMETER",
  "value": 168.3,
  "unit": "mm",
  "source": "PIPE-DATA"
}
```

Optional geometry evidence:

```text
INSIDE_DIAMETER
NATURAL_FREQUENCY
```

The planner intentionally does **not** derive outside diameter or wall thickness from:

```text
DN
NPS
Schedule
Material
Catalogue name
nearest nominal size
```

A future qualified catalogue resolver may provide that enrichment upstream of the planner. Until then, missing OD/wall remains `NOT_READY`.

## 5. Natural frequency resolution

`NATURAL_FREQUENCY` is optional.

Resolution order is explicit:

```text
case-specific enrichment
  -> if present, CASE_SPECIFIC
else global enrichment
  -> GLOBAL
else
  -> NOT_PRESENT
```

The selected source is recorded in `sourceTrace.geometry.naturalFrequency.selection`.

No default natural frequency is introduced.

## 6. Operating-case requirements

Operating cases come from the dataset and retain their original value/unit/source authority.

### All supported phases

Required:

```text
phase
density
massFlow OR velocity
```

Supported phases:

```text
LIQUID
GAS
MULTIPHASE
```

### GAS

Additional required field:

```text
dynamicViscosity
```

### MULTIPHASE

Facility Plan v1 supports the aggregate-effective process shape only:

```text
multiphaseResolutionMode = AGGREGATE_EFFECTIVE
```

The generated request uses line operating-case effective density and either mass flow or velocity.

Component-derived multiphase request planning is deferred until `VibrationIntegrityDataset` has a controlled component gas/liquid operating-case schema.

## 7. Mass flow versus velocity

When an operating case contains velocity, the planner uses velocity as the explicit FIT flow input.

If both velocity and mass flow are present:

```text
flowSelection = VELOCITY_OVERRIDE
alternateMassFlowPresent = true
```

The generated request includes `fluidVelocity` and omits `massFlow` so the downstream request contains only the selected hydraulic path.

When velocity is absent and mass flow is present:

```text
flowSelection = MASS_FLOW
```

The generated request contains mass flow.

This mirrors the FIT domain's explicit velocity-override behavior without silently passing an unused alternate value.

## 8. READY request

A READY plan item contains:

```text
status = READY
calculationId = VIB.FIV.FLOW_TURBULENCE
canonicalId
line
caseId
missing = []
invalid = []
request
sourceTrace
```

Request example:

```json
{
  "calculationId": "VIB.FIV.FLOW_TURBULENCE",
  "inputs": {
    "phase": "GAS",
    "outsideDiameter": 168.3,
    "wallThickness": 7.11,
    "maximumUnsupportedSpan": 6.4,
    "density": 8.1,
    "fluidVelocity": 35,
    "gasDynamicViscosity": 0.019
  },
  "inputUnits": {
    "outsideDiameter": "mm",
    "wallThickness": "mm",
    "maximumUnsupportedSpan": "m",
    "density": "kg/m3",
    "fluidVelocity": "m/s",
    "gasDynamicViscosity": "cP"
  },
  "options": {
    "qualificationMode": "benchmark",
    "includeEvidence": true
  }
}
```

The planner preserves source units. The centralized input-resolution layer performs conversions.

## 9. NOT_READY request

If required evidence is missing or invalid:

```text
status = NOT_READY
request = null
missing[]
invalid[]
reasons[]
```

Examples:

```text
missing = [maximumUnsupportedSpan]
missing = [dynamicViscosity]
missing = [phase]
missing = [massFlowOrVelocity]
invalid = [wallThickness]
```

The planner does not create a partial executable request.

## 10. Assessment point without line/case

If an explicit assessment point belongs to an element with no line:

```text
status = NOT_READY
caseId = null
missing = [line, operatingCase]
reason = ASSESSMENT_POINT_HAS_NO_LINE
```

If the line exists but no operating cases exist:

```text
status = NOT_READY
caseId = null
missing = [operatingCase]
reason = LINE_HAS_NO_OPERATING_CASES
```

The assessment location therefore remains visible in the workflow rather than disappearing from facility completeness reporting.

## 11. Source trace

Every plan item records the evidence selected to build it.

```text
sourceTrace.assessmentPoint
sourceTrace.operatingCase
sourceTrace.geometry.outsideDiameter
sourceTrace.geometry.wallThickness
sourceTrace.geometry.insideDiameter
sourceTrace.geometry.maximumUnsupportedSpan
sourceTrace.geometry.naturalFrequency
```

Operating-case trace includes:

```text
source
sourceRevision
recordId
flowSelection
alternateMassFlowPresent
```

Geometry trace retains enrichment source/revision/record/status/reviewer and selection basis.

## 12. Determinism

Plan items are ordered by:

```text
line
canonicalId
caseId
```

The same dataset produces the same plan ordering.

## 13. Limited exchange behavior

If the source dataset was intentionally assembled from `LIMITED_ELEMENTS_ONLY` CSV, the plan carries:

```text
warning = LIMITED_EXCHANGE_INPUT
```

This warning does not block planning by itself because the earlier dataset assembly stage already required explicit opt-in to limited input.

It also does not upgrade the missing upstream provenance.

## 14. Next execution layer

The next safe layer is a facility benchmark executor:

```text
VibrationFacilityFitPlan.v1
  -> READY requests only
  -> central calculateEngineeringBatch()
  -> preserve NOT_READY records without calculation
  -> table result rows by line/case/Canonical ID
```

That executor must use the exact requests emitted by this planner and the same central FIT kernel used by the Console.

It must not implement equations, convert benchmark mode into screening mode, or turn `NOT_READY` into a numerical zero.
