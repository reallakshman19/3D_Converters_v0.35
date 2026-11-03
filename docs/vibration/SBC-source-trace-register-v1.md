# SBC Controlled Source / Trace Register v1 — structural scaffold

## Status

```text
artifactStatus       = SCAFFOLD_PRESENT_NOT_FROZEN
populationStatus     = REFERENCE_ROWS_POPULATED_NOT_ENGINEERING_QUALIFIED
engineeringAuthority = NONE
sourceQualification  = NOT_ESTABLISHED
```

This register now pins the controlled-source identities and the **non-numerical** Type/applicability rows needed by issue #563. It does not assert that an equation, score, table value, figure value, constant, action threshold, or automatic classifier is engineering-qualified.

## Source identities

### SBC-SRC-001 — controlled EI PDF identity

```text
repository           = reallaksh19/Common
commit               = fb549185b9b27edc2379734240320a85c5bef9f6
path                 = EI - AVIFF Guidelines 2nd Edition.pdf
blob                 = 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
role                 = CONTROLLED_SOURCE_IDENTITY
qualificationStatus  = IDENTITY_PINNED_ENGINEERING_QUALIFICATION_NOT_ESTABLISHED
```

The Git identity proves custody/integrity only. It does not independently establish engineering qualification.

### SBC-SRC-002 — Appendix D structured transcription

```text
repository           = reallaksh19/Advanced_Analysis
commit               = 76eb4bd075ce2e8e2442d02b2798df7be491fb4b
path                 = docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md
blob                 = c050cd90802c27241c510c6f0ac43bfaf7a89e9d
role                 = STRUCTURED_TRANSCRIPTION_REFERENCE
qualificationStatus  = REFERENCE_ONLY_NOT_ENGINEERING_AUTHORITY
```

This transcription supplies the D5–D8 worked-example labels and structural descriptions used below. It is not an independent source and is not a numerical production master.

### SBC-SRC-003 — T3 structured transcription

```text
repository           = reallaksh19/Advanced_Analysis
commit               = 76eb4bd075ce2e8e2442d02b2798df7be491fb4b
path                 = docs/EI data/P0_SBC_Master_Data.md
blob                 = 5312c9e2cf86af9e940ba722fcbee64702aeccd3
role                 = STRUCTURED_T3_REFERENCE_WITH_KNOWN_CURVE_CONFLICT
qualificationStatus  = REFERENCE_ONLY_CURVE_VALUES_QUARANTINED
```

The T3-1..T3-4 numerical digitization in this blob remains quarantined by #514. Only the non-numerical applicability labels are used in this #563 slice.

## Populated Type confirmation rows

These rows permit **explicit Type confirmation against worked-example structural facts only**. They do not authorize automatic classification and do not establish completeness of the EI Type-selection method.

| Trace ID | Type | Source locator | Structural label | Flowchart | Allowed use |
|---|---|---|---|---|---|
| `SBC-TYPE-001` | `TYPE_1` | D5; transcription PDF pages 38–40 | cantilever / single-parent connection | `T3-2` | `STRUCTURAL_CONFIRMATION_ONLY` |
| `SBC-TYPE-002` | `TYPE_2` | D6; transcription PDF pages 41–43 | loop/bypass exiting and re-entering same main line | `T3-4` | `STRUCTURAL_CONFIRMATION_ONLY` |
| `SBC-TYPE-003` | `TYPE_3` | D7; transcription PDF pages 44–47 | supported first span plus subsequent spans | `T3-5` | `STRUCTURAL_CONFIRMATION_ONLY` |
| `SBC-TYPE-004` | `TYPE_4` | D8; transcription PDF pages 48–51 | bridge between distinct parent lines | `T3-8` | `STRUCTURAL_CONFIRMATION_ONLY` |

The contract therefore requires a declared Type 1–4 and checks whether supplied topology contradicts these source-grounded structural facts. It does **not** infer a Type from arbitrary plant geometry.

