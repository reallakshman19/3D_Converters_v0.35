# CII Ver14 → Ver11 — Error 239 Structural Dry Run

## Scope

This dry run was requested after the repaired Ver14 → Ver11 converter still produced a CAESAR II `irrecoverable error 239` when the generated Ver11 file was used.

Baseline:

- repository: `reallaksh19/3D_Converters`
- baseline commit: `042025bfe3f9c60ba11d8c653f98af78ac587a64`
- paired oracle: `Benchmarks/v11-v14.zip`
- native pair: `SYS-0001-v14.CII` and `SYS-0001-v11.cii`

The CAESAR error number itself is treated as opaque. The dry run searches for objective violations of the legacy neutral-file grammar.

## Pair envelope

The pair represents the same 112-element model. Section order and CONTROL counts agree. The principal already-qualified row-count deltas are:

- `SIF&TEES`: Ver14 14 rows/record, Ver11 10 rows/record;
- `REDUCERS`: Ver14 2 rows/record, Ver11 1 row/record;
- `ALLOWBLS`: Ver14 28 rows/record, Ver11 26 rows/record when present.

The converter already reproduced the paired Ver11 section row counts and line lengths, so the remaining investigation was moved below the row-count level.

## Structural defect found — mixed I13/G13.6 records were flattened to REAL

`MISCEL_1` ends with four execution-option records. These are mixed fixed-format records. Integer switch fields are written/read with `I13`; real fields use `G13.6`.

Native Ver14 benchmark tail:

```text
              0            0            0            2 0.000000E+00            0
              0            0 2.100309E+01 2.159827E+01            0            0
              0            0            0            0 2.500000E-01            3
              0
```

Native Ver11 benchmark tail:

```text
              0            0            0            0     0.000000            0
              0            0      21.0000     0.000000            0            0
              0            0            0            0            0            0
              3
```

The values are not expected to be identical because execution settings/defaults can differ between the two native exports. The structural invariant is the field grammar.

Before this repair, `_generic_numeric_convert()` detected a decimal/scientific token anywhere on a row and re-rendered **all** numeric tokens as REAL. Applied to the actual Ver14 benchmark tail, it generated:

```text
       0.000000     0.000000     0.000000      2.00000     0.000000     0.000000
       0.000000     0.000000      21.0031      21.5983     0.000000     0.000000
       0.000000     0.000000     0.000000     0.000000     0.250000      3.00000
              0
```

The rows remain 80 columns long, so the previous row-count/line-length validator accepts them. However, fields that belong to `I13` are now lexical reals such as `0.000000`, `2.00000`, and `3.00000`. A fixed-format FORTRAN integer read cannot treat that as a valid `I13` record.

This is a concrete target-dialect structural defect and is capable of explaining a CAESAR reader failure even though the generated file passes the previous repository structure gate.

## Repair

The generic numeric adapter now distinguishes lexical integer and real tokens.

If a physical row contains both integer and real tokens, it is a mixed fixed-format record and is preserved byte-for-byte instead of being flattened into an all-REAL row.

This also protects other mixed `MISCEL_1` constructs such as hanger default records.

Pure all-REAL fixed records continue to be re-rendered for the target generation.

## Independent validation added

`cii_v11_v14_validate.py` now validates the four `MISCEL_1` execution-option records below the row-count level.

Confirmed `I13` fields must contain lexical integers. A generated value such as `0.000000` in one of these integer positions is rejected before the CII is offered for download.

The validator deliberately does not force the Ver14 source execution-option **values** to equal the paired Ver11 benchmark values. The benchmark is used to establish record grammar, not to overwrite model settings.

## Dry-run result

Using the actual paired benchmark execution tail:

```text
old generic formatter: 13 confirmed I13 positions become decimal REAL tokens → FAIL
repaired formatter:     0 confirmed I13 positions violate integer grammar      → PASS
native Ver14:            0 confirmed I13 violations                             → PASS
native Ver11:            0 confirmed I13 violations                             → PASS
```

The repaired behavior therefore removes a proven dialect-invalid transformation while preserving source engineering/execution settings.

## Regression gates

`test_cii_v11_v14_mixed_records.py` locks:

1. mixed execution-option records are preserved;
2. mixed hanger records are preserved;
3. pure all-REAL rows still convert;
4. paired Ver14 → generated Ver11 retains lexical integer grammar in the execution tail;
5. the independent target validator accepts the repaired pair;
6. a deliberately all-REAL-corrupted execution record is rejected.

## Remaining acceptance boundary

This repository dry run proves the fixed-record grammar defect and its repair. It does not assign an official meaning to CAESAR error 239.

Final qualification remains:

```text
actual Ver14 source
→ repaired converter
→ generated Ver11
→ CAESAR Ver11 import/use
→ save/export from CAESAR
→ compare re-export with generated target
```

If the same model still fails after this repair, the next dry-run gate is semantic validation of any non-zero auxiliary construct not exercised by the paired benchmark rather than another broad generic rewrite.
