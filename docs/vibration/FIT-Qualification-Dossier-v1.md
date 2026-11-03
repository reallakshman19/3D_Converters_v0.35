# FIT Qualification Dossier v1

Status: **QUALIFIED — BOUNDED SCREENING AUTHORIZED / DESIGN AUTHORITY FALSE**

Calculation ID: `VIB.FIV.FLOW_TURBULENCE`  
Mechanism: Flow-Induced Turbulence (FIT)  
Qualification issue: #429  
Workspace/production issue: #443  
Method revision: `ei-aviff2-fit-screening-v1`

## 1. Qualification decision

The controlled FIT implementation is qualified for the bounded screening scope declared in `FIT-Screening-Scope-v1.md`.

```text
calculationState       = IMPLEMENTED
qualificationState     = SCREENING
engineeringAuthority   = SCREENING
screeningAuthority     = AUTHORIZED_BOUNDED
designAuthority        = false
fullVibrationScreening = false
```

This decision does **not** authorize design acceptance and does not claim that all vibration mechanisms are implemented. FIT is one qualified mechanism inside the broader Vibration Integrity workspace.

## 2. Governing qualification rule

Owner direction:

```text
if benchmarked as per example then no review required
```

Therefore successful reproduction of the controlled worked examples is sufficient engineering qualification evidence for FIT; a separate independent vibration-engineer review is not required.

Qualification anchor:

```text
Repository: reallaksh19/Common
Commit:     7bfead910f6bca91b10748ead009e40f20c82219
Path:       Energy-Institute-AVIFF---Worked-Examples.doc.docx
Git blob:   ceee15ed5f7f320045d5f3979024e2e8664613f2
Policy:     WORKED_EXAMPLE_BENCHMARK_SUFFICIENT
```

Governing/reference source set remains:

```text
Common@fb549185b9b27edc2379734240320a85c5bef9f6
EI full guidance PDF blob     9d3eccc56429411e17c07a579bdebbd13cb0bdc5
EI examples PDF blob          3e2517d0df527a051084fc02e69cb7afa31f8d47
```

Retained workbook remains migration/parity evidence only:

```text
reallaksh19/CRF-4-1@68dc8e1fa2ef67073c59b3afc56f1bf40953d535
Extended calc2/AIV FIV/FIT.xlsm
blob d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e
```

## 3. Qualification specimen — EI D4 produced water

Chosen specimen:

```text
EI-D4-FIT-PRODUCED-WATER-10IN
phase       LIQUID
OD          0.273 m
WT          0.009271 m
span        18 m
density     988 kg/m3
velocity    2.9 m/s
```

This specimen was selected because it exercises the exact `273 mm` large-family boundary, the `FLEXIBLE_LARGE` standard correlation, and a high-LOF result requiring explicit continuation.

Controlled published targets:

```text
support category       FLEXIBLE_LARGE
standard Fv            2636 Pa ± 0.7 Pa
standard LOF           3.15 ± 0.007
reference band         LOF_GE_1
```

Executed production adapter/kernel result:

```text
standard Fv            2636.1738527662806 Pa
standard LOF           3.151946898828706
support category       FLEXIBLE_LARGE
reference band         LOF_GE_1
qualification          SCREENING
designAuthority        false
continuationRequired   true
candidate status       QUALIFIED_BOUNDED_SCREENING_FURTHER_ASSESSMENT_REQUIRED
```

Benchmark mode and screening mode produced numerically identical `Fv` and LOF for the same engineering input vector.

Machine-readable receipt:

```text
docs/vibration/FIT-D4-Screening-Qualification-Receipt-v1.json
```

Repository-native qualification gate:

```text
scripts/run-fit-d4-product-path-validation.mjs
tests/vibration-fit-d4-product-path-validation.test.mjs
```

The committed product-path gate contains 24 checks spanning benchmark replay, screening authority, published tolerance, support family, reference band, continuation disposition, workspace authority and rendered-app semantics.

## 4. Executed validation truth

### PASS — central production FIT adapter/kernel

Executed against the branch production FIT modules:

- published LOF tolerance;
- published `Fv` tolerance;
- exact 273 mm `FLEXIBLE_LARGE` selection;
- `LOF_GE_1` band;
- benchmark/screening numerical identity;
- central `SCREENING` qualification;
- `designAuthority=false`;
- D4 continuation requirement.

### PASS — QST-003 negative probe

A `250 mm` OD probe in the unresolved interval was rejected as:

```text
INPUT_OUTSIDE_APPLICABILITY
```

The production scope therefore remains discontinuous and fail-closed:

```text
60 <= OD <= 219.1 mm       qualified bounded screening
219.1 < OD < 273 mm        EXCLUDED
273 <= OD <= 762 mm        qualified bounded screening
```

### PASS — facility / register / workspace path

Executed path:

```text
facility plan
  -> central Engineering Calculation API
  -> FIT adapter/kernel
  -> facility result
  -> facility register
  -> workspace model
```

