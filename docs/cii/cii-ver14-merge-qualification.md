# CII Ver 14 Multi-File Merge — Qualification Record

## Scope

This record defines the initial fail-closed qualification boundary for `cii14_multi_merge.py`.
The implementation is a successor to the CII Ver 11 / CII 2019 merger and does not modify
`inputxml_to_cii2019.py` or `cii2019_section_rules.py`.

## Primary evidence

Repository benchmark: `Benchmarks/v11-v14.zip`

Paired files:

- `SYS-0001-v11.cii`
- `SYS-0001-v14.CII`

The pair represents the same 112-element model exported in the two neutral-file generations.

## Proven format deltas

| Contract | Ver 11 | Ver 14 | Ver 14 policy |
|---|---:|---:|---|
| VERSION release | 11 | 14 | require `5 / 14`; require equal full signature across merged inputs |
| Section sequence | 22 sections | 22 sections | retained as separate Ver 14 profile |
| ELEMENTS | 15 rows/record | 15 rows/record | qualified |
| BEND | 3 rows/record | 3 rows/record | qualified |
| RIGID | 1 row/record | 1 row/record | qualified |
| RESTRANT | 24 rows/record | 24 rows/record | qualified |
| SIF&TEES | 10 rows/record | **14 rows/record** | Ver 14 profile uses 14 |
| REDUCERS | 1 row/record | **2 rows/record** | Ver 14 profile uses 2 |
| UNITS | 28 rows | 28 rows | equal-unit gate within Ver 14 |
| ELEMENT auxiliary pointer rows | rows 12–14 | rows 12–14 | rebased after concatenation |

The paired benchmark also shows Ver 14 real fields serialized consistently in 13-column
scientific notation.  Identity fields changed by the merger are emitted using `13.6E`;
engineering payload not requiring identity modification is preserved from the source rows.

## Qualified non-zero constructs — v1

The initial merger supports the constructs that are non-zero in the paired Ver 14 benchmark:

- ELEMENTS
- NODENAME
- BEND
- RIGID
- RESTRANT
- SIF&TEES
- REDUCERS
- MISCEL_1 RRMAT plus global execution tail
- UNITS
- COORDS

For these constructs the merger performs only required identity operations:

- per-input node offset;
- element from/to node remap;
- qualified auxiliary node remap;
- 1-based auxiliary-pointer rebase;
- CONTROL aggregation;
- RRMAT repacking;
- COORDS merge/collision enforcement.

## Fail-closed constructs — not yet qualified

A non-zero count for any of the following blocks stops the merge:

- NOZZLES / VFLEX
- HANGERS
- EXPJT
- DISPLMNT
- FORCMNT
- UNIFORM
- WIND
- OFFSETS
- ALLOWBLS
- FLANGES
- EQUIPMNT
- non-empty AUX_DATA

These blocks must be released one-by-one only after a dedicated Ver 14 fixture establishes
record width, node-bearing fields, pointer semantics, global/default data, and round-trip behavior.

## Cross-version policy

Allowed:

- Ver 14 + Ver 14 with identical VERSION signature and compatible UNITS/global options.

Blocked:

- Ver 11 + Ver 14;
- Ver 14 files with different full VERSION signatures;
- incompatible UNITS;
- unintended global-node collisions;
- shared-node overlaps with conflicting coordinates.

Neutral-file generation conversion is explicitly outside the merger's responsibility.

## Regression gates

`test_cii14_multi_merge.py` locks:

1. paired Ver 11 / Ver 14 record-width deltas;
2. 112-element source profile;
3. Ver 14 self-merge using offsets `[0, 5000]`;
4. aggregate counts: 224 elements, 18 bends, 86 rigids, 80 restraints, 4 SIF/TEE records, 2 reducers;
5. element node remap and pointer rebasing for the second copy;
6. SIF node remap;
7. final Ver 14 section-rule validation;
8. cross-version rejection;
9. collision rejection;
10. rejection of an unqualified non-zero FLANGES record.

`tests/cii-ver14-merge-ui-static.test.mjs` locks the 3D Converters wiring, Pyodide script
selection, multi-file/offset controls, fail-closed policy disclosure, and cache identity.

## Next qualification increment

The next engineering increment should add purpose-built Ver 14 CAESAR fixtures for the currently
blocked auxiliary blocks.  Each fixture should be self-merged with a node offset and, where a
CAESAR runtime is available, imported and re-exported for neutral-file round-trip comparison.
