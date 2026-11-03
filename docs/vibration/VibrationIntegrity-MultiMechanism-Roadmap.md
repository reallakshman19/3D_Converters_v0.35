# Vibration Integrity — Multi-Mechanism Roadmap

## 1. Purpose

The complete retained EI AVIFF worked-example set establishes that Flow-Induced Turbulence (FIT) is one mechanism inside a wider line-based vibration screening report. The product architecture therefore uses shared line/case engineering basis plus independent mechanism assessments rather than treating FIT as the application-level data model.

This roadmap records architecture, evidence coverage, qualification boundaries and implementation sequence. It is not an engineering-authority promotion document.

## 2. Controlled source basis

Full worked-example context:

```text
reallaksh19/Common
commit fb549185b9b27edc2379734240320a85c5bef9f6
Energy-Institute-AVIFF---Worked-Examples.doc.docx
blob ceee15ed5f7f320045d5f3979024e2e8664613f2
```

Retained Markdown transcription:

```text
docs/Energy-Institute-AVIFF---Worked-Examples.md
```

Controlled FIT benchmark set:

```text
Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json
FIT-EI-WORKED-EXAMPLES-V1
```

Retained workbook reference:

```text
reallaksh19/CRF-4-1
commit 68dc8e1fa2ef67073c59b3afc56f1bf40953d535
Extended calc2/AIV FIV/FIT.xlsm
blob d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e
```

Source terminology such as “Screening Report” does not authorize this application as a screening/design authority.

## 3. Authority freeze

```text
FIT calculationState      = IMPLEMENTED
FIT qualificationState    = BENCHMARK_ONLY
engineeringAuthority      = NONE
screeningAuthority        = NOT_AUTHORIZED
designAuthority           = false

all non-FIT mechanisms    = NOT_IMPLEMENTED
```

No roadmap stage changes this without an explicit engineering-governance decision.

## 4. Product architecture

```text
Facility assessment
  -> line / operating case
     -> shared engineering basis
     -> mechanism assessments
        -> FIT
        -> Mechanical excitation
        -> Reciprocating / PD pulsation
        -> Rotating stall
        -> Deadleg pulsation
        -> Corrugated-pipe pulsation
        -> Slug flow
        -> AIV
        -> Valve transients
        -> Cavitation / flashing
        -> Thermowells
        -> Small-bore connections
     -> implemented governing result
     -> evidence / traceability
```

Mechanisms may contain zero, one or many child assessment items. A future generic mechanism model must support that cardinality.

## 5. Retained worked-example evidence matrix

| Mechanism | Retained populated example evidence | Current numerical state |
|---|---|---|
| FIT | Yes | IMPLEMENTED / BENCHMARK_ONLY |
| Mechanical excitation | Yes | NOT_IMPLEMENTED |
| Reciprocating / PD pulsation | No populated retained rows | NOT_IMPLEMENTED |
| Rotating stall | No populated retained rows | NOT_IMPLEMENTED |
| Deadleg pulsation | Yes | NOT_IMPLEMENTED |
| Corrugated-pipe pulsation | No populated retained rows | NOT_IMPLEMENTED |
| Slug flow | No populated retained rows | NOT_IMPLEMENTED |
| AIV | Yes | NOT_IMPLEMENTED |
| Valve transients | Yes | NOT_IMPLEMENTED |
| Cavitation / flashing | No populated retained rows | NOT_IMPLEMENTED |
| Thermowells | Yes | NOT_IMPLEMENTED |
| Small-bore connections | Yes | NOT_IMPLEMENTED |

An empty retained section is not qualification evidence.

## 6. Shared engineering basis

The authoritative editable data remains the canonical topology / operating / enrichment working state.

The primary Engineering-basis projection is joined from that state using production-equivalent FIT planning semantics. It must not become a second editable store.

Shared basis includes identity, pipe/process quantities and reusable derived context only where there is an adopted central calculation/source contract. FIT-specific calculations remain inside FIT.

## 7. UI target

```text
Source / working state
  -> Engineering basis
  -> FIT readiness / run
  -> facility mechanism matrix
  -> selected line/mechanism detail
  -> Source Data / evidence
```

Facility result matrix:

```text
Line | Case | Shared status |
FIT | Mechanical | Recip/PD | Rotating stall | Deadlegs | Corrugations |
Slug | AIV | Transients | Cav/Flash | Thermowells | SBC |
Implemented governing | Qualification | Review
```

Only FIT may currently display a calculated value.

Selected-row detail:

```text
Summary | Inputs | Calculation | Case | Evidence | Source | Diagnostics
```

`Calculation` is currently the explicit FIT mechanism calculation trace.

## 8. State dimensions

### Input authority

- `COMPLETE_XLSX_UNTOUCHED`
- `LIMITED_ELEMENTS_ONLY`
- `UNVERIFIED_ELEMENTS_CSV`
- `LOCAL_EDITED_ELEMENTS`

### Mechanism implementation

- `NOT_IMPLEMENTED`
- `IMPLEMENTED_BENCHMARK_ONLY`
- future qualification/authorized states only after explicit governance

### Applicability/readiness

- `NOT_EVALUATED`
- `APPLICABILITY_UNKNOWN`
- `NOT_APPLICABLE`
- `APPLICABLE_INCOMPLETE`
- `READY`
- `CALCULATED`
- `FAILED`
- `REVIEW_REQUIRED`

`NOT_IMPLEMENTED` is not an applicability result.

### Result currency

- `UNRUN`
- `READY`
- `RUNNING`
- `CURRENT_RESULT`
- `STALE_RESULT`
- `INVALID_INPUT`

Presentation-only navigation/filter/sort changes do not stale engineering results.

## 9. Traceability target

```text
facility run
  -> line assessment
  -> mechanism assessment item
  -> mechanism result
  -> equation / correlation / rule ID
  -> normalized engineering input
  -> working input cell
  -> original input cell
  -> source record
  -> controlled source identity
```

FIT Stage 4 now exposes stable correlation IDs, equation IDs, normalized central inputs and calculation intermediates. Stage 3 supplies deterministic working-cell/source anchors.

## 10. Roadmap stages

### Auto-mode execution policy

Owner directive (2026-08-12): **upcoming implementation stages run in AUTO MODE**.

AUTO MODE means:

- once the current stage reaches its defined implementation/validation handoff, proceed to the next roadmap stage without asking for another “ok”;
- automatically perform source reconciliation, bounded implementation, focused validation, CodingRules reporting and draft-PR publication when the stage prerequisites are actually available;
- if a prerequisite is missing, source authority is ambiguous, or another active PR owns overlapping files, mark the stage `BLOCKED`/`DEFERRED`, preserve the evidence, and continue only where the roadmap permits without overwriting that workstream;
- every new numerical mechanism begins no higher than `BENCHMARK_ONLY` and must satisfy its own controlled method/source/evidence gates.

AUTO MODE does **not** authorize:

- merging a PR;
- changing engineering, screening or design authority;
- bypassing a failed validation/evidence gate;
- inventing a method, coefficient, benchmark target or applicability rule;
- overwriting unrelated active PR work.

Stage 12 remains a manual engineering-governance event and is excluded from automatic authority transition.

### Stage 0 — Authority freeze

Status: **ACTIVE / PERMANENT UNTIL EXPLICIT GOVERNANCE CHANGE**

### Stage 1 — Shared line / mechanism presentation contract

Status: **IMPLEMENTED / FULL BROWSER GATE PENDING**

Delivered:

- source-aligned 12-mechanism catalogue;
- line-centric facility mechanism matrix;
- FIT-only numerical projection;
- non-FIT fail-closed behavior;
- `Implemented governing` limited to executed mechanisms.

Permanent regression:

```text
tests/vibration-integrity-mechanism-matrix.test.mjs
```

### Stage 2 — Canonical original / working engineering state

Status: **IMPLEMENTED / FULL BROWSER GATE PENDING**

Delivered:

- stable source/local row IDs;
- original/working values;
- exact cell/table revert;
- central unit-aware edits;
- source-authority latch;
- run snapshot/hash;
- stale/current result contract.

Permanent regressions:

```text
tests/vibration-integrity-working-state.test.mjs
tests/vibration-integrity-run-snapshot.test.mjs
```

### Stage 3 — Shared engineering-basis projection

Status: **IMPLEMENTED / FULL BROWSER GATE PENDING**

Delivered:

- primary joined line/case editor;
- production-equivalent topology/assessment/case joins;
- exact backing-cell pointers;
- deterministic source navigation;
- raw Source Data retained as the single backing state;
- source-controlled identity until atomic identity edits are designed.

Permanent regression:

```text
tests/vibration-integrity-engineering-basis.test.mjs
```

### Stage 4 — FIT mechanism extraction

Status: **IMPLEMENTED / FULL RELEASE+BROWSER GATE PENDING**

Delivered:

- explicit `VibrationWorkspaceFitDetail.v1` mechanism detail;
- Calculation tab sourced only from central Engineering Calculation result data;
- stable standard/advanced FIT correlation IDs;
- normalized central input trace;
- backend hydraulics, excitation/`rhoV2`, demand and support classification;
- advanced eligibility/reason/range exposure;
- standard/refined/governing FIT result trace;
- equation IDs, correlation IDs and workbook provenance;
- no UI-side FIT calculation;
- no FIT numerical-method change.

Stable correlation IDs:

```text
FIT.STD.STIFF.v1
FIT.STD.MEDIUM_STIFF.v1
FIT.STD.MEDIUM_SMALL.v1
FIT.STD.MEDIUM_LARGE.v1
FIT.STD.FLEXIBLE_SMALL.v1
FIT.STD.FLEXIBLE_LARGE.v1
FIT.ADV.FLEXIBLE_SMALL.v1
FIT.ADV.FLEXIBLE_LARGE.v1
```

Permanent regressions:

```text
tests/vibration-fit-correlation-trace.test.mjs
tests/vibration-integrity-fit-mechanism.test.mjs
tests/vibration-integrity-detail-view.test.mjs
```

Detailed contract:

```text
docs/vibration/VibrationIntegrity-FIT-Mechanism-v1.md
```

### Stage 5 — Generic mechanism qualification framework

Status: **IMPLEMENTED / FULL RELEASE+BROWSER GATE PENDING**

Delivered:

- `VibrationMechanismAssessmentItem.v1` with deterministic mechanism/line/case/canonical/child identity;
- `VibrationMechanismAssessmentSet.v1` with explicit `ZERO` / `ONE` / `MANY` child cardinality;
- independent implementation, assessment/readiness, result-currency and benchmark state dimensions;
- normalized request/execution/result, qualification and evidence slots;
- equation/rule/correlation trace dimensions;
- `UNAVAILABLE` / `SOURCE_AND_NORMALIZED_ONLY` / `COMPLETE_WORKING_TRACE` input-trace states;
- FIT as the immediate production consumer through a non-numerical adapter;
- exact Stage-3 working-cell/source anchors where real backing pointers exist;
- mechanism-specific FIT benchmark comparison with modified/stale/current semantics;
- stale FIT retained for evidence but excluded from current `Implemented governing`;
- non-FIT mechanisms represented as `NOT_IMPLEMENTED` with zero child items, never synthetic `NOT_APPLICABLE`;
- no second numerical mechanism and no authority change.

Permanent regressions:

```text
tests/vibration-mechanism-contract.test.mjs
tests/vibration-fit-mechanism-contract.test.mjs
tests/vibration-integrity-mechanism-context.test.mjs
tests/vibration-integrity-mechanism-matrix.test.mjs
tests/vibration-integrity-detail-view.test.mjs
```

Detailed contract:

```text
docs/vibration/VibrationMechanismQualificationFramework-v1.md
```

### Stage 6 — Mechanical excitation

Status: **AUTO MODE · QUEUED AFTER STAGE-5 RELEASE/BROWSER EVIDENCE**

Use retained records 3, 4, 5 and 7 only after adopted rules/equations, equipment-item cardinality, governing semantics, independent examples and unit invariance are controlled. Authority starts benchmark-only.

### Stage 7 — Deadleg pulsation

Status: **AUTO MODE · QUEUED AFTER STAGE 6**

Use retained records 4, 7 and 8. Control branch geometry, standard/advanced paths, unavailable advanced results, branch-mainline trace, independent checks and boundaries.

### Stage 8 — AIV

Status: **AUTO MODE · COORDINATE WITH ACTIVE AIV WORKSTREAM; DO NOT OVERWRITE #446**

Use retained records 5, 6 and 8. Control valve/noise source contract, PWL, low-noise trim, pressure/flow resolution and independent qualification separately from FIT.

### Stage 9 — Valve transients

Status: **AUTO MODE · QUEUED AFTER PREDECESSOR GATES**

Use retained records 7, 8 and 12. Control mechanism taxonomy, valve/pump context, closure/opening forces, pressure rise, opening/closing LOF and source ambiguity.

### Stage 10 — Thermowell / SBC

Status: **AUTO MODE · QUEUED AFTER PREDECESSOR GATES**

Treat both as child-item mechanisms. Thermowell requires ASME PTC 19.3 TW qualification. SBC requires mainline dependency plus fitting/location/geometry evidence.

### Stage 11 — Mechanisms with no retained populated examples

Status: **AUTO MODE · EVIDENCE-GATED; EXPECT BLOCK/DEFER WHEN METHOD SOURCES ARE ABSENT**

Do not implement from empty headings:

- reciprocating / PD pulsation;
- rotating stall;
- corrugated-pipe pulsation;
- slug flow;
- cavitation / flashing.

Each needs an adopted method source plus independent qualification evidence.

### Stage 12 — Screening-authority review

Status: **MANUAL GOVERNANCE ONLY · EXCLUDED FROM AUTO AUTHORITY TRANSITION**

Separate engineering-governance event requiring adopted screening scope, mechanism-specific independent validation, boundary/domain coverage, unit invariance, source/run trace, exact-head release/browser validation, independent vibration-engineer approval and explicit Owner authority transition.

No design authority is implied by screening promotion.

## 11. Coding / authority rules

1. One numerical path only.
2. UI never becomes solver authority.
3. One authoritative editable state; projections do not duplicate it.
4. No silent engineering defaults.
5. No blank-to-zero conversion.
6. `NOT_IMPLEMENTED` never becomes `NOT_APPLICABLE`.
7. Source/mechanism child items have stable IDs.
8. Source ambiguity fails closed.
9. Expected benchmark outputs remain independent of production code.
10. New abstractions require a real production consumer in the same PR.
11. No universal vibration/risk/confidence score.
12. Authority changes require explicit durable decision and focused validation.
13. Exact value revert does not restore lost topology source authority.
14. Stale results are evidence only; export/parity require `CURRENT_RESULT`.
15. FIT-specific geometry remains mechanism-specific until legitimately shared by another qualified mechanism.
16. Cross-table identity editing requires an explicit atomic contract.
17. Stable correlation/rule IDs are metadata; they must not change numerical method semantics.
18. Calculation detail renders backend intermediates; UI must not reproduce engineering formulas.

## 12. Current release gate

Controlled command:

```bash
npm run verify:vibration-fit-release
```

After Stage 5 the manifest contains **39 controlled test files**.

Focused Stage-5 framework validation is PASS. Full exact-head release execution, real-browser interaction and independent vibration-engineering review remain required before authority closure.
