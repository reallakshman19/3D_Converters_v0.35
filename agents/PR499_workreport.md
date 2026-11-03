# PR499 — FIT Bounded Screening Qualification — Living Work Report

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: ACTIVE
TAKEOVER_AUTHORITY: WRITE_ALLOWED_WITH_COORDINATION
APPENDIX_A_STATUS: CURRENT
WORK_INTENT: IMPLEMENT / VALIDATE / QUALIFY / HANDOVER
CRITICALITY: ENGINEERING_CRITICAL
AUTO_MODE: ACTIVE
SCREENING_QUALIFICATION_AUTHORITY: OWNER_AUTHORIZED_2026-08-15
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
```

## Mission Control

| Field | Current state |
|---|---|
| Mission | Qualify the controlled FIT implementation for a bounded production-screening scope using an Owner-approved EI worked example, without changing empirical equations or granting design authority. |
| PR | #499 — `agent/fit-production-gate-1` -> `main` |
| Governing issues | #443 / #429 |
| Current main at last grounding | `b13797d23db1f01200a2349e77f39c883e62a84c` — re-read before merge/continuation |
| Exact technical head before this report refresh | `b8952b1783f5a73fd71a3388072741b23b3ff60c` |
| FIT authority | `IMPLEMENTED / SCREENING`; `engineeringAuthority=SCREENING`; `screeningAuthority=AUTHORIZED_BOUNDED`; `designAuthority=false` |
| Full multi-mechanism vibration screening | `false` — only FIT is qualified by this work |
| Primary qualification specimen | `EI-D4-FIT-PRODUCED-WATER-10IN` |
| Coordinated release manifest | **51 controlled test files** |
| Exact native 51-file execution | `NOT_RUN / ENVIRONMENT_BLOCKED` |
| Real-browser / real-file acceptance | `NOT_RUN` |
| Merge authorization | **NOT GRANTED** |

## Owner Decisions

### Missing data

Data-dependent blockers are explicit user inputs, not hidden defaults. `VibrationFitDataBlockerCsv.v1` is fill-only; governed source values always win and method/domain decisions are not user-overridable data.

### Qualification rule

Owner direction on 2026-08-15:

```text
if benchmarked as per example then no review required
```

Follow-up Owner direction:

```text
pick you example, validate end to end in app and make it qualified
```

Controlled qualification anchor:

```text
Common@7bfead910f6bca91b10748ead009e40f20c82219
Energy-Institute-AVIFF---Worked-Examples.doc.docx
blob ceee15ed5f7f320045d5f3979024e2e8664613f2
policy WORKED_EXAMPLE_BENCHMARK_SUFFICIENT
```

A separate independent vibration-engineer review is therefore **NOT REQUIRED** for FIT qualification when the controlled worked-example reproduction passes.

## Qualified Authority

```text
calculationState       = IMPLEMENTED
qualificationState     = SCREENING
engineeringAuthority   = SCREENING
screeningAuthority     = AUTHORIZED_BOUNDED
designAuthority        = false
fullVibrationScreening = false
```

Benchmark replay remains available as a non-authorizing oracle. Screening execution is the product mode.

No result may self-promote to design acceptance, and no FIT authority is inherited by other vibration mechanisms.

## Qualified Bounded Scope

```text
60 mm <= Dext <= 219.1 mm      QUALIFIED SCREENING
219.1 mm < Dext < 273 mm       EXCLUDED / FAIL CLOSED
273 mm <= Dext <= 762 mm       QUALIFIED SCREENING
```

Qualified paths:

```text
LIQUID
GAS
MULTIPHASE / AGGREGATE_EFFECTIVE
MULTIPHASE / COMPONENT_DERIVED
```

Advanced path:

```text
FLEXIBLE_SMALL or FLEXIBLE_LARGE
standard LOF >= 1
actual natural frequency supplied
1 Hz < fn <= 3 Hz
```

QST-003 cannot be bypassed by manual family selection, nearest-size choice, interpolation or Data Blockers.

## Qualification Specimen — EI D4 Produced Water

Chosen case:

```text
EI-D4-FIT-PRODUCED-WATER-10IN
phase       LIQUID
OD          0.273 m
WT          0.009271 m
span        18 m
density     988 kg/m3
velocity    2.9 m/s
```

Why this case:

- exact `273 mm` transition into the large family;
- exercises `FLEXIBLE_LARGE`;
- published LOF is above the reference threshold;
- verifies the app preserves the required further-assessment disposition instead of turning a high LOF into acceptance.

Published versus executed:

```text
                         PUBLISHED               EXECUTED
standard Fv              2636 ± 0.7 Pa           2636.1738527662806 Pa
standard LOF             3.15 ± 0.007            3.151946898828706
support category         FLEXIBLE_LARGE          FLEXIBLE_LARGE
reference band           LOF_GE_1                LOF_GE_1
```

Qualification result:

```text
screeningCandidateStatus = QUALIFIED_BOUNDED_SCREENING_FURTHER_ASSESSMENT_REQUIRED
continuationRequired     = true
qualification            = SCREENING
designAuthority          = false
```

Benchmark and screening execution produced identical `Fv` and LOF for this input vector.

Machine receipt:

```text
docs/vibration/FIT-D4-Screening-Qualification-Receipt-v1.json
```

Repository-native product-path gate:

```text
scripts/run-fit-d4-product-path-validation.mjs
tests/vibration-fit-d4-product-path-validation.test.mjs
```

The committed gate contains 24 checks across source target, benchmark replay, screening authority, numerical tolerances, family/band selection, continuation disposition, workspace authority and rendered-app semantics.

## Executed Validation

### PASS — central FIT adapter/kernel

Executed with branch production FIT modules:

```text
benchmark LOF                  3.151946898828706
screening LOF                  3.151946898828706
screening Fv                   2636.1738527662806 Pa
support                        FLEXIBLE_LARGE
reference band                 LOF_GE_1
qualification                  SCREENING
designAuthority                false
```

### PASS — QST-003 negative probe

```text
OD = 250 mm
expected = INPUT_OUTSIDE_APPLICABILITY
actual   = INPUT_OUTSIDE_APPLICABILITY
```

### PASS — facility/register/workspace runtime

Executed layer chain:

```text
facility plan
 -> central Engineering Calculation API
 -> FIT adapter/kernel
 -> facility result
 -> facility register
 -> workspace model
```

The D4 LOF remained `3.151946898828706` and authority remained `SCREENING` / design false through the product layers.

### PASS_SOURCE_CONTRACT — rendered application

Current app source contract exposes:

```text
SCREENING
DESIGN AUTHORITY FALSE
LOF_GE_1
Further assessment required
```

The visible Run action executes `runVibrationFacilityFitScreeningFromTables` and its progress state is `screening`.

### NOT_RUN — operational acceptance

```text
repository-native exact D4 24-check gate  NOT_RUN / ENVIRONMENT_BLOCKED
exact 51-file FIT/VIB release suite       NOT_RUN / ENVIRONMENT_BLOCKED
real browser                              NOT_RUN
real five-sheet XLSX                      NOT_RUN
```

These states remain NOT_RUN. They are not inferred from source inspection or the bounded runtime reconstruction.

## Product/Authority Changes in This Qualification Slice

- central FIT adapter now supports explicit `benchmark` and `screening` modes;
- registered FIT qualification state is `SCREENING`;
- facility planning/execution/register/workflow propagates coherent screening authority;
- visible app runs screening mode;
- workspace accepts coherent screening authority while benchmark replay remains valid;
- run evidence records actual screening authority but remains reproducibility evidence only;
- source-basis UI shows current `SCREENING` authority;
- FIT mechanism lifecycle is `IMPLEMENTED_SCREENING` / `CALCULATED_SCREENING`;
- full multi-mechanism governing remains false;
- QST-003 remains fail closed;
- no empirical equations, coefficients, correlation functions or source-derived tolerances were changed.

## Controlled Sources / Source Basis

```text
Method:
Common@fb549185b9b27edc2379734240320a85c5bef9f6
EI - AVIFF Guidelines 2nd Edition.pdf
blob 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
Technical Module T2.2

Published examples:
EI - AVIFF Guidelines 2nd Edition_Examples.pdf
blob 3e2517d0df527a051084fc02e69cb7afa31f8d47

Owner qualification anchor:
Common@7bfead910f6bca91b10748ead009e40f20c82219
Energy-Institute-AVIFF---Worked-Examples.doc.docx
blob ceee15ed5f7f320045d5f3979024e2e8664613f2

Retained parity workbook:
CRF-4-1@68dc8e1fa2ef67073c59b3afc56f1bf40953d535
Extended calc2/AIV FIV/FIT.xlsm
blob d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e
```

Source-basis disposition:

```text
productMethodBasis                  = ADOPTED_EI_T2_2_REFERENCE
officialErrata                      = REVIEWED_NOT_APPLICABLE_TO_FIT_T2_2
productReferenceMethod              = CONFIRMED
externalProjectOrClientAdoption     = PROJECT_SPECIFIC_CONFIRMATION_REQUIRED
D2_D4_SOURCE_DIFFERENCES            = EXPLICITLY_DISPOSITIONED
DIRECT_T2_2_PAGE_TABLE_EQUATION_MAP = NOT_COMPLETE
```

The direct page/table/equation locator remains a traceability/audit enhancement in this environment. It is not an additional engineering-qualification blocker under the Owner-approved worked-example policy.

## Existing Product Hardening Retained

- case/field absolute tolerance policy for controlled D2/D4 examples;
- independent `MEDIUM_SMALL` and advanced `FLEXIBLE_LARGE` evidence;
- literal SI/US central-API qualification matrix;
- Engineering Basis / Source Data / Data Blockers tabs;
- source/manual and alternate-flow collision guards;
- blank HOLD values remain null;
- cell/row/table revert with source preservation;
- complete-XLSX projection + whole-byte SHA-256 checks;
- irreversible topology authority downgrade until source reload;
- captured-state execution and stale-result invalidation;
- separate `snapshotHash` and `engineeringInputHash`;
- screening-aware `FitRunEvidencePackage.v1`;
- merged #500/#501 User Engineering Data/SBC shell hooks preserved.

## Coordinated Release Gate

```text
npm run verify:vibration-fit-release
```

Current controlled manifest: **51 tests**.

The D4 product-path regression is mandatory:

```text
tests/vibration-fit-d4-product-path-validation.test.mjs
```

Do not call the 51-file suite PASS until it executes in a complete checkout.

## Validation Matrix

| Gate | Status |
|---|---|
| Owner qualification source identity | PASS |
| Owner worked-example qualification policy | PASS / APPLIED |
| D4 adapter/kernel reproduction | PASS |
| D4 LOF/Fv tolerances | PASS |
| benchmark/screening numerical identity | PASS |
| 273 mm FLEXIBLE_LARGE boundary | PASS |
| QST-003 negative probe | PASS / FAIL_CLOSED |
| facility/register/workspace propagation | PASS |
| rendered screening authority semantics | PASS_SOURCE_CONTRACT |
| product EI T2.2 method basis | PASS |
| official errata applicability | PASS / NOT_APPLICABLE |
| D2/D4 source-difference disposition | PASS |
| direct T2.2 locator audit | NOT_COMPLETE / audit enhancement |
| independent vibration-engineer review | NOT REQUIRED |
| FIT engineering qualification | **SCREENING / QUALIFIED_BOUNDED** |
| FIT design authority | **false** |
| full multi-mechanism vibration screening | **false** |
| exact 51-file release suite | NOT_RUN / ENVIRONMENT_BLOCKED |
| real browser / XLSX / CSV acceptance | NOT_RUN |
| PR merge | NOT AUTHORIZED |

## Coordination

PR #499 has received parallel FIT work. Re-read live main and the exact PR head before every further mutation or merge attempt. Preserve #500/#501 shared Vibration Integrity/SBC hooks and do not revive stale PR #479 wholesale.

## Appendix A — Current Takeover Qualification

```text
A1 Production trace       20/20
A2 Failure isolation      20/20
A3 Authority/invariants   20/20
A4 Independent oracle     20/20
A5 Minimal patch boundary 19/20
TOTAL                      99/100
```

`WRITE_ALLOWED_WITH_COORDINATION` remains valid.

## Exact Next Action

1. re-read live `main` and PR #499 head;
2. freeze a candidate SHA;
3. execute the repository-native 51-file release suite in a complete checkout;
4. execute real-browser/real-file acceptance including five-sheet XLSX, CSV, Data Blockers, edit/revert/stale and evidence export;
5. resolve any failures without changing the qualified empirical method unless evidence requires a new controlled revision;
6. keep PR #499 draft/unmerged until the Owner explicitly authorizes merge.

**FIT engineering qualification is complete for the bounded SCREENING scope. PR merge is not authorized.**
