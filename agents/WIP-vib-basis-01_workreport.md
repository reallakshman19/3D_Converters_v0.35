# WIP — VIB-BASIS-01

## Mission

Implement #581: bind production FIT facility request readiness to explicit geometry/support/process/scenario engineering-basis custody without changing FIT numerical methods or authority.

## Live base / authority

```text
repository = reallaksh19/3D_Converters
base/main  = 2e4ffa0fa19e22aaa949434dc42244c7546636e0
branch     = agent/vib-basis-581-fit-facility-custody
issue      = #581
PR         = #582
merge      = OWNER_ONLY / NOT_GRANTED
```

Qualification gates:

```text
initial Appendix A        = comment 5313176365
initial status            = 98/100 / QUALIFIED_FOR_VIB_ENGINEERING_BASIS_M5
source-reconcile addendum = comment 5313791137
addendum status           = 98/100 / QUALIFIED_FOR_VIB_ENGINEERING_BASIS_M5_SOURCE_RECONCILIATION
```

## Frozen invariants

- NPS/DN is not OD; schedule is not wall thickness.
- `wallBasis = NOMINAL | MIN_SPEC | AS_BUILT | MEASURED_CURRENT`.
- facility span authority is `maximumSpanBetweenEffectiveSupports`, not legacy `MAX_UNSUPPORTED_SPAN` alone.
- support/span determination is explicit and provenance-bearing; no topology/render inference.
- process reference-condition basis is explicit `ACTUAL | STANDARD | NORMAL`; this slice performs no standard/normal conversion.
- `ACTUAL` does not mean measured, source-direct, or assumption-free; conservative/simulation provenance remains separate evidence.
- coherent scenario evidence is exact canonicalId/case bound and explicit.
- FIT equations/correlations/applicability/benchmark oracles remain byte-untouched.
- no Product Freeze, screening/design/code authority, workflow, #546 technical, or T2.9 numerical/source changes.

## Source-reconciliation finding

The original boolean `supportEffectivenessConfirmed` was too narrow for the controlled examples.

Controlled repository evidence shows two distinct accepted support/span evidence forms:

```text
EFFECTIVE_SUPPORTS_CONFIRMED
METHOD_ACCEPTED_PROJECT_STANDARD
```

with span methods:

```text
LINE_WALK_EFFECTIVE_SUPPORTS
ISOMETRIC_EFFECTIVE_SUPPORTS
PROJECT_PIPING_STANDARD
```

D2 states that example maximum spans were taken from the project piping standard. D4 instead identifies physically effective/ineffective supports by line walking; the produced-water intermediate spring hanger is explicitly ineffective and the effective span remains 18 m.

Process evidence likewise requires two dimensions:

```text
referenceConditionBasis = ACTUAL | STANDARD | NORMAL
source/provenance disposition = separate
```

D2 normal streams use actual density/velocity. Recycle and relief cases separately preserve conservative assumptions, valve-datasheet capacity and process-simulation provenance.

## Controlled source refs

```text
FIT-EI-Worked-Example-Traceability-v1.md
blob = a2e43e8d16f89ea41b6f1901a3fec2d8fd387a49

FIT-Source-Basis-Evidence-v1.md
blob = 4f7590b9f08a81db0aa6081b9606469c72aec2a5

Advanced_Analysis Appendix-D transcription
repo   = reallaksh19/Advanced_Analysis
commit = 04328852dced9f5c4827da8afe8a82aeb8b1a1d3
path   = docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md
blob   = c050cd90802c27241c510c6f0ac43bfaf7a89e9d
authority = CORROBORATING_TRANSCRIPTION_ONLY
```

Higher-ranked binary sources remain pinned but not directly reconciled in this connector runtime:

