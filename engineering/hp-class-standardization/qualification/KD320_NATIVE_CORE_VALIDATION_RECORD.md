# Native CORE KD320 Calculation — Validation Record

**Record ID:** VR-B313-CH9-KD320-NATIVE-001  
**Revision:** 0  
**Date:** 2026-08-16  
**Repository:** `reallaksh19/3D_Converters`  
**PR / Branch:** PR #531 / `agent/hp-ch9-fatigue-foundation-r3`  
**Baseline before this record:** `54d5e8756375e6d13656b39e8b4d6351461f6e69`  
**Target calculation mode:** Native CORE `KD320_MEAN_STRESS_CORRECTION`  
**Current disposition:** **NOT QUALIFIED — FAIL-CLOSED**  
**Release authorization:** **NOT GRANTED**  
**Permitted interim path:** `USER_CALCULATED_KD3`

---

## 1. Purpose

This record defines the engineering validation status, evidence gaps, qualification gates, benchmark requirements, and release criteria for implementing a native CORE calculation path for the ASME Section VIII Division 3 KD-3/KD-320 fatigue route invoked by the ASME B31.3 Chapter IX high-pressure fatigue workflow.

This record does **not** reproduce licensed Code text and does **not** claim that the native KD320 formulation is currently qualified. It records what is established, what is not established, and what evidence is required before the native path can be enabled.

---

## 2. Qualification Decision

| Item | Decision |
|---|---|
| Native CORE KD320 calculation | **NOT QUALIFIED** |
| Native KD320 execution | **BLOCKED** |
| Code/design authority | **NOT ESTABLISHED** |
| Licensed KD320 semantic extraction | **NOT ESTABLISHED** |
| Licensed fatigue-curve independent custody | **NOT ESTABLISHED** |
| Independent engineering check | **NOT ESTABLISHED / DEFERRED** |
| `USER_CALCULATED_KD3` intake | **IMPLEMENTED AND SOFTWARE-VERIFIED; NOT DESIGN-AUTHORIZED** |
| Straight-pipe pressure-cycle `Salt` kernel | **SOFTWARE-VERIFIED WITH PINNED ANALYTICAL/SYNTHETIC TESTS** |

The fail-closed status is intentional. The native route shall remain unavailable until all mandatory gates in Section 8 are complete.

---

## 3. Target Code / Method Basis

### 3.1 Publicly verifiable edition basis

- ASME B31.3-2024 is the target piping edition. ASME identifies **High Pressure Fluid Service Fatigue Analysis** under paras. K302.3 and K304.8 as a key change in the 2024 revision.
- ASME BPVC Section VIII Division 3, 2025 is the target high-pressure vessel method source registered by the project for KD-2/KD-3 mechanics.

Public ASME pages establish edition identity and scope only. They do not provide the licensed paragraph-level KD320 formulation required for implementation authority.

### 3.2 Project method binding

Pinned project masters bind:

```text
method_id        = B313-CH9-PF-2024-R1
b313_edition     = 2024
b313_scope       = HIGH_PRESSURE_FLUID_SERVICE
viii3_source_id  = SRC-VIII3-2025
kd3_method_id    = KD3-FATIGUE-001
fatigue_route_id = ROUTE-KD3-2024
```

The pinned fatigue route binds:

```text
stress_basis          = TRESCA_STRESS_INTENSITY
seq_route             = KD320_MEAN_STRESS_CORRECTION
mean_stress_route     = ALGEBRAIC_MEAN_STRESS
fatigue_curve_id      = VIII3-KD3-CS-001
interpolation_rule    = LOG_LOG
extrapolation_allowed = FALSE
applicability         = STRAIGHT_PIPE_REMOTE_FROM_DISCONTINUITY
source_id             = SRC-VIII3-2025
```

These bindings are necessary routing metadata but are **not sufficient by themselves** to qualify the native numerical formulation.

---

## 4. Controlled Source Custody Status

The pinned source registry declares:

```text
source_id      = SRC-VIII3-2025
standard       = ASME BPVC Section VIII Div 3
edition        = 2025
license_class  = LICENSED_RESTRICTED
storage_class  = SECURE_STORE
source_locator = Part KD Articles KD-2 & KD-3
status         = ACTIVE
```

The registry also contains a declared document hash and verification metadata. For native KD320 qualification, the controlled secure-store document bytes, hash, edition, and exact paragraph/figure/table locators must be independently reconciled against this registry entry.

**Current finding:** a source pointer exists, but the exact licensed KD320 content required to validate the native formula is not present in the open development evidence used for PR #531. Therefore source custody is **registered but not qualification-complete**.

---

## 5. Research Correction / Invalidated Candidate Formula

The pinned project master specification contains a provisional expression of the form:

```text
Seq = Salt / (1 - beta * sigma_mean / Sy)
```

During PR #531 review this expression was judged insufficient as a native KD320 implementation because the controlled licensed source semantics for the denominator variables and applicability were not proven from the evidence set.

Accordingly, PR #531 removed the provisional native arithmetic. The current software behavior for `KD320_MEAN_STRESS_CORRECTION` is:

```text
KD320_CORE_ROUTE_NOT_QUALIFIED
requiredInputMode = USER_CALCULATED_KD3
reason = CONTROLLED_KD320_FORMULATION_AND_CUSTODY_NOT_ESTABLISHED
canUseForDesignAuthority = false
```

**Validation rule:** the withdrawn expression shall not be reintroduced merely because it appears in a project specification. It may only be restored or replaced after exact controlled-source reconciliation and independent benchmark qualification.

---

## 6. What Is Already Verified

### 6.1 Straight-pipe pressure-cycle mechanics

The current foundation verifies:

```text
Y = Do / Di
Sp = 2 P Y^2 / (Y^2 - 1)
DeltaP = |PB - PA|
DeltaSp = 2 DeltaP Y^2 / (Y^2 - 1)
Salt = DeltaSp / 2
```

The pressure-cycle kernel independently reproduces `Salt` from geometry, effective wall, and the two pressure states.

### 6.2 Fatigue infrastructure independent of native KD320

The following are implemented and tested:

- transient state and transition custody;
- log-log fatigue-curve interpolation;
- strict no-extrapolation behavior;
- zero-range / zero-damage handling;
- Palmgren-Miner cumulative damage;
- source/master-chain resolution;
- synthetic/reference execution;
- external user-calculated KD3 result ingestion.

### 6.3 `USER_CALCULATED_KD3` fallback

For each governed cycle, the user can supply externally calculated:

```text
Seq = equivalentAlternatingStressMpa
N   = permissibleCycles
```

with calculation provenance. CORE uses governed applied cycles `n` and calculates `U = n/N`. Optional user `Salt` is cross-checked against CORE. Optional `sigma_mean`, `beta`, and `S'a` are stored as evidence only and are not used to reconstruct KD320.

Post-correction focused suite at the documented PR state: **22/22 PASS**.

---

## 7. Mandatory Evidence Package for Native KD320

| ID | Required evidence | Acceptance requirement | Current state |
|---|---|---|---|
| E01 | Controlled ASME B31.3-2024 source | Exact edition, secure source identity, hash, and K302.3/K304.8 invocation mapping verified | **PENDING** |
| E02 | Controlled ASME VIII-3-2025 source | Exact secure source bytes/hash match `SRC-VIII3-2025`; KD-3/KD320 locators recorded | **PENDING** |
| E03 | KD320 semantic extraction sheet | Every equation, symbol, sign convention, branch condition and applicability rule mapped to exact controlled source locator | **PENDING** |
| E04 | Mean-stress definition | Exact stress quantity, critical plane / stress component, sign treatment, compression treatment, and proportional/nonproportional applicability established | **PENDING** |
| E05 | Mean-stress correction parameters | Exact definition/selection of all parameters used by KD320, including any curve-derived or material-dependent quantity | **PENDING** |
| E06 | Fatigue curve custody | Correct curve ID, material/environment scope, points or controlled curve evaluator, edition, interpolation and no-extrapolation rules independently verified | **PENDING** |
| E07 | Material/temperature rules | All material properties actually required by the controlled method and their temperature-selection/interpolation rules established | **PENDING** |
| E08 | Applicability envelope | Straight-pipe remote-from-discontinuity boundaries, wall state, pressure/temperature range and exclusions documented | **PENDING** |
| E09 | Independent numerical oracle set | At least one independently calculated result for each required benchmark class in Section 9 | **PENDING** |
| E10 | Negative / fail-closed tests | Missing source data, curve out-of-range, invalid parameters, wrong edition, wrong applicability, and ambiguous inputs all block | **PARTLY ESTABLISHED** |
| E11 | Independent checker | Calculator and checker identities are distinct; review comments closed; sign-off recorded | **PENDING** |
| E12 | Release authorization | Qualification record accepted and owner/design-authority approval explicitly granted | **PENDING** |

No single evidence item can substitute for another. In particular, a correct-looking numerical result does not replace source custody, and source custody does not replace numerical benchmarking.

---

## 8. Qualification Gates

### Gate G0 — Source identity and custody

PASS only when E01 and E02 are complete and the controlled documents are reproducibly identified by edition, document hash, storage custody, and exact locators.

### Gate G1 — Semantic extraction

PASS only when E03-E08 are complete. Every variable consumed by code must have:

- canonical name;
- engineering definition;
- units;
- sign convention;
- input/derived status;
- selection/interpolation rule where applicable;
- source ID;
- exact source locator;
- applicability condition;
- prohibited/default behavior.

No hidden default is permitted.

### Gate G2 — Pure-kernel implementation

PASS only when the native implementation:

- has named exports;
- is deterministic and side-effect free;
- preserves `canUseForDesignAuthority=false` during qualification;
- fails closed on incomplete controlled inputs;
- never extrapolates a fatigue curve unless the controlled method explicitly permits it;
- contains no user-interface-specific engineering logic.

### Gate G3 — Independent benchmark qualification

PASS only when every benchmark class in Section 9 is executed against independent expected values and meets the case-specific acceptance criterion.

Default repository QA comparison for externally rounded scalar values is **relative error <= 1e-4**, unless the benchmark record establishes a tighter criterion. This is a software QA policy, **not an ASME tolerance**, and shall never be loosened to make a failing case pass.

### Gate G4 — Negative testing and invariants

PASS only when all invalid or out-of-scope conditions block deterministically with explicit error codes and evidence.

### Gate G5 — Independent engineering review

PASS only when a qualified checker independently reviews source extraction, equations, test vectors, code implementation, and result custody. Checker must not be the original calculator/implementer for the qualification record.

### Gate G6 — Authority release

PASS only after explicit approval. Passing G0-G5 does not automatically enable design authority. Any authority flag, central registry promotion, UI production exposure, or compliance statement requires a separate release decision.

---

## 9. Minimum Independent Benchmark Matrix

| Case | Purpose | Minimum independent expected outputs |
|---|---|---|
| KD320-BM-01 | Zero pressure/stress range | `Salt=0`; native path handles zero-damage condition correctly |
| KD320-BM-02 | Positive pressure range, baseline mean-stress condition | `Salt`, controlled mean-stress quantity, `Seq`, `N` |
| KD320-BM-03 | Different mean-stress level at comparable alternating range | controlled mean-stress quantity, `Seq`, direction of correction, `N` |
| KD320-BM-04 | Compression / negative mean-stress branch if permitted by controlled method | branch treatment, `Seq`, `N` or explicit block |
| KD320-BM-05 | Exact fatigue-curve point | `Seq`, exact `N` |
| KD320-BM-06 | Between-curve-point interpolation | bounding points, interpolation fraction, `N` |
| KD320-BM-07 | Above controlled fatigue-curve stress range | explicit no-extrapolation block unless controlled source states otherwise |
| KD320-BM-08 | Below controlled fatigue-curve stress range | explicit no-extrapolation block unless controlled source states otherwise |
| KD320-BM-09 | Multi-block spectrum | each `Ui = ni/Ni`, cumulative `U` |
| KD320-BM-10 | Applicability boundary | valid boundary case plus one just-outside case that must block |
| KD320-BM-11 | Edition mismatch | controlled fail-closed response |
| KD320-BM-12 | Missing/ambiguous KD320 parameter | controlled fail-closed response |

Where the licensed method requires a critical-plane or multi-component stress treatment, benchmark cases shall include the required plane/component selection and not reduce the qualification to a single scalar pressure-only shortcut.

---

## 10. Benchmark Record Format

Each benchmark shall retain at least:

```text
benchmark_id
method_id / method_revision
code editions
source_id / source_locator
geometry and wall state
material / temperature
from_state / to_state
pressure and other required load components
Salt
controlled mean-stress quantity / plane identifier if applicable
all KD320 correction parameters required by the controlled method
Seq
fatigue curve ID
N permissible
n applied
Ui
cumulative U where applicable
independent expected-value source
calculated_by / calculated_at
checked_by / checked_at
software commit SHA
software result
absolute difference
relative difference
acceptance criterion
PASS / FAIL / NOT_RUN / NOT_APPLICABLE
notes
```

Expected values shall never be generated from the implementation under test.

---

## 11. User-Provided Calculated Values as Validation Evidence

`USER_CALCULATED_KD3` results may become independent benchmark evidence when all of the following are satisfied:

1. calculation reference and exact Code edition are recorded;
2. source method/paragraph is identified without copying restricted Code text into an open repository;
3. input geometry, wall state, states/transients, material and temperatures are reproducible;
4. `Seq` and `N` are retained at adequate precision;
5. intermediate `Salt` and controlled mean-stress quantities are retained when available;
6. calculator and checker are distinct for qualified evidence;
7. the expected values are frozen before comparison with CORE;
8. any rounding in the source calculation is declared;
9. the benchmark remains immutable once admitted to the qualification set.

Thus a user can provide an approved spreadsheet/hand calculation/vendor calculation as an oracle without exposing licensed Code text, provided the calculation is traceable and independently checked.

---

## 12. Change-Control Rules

Native KD320 qualification shall be invalidated or re-opened when any of the following changes:

- B31.3 edition or applicable Chapter IX invocation;
- VIII-3 edition/addenda/code case relevant to KD-3/KD320;
- fatigue curve or material/environment family;
- mean-stress correction semantics;
- critical-plane/stress extraction semantics;
- interpolation/extrapolation policy;
- wall-state policy;
- calculation kernel behavior;
- benchmark expected values or tolerance policy.

A new method revision shall be created rather than silently mutating an approved method.

---

## 13. Validation Status Summary

```text
SOURCE ROUTING METADATA                    PASS
PUBLIC EDITION IDENTITY                    PASS
STRAIGHT-PIPE PRESSURE / Salt KERNEL       PASS (software validation scope)
SYNTHETIC FATIGUE PIPELINE                 PASS (software reference scope)
USER_CALCULATED_KD3 INTAKE                 PASS (software validation scope)
NATIVE KD320 CONTROLLED FORMULATION        NOT ESTABLISHED
NATIVE KD320 LICENSED CURVE CUSTODY         NOT ESTABLISHED
NATIVE KD320 INDEPENDENT BENCHMARKS         NOT RUN / NOT ESTABLISHED
INDEPENDENT ENGINEERING QUALIFICATION       NOT ESTABLISHED
NATIVE KD320 DESIGN/CODE AUTHORITY           NOT ESTABLISHED

OVERALL NATIVE KD320 QUALIFICATION: NOT QUALIFIED — FAIL-CLOSED
```

---

## 14. Approval Record

| Role | Name | Decision | Date | Signature / Reference |
|---|---|---|---|---|
| Implementer |  | Prepared |  |  |
| Independent checker |  | Pending |  |  |
| Lead pressure/fatigue engineer |  | Pending |  |  |
| Software QA |  | Pending |  |  |
| Owner / release authority |  | Pending |  |  |

---

## 15. References

### Official public sources

1. ASME, **B31.3 - Process Piping, 2024**. Official product page; identifies High Pressure Fluid Service Fatigue Analysis at K302.3/K304.8 among 2024 changes. Accessed 2026-08-16.
2. ASME, **BPVC.VIII.3 - Rules for Construction of Pressure Vessels, Division 3, 2025**. Official product page. Accessed 2026-08-16.

### Pinned project sources

3. `reallaksh19/Advanced_Analysis@951798864e6f557691d0d4388368b7805e425f0d/docs/High Pr/method_manifest.csv`, Git blob `a34af2063105db4dae59003ebe77704b95541e81`.
4. `.../fatigue_route.csv`, Git blob `6a7b603951c34586da292812e7e38a3a19499aae`.
5. `.../code_source_revision.csv`, Git blob `33367b2e471ccb5189327a9d06c38ac34cd72582`.
6. `.../B313_CHAPTER_IX_MASTER_DATA_SPECIFICATION.md`, pinned project specification; its provisional KD320 expression is explicitly **not accepted as native formulation authority** by this validation record.
7. `reallaksh19/3D_Converters`, PR #531, `agents/PR531_workreport.md`, current fatigue-foundation and fail-closed custody record.

---

**Record conclusion:** The project has sufficient architecture and evidence handling to ingest externally calculated KD3 results and to validate the surrounding pressure-cycle / Miner mechanics. It does **not yet have sufficient controlled evidence to implement or authorize native CORE KD320**. The correct engineering state is to retain the hard block until G0-G6 are satisfied.
