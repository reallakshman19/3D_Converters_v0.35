# FIV / FIT API-First Vibration Integrity Roadmap

## 1. Purpose

This roadmap defines the controlled engineering and software delivery path for the first production vibration vertical in `3D_Converters`, currently exposed through the frozen public calculator ID:

```text
VIB.FIV.FLOW_TURBULENCE
```

The canonical engineering mechanism targeted by that ID is **Flow-Induced Turbulence (FIT)**: broadband flow-related excitation/screening, not flow-induced pulsation (FIP), acoustic-induced vibration (AIV), small-bore structural susceptibility (SBC), cavitation/flashing, surge, slug, reciprocating pulsation, mechanical excitation, or vortex shedding.

The first FIT implementation is intentionally treated as the **reference vertical** for the entire future vibration family. It must establish the permanent pattern for method control, data provenance, units, applicability, deterministic calculation, assessment, qualification, API integration, table-based workflows, batch/facility execution, findings, scenario comparison, and engineering evidence.

This roadmap is governed by:

- issue #429 — vibration-family qualification gate;
- `docs/Vibration deep-research-report (2).md` at repository commit `37c37d770ba47ebb3152679265896de4a943c8b0`;
- `docs/APIEngineeringCalcRoadmap.md`;
- `docs/APIEngineeringCalcContracts.md`;
- Common `CodingRules.md` at commit `43eccc27967ecec7d67513c08255398b496be5ce`.

## 2. Owner-Frozen Product Boundary

### 2.1 No 3D viewer and no canvas

The vibration product will **not** contain:

- a 3D viewer;
- a 3D risk overlay;
- a canvas-based pipe editor;
- click-on-geometry screening;
- geometry rendering as an engineering authority.

`Advanced_Analysis` remains the upstream owner of **3D EDIT** and topology/model editing.

The vibration platform consumes **certified tabular exports** produced by that tool. The intended user experience in vibration is table-, dashboard-, panel-, chart-, and report-based.

### 2.2 Upstream/downstream responsibility

```text
Advanced_Analysis / 3D EDIT
    owns model editing and certified topology projection
                    │
                    │ versioned table export
                    ▼
3D_Converters / Vibration Integrity
    owns vibration input resolution, mechanism calculations,
    operating cases, findings, evidence, mitigation/scenarios,
    qualification presentation, and later RCA workflows
```

No vibration calculation may depend on a rendered scene or visual state.

## 3. Permanent Engineering Invariants

The following are architectural invariants, not optional implementation preferences.

### INV-FIT-001 — Preserve the public calculation ID

The current public identifier remains:

```text
VIB.FIV.FLOW_TURBULENCE
```

until a separately versioned migration is explicitly approved.

The domain layer may use:

```text
mechanism = FIT
mechanismDefinition = FLOW_INDUCED_TURBULENCE
```

The UI may present:

```text
Flow-Induced Turbulence (FIT)
Legacy/API family label: FIV
```

Do not rename the API identifier merely to improve terminology.

### INV-FIT-002 — Validation, applicability, calculation, assessment, qualification, and authority are separate

```text
Validation
    Is the payload structurally/numerically valid?

Applicability
    Is this method valid for the physical case?

Calculation
    What does the qualified method calculate?

Assessment
    What does the calculated output mean under a pinned criterion revision?

Qualification
    Has this implementation/master set passed the defined evidence gate?

Engineering authority
    What organizational use is permitted: exploratory, screening, or design?
```

A valid payload may still be out of scope. A calculation may succeed while assessment is unavailable. A qualified implementation may still lack organizational screening authority.

### INV-FIT-003 — No silent engineering defaults

No production FIT path may silently supply:

- density;
- viscosity;
- pipe dimensions;
- span;
- support condition;
- natural frequency;
- damping;
- empirical coefficient;
- threshold;
- master record;
- operating case;
- pressure reference;
- temperature basis.

Defaults that are genuinely part of a qualified published method must be represented as explicit method/master data with provenance and applicability, not buried as generic software defaults.

### INV-FIT-004 — Natural frequency and damping are not universal FIT inputs

Basic FIT screening must not require natural frequency or damping unless the exact selected method path uses them.

Advanced structural response may use modal data, but it is a separate method tier.

### INV-FIT-005 — No universal cross-mechanism LOF

Do not create:

```text
max(FIT_LOF, AIV_LOF, SBC_INDEX, ...) = UNIVERSAL_VIBRATION_RISK
```

At facility level, normalize **workflow/action state**, not raw empirical metrics.

Example:

```text
FIT  raw metric / LOF → ACCEPTABLE
AIV  raw metric / LOF → REVIEW
SBC  susceptibility   → ACTION
```

The raw mechanism metric and criterion remain visible underneath the common workflow state.

### INV-FIT-006 — Same production kernel everywhere

The following must call the same mechanism kernel and assessment path:

- direct API;
- Engineering Calculation Console;
- Sandbox/scenario execution;
- batch/facility execution;
- table-first Vibration Integrity Workspace;
- reports/exports.

No second equation implementation may exist in UI, batch code, or report rendering.

### INV-FIT-007 — No implicit latest authority

A qualified result must pin:

- API contract revision;
- mechanism adapter revision;
- kernel revision;
- method revision;
- assessment revision;
- master-set revision/hash;
- normalized input snapshot/hash;
- relevant resolver versions.

Historical results never mean "re-run with latest".

## 4. Existing Platform Baseline

The centralized Engineering Calculation platform already provides important reusable infrastructure:

```text
registry
input validation/resolution
unit conversion
qualification composition
immutable result snapshots
single calculation execution
Sandbox caller mode
batch execution
Console discovery/rendering
blocked qualification placeholders
```

The current FIT/FIV entry is intentionally qualification-blocked under issue #429 and must remain fail closed until the method gate is satisfied.

The roadmap therefore does **not** propose a new vibration execution engine. FIT should become another isolated domain kernel behind the existing generic Engineering Calculation API.

## 5. Target Architecture

```text
Table / API clients
Engineering Calculation Console
Vibration Integrity Workspace
External automation
             │
             ▼
Existing Engineering Calculation API
             │
     generic validation/resolution
             │
             ▼
FIT Engineering Adapter
             │
             ▼
FIT Domain API
    ├─ validateFitInput()
    ├─ resolveFitInput()
    ├─ evaluateFitApplicability()
    ├─ calculateFit()
    ├─ assessFit()
    └─ runFitSensitivity()
             │
             ▼
Pure deterministic FIT kernel
             │
             ▼
Pinned qualified method/master data
```

### 5.1 Generic platform owns

- calculation ID and discovery;
- external request/result contract;
- generic input resolution;
- generic units where valid;
- execution orchestration;
- immutable result envelope;
- batch execution;
- qualification presentation;
- generic Console.

### 5.2 FIT domain owns

- FIT-specific input semantics;
- FIT applicability rules;
- method-native unit conversion if required by the qualified empirical correlation;
- FIT equations/correlations;
- FIT-specific intermediate quantities;
- FIT-specific raw output/LOF semantics;
- FIT assessment criteria;
- FIT method evidence.

### 5.3 UI explicitly does not own

- equations;
- thresholds;
- empirical constants;
- hidden defaults;
- pass/fail logic;
- method applicability;
- design authority.

## 6. FIT Terminology and Compatibility Strategy

### 6.1 Canonical taxonomy

```text
FIT — Flow-Induced Turbulence
FIP — Flow-Induced Pulsation / dead-leg pulsation
AIV — Acoustic-Induced Vibration
SBC — Small-Bore Connection structural susceptibility / response
```

These must not be collapsed under one numerical mechanism.

### 6.2 Public API compatibility

Current stable API ID:

```text
VIB.FIV.FLOW_TURBULENCE
```

Recommended definition metadata:

```text
name: Flow-Induced Turbulence (FIT) Screening
mechanism: FIT
legacyTerminology: FIV
qualificationIssue: 429
```

The ID remains frozen until a versioned contract migration is explicitly approved.

## 7. FIT Engineering Method Specification — Mandatory Before Equations

The next engineering artifact after this roadmap must be a controlled method specification, for example:

```text
docs/vibration/FIT-Engineering-Method-Specification-v1.md
```

It must be derived from the exact legally licensed authoritative source and should include:

### 7.1 Method identity

- method ID;
- document title;
- publisher/authority;
- edition/revision/date;
- errata incorporated;
- licensed source artifact identity/hash;
- project procedure/workbook cross-reference where applicable;
- permitted implementation/use scope.

### 7.2 Applicability rules

Each rule receives a durable identifier:

```text
FIT-APP-001
FIT-APP-002
...
```

Rules should cover exactly the conditions required by the selected method, such as:

- phase/regime;
- material scope;
- line-size/wall scope;
- process range;
- support/span representation;
- steady/transient boundary;
- required fluid properties;
- method exclusions/escalation.

Do not invent applicability from vendor marketing pages.

### 7.3 Inputs

For every input define:

- physical meaning;
- required/conditional/optional state;
- accepted representations;
- canonical platform quantity;
- correlation-native quantity/unit where different;
- permitted source authority;
- range/applicability constraints;
- derivation rules.

### 7.4 Equations and tables

Assign stable implementation references:

```text
FIT-EQ-001
FIT-EQ-002
FIT-TBL-001
FIT-CONST-001
```

For each one record:

- source location;
- native units;
- variable definitions;
- coefficient dimensions/representation;
- branch conditions;
- numerical precision;
- limitations.

### 7.5 Outputs and assessment

Define separately:

- raw calculated metric(s);
- LOF if the method defines it;
- intermediate quantities;
- assessment/action bands;
- escalation requirement;
- meaning of unity or thresholds, if applicable;
- whether a utilization-like ratio is mathematically meaningful.

## 8. Engineering Master and Provenance Architecture

### 8.1 Structure

```text
MethodDefinition
    └─ MasterSet
         └─ MasterRecord
```

Recommended record fields:

```text
masterId
recordId
methodId
methodRevision
sourceDocument
sourceEdition
sourceLocation
nativeUnitSystem
value / table payload
applicability
qualificationStatus
sourceArtifactHash
normalizedRecordHash
reviewer
reviewDate
```

### 8.2 Source hash is necessary but not sufficient

A source file hash proves digital identity only.

Qualification also requires:

- correct document title/edition;
- licensing provenance;
- record-level transcription review;
- normalized structured-data hash;
- independent engineering review;
- qualification approval.

### 8.3 Prohibited practices

Production qualification must reject:

```text
magic number in UI
coefficient sourced only as "old spreadsheet"
latest.xlsx authority
silent missing-master fallback
unreviewed table transcription
runtime mutation of qualified masters
default damping with no method basis
unit-converted empirical coefficient with no derivation/benchmark
```

## 9. Units Policy

### 9.1 Platform boundary

Retain the existing external Engineering Calculation contract:

```json
{
  "calculationId": "VIB.FIV.FLOW_TURBULENCE",
  "inputs": {},
  "inputUnits": {},
  "context": {},
  "options": {}
}
```

Do not force a platform-wide request rewrite solely for FIT.

### 9.2 Domain layer

The resolved FIT domain object may use richer typed quantities and provenance internally.

```text
external inputs + inputUnits
        ↓
existing resolver
        ↓
typed/canonical FIT resolved input
        ↓
method-native conversion if qualified method requires it
```

### 9.3 Empirical native units

If the authoritative empirical correlation is defined with fitted constants in a specific native unit system, execute it in that native representation unless an SI re-derivation has been formally derived, benchmarked, reviewed, and independently qualified.

Qualification must include physically identical SI/US cases proving equivalent canonical engineering output within a declared tolerance.

## 10. Table Exchange from `Advanced_Analysis` 3D EDIT

### 10.1 Current upstream capability

The current certified 3D EDIT human export includes logical sheets/tables for:

- `Elements`;
- `Connections`;
- `Source Mapping`;
- `Catalogue Evidence`;
- `Export Metadata`.

It carries authority information including canonical/source/projection identities and rejects stale/unapplied state before export.

The current plain CSV serializer exports only the `Elements` table.

### 10.2 Consequence

A human CSV is useful for simple geometry/identity ingestion, but must **not automatically be treated as the full certified engineering exchange** if connectivity/source/catalogue/authority evidence is required downstream.

### 10.3 Target exchange contract

Create a separate cross-repository follow-up in `Advanced_Analysis` for a machine-oriented versioned export such as:

```text
VibrationTableExchange.v1
```

Preferred candidate package:

```text
manifest.json
elements.csv
connections.csv
source-mapping.csv
catalogue-evidence.csv
```

Alternative: consume the existing certified XLSX if it is sufficiently stable and machine-safe for the first production version.

The final format remains an explicit decision (`QST-002`); do not invent an adapter until there is a real production consumer in the same PR.

### 10.4 Required identity/provenance

The vibration import must preserve where available:

```text
datasetId
datasetVersion
canonicalHash
projectionHash
sourceHash
exportHash
canonical element ID
source status
catalogue record identity/hash
```

### 10.5 Ownership of data

Keep source ownership separate:

```text
Piping/topology facts     → Advanced_Analysis / 3D EDIT export
Process operating values → HMB/process source/API/import
Vibration enrichment     → vibration engineering workflow
Method/master data       → qualified vibration masters
```

Do not force process/HMB authority into 3D EDIT simply because the vibration calculation consumes both.

## 11. Canonical Table-First Vibration Data Model

### 11.1 Core asset entities

```text
Project
Facility
System
Line
Segment / Element
Connection
OperatingCase
MechanismAssessment
CalculationSnapshot
Finding
MitigationScenario
Verification
```

Longer-term entities:

```text
MeasurementSession
RcaCase
```

### 11.2 Vibration enrichment

Data that does not naturally belong to the source model or process dataset should be explicit vibration enrichment, for example:

- verified unsupported span;
- support effectiveness/status;
- AIV source classification;
- susceptible weld/discontinuity;
- FIP dead-leg classification;
- SBC concentrated mass;
- field verification state.

Every enrichment should carry value, unit where applicable, source, reviewer/status, and effective operating/project state.

## 12. FIT Domain API Contract

The intended domain API is conceptually:

```text
validateFitInput()
resolveFitInput()
evaluateFitApplicability()
calculateFit()
assessFit()
runFitSensitivity()
```

### 12.1 `validateFitInput()`

Checks structural/numerical validity only.

Examples:

- finite positive physical dimensions;
- wall physically less than radius where relevant;
- required quantity present;
- valid unit representation after generic resolution;
- no malformed enum/object.

It must not claim the method is applicable.

### 12.2 `resolveFitInput()`

Produces the exact physical values consumed by the selected method and records derivations/source lineage.

Potential examples, only if method requires them:

- ID from OD and wall;
- flow area;
- velocity from mass flow/density/area;
- property resolution.

### 12.3 `evaluateFitApplicability()`

Returns explicit rule results. A valid but out-of-scope case must not produce an authoritative screening assessment.

### 12.4 `calculateFit()`

Pure deterministic equations/correlation only.

No database, web, current time, UI, session, user, mutable latest master, or report behavior.

### 12.5 `assessFit()`

Applies separately versioned criterion/action logic to the raw method result.

### 12.6 `runFitSensitivity()`

Calls the same qualified kernel over controlled parameter/case sweeps. It is orchestration, not another formula implementation.

## 13. FIT Result Shape

An engineering-quality FIT result should support, where defined by the qualified method:

```text
applicability
resolved hydraulic quantities
structural/span representation
raw mechanism-specific output / LOF
significant method intermediates
assessment/action state
governing operating case
governing element/location
qualification
provenance
evidence
warnings/errors
execution identity
```

Do **not** fabricate:

- numerical frequency bands not calculated by the method;
- geometry/source factors not defined by the method;
- pass/fail when assessment authority is unavailable;
- design authority from a screening correlation.

## 14. Error and Failure Taxonomy

FIT must fail closed with explicit classes such as:

```text
INPUT_REQUIRED / INPUT_INVALID
INPUT_UNIT_UNSUPPORTED
APPLICABILITY_FAILURE
MASTER_DATA_MISSING
METHOD_NOT_QUALIFIED
CALCULATION_FAILURE
ASSESSMENT_UNAVAILABLE
AUTHORITY_RESTRICTED
```

A valid state may be:

```text
calculation = successful
assessment = unavailable
authority = exploratory
```

rather than forcing every calculation into PASS/FAIL.

## 15. FIT Qualification Gate

The numerical calculator remains blocked until the qualification dossier is complete for the declared scope.

### 15.1 Required evidence

- controlled method specification;
- source/license register;
- master-data transcription review;
- unit/native-unit specification;
- independent reference/hand calculations;
- legacy workbook parity where useful;
- boundary tests;
- invalid-input tests;
- applicability-failure tests;
- SI/US physical-equivalence tests;
- missing-master fail-closed tests;
- numerical precision/tolerance definition;
- deterministic repeat execution;
- regression suite;
- independent engineering review;
- known limitations;
- signed authority decision.

### 15.2 Minimum benchmark matrix

| Benchmark family | Required behavior |
|---|---|
| Low valid excitation | Independent/reference parity |
| Representative nominal | Independent/reference parity |
| High valid excitation | Correct method response |
| Near criterion | Below / at / above boundary stability |
| Geometry variation | Correct OD/ID/wall dependence where defined |
| Span/support variation | Correct method dependence where defined |
| Supported phases | Correct method branch only for qualified scope |
| Operating cases | Correct governing-case selection |
| SI/US equivalent | Same canonical result within tolerance |
| Missing required input | Field-specific hard failure |
| Missing master record | Hard failure; no fallback |
| Out-of-scope case | Applicability failure; no authoritative assessment |
| Determinism | Identical canonical calculation output for identical pinned inputs/master/kernel |

### 15.3 Independent review roles

At minimum:

```text
Method owner / vibration engineer
Independent checker
Software qualification owner
Release approver
```

The coder/transcriber must not be the only engineering checker.

## 16. Qualification and Authority State Model

Avoid conflating method maturity and permitted use.

Recommended conceptual axes:

### Method qualification

```text
BLOCKED
METHOD_SPECIFIED
IMPLEMENTED
QUALIFIED
```

### Engineering authority

```text
NONE
EXPLORATORY
SCREENING
DESIGN
```

A qualified screening implementation may intentionally remain `DESIGN = false` indefinitely.

This model should be mapped onto the existing Engineering Calculation qualification structures rather than creating an unrelated parallel state machine.

## 17. Table-First Vibration Integrity Workspace

The generic Engineering Calculation Console remains the secondary engineering/API inspection tool.

The ordinary vibration user should eventually work in a dedicated **table-first Vibration Integrity Workspace**.

### 17.1 Facility register

Primary view:

```text
Line | Case | Data status | FIT | AIV | FIP | SBC | Governing mechanism | Finding state
```

Top-level indicators should answer:

- lines in scope;
- screened vs incomplete;
- missing data;
- action/review/acceptable counts;
- mechanism distribution;
- governing operating cases;
- open findings/actions;
- stale/reassessment-required results.

### 17.2 Line detail

Recommended tabs/panels:

```text
Summary
Inputs
Operating Cases
Mechanisms
Findings
Evidence
```

Core UX:

```text
Result
  ↓
Why
  ↓
Evidence
```

### 17.3 Input provenance table

Example:

| Input | Value | Unit | Source | Quality/status |
|---|---:|---|---|---|
| OD | 168.3 | mm | 3D EDIT certified export | source status |
| Wall | 7.11 | mm | catalogue/model | verified/pending |
| Span | 5.8 | m | vibration enrichment | engineer confirmed |
| Mass flow | 11.8 | kg/s | HMB/process case | verified |
| Density | 37.4 | kg/m3 | HMB/process case | verified |

Missing data must display as **NOT ASSESSED / INCOMPLETE**, never as a low-risk result.

## 18. Operating Cases and Scenario Analysis

Operating cases are first-class immutable inputs:

```text
TURNDOWN
NORMAL
RATED
MAXIMUM
DESIGN
STARTUP
SHUTDOWN
UPSET
ALTERNATE_MODE
```

Each mechanism result should be able to preserve:

```text
resultByCase
assessmentByCase
governingCaseId
governingLocationId
```

### 18.1 Baseline vs modification

Scenario analysis should compare explicit overrides, not uncontrolled copied datasets.

Example table:

| Parameter | Baseline | Modification | Change |
|---|---:|---:|---:|
| Mass flow | 11.8 kg/s | 11.8 kg/s | — |
| Verified span | 5.8 m | 3.6 m | -38% |
| FIT metric | result A | result B | calculated delta |
| Assessment | ACTION | ACCEPTABLE | improved |

All scenario results must execute the same production kernel.

## 19. Facility / Batch Execution

Use the existing centralized batch route wherever practical.

Conceptual expansion:

```text
Line × applicable segment/location × operating case × mechanism
```

Do not alter calculation physics for scale.

Facility aggregation is a separate workflow layer over immutable mechanism results.

Long-term performance strategy may include content-addressed caching keyed by pinned method/master/kernel/input/options identity, but no speculative cache abstraction should be added before a real production consumer exists.

## 20. Findings, Mitigation, and Verification

A high screening result should create/drive a structured **Finding**, not an automatic design modification.

Suggested lifecycle:

```text
Finding
  ↓
Engineering review
  ↓
Screening option / recommendation
  ↓
Approved modification scenario
  ↓
Recalculation
  ↓
Physical/field verification
  ↓
Closeout
```

Recommendation authority labels should distinguish, for example:

```text
SCREENING_OPTION
ENGINEERING_RECOMMENDATION
QUALIFIED_DESIGN_CHANGE
RCA_HYPOTHESIS
```

The first FIT release need only establish the data/result pattern; a complete mitigation system is later scope.

## 21. Additional Mechanism Sequence

After the FIT reference vertical is qualified and production-proven:

1. **AIV** — forces source-to-susceptible-discontinuity relationships and acoustic-specific masters.
2. **FIP** — forces dead-leg/acoustic-resonance semantics and prevents terminology collision with FIT.
3. **SBC** — forces separation between parent excitation and vulnerable branch structural response.
4. **Cavitation / flashing** — separate hydraulic/phase-change applicability and assessment.
5. **Surge / momentum** — transient loading/time-history domain.
6. **Slug / multiphase transient** — time-varying forces and heavier structural-response paths.

Every mechanism receives its own method specification and qualification gate.

## 22. Measurements and RCA — Later Horizon

No measurement/RCA capability is required to unblock FIT.

Later table/chart-based scope may include:

```text
MeasurementSession
raw waveform
FFT / PSD
overall RMS/peak/p-p
phase/coherence
ODS/modal result references
RCA hypotheses
evidence for/against
engineer conclusion
```

Automation may assist with candidate mechanism generation, frequency matching, spectral peaks, case correlation, and evidence completeness. It must not autonomously claim confirmed root cause or approved design modification.

## 23. Advanced / Nonlinear Dynamics — Separate Tier

Long-term analysis classes may include:

```text
LINEAR_MODAL
PIECEWISE_LINEAR_CONTACT
NONLINEAR_TIME_HISTORY
```

Support gap, lift-off, friction, impact, looseness, and amplitude-dependent response must never be hidden inside a nominal natural-frequency/damping field.

This tier does not inherit FIT screening authority.

## 24. Delivery Phases and Exit Gates

### Phase 0 — Architecture freeze

**Deliverables**

- this roadmap;
- FIT/FIV terminology decision;
- stable ID compatibility decision;
- table-only product boundary;
- no-silent-default and authority invariants.

**Exit gate**

Architecture decisions recorded and current FIT placeholder remains fail closed.

### Phase 1 — FIT Engineering Method Specification

**Deliverables**

- exact licensed method/revision;
- applicability rules;
- variables/units;
- equation/table/constant inventory;
- raw outputs;
- assessment criteria;
- limitations;
- source/license register.

**Exit gate**

Independent vibration engineer can implement/check the method without interpreting a legacy workbook or marketing material.

### Phase 2 — Master/provenance foundation

**Deliverables**

- immutable FIT master set;
- source artifact hash;
- normalized record hash;
- review/qualification records;
- no missing-data fallback.

**Exit gate**

Required empirical data are deterministic, pinned, reviewable, and fail closed when absent.

### Phase 3 — FIT domain kernel

**Deliverables**

- validation;
- resolution;
- applicability;
- pure calculation;
- separate assessment;
- focused evidence.

**Exit gate**

Independent reference cases and developer tests pass; still no screening authority until qualification sign-off.

### Phase 4 — FIT engineering qualification

**Deliverables**

- benchmark matrix;
- unit-equivalence cases;
- threshold boundaries;
- invalid/applicability failures;
- determinism;
- independent review;
- qualification dossier.

**Exit gate**

Explicit `QUALIFIED` decision for a bounded scope.

### Phase 5 — Central API activation

**Deliverables**

- thin FIT Engineering Calculation adapter;
- preserve `VIB.FIV.FLOW_TURBULENCE` ID;
- replace blocked placeholder only after gate approval;
- Console/Sandbox/batch parity.

**Exit gate**

All callers produce the same qualified mechanism result and evidence.

### Phase 6 — Table exchange and import

**Deliverables**

- explicit `Advanced_Analysis` exchange contract;
- importer/resolver with a real production consumer;
- source identity/provenance preservation;
- process-case join.

**Exit gate**

Certified table data can be ingested, completeness assessed, and resolved into the same FIT API without manual re-entry of available authoritative data.

### Phase 7 — Table-first Vibration Integrity Workspace

**Deliverables**

- facility register;
- line detail;
- inputs/provenance;
- operating cases;
- Result → Why → Evidence;
- missing-data state;
- findings.

**Exit gate**

An engineer can review and explain a line FIT result without using raw JSON or a 3D viewer.

### Phase 8 — Facility screening

**Deliverables**

- batch orchestration;
- completeness dashboard;
- governing case/location;
- filtering/sorting;
- stale/reassessment state;
- 100–1,000+ line regression/performance dataset.

**Exit gate**

Facility execution is reproducible and individual batch item results match direct single-calculation results.

### Phase 9 — Additional mechanisms

AIV → FIP → SBC → cavitation/flashing → surge → slug, each independently specified and qualified.

### Phase 10 — Integrity lifecycle

Mitigation, baseline/modification scenarios, MOC support, verification, closeout.

### Phase 11 — Measurements/RCA

Measurement registry, signal products, evidence-linked hypotheses, engineer sign-off.

### Phase 12 — Advanced/nonlinear dynamics

Solver-specific qualification; no automatic inheritance from screening methods.

## 25. Recommended PR Sequence

Keep PRs small enough for engineering review but action-first per Common CodingRules.

### PR 1 — Roadmap + compatibility-safe FIT terminology

**Current assignment.**

- add `docs/FIVroadmap.md`;
- keep living work report;
- preserve `VIB.FIV.FLOW_TURBULENCE`;
- expose canonical Flow-Induced Turbulence (FIT) naming in the existing blocked production catalogue;
- focused test proves ID stable and execution still blocked;
- no equations or authority change.

### PR 2 — FIT method specification + controlled source/master register

Must contain real engineering closure, not a placeholder abstraction. No equation code until exact method basis is specified.

### PR 3 — FIT pure domain calculation vertical

Implement a real usable domain calculation path from qualified method/master data, with validation/applicability/calculation/assessment separation and benchmark tests.

### PR 4 — FIT qualification + central API activation

Complete independent engineering evidence and activate the existing public calculator ID only when the explicit authority gate is approved.

### PR 5 — Certified table exchange/import vertical

Cross-repo coordination with `Advanced_Analysis`; implement only a format with a real consumer in the same delivery sequence.

### PR 6 — Table-first line workspace

One-line usable product flow: source data → resolved inputs → FIT result → Why → Evidence → operating-case comparison.

### PR 7 — Facility/batch screening

Import, completeness, filtering/sorting, facility screening register, findings, performance/reproducibility.

### PR 8+ — Additional mechanisms and lifecycle

Each mechanism separately governed; then mitigation/MOC/verification; measurements/RCA later.

## 26. Current PR Coding Scope

To obey the qualification gate and action-first rule, the first production change is intentionally narrow but real:

1. Preserve the frozen public ID.
2. Change the visible catalogue name from ambiguous generic "Flow-Induced Vibration Screening" to explicit **"Flow-Induced Turbulence (FIT) Screening"**.
3. Keep qualification issue #429 and `BLOCKED` authority unchanged.
4. Add focused regression asserting:
   - stable calculation ID;
   - canonical FIT display terminology;
   - qualification issue remains #429;
   - execution remains blocked;
   - no numerical outputs appear.

This is a production-visible terminology correction and API-compatibility safeguard. It does not create fake calculation capability.

## 27. Explicitly Deferred from Current PR

- equations/correlations;
- LOF/thresholds;
- FIT master data;
- method applicability rules;
- table importer;
- `Advanced_Analysis` export changes;
- Vibration Integrity Workspace;
- facility screening;
- AIV/FIP/SBC;
- mitigation workflow;
- measurements/RCA;
- nonlinear dynamics.

## 28. Principal Risks and Open Questions

### RISK-001 — Method authority

The largest risk is implementing an empirical FIT method before the exact licensed source/revision, equations, tables, applicability, units, and errata are controlled.

### RISK-002 — API break from terminology cleanup

Mitigation: stable external calculation ID; change display/domain terminology only.

### RISK-003 — Table export authority loss

The current plain CSV carries Elements only. A future importer must explicitly decide whether that is sufficient for its use or whether certified connections/source/catalogue/metadata must travel with it.

### RISK-004 — Hidden shared vibration assumptions

Do not make modal frequency/damping/support stiffness/global factors compulsory defaults simply because future detailed methods use them.

### QST-001 — Exact FIT method revision

Resolve using the legally licensed published/project source before numerical implementation.

### QST-002 — Machine-oriented table exchange format

Decide XLSX vs multi-CSV + manifest or other explicit format in the cross-repo production PR, with a real consumer.

### QST-003 — Exact FIT screening authority boundary

Define the permitted use of the final qualified correlation: screening only, project-specific screening, or another bounded scope. Do not infer design authority.

## 29. Definition of Success

The FIT reference vertical succeeds when an engineer can provide or import authoritative line/process data and receive a reproducible result that can answer:

```text
What was calculated?
Why was the method applicable?
Which inputs were used?
Where did each input come from?
What was derived?
Which exact method/master revision ran?
Which native/canonical units were used?
Which operating case governed?
Which assessment criterion was applied?
What software/kernel revision produced it?
Was the implementation qualified?
What authority did the result carry?
What changed between baseline and modification?
```

The platform then scales that exact evidence model from one line to facility screening and later to additional mechanisms.

The permanent rule remains:

> **Share infrastructure and physical data where definitions are identical; never share empirical engineering authority by default.**
