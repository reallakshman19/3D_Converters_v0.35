# Issue #429 — Vibration & Dynamic Screening Engineering Review Package

Status: **REVIEW PACKAGE COMPLETE FOR FIT BENCHMARK — SCREENING AUTHORITY NOT APPROVED**

Issue: `reallaksh19/3D_Converters#429`  
Family: `VIB` — Vibration & Dynamic Screening  
Contract: `engineering-calculation-contract/v1`  
FIT calculation ID: `VIB.FIV.FLOW_TURBULENCE`  
FIT method revision: `ei-aviff2-fit-reference-v2`

---

## 1. Decision requested from reviewers

This package answers the five qualification questions in issue #429 using the evidence currently controlled in PR #438.

The requested review decision is **not** whether the whole VIB family is ready for production screening. It is whether the current evidence is correctly classified and whether the remaining gates are sufficient before any future authority promotion.

Current decision state:

```text
FIT benchmark/reference execution   IMPLEMENTED
FIT qualification state             BENCHMARK_ONLY
FIT engineering authority           NONE
FIT screening authority             NOT_AUTHORIZED
FIT design authority                NOT_AUTHORIZED
AIV                                 BLOCKED
SBC                                 BLOCKED
Cavitation / Flashing               BLOCKED
Surge / Momentum                    BLOCKED
Slug / Time-History                 BLOCKED
```

Recommended reviewer disposition at this stage:

```text
GO      -> retain FIT benchmark/reference capability for qualification work
NO-GO   -> FIT SCREENING activation
NO-GO   -> FIT design authority
NO-GO   -> activation of any other VIB mechanism
```

A future `SCREENING` decision must be a separate explicit authority change after all gates in Section 12 are closed.

---

## 2. Product and integration boundary

The vibration product is table-first.

```text
Advanced_Analysis 3D EDIT
        |
        | certified table export only
        v
Vibration table import
        |
        +--> operating cases / process evidence
        +--> vibration enrichment
        |
        v
Engineering Calculation API
        |
        v
mechanism-specific kernel
        |
        v
immutable result / qualification / evidence
        |
        v
Vibration & Dynamic Screening workspace
```

Permanent product boundary:

- Advanced_Analysis owns model editing, geometry/topology authoring and certified table export.
- Vibration consumes versioned table data only.
- Vibration owns mechanism screening, operating cases, readiness, findings/evidence and later RCA workflows.
- No 3D viewer, canvas, geometry renderer, heatmap or model-picking runtime is part of the vibration product.

Current visible entry:

```text
Engineering Calculations
  Calculations
    Vibration & Dynamic Screening (6)
      Acoustic-Induced Vibration Screening          BLOCKED
      Cavitation / Flashing Screening               BLOCKED
      Flow-Induced Vibration Screening              BENCHMARK_ONLY -> FIT workspace
      Small-Bore Connection Vibration Screening     BLOCKED
      Slug Load / Time-History Assessment           BLOCKED
      Surge / Momentum Load Screening               BLOCKED
```

The landing page is populated from registered calculation definitions. UI presentation does not grant engineering authority.

---

# Qualification Question 1 — Method boundary

## 3. Family method map

The six calculators must remain separate engineering kernels. They may share orchestration, data identity, units, provenance and selected physical inputs, but they do not share one empirical authority or one universal vibration score.

| Stable calculator ID | Mechanism | Current implementation state | Current authority | Required method qualification |
|---|---|---|---|---|
| `VIB.FIV.FLOW_TURBULENCE` | Flow-Induced Turbulence / flow-induced vibration screening | Implemented reference kernel | `BENCHMARK_ONLY` | Complete adopted EI/project review and independent approval |
| `VIB.AIV.ACOUSTIC` | Acoustic-Induced Vibration | Placeholder only | `BLOCKED` | Separate AIV method specification, masters and benchmarks |
| `VIB.SBC.SMALL_BORE` | Small-Bore Connection vibration | Placeholder only | `BLOCKED` | Separate SBC method specification, geometry rules and benchmarks |
| `VIB.CAVITATION.FLASHING` | Cavitation / flashing vibration | Placeholder only | `BLOCKED` | Separate hydraulic/phase-change method and benchmark set |
| `VIB.SURGE.MOMENTUM` | Surge / momentum load screening | Placeholder only | `BLOCKED` | Separate transient/momentum method and force definition |
| `VIB.SLUG.TIME_HISTORY` | Slug load / time-history assessment | Placeholder only | `BLOCKED` | Separate time-history/load method and structural-response boundary |