## Populated non-numerical applicability rows

| Trace ID | Source locator | Applicability scope | Numerical use |
|---|---|---|---|
| `SBC-APP-001` | Figure T3-1; printed 82 / PDF 90 | first span with unsupported mass | `FORBIDDEN` while curves quarantined |
| `SBC-APP-002` | Figure T3-2; printed 83 / PDF 91 | first span without unsupported mass | `FORBIDDEN` while curves quarantined |
| `SBC-APP-003` | Figure T3-3; printed 83 / PDF 91 | subsequent span with unsupported mass | `FORBIDDEN` while curves quarantined |
| `SBC-APP-004` | Figure T3-4; printed 84 / PDF 92 | subsequent span without unsupported mass | `FORBIDDEN` while curves quarantined |
| `SBC-APP-005` | Table T3-2; printed 81 / PDF 89 | first span connected to deck/steelwork | table values not qualified by this slice |
| `SBC-APP-006` | Table T3-3; printed 82 / PDF 90 | SBC connected between two main lines | table values not qualified by this slice |

No curve threshold, table value, LOF score, multiplier, or equation is populated into the #563 contract from these rows.

## Trace namespace status

| Namespace | Purpose | Current state |
|---|---|---|
| `SBC-APP-*` | applicability boundaries | `NON_NUMERICAL_REFERENCE_ROWS_POPULATED` |
| `SBC-TYPE-*` | Type 1–4 classification/confirmation rules | `EXAMPLE_SCOPE_CONFIRMATION_ROWS_POPULATED` |
| `SBC-EQ-*` | equations/calculation steps | `UNPOPULATED` |
| `SBC-TBL-*` | controlled table values | `UNPOPULATED` |
| `SBC-FIG-*` | controlled figure/curve values | `BLOCKED_SOURCE_DATA_CONFLICT` |
| `SBC-CONST-*` | constants | `UNPOPULATED` |
| `SBC-ASS-*` | reference-band/action criteria | `UNPOPULATED` |
| `SBC-SRC-*` | controlled source identities | `IDENTITIES_PINNED_REFERENCE_ONLY` |
| `SBC-UNIT-*` | native-unit/input semantics | `REFERENCE_SEMANTICS_POPULATED_PDF_REVIEW_PENDING` |

## Explicit input-contract boundary

The source-grounded structural input contracts are implemented in:

```text
converters/vibration/sbc/type-classification-contract.js
converters/vibration/sbc/type-input-contracts.js
converters/vibration/sbc/source-trace.js
```

Their purpose is structural completeness and contradiction detection only. They require explicit operating-scenario and main-line-assessment references and forbid FIT-only substitution. Even a structurally complete request remains `NOT_QUALIFIED_FOR_NUMERICAL_EXECUTION`.

## Known benchmark-family mapping is not source qualification

```text
TYPE_1 -> EI Appendix D5
TYPE_2 -> EI Appendix D6
TYPE_3 -> EI Appendix D7
TYPE_4 -> EI Appendix D8
```

D5–D8 remain B1 worked-example families. Every materially distinct branch still requires independent B2 engineering evidence. Boundary/unit/API/UI regressions do not replace B2.

## Type-3 quarantine boundary

Issue #514 remains authoritative for Type-3 source/qualification evidence. Existing Type-3 candidate code is salvage/evidence only. D7 is an oracle, never calibration data. T3 curves remain `BLOCKED_SOURCE_DATA_CONFLICT`; this register does not activate those curves or turn manual/browser evidence into master authority.

## Main-line dependency

The SBC main-line dependency must resolve a `QUALIFIED_EI_MAIN_LINE_ASSESSMENT` with completeness semantics. FIT-only LOF is explicitly insufficient. The exact qualification/completeness schema remains owned by #429 and is not frozen here.

## Remaining population rule

