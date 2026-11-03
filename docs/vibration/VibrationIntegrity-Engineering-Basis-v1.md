# Vibration Integrity — Engineering Basis Projection v1

Status: implemented architecture stage on PR #442  
Authority: FIT `BENCHMARK_ONLY`; screening/design authority not authorized  
Projection schema: `VibrationEngineeringBasisProjection.v1`

## Purpose

The **Engineering basis** is the primary line/case editing surface for the Vibration Integrity workspace. It is a pure joined projection of the existing authoritative working tables:

```text
Topology Elements
Operating cases
Vibration enrichment
        |
        v
VibrationEngineeringBasisProjection.v1
```

It is **not** a second editable data store. Every projected editable field contains an exact pointer to its backing working-table row/cell. The existing input model remains the only mutation authority.

## Join contract

The projection intentionally mirrors the production FIT facility-plan join:

```text
Topology canonical ID
  -> topology line
  -> global FIT_ASSESSMENT_POINT=true enrichment marker
  -> every operating case on that topology line
```

Natural-frequency selection matches production planning:

```text
case-specific NATURAL_FREQUENCY
  else global NATURAL_FREQUENCY
  else NOT_PRESENT
```

The enrichment `Line` text does not override topology line identity.

## Primary projected fields

### Identity — source controlled

- Line
- Operating Case
- Canonical ID

Identity is displayed read-only in the joined projection because it participates in cross-table joins. Identity changes remain explicit Source Data operations until a future atomic identity-edit contract is implemented.

### Shared process basis — editable

- Phase
- Mass flow + unit
- Density + unit
- Pressure + unit
- Pressure reference
- Temperature + unit
- Dynamic viscosity + unit
- Velocity + unit

These values point directly to `VibrationOperatingCaseCsv.v1` cells.

### FIT basis — editable current-mechanism fields

- outside diameter
- wall thickness
- inside diameter
- maximum unsupported span
- natural frequency

These fields point directly to `VibrationEnrichmentCsv.v1` rows. They remain explicitly grouped as **FIT basis · current mechanism** so they are not misrepresented as universal vibration inputs.

## Edit semantics

Projected inputs reuse the same DOM mutation attributes as Source Data:

```text
data-vi-table-cell
data-vi-edit-row
data-vi-edit-column
data-vi-row-id
```

Therefore existing production behavior remains authoritative:

1. edit writes to the backing table;
2. original/working state updates there;
3. known value/unit pairs use the central engineering unit layer;
4. unknown numeric enrichment-unit semantics fail closed;
5. benchmark modified state is recalculated from backing-table dirtiness;
6. current results become `STALE_RESULT` after engineering edits;
7. the projection is regenerated from backing state on render.

There is no projection-side calculation or conversion.

## Original / working evidence

The primary editor displays edited state from `vibrationIntegrityInputCellState()`.

A projected revert action routes to the same backing-cell revert contract as Source Data. Quantity revert uses the Stage-2 paired value/unit behavior.

## Source navigation

Each projected field exposes a `source` link. The link target is generated from:

```text
backing table kind
stable backing row ID
backing column index
```

The Source Data input uses the same generated ID. This provides deterministic navigation from joined field to exact raw backing cell without storing a second source-location map.

## Source Data

The raw tables remain below the primary Engineering basis under a dedicated **Source Data** section:

- Topology · Elements working table
- Operating cases
- Vibration enrichment

They remain the import/storage contracts and support row add/delete/table revert operations that are not safe to infer from a joined view.

## Missing data

The projection does not manufacture missing rows.

Examples:

- assessment point with no operating case remains visible with blank/non-editable process fields;
- missing enrichment property remains blank;
- missing identity/join data is not synthesized;
- Source Data is the explicit place to add missing rows/evidence.

Readiness remains the authority for reporting missing/invalid FIT request evidence.

## Engineering authority boundary

The projection changes presentation and editing only.

It does not change:

- FIT equations;
- support/correlation selection;
- LOF calculation;
- qualification mode;
- source authority;
- screening/design authority;
- non-FIT mechanism implementation state.

The UI still never calls numerical calculation APIs directly.

## Validation contract

Permanent Stage-3 regression:

```text
tests/vibration-integrity-engineering-basis.test.mjs
```

It pins:

- production-equivalent topology-line/assessment/case join;
- case-specific natural-frequency precedence;
- exact backing-cell pointers;
- stable source-cell anchors;
- fail-closed missing operating-case behavior;
- primary Engineering basis + secondary Source Data UI architecture;
- no direct numerical solver authority in the new view.

The test is included in `npm run verify:vibration-fit-release`.

## Next roadmap stage

After current-head release/browser validation, proceed to **Roadmap Stage 4 — FIT mechanism extraction**:

- keep the existing numerical kernel;
- make FIT an explicit mechanism detail module;
- expose backend-provided hydraulic/support/correlation/equation evidence;
- retain the shared Engineering basis as the upstream line/case working surface.