The D4 result remained `3.151946898828706`, with `engineeringAuthority=SCREENING` and `designAuthority=false` through the path.

### PASS_SOURCE_CONTRACT — rendered app semantics

Current rendered workspace contract exposes:

```text
SCREENING
DESIGN AUTHORITY FALSE
LOF_GE_1
Further assessment required
```

A real browser session is separately classified below and is not inferred from source inspection.

## 5. Bounded screening scope

Qualified phase paths:

```text
LIQUID
GAS
MULTIPHASE / AGGREGATE_EFFECTIVE
MULTIPHASE / COMPONENT_DERIVED
```

Qualified standard families:

```text
STIFF
MEDIUM_STIFF
MEDIUM_SMALL
MEDIUM_LARGE
FLEXIBLE_SMALL
FLEXIBLE_LARGE
```

Advanced path remains bounded to:

```text
FLEXIBLE_SMALL or FLEXIBLE_LARGE
standard LOF >= 1
actual natural frequency supplied
1 Hz < fn <= 3 Hz
```

Exactly `1 Hz` is excluded; exactly `3 Hz` is included.

The qualification evidence includes controlled EI examples, independent hand benchmarks for previously uncovered families, retained-workbook parity, unit-invariance regressions and explicit fail-closed boundary tests.

## 6. Result semantics

Qualified FIT screening may report method-defined LOF/reference bands and continuation requirements.

It must not introduce or imply:

```text
safe = true
pass = true
designAcceptable = true
full multi-mechanism vibration screen = true
```

For the chosen D4 case, `LOF >= 1` and no natural-frequency refinement was supplied, so the correct qualified result is **further assessment required**, not acceptance.

## 7. Source-basis disposition

Controlled source-basis record:

```text
docs/vibration/FIT-Source-Basis-Evidence-v1.md
converters/vibration/fit/source-basis-evidence.js
schema = FitSourceBasisEvidence.v1
```

Current dispositions:

```text
productMethodBasis          = ADOPTED_EI_T2_2_REFERENCE
officialErrata              = REVIEWED_NOT_APPLICABLE_TO_FIT_T2_2
productReferenceMethod      = CONFIRMED
externalProjectAdoption     = PROJECT_SPECIFIC_CONFIRMATION_REQUIRED
D2/D4 differences           = EXPLICITLY_DISPOSITIONED
```

Direct T2.2 page/table/equation locator rendering remains `NOT_COMPLETE` in this connector runtime. Under the Owner-approved worked-example qualification policy this is retained as a traceability/audit enhancement, not a blocker to the present bounded engineering-screening qualification.

## 8. Input/reproducibility controls retained

Qualified screening retains all existing fail-closed product controls:

- no engineering defaults;
- explicit Data Blockers input for missing data only;
- source values always outrank manual blocker rows;
- alternate flow-representation collisions fail closed;
- QST-003 cannot be bypassed with a user-entered support family;
- cell/row/table revert;
- irreversible complete-XLSX authority downgrade after topology mutation until reload;
- Elements projection SHA-256 plus whole-XLSX SHA-256;
- immutable captured run state and stale-result detection;
- separate audit `snapshotHash` and normalized `engineeringInputHash`;
- `FitRunEvidencePackage.v1` for reproducibility.

Run evidence carries the actual screening authority of the execution envelope but remains reproducibility evidence; it cannot create authority by itself.

## 9. Release/operational acceptance — separate from engineering qualification

The engineering qualification above is PASS under the Owner-approved benchmark policy.

The following operational release checks remain truthfully separate:

```text
repository-native D4 24-check gate     NOT_RUN / ENVIRONMENT_BLOCKED
exact 51-file FIT/VIB release suite    NOT_RUN / ENVIRONMENT_BLOCKED
real-browser acceptance                NOT_RUN
real five-sheet XLSX acceptance        NOT_RUN
```

These items must not be relabeled PASS from source inspection. They are release/operational acceptance gates, not an additional independent engineering-signoff requirement.

## 10. Promotion record

| Gate | State |
|---|---|
| Owner worked-example qualification rule | PASS / APPLIED |
| Controlled qualification source identity | PASS |
| D4 adapter/kernel reproduction | PASS |
| D4 published LOF/Fv tolerance | PASS |
| Benchmark/screening numerical identity | PASS |
| 273 mm FLEXIBLE_LARGE boundary | PASS |
| QST-003 negative probe | PASS / FAIL_CLOSED |
| Facility/register/workspace propagation | PASS |
| Rendered screening authority contract | PASS_SOURCE_CONTRACT |
| Independent vibration-engineer review | NOT REQUIRED |
| Engineering qualification | **SCREENING / QUALIFIED_BOUNDED** |
| Design authority | **false** |
| Full multi-mechanism screening | **false** |
| Native 51-file release suite | NOT_RUN / ENVIRONMENT_BLOCKED |
| Real browser / real-file acceptance | NOT_RUN |

No merge authorization is implied by this dossier. PR #499 remains Owner-controlled.