```text
published worked examples PDF
commit = fb549185b9b27edc2379734240320a85c5bef9f6
blob   = 3e2517d0df527a051084fc02e69cb7afa31f8d47
state  = NOT_RUN_BINARY_SOURCE

owner qualification DOCX
commit = 7bfead910f6bca91b10748ead009e40f20c82219
blob   = ceee15ed5f7f320045d5f3979024e2e8664613f2
state  = NOT_RUN_BINARY_SOURCE
```

Corroborating text may refine the custody schema and record unresolved evidence, but cannot silently promote a benchmark case to READY where higher-source authority remains unresolved.

## Production implementation

### `fit-engineering-basis.js`

Current source semantics:

```text
FitFacilityEngineeringBasis.v1
wallBasis
maximumSpanBetweenEffectiveSupports
spanDeterminationMethod
supportEvidenceStatus
densityReferenceBasis
velocityReferenceBasis
gasDensityReferenceBasis
liquidDensityReferenceBasis
exact-case operatingScenarioCoherent
```

Support status/method compatibility is machine-enforced:

```text
METHOD_ACCEPTED_PROJECT_STANDARD -> PROJECT_PIPING_STANDARD
EFFECTIVE_SUPPORTS_CONFIRMED     -> LINE_WALK_EFFECTIVE_SUPPORTS | ISOMETRIC_EFFECTIVE_SUPPORTS
```

Mismatch fails with `SUPPORT_EVIDENCE_METHOD_MISMATCH`.

`STANDARD` / `NORMAL` process reference basis remains explicit but blocks with `PROCESS_BASIS_CONVERSION_REQUIRED:*`.

Authority remains:

```text
authority            = ENGINEERING_BASIS_CUSTODY_ONLY
engineeringAuthority = NONE
screeningAuthority   = NOT_AUTHORIZED
designAuthority      = false
```

### Facility planner compatibility

The numerical FIT adapter remains unchanged. Only after M5 basis is READY:

```text
maximumSpanBetweenEffectiveSupports
  -> request.inputs.maximumUnsupportedSpan
```

Legacy `MAX_UNSUPPORTED_SPAN` remains trace compatibility only.

### Data Blocker correction path

The fill-only/collision model now exposes:

```text
MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS
WALL_BASIS
SPAN_DETERMINATION_METHOD
SUPPORT_EVIDENCE_STATUS
DENSITY_BASIS
VELOCITY_BASIS
GAS_DENSITY_BASIS
LIQUID_DENSITY_BASIS
OPERATING_SCENARIO_COHERENT
```

The ambiguous legacy support-confirmation boolean is not an accepted blocker field. Invalid wall/process/support vocabulary fails before planning.

## Benchmark source-reconciliation registry

New non-executable module:

`converters/vibration/fit/benchmark-basis-reconciliation.js`

It records all ten controlled FIT cases without numerical expected values or tolerances.

D2 entries preserve:

```text
support.evidenceStatus      = METHOD_ACCEPTED_PROJECT_STANDARD
support.spanDeterminationMethod = PROJECT_PIPING_STANDARD
process.referenceConditionBasis  = ACTUAL
```

and distinguish normal/full-flow, conservative recycle, valve-datasheet relief and process-simulation relief provenance.

D4 entries preserve:

```text
support.evidenceStatus      = EFFECTIVE_SUPPORTS_CONFIRMED
support.spanDeterminationMethod = LINE_WALK_EFFECTIVE_SUPPORTS
scenario.identity           = REVISED_INCREASED_WATER_CUT
```

All ten remain:

```text
reconciliationState = UNRESOLVED_SOURCE_AUTHORITY
sourceAuthority      = CORROBORATED_PENDING_HIGHER_SOURCE
```

Wall basis remains unresolved rather than inferred.

Registry authority:

```text
authority                 = SOURCE_RECONCILIATION_ONLY
engineeringAuthority      = NONE
screeningAuthority        = NOT_AUTHORIZED
designAuthority           = false
productionExecutionAllowed = false
```

