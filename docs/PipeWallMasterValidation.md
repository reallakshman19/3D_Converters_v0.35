# Pipe Wall Master — Validation Record

## Qualification status

```text
CANONICAL_TSV_TO_RUNTIME_SYNC: PASS
STRUCTURAL_MASTER_VALIDATION: PASS
GENERIC_SELECTION_BENCHMARK: PASS
A106_B31.3_TO_MASTER_SELECTION_BENCHMARK: PASS
INDEPENDENT_PYTHON_SELECTION_ORACLE: PASS
CONTROLLED_STANDARD_ROW_VERIFICATION: NOT YET RECORDED IN SOURCE
```

The software reliably reproduces and selects from the existing project master, but the source TSV does not contain a controlled ASME edition or row-by-row engineering sign-off.

## Source identity

```text
source: docs/Masters/NPS_OD_BORE_SCHEDULE_MASTER.tsv
Git blob SHA: 7e83f7283b4ca9f35a86a45c008ca0b52a053fcc
source authority: PROJECT_MASTER
```

The runtime registry is generated, never independently maintained.

## Coverage

```text
source size rows:        42
expanded wall rows:      345
unique wall keys:        345
sizes with wall data:    33
sizes without wall data: 9
structural errors:       0
source warnings:         1
```

The nine source sizes without schedule-wall data are NPS 52, 56, 60, 64, 66, 68, 72, 76, and 80.

## Source warning retained, not silently corrected

The validator identifies one OD unit-parity anomaly in the canonical source:

```text
source row:              7
NPS:                     2
DN:                      50
OD(mm) source:           60.0
OD(in) source:           1.9
1.9 in converted to mm:  48.26
difference:              11.74 mm
warning: SOURCE_OD_UNIT_PARITY_MISMATCH
```

The generated registry preserves the source values and records the warning. Selection is based on NPS/DN and nominal wall; the validator does not silently rewrite the canonical TSV.

## Structural checks

The validator checks required fields, conflicting duplicate `standard + NPS + schedule` keys, impossible `2 * wall >= OD` geometry, OD(mm)/OD(in) parity, and sizes with no wall data. Current structural result: **PASS with one source warning and zero errors**.

## Generic selection benchmark

Frozen dataset: `Benchmarks/PipeWallMaster/pipe-wall-selection-benchmarks.json`.

Five positive cases cover DN250 selection, exact-boundary selection, one-micron-above-boundary selection, B36.19M S-schedule namespace separation, and DN-based lookup. Three negative cases cover requirement above the largest wall, size with no wall data, and invalid zero requirement.

```text
generic positive cases: 5/5 PASS
generic negative cases: 3/3 PASS
```

## A106 Grade B B31.3-to-master benchmark

Frozen dataset: `Benchmarks/PipeWallMaster/a106-grb-b313-selection-benchmark.json`.

The 12 required nominal thicknesses come from the user-supplied A106 Grade B B31.3 DN benchmark and are treated here only as selection inputs.

| DN | Required mm | Selected mm | Schedule | Equivalent |
|---:|---:|---:|---|---|
| 15 | 7.301593 | 7.4676 | XXS | XXS |
| 20 | 7.414271 | 7.8232 | XXS | XXS |
| 25 | 7.554074 | 9.0932 | XXS | XXS |
| 40 | 7.864981 | 10.1600 | XXS | XXS |
| 50 | 8.115375 | 8.7376 | 160 | 160 |
| 80 | 8.712149 | 11.1252 | 160 | 160 |
| 100 | 9.242151 | 11.1252 | 120 | 120 |
| 150 | 10.368926 | 10.9728 | 80 | 80 / XS |
| 200 | 11.428930 | 12.7000 | 80 | 80 / XS |
| 250 | 12.553619 | 12.7000 | 60 | 60 / XS |
| 300 | 13.613623 | 14.2748 | 60 | 60 |
| 350 | 14.277168 | 15.0876 | 60 | 60 |

Recorded result: **12/12 PASS**.

## Independent oracle

`tools/pipe-wall-master-reference.py` reads the canonical TSV directly and repeats selection independently of production JavaScript.

```text
Pipe-wall independent generic benchmark passed: 5/5
A106 Gr B B31.3-to-master selection benchmark passed: 12/12
```

## Node qualification

```bash
node --test tests/pipe-wall-master-api.test.mjs
```

Recorded result: **26 passed, 0 failed**.

## Registry sync qualification

```bash
node scripts/generate-pipe-wall-master.mjs --check
```

Recorded result: `Pipe-wall runtime registry matches canonical TSV.`

## Exact requalification command set

```bash
node scripts/generate-pipe-wall-master.mjs --check
node --test tests/pipe-wall-master-api.test.mjs
python3 tools/pipe-wall-master-reference.py
```

## Required data-qualification follow-up

Before rows are labelled `VERIFIED` or `PROJECT_APPROVED`, engineering should record:

```text
Controlled source / standard: ______________________________
Edition: ___________________________________________________
NPS/DN/OD range checked: ___________________________________
Schedule columns checked: __________________________________
NPS 2 source OD discrepancy disposition: ___________________
Reviewer: __________________________________________________
Review date: _______________________________________________
Approval status: ___________________________________________
```

A later qualification update can promote approved rows/statuses without changing the lookup and selection API.
