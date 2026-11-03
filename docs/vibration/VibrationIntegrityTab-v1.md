# Vibration Integrity Tab v1

## Purpose

The Vibration Integrity workspace is the table-first vibration product surface reached through the existing Engineering Calculations / Vibration & Dynamic Screening flow.

It is line-centric, mechanism-aware and explicitly benchmark-only. There is no standalone 3D/canvas/model runtime in this product surface.

## Authority

The workspace always represents:

```text
FIT calculationState      = IMPLEMENTED
FIT qualificationState    = BENCHMARK_ONLY
engineeringAuthority      = NONE
screeningAuthority        = NOT_AUTHORIZED
designAuthority           = false

all non-FIT mechanisms    = NOT_IMPLEMENTED
```

No blank mechanism cell means zero, pass, safe or not applicable.

## Primary workflow

```text
Load source / benchmark
  -> Engineering basis
  -> FIT readiness
  -> Run FIT benchmark
  -> facility mechanism matrix
  -> selected-row detail / trace
  -> Source Data
```

## Controlled FIT benchmarks

Five retained EI FIT cases can be loaded through **Load BENCHMARK**. They populate the same authoritative topology, operating and enrichment working tables used for project data.

Official benchmark parity is available only when the controlled input state is unchanged and the result is `CURRENT_RESULT`.

After engineering mutation:

```text
benchmark = modified
result    = STALE_RESULT (when a prior result exists)
parity    = not applicable/current claim disabled
export    = disabled
```

Reload or rerun as appropriate to restore current evidence.

## Canonical working state

The backing tables retain:

- stable source/local row IDs;
- original and working values;
- edit count / dirty state;
- exact cell/table revert;
- central unit-aware edits where quantity meaning is controlled;
- fail-closed unknown numeric unit semantics.

The first topology mutation latches local Elements-only authority. Value revert does not silently restore certified XLSX authority; explicit source reload is required.

## Engineering basis

The primary editor is `VibrationEngineeringBasisProjection.v1`.

It joins using the same semantics as production FIT planning:

```text
Topology Canonical ID
  -> topology Line
  -> global FIT_ASSESSMENT_POINT=true
  -> operating cases on that line
```

Case-specific natural frequency overrides global natural frequency.

The projection is not a second store. Every editable projected field points to an exact backing table row ID and column and reuses the raw-table mutation contract.

Identity fields are source-controlled/read-only in the joined projection until an atomic cross-table identity-edit contract is designed.

## Source Data

Raw tables remain available as secondary Source Data:

```text
Topology · Elements working table
Operating cases
Vibration enrichment
```

They remain import/storage authority and retain row add/delete/table-revert operations.

Projected source links navigate to deterministic raw-cell anchors based on table kind + stable row ID + column.

## Readiness versus calculation

`Check readiness` performs input-contract/completeness assessment only. It does not execute FIT calculations or display LOF values.

`Run FIT benchmark` invokes the existing table facility workflow, which delegates to the central Engineering Calculation API.

The UI never calls `calculateFit()`, `calculateEngineering()` or `calculateEngineeringBatch()` directly.

## Facility mechanism matrix

The register is line-centric and exposes the retained EI mechanism columns.

Only FIT may currently show a calculated value. Non-FIT mechanisms remain `NOT_IMPLEMENTED`.

`Implemented governing` means governing only among mechanisms that actually execute; it is not a full vibration-screening governing result.

## Selected-row detail

The detail tabs are:

```text
Summary
Inputs
Calculation
Case
Evidence
Source
Diagnostics
```

### Calculation

The Calculation tab is the explicit FIT mechanism detail.

It renders only central-result data:

- normalized/resolved inputs;
- hydraulics;
- `rhoV2` and standard demand;
- support/stiffness classification;
- standard correlation ID/form/coefficients/Fv;
- advanced eligibility and reason;
- advanced correlation when calculated;
- standard/refined/governing reference LOF;
- equation and correlation IDs;
- method/execution/source provenance.

The UI does not recompute any of these values.

Stable correlation IDs are provided by a non-numerical backend trace layer:

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

See `docs/vibration/VibrationIntegrity-FIT-Mechanism-v1.md`.

### Generic mechanism assessment contract

Stage 5 wraps the existing FIT result in `VibrationMechanismAssessmentItem.v1` / `VibrationMechanismAssessmentSet.v1` without changing the FIT numerical path. FIT currently has one `mainline` child item; each non-FIT mechanism has zero items and remains `NOT_IMPLEMENTED`.

Summary exposes set/item identity, child cardinality, implementation/assessment/result currency, benchmark state and input-trace completeness. Inputs exposes exact Stage-3 working-cell/source anchors where real backing pointers exist. Missing pointers are never synthesized.

A stale FIT result remains inspectable evidence but is excluded from current `Implemented governing`. Only `CURRENT_RESULT` may be current governing or benchmark PASS/FAIL.

See `docs/vibration/VibrationMechanismQualificationFramework-v1.md`.

## Run snapshot

Successful execution records `FitRunSnapshot.v1` with SHA-256 over the authoritative working-input/evidence state before execution.

Current and stale result state remains independent of presentation-only filter/sort/detail changes.

## Validation

Controlled release command:

```bash
npm run verify:vibration-fit-release
```

The Stage-5 manifest contains 39 controlled test files.

Exact-head browser checks remain required for source navigation, editing/revert, stale/current transition, wide mechanism matrix and Calculation detail before merge/authority closure.

## Non-goals

- no new Engineering navigation item;
- no 3D/canvas/model editor;
- no UI-side engineering calculation;
- no local topology re-certification;
- no universal score / safe / pass claim;
- no FIT numerical-method change in Stages 4–5;
- no non-FIT solver;
- no screening/design authority promotion.
