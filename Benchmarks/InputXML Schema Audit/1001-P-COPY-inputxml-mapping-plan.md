# 1001-P-COPY InputXML Schema Audit Mapping Plan

## Scope

This audit snapshot is grounded in the checked-in benchmark pair:

- `Benchmarks/INPUT XML to CII 2019/1001/1001-P - COPY_INPUT.XML`
- `Benchmarks/INPUT XML to CII 2019/1001/1001-P - COPY[BenchMark].CII`

The goal is to document the current schema signature for the `InputXML -> CII 2019` path without invoking any generator during the audit itself.

## Audit Result

- Status: `ok = true`
- Profile: `cii2019`
- Optional section warning: `NODENAME` is absent and accepted

## Section Order

The benchmark CII uses this ordered section signature:

1. `VERSION`
2. `CONTROL`
3. `ELEMENTS`
4. `AUX_DATA`
5. `BEND`
6. `RIGID`
7. `EXPJT`
8. `RESTRANT`
9. `DISPLMNT`
10. `FORCMNT`
11. `UNIFORM`
12. `WIND`
13. `OFFSETS`
14. `ALLOWBLS`
15. `SIF&TEES`
16. `REDUCERS`
17. `FLANGES`
18. `EQUIPMNT`
19. `MISCEL_1`
20. `UNITS`
21. `COORDS`

## Control-Derived Packing

The benchmark is internally consistent with the following block packing:

| Section | Rows | Rows per block | Derived blocks |
|---|---:|---:|---:|
| BEND | 18 | 3 | 6 |
| RIGID | 6 | 1 | 6 |
| EXPJT | 0 | 1 | 0 |
| RESTRANT | 48 | 24 | 2 |
| DISPLMNT | 60 | 20 | 3 |
| FORCMNT | 0 | 13 | 0 |
| UNIFORM | 0 | 6 | 0 |
| WIND | 0 | 1 | 0 |
| OFFSETS | 0 | 1 | 0 |
| ALLOWBLS | 26 | 26 | 1 |
| SIF&TEES | 10 | 10 | 1 |
| REDUCERS | 3 | 1 | 3 |
| FLANGES | 0 | 11 | 0 |
| EQUIPMNT | 24 | 6 | 4 |

## Key Metrics

- `ELEMENTS`: 22
- `BEND`: 6
- `RIGID`: 6
- `RESTRANT`: 2
- `DISPLMNT`: 3
- `ALLOWBLS`: 1
- `SIF&TEES`: 1
- `REDUCERS`: 3
- `EQUIPMNT`: 4
- `MISCEL_1`: present
- `UNITS`: present
- `COORDS`: present
- `NODENAME`: absent, optional

## Notes

- The audit is read-only. No generator was run to produce this snapshot.
- No production mapper logic is changed by this audit artifact.
- No PCF writer is changed by this audit artifact.
- No master mapper is changed by this audit artifact.
- No topology builder is changed by this audit artifact.
- The artifact is meant to be checked against the benchmark report and the benchmark CII only.

