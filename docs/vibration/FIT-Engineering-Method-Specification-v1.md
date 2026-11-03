# FIT Engineering Method & API Qualification Specification v1

Status: **QUALIFIED FOR BOUNDED SCREENING — DESIGN AUTHORITY FALSE**

Calculation family: Vibration & Dynamic Screening  
Stable public calculation ID: `VIB.FIV.FLOW_TURBULENCE`  
Canonical mechanism: **Flow-Induced Turbulence (FIT)**  
Qualification issue: #429  
Engineering method revision: `ei-aviff2-fit-screening-v1`

## 1. Purpose and authority

This specification controls the deterministic FIT implementation used for bounded engineering screening, qualification replay and benchmark comparison. It combines the retained CRF-4-1 workbook migration evidence with the controlled Energy Institute second-edition FIT method and worked examples supplied by the Owner.

Current authority:

```text
calculationState       = IMPLEMENTED
qualificationState     = SCREENING
engineeringAuthority   = SCREENING
screeningAuthority     = AUTHORIZED_BOUNDED
designAuthority        = false
fullVibrationScreening = false
```

`benchmark` execution remains available as a non-authorizing qualification/replay mode. `screening` is the bounded product mode. Neither mode creates design authority.

| Label | Meaning |
|---|---|
| `WORKBOOK_REFERENCE_ONLY` | retained-workbook migration provenance |
| `EI_WORKED_EXAMPLE_BENCHMARK` | controlled EI example evidence |
| `BENCHMARK_ONLY` | qualification/replay execution only |
| `SCREENING` | authorized only inside the bounded FIT scope |
| `DESIGN` | not authorized |

## 2. Controlled sources

### 2.1 Retained workbook

```text
Repository: reallaksh19/CRF-4-1
Commit:     68dc8e1fa2ef67073c59b3afc56f1bf40953d535
Path:       Extended calc2/AIV FIV/FIT.xlsm
Git blob:   d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e
Sheet:      Flow Induced Turbulence
```

The workbook is migration/parity evidence only and is not an independent engineering authority.

### 2.2 Controlled EI method set

```text
Repository: reallaksh19/Common
Commit:     fb549185b9b27edc2379734240320a85c5bef9f6
```

Governing method source:

```text
Path:       EI - AVIFF Guidelines 2nd Edition.pdf
Git blob:   9d3eccc56429411e17c07a579bdebbd13cb0bdc5
Edition:    2nd Edition, January 2008
Relevant:   Technical Module T2.2 — Flow Induced Turbulence
```

Published worked examples:

```text
Path:       EI - AVIFF Guidelines 2nd Edition_Examples.pdf
Git blob:   3e2517d0df527a051084fc02e69cb7afa31f8d47
Relevant:   Appendix D Examples D2 and D4
```

Owner-approved qualification anchor:

```text
Repository: reallaksh19/Common
Commit:     7bfead910f6bca91b10748ead009e40f20c82219
Path:       Energy-Institute-AVIFF---Worked-Examples.doc.docx
Git blob:   ceee15ed5f7f320045d5f3979024e2e8664613f2
Policy:     WORKED_EXAMPLE_BENCHMARK_SUFFICIENT
```

Under Owner direction, successful controlled worked-example reproduction is sufficient FIT engineering qualification evidence; separate independent vibration-engineer sign-off is not required.

Source precedence and observed PDF/DOCX differences are controlled by `FIT-EI-Worked-Example-Traceability-v1.md` and `FIT-Source-Basis-Evidence-v1.md`.

## 3. Method boundary

### FIT-APP-001 — mechanism

Scope is main-line **Flow-Induced Turbulence** only. This authority does not extend to FIP/dead-leg pulsation, AIV, SBC, cavitation/flashing, surge, slug/time-history, mechanical excitation or VIV.

### FIT-APP-002 — outside-diameter envelope

Qualified bounded screening:

```text
60 mm <= Dext <= 219.1 mm      SCREENING
219.1 mm < Dext < 273 mm       EXCLUDED / FAIL CLOSED
273 mm <= Dext <= 762 mm       SCREENING
```

