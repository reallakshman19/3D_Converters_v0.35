# SBC Engineering Method Specification v1 — structural scaffold

## Status and authority

This artifact is the controlled method-specification **scaffold** for `VIB.SBC.SMALL_BORE`. It is intentionally not a frozen numerical method.

```text
artifactStatus         = SCAFFOLD_PRESENT_NOT_FROZEN
lifecycle              = RESERVED
calculationState       = BLOCKED
qualificationState     = BLOCKED
productionExecution    = FORBIDDEN
benchmarkExecution     = FORBIDDEN
screeningAuthority     = NOT_AUTHORIZED
designAuthority        = false
```

Issue #563 owns this structural scaffold. Issue #429 remains the Vibration family qualification/completeness gate. Type-3 source/qualification evidence remains owned by #514.

## Permanent authority separations

```text
PLACEHOLDER PRESENCE != IMPLEMENTATION QUALIFICATION
IMPLEMENTATION QUALIFICATION != SCREENING AUTHORITY
SCREENING AUTHORITY != DESIGN AUTHORITY
```

The capability lifecycle `RESERVED -> QUALIFIED -> ACTIVE -> DEPRECATED` does not replace method qualification, data qualification, master-data publication state, screening authority, or design authority.

## Frozen structural stage order

The numerical content of these stages is not frozen, but their responsibility boundaries are:

```text
1  VALIDATE_SBC_CONNECTION
2  RESOLVE_COHERENT_OPERATING_SCENARIO
3  RESOLVE_QUALIFIED_EI_MAIN_LINE_ASSESSMENT
4  CLASSIFY_OR_CONFIRM_SBC_TYPE
5  RESOLVE_QUALIFIED_TYPE_INPUTS_AND_MASTERS
6  EXECUTE_QUALIFIED_TYPE_KERNEL
7  ASSESS_SBC_LOF_REFERENCE_BAND
8  PRODUCE_REQUIRED_ACTIONS
9  RETURN_PROVENANCE_EVIDENCE_AUTHORITY
```

UI/controller code may orchestrate these stages but must not own independent SBC equations or numerical authority.

## Main-line input contract

SBC does not consume FIT LOF as a substitute for the EI main-line assessment.

```text
sourceContract                 = QUALIFIED_EI_MAIN_LINE_ASSESSMENT
fitOnlyAccepted                = false
assessmentCompletenessRequired = true
```

The resolved main-line object must eventually carry coherent operating-scenario identity, mechanism coverage/completeness semantics, qualification, provenance, and authority. Its exact schema remains `NOT_FROZEN` under #429.

## Explicit Type 1–4 branches

| SBC type | B1 worked-example family | B2 engineering family | Input contract | Applicability/type classification | Qualified masters | Pure kernel |
|---|---|---|---|---|---|---|
| `TYPE_1` | EI Appendix D5 | required, independent | `NOT_FROZEN` | `NOT_FROZEN` | `NOT_FROZEN` | `NOT_QUALIFIED` |
| `TYPE_2` | EI Appendix D6 | required, independent | `NOT_FROZEN` | `NOT_FROZEN` | `NOT_FROZEN` | `NOT_QUALIFIED` |
| `TYPE_3` | EI Appendix D7 | required, independent | `NOT_FROZEN` | `NOT_FROZEN` | `NOT_FROZEN` | `NOT_QUALIFIED` |
| `TYPE_4` | EI Appendix D8 | required, independent | `NOT_FROZEN` | `NOT_FROZEN` | `NOT_FROZEN` | `NOT_QUALIFIED` |

A Type-3 implementation can never satisfy the Type 1, 2, or 4 branch obligations.

## Source and trace rule

Every materially controlling rule must have a trace ID and controlled source locator before it may be frozen into the method. Required namespaces are:

```text
SBC-APP-*    applicability
SBC-TYPE-*   type classification
SBC-EQ-*     equations / calculation steps
SBC-TBL-*    tables
SBC-FIG-*    figures / curves
SBC-CONST-*  constants
SBC-ASS-*    assessment / action criteria
SBC-SRC-*    source identities
SBC-UNIT-*   native-unit semantics
```

The corresponding register is `docs/vibration/SBC-source-trace-register-v1.md`. No source locator is invented in this scaffold.

## Benchmark rule

The registry scaffold is `Benchmarks/VibrationSBC/sbc-benchmark-registry-v1.json`.

B1 worked examples are validation oracles, never production calibration data. Every Type 1–4 branch also requires an independent B2 engineering family. Boundary/unit/API/UI regressions are additional evidence and do not replace B2. Production code must never generate or correct benchmark expected values.

For Type 3, D7 remains an oracle. T3 curves remain quarantined while the controlled-source conflict owned by #514 exists.

## Assumptions and defaults

No hidden engineering defaults are permitted. A conservative value may only be introduced as:

```text
METHOD_MANDATED_CONSERVATIVE_ASSUMPTION
```

and must carry the exact source rule, source locator, native unit/basis where applicable, and provenance.

## Result contract boundary

The future result must not collapse to a generic PASS/FAIL or green status. It must preserve the SBC reference-band/LOF result as qualified by the method, `requiredActions[]`, provenance, evidence, completeness, lifecycle, and authority.

## Freeze gate

This document may not change from `SCAFFOLD_PRESENT_NOT_FROZEN` to a frozen/qualified method artifact until the source/trace register is populated with controlled source identities and reviewed method items, the benchmark registry contains controlled B1 plus independent B2 evidence for every materially distinct branch, and the explicit Type 1–4 input/applicability/master contracts are source-grounded.
