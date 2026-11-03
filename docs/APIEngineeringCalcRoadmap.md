# Engineering Calculation API — Concept, Current-State Ground Truth and Roadmap

**Canonical file:** `docs/APIEngineeringCalcRoadmap.md`  
**Repository:** `reallaksh19/3D_Converters`  
**Audited 3D_Converters baseline:** `c250936255e33c71886ef9bf3ece560baedc6415`  
**Reference architecture document:** `reallaksh19/Advanced_Analysis/docs/conceptcumroadmapLAFEA.md` at `84b40f06ef1e445212c31c2784106c89dbe46dc2`  
**Misc-calculation reference baseline:** `reallaksh19/CRF-4-1` at `68dc8e1fa2ef67073c59b3afc56f1bf40953d535`  
**Audit / roadmap date:** 2026-08-11  
**Document status:** `GOVERNING_CONCEPT_AND_ROADMAP`  
**Engineering status:** This document governs architecture, sequencing, authority boundaries, and qualification expectations for the Engineering Calculation API programme. It is not, by itself, numerical qualification evidence, a code-compliance approval, or permission to treat migrated spreadsheet logic as design authority.

---

## 0. Purpose and mandatory use

This document defines how `3D_Converters` should evolve from several successful engineering APIs into a **centralized Engineering Calculation Platform** capable of supporting B31.3 calculations, empirical models, vibration screening, dynamic loads, trunnion/support calculations, equipment load checks, flange/joint checks, and other miscellaneous engineering calculations.

It shall be used as the first planning reference when:

- adding a new engineering calculator;
- migrating a calculator from `CRF-4-1`, an Excel workbook, Access implementation, Python script, or another project;
- adding or changing engineering master data, lookup tables, allowable tables, empirical constants, or qualification status;
- creating UI for an engineering calculator;
- introducing batch calculations from line-list, PCF, CII, CAESAR, XML, or model data;
- deciding whether a calculation is conceptual, screening-only, benchmark-qualified, project-approved, verified, or production-authorized;
- reviewing a PR that changes calculation formulas, resolvers, unit conversion, master data, result semantics, or engineering authority;
- planning FIV, AIV, small-bore vibration, cavitation/flashing, surge/momentum, slug, relief reaction, trunnion, welded-shoe, shell-indentation, API/NEMA nozzle-load, flange, blast, or related calculations.

A capability shall **not** be claimed merely because a formula module, spreadsheet, registry row, UI panel, or merged PR exists. The claim must match the executable production route, qualification state, exact source/master revision, and validation evidence.

### 0.1 Authority precedence

When sources disagree, use this order:

1. **Controlled project engineering basis / edition-of-record and independently qualified implementation at the inspected exact HEAD.**
2. **Exact-HEAD benchmark evidence, retained reference cases, and approved master-data revisions.**
3. **Executable production API contracts and active runtime registries.**
4. **This document, when updated in the same PR as the material capability change.**
5. **Historical workbooks, CRF implementations, notes, archived scripts, PR descriptions, and legacy UI behavior.**

A workbook or legacy calculator is therefore a **migration/reference source** until its equations, units, lookup behavior, assumptions, limits, and benchmark cases are explicitly qualified.

### 0.2 Mandatory update rule

Any PR that materially changes the Engineering Calculation Platform should update this roadmap when it changes one or more of:

- public calculation API shape;
- calculation registry or grouping;
- qualification states or authority behavior;
- central result-envelope semantics;
- unit normalization policy;
- master-data activation or provenance policy;
- a new calculation family or major calculator;
- UI calculation catalogue / option master;
- batch calculation route;
- significant known limitation;
- migration or qualification sequence.

### 0.3 Core operating principle

> **One calculation platform, many isolated engineering kernels.**

The central API shall orchestrate calculators, units, provenance, and result envelopes. It shall **not** become a giant formula file or a second engineering kernel.

The UI shall consume the API. The UI shall not rederive engineering equations.

---

# 1. Executive engineering conclusion

`3D_Converters` already has the correct seed architecture for an API-first engineering platform:

- a reusable ASME B31.3 straight-pipe thickness API;
- B31.3 material-factor resolution with explicit qualification status;
- a project pipe-wall master / commercial schedule selector;
- an empirical-weight estimator with exact lookup, Approach 1, Approach 2, tuning, validation, evidence, and Sandbox support;
- Engineering UI concepts for editable governed masters and model tuning.

The next step should **not** be to copy the `CRF-4-1` Misc Calc tab into `3D_Converters` or create one large UI file with formulas embedded in event handlers.

The target is:

```text
Engineering sources / model context / manual inputs
                  ↓
          input provenance resolver
                  ↓
        canonical unit normalization
                  ↓
       applicability + input validation
                  ↓
        Engineering Calculation Registry
                  ↓
             calculator kernel
                  ↓
       assessment / acceptance layer
                  ↓
        canonical result envelope
                  ↓
       evidence + provenance + version
                  ↓
   API consumers / UI / batch / export / reports
```

The platform should make it inexpensive to add a calculator, while making it **difficult to accidentally grant authority** to unqualified formulas, unreviewed source tables, silent defaults, or UI-only calculations.

The most valuable near-term programme result is:

> **A centralized Engineering Calculation API and one Engineering Calculation Console that can host multiple independently qualified calculation families, starting with the existing B31.3/weight capabilities and then adding vibration/dynamic, trunnion/support, relief/transient, and equipment-interface calculations through controlled migration from CRF-4-1 and project workbooks.**

The programme should prioritize **FIV, AIV, small-bore vibration, surge/momentum/slug, and trunnion/local-support calculations**, because these form a coherent engineering workflow around piping vibration risk and local support demand.

---

# 2. Programme terminology and boundaries

## 2.1 Calculation kernel

A **calculation kernel** is a deterministic engineering function that receives canonical inputs and produces numerical outputs/intermediate values.

Examples:

```text
calculateB313Thickness()
calculateFivScreening()
calculateAivScreening()
calculateSlugLoad()
calculateTrunnionAssessment()
calculateApi610NozzleLoads()
```

A kernel shall not own DOM state, localStorage, file pickers, alerts, tab selection, or UI rendering.

## 2.2 Resolver

A resolver obtains or derives required inputs from an explicit source:

```text
manual user entry
project line list
PCF / XML / CII model
CAESAR result
pipe wall master
material master
fluid/process data
calculation-specific lookup master
```

Resolvers may transform identity and select approved lookup rows. They shall retain provenance and shall fail closed when ambiguity changes engineering meaning.

## 2.3 Assessment layer

A **calculation** and an **acceptance assessment** are separate concepts.

Example:

```text
calculation → predicted excitation index = 0.73
assessment  → screening threshold = 1.00 → SCREENING_PASS
```

The kernel should calculate the engineering quantity. The assessment layer applies a named rule, limit, code clause, project criterion, or method threshold.

No generic `pass: true` should be invented where a calculator has no qualified acceptance rule.

## 2.4 Master data

Master data includes:

- allowable tables;
- pipe dimensions;
- material factors;
- interpolation tables;
- empirical coefficients;
- equipment nozzle-load limits;
- lookup constants;
- method thresholds;
- UI calculator catalogue metadata.

Master data can supply values but shall never contain executable JavaScript or silently grant calculation authority.

## 2.5 Presenter / UI

The presenter may:

- format units;
- display equations and intermediate values already returned by the API;
- show warnings and assumptions;
- display source/provenance;
- visualize geometry or load directions;
- compare scenarios;
- export reports.

It shall not recompute the engineering result.

## 2.6 Capability states

The programme should use explicit calculation capability states:

| State | Meaning |
|---|---|
| `REFERENCE_ONLY` | Workbook/legacy source exists but has not been migrated or qualified. |
| `CONCEPT` | Planned API/registry item; no complete production capability. |
| `MIGRATED_UNQUALIFIED` | Code exists and may run, but reference parity / independent validation is incomplete. |
| `SCREENING` | Calculation is intentionally usable for screening with explicit limitations. |
| `BENCHMARK_QUALIFIED` | Kernel has independent benchmark evidence over a declared domain. |
| `PROJECT_APPROVED` | Method/data is approved for a declared project engineering basis. |
| `VERIFIED` | Controlled method implementation and data have been independently verified. |
| `PRODUCTION_AUTHORIZED` | Normal production use is explicitly authorized for the declared scope. |
| `BLOCKED` | Execution/promotion is intentionally blocked pending named information or authority. |
| `NOT_IMPLEMENTED` | No usable engine exists. |

These states shall not be inferred from file existence.

## 2.7 Data qualification states

Engineering master records should continue the pattern already used by B31.3 material factors:

```text
DRAFT
BENCHMARK_ONLY
SCREENING
PROJECT_APPROVED
VERIFIED
RETIRED
```

A calculation may be `BENCHMARK_QUALIFIED` while depending on `SCREENING` data; the final result must then expose the lower authority and shall not become strict design authority.

## 2.8 Cross-code authority

Data shall not leak between code/method families merely because the dimensions look compatible.

Examples:

- B31.3 allowable stress does not automatically become ASME VIII allowable stress.
- API 610 nozzle-load allowables do not become API 617 or NEMA allowables.
- an empirical vibration threshold does not become a code pass/fail criterion.
- B36.10/B36.19 pipe-wall data does not decide material code qualification.

---

# 3. Current `3D_Converters` engineering API baseline

At audited baseline `c250936255e33c71886ef9bf3ece560baedc6415`, the engineering API programme has four important production building blocks.

## 3.1 B31.3 straight-pipe thickness

Primary public route:

```text
converters/b313-thickness/index.js
```

Current public concepts include:

```text
calculateB313Thickness()
evaluateB313ProvidedWall()
selectB313NominalWall()
calculateB313PressureStressRatios()
createB313ThicknessCalculator()
```

This is the model for a calculator kernel: explicit inputs, reusable API, no UI authority, defined applicability.

## 3.2 B31.3 material-factor pipeline

Primary route:

```text
converters/b313-material-factors/index.js
```

Current public concepts include:

```text
normalizeB313MaterialFamily()
resolveB313MaterialIdentity()
resolveB313DesignFactors()
getB313MaterialFactorCoverage()
calculateB313MaterialDesign()
```

The important architecture to preserve is not only the formula result, but the **qualification-mode boundary**:

```text
strict      → approved / verified authority only
benchmark   → benchmark rows permitted
screening   → screened rows permitted
caller override → explicit source authority
```

## 3.3 Pipe-wall master API

Primary route:

```text
converters/pipe-wall-master/index.js
```

Current public concepts include:

```text
lookupPipeWall()
listPipeWallsForSize()
selectRequiredPipeWall()
selectPipeWallForCalculation()
validatePipeWallMaster()
```

This establishes the correct separation between **master data** and the calculation that consumes it.

## 3.4 Empirical weight API

Primary route:

```text
converters/empirical-weight/index.js
```

Current capabilities include:

```text
exact lookup
Approach 1
Approach 2
final estimator
candidate tuning
validation / evidence
Sandbox active-vs-candidate comparison
```

The empirical Sandbox is a useful pattern for future engineering calculators: users can interrogate a calculation path without changing active authority.

## 3.5 Current capability matrix

| Capability | Current state | Target relationship to central platform |
|---|---|---|
| B31.3 thickness | Production API | Register as `PIPE.B313.THICKNESS` without wrapping formulas in a second kernel. |
| B31.3 material design | Production API with screening/strict qualification | Register as `PIPE.B313.MATERIAL_DESIGN`. |
| Pipe-wall master | Production master API | Shared dependency, not a calculator. |
| Empirical weight | Production estimator API | Register under `ESTIMATION.WEIGHT` / Engineering Models; preserve direct public API. |
| B31.3 Material Factors UI | Engineering master editor | Remain an Engineering Data/Masters tool. |
| Empirical Weight Tuning UI | Engineering model editor/Sandbox | Remain a model-tuning tool; Sandbox may also appear as a calculator launch point. |
| Central Engineering Calculation Console | Not implemented | Primary UI roadmap target. |
| Central calculation registry/engine | Not implemented | Primary API roadmap target. |

---

# 4. `CRF-4-1` MiscCalc reference truth

`CRF-4-1` contains valuable engineering history, spreadsheets, lookup tables, formula modules, SVGs, resolver ideas, and a calculation registry. It should be treated as a **migration inventory and source-evidence repository**.

It should not be imported wholesale.

## 4.1 Useful decomposition already visible in CRF

The MiscCalc work contains recognizable layers:

```text
calc/core/calc-engine.js
calc/core/calc-registry.js
calc/formulas/**
calc/resolvers/**
calc/lookups/**
calc/master/**
calc/units/**
calc/svg/**
tabs/misc-calc-tab.js
```

This decomposition is directionally correct and should inform the `3D_Converters` platform.

## 4.2 Registered / referenced calculation inventory

The CRF MiscCalc UI registers or references calculations including:

- Vessel skirt;
- API 610 nozzle loads;
- AIV / FIV;
- external pressure;
- welded shoe;
- GRE flange;
- flange check;
- flange leakage;
- liquid relief;
- PSV open;
- bursting-disc liquid;
- blast;
- trunnion;
- momentum;
- force summary;
- gas/vapour relief reaction;
- NEMA SM23;
- slug loads;
- pipe shell indentation.

The repository also contains source spreadsheets for:

- Flow Induced Turbulence / FIV;
- AIV;
- small-bore vibration;
- cavitation & flashing;
- surge and momentum changes;
- slug-flow time history;
- pipe trunnion;
- support structures;
- external pressure;
- flange rigidity/leakage;
- bursting disc vapour/liquid;
- API 617 / equipment-interface checks;
- relief-valve reaction forces.

## 4.3 Known reference limitations

The CRF hardening notes explicitly identify incomplete workbook parity for several calculators. The current AIV/FIV module reports placeholder zeros and `PENDING_SOURCE_EXTRACTION`. The current trunnion implementation calculates nominal member stresses and explicitly states that exact local pad-edge/trunnion stresses remain pending source extraction.

Therefore:

```text
CRF module exists ≠ formula parity
formula parity ≠ independent qualification
independent qualification ≠ project approval
project approval ≠ production authorization
```

## 4.4 What should be reused conceptually

Reuse these ideas:

- explicit calculator IDs;
- central registry;
- result envelope;
- formula/resolver/master separation;
- units as a shared service;
- calculator-specific diagrams;
- source-data editors;
- benchmark case storage;
- clear pending states instead of invented equations.

## 4.5 What should not be copied directly

Do not copy these weaknesses into the new platform:

- placeholder outputs that look numerically valid;
- a generic `pass: true` default;
- UI modules importing/registering every engineering formula directly;
- assumptions such as zero moments or default dimensions that silently change engineering meaning;
- workbook-extraction TODOs presented as completed calculators;
- large UI files containing calculator-specific orchestration;
- source tables that can silently fall back to placeholders;
- unit conversions whose empirical constants depend on hidden source units.

---

# 5. Target Engineering Calculation Platform architecture

## 5.1 Proposed source layout

```text
converters/
  engineering-calculations/
    index.js
    engineering-calculation-engine.js
    engineering-calculation-registry.js
    engineering-calculation-contract.js
    engineering-calculation-qualification.js
    engineering-calculation-units.js
    engineering-calculation-batch.js
    engineering-calculation-provenance.js

    groups/
      pipe-integrity/
      vibration-dynamics/
      transient-loads/
      local-supports/
      equipment-interface/
      flange-joint/
      hazard-special/

    generated/
      engineering-calculation-catalog.js
      ...generated master registries only where required

    adapters/
      model-context-adapter.js
      line-list-adapter.js
      caesar-load-adapter.js
      manual-input-adapter.js

docs/Masters/EngineeringCalculations/
  engineering-calculation-catalog.json
  qualification-profiles.json
  unit-profiles.json
  vibration/
  transient-loads/
  local-supports/
  equipment-interface/
  flange-joint/
  hazard-special/
```

Existing domain APIs such as `b313-thickness`, `b313-material-factors`, `pipe-wall-master`, and `empirical-weight` should remain valid public modules. The central platform should **compose** them, not duplicate them.

## 5.2 Central registry

The registry should be explicit code, not arbitrary runtime plugin loading.

Conceptual descriptor:

```js
{
  id: 'VIB.FIV.FLOW_TURBULENCE',
  groupId: 'VIBRATION_DYNAMICS',
  version: '1.0.0',
  label: 'Flow-Induced Vibration — Turbulence Screening',
  capabilityState: 'SCREENING',
  inputContractId: 'vibration-fiv-input/v1',
  resultContractId: 'vibration-fiv-result/v1',
  unitProfile: 'ENGINEERING_SI_CANONICAL',
  qualificationProfile: 'FIV-SCREENING-v1',
  calculate,
  validateInput,
  resolveInput,
  assess,
}
```

The runtime registry must map a known ID to a real production-consumed implementation.

No catalogue/master JSON row shall be sufficient to execute code.

## 5.3 Central execution engine

The central engine should do orchestration only:

```text
find descriptor
→ normalize request metadata
→ resolve input provenance
→ convert to canonical units
→ validate required inputs
→ applicability check
→ invoke calculator kernel
→ invoke named assessment profile if applicable
→ assemble evidence/provenance
→ return immutable result envelope
```

It must not contain calculator-specific equations.

Suggested public API:

```js
listEngineeringCalculations()
getEngineeringCalculationDefinition(id)
validateEngineeringCalculationInput(id, input, options)
resolveEngineeringCalculationInputs(id, input, context, options)
calculateEngineering(id, input, options)
calculateEngineeringBatch(requests, options)
getEngineeringCalculationQualification(id)
createEngineeringCalculationEngine(options)
```

Direct calculator APIs should also remain exportable for engineering reuse and testing.

## 5.4 Canonical result envelope

Recommended shape:

```js
{
  ok: true,
  code: 'ENGINEERING_CALCULATION_COMPLETED',

  calculation: {
    id: 'VIB.FIV.FLOW_TURBULENCE',
    version: '1.0.0',
    methodId: 'PROJECT_FIV_METHOD/v1',
    capabilityState: 'SCREENING'
  },

  applicability: {
    applicable: true,
    basis: [],
    exclusions: []
  },

  inputs: {
    canonical: {},
    provenance: {}
  },

  result: {},
  intermediate: {},

  assessment: {
    status: 'SCREENING_PASS',
    checks: []
  },

  assumptions: [],
  warnings: [],
  limitations: [],

  provenance: {
    masterRevisions: {},
    methodSources: [],
    overrides: []
  },

  evidence: {
    semanticHash: '...',
    benchmarkProfile: '...',
    qualificationState: 'SCREENING'
  }
}
```

Failure states should remain structured:

```text
INPUT_INCOMPLETE
INPUT_AMBIGUOUS
NOT_APPLICABLE
MASTER_DATA_INCOMPLETE
UNSUPPORTED_METHOD
QUALIFICATION_BLOCKED
CALCULATION_FAILED
```

## 5.5 Result semantics

Do not use one Boolean `pass` for every engineering problem.

Use explicit assessment status:

```text
CALCULATED_ONLY
SCREENING_PASS
SCREENING_REVIEW
SCREENING_FAIL
CODE_PASS
CODE_FAIL
NOT_APPLICABLE
INCOMPLETE
BLOCKED
```

`CODE_PASS` / `CODE_FAIL` are only allowed when the method and data have explicit code-assessment authority.

## 5.6 Canonical units

Each kernel should calculate in one declared canonical unit system.

Recommended internal basis:

```text
length        mm
area          mm² or m² by explicit contract
force         N
moment        N·mm
pressure      MPa
stress        MPa
mass          kg
mass flow     kg/s
velocity      m/s
density       kg/m³
temperature   °C or K by explicit contract
frequency     Hz
power         W
```

Empirical formulas containing constants tied to Imperial or mixed units require a **method-specific source-unit stage**. Never algebraically reuse a unit-dependent constant after silently converting only some variables.

Unit invariance must be tested.

## 5.7 Provenance at field level

Auto-resolved values should retain source:

```js
outsideDiameterMm: {
  value: 273.0,
  source: {
    authority: 'PIPE_WALL_MASTER',
    recordId: '...',
    revision: '...'
  }
}
```

Manual override should not erase ancestry:

```js
{
  value: 275,
  source: { authority: 'CALLER_OVERRIDE' },
  replaced: { authority: 'PIPE_WALL_MASTER', value: 273 }
}
```

## 5.8 Semantic version / evidence hash

A reproducible result should be bound to:

```text
calculator ID + calculator version
canonical inputs
method profile
master-data revisions
qualification mode
explicit overrides
```

This enables a result generated today to be distinguished from the same inputs after a master or method update.

---

# 6. Calculation-family grouping

The MiscCalc inventory should be converted into coherent engineering families rather than a flat list of unrelated spreadsheets.

## 6.1 Group A — Pipe Design & Pressure Integrity

**Group ID:** `PIPE_INTEGRITY`

Candidate calculators:

- B31.3 straight-pipe required thickness — existing;
- B31.3 material design + commercial wall — existing;
- provided-wall pressure evaluation — existing;
- external-pressure / collapse screening;
- branch reinforcement;
- pipe shell local indentation / local loading.

Shared contexts:

```text
PipeGeometryContext
MaterialContext
DesignConditionContext
PipeWallContext
CodeEditionContext
```

Key rule: external-pressure or ASME VIII calculations must not inherit B31.3 material authority without an explicit cross-code material profile.

## 6.2 Group B — Vibration & Dynamic Screening

**Group ID:** `VIBRATION_DYNAMICS`

Candidate calculators:

- FIV / flow-induced turbulence;
- AIV / acoustic-induced vibration;
- small-bore connection vibration;
- cavitation / flashing vibration;
- surge / momentum change;
- slug-flow screening and time-history load generation;
- generic vibration applicability / screening bundle.

Shared contexts:

```text
PipeGeometryContext
FluidOperatingContext
DynamicSpanContext
ConnectionContext
MaterialContext
ExcitationContext
```

This should be the primary new family after the central platform foundation.

## 6.3 Group C — Relief, Discharge & Transient Loads

**Group ID:** `TRANSIENT_LOADS`

Candidate calculators:

- gas/vapour relief reaction;
- liquid relief reaction;
- PSV open-system reaction;
- closed-system relief dynamic force;
- bursting-disc vapour;
- bursting-disc liquid;
- momentum-change load;
- slug transient load.

Shared contexts:

```text
FluidOperatingContext
DischargeGeometryContext
AmbientBackpressureContext
TransientLoadContext
```

The API should return a canonical 3D force/moment demand where possible so the result can be fed explicitly into piping/support calculations.

## 6.4 Group D — Local Supports & Attachments

**Group ID:** `LOCAL_SUPPORTS`

Candidate calculators:

- pipe trunnion;
- welded shoe;
- pipe shell indentation / local loading;
- cantilever support;
- goal-post support;
- L-frame support;
- tee-post support;
- trapeze support.

Shared contexts:

```text
PipeGeometryContext
SupportGeometryContext
LoadVectorContext
MaterialContext
WeldContext
AttachmentContext
```

The trunnion programme should be treated as a serious local-stress calculation, not merely a beam section check.

## 6.5 Group E — Equipment Interface Loads

**Group ID:** `EQUIPMENT_INTERFACE`

Candidate calculators:

- API 610 pump nozzle-load check;
- API 617 compressor/interface check;
- NEMA SM23 turbine/nozzle load check;
- vessel-skirt interface/load summary;
- force/moment summary / coordinate transformation.

Shared contexts:

```text
EquipmentIdentityContext
NozzleGeometryContext
LoadVectorContext
CoordinateSystemContext
AllowableMasterContext
```

## 6.6 Group F — Flanges & Joints

**Group ID:** `FLANGE_JOINT`

Candidate calculators:

- flange leakage;
- flange force/moment allowable check;
- GRE flange check;
- flange rigidity;
- pressure / external-load interaction where qualified.

Shared contexts:

```text
FlangeGeometryContext
FlangeMaterialContext
GasketContext
LoadVectorContext
PressureTemperatureContext
```

## 6.7 Group G — Hazard & Special Screening

**Group ID:** `HAZARD_SPECIAL`

Candidate calculators:

- blast pressure/load screening;
- special project pressure/transient checks;
- future specialty calculators that do not belong in a code family.

These should remain isolated and should not become a miscellaneous dumping ground. A new group should be created when several related calculators emerge.

---

# 7. Vibration programme — FIV, AIV and related calculations

The vibration family should be implemented as a **suite of independent calculations sharing a canonical context**, not one giant `AIV/FIV` formula module.

## 7.1 Canonical vibration context

The shared input context should be capable of holding, where applicable:

```js
{
  pipe: {
    outsideDiameterMm,
    wallThicknessMm,
    insideDiameterMm,
    schedule,
    materialId,
    densityKgM3,
    elasticModulusMPa
  },

  process: {
    phase,
    fluidDensityKgM3,
    velocityMS,
    massFlowKgS,
    pressureMPa,
    temperatureC,
    vaporPressureMPa,
    speedOfSoundMS
  },

  geometry: {
    straightLengthMm,
    unsupportedSpanMm,
    branchDiameterMm,
    branchLengthMm,
    fittingType,
    valveType
  },

  operating: {
    steady: {},
    maximum: {},
    transient: {}
  },

  source: {
    lineId,
    nodeId,
    modelElementId,
    provenance: {}
  }
}
```

Not every calculator uses every field. The descriptor declares required fields.

## 7.2 Applicability resolver

Before running equations, the suite should determine which checks are relevant.

Example statuses:

```text
FIV          APPLICABLE / NOT_APPLICABLE / INPUT_INCOMPLETE
AIV          APPLICABLE / NOT_APPLICABLE / INPUT_INCOMPLETE
SBC          APPLICABLE / NOT_APPLICABLE / INPUT_INCOMPLETE
CAVITATION   APPLICABLE / NOT_APPLICABLE / INPUT_INCOMPLETE
SURGE        APPLICABLE / NOT_APPLICABLE / INPUT_INCOMPLETE
SLUG         APPLICABLE / NOT_APPLICABLE / INPUT_INCOMPLETE
```

The resolver must explain the decision. It must not silently mark a check non-applicable because one input was missing.

## 7.3 FIV — flow-induced turbulence

Current CRF state: the formula module is a placeholder and explicitly awaits source extraction.

Therefore the FIV implementation sequence must be:

1. identify the controlled project workbook / method basis;
2. inventory sheets, named ranges, hidden sheets, macros, lookup tables, unit conventions, thresholds, and output cells;
3. build a **method trace map** from workbook concept to canonical API variable;
4. document every conditional branch and applicability limit;
5. reproduce a small number of workbook cases independently outside the new implementation;
6. implement the kernel as pure functions;
7. compare the API against workbook reference cases;
8. add unit-invariance and boundary tests;
9. expose screening status and method provenance;
10. only then activate the real UI route.

No placeholder `lof=0` / `fmax=0` / `flim=0` behavior should enter the new platform.

Suggested API:

```js
calculateFivScreening(input, options)
assessFivScreening(result, profile)
```

The output should expose the actual physical/screening quantities used by the method, not just a final colour.

## 7.4 AIV — acoustic-induced vibration

AIV should be a separate calculator because:

- inputs and excitation mechanism differ from FIV;
- applicability differs;
- source tables/thresholds differ;
- qualification may mature at a different rate.

Suggested API:

```js
calculateAivScreening(input, options)
assessAivScreening(result, profile)
```

If the project AIV workbook uses line power level, acoustic power, diameter/thickness effects, branch geometry, DLF/LOF, or other method-specific terms, the exact variable definitions must come from source extraction rather than memory or internet paraphrase.

## 7.5 Small-bore vibration

Small-bore vibration should consume a shared parent-line vibration context plus connection-specific geometry.

Important separation:

```text
parent-line excitation
→ connection geometry / mass / span
→ connection response / screening
→ acceptance profile
```

Do not treat a small-bore connection as merely a smaller copy of the main pipe.

## 7.6 Cavitation and flashing

This calculator should be separated into:

```text
process-condition resolver
→ cavitation / flashing regime identification
→ excitation screening quantity
→ vibration-risk assessment
```

Process regime identification should not be embedded invisibly inside UI labels.

## 7.7 Surge and momentum

Momentum-change calculations can become a shared dynamic-load service:

```js
calculateMomentumChangeLoad()
calculateBendMomentumLoad()
calculateTransientMomentumEnvelope()
```

Outputs should use a canonical force vector and preserve the coordinate basis.

This service can then support:

- surge screening;
- relief discharge;
- slug loading;
- support demand;
- piping-model load export.

## 7.8 Slug flow / time history

The current CRF slug calculation has a useful momentum foundation but explicitly notes that time-history multipliers remain incomplete.

Target architecture:

```text
slug geometry / density / velocity
→ slug mass and momentum state
→ bend / direction-change force
→ arrival/departure timing
→ force-time-history generator
→ optional dynamic amplification profile
→ exportable time history
```

The time-history generator and the screening DAF method should be separate functions so a future dynamic solver can consume the raw load history without a screening multiplier being hard-wired.

## 7.9 Vibration bundle API

A convenience API may run all applicable checks:

```js
calculateVibrationAssessmentBundle({
  context,
  calculators: ['FIV', 'AIV', 'SBC', 'CAVITATION', 'SURGE', 'SLUG']
})
```

But the bundle must retain each calculator result independently:

```text
bundle summary is convenience
individual calculator result is authority
```

## 7.10 Vibration UI

One **Vibration & Dynamics** workspace should provide:

```text
Overview
FIV
AIV
Small Bore
Cavitation / Flashing
Surge / Momentum
Slug / Time History
Evidence
```

The user should be able to see:

- which checks are applicable;
- which inputs came from the model;
- which inputs were manually overridden;
- which source/master revision was used;
- each intermediate quantity required to review the method;
- screening result and limitations;
- benchmark/qualification state.

---

# 8. Trunnion and local-support calculation programme

## 8.1 Current reference limitation

The CRF trunnion module calculates nominal trunnion-member axial/shear/bending stress and explicitly states that exact local stresses at the pad edge/trunnion remain pending source extraction.

That implementation is useful as a reference but is not the final trunnion method.

## 8.2 Required engineering decomposition

A proper trunnion calculation should be decomposed into reviewable stages:

```text
1. Input / load provenance
2. Pipe and trunnion geometry
3. Load-vector transformation to local axes
4. Trunnion member section properties
5. Trunnion member stress
6. Host-pipe local load introduction
7. Reinforcement/pad effect, if applicable
8. Weld demand, if applicable
9. Pressure membrane contribution, if applicable
10. Combined local assessment
11. Allowable / acceptance profile
12. Evidence and limitations
```

These stages should remain explicit even if the source workbook combines them on one sheet.

## 8.3 Proposed API

```js
resolveTrunnionInputs(input, context)
calculateTrunnionMemberDemand(input)
calculateTrunnionLocalPipeDemand(input, methodProfile)
calculateTrunnionWeldDemand(input, methodProfile)
assessTrunnionDemand(result, assessmentProfile)
calculateTrunnionAssessment(input, options)
```

The high-level function composes the lower-level functions; it does not duplicate them.

## 8.4 Reuse of existing `3D_Converters` APIs

Where applicable, trunnion calculation should reuse:

```text
pipe-wall master → OD / commercial wall identity
B31.3 material-factor resolver → only for B31.3-authorized properties
B31.3 thickness result → pressure-design minimum / available-wall context
model/CII load adapter → forces and moments
```

It must not reuse B31.3 factors for a local-stress method governed by another code or project procedure unless the method explicitly permits it.

## 8.5 Load vectors

Use a canonical six-component load vector:

```js
{
  forceN:  { x, y, z },
  momentNmm: { x, y, z },
  coordinateSystem: 'PIPE_LOCAL',
  referencePoint: {...}
}
```

Any transform between global, pipe-local, support-local, or equipment axes must be an explicit reusable function with conservation tests.

## 8.6 Trunnion UI

The UI should show the calculation in layers:

```text
Geometry
Loads
Member Check
Local Pipe / Pad Check
Weld Check
Combined Result
Basis / Evidence
```

A geometry sketch/SVG is useful, but the sketch must be driven from canonical inputs and must not own calculation values.

---

# 9. Master-data architecture and UI options master

## 9.1 Two different masters

The programme needs two distinct concepts:

### Engineering data masters

Examples:

```text
API610 allowables
flange allowables
PSV orifice tables
vibration thresholds
material properties
lookup coefficients
```

### Calculation catalogue master

This controls discoverability/presentation:

```text
which calculators are shown
what group they belong to
label / description / icon
input form profile
whether Sandbox/batch is available
which qualification badge is shown
```

The catalogue master does **not** grant runtime execution authority.

## 9.2 Proposed calculation catalogue

Canonical editable file:

```text
docs/Masters/EngineeringCalculations/engineering-calculation-catalog.json
```

Generated runtime projection if required:

```text
converters/engineering-calculations/generated/engineering-calculation-catalog.js
```

Example row:

```json
{
  "id": "VIB.FIV.FLOW_TURBULENCE",
  "groupId": "VIBRATION_DYNAMICS",
  "label": "FIV — Flow-Induced Turbulence",
  "shortLabel": "FIV",
  "description": "Flow-induced vibration screening using the controlled project method.",
  "order": 10,
  "ui": {
    "enabled": true,
    "icon": "activity",
    "workspace": "FORM_RESULT_BASIS_EVIDENCE",
    "supportsScenarioCompare": true,
    "supportsBatch": true
  },
  "capabilityState": "SCREENING",
  "qualificationProfile": "FIV-SCREENING-v1",
  "inputProfile": "FIV-INPUT-v1",
  "resultProfile": "FIV-RESULT-v1"
}
```

The runtime registry independently maps this `id` to an implementation. If either the registry or catalogue is missing, the UI should show a controlled unavailable state rather than guessing.

## 9.3 Proposed UI options master table

| Group | Calculation ID | UI label | Initial source | Target state | Batch? | Scenario compare? |
|---|---|---|---|---|---|---|
| Pipe Integrity | `PIPE.B313.THICKNESS` | B31.3 Pipe Thickness | Existing API | `PRODUCTION_AUTHORIZED` within declared scope | Yes | Yes |
| Pipe Integrity | `PIPE.B313.MATERIAL_DESIGN` | B31.3 Material + Wall | Existing API | `SCREENING` / strict by data status | Yes | Yes |
| Pipe Integrity | `PIPE.EXTERNAL_PRESSURE` | External Pressure | CRF workbook | `REFERENCE_ONLY` → qualified | Yes | Yes |
| Pipe Integrity | `PIPE.BRANCH_REINFORCEMENT` | Branch Reinforcement | CRF workbook | `REFERENCE_ONLY` | Yes | Yes |
| Pipe Integrity | `PIPE.SHELL_INDENTATION` | Pipe Local Loading | CRF workbook/module | `MIGRATED_UNQUALIFIED` initially | Yes | Yes |
| Vibration | `VIB.FIV.FLOW_TURBULENCE` | FIV — Flow Turbulence | CRF FIT/FIV workbooks | `REFERENCE_ONLY` → `SCREENING` | Yes | Yes |
| Vibration | `VIB.AIV.ACOUSTIC` | AIV — Acoustic | CRF AIV workbooks | `REFERENCE_ONLY` → `SCREENING` | Yes | Yes |
| Vibration | `VIB.SBC.SMALL_BORE` | Small-Bore Vibration | CRF SBC workbook | `REFERENCE_ONLY` | Yes | Yes |
| Vibration | `VIB.CAVITATION.FLASHING` | Cavitation / Flashing | CRF KS-PR-CAL-0089 | `REFERENCE_ONLY` | Yes | Yes |
| Vibration | `VIB.SURGE.MOMENTUM` | Surge / Momentum | CRF KS-PR-CAL-0090 | `REFERENCE_ONLY` | Yes | Yes |
| Vibration | `VIB.SLUG.TIME_HISTORY` | Slug / Time History | CRF slug workbooks/module | `MIGRATED_UNQUALIFIED` → qualified | Yes | Yes |
| Transient Loads | `LOAD.MOMENTUM.CHANGE` | Momentum Change Load | CRF module/workbooks | migrate/qualify | Yes | Yes |
| Transient Loads | `LOAD.RELIEF.GAS` | Gas/Vapour Relief Reaction | CRF module/workbook | migrate/qualify | Yes | Yes |
| Transient Loads | `LOAD.RELIEF.LIQUID` | Liquid Relief Reaction | CRF module/workbook | migrate/qualify | Yes | Yes |
| Transient Loads | `LOAD.PSV.OPEN` | PSV Open Reaction | CRF module/source tables | pending workbook parity | Yes | Yes |
| Transient Loads | `LOAD.BURST_DISC.VAPOUR` | Bursting Disc — Vapour | CRF workbook | `REFERENCE_ONLY` | Yes | Yes |
| Transient Loads | `LOAD.BURST_DISC.LIQUID` | Bursting Disc — Liquid | CRF module/workbook | pending workbook parity | Yes | Yes |
| Local Supports | `SUPPORT.TRUNNION` | Pipe Trunnion | CRF workbook/module | partial reference → qualified | Yes | Yes |
| Local Supports | `SUPPORT.WELDED_SHOE` | Welded Shoe | CRF workbook/module | migrate/qualify | Yes | Yes |
| Local Supports | `SUPPORT.CANTILEVER` | Cantilever Support | CRF workbook | `REFERENCE_ONLY` | Yes | Yes |
| Local Supports | `SUPPORT.GOAL_POST` | Goal Post Support | CRF workbook | `REFERENCE_ONLY` | Yes | Yes |
| Local Supports | `SUPPORT.L_FRAME` | L-Frame Support | CRF workbook | `REFERENCE_ONLY` | Yes | Yes |
| Local Supports | `SUPPORT.TEE_POST` | Tee Post Support | CRF workbook | `REFERENCE_ONLY` | Yes | Yes |
| Local Supports | `SUPPORT.TRAPEZE` | Trapeze Support | CRF workbook | `REFERENCE_ONLY` | Yes | Yes |
| Equipment | `EQUIP.API610.NOZZLE_LOADS` | API 610 Nozzle Loads | CRF module/master | migrate + independent benchmark | Yes | Yes |
| Equipment | `EQUIP.API617.LOAD_CHECK` | API 617 Load Check | CRF workbook | `REFERENCE_ONLY` | Yes | Yes |
| Equipment | `EQUIP.NEMA.SM23` | NEMA SM23 | CRF module/workbook | incomplete moments → qualify | Yes | Yes |
| Equipment | `EQUIP.VESSEL_SKIRT` | Vessel Skirt | CRF module/workbook | migrate/qualify | Yes | Yes |
| Flange / Joint | `FLANGE.LEAKAGE` | Flange Leakage | CRF module/workbooks | source-dependent | Yes | Yes |
| Flange / Joint | `FLANGE.LOAD_CHECK` | Flange Force/Moment Check | CRF module/master | pending allowable parity | Yes | Yes |
| Flange / Joint | `FLANGE.GRE` | GRE Flange Check | CRF workbook/module | migrate/qualify | Yes | Yes |
| Flange / Joint | `FLANGE.RIGIDITY` | Flange Rigidity | CRF workbook | `REFERENCE_ONLY` | Yes | Yes |
| Hazard | `HAZARD.BLAST` | Blast Load Screening | CRF module/workbook | pending workbook parity | Yes | Yes |
| Estimation | `ESTIMATION.WEIGHT` | Empirical Weight | Existing API | production estimator | Yes | Existing Sandbox |

The table above is a programme plan. Individual status shall be updated as work is qualified.

## 9.4 Editable master workflow

Use the same governance principle already established for B31.3 factors and empirical tuning:

```text
EDIT
 ↓
working candidate
 ↓
VALIDATE
 ↓
benchmark / impact preview
 ↓
SAVE DRAFT
 ↓
review / diff
 ↓
PUBLISH / ACTIVATE
 ↓
new master revision
```

Typing a value must not immediately change active engineering calculations.

## 9.5 Master provenance fields

Recommended common fields:

```text
recordId
revision
status
sourceAuthority
sourceReference
methodId / code edition
enteredBy
enteredAt
verifiedBy
verifiedAt
changeReason
validFrom / validTo where applicable
```

---

# 10. Engineering Calculation Console — UI plan

The UI should have **one top-level Engineering Calculations entry**, not 30 top-level tabs.

Recommended navigation:

```text
Engineering
├── Engineering Calculations
├── B31.3 Material Factors
├── Empirical Weight Tuning
└── Engineering Masters
```

Inside Engineering Calculations:

```text
┌─────────────────────────────────────────────────────────────┐
│ Engineering Calculations          Search [______________]   │
├────────────────┬────────────────────────────────────────────┤
│ Pipe Integrity │ Available calculations                     │
│ Vibration      │                                            │
│ Transient      │  FIV                SCREENING              │
│ Local Supports │  AIV                SCREENING              │
│ Equipment      │  Trunnion           REFERENCE / BLOCKED    │
│ Flanges        │  API 610            BENCHMARK QUALIFIED    │
│ Hazard         │  ...                                      │
└────────────────┴────────────────────────────────────────────┘
```

Selecting a calculator opens a common workspace:

```text
Inputs | Results | Basis | Evidence
```

Optional calculator-specific tabs may be added only when they represent real engineering stages, for example trunnion:

```text
Geometry | Loads | Member | Local Pipe | Weld | Result | Evidence
```

## 10.1 Input behavior

Each field should show its source:

```text
OD              273.0 mm    [Pipe Wall Master]
Wall             12.7 mm    [Pipe Wall Master]
Temperature       120 °C     [Line List]
Fluid density     820 kg/m³  [Manual Override]
```

Clicking the source badge should show provenance.

## 10.2 Manual override behavior

Manual overrides must be explicit:

```text
Resolved value: 273.0 mm
Override:       275.0 mm
Reason:         [________________]
```

The result evidence must show both.

## 10.3 Result display

The UI should separate:

```text
Calculated quantities
Assessment / utilization
Assumptions
Warnings
Limitations
Source / method
Qualification
```

A red/green result without the intermediate quantities and method basis is insufficient for engineering review.

## 10.4 Sandbox / scenario compare

Every suitable calculator should support scenarios without changing active master authority:

```text
Scenario A — current design
Scenario B — candidate support spacing
Scenario C — candidate pipe wall
```

The comparison engine reuses the normal API.

## 10.5 Batch mode

Batch mode should allow, for example:

```text
select 120 lines
→ resolve model/process context
→ run FIV + AIV applicability
→ return sortable risk table
→ drill into one calculation
```

Batch mode shall not use a different formula path from the single-calculation API.

---

# 11. Program flow

## 11.1 Manual single calculation

```text
User selects calculator
  ↓
Catalogue returns UI metadata
  ↓
Registry confirms executable calculator + capability state
  ↓
User enters / selects inputs
  ↓
Input resolver records source for every auto-populated field
  ↓
Unit service creates canonical input
  ↓
Contract validation
  ↓
Applicability validation
  ↓
Qualified master lookup
  ↓
Pure calculator kernel
  ↓
Independent assessment profile
  ↓
Result envelope + evidence hash
  ↓
Presenter/UI
```

## 11.2 Model-assisted calculation

```text
Selected model element / line
  ↓
context adapter
  ├─ geometry
  ├─ material
  ├─ pressure / temperature
  ├─ loads
  └─ process data
  ↓
field-level provenance
  ↓
missing/ambiguous input review
  ↓
normal calculation flow
```

Missing process data should appear as `INPUT_INCOMPLETE`; it should not silently become zero.

## 11.3 Batch calculation

```text
Model / line-list selection
  ↓
N canonical calculation requests
  ↓
immutable batch executor
  ↓
per-request result envelope
  ↓
summary aggregation only
  ↓
filter / sort / export
```

Batch summary logic shall not modify individual engineering results.

## 11.4 Master activation

```text
Draft master edit
  ↓
validation
  ↓
benchmark impact evaluation
  ↓
reviewed diff
  ↓
activate revision
  ↓
registry/master revision changes
  ↓
future calculations use new revision
  ↓
old result evidence remains reproducible by revision/hash
```

---

# 12. Centralized API coding rules

## 12.1 Calculator module contract

A calculator should normally expose named exports such as:

```js
export function validateXInput(input) {}
export function resolveXInput(input, context, options) {}
export function calculateX(input, options) {}
export function assessX(result, profile) {}
export const X_CALCULATION_DEFINITION = {...};
```

For a small calculation, these may live in one module. Do not create unnecessary framework files merely to match a directory template.

## 12.2 Pure kernel rule

The numerical kernel must be callable in Node without DOM, browser storage, or UI setup.

## 12.3 No hidden defaults

Defaults are permitted only when all are true:

- technically valid for the declared method;
- explicitly documented;
- returned in `assumptions` or provenance;
- visible in the UI;
- tested at the boundary where they apply.

Otherwise require the input.

## 12.4 No placeholder production outputs

A calculator awaiting source extraction should return:

```text
QUALIFICATION_BLOCKED
SOURCE_EXTRACTION_REQUIRED
```

It should not return zeros or nominal-looking results.

## 12.5 Reuse common physics, not common ambiguity

Shared modules are appropriate for:

```text
vector / coordinate transforms
section properties
unit conversion
fluid momentum
pipe geometry
interpolation policy
master lookup
result hashing
```

But a generic `calculateEverything()` helper that hides code-specific conditions is not appropriate.

## 12.6 No speculative abstraction

The first central-platform PR should consume the platform with real existing calculators in the same PR. A registry with no production consumers is not sufficient.

---

# 13. Migration method from MiscCalc / Excel / Access

Every migrated calculator should use the following method.

## Stage M1 — source inventory

Record:

```text
source workbook / file
revision/date
owner / authority
sheets
named ranges
macros/VBA
hidden sheets
input cells
lookup tables
output cells
acceptance cells
notes / limitations
unit system
```

Calculate a source-file hash where practical.

## Stage M2 — method specification

Create an engineering method note before production coding that identifies:

```text
canonical inputs
formula sequence
conditional branches
interpolation rules
lookup behavior
units of empirical constants
applicability limits
acceptance criteria
known limitations
```

This method note may cite workbook cell references without copying unnecessary licensed/proprietary content into public runtime code.

## Stage M3 — independent reference cases

Create benchmark fixtures that are not computed by the new JavaScript implementation.

Preferred sources:

- controlled workbook output;
- independent hand calculation;
- trusted published example where licensing permits;
- separate implementation owned by another reviewer.

Each case should include:

```text
source ID
source revision/hash
inputs
expected outputs
expected check status
required tolerance
review notes
```

## Stage M4 — pure kernel implementation

Implement the smallest complete production behavior that reproduces the qualified method.

## Stage M5 — source parity

Run the API and source workbook side-by-side over representative cases.

Do not stop at one golden case.

## Stage M6 — edge/boundary qualification

Test:

- exact threshold;
- just below/above threshold;
- minimum/maximum supported geometry;
- missing table row;
- unsupported material or route;
- invalid physical input;
- unit-converted duplicate case;
- discontinuous method branch.

## Stage M7 — UI activation

Only after the kernel works through the public API should the calculator appear as executable in the Engineering Calculation Console.

## Stage M8 — promotion

Promotion from `SCREENING` to higher authority requires a separate engineering decision. Code completeness alone does not promote the method.

---

# 14. Test and qualification plan

Testing should be layered so a large UI test suite is not used to hide weak engineering validation.

## 14.1 Layer A — contract tests

Verify:

```text
required input names
finite/positive constraints
identity normalization
failure codes
no silent missing-input defaults
```

## 14.2 Layer B — kernel mathematics

Test each physical equation or stage using independent expected values.

For composed calculators, test subcalculations independently before testing the final composition.

## 14.3 Layer C — unit invariance

For a physically identical case:

```text
SI input
Imperial input
mixed UI input converted by adapter
```

must produce the same canonical result within declared tolerance.

This is especially important for empirical workbook equations containing constants tied to source units.

## 14.4 Layer D — source parity

Compare against the migration source.

Minimum useful benchmark set should normally contain:

- ordinary case;
- low-end case;
- high-end case;
- branch/conditional case;
- threshold case.

High-risk methods such as FIV/AIV/trunnion should use a larger matrix.

## 14.5 Layer E — independent engineering reference

At least one important case should be checked independently from the source workbook where practical. This prevents implementation and test oracle from sharing the same transcription error.

## 14.6 Layer F — master-data lookup tests

Test:

```text
exact key
allowed interpolation
forbidden interpolation
missing record
ambiguous record
retired/unqualified record
status filter
revision change
```

## 14.7 Layer G — assessment-boundary tests

Test the acceptance threshold itself:

```text
utilization 0.9999
utilization 1.0000
utilization 1.0001
```

or the equivalent method boundary.

## 14.8 Layer H — integration tests

Verify:

```text
central registry → correct kernel
model resolver → correct provenance
master resolver → correct revision
central engine → correct result envelope
UI → uses API output without re-calculation
```

## 14.9 Layer I — batch tests

Verify:

- deterministic ordering;
- one failed row does not corrupt another;
- no cross-request mutable state;
- batch result equals individual calculation result;
- master revision is consistent for the batch unless explicitly changed.

## 14.10 Layer J — regression evidence

For every calculator promoted above `SCREENING`, retain:

```text
calculator version
master version(s)
benchmark fixture version
exact HEAD
validation command
result/tolerance
reviewer/authority where applicable
```

## 14.11 Special FIV/AIV test plan

FIV/AIV qualification should include cases covering the method's actual branch structure after source extraction, including:

- low / normal / high flow or acoustic excitation;
- geometry extremes within the supported method;
- exact risk thresholds;
- main line versus branch/small-bore applicability where relevant;
- equivalent SI/Imperial inputs;
- missing process property;
- unsupported phase/regime;
- source-table boundary;
- a case expected to trigger review/fail;
- independent engineering reproduction of at least one nontrivial case.

## 14.12 Special trunnion test plan

Trunnion qualification should separately prove:

```text
coordinate transformation
member section properties
axial member stress
bending member stress
shear/torsion where applicable
host-pipe local stress method
pad/reinforcement behavior
weld demand
pressure contribution
combined acceptance
```

A final workbook parity result cannot substitute for tests of these individual engineering stages.

---

# 15. Recommended implementation roadmap

## Phase 0 — Ground-truth inventory and programme freeze

**Purpose:** establish the calculation inventory, source ownership, and authority state before migration.

Outputs:

- this roadmap;
- calculator ID namespace;
- initial catalogue master;
- CRF workbook/module inventory;
- source/qualification status for each planned calculator.

Gate:

> No calculator is described as qualified merely because it exists in CRF.

## Phase 1 — Central API foundation with real existing consumers

Implement:

```text
engineering-calculation-registry
engineering-calculation-engine
central result envelope
qualification state handling
catalogue master
unit/provenance contract
```

Register real existing production APIs immediately:

```text
PIPE.B313.THICKNESS
PIPE.B313.MATERIAL_DESIGN
ESTIMATION.WEIGHT
```

Gate:

```text
calculateEngineering('PIPE.B313.THICKNESS', ...)
```

must produce the same engineering result as direct `calculateB313Thickness()`.

The central engine must not change the direct APIs.

## Phase 2 — Engineering Calculation Console

Implement a master-driven catalogue UI and common calculation workspace.

First usable calculations should be the existing registered APIs, proving the UI is a real consumer rather than scaffolding.

Gate:

```text
select calculator → enter real input → execute central API → display result/evidence
```

## Phase 3 — Shared dynamic-load primitives

Migrate and qualify common dynamic mechanics first:

- vector/moment transforms;
- momentum change;
- bend momentum load;
- relief reaction primitives;
- slug mass/momentum primitives.

Reason: FIV/AIV/support workflows can reuse the same canonical process/load context without duplicating foundational mechanics.

## Phase 4 — FIV complete vertical capability

Do **not** merge a placeholder FIV module.

One FIV PR should deliver:

```text
source/method extraction
→ canonical method contract
→ pure FIV kernel
→ independent benchmark fixtures
→ central API registration
→ Engineering Calculation Console form/result
→ evidence/qualification state
```

Initial authority may be `SCREENING` if the method basis is project-screening only.

## Phase 5 — AIV complete vertical capability

Repeat the FIV pattern with a separate method/profile and shared vibration context.

Add vibration-suite overview only after both individual calculators are real.

## Phase 6 — Small-bore / cavitation / surge / slug vibration suite

Sequence suggested:

1. surge/momentum;
2. slug/time-history;
3. cavitation/flashing;
4. small-bore vibration.

The exact order may change based on source completeness, but each PR should deliver a usable vertical capability.

## Phase 7 — Trunnion complete vertical capability

Start from the source workbook and controlled method, not from the simplified CRF output as final authority.

Deliver:

```text
load resolver
member check
local pipe/pad check
weld check if method includes it
assessment
benchmarks
central API
UI
```

Reuse B31.3/pipe-wall/model data only through explicit adapters.

## Phase 8 — Local supports family

Migrate welded shoe, shell indentation, then structural support templates using the shared support/load/material contexts.

## Phase 9 — Equipment interface family

Prioritize calculations with the strongest existing source/master structure:

- API 610;
- force/moment coordinate summary;
- API 617 when source is qualified;
- NEMA after moments and exact method are completed;
- vessel-skirt as its engineering basis is established.

## Phase 10 — Flange / joint and hazard families

Migrate only after lookup/allowable tables have explicit source authority and benchmark coverage.

## Phase 11 — Batch/model integration

Add model-assisted and batch workflows once several independent calculators share stable context contracts.

Examples:

```text
whole-line FIV/AIV screening
support-by-support local check
all pump nozzle checks
all relief devices reaction-load export
```

## Phase 12 — Controlled promotion and reporting

Add project-approved/verified promotion workflows, evidence exports, and result provenance reports.

---

# 16. Recommended PR sequence

A practical first sequence is:

### PR A — Engineering Calculation Platform v1

```text
central registry + engine + envelope + catalogue
register existing B31.3 and empirical weight APIs
no new formula method
```

### PR B — Engineering Calculation Console v1

```text
catalogue UI
common input/result/basis/evidence layout
real execution of existing APIs
```

### PR C — Dynamic Load Foundations

```text
canonical force/moment vector
coordinate transform
momentum change
bend momentum
focused benchmarks
```

### PR D — FIV

```text
source extraction + complete FIV kernel + benchmarks + UI
```

### PR E — AIV

```text
complete AIV kernel + benchmarks + UI
```

### PR F — Vibration Suite

```text
applicability overview
small-bore / cavitation / surge / slug sequencing
batch screening
```

### PR G — Trunnion

```text
member + local pipe/pad + weld stages + benchmark + UI
```

### PR H onward

```text
support family
relief/transient family
API/NEMA equipment checks
flange/joint family
hazard/special family
```

This sequence avoids building a large generic framework before a real calculation consumes it, and avoids pushing incomplete CRF placeholders into production merely to populate the catalogue.

---

# 17. Engineering invariants

The following invariants should be treated as programme-level design decisions.

1. **UI is never engineering formula authority.**
2. **Catalogue/master rows cannot execute code by themselves.**
3. **A central engine orchestrates; it does not duplicate calculator equations.**
4. **Missing engineering input is not zero.**
5. **Ambiguous identity is not an automatic default when the choice changes engineering meaning.**
6. **Every automatic input can reveal its provenance.**
7. **Manual override is explicit and retained in evidence.**
8. **Master-data status limits result authority.**
9. **Screening output cannot silently become strict/code authority.**
10. **A migrated workbook is not qualified until benchmarked.**
11. **A test oracle should not be generated from the same implementation under test.**
12. **Unit-dependent empirical constants keep their declared source-unit basis.**
13. **No interpolation occurs unless the method/master explicitly permits it.**
14. **Batch mode uses the same calculator kernel as single mode.**
15. **Scenario/Sandbox calculations cannot mutate active master/model authority.**
16. **Cross-code material/allowable data requires explicit authorization.**
17. **Coordinate transformations preserve force/moment semantics and reference point.**
18. **Old results retain enough version/master evidence to explain later differences.**
19. **Unsupported methods fail closed with a named reason.**
20. **Production authorization is a separate decision from code completion.**

---

# 18. Known programme risks

## RISK-ENG-001 — workbook transcription error

Mitigation: independent reference case and source trace map.

## RISK-ENG-002 — framework-first development

A sophisticated registry/UI could be built while no new calculator is actually usable.

Mitigation: every platform expansion must have a real production consumer in the same PR or immediately dependent vertical PR.

## RISK-ENG-003 — false authority through green UI

Mitigation: visible qualification badges and separate assessment status from calculation success.

## RISK-ENG-004 — master-data drift

Mitigation: versioned canonical masters, generated runtime registry checks, result master-revision evidence.

## RISK-ENG-005 — hidden unit coupling

Mitigation: method-specific source units and unit-invariance tests.

## RISK-ENG-006 — FIV/AIV source ambiguity

Mitigation: method extraction must precede formulas. Do not reconstruct the method from memory or unrelated internet examples.

## RISK-ENG-007 — trunnion oversimplification

Mitigation: member stress, host-pipe local stress, pad/reinforcement, weld and combined assessment remain separate stages.

## RISK-ENG-008 — cross-code leakage

Mitigation: masters and qualification profiles are code/method-specific; resolvers cannot substitute a similarly named factor from another code.

## RISK-ENG-009 — giant calculation UI

Mitigation: descriptor-driven common shell plus calculator-specific presenters only where necessary.

## RISK-ENG-010 — stale roadmap

Mitigation: material API/calculation capability changes update this document in the same PR.

---

# 19. Definition of done for a new calculator

A new engineering calculator is not complete until the following are true or explicitly dispositioned:

```text
[ ] calculation ID and group are defined
[ ] source/method authority is identified
[ ] input contract is explicit
[ ] canonical units are explicit
[ ] applicability limits are explicit
[ ] master/lookups have provenance and status
[ ] pure kernel is production-consumed
[ ] assessment logic is separate and named
[ ] result envelope exposes intermediate quantities
[ ] assumptions/warnings/limitations are explicit
[ ] independent benchmark evidence exists
[ ] unit invariance is tested
[ ] edge/boundary behavior is tested
[ ] central registry executes the calculator
[ ] real Engineering Calculation Console route exists
[ ] UI does not rederive formulas
[ ] batch behavior is either validated or explicitly unsupported
[ ] result records calculator/master versions
[ ] qualification state is truthful
[ ] no hidden defaults or placeholder outputs remain
```

---

# Appendix A — Expert-selection questions

The next engineer/agent taking ownership of the Engineering Calculation API programme should be able to answer the following ten questions before being trusted with FIV/AIV/trunnion or central-platform authority.

## Q1. How will you keep the central calculation engine from becoming a second engineering kernel?

A strong answer should define the exact responsibility boundary between registry, resolver, unit normalization, calculator kernel, assessment layer, and presenter; it should explain how direct calculator APIs remain independently testable and why calculator-specific formulas do not belong in the central engine.

## Q2. The FIV/AIV workbooks contain formulas, lookups, conditions and possibly macros. How will you prove that the JavaScript method is a faithful migration without making the workbook itself the only test oracle?

A strong answer should describe source inventory, cell/named-range trace mapping, unit-basis capture, conditional-branch extraction, workbook parity cases, at least one independent calculation/reference, tolerances, and exact source revision/hash retention.

## Q3. A method produces a numerical vibration index successfully, but the threshold table is only `SCREENING` while the kernel is benchmark-qualified. What authority should the final result report, and why?

A strong answer should explain authority composition: the result cannot outrank its least-qualified engineering dependency, calculation success is separate from assessment authority, and the envelope must expose both kernel and master qualification.

## Q4. A line-model resolver finds OD=273 mm, the pipe-wall master says 273.0 mm, and the user overrides it to 275 mm. How should the API preserve provenance and make the calculation reproducible?

A strong answer should retain resolved source, override value, override reason, calculator/master revision, and canonical input in evidence rather than replacing the original value invisibly.

## Q5. An empirical workbook equation uses a constant calibrated in inches, psi and lb/hr. Why can normalizing every input to SI and reusing the same constant be wrong, and how will you test the implementation?

A strong answer should discuss dimensional consistency, hidden units inside empirical constants, an explicit source-unit calculation stage or transformed constant, and SI/Imperial invariance tests using physically identical cases.

## Q6. How will you prevent a missing manufacturing route, material identity, process phase, or interpolation row from selecting the first available master-data record?

A strong answer should define fail-closed resolvers, exact discriminators, explicit ambiguity errors, allowed fallback policy only when method-authorized, status filtering, and negative tests for missing/unknown keys.

## Q7. The existing CRF trunnion code gives reasonable axial and bending member stresses. Why is that insufficient to call the trunnion calculator complete, and how should the new method be decomposed?

A strong answer should distinguish trunnion member stress from host-pipe local stress/load introduction, pad/reinforcement behavior, weld demand, pressure contribution, coordinate transformation, and combined assessment; it should require source extraction and separate benchmarks for these stages.

## Q8. How can FIV, AIV, slug, surge, relief reaction and support calculations share common process/load information without creating one mutation-heavy global engineering object?

A strong answer should propose immutable canonical contexts, explicit adapters/resolvers, narrow calculator input contracts, copied/derived request objects, no singleton authority, and deterministic batch execution.

## Q9. What evidence is sufficient to promote a calculator from `SCREENING` to `PROJECT_APPROVED`, and what evidence is still insufficient?

A strong answer should distinguish code completion, source parity, independent benchmark evidence, declared applicability, master-data review, exact-head validation, project engineering approval, and production authorization. A merged PR or passing unit tests alone are insufficient.

## Q10. A master revision changes next month and 5,000 historical batch results no longer reproduce with the new default data. How should the platform be designed today so those historical results remain explainable?

A strong answer should require versioned master revisions, calculator/method versions, canonical input retention or semantic hashes, result provenance, immutable historical evidence, and a way to compare/replay with the original revision rather than pretending the latest master was always used.

---

# Appendix B — Programme north star

The intended long-term user experience is:

```text
Select line / component / manual calculation
              ↓
Engineering Calculation Console identifies applicable checks
              ↓
User reviews resolved geometry / material / process / loads
              ↓
Run one or many independent calculation APIs
              ↓
See calculated quantities + utilization + basis + qualification
              ↓
Compare scenario / candidate changes
              ↓
Export reproducible engineering evidence
```

The intended long-term code experience is:

```text
new calculation
  ≠ new giant UI panel
  ≠ new independent unit system
  ≠ new hidden master loader
  ≠ new result convention

new calculation
  = one qualified kernel
  + explicit resolver/dependencies
  + registered definition
  + canonical result envelope
  + focused evidence
  + catalogue-driven UI consumer
```

That is the core direction for extending the current API-based engineering work into FIV, AIV, trunnion and the broader MiscCalc family.