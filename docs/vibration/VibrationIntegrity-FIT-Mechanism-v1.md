# Vibration Integrity — FIT Mechanism Detail v1

## Purpose

This document defines the Stage-4 presentation and traceability contract for the implemented Flow-Induced Turbulence (FIT) mechanism inside the line-centric Vibration Integrity workspace.

FIT remains the only executable vibration mechanism in the workspace. This stage does not change the numerical method, coefficients, applicability rules, LOF semantics, method revision, qualification state or engineering authority.

```text
calculationState      = IMPLEMENTED
qualificationState    = BENCHMARK_ONLY
engineeringAuthority  = NONE
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
```

## Architecture

```text
Engineering basis working state
  -> existing FIT facility plan
  -> central Engineering Calculation API
  -> existing calculateFit() domain result
  -> central FIT adapter trace envelope
  -> VibrationWorkspaceFitDetail.v1
  -> Calculation tab
```

The Calculation tab is a renderer only. It does not derive, normalize, classify or recalculate engineering values.

## Stable FIT correlation IDs

Stable correlation identity is supplied by the non-numerical FIT trace layer:

```text
FIT.STD.STIFF.v1
FIT.STD.MEDIUM_STIFF.v1
FIT.STD.MEDIUM_SMALL.v1
FIT.STD.MEDIUM_LARGE.v1
FIT.STD.FLEXIBLE_SMALL.v1
FIT.STD.FLEXIBLE_LARGE.v1
FIT.ADV.FLEXIBLE_SMALL.v1
FIT.ADV.FLEXIBLE_LARGE.v1
```

The trace layer receives an already-calculated correlation object and attaches only stable identity/path metadata. It contains no correlation coefficients, diameter/span logic or numerical formula.

Unknown path/category combinations fail closed.

## Central adapter trace

For a successful benchmark-mode FIT result, the Engineering Calculation adapter exposes:

```text
outputs
  standardFv
  standardLof
  refinedLof
  governingReferenceLof
  referenceThreshold
  referenceThresholdExceeded
  referenceBand

intermediates
  hydraulics
  excitation
  support
  standard
  standardCorrelation
  advancedEligibility
  advanced
  advancedCorrelation

evidence
  equationIds
  correlationIds
  inputResolution
  qualificationCoverage
  screeningCandidate
```

### Hydraulics

Backend-provided fields include:

- inside diameter and its source;
- flow area;
- gas/liquid/aggregate volumetric flow;
- velocity and its source;
- multiphase resolution mode/selection;
- alternate-mode-data flag.

### Excitation / demand

Backend-provided fields include:

- density and its source;
- `rhoV2`;
- gas viscosity factor;
- standard demand.

The UI displays `rhoV2`; it does not calculate `density * velocity^2`.

### Support

Backend-provided fields include:

- stiffness;
- support category;
- stiff / medium-stiff / medium span boundaries.

### Standard correlation

Backend trace includes:

- stable correlation ID;
- path = `STANDARD`;
- support category;
- form;
- coefficients `a` and `b`;
- reference `Fv`;
- standard LOF from outputs.

### Advanced path

The UI distinguishes:

```text
eligible
not eligible + explicit reason
eligible + advanced correlation calculated
```

Backend trace includes:

- advanced eligibility boolean;
- eligibility reason;
- declared natural-frequency range when relevant;
- natural frequency used when advanced calculation executes;
- advanced correlation ID/category/form/coefficients/Fv;
- advanced LOF from outputs.

Absence of an advanced result never becomes zero.

## Normalized engineering inputs

The Calculation tab exposes the central engine's `resolvedInputs` records:

```text
key
working value
working unit
canonical value
canonical unit
transformation
resolution source
```

This is the normalization performed by the central Engineering Calculation API. The UI does not repeat unit conversion.

Combined with the Stage-3 Engineering-basis source anchors and existing Source tab, the trace chain is:

```text
source working cell
  -> prepared request
  -> resolved/canonical input
  -> FIT intermediate
  -> correlation/equation identity
  -> result
```

## Detail tabs

The selected-row detail contract is now:

```text
Summary
Inputs
Calculation
Case
Evidence
Source
Diagnostics
```

`Calculation` is specifically the FIT mechanism calculation trace for the currently selected result row.

## Evidence and provenance

The Calculation tab shows backend-provided:

- calculation ID;
- method revision;
- execution ID/timestamp/implementation revision;
- qualification state;
- engineering authority;
- equation IDs;
- correlation IDs;
- qualification-coverage ID;
- screening-candidate scope ID;
- retained workbook repository, commit, path, blob and sheet.

These fields are traceability metadata, not a screening authorization claim.

## Numerical authority boundary

Stage 4 intentionally does **not** modify:

- `converters/vibration/fit/method.js`;
- correlation coefficients;
- support classification equations;
- FIT applicability boundaries;
- `calculateFit()` numerical expressions;
- reference-band thresholds;
- advanced eligibility rules;
- benchmark targets or tolerance;
- non-FIT numerical mechanisms.

Stable correlation IDs are added outside the numerical method in `converters/vibration/fit/trace.js` and consumed by the central FIT adapter.

## Validation

Permanent Stage-4 regressions:

```text
tests/vibration-fit-correlation-trace.test.mjs
tests/vibration-integrity-fit-mechanism.test.mjs
tests/vibration-integrity-detail-view.test.mjs
```

They pin:

- exact eight stable correlation IDs;
- value-preserving correlation trace;
- fail-closed unknown trace branch;
- no numerical formulas in the trace module;
- central-adapter production consumption;
- advanced eligibility exposure;
- workspace FIT detail extraction;
- Calculation tab rendering of normalized inputs/intermediates/evidence;
- no solver calls or engineering formulas in the FIT view;
- explicit benchmark-only/non-authorizing semantics.

The tests are part of:

```bash
npm run verify:vibration-fit-release
```

After Stage 4 the controlled manifest contains 36 test files.

## Next roadmap stage

After exact-head release/browser validation, proceed to Stage 5 — Generic mechanism qualification framework.

That framework must have FIT as a real production consumer and must not introduce a second numerical mechanism until its source/method/independent qualification evidence is controlled.
