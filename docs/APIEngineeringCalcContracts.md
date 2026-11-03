# Engineering Calculation API — v1 Contract Freeze

**Canonical file:** `docs/APIEngineeringCalcContracts.md`  
**Repository:** `reallaksh19/3D_Converters`  
**Programme roadmap:** `docs/APIEngineeringCalcRoadmap.md`  
**Contract version:** `engineering-calculation-contract/v1`  
**Freeze date:** 2026-08-11  
**Status:** `CONTRACT_FROZEN_FOR_IMPLEMENTATION`  

This document freezes the shared contracts that every calculator added to the Engineering Calculation Platform must follow. A calculator may have its own engineering method, inputs, outputs, standards, master data, and qualification evidence, but it must not invent a second registry, result envelope, provenance model, qualification vocabulary, UI descriptor format, or authority model.

The central platform orchestrates engineering kernels. It does not own their equations.

---

# 1. Non-negotiable invariants

1. **Kernel authority stays inside the calculator module.** The registry and UI may select and display a calculator; they must not reproduce its engineering equations.
2. **No silent engineering defaults.** Any default that changes an engineering result must be declared in the calculator definition, surfaced in provenance, and visible to the caller/UI.
3. **No silent master fallback.** If an engineering master lookup cannot resolve an applicable qualified row, the calculation fails closed unless the caller supplies an explicit override.
4. **Units are explicit at the API boundary.** A bare number has no authority unless its field contract declares the accepted/canonical unit behavior.
5. **Every resolved engineering value has provenance.** Caller, model, master, derived, default, and override origins are distinguishable.
6. **Qualification is separate from numerical execution.** A calculator may numerically execute while remaining screening-only or benchmark-only.
7. **Pass/fail requires an assessment authority.** A numerical kernel must not manufacture code compliance simply because it produced a number.
8. **Scenario/Sandbox execution uses the production kernel.** No duplicate Sandbox formula path is permitted.
9. **Batch execution uses the same registry and kernels as single execution.**
10. **Result objects are immutable snapshots.** Later master/UI changes do not mutate a retained result.

---

# 2. Canonical calculation identity

Every calculation has a stable uppercase dotted ID:

```text
<FAMILY>.<SUBFAMILY>.<CALCULATION>
```

Examples:

```text
PIPE.B313.THICKNESS
PIPE.EXTERNAL_PRESSURE.CHECK
PIPE.BRANCH.REINFORCEMENT
VIB.FIV.FLOW_TURBULENCE
VIB.AIV.ACOUSTIC
VIB.SBC.SMALL_BORE
VIB.CAVITATION.FLASHING
VIB.SURGE.MOMENTUM
VIB.SLUG.TIME_HISTORY
RELIEF.GAS.REACTION_FORCE
RELIEF.LIQUID.REACTION_FORCE
SUPPORT.TRUNNION.LOCAL_STRESS
SUPPORT.WELDED_SHOE.CHECK
EQUIP.API610.NOZZLE_LOADS
EQUIP.API617.LOAD_CHECK
EQUIP.NEMA_SM23.LOAD_CHECK
FLANGE.LEAKAGE.CHECK
FLANGE.GRE.CHECK
HAZARD.BLAST.SCREENING
ESTIMATION.WEIGHT.EMPIRICAL
```

Rules:

- IDs are API identifiers, not UI labels.
- Renaming a UI label does not change the ID.
- Changing engineering method materially requires a new `methodRevision` and may require a new calculation ID if backward interpretation would become ambiguous.
- An alias may route historical IDs, but aliases are explicit registry data and must not alter result authority.

---

# 3. Calculation family IDs

The v1 family registry is frozen as:

```text
PIPE        Pipe Design & Pressure Integrity
VIB         Vibration & Dynamic Screening
RELIEF      Relief / Discharge / Transient Loads
SUPPORT     Local Supports & Attachments
EQUIP       Equipment Interface Loads
FLANGE      Flanges & Joints
HAZARD      Hazard & Special Screening
ESTIMATION  Engineering Estimation / Empirical Models
```

A future family requires an explicit roadmap/contract revision. Do not create near-duplicate families for UI convenience.

---

# 4. Calculator definition contract

Every registered calculator must expose a definition equivalent to:

```js
{
  contractVersion: 'engineering-calculation-contract/v1',
  id: 'VIB.FIV.FLOW_TURBULENCE',
  family: 'VIB',
  name: 'Flow-Induced Vibration Screening',
  shortName: 'FIV',
  methodRevision: '1.0.0',
  implementationVersion: 'git-or-semantic-version',

  purpose: '...',
  authority: {
    calculationState: 'SCREENING',
    qualificationState: 'BENCHMARK_ONLY',
    codeCompliance: false,
  },

  applicability: {
    description: '...',
    exclusions: [],
  },

  inputs: [],
  outputs: [],
  masters: [],
  references: [],
  ui: {},

  calculate(canonicalInput, context) {},
}
```

Required fields:

```text
contractVersion
id
family
name
methodRevision
purpose
authority
applicability
inputs
outputs
calculate
```

Optional supporting functions may include:

```text
resolveInputs
validateInput
assess
buildEvidence
getSandboxOptions
```

No registered calculator may consist only of metadata with no production consumer.

---

# 5. Input-field contract

Every input field is declared in the definition:

```js
{
  key: 'designPressure',
  label: 'Design pressure',
  type: 'number',
  required: true,
  quantity: 'pressure',
  canonicalUnit: 'MPa',
  acceptedUnits: ['MPa', 'bar', 'barg', 'psi'],
  minExclusive: 0,
  sourcePolicy: ['CALLER', 'MODEL', 'MASTER'],
  allowOverride: true,
  engineeringDefault: null,
  help: '...',
}
```

Supported v1 field types:

```text
number
integer
boolean
string
enum
vector3
table
object
```

A numeric field that represents an engineering quantity must declare `quantity` and `canonicalUnit`.

An engineering default is permitted only when all are true:

- it is part of the engineering method;
- it is documented in the definition;
- the resulting provenance identifies `ENGINEERING_DEFAULT`;
- the UI exposes the default/assumption;
- the calculator remains within its stated qualification boundary.

---

# 6. Calculation request contract

Single execution:

```js
{
  contractVersion: 'engineering-calculation-contract/v1',
  calculationId: 'PIPE.B313.THICKNESS',
  inputs: {},
  inputUnits: {},
  context: {
    projectId: null,
    modelId: null,
    elementId: null,
    loadCaseId: null,
  },
  options: {
    qualificationMode: 'strict',
    retainTrace: true,
    includeEvidence: true,
  }
}
```

Public entry point:

```js
calculateEngineering(request)
```

Convenience overloads may exist, but the canonical request above is the retained contract.

---

# 7. Input resolution and provenance contract

Before a kernel runs, each engineering input resolves to:

```js
{
  key: 'wallThickness',
  value: 12.7,
  unit: 'mm',
  canonicalValue: 12.7,
  canonicalUnit: 'mm',
  source: {
    type: 'MASTER',
    authority: 'PROJECT_MASTER',
    reference: 'NPS_OD_BORE_SCHEDULE_MASTER.tsv',
    recordId: '...',
    revision: '...',
    status: 'PROJECT_APPROVED',
  },
  transformation: null,
  overridden: false,
}
```

Allowed v1 source types:

```text
CALLER
CALLER_OVERRIDE
MODEL
MASTER
DERIVED
ENGINEERING_DEFAULT
IMPORT
```

Source precedence is calculator-specific and must be declared. The platform must never globally assume that model data outranks caller input or vice versa.

Explicit override precedence is:

```text
explicit caller override
→ calculator-declared normal resolution chain
→ fail closed
```

An override never silently upgrades the qualification of a master or method.

---

# 8. Unit contract

Canonical kernels operate only on declared canonical units.

The v1 platform must provide quantity-aware conversion for at least:

```text
length
area
volume
force
moment
pressure
stress
modulus
temperature
mass
mass_flow
volumetric_flow
density
velocity
acceleration
frequency
time
energy
power
```

Rules:

- gauge/absolute pressure semantics must be explicit; they are not interchangeable units;
- Celsius/Fahrenheit conversion is affine, not a scale-only conversion;
- empirical constants tied to a unit system must declare that dependency and be converted analytically or remain locked to their qualified native units;
- a kernel must not contain arbitrary UI-unit conversion code.

---

# 9. Validation contract

Validation occurs in three layers:

```text
STRUCTURAL   required fields, type, finite numbers, enums
PHYSICAL     positive dimensions, valid ranges, geometry consistency
APPLICABILITY method/code-specific eligibility and exclusions
```

Validation result:

```js
{
  ok: false,
  errors: [
    {
      code: 'INPUT_OUTSIDE_APPLICABILITY',
      field: 'designTemperature',
      message: '...',
      severity: 'ERROR',
    }
  ],
  warnings: [],
}
```

Warnings may inform; they must not be used to disguise an applicability failure that should block calculation.

---

# 10. Qualification and authority contract

## 10.1 Method qualification states

```text
CONCEPT
SOURCE_INVENTORIED
METHOD_SPECIFIED
IMPLEMENTED
BENCHMARK_ONLY
SCREENING
PROJECT_APPROVED
VERIFIED
PRODUCTION_AUTHORIZED
BLOCKED
```

These states describe the **engineering method implementation**, not merely whether the code compiles.

## 10.2 Data qualification states

```text
DRAFT
BENCHMARK_ONLY
SCREENING
PROJECT_APPROVED
VERIFIED
RETIRED
```

## 10.3 Result authority

A result must report both method and data qualification. Its effective authority is the lower applicable authority after considering overrides and unresolved assumptions.

Example:

```js
qualification: {
  method: 'SCREENING',
  data: 'PROJECT_APPROVED',
  effective: 'SCREENING',
  designAuthority: false,
  reasons: ['METHOD_SCREENING_ONLY'],
}
```

The platform must not infer `designAuthority: true` from a numeric PASS alone.

---

# 11. Result-envelope contract

All central executions return:

```js
{
  contractVersion: 'engineering-calculation-result/v1',
  ok: true,
  calculationId: 'VIB.FIV.FLOW_TURBULENCE',
  family: 'VIB',
  methodRevision: '1.0.0',

  execution: {
    executionId: '...',
    timestamp: 'ISO-8601',
    implementationRevision: 'git-sha-or-build-id',
  },

  applicability: {
    applicable: true,
    limitations: [],
  },

  inputs: {},
  resolvedInputs: {},
  outputs: {},
  intermediates: {},

  checks: [],
  assessment: null,
  warnings: [],
  errors: [],

  qualification: {},
  provenance: {},
  evidence: {},
}
```

If `ok: false`, authoritative outputs must be absent or explicitly marked unavailable. Do not return plausible-looking zeros for failed calculations.

---

# 12. Output and check contract

An output field is defined just like an input:

```js
{
  key: 'likelihoodOfFailure',
  label: 'Likelihood of failure',
  quantity: 'dimensionless',
  canonicalUnit: null,
}
```

Assessment checks use:

```js
{
  id: 'FIV.LOF.LIMIT',
  label: 'FIV screening limit',
  actual: 0.72,
  allowable: 1.0,
  comparator: '<=',
  utilization: 0.72,
  status: 'PASS',
  authority: 'SCREENING',
  basis: '...',
}
```

Allowed check statuses:

```text
PASS
FAIL
NOT_APPLICABLE
NOT_EVALUATED
INDETERMINATE
```

A calculator that has no qualified acceptance criterion must return engineering outputs without inventing `PASS`.

---

# 13. Error contract

Platform-level errors use stable codes. Required v1 families include:

```text
CALCULATION_NOT_REGISTERED
CONTRACT_VERSION_UNSUPPORTED
INPUT_REQUIRED
INPUT_INVALID
INPUT_UNIT_UNSUPPORTED
INPUT_OUTSIDE_APPLICABILITY
MASTER_DATA_REQUIRED
MASTER_RECORD_NOT_FOUND
MASTER_RECORD_AMBIGUOUS
MASTER_RECORD_NOT_QUALIFIED
ENGINEERING_METHOD_BLOCKED
ENGINEERING_METHOD_NOT_QUALIFIED
CALCULATION_FAILED
ASSESSMENT_NOT_AVAILABLE
```

Calculator-specific codes may be added under a calculator prefix, for example:

```text
FIV_GEOMETRY_RATIO_OUTSIDE_METHOD
TRUNNION_PAD_GEOMETRY_INCOMPLETE
B313_FACTOR_DATA_INCOMPLETE
```

Errors are machine-readable objects, not only strings.

---

# 14. Engineering master-data contract

Every master consumed by a calculator must expose metadata equivalent to:

```js
{
  masterId: 'PIPE_WALL_MASTER',
  schemaVersion: '1',
  revision: '...',
  status: 'PROJECT_APPROVED',
  sourceAuthority: 'PROJECT_MASTER',
  sourceReference: '...',
  records: [],
}
```

Every engineering-sensitive record must be traceable to:

```text
record identity
master revision
status
source authority
source reference
applicability keys
value/unit
```

Master resolution must be deterministic. If two equally applicable active records exist, return `MASTER_RECORD_AMBIGUOUS`; do not select the first row.

Editable master workflow remains:

```text
EDIT WORKING COPY
→ VALIDATE
→ REVIEW DIFF
→ PUBLISH REVISION
→ ACTIVATE REVISION
```

Editing or saving a draft must never silently change active calculation authority.

---

# 15. Calculation catalogue / UI master contract

The Engineering Calculation Console is driven by a catalogue separate from formula code:

```js
{
  calculationId: 'VIB.FIV.FLOW_TURBULENCE',
  family: 'VIB',
  groupLabel: 'Vibration & Dynamic Screening',
  label: 'Flow-Induced Vibration',
  shortLabel: 'FIV',
  order: 10,
  icon: 'activity',
  visible: true,
  executionModes: ['single', 'sandbox', 'batch'],
  inputSections: ['Operating', 'Pipe', 'Fluid', 'Geometry'],
  resultSections: ['Summary', 'Checks', 'Basis', 'Evidence'],
  minimumQualificationToShow: 'IMPLEMENTED',
}
```

The catalogue controls discovery/layout only. It must not contain engineering formulas, allowables, or hidden defaults.

The calculator definition remains the authority for field semantics.

---

# 16. UI execution contract

Every calculator UI follows the common sequence:

```text
Select calculation
→ populate declared inputs
→ resolve source/provenance
→ validate
→ calculate through central API
→ render canonical result
→ show Basis / Evidence / Qualification
```

Common workspace sections:

```text
Inputs
Results
Basis
Evidence
```

Optional sections:

```text
Scenario
Batch
Source Data
Geometry
History
```

UI rules:

- no equations in DOM event handlers;
- no pass/fail recalculation in presenters;
- no hidden master lookup in UI code;
- manual override must be visually marked;
- qualification state must be visible with the result;
- unavailable calculations must explain why they are blocked.

---

# 17. Sandbox / scenario contract

Sandbox is a caller mode, not another calculator.

```js
calculateEngineering({
  calculationId,
  inputs: candidateInputs,
  options: {
    executionMode: 'sandbox',
    qualificationMode: 'screening',
  }
})
```

Sandbox rules:

- uses the same production kernel;
- may use candidate master/model data only when explicitly injected;
- must identify candidate data in provenance;
- cannot activate candidate data;
- comparison results contain independent snapshots for baseline and candidate.

---

# 18. Batch contract

```js
{
  contractVersion: 'engineering-calculation-batch/v1',
  requests: [/* canonical calculation requests */],
  options: {
    stopOnError: false,
  }
}
```

Return:

```js
{
  ok: true,
  total: 10,
  succeeded: 8,
  failed: 2,
  results: [/* canonical result envelopes */],
}
```

Batch execution must preserve per-item errors and provenance. One failed item does not silently invalidate or erase valid neighboring results.

---

# 19. Context contract

Shared model/project context is read-only during calculation:

```js
{
  project: {},
  line: {},
  element: {},
  operatingCase: {},
  loads: {},
  material: {},
  geometry: {},
  activeMasters: {},
}
```

Resolvers may derive calculation inputs from context, but the kernel receives an immutable canonical input snapshot.

A calculation must not mutate model, line-list, master, scene, or UI state as a side effect of calculating.

---

# 20. Evidence contract

When evidence is requested, retain enough information to reproduce and review the result:

```text
calculation ID
method revision
implementation revision
canonical inputs
resolved input provenance
master IDs + revisions
qualification state
outputs
checks/assessment
warnings/errors
reference/benchmark case IDs where applicable
```

A result hash may be added later, but hashing does not substitute for engineering qualification.

---

# 21. Central platform public API — v1 freeze

The initial centralized public API is frozen as:

```js
listEngineeringCalculationFamilies()
listEngineeringCalculations(options?)
getEngineeringCalculationDefinition(calculationId)
getEngineeringCalculationQualification(calculationId)

validateEngineeringCalculationInput(calculationId, input, options?)
resolveEngineeringCalculationInputs(calculationId, input, context?, options?)

calculateEngineering(request)
calculateEngineeringBatch(batchRequest)

createEngineeringCalculationRegistry(options?)
createEngineeringCalculationEngine(options?)
```

Rules:

- existing direct domain APIs remain supported;
- the central API composes existing B31.3, pipe-wall, empirical-weight, and future kernels;
- the first implementation PR must register at least one existing real calculator so the registry is production-consumed immediately;
- no framework-only registry PR is acceptable.

---

# 22. Registry contract

The registry must support:

```js
registry.register(definition)
registry.get(calculationId)
registry.has(calculationId)
registry.list(options?)
registry.listFamilies()
```

Registration fails for:

```text
duplicate ID
unsupported contract version
missing required definition field
invalid family
missing calculate function
invalid input/output definition
```

Registry construction must be deterministic. Production code should use an explicitly constructed or intentionally exported default registry, not hidden mutation from arbitrary module import order.

---

# 23. Engine contract

The engine owns orchestration only:

```text
lookup definition
→ resolve inputs
→ normalize units
→ validate
→ check applicability
→ invoke kernel
→ assess if qualified assessment exists
→ assemble result envelope
→ freeze result
```

The engine must not:

```text
contain FIV formulas
contain B31.3 equations
contain trunnion equations
select undocumented defaults
reinterpret calculator outputs
silently downgrade errors to warnings
```

---

# 24. Migration acceptance contract

A legacy workbook/CRF calculator is eligible for central registration only when all required gates for its declared state are met.

Minimum `IMPLEMENTED` gate:

```text
method documented
input/output contract defined
pure production kernel exists
real central API consumer exists
unsupported cases fail closed
```

Minimum `BENCHMARK_ONLY` gate adds:

```text
retained benchmark cases
repeatable comparison evidence
unit-path tests
edge/failure tests
```

Minimum `PROJECT_APPROVED` / `VERIFIED` gate additionally requires controlled engineering review appropriate to the method and project.

A spreadsheet filename, CRF module, or UI panel alone grants no qualification state.

---

# 25. Family qualification issue contract

Each calculation-family qualification issue must answer exactly five top-level questions before implementation is delegated:

1. **Method boundary:** What engineering methods, standards, correlations, or source workbooks are authoritative, and what is explicitly excluded?
2. **Canonical contract:** What are the minimum inputs, outputs, units, applicability keys, and failure states required for the family?
3. **Data authority:** Which master tables/constants/material data are required, how are they versioned, and what qualification level is available?
4. **Independent validation:** What reference cases or independent calculations prove the migrated kernels beyond self-derived tests?
5. **Production activation:** What real UI/API/batch path will consume the family, and what evidence is required before promotion from concept/benchmark/screening to higher authority?

Family issues may add subquestions, but these five questions remain the qualification gate.

---

# 26. Contract change control

This v1 contract is frozen for the initial Engineering Calculation Platform implementation.

A future change that breaks request/result interpretation requires:

```text
new contract version
migration notes
compatibility decision
updated roadmap
updated affected qualification issues
```

A calculation-specific engineering method change normally changes `methodRevision`, not the platform contract version.

---

# 27. First implementation sequence authorized by this freeze

The central-platform implementation should proceed in this order:

```text
1. Implement registry + engine against this v1 contract.
2. Register existing B31.3 material-design/thickness path as the first real consumer.
3. Register empirical-weight estimation as the second real consumer.
4. Add Engineering Calculation Console driven by the catalogue contract.
5. Add family kernels one vertical capability at a time.
6. Promote qualification only with family-specific evidence.
```

This prevents the central framework from becoming speculative infrastructure.

---

# Final contract rule

> **Every Engineering Calculation Platform feature must be explainable as: declared inputs + provenance → canonical units → qualified kernel → explicit assessment → immutable result envelope → visible authority/evidence.**

If any of those steps is hidden, duplicated in the UI, or inferred from an undocumented fallback, the calculator does not comply with `engineering-calculation-contract/v1`.