### 3.1 FIT method boundary currently implemented

Current FIT reference basis:

```text
Energy Institute / AVIFF process-pipework guidance
2nd Edition, January 2008
FIT / Technical Module T2.2 reference implementation
```

Controlled EI repository source at Common commit:

```text
aef163a5def3bfe04ca0ba860da05728a27daf42
```

Full source:

```text
EI - AVIFF Guidelines 2nd Edition.pdf
Git blob: 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
Size: 10,348,594 bytes
```

Worked examples:

```text
EI - AVIFF Guidelines 2nd Edition_Examples.pdf
Git blob: 3e2517d0df527a051084fc02e69cb7afa31f8d47
Size: 3,757,439 bytes
```

The current software boundary includes standard/reference FIT correlations plus the bounded advanced flexible-system reference path described in `FIT-Engineering-Method-Specification-v1.md`.

Known boundary controls include:

- advanced natural-frequency range `1 Hz < fn <= 3 Hz`;
- no natural-frequency default;
- no damping default;
- deterministic support/span classification rather than a hidden workbook selector;
- unresolved manual diameter-family gap remains fail-closed;
- no production pass/safe decision is generated by the reference bands.

### 3.2 What is explicitly outside FIT authority

The FIT implementation does not qualify or silently cover:

- AIV acoustic-power correlations;
- SBC local branch geometry/fatigue rules;
- cavitation or flashing source intensity;
- surge/transient load generation;
- slug force/time histories;
- nonlinear contact/gap/friction response;
- general modal/FEA response;
- a universal vibration likelihood/risk score.

Natural frequency and damping are not promoted into universal family defaults. Where a future mechanism requires them, their meaning, units, source and qualification must be mechanism-specific and explicit.

---

# Qualification Question 2 — Canonical contract

## 4. Shared dynamic context versus mechanism-owned fields

The family can share a common **context envelope**, but only a mechanism kernel may declare an input required for its method.

Recommended shared context groups:

### 4.1 Identity and operating case

```text
Canonical ID
Line
Tag / element identity where required
Operating Case
Dataset ID / version
Source record / revision
Reviewer / status where applicable
```

### 4.2 Geometry / topology / support context

Potential shared fields:

```text
outside diameter
wall thickness
inside diameter when controlled
line / element identity
support/span representation
maximum unsupported span when method-defined
connection/topology identity where needed
```

Source owner: Advanced_Analysis 3D EDIT certified table export, with later vibration enrichment only for fields not owned by the topology authoring product.

### 4.3 Process / operating context

Potential shared fields:

```text
phase
mass flow
velocity
fluid density
pressure
temperature
viscosity
operating-case identity
```

Source owner: HMB/process/operating-case evidence, not the geometry export.

No process quantity may silently default because another mechanism used a similar value.

### 4.4 Mechanism-specific fields

Examples that must remain mechanism-owned:

| Mechanism | Examples of mechanism-specific inputs/semantics |
|---|---|
| FIT | method support class, FIT source term/correlation inputs, optional advanced natural frequency |
| AIV | acoustic power/source definition, pressure-drop/acoustic variables and AIV-specific LOF semantics |
| SBC | branch geometry/configuration, local natural frequency/stiffness or geometry factors if the adopted method requires them |
| Cavitation / Flashing | vapor pressure/phase-change state, valve/restriction/cavitation descriptors, method-specific source intensity |
| Surge / Momentum | transient states, momentum change, event duration/direction, force definition |
| Slug / Time-History | time vector, force components, coordinate system, slug/event data, structural-response boundary |

### 4.5 Output semantics

The following meanings are required across the family:

- **LOF** — dimensionless likelihood-of-failure quantity defined by the specific qualified method. FIT LOF and AIV LOF must not be assumed numerically interchangeable.
- **screeningIndex** — mechanism-specific dimensionless screening quantity, only where the qualified method defines it.
- **acceptanceRatio** — demand divided by a qualified limit. The source and definition of the limit must be explicit.
- **damping** — canonical numerical representation is fraction, e.g. `0.02 = 2%`, but only when a qualified method actually requires damping.
- **force history** — canonical table representation should include `time [s]`, `Fx [N]`, `Fy [N]`, `Fz [N]` plus an explicit coordinate system.
- **reference band** — may classify a method result for review but must not be silently converted into a universal PASS/FAIL or safe state.

Current FIT result design keeps calculation, applicability, assessment, qualification and evidence separate.

---

# Qualification Question 3 — Data authority

## 5. Source/master inventory

Frozen migration repository baseline:

```text
reallaksh19/CRF-4-1
commit 68dc8e1fa2ef67073c59b3afc56f1bf40953d535
```

Retained vibration artifacts at that commit include:

| Mechanism | Retained artifact | Git blob | Status |
|---|---|---|---|
| FIT | `Enhanced stress report/extended calc/KS-PR-CAL-0086 Vibration Assessment - Flow Induced Turbulence Calculation.xlsm` | `d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e` | Extracted/reference evidence; current FIT implementation traced |
| FIT duplicate | `Extended calc2/AIV FIV/FIT.xlsm` | `d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e` | Byte-identical duplicate, not independent evidence |
| legacy FIV | `Extended calc2/FIV.xlsx` | `bc0aedbefac54c1a2e5d643e76c047cb890bf14d` | Reference only |
| AIV | `Enhanced stress report/extended calc/KS-PR-CAL-0087 Vibration Assessment Calculation V and V.xlsx` | `2566d41c02768a2345513ed42d270b123fe5087c` | Reference only / not qualified |
| AIV | `Extended calc2/AIV FIV/AIV.xlsx` | `048332ed93abd258ffced6b83af0ae343dfcbc9d` | Reference only / not qualified |
| AIV auxiliary | `Enhanced stress report/extended calc/9.4_AIV Closed RV Calc.xls` | `83eeb40d9b224ddd5020c26410a659e01bcea991` | Reference only / not qualified |
| SBC | `Extended calc2/AIV FIV/SBC.xls` | `69c02f600f84647ececdbf08e1f86fc8dc3fc723` | Reference only / not qualified |
| SBC duplicate | `Enhanced stress report/extended calc/Small Bore Vibration Calculation (A) - UNCHECKED.xls` | `69c02f600f84647ececdbf08e1f86fc8dc3fc723` | Same content identity; explicitly unqualified |
| Cavitation / Flashing | `KS-PR-CAL-0089 Vibration Assessment - Cavitation & Flashing Calculation V and V.xlsx` | `8c6c3e9771675d9463ed15361ff0f6035dab8c87` | Reference only / not qualified |
| Surge / Momentum | `KS-PR-CAL-0090 Vibration Assessment - Surge and Momentum Changes Template.xlsx` | `06c4f5a4e511c972c56aeaba937f0e19e3ce41c1` | Reference only / not qualified |
| Slug | `Extended calc2/Slugflow Time History master - Rev A.xls` | `0bddf4f4c24b98f0c2981db705986dadc7d6a136` | Reference only / not qualified |
| Slug auxiliary | `Stress tool box/Slug Loads/ITHACA - Slug Loads.XLS` | `85760e850045ae794b9d8a0a40757a48f4743d70` | Reference only / not qualified |

The old migrated `aiv-fiv.js` module is not numerical authority; it was retained as placeholder migration code and must not be used as an independent benchmark source.

## 6. Master-data authority model

No generic `vibration constants` master is authorized.

Each mechanism must own its empirical masters under a controlled structure equivalent to:

```text
MethodDefinition
  -> MasterSet
       -> MasterRecord
```

Every governed record must identify at least:

```text
masterId
recordId
methodId
methodRevision
source document / procedure / workbook revision
native units
applicability
qualification state
content hash
```

Rules:

- native/source units must be preserved and conversion made explicit at the central API boundary;
- no coefficient/table may silently fall back to a legacy workbook value;
- no damping assumption may be silently defaulted;
- no nearest-size or nearest-record lookup may be introduced unless the qualified method explicitly requires and defines it;
- duplicate filenames do not establish independent authority; content identity matters;
- legacy workbooks remain reference evidence until method/source/table review is complete.

## 7. Data ownership split

| Data class | Owner / authority |
|---|---|
| Geometry/topology/component identity | Advanced_Analysis 3D EDIT certified table export |
| Process/operating cases | HMB/process source or controlled operating-case input |
| Vibration-specific assessment/enrichment | Vibration engineering enrichment with source/reviewer/status |
| Empirical equations/constants/tables | Mechanism-specific vibration method masters |
| Qualification state | Engineering Calculation definition + reviewed qualification evidence |

A geometry export must never become an implicit process or empirical-method authority source.

---

# Qualification Question 4 — Independent validation

## 8. FIT validation evidence currently available

Current controlled FIT evidence includes:

### 8.1 Retained source parity

- exact retained FIT workbook content identity pinned;
- workbook behavior extracted/traced;
- retained-reference cases used as migration parity, not as the only qualification oracle;
- all six standard support/correlation families exercised in regression.

### 8.2 Independent EI worked examples

Controlled source:

```text
Common commit aef163a5def3bfe04ca0ba860da05728a27daf42
EI - AVIFF Guidelines 2nd Edition_Examples.pdf
blob 3e2517d0df527a051084fc02e69cb7afa31f8d47
```

Benchmark dataset:

```text
Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json
```

Published examples exercised:

```text
Appendix D2
Appendix D4
```

Representative parity:

```text
D2 6 in suction       implementation 0.27669 vs published 0.276
D2 4 in relief up     implementation 0.33926 vs published 0.338
D2 6 in relief down   implementation 0.88041 vs published 0.881
D4 20 in separator    implementation 0.26038 vs published 0.26
D4 10 in water        implementation 3.15195 vs published 3.15
```

Focused EI/input-resolution suite reached `12 / 12 PASS` in the recorded qualification run.

### 8.3 Independent hand-derived cases

Dataset:

```text
Benchmarks/VibrationFIT/fit-independent-hand-benchmarks-v1.json
```

Coverage includes:

- liquid, gas and multiphase calculations;
- standard LOF boundary cases around `0.95 / 1.00 / 1.05`;
- support-family boundaries;
- advanced flexible cases;
- deterministic repeatability;
- unit-equivalent API inputs;
- missing/invalid-data fail-closed behavior.

### 8.4 Input-resolution qualification

Multiphase data fail closed when both aggregate and component data shapes are present without an explicit or unambiguous selection.

Qualified resolution states include:

```text
AGGREGATE_EFFECTIVE / INFERRED
COMPONENT_DERIVED / INFERRED
AGGREGATE_EFFECTIVE / EXPLICIT
COMPONENT_DERIVED / EXPLICIT
AMBIGUOUS -> ERROR
INVALID MODE -> ERROR
```

The result evidence records whether selection was inferred or explicit and whether alternate-mode data were present.

## 9. Validation coverage that is not yet sufficient for screening authority

The following remain open or incomplete:

- full current-head repository regression after later UI/workspace/family-entry changes;
- current-head real XLSX/browser integration run;
- GitHub Actions execution, currently externally blocked before runner allocation;
- full page-level adopted EI/project procedure reconciliation for every implemented `FIT-APP-*`, `FIT-EQ-*`, `FIT-CONST-*` and `FIT-ASS-*` item;
- independent vibration-engineer approval;
- manual diameter-family gap resolution or explicit adopted-project exclusion;
- full-domain independent examples for all standard/advanced correlation slices.

EI worked examples prove the exercised method points. They do not establish complete domain coverage.

## 10. Required validation matrix for every later VIB mechanism

Before any blocked mechanism is activated it requires its own matrix containing, at minimum:

1. controlled source identity and exact adopted method revision;
2. at least one independent hand/reference case not generated by the migrated workbook code;
3. low/normal/high or equivalent source-intensity coverage appropriate to the mechanism;
4. boundary cases immediately below/at/above each governing assessment threshold;
5. SI/US or equivalent dimensional invariance where unit systems are supported;
6. missing-data and contradictory-data fail-closed tests;
7. applicability-envelope boundaries;
8. deterministic repeated execution;
9. single/batch parity through the centralized Engineering Calculation API;
10. provenance/master-record verification;
11. independent engineering checker/reviewer identification;
12. no use of another mechanism's benchmark to substitute for its own qualification.

For transient mechanisms, the matrix must also cover time-vector/force-component integrity and coordinate-system handling. For resonance-sensitive mechanisms, frequency/damping sensitivity must be explicit rather than inherited from FIT.

---

# Qualification Question 5 — Production activation

## 11. First complete VIB vertical

The selected first vertical is:

```text
VIB.FIV.FLOW_TURBULENCE
```

Why FIT was selected first:

- a bounded retained source inventory existed;
- the governing EI process-pipework reference and independent worked examples were available;
- the calculation can be isolated as a pure mechanism kernel;
- it can prove the central API / batch / evidence / table-workspace architecture without requiring a transient solver;
- it does not require sharing empirical AIV/SBC/transient assumptions.

Current execution path:

```text
Vibration & Dynamic Screening family landing
 -> registered FIT product surface
 -> table import / readiness
 -> facility plan
 -> explicit Run FIT benchmark
 -> central calculateEngineeringBatch()
 -> VIB.FIV adapter
 -> FIT domain kernel
 -> immutable result / evidence
 -> facility register / detail / CSV
```

The table workspace does not directly call `calculateFit()`, `calculateEngineering()` or `calculateEngineeringBatch()`.

## 12. Exact gates before FIT may become `SCREENING`

All of the following must be closed:

| Gate | Current state |
|---|---|
| Stable calculation ID and API route | PASS |
| Method/source identity | PASS for reference source identity |
| Retained workbook extraction/parity | PASS |
| EI D2/D4 worked-example parity | PASS |
| Independent hand benchmarks | PASS in recorded focused qualification run |
| Multiphase ambiguity fail-closed | PASS |
| Evidence/provenance model | PASS for benchmark path |
| Table-only product boundary | PASS by implementation/source review |
| Full current-head repository tests | **NOT_RUN** |
| Current-head real XLSX/browser workflow | **NOT_RUN** |
| GitHub Actions | **BLOCKED_EXTERNAL** |
| Full adopted EI/project method review | **OPEN** |
| Manual diameter gap QST-003 | **OPEN / FAIL_CLOSED** |
| Independent vibration-engineer approval | **NOT_RUN** |
| Explicit bounded screening scope approval | **NOT APPROVED** |

Until every blocking gate is resolved, the definition must remain:

```text
qualificationState = BENCHMARK_ONLY
engineeringAuthority = NONE
screeningAuthorized = false
designAuthority = false
```

## 13. Later-mechanism activation sequence

Recommended family sequence after FIT qualification review:

```text
1. AIV
2. SBC
3. Cavitation / Flashing
4. Surge / Momentum
5. Slug / Time-History
```

Reasoning:

- AIV is the closest next process-pipework screening mechanism but requires its own acoustic method and masters.
- SBC introduces local geometry/support/fatigue semantics and should not inherit FIT support logic.
- Cavitation/flashing requires separate phase-change/source authority.
- Surge/momentum and slug/time-history move into transient force/event semantics and therefore require stricter time/history/coordinate contracts.

This ordering permits shared infrastructure to mature without sharing empirical authority.

---

## 14. Shared infrastructure that later mechanisms may reuse

Allowed reuse:

- calculation contract and registry;
- central unit conversion infrastructure;
- immutable result/evidence envelope;
- table exchange and identity resolution;
- operating-case data structures;
- source/provenance conventions;
- batch orchestration;
- facility register/read model patterns;
- UI authority-state rendering.

Not automatically reusable as authority:

- FIT equations/constants/tables;
- FIT LOF thresholds/bands;
- FIT support correlation selection;
- FIT natural-frequency boundary;
- FIT applicability assumptions;
- FIT empirical source records;
- workbook-derived constants from any other mechanism.

---

## 15. Issue #429 answer summary

### Q1 — Method boundary

**Answered for architecture and FIT reference implementation; not complete for the five blocked mechanisms.**

Six kernels remain separate. FIT is the only implemented reference kernel. The other five require independent method specifications and qualification.

### Q2 — Canonical contract

**Answered.**

Share identity, geometry/topology context, operating-case/process context, units and provenance infrastructure. Keep acoustic, local SBC, phase-change, transient/time-history and mechanism-specific LOF/assessment semantics within their mechanism definitions.

### Q3 — Data authority

**Answered as a governance contract; fully populated only for FIT.**

Every empirical master must carry source/revision/native units/applicability/qualification/hash. No silent defaults or legacy workbook fallback. Retained artifacts for all six mechanisms are inventoried above, but only FIT has current qualified implementation evidence.

### Q4 — Independent validation

**Answered and materially executed for FIT; not yet executed for other mechanisms.**

FIT has EI D2/D4 examples, independent hand cases, correlation/threshold/boundary tests and fail-closed input-resolution evidence. Full current-head regression and engineering authority review remain open.

### Q5 — Production activation

**Answered.**

FIT is the first vertical. It is currently benchmark-only through the central API and table workspace. Promotion to screening is blocked by Section 12. Later mechanisms must reuse infrastructure only, never FIT empirical authority.

---

## 16. Reviewer checklist

Reviewer should record each item as `ACCEPT`, `REJECT`, or `MORE_EVIDENCE_REQUIRED`.

### Method/source

- [ ] FIT adopted source/edition/project procedure is explicitly accepted.
- [ ] Applicable EI errata are confirmed in the adopted source.
- [ ] Implemented applicability boundaries are checked against the adopted source.
- [ ] Implemented equation/constant/assessment trace is checked item-by-item.
- [ ] QST-003 diameter gap is resolved or explicitly excluded.

### Validation

- [ ] EI D2/D4 benchmark transcription is independently reviewed.
- [ ] Hand-derived benchmark math is independently reviewed.
- [ ] Advanced correlation coverage is judged sufficient for the proposed bounded scope.
- [ ] Unit-equivalence cases are reviewed.
- [ ] Missing/ambiguous input fail-closed behavior is accepted.
- [ ] Full current-head regression result is attached.
- [ ] Real table-import/browser result is attached.

### Product/API

- [ ] `VIB.FIV.FLOW_TURBULENCE` remains the stable public ID.
- [ ] Table-only 3D EDIT integration boundary is accepted.
- [ ] Central API is the sole numerical path.
- [ ] Batch and single execution use the same kernel.
- [ ] Evidence/provenance fields are sufficient for audit.
- [ ] UI does not imply screening/design authority before approval.

### Authority decision

- [ ] Benchmark-only state may remain available.
- [ ] Proposed screening scope is explicitly written.
- [ ] Independent vibration engineer is identified.
- [ ] Authority decision/reviewer/approval date is recorded.

---

## 17. Go / no-go record

Current repository recommendation:

```text
FIT BENCHMARK / QUALIFICATION USE     GO
FIT SCREENING                         NO-GO
FIT DESIGN AUTHORITY                  NO-GO
AIV ACTIVATION                        NO-GO
SBC ACTIVATION                        NO-GO
CAVITATION / FLASHING ACTIVATION      NO-GO
SURGE / MOMENTUM ACTIVATION           NO-GO
SLUG / TIME-HISTORY ACTIVATION        NO-GO
```

This recommendation changes only through an explicit reviewed authority update. Passing a benchmark, rendering a table row, or appearing as an engineering-review candidate must never change it automatically.

---

## 18. Controlled repository evidence

Primary review artifacts in PR #438:

```text
docs/FIVroadmap.md
docs/vibration/FIT-source-register.md
docs/vibration/FIT-Engineering-Method-Specification-v1.md
docs/vibration/FIT-Qualification-Dossier-v1.md
Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json
Benchmarks/VibrationFIT/fit-independent-hand-benchmarks-v1.json
tests/vibration-fit-ei-worked-examples.test.mjs
tests/vibration-fit-independent-benchmarks.test.mjs
converters/vibration/fit/*
converters/engineering-calculations/adapters/vibration-fit.js
converters/vibration/facility/*
converters/vibration/workspace/*
tabs/engineering-calculation-vibration-family.js
tabs/vibration-integrity-*.js
```

Current PR #438 must remain draft until current-head regression and engineering authority review are complete.
