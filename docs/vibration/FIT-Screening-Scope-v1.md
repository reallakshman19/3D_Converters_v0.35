# FIT Bounded Screening Scope v1

Status: **AUTHORIZED BOUNDED SCREENING — DESIGN AUTHORITY FALSE**

Calculation ID: `VIB.FIV.FLOW_TURBULENCE`  
Mechanism: Flow-Induced Turbulence (FIT)  
Method revision: `ei-aviff2-fit-screening-v1`

## 1. Authority boundary

The FIT implementation is qualified for the bounded screening scope defined here under the Owner-approved controlled worked-example qualification policy.

```text
calculationState       = IMPLEMENTED
qualificationState     = SCREENING
engineeringAuthority   = SCREENING
screeningAuthority     = AUTHORIZED_BOUNDED
designAuthority        = false
fullVibrationScreening = false
```

This authority is limited to main-line FIT. It is not design acceptance and is not a claim that the other vibration mechanisms in the workspace have been screened.

## 2. Mechanism boundary

Included:

- main-line **Flow-Induced Turbulence** according to the controlled EI AVIFF T2.2 reference implementation.

Explicitly outside this FIT authority:

- acoustic-induced vibration;
- small-bore connection vibration;
- dead-leg pulsation;
- mechanical excitation;
- cavitation/flashing;
- surge/momentum loading;
- slug/time-history loading;
- vortex-induced vibration;
- detailed fatigue/design acceptance;
- modal/FEA response and nonlinear contact/friction assessment.

## 3. Qualified phase/input scope

Qualified phase paths:

```text
LIQUID
GAS
MULTIPHASE / AGGREGATE_EFFECTIVE
MULTIPHASE / COMPONENT_DERIVED
```

Multiphase resolution remains fail-closed:

```text
one unambiguous input shape -> inferred mode
both input shapes + explicit mode -> explicit mode
both input shapes + no mode -> FIT_MULTIPHASE_INPUT_AMBIGUOUS
```

All dimensional inputs must resolve through the central Engineering Calculation units layer. Missing, incompatible or ambiguous quantities remain `NOT_READY`/calculation errors; no screening execution introduces hidden defaults.

## 4. Qualified diameter envelope

The screening envelope is intentionally discontinuous:

```text
60 mm <= Dext <= 219.1 mm      QUALIFIED SCREENING
219.1 mm < Dext < 273 mm       EXCLUDED / FAIL CLOSED
273 mm <= Dext <= 762 mm       QUALIFIED SCREENING
```

For QST-003, no interpolation, nearest-family selection, nominal-size inference or user-entered support-family override is permitted.

A runtime qualification negative probe at `250 mm` was rejected as `INPUT_OUTSIDE_APPLICABILITY`.

## 5. Standard-correlation scope

Qualified standard families:

```text
STIFF
MEDIUM_STIFF
MEDIUM_SMALL
MEDIUM_LARGE
FLEXIBLE_SMALL
FLEXIBLE_LARGE
```

Qualification evidence combines:

1. controlled EI worked examples;
2. independent hand benchmarks for branch gaps;
3. retained workbook migration/parity evidence;
4. bounded SI/US unit-invariance regressions;
5. span/diameter boundary coverage;
6. fail-closed negative probes.

The Owner-approved worked-example policy is the governing engineering qualification rule; retained workbook parity alone is never sufficient.

## 6. Advanced/refined scope

Qualified advanced families:

```text
FLEXIBLE_SMALL
FLEXIBLE_LARGE
```

Advanced calculation remains conditional on:

```text
standard LOF >= 1
actual natural frequency supplied
1 Hz < fn <= 3 Hz
```

Exactly `1 Hz` is excluded and exactly `3 Hz` is included. `fn > 3 Hz` does not use the advanced correlation.

A standard result at or above the reference threshold without a qualified advanced path remains a **further engineering assessment required** result. Screening qualification does not convert it into acceptance.

## 7. Qualification specimen

Primary product-path qualification specimen:

```text
EI-D4-FIT-PRODUCED-WATER-10IN
```

Controlled target and executed result:

```text
published standard LOF       3.15 ± 0.007
executed standard LOF        3.151946898828706
published standard Fv        2636 ± 0.7 Pa
executed standard Fv         2636.1738527662806 Pa
support category             FLEXIBLE_LARGE
reference band               LOF_GE_1
screening qualification      SCREENING
continuation required        true
design authority             false
```

Machine-readable receipt:

```text
docs/vibration/FIT-D4-Screening-Qualification-Receipt-v1.json
```

## 8. Physical/data integrity exclusions

Screening remains fail-closed for at least:

- non-positive OD, wall thickness, density or unsupported span;
- `OD <= 2*WT` or other invalid pipe geometry;
- inconsistent authoritative ID versus OD/WT where the accepted contract requires consistency;
- unknown/incompatible units;
- non-empty dimensional value with a required missing unit;
- ambiguous mass-flow/velocity or alternative process representations without an explicit resolution rule;
- unresolved multiphase representation;
- missing/duplicate/ambiguous canonical identity joins;
- stale result after execution-relevant edit;
- stale or uncertified topology authority represented as complete exchange;
- source/method revision outside the qualified release package.

### 8.1 Explicit Data Blockers

A missing engineering datum may be supplied through `VibrationFitDataBlockerCsv.v1` instead of a hidden default.

```text
ACTIVE    may fill a missing engineering datum
HOLD      audit-only; does not satisfy readiness
RESOLVED  audit-only; does not satisfy readiness
```

Manual input is strictly fill-only. Existing source values win. Source/manual or alternate-flow collisions fail closed.

### 8.2 Method blockers are not data blockers

The Data Blockers table cannot supply:

```text
SUPPORT_SIZE_FAMILY
correlation identity
screening authority
design authority
```

Therefore QST-003 cannot be bypassed by manual data.

## 9. Topology/data authority

A complete upstream XLSX is the five-sheet exchange:

```text
Elements
Connections
Source Mapping
Catalogue Evidence
Export Metadata
```

Untouched complete-XLSX execution requires both identities:

```text
FitTopologyElementsProjection.v1 -> SHA-256 of canonical visible Elements projection
FitSourceFileSha256.v1            -> SHA-256 of the complete XLSX byte stream
```

The first normal topology mutation irreversibly downgrades complete-exchange authority for that session until explicit source reload. Revert restores values, not complete-exchange authority.

Generic Elements CSV remains limited exchange and never gains certified complete-XLSX authority merely from compatible headers.

## 10. Run identity and reproducibility

```text
FitRunSnapshot.v1 / snapshotHash
FitEngineeringInputIdentity.v1 / engineeringInputHash
FitRunEvidencePackage.v1
```

The audit identity covers source/working-state provenance. The engineering identity covers normalized consumed FIT requests. Evidence export re-verifies both hashes before export.

Evidence is reproducibility evidence. It records authority but cannot create authority.

## 11. Result semantics

FIT screening may expose method-defined LOF/reference bands and continuation requirements only.

It must not introduce:

```text
safe = true
pass = true
designAcceptable = true
universal vibration/risk/confidence score
```

## 12. Governing qualification rule

Qualification anchor:

```text
reallaksh19/Common@7bfead910f6bca91b10748ead009e40f20c82219
Energy-Institute-AVIFF---Worked-Examples.doc.docx
blob ceee15ed5f7f320045d5f3979024e2e8664613f2
```

Owner policy:

```text
WORKED_EXAMPLE_BENCHMARK_SUFFICIENT
independentVibrationEngineerReviewRequired = false
```

The D4 product-path reproduction satisfies the engineering qualification gate for this bounded scope.

## 13. Release acceptance remains separate

Engineering qualification is active now. The following operational checks remain separately classified and must not be inferred as PASS:

```text
repository-native D4 24-check test     NOT_RUN / ENVIRONMENT_BLOCKED
exact 51-file FIT/VIB release suite    NOT_RUN / ENVIRONMENT_BLOCKED
real-browser acceptance                NOT_RUN
real five-sheet XLSX acceptance        NOT_RUN
```

These are release/operational acceptance checks, not an additional engineering-signoff gate under the Owner-approved benchmark policy.

## 14. Change control

Any expansion beyond this exact bounded scope requires a new controlled qualification decision. In particular, the following do not inherit FIT screening authority automatically:

- QST-003 diameter-gap resolution;
- a different empirical correlation revision;
- design/fatigue acceptance;
- full multi-mechanism vibration screening;
- materially changed input semantics or units basis.

PR #499 remains Owner-controlled; this scope document does not authorize merge.
