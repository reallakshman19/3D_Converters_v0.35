# CAESAR CII Ver14 → Ver11 Import RCA

## Status

Engineering repair branch: `agent/fix-cii-v14-v11-import-rca`

Baseline: `main` at `1cb28819e3dbb9ea204ad432f32b8bffffdfc6bb`.

The reported symptoms were:

1. generated Ver11 CII triggers a CAESAR irrecoverable import error;
2. Ver14 → Ver11 conversion reports many SIF&TEES loss events and the resulting tee/SIF data appears lost.

The symptoms were investigated independently and multiple concrete format/semantic defects were found.

## RCA-1 — SIF&TEES was treated as a flat row array instead of two semantic tee slots

The previous adapter used:

```text
Ver11 record = 10 rows
Ver14 record = 14 rows
Ver14 → Ver11 = keep record[0:10]
Ver11 → Ver14 = append four zero rows
```

That is structurally and semantically wrong.

CAESAR's neutral-file contract stores **two tee slots per SIF&TEES auxiliary**:

```text
Ver11: tee #1 = 5 rows / 30 values
       tee #2 = 5 rows / 30 values
       total   = 10 rows

Ver14: tee #1 = 7 rows / 42 values
       tee #2 = 7 rows / 42 values
       total   = 14 rows
```

The old `record[:10]` projection retained all seven Ver14 rows of tee #1 and only the first three rows of tee #2. Ver14-only tee #1 values were therefore written into the physical location where Ver11 expects tee #2 legacy data.

The reverse conversion was also wrong: four extension rows were appended after the complete legacy record instead of being associated with the two independent tee slots.

### RCA-1A — axial and torsional SIF fields also change positions

The two generations do not have a field-for-field identity even inside their common data.

```text
Legacy/Ver11 item 15 = torsional SIF
Legacy/Ver11 item 16 = axial SIF

Ver14 item 15 = axial SIF
Ver14 item 16 = torsional SIF
```

A correct converter must therefore swap those two positions when crossing generations. Row slicing alone cannot preserve engineering meaning.

Ver14 also introduces B31J/version-owned SIF data in fields for which there is no qualified legacy semantic slot, including the surface-node/geometry region. Those fields cannot be silently copied into spare or differently-owned Ver11 positions.

### Repair

SIF conversion is now owned by `cii_v11_v14_sif.py` and is field-semantic rather than row-semantic.

For each of the two tee slots independently:

```text
common fields 1-14  → direct
Ver14 item 15 axial → Ver11 item 16 axial
Ver14 item 16 torsion → Ver11 item 15 torsion
common fields 17-18 → direct
common fields 23-26 → direct
unqualified/version-owned positions → zero in target; non-zero source fails closed unless explicit loss is allowed
```

The reverse map applies the same engineering-meaning rule and refuses to guess if a legacy-only/ambiguous field is non-zero.

This prevents both failure modes in the old implementation:

1. tee #1 extension data can no longer displace tee #2;
2. axial and torsional SIF values can no longer be silently exchanged.

## RCA-2 — ALLOWBLS row-count delta was not converted

The previous adapter had no ALLOWBLS-specific conversion and sent the section through generic numeric reformatting.

The neutral-file record sizes differ:

```text
Ver11: 153 values = 26 rows
Ver14: 168 values = 28 rows
```

A non-zero Ver14 allowable block could therefore remain 28 rows after the file was labelled Ver11. CONTROL still counts allowable **records**, so the target reader sees a record-envelope mismatch.

### Repair

`_convert_allowables()` now performs an explicit 168 ↔ 153 value projection:

```text
14 → 11: preserve items 1-153; remove items 154-168
11 → 14: preserve items 1-153; append zero items 154-168
```

Non-zero items 154-168 require the explicit lossy option and are listed in the audit.

## RCA-3 — generated target was not independently validated

The previous converter validated section order before conversion but did not independently validate the generated target before returning it to the browser.

The repair adds `cii_v11_v14_validate.py`:

- source v14 is checked against CONTROL-driven record counts with explicit Ver14 deltas;
- generated v11 is checked using the established `cii2019_section_rules.py` authority;
- generated output is blocked before download if target section counts/order/MISCEL_1/UNITS do not satisfy the target profile.

This is deliberately independent of the converter's own row-transform functions so a transform cannot self-certify its own malformed result.

## Browser custody

The worker now loads:

- `cii_v11_v14_sif.py`;
- `cii_v11_v14_validate.py`;
- `cii2019_section_rules.py`.

The worker URL and the full Model Converters parent cache chain are advanced so deployed browsers cannot legally retain the pre-RCA converter.

## Qualification tests

`test_cii_v11_v14.py` now includes regressions for:

1. paired benchmark conversion;
2. generated Ver11 independent structure validation;
3. two independent SIF/TEE slot mappings;
4. explicit axial/torsional item 15/16 semantic swap in both directions;
5. zeroing / fail-closed handling of unqualified Ver14 SIF/B31J fields;
6. rejection of non-zero ambiguous legacy-only SIF fields on Ver11 → Ver14;
7. ALLOWBLS 168 → 153 value preservation;
8. ALLOWBLS non-zero extension loss gate;
9. ALLOWBLS 153 → 168 extension placement;
10. malformed source Ver14 SIF record rejection;
11. existing reducer extension and restraint sentinel checks.

The UI static test also proves the repaired worker and validator path is part of the live cache chain.

## Qualification boundary

Repository-level fixed-record qualification and benchmark regression can establish that the generated neutral file has the expected target structure and that the explicitly mapped SIF fields retain their qualified engineering meaning.

The final external acceptance gate remains:

```text
Ver14 source
  → repaired converter
  → generated Ver11
  → actual CAESAR Ver11 import
  → save/export from CAESAR
  → semantic/record comparison
```

That CAESAR runtime round-trip is `NOT_RUN` in the repository environment and must not be represented as passed until performed with the installed CAESAR application.

## References used for the record-layout RCA

- Hexagon CAESAR II Users Guide, Version 14 — Auxiliary Element Data (`SIF&TEES`, `ALLOWBLS`, `REDUCERS`).
- Hexagon CAESAR II Users Guide, Version 12 — Auxiliary Element Data (legacy SIF/TEE and ALLOWBLS profile).
- Repository paired benchmark: `Benchmarks/v11-v14.zip`.
- Repository target validator: `converters/scripts/cii2019_section_rules.py`.