### FIT-APP-003 — medium/flexible diameter families

```text
SMALL: Dext <= 219.1 mm
LARGE: Dext >= 273 mm
```

EI D4 confirms the `273 mm` flexible-large boundary. The unresolved interval `219.1 < Dext < 273 mm` remains QST-003 and may not be interpolated or assigned by nearest size, nominal-size inference, workbook selector or user-entered family.

### FIT-APP-004 — advanced calculation

All conditions are required:

```text
support = FLEXIBLE_SMALL or FLEXIBLE_LARGE
standard LOF >= 1
actual natural frequency supplied
1 Hz < fn <= 3 Hz
```

Exactly `1 Hz` is excluded; exactly `3 Hz` is included. Cached 4 Hz workbook behavior is not reproduced.

### FIT-APP-005 — phases

```text
LIQUID
GAS
MULTIPHASE
```

The method consumes resolved density/velocity. Mass flow is a resolver input, not a hidden method requirement when authoritative velocity is supplied.

### FIT-APP-006 — multiphase resolution

Supported modes:

```text
AGGREGATE_EFFECTIVE
COMPONENT_DERIVED
```

Selection rules:

```text
only aggregate data shape present   -> AGGREGATE_EFFECTIVE / INFERRED
only component data shape present   -> COMPONENT_DERIVED / INFERRED
both shapes + no mode               -> FIT_MULTIPHASE_INPUT_AMBIGUOUS
both + explicit aggregate mode      -> AGGREGATE_EFFECTIVE / EXPLICIT
both + explicit component mode      -> COMPONENT_DERIVED / EXPLICIT
invalid explicit mode               -> FIT_INPUT_INVALID
explicit mode missing required data -> fail closed
```

## 4. Canonical domain inputs

External quantities are normalized to canonical SI by the central Engineering Calculation unit resolver before empirical correlation execution.

| Field | Required | Unit | Meaning |
|---|---:|---|---|
| `phase` | yes | enum | `LIQUID`, `GAS`, `MULTIPHASE` |
| `multiphaseResolutionMode` | conditional | enum | explicit mode when both multiphase data shapes coexist |
| `outsideDiameterM` | yes | m | outside diameter |
| `wallThicknessM` | yes | m | wall thickness |
| `insideDiameterM` | optional | m | authoritative ID; otherwise OD - 2T |
| `maximumUnsupportedSpanM` | yes | m | maximum effective unsupported span |
| `massFlowKgS` | conditional | kg/s | single-phase/aggregate mass flow when velocity is absent |
| `densityKgM3` | conditional | kg/m3 | single-phase/effective density |
| `gasDynamicViscosityPaS` | gas | Pa.s | gas dynamic viscosity |
| `gasMassFlowKgS` | component multiphase | kg/s | gas mass flow |
| `gasDensityKgM3` | component multiphase | kg/m3 | gas density |
| `liquidMassFlowKgS` | component multiphase | kg/s | aggregate liquid mass flow |
| `liquidDensityKgM3` | component multiphase | kg/m3 | aggregate liquid density |
| `fluidVelocityMS` | optional | m/s | authoritative/effective velocity override |
| `naturalFrequencyHz` | advanced only | Hz | actual main-line natural frequency |

No engineering input has a default.

## 5. Native empirical unit basis

```text
Dext : mm
T    : mm
Lspan: m
mu   : Pa.s
rho  : kg/m3
V    : m/s
fn   : Hz
Fv   : Pa
LOF  : dimensionless
```

Empirical coefficients may not be rewritten into another unit basis without a separately qualified revision.

## 6. Equation register

### FIT-EQ-001 — internal flow area

```text
A = pi * Dint^2 / 4
```

### FIT-EQ-002 — volumetric flow

```text
Q = m_dot / rho
Qtotal = Qgas + Qliquid       # component multiphase
```

### FIT-EQ-003 — velocity

```text
V = Q / A
```

An authoritative/effective velocity may be supplied directly; provenance records override versus derivation.

### FIT-EQ-004 — single-phase / aggregate-effective excitation

```text
rhoV2 = rho * V^2
```

### FIT-EQ-005 — component-derived multiphase density

```text
rho_effective = (m_dot_g + m_dot_l) / (Qg + Ql)
```

### FIT-EQ-006 — component-derived multiphase excitation

```text
rhoV2 = rho_effective * V^2
```

### FIT-EQ-007 — gas viscosity factor

```text
FVF = sqrt(mu_gas / 0.001 Pa.s)
```

Liquid and multiphase use `FVF = 1`.

### FIT-EQ-008..010 — span/stiffness boundaries

With `D = Dext_mm`:

```text
L_stiff        = -0.000012346 D^2 + 0.020000 D + 2.0563
L_medium_stiff = -0.000011886 D^2 + 0.025262 D + 3.3601
L_medium       = -0.000015968 D^2 + 0.033583 D + 4.429
```

```text
Lspan <= L_stiff                   -> STIFF
L_stiff < Lspan <= L_medium_stiff  -> MEDIUM_STIFF
L_medium_stiff < Lspan <= L_medium -> MEDIUM
Lspan > L_medium                   -> FLEXIBLE
```

### FIT-EQ-011 — standard correlation families

With `D = Dext_mm`:

```text
STIFF:
  a = 446187 + 646D + 0.000917D^3
  b = 0.1ln(D) - 1.3739

MEDIUM_STIFF:
  a = 283921 + 370D
  b = 0.1106ln(D) - 1.501

MEDIUM_LARGE:
  a = 150412 + 209D
  b = 0.0815ln(D) - 1.3269

MEDIUM_SMALL:
  a = 13.1 - 0.00475D + 0.0000141D^2
  b = -0.132 + 0.000228D - 0.000000372D^2

FLEXIBLE_LARGE:
  a = 41.21D + 49397
  b = 0.0815ln(D) - 1.3842

FLEXIBLE_SMALL:
  a = 0.0000132D^2 - 0.00442D + 12.22
  b = 0.000284D - 0.000000462D^2 - 0.164
```

### FIT-EQ-012 — standard Fv

Power-form families:

```text
Fv = a * (D/T)^b
```

Small medium/flexible exponential families:

```text
Fv = exp(a * (D/T)^b)
```

### FIT-EQ-013 — standard LOF

```text
LIQUID:     LOF = rhoV2 / Fv
GAS:        LOF = rhoV2 * FVF / Fv
MULTIPHASE: LOF = rhoV2 / Fv
```

### FIT-EQ-014 — advanced Flexible-Small

```text
a = (0.000013175D^2 - 0.0044213D + 12.217) * (0.0529ln(fn) + 1)
b = (-0.0000004622D^2 + 0.0002835D - 0.164) * (-0.1407ln(fn) + 1)
Fv_advanced = exp(a * (D/T)^b)
```

### FIT-EQ-015 — advanced Flexible-Large

```text
a = (41.21D + 49397) * fn^(0.0001665D + 0.84615)
b = 0.0815ln(D) - 1.3842 + 0.0191(fn - 1)
Fv_advanced = a * (D/T)^b
```

### FIT-EQ-016 — refined LOF

```text
LOF_refined = demand / Fv_advanced
```

## 7. Constants and reference bands

```text
FIT-CONST-001: mu_ref = 0.001 Pa.s
FIT-CONST-002: reference LOF threshold = 1
```

```text
LOF < 0.3         -> LOF_LT_0_3
0.3 <= LOF < 0.5 -> LOF_0_3_TO_LT_0_5
0.5 <= LOF < 1   -> LOF_0_5_TO_LT_1
LOF >= 1          -> LOF_GE_1
```

These are method-defined screening/reference bands, not probabilities and not design pass/fail states.

## 8. Assessment register

No FIT result contains a production `pass` or `safe` boolean.

```text
standard LOF < 1:
  REFERENCE_BELOW_THRESHOLD

valid advanced path and refined LOF < 1:
  REFERENCE_BELOW_THRESHOLD_AFTER_ADVANCED

standard/refined LOF >= 1 or no valid advanced path:
  REFERENCE_FURTHER_ENGINEERING_ASSESSMENT_REQUIRED
```

In screening mode the assessment is authorized only as the bounded FIT screening disposition. `REFERENCE_FURTHER_ENGINEERING_ASSESSMENT_REQUIRED` is not acceptance.

## 9. Source/API dispositions

### ISS-009 / ISS-012 — frequency boundary

Resolved: `1 < fn <= 3`. Retained cached 4 Hz advanced behavior is rejected.

### ISS-010 — support selector mismatch

Resolved: support is derived from span equations; stale hidden selector state is not authority.

### ISS-013 — 273 mm boundary

Resolved and qualified by EI D4: `Dext >= 273 mm` enters the large medium/flexible family.

### ISS-016 — mixed multiphase ambiguity

Resolved: aggregate and component multiphase data coexisting without explicit mode return `FIT_MULTIPHASE_INPUT_AMBIGUOUS`.

### QST-003 — diameter gap

`219.1 < Dext < 273 mm` is outside screening authority and fails closed. A `250 mm` qualification negative probe returned `INPUT_OUTSIDE_APPLICABILITY`.

## 10. Qualification evidence

Controlled datasets:

```text
Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json
Benchmarks/VibrationFIT/fit-independent-hand-benchmarks-v1.json
```

Published EI values use:

```text
FIT-EI-PUBLISHED-RECONCILIATION-V1
```

Each published field uses a case-specific absolute tolerance derived from equation-register recalculation plus displayed-source precision; tolerances may not be tuned to production output.

### 10.1 Owner benchmark-qualification rule

```text
WORKED_EXAMPLE_BENCHMARK_SUFFICIENT
independentVibrationEngineerReviewRequired = false
```

Primary product-path qualification specimen:

```text
EI-D4-FIT-PRODUCED-WATER-10IN
```

Executed result:

```text
published standard LOF   3.15 ± 0.007
executed standard LOF    3.151946898828706
published standard Fv    2636 ± 0.7 Pa
executed standard Fv     2636.1738527662806 Pa
support                   FLEXIBLE_LARGE
reference band            LOF_GE_1
qualification             SCREENING
designAuthority           false
continuationRequired      true
```

Benchmark and screening execution are numerically identical for this controlled vector.

Qualification receipt:

```text
docs/vibration/FIT-D4-Screening-Qualification-Receipt-v1.json
```

## 11. API/result evidence requirements

Results keep these concepts separate:

```text
applicability
hydraulics
excitation
support
standard correlation
advanced eligibility/result
assessment/referenceBand
qualification
provenance
evidence
```

For multiphase results, evidence contains:

```text
inputResolution.multiphaseResolutionMode
inputResolution.selection = INFERRED | EXPLICIT
inputResolution.alternateModeDataPresent
```

Current product authority:

```text
qualificationState   = SCREENING
engineeringAuthority = SCREENING
screeningAuthority   = AUTHORIZED_BOUNDED
designAuthority      = false
qualificationIssue   = 429
```

Benchmark replay remains available with `BENCHMARK_ONLY` effective qualification and no screening authority.

## 12. Release/operational acceptance

The engineering qualification decision is complete under the Owner-approved worked-example policy. Operational release checks remain separate and truthfully classified:

```text
repository-native D4 24-check gate     NOT_RUN / ENVIRONMENT_BLOCKED
exact 51-file FIT/VIB release suite    NOT_RUN / ENVIRONMENT_BLOCKED
real-browser acceptance                NOT_RUN
real five-sheet XLSX acceptance        NOT_RUN
```

These checks must run before production merge/deployment according to release practice, but they are not a separate independent engineering-signoff requirement.

## 13. Change control

Any change to empirical equations, coefficients, native unit basis, qualified diameter/phase boundaries, advanced eligibility, or authority level requires a new controlled revision and qualification decision.

This specification does not authorize merge of PR #499. Merge remains Owner-only.
