# PR #582 workreport — VIB-BASIS-01

## Mission

Bounded M5 slice for #581: require explicit FIT facility geometry/support/process/scenario basis custody before an executable facility request can be created.

## Repository / authority state

```text
base main = 2e4ffa0fa19e22aaa949434dc42244c7546636e0
branch    = agent/vib-basis-581-fit-facility-custody
PR        = #582
issue     = #581
DRAFT     = true
MERGE_AUTHORITY = OWNER_ONLY / NOT_GRANTED
```

Qualification:

```text
5313176365  98/100  QUALIFIED_FOR_VIB_ENGINEERING_BASIS_M5
5313791137  98/100  QUALIFIED_FOR_VIB_ENGINEERING_BASIS_M5_SOURCE_RECONCILIATION
```

## Source-faithful M5 contract

`FitFacilityEngineeringBasis.v1` now requires explicit:

```text
wallBasis
maximumSpanBetweenEffectiveSupports
spanDeterminationMethod
supportEvidenceStatus
process reference-condition basis
exact-case operatingScenarioCoherent
```

Closed vocabularies:

```text
wallBasis:
  NOMINAL | MIN_SPEC | AS_BUILT | MEASURED_CURRENT

process reference condition:
  ACTUAL | STANDARD | NORMAL

supportEvidenceStatus:
  EFFECTIVE_SUPPORTS_CONFIRMED
  METHOD_ACCEPTED_PROJECT_STANDARD

spanDeterminationMethod:
  LINE_WALK_EFFECTIVE_SUPPORTS
  ISOMETRIC_EFFECTIVE_SUPPORTS
  PROJECT_PIPING_STANDARD
```

Support status/method pairings are machine-enforced. A D2-style project-standard span does not pretend that physical supports were field-confirmed; a D4-style line-walk span does not masquerade as a project-standard value.

`ACTUAL` is explicitly a reference-condition basis only. Conservative assumptions, valve-datasheet capacity, process-simulation evidence and other provenance remain separate source custody rather than being erased by the ACTUAL label.

`STANDARD` and `NORMAL` are retained as explicit source states but no conversion is introduced; they remain fail-closed with `PROCESS_BASIS_CONVERSION_REQUIRED:*`.

## Controlled source reconciliation

Current authority records:

```text
FIT-EI-Worked-Example-Traceability-v1.md
blob = a2e43e8d16f89ea41b6f1901a3fec2d8fd387a49

FIT-Source-Basis-Evidence-v1.md
blob = 4f7590b9f08a81db0aa6081b9606469c72aec2a5
```

Corroborating source:

```text
repo   = reallaksh19/Advanced_Analysis
commit = 04328852dced9f5c4827da8afe8a82aeb8b1a1d3
path   = docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md
blob   = c050cd90802c27241c510c6f0ac43bfaf7a89e9d
authority = CORROBORATING_TRANSCRIPTION_ONLY
```

Source findings represented in code/tests:

- D2 maximum spans were taken from the project piping standard.
- D4 separator-inlet supports are physically effective; produced-water intermediate spring support is ineffective and effective span is 18 m between effective supports.
- D2 normal streams use actual density/velocity.
- recycle/relief cases preserve conservative-assumption, valve-datasheet and process-simulation provenance separately.
- D4 uses the revised increased-water-cut scenario.

Higher-ranked binary source readback remains incomplete in this connector runtime:

```text
published EI worked-example PDF
blob   = 3e2517d0df527a051084fc02e69cb7afa31f8d47
state  = NOT_RUN_BINARY_SOURCE

Owner qualification DOCX
blob   = ceee15ed5f7f320045d5f3979024e2e8664613f2
state  = NOT_RUN_BINARY_SOURCE
```

Therefore corroborating evidence is recorded but cannot independently promote a benchmark case to source-authoritative READY.

## Benchmark source-reconciliation registry

New non-executable file:

`converters/vibration/fit/benchmark-basis-reconciliation.js`

It covers exactly all ten controlled FIT benchmark IDs and contains no numerical expected values/tolerances.

D2 support custody:

```text
evidenceStatus          = METHOD_ACCEPTED_PROJECT_STANDARD
spanDeterminationMethod = PROJECT_PIPING_STANDARD
referenceConditionBasis = ACTUAL
```

with distinct provenance dispositions for normal full-flow, conservative recycle, valve-datasheet relief and process-simulation relief cases.

D4 support custody:

```text
evidenceStatus          = EFFECTIVE_SUPPORTS_CONFIRMED
spanDeterminationMethod = LINE_WALK_EFFECTIVE_SUPPORTS
scenario                = REVISED_INCREASED_WATER_CUT
```

All ten entries remain:

```text
reconciliationState = UNRESOLVED_SOURCE_AUTHORITY
sourceAuthority      = CORROBORATED_PENDING_HIGHER_SOURCE
```

Wall basis remains `null` rather than inferred.

Registry authority is strictly non-authorizing:

```text
authority                  = SOURCE_RECONCILIATION_ONLY
engineeringAuthority       = NONE
screeningAuthority         = NOT_AUTHORIZED
designAuthority            = false
productionExecutionAllowed = false
```

Machine validation enforces exact ten-case coverage, no duplicate IDs, valid state/status-method pairings, and recursively rejects oracle-shaped keys `expected`, `tolerance`, `standardLof`, `standardFv`, and `outputs`.

The registry is imported by the focused M5 test only; no production runtime execution depends on it.

## Facility request compatibility

The existing FIT numerical adapter/domain API is unchanged. Only after the project M5 basis is READY:

```text
maximumSpanBetweenEffectiveSupports
  -> request.inputs.maximumUnsupportedSpan
```

Legacy `MAX_UNSUPPORTED_SPAN` remains trace compatibility only.

## Data Blocker path

The fill-only/collision contract exposes:

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

The ambiguous old support-confirmation boolean is not accepted. Invalid wall/process/span-method/support-status vocabulary fails before planning.

## UI / trace custody

The Engineering Basis projection continues to present **Effective-support span** from `MAXIMUM_SPAN_BETWEEN_EFFECTIVE_SUPPORTS`, not legacy `MAX_UNSUPPORTED_SPAN`.

The generic FIT mechanism trace keeps the existing normalized compatibility key while resolving to the effective-support source cell.

The large Data Blocker input view was backed up but not rewritten merely for hint-map cosmetics. The supported field list is definition-driven and exposes `SUPPORT_EVIDENCE_STATUS`; unknown readiness names fall back to their literal field name. No correctness or authority bypass is introduced.

## Protected numerical custody

Exact branch blobs remain unchanged:

```text
FIT numerical adapter
  eef88d59846a5c779d5f56b71b9502955ddf1b41

B1 controlled FIT benchmark oracle
  92c589d4f347f59abd29c059b13462802f436deb

B2 independent FIT benchmark oracle
  94dd711e6af5458d8569389e461fc2514872f613

controlled UI benchmark loader
  058dc431af78d2a365160dbc3a45c57f29adb7a9
```

No benchmark expected output, tolerance, FIT equation/correlation/applicability, screening/design/code authority or Product Freeze state changed.

## Controlled benchmark state

The facility benchmark path remains intentionally:

```text
NOT_READY
NOT_ASSESSED_DATA_INCOMPLETE
```

until higher-source M5 metadata is reconciled.

```text
BLOCKED_SOURCE_BASIS:FIT_CONTROLLED_BENCHMARK_FACILITY_M5_METADATA
```

This is a source-basis custody blocker, not a numerical benchmark failure.

## Test-first and backup custody

Source-reconciliation falsifier was committed before the production repair:

```text
542d347dc10a5298f5c3a6a9581d15b611ad61b4
```

Exact pre-reconciliation backups:

```text
.backups/connector-20260817-vib-basis-581-source-reconcile/
checkpoint = c584eb489b44bd3e68df836b89728b0ed3385504
input-view backup checkpoint = 29ab287b0dba949bf979f42f6b8de520da6273e2
```

Original M5 backups remain under `.backups/connector-20260817-vib-basis-581/`.

Connector-only execution cannot run `utils/backup.js`; backups use exact Git blob/tree reuse.

## Current changed engineering/test scope

Production:

```text
NEW  converters/vibration/facility/fit-engineering-basis.js
NEW  converters/vibration/fit/benchmark-basis-reconciliation.js
EDIT converters/vibration/facility/fit-plan-contract.js
EDIT converters/vibration/facility/fit-plan-item.js
EDIT converters/vibration/tabular/fit-data-blockers.js
EDIT tabs/vibration-integrity-engineering-basis.js
EDIT tabs/vibration-integrity-engineering-basis-view.js
```

Tests:

```text
NEW  tests/vibration-facility-fit-engineering-basis.test.mjs
EDIT tests/vibration-facility-fit-plan.test.mjs
EDIT tests/vibration-facility-fit-preflight.test.mjs
EDIT tests/vibration-facility-fit-workflow.test.mjs
EDIT tests/vibration-facility-fit-tabular-workflow.test.mjs
EDIT tests/vibration-fit-data-blockers.test.mjs
EDIT tests/vibration-integrity-engineering-basis.test.mjs
EDIT tests/vibration-integrity-mechanism-context.test.mjs
```

No `.github/workflows/*`, SBC/#546 technical files, T2.9 numerical/source files, FIT numerical adapter/domain kernel, or benchmark oracle files are changed.

## Validation truth

```text
PASS     Appendix A source-reconciliation addendum 98/100 before semantic repair
PASS     protective source-reconciliation regression committed before production repair
PASS     fit-engineering-basis.js <300 physical lines
PASS     benchmark-basis-reconciliation.js <300 physical lines
PASS     focused M5 test <300 physical lines
PASS     protected FIT adapter/oracle/benchmark-loader blobs unchanged
PASS     no workflow/#546/T2.9 numerical-source changes
PASS     unresolved benchmark source authority remains fail-closed
NOT_RUN  native exact-checkout focused Node test
NOT_RUN  full repository-native VIB/FIT/AIV suites
NOT_RUN  browser
```

Native execution is unavailable in this connector-only runtime. Static/source evidence is not promoted to native PASS.

## Merge state / exact next action

```text
DRAFT = true
MERGE_READY = false
MERGE_AUTHORITY = OWNER_ONLY / NOT_GRANTED
```

Directly reconcile the pinned published worked-example PDF and Owner qualification DOCX at sufficient source authority, or establish a separately governed benchmark-only orchestration contract. Do not weaken the project screening basis gate and do not infer unresolved wall/support/process/scenario authority.

Do not merge #582 without separate Owner authorization.