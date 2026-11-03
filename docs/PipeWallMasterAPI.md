# Pipe Wall Master API

## Purpose

This module turns the existing project master `docs/Masters/NPS_OD_BORE_SCHEDULE_MASTER.tsv` into a reusable runtime API for exact pipe-wall lookup and for selecting the first available nominal wall that satisfies a calculated minimum ordered/nominal thickness.

It is intentionally independent of the B31.3 calculation module. A consuming module can pass `requiredNominalThicknessMm` directly, or pass a successful B31.3-shaped calculation object.

## Canonical source

```text
docs/Masters/NPS_OD_BORE_SCHEDULE_MASTER.tsv
blob SHA: 7e83f7283b4ca9f35a86a45c008ca0b52a053fcc
```

The source contains 42 NPS/DN rows and schedule columns `5, 5S, 10, 10S, 20, 30, STD, 40, 40S, 60, XS, 80, 80S, 100, 120, 140, 160, XXS`. The generated runtime registry contains **345 nonblank schedule-wall records**.

The source file does not record a standards edition. Runtime rows therefore use `sourceAuthority = PROJECT_MASTER`, `dataStatus = PROJECT_MASTER`, `edition = null`, and `standardAssignment = SCHEDULE_NAMESPACE_INFERENCE`.

Explicit `S` schedules (`5S`, `10S`, `40S`, `80S`) are assigned to the `ASME B36.19M` namespace; the remaining schedules are assigned to `ASME B36.10M`. This keeps the namespaces separate but is not a substitute for engineering verification against a controlled standard.

## Import

```js
import {
  lookupPipeWall,
  listPipeWallsForSize,
  selectRequiredPipeWall,
  selectPipeWallForCalculation,
  createPipeWallMaster,
  validatePipeWallMaster,
} from './converters/pipe-wall-master/index.js';
```

## Exact lookup

```js
const hit = lookupPipeWall({
  dimensionStandard: 'ASME B36.10M',
  nps: 10,
  schedule: 'SCH 80',
});
```

This resolves NPS 10 / Sch 80 to the project-master wall and returns source provenance.

## Select first adequate wall

```js
const selected = selectRequiredPipeWall({
  dimensionStandard: 'ASME B36.10M',
  dn: 250,
  requiredNominalThicknessMm: 12.553618958106954,
});
```

Current project-master result:

```js
{
  ok: true,
  code: 'PIPE_WALL_SELECTED',
  requiredNominalThicknessMm: 12.553618958106954,
  selected: {
    dn: 250,
    nps: '10',
    nominalWallMm: 12.7,
    schedule: '60',
    equivalentSchedules: ['60', 'XS'],
    marginMm: 0.14638104189304535
  }
}
```

Selection is deterministic: exact standard namespace, exact NPS/DN, ascending wall thickness, then the smallest `nominalWallMm >= requiredNominalThicknessMm`. No schedule interpolation is performed. If several designations have the same selected wall, all are returned in `equivalentSchedules`.

## B31.3-shaped integration

```js
const selected = selectPipeWallForCalculation({
  calculation: b313Result,
  dimensionStandard: 'ASME B36.10M',
  dn: 250,
});
```

`calculation` must contain `{ ok: true, requiredNominalThicknessMm: <positive number> }`. The pipe-wall module does not import the B31.3 module, so the dependency stays one-way.

## A106 Grade B benchmark selection

| DN | Required nominal mm | Selected wall mm | Preferred schedule | Equivalent designation(s) |
|---:|---:|---:|---|---|
| 15 | 7.3016 | 7.4676 | XXS | XXS |
| 20 | 7.4143 | 7.8232 | XXS | XXS |
| 25 | 7.5541 | 9.0932 | XXS | XXS |
| 40 | 7.8650 | 10.1600 | XXS | XXS |
| 50 | 8.1154 | 8.7376 | 160 | 160 |
| 80 | 8.7121 | 11.1252 | 160 | 160 |
| 100 | 9.2422 | 11.1252 | 120 | 120 |
| 150 | 10.3689 | 10.9728 | 80 | 80 / XS |
| 200 | 11.4289 | 12.7000 | 80 | 80 / XS |
| 250 | 12.5536 | 12.7000 | 60 | 60 / XS |
| 300 | 13.6136 | 14.2748 | 60 | 60 |
| 350 | 14.2772 | 15.0876 | 60 | 60 |

These are selections from the **existing project master**, not a newly asserted ASME table.

## Qualification status gate

By default the API accepts `PROJECT_MASTER`, `VERIFIED`, and `PROJECT_APPROVED` rows. A design-authority consumer can enforce a stricter gate:

```js
const strict = createPipeWallMaster({
  acceptedDataStatuses: ['VERIFIED', 'PROJECT_APPROVED'],
});
```

With the current TSV, strict mode intentionally has no active rows because row-level controlled-standard verification is not recorded in the source.

## Generation

Runtime data must not be hand-edited:

```bash
node scripts/generate-pipe-wall-master.mjs --check
node scripts/generate-pipe-wall-master.mjs --write
```

`--check` fails if the runtime registry differs from the canonical TSV.

## Failure codes

`PIPE_WALL_LOOKUP_INVALID`, `PIPE_WALL_LOOKUP_MISS`, `PIPE_WALL_LOOKUP_CONFLICT`, `PIPE_WALL_SIZE_INVALID`, `PIPE_WALL_SIZE_MISS`, `INVALID_REQUIRED_NOMINAL_THICKNESS`, `NO_ADEQUATE_PIPE_WALL`, `INVALID_THICKNESS_CALCULATION`.

## Existing authority boundary

This module does not change DTXR/direct-source wall authority, piping-class resolution, B31.3 arithmetic, or any existing XML/CII behavior. Adoption should be explicit in a later consuming-module PR.
