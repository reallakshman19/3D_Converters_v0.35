# SBC Controlled Source / Trace Register v1 — structural scaffold

## Status

```text
artifactStatus       = SCAFFOLD_PRESENT_NOT_FROZEN
engineeringAuthority = NONE
sourceQualification  = NOT_ESTABLISHED
```

This register defines the trace slots required by issue #563. It does not assert that any source, equation, table, figure, constant, applicability rule, or assessment criterion is engineering-qualified.

## Required record fields

Every future populated trace record must identify, as applicable:

```text
traceId
sbcTypes[]
methodRole
sourceRepository
sourceCommit
sourceBlob
sourcePath
sourceLocator
nativeUnitOrBasis
transcriptionOrRuleIdentity
preparedBy
checkedBy
qualificationStatus
notes
```

Unknown values remain unknown. They must not be guessed from browser captures, candidate code, cached workbook values, or benchmark outputs.

## Trace namespaces

| Namespace | Purpose | Current state |
|---|---|---|
| `SBC-APP-*` | applicability boundaries | `UNPOPULATED` |
| `SBC-TYPE-*` | Type 1–4 classification/confirmation rules | `UNPOPULATED` |
| `SBC-EQ-*` | equations/calculation steps | `UNPOPULATED` |
| `SBC-TBL-*` | controlled tables | `UNPOPULATED` |
| `SBC-FIG-*` | figures/curves | `UNPOPULATED` |
| `SBC-CONST-*` | constants | `UNPOPULATED` |
| `SBC-ASS-*` | reference-band/action criteria | `UNPOPULATED` |
| `SBC-SRC-*` | controlled source identities | `UNPOPULATED` |
| `SBC-UNIT-*` | native-unit semantics/conversions | `UNPOPULATED` |

## Known benchmark-family mapping is not source qualification

The scaffold knows only the required published B1 family mapping:

```text
TYPE_1 -> EI Appendix D5
TYPE_2 -> EI Appendix D6
TYPE_3 -> EI Appendix D7
TYPE_4 -> EI Appendix D8
```

Those labels are benchmark-family identifiers, not sufficient source locators and not calibration inputs.

## Type-3 quarantine boundary

Issue #514 remains authoritative for Type-3 source/qualification evidence. Existing Type-3 candidate code is salvage/evidence only. D7 is an oracle, never calibration data. T3 curves remain `BLOCKED_SOURCE_DATA_CONFLICT`; this register may not turn source/browser evidence into engineering qualification or activate those curves.

## Main-line dependency

The SBC main-line dependency must resolve a `QUALIFIED_EI_MAIN_LINE_ASSESSMENT` with completeness semantics. FIT-only LOF is explicitly insufficient. The exact source/trace rows for this cross-mechanism dependency remain blocked by #429 method/completeness qualification.

## Next population rule

Populate source identities and method-item trace rows before freezing Type 1–4 numerical input contracts or implementing production equations. Any populated row must be independently reviewable against the exact controlled source identity recorded in the row.