Before numerical implementation, populate and independently review the governing source rows for the complete Type-selection method, Type-specific input semantics/units, equations, tables, actions, and master dependencies. Unknowns remain unknown; no hidden default or inferred engineering rule is permitted.

## Input/unit semantic reference rows — 2026-08-16 continuation

The user-directed `Advanced_Analysis@16d1e58f728e72b04b761c02dce682aa189779f2/docs/EI data` re-ground was checked explicitly. The Appendix-D example transcription remains blob `c050cd90802c27241c510c6f0ac43bfaf7a89e9d`, and the P0 SBC transcription remains blob `5312c9e2cf86af9e940ba722fcbee64702aeccd3`; these are the same content blobs already pinned at `76eb4bd...`. The later commit is therefore an additional custody point, **not an independent engineering source**.

The structured repository contains explicit Type 1–4 worked-example labels and applied flowchart references in D5–D8. P0 additionally contains Type-3 synthesis logic referencing T3-5/T3-6/T3-7/T3-9. This is richer than example labels alone, but it still does not authorize automatic four-way Type inference or close controlled-PDF reconciliation.

Machine-readable reference rows are in `converters/vibration/sbc/input-semantics.js` with:

```text
status                            = REFERENCE_SEMANTICS_POPULATED_PDF_REVIEW_PENDING
useAllowed                        = INPUT_SEMANTIC_REFERENCE_ONLY
engineeringQualificationEstablished = false
numericalMethodUseAllowed         = false
engineeringDefaultAllowed        = false
```

| Trace ID | Contract field | Reference semantic | Source-native unit |
|---|---|---|---|
| `SBC-UNIT-001` | `geometry.minimumNominalDiameter` | minimum SBC nominal bore/diameter | `in_NB` |
| `SBC-UNIT-002` | `geometry.overallBranchLength` | true parent-wall-to-valve-end branch length; D5 includes lagging depth | `mm` |
| `SBC-UNIT-003` | `geometry.branchLegs` | retain Type-2 A/B leg lengths independently | `mm` |
| `SBC-UNIT-004` | `geometry.firstSpan` | parent connection to first resting support | `mm` |
| `SBC-UNIT-005` | `geometry.subsequentSpans` | retain subsequent spans and mass/no-mass context distinctly | `mm` |
| `SBC-UNIT-006` | `geometry.endLegs` | retain Type-4 end-leg lengths independently | `mm` |
| `SBC-UNIT-007` | `geometry.bridgeSpan` | overall Type-4 bridge span; D8 example sums its end legs, without freezing a general derivation rule | `mm` |
| `SBC-UNIT-008` | `attachments.fittings` | explicit fitting/configuration category, no factor value | categorical |
| `SBC-UNIT-009` | `attachments.valves` | explicit valve count/rating/category evidence, no default | categorical/count |
| `SBC-UNIT-010` | `locationContext` | project location/support context, not a location score | categorical evidence |
| `SBC-UNIT-011` | `supportTopology.firstSpanSupport` | first resting-support identity/location | categorical evidence |
| `SBC-UNIT-012` | `topology.returnsToSameMainLine` | D6 same-main-line return confirmation | boolean evidence |
| `SBC-UNIT-013` | `topology.bridgesDistinctMainLines` | D8 distinct-parent-lines confirmation | boolean evidence |

These rows do **not** populate T3 table values, curve values, fitting factors, LOF scores, schedule substitutions, location scores, equations, or benchmark expected values. In particular, D5's worked-example schedule substitution is not converted into a software default. T3 curves remain `BLOCKED_SOURCE_DATA_CONFLICT` under #514.

`SBC-UNIT-*` namespace state is now `REFERENCE_SEMANTICS_POPULATED_PDF_REVIEW_PENDING`. The complete method, automatic classification, numerical unit/conversion policy, and source qualification remain `NOT_FROZEN` until controlled-PDF reconciliation and independent review are available.