Validator enforces the exact ten-case universe, no duplicate IDs, valid support status/method pairs, valid states, and recursively rejects oracle-shaped keys such as `expected`, `tolerance`, `standardLof`, `standardFv`, and `outputs`.

The registry is imported by the focused test only; it is not in the production execution path.

## Controlled benchmark blocker

The controlled UI benchmark loader and numerical benchmark oracles remain byte-identical to `main`:

```text
FIT adapter
  eef88d59846a5c779d5f56b71b9502955ddf1b41

B1 controlled benchmark
  92c589d4f347f59abd29c059b13462802f436deb

B2 independent benchmark
  94dd711e6af5458d8569389e461fc2514872f613

controlled UI benchmark loader
  058dc431af78d2a365160dbc3a45c57f29adb7a9
```

The controlled facility benchmark remains intentionally:

```text
NOT_READY
NOT_ASSESSED_DATA_INCOMPLETE
```

because higher-ranked source reconciliation is still incomplete.

```text
BLOCKED_SOURCE_BASIS:FIT_CONTROLLED_BENCHMARK_FACILITY_M5_METADATA
```

This is source-basis custody, not a numerical benchmark failure.

## Test-first / backup custody

Source-reconciliation protective test was committed before production repair:

```text
542d347dc10a5298f5c3a6a9581d15b611ad61b4
```

It required the new source-faithful vocabulary while the production symbols/module did not yet exist.

Exact pre-reconciliation blobs were retained under:

```text
.backups/connector-20260817-vib-basis-581-source-reconcile/
```

Checkpoint commits:

```text
c584eb489b44bd3e68df836b89728b0ed3385504
29ab287b0dba949bf979f42f6b8de520da6273e2   # includes input-view backup only
```

Original M5 backups remain under `.backups/connector-20260817-vib-basis-581/`.

Connector-only runtime cannot execute `utils/backup.js`; backups use exact Git blob/tree reuse.

## Fixture migration

Synthetic READY fixtures were migrated to explicit source-faithful support status/method vocabulary while preserving prior numerical expectations:

```text
vibration-facility-fit-plan.test.mjs
vibration-facility-fit-preflight.test.mjs
vibration-facility-fit-workflow.test.mjs
vibration-facility-fit-tabular-workflow.test.mjs
vibration-fit-data-blockers.test.mjs
```

Previously migrated Engineering Basis / mechanism trace fixtures continue to use the effective-support span source cell.

The large input-view hint map was left byte-unchanged after backup; the Data Blocker supported-field list is definition-driven and therefore exposes `SUPPORT_EVIDENCE_STATUS`, while unknown readiness names fall back to their field text. No correctness or authority bypass results.

## Validation truth

```text
PASS     source-reconciliation Appendix A addendum 98/100 before repair
PASS     protective source-reconciliation test committed before production repair
PASS     fit-engineering-basis.js <300 physical lines
PASS     benchmark-basis-reconciliation.js <300 physical lines
PASS     focused M5 test <300 physical lines
PASS     protected FIT adapter/oracle/benchmark-loader blobs unchanged
PASS     no .github/workflows changes
PASS     no SBC/#546 technical-path changes
PASS     no T2.9 numerical/source changes
PASS     benchmark source gap remains fail-closed and machine-readable
NOT_RUN  native exact-checkout focused Node test — connector-only private checkout unavailable
NOT_RUN  full repository-native VIB/FIT/AIV suites
NOT_RUN  browser
```

## Current blocker / next action

```text
BLOCKED_SOURCE_BASIS:FIT_CONTROLLED_BENCHMARK_FACILITY_M5_METADATA
```

Directly reconcile the pinned published PDF / owner qualification DOCX at sufficient source authority, or record an independently governed benchmark-only orchestration contract. Do not weaken the project screening gate and do not infer unresolved wall/support/process/scenario authority.

PR #582 remains draft and must not be merged without separate Owner authorization.