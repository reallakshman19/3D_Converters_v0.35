# InputXML / PSI116 XML → CII 2019 — Governing Concept, Current-State Architecture and Qualification Roadmap

**Canonical file:** `docs/InputxmltoCII2019Fixplan.md`  
**Repository:** `reallaksh19/3D_Converters`  
**Current source baseline:** `4fce8d2b8fc2790058f9b0f348fa135a5eda5704`  
**Current-state update:** 2026-08-14  
**Document status:** `GOVERNING_CONCEPT_CURRENT_STATE_AND_ROADMAP`  
**Supersedes as current-state narrative:** the 2026-08-10 audited capability statements in earlier revisions of this file. Historical defects and benchmark findings remain valid evidence unless explicitly closed by exact-head qualification.

---

## 0. Purpose and mandatory use

This document is the governing concept, architecture record, data-authority policy, qualification framework, and roadmap for the **PSI116 XML / InputXML → CII 2019** programme in `3D_Converters`.

It shall be updated in the same PR as any material change to:

- source loading, source detection, multi-file orchestration, or source state;
- branch selection, branch occurrence identity, node occurrence identity, or topology;
- line-key, line-list, piping-class, material, rating, process-data, wall, corrosion, or density authority;
- Preview, Smart Map, Process From, Weight Match, rigid review, support mapping, diagnostics, propagation audit, or run behavior;
- enriched XML, CII generation, manifests, ZIP/download artifacts, or retained evidence;
- engine-input ownership, Pyodide/runtime boundaries, cache/version routing, or browser composition;
- benchmark fixtures, tolerances, production-readiness state, or qualification gates.

A capability shall not be claimed merely because source code, a test, a PR, or an import exists. The claim must distinguish:

```text
SOURCE_PRESENT
UI_VISIBLE
RUNTIME_BOUND
BENCHMARK_PASS
PARITY_PASS
EVIDENCE_COMPLETE
PRODUCTION_AUTHORIZED
```

These are separate engineering states.

### 0.1 Authority precedence

When records disagree, use this order:

1. executable source and actual browser/runtime behavior at the inspected exact head;
2. exact-head retained benchmark artifacts and conversion evidence;
3. canonical data contracts and runtime state transitions;
4. this governing document when updated to the same or later exact head;
5. historical readiness reports, screenshots, PR descriptions, prompts, and superseded notes.

### 0.2 Current programme boundary

The immediate programme is **conversion fidelity and auditable orchestration**. It does not authorize a new piping-stress solver, a new code-stress methodology, or model merging across independent source XML files.

---

# 1. Executive engineering conclusion — current state

The current browser route now contains a substantially more mature Mode A workflow than the 2026-08-10 baseline.

The following product capabilities are implemented in source and have been integrated into the active standalone Mode A route:

1. multi-file PSI116 XML selection in one browser operation;
2. one independent source/model state per XML;
3. source-local branch selection and workflow propagation;
4. duplicate `Branchname` and `NodeNumber` validation disabled by Mode A policy;
5. consolidated Preview across multiple independent XML models;
6. grouped **Smart Branch → Line Mapping** workbench;
7. source-specific **Map To** native dropdowns;
8. Smart Map ranking by **Service → first 3 alphabetic characters of Piping Class → Line-Key similarity**;
9. source-only **Process From…** semantics, where the current mapped line is the fixed target;
10. consolidated Weight Match and rigid-weight review workflows;
11. fan-out batch execution: one isolated conversion job per XML;
12. per-source CII artifacts and batch manifest;
13. **Save All CII Files (.zip)** containing successful independent CII outputs only.

The governing Mode A concept is therefore:

```text
one UI batch
  -> N independent source states
  -> N independent branch scopes
  -> N independent Preview / overrides / weight decisions
  -> N independent conversion jobs
  -> N independent CII outputs
  -> optional batch ZIP as packaging only
```

and explicitly **not**:

```text
N XML files -> one merged node/branch namespace -> one combined CII model
```

The current engineering status remains conservative:

```text
MODE_A_ORCHESTRATION_IMPLEMENTED
PREVIEW_SMART_MAPPING_IMPLEMENTED
PROCESS_FROM_SOURCE_ONLY_IMPLEMENTED
BATCH_CII_ZIP_IMPLEMENTED
NUMERICAL_EXACT_HEAD_QUALIFICATION_STILL_REQUIRED
PRODUCTION_AUTHORIZATION_NOT_ESTABLISHED_BY_THIS_DOCUMENT
```

Historical benchmark concerns involving coordinate custody, OD/property authority, rigid/component weight conservation, and end-to-end evidence remain qualification gates until exact-head evidence closes them.

---

# 2. Source families and programme boundaries

## 2.1 PSI116 XML

Typical root:

```xml
<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">
```

The governing benchmark family includes:

```text
Benchmarks/XML to CII 2019/GLRD-1000-PI-01.xml
```

Typical declared quantities include distance, bore, pressure, temperature, weight/mass, force, wall thickness, and fluid density. The conversion chain shall preserve the source unit declaration and every conversion step.

## 2.2 InputXML

InputXML is a separate source family with its own direct-enrichment behavior, restraint policy, point-property basis, output mode, sentinel behavior, and pressure-case normalization.

PSI116 XML and InputXML may share masters and downstream conversion infrastructure, but they shall not silently share assumptions about:

- branch structure;
- endpoint semantics;
- coordinate ownership;
- restraint ownership;
- point versus element property authority;
- source-specific enrichment rules.

## 2.3 Standalone route versus legacy converter routes

The standalone route is a separate callable workflow and application tab. Source presence in one route does not prove that another legacy route uses the same implementation.

Any future route convergence requires explicit parity evidence and rollback criteria.

---

# 3. Mode A — Separate Models

## 3.1 Non-negotiable architecture

Mode A means:

```text
Source XML A -> CII Model A
Source XML B -> CII Model B
Source XML C -> CII Model C
```

Batch is orchestration only:

```text
one UI batch -> N independent conversion jobs -> N independent CII outputs
```

### Consequences

- repeated `NodeNumber` across files is valid;
- repeated `Branchname` across files is valid;
- repeated `Branchname` occurrences inside a source are handled by occurrence identity, not by renaming the engineering source text;
- no global renumbering is performed merely to make multiple files coexist;
- no cross-file topology is inferred;
- no branch or node namespace is merged;
- original XML engineering names remain unchanged;
- internal source/occurrence IDs and display aliases may be used for UI routing and state isolation.

## 3.2 Duplicate policy

Mode A does **not** use duplicate `NodeNumber` or duplicate `Branchname` as a validation failure.

Operational checks remain appropriate for conditions such as:

- empty or unreadable source;
- wrong source kind;
- disabled source;
- zero selected branch scope where execution requires a branch;
- identical file-content re-import protection;
- malformed required source data according to the conversion contract.

Duplicate engineering labels are an identity-management concern, not a batch-validation concern.

## 3.3 Identity hierarchy

The minimum internal identity hierarchy is:

```text
sourceId
  -> branchOccurrenceId
    -> nodeOccurrenceId
      -> component identity / source reference
```

Raw `Branchname` and `NodeNumber` remain engineering labels and evidence. They shall not be treated as globally unique internal database keys.

A safe occurrence pattern is conceptually:

```text
sourceId = sourceDigest or stable source identity
branchOccurrenceId = sourceId + source-order occurrence identity
nodeOccurrenceId = branchOccurrenceId + node occurrence identity
```

---

# 4. Current runtime composition

The active standalone Mode A route is composed around the current easy-bulk shell and source-isolated state wrappers.

Key composition files include:

```text
tabs/xml-cii-2019-standalone-tab.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell-mode-a-easy-bulk-v6.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-panels-mode-a.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-events-mode-a-consolidated-review-v2.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-state.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-propagation.js
```

The effective state model is conceptually:

```text
raw Mode A state
  -> shared authorities/configuration
  -> source-local workflow state
  -> source-local branch scope
  -> source-local Preview / overrides / Weight Match
  -> isolated run state
```

Browser module cache-bust tokens are part of runtime activation plumbing. They do not change engineering authority, but stale tokens can make correct source appear absent in the running UI and therefore must be controlled during qualification.

---

# 5. Workflow phases and ownership

The adapted workflow remains organized around ten engineering/product phases:

| Phase | Label | Primary authority / responsibility |
|---|---|---|
| 1 | Source & Masters | Source inventory, masters, branch scope |
| 2 | Regex Tester | Line-key/class/size extraction logic |
| 3 | Resolver / JSON Trace | Staged JSON, DTXR and resolver evidence |
| 4 | Preview | Branch→Line identity, effective process/property review, Process From |
| 5 | Diagnostics | Normalized warnings/errors and aggregated evidence |
| 6 | Weight Match | Rigid/valve/flange weight candidate review and overrides |
| 7 | Support Type Mapper | Support/restraint mapping authority |
| 8 | Config | Effective shared/source-local configuration |
| 9 | Propagation Audit | Source→enriched XML→CII retention evidence |
| 10 | Output / Run | Isolated conversion, final artifacts, batch results |

No later phase may silently redefine a quantity governed by an earlier phase without explicit provenance and precedence.

---

# 6. Preview concept — Branch identity, Smart Map and Process From

## 6.1 Branch → Line Mapping

Branch mapping changes **line identity only** for the current source:

```text
linelist.branchLineKeyMap[branchName] = selectedLineKey
```

It does not itself copy process data.

The UI shall make this distinction visible.

## 6.2 Smart Map workbench

The consolidated Preview supports grouped mapping so engineers do not have to map each branch occurrence one by one.

Top-level concept:

```text
Smart Branch -> Line Mapping
[ Smart Map Unmapped (N) ]
```

The workbench groups sibling branch occurrences within a source by authoritative line-family evidence. Source identity is always part of the group key.

A row-level Smart Map action opens the same workbench filtered to that group; there is no separate mapping implementation.

## 6.3 Smart Map evidence states

Smart Map uses four review states:

```text
EXACT
SIMILAR
CONFLICT
UNRESOLVED
```

Interpretation:

- `EXACT`: authoritative extracted/derived line key exists in the loaded project keys;
- `SIMILAR`: credible candidate exists but engineer review is required;
- `CONFLICT`: independent evidence disagrees, e.g. sibling mapping versus exact project key;
- `UNRESOLVED`: no credible candidate.

`Accept All Exact` shall select only exact groups. Similar, Conflict, and Unresolved groups remain engineer-reviewed.

## 6.4 Smart Map ranking

For non-exact candidate ordering, the governing priority is lexicographic:

```text
1. Service match
2. first 3 alphabetic characters of Piping Class
3. Line-Key text similarity
```

This is not a free weighted blend where a strong text match can overrule a wrong service.

Example:

```text
Piping Class: 12-A_BC-900 -> alphabetic prefix ABC
```

Numbers and symbols are ignored when deriving the first three alphabetic characters. If no alphabetic class prefix exists, that criterion contributes no preference.

The **Map To** control shall be a native source-specific dropdown/select. Smart suggestions appear first, followed by the complete project Line List available to that XML source.

## 6.5 Conflict correction

If sibling evidence conflicts with an exact project key, Smart Map shall surface the conflict rather than learn the sibling value as an automatic truth.

Example concept:

```text
branch family token -> S8810347
existing B1 mapping -> S8810112
B2/B3 -> unmapped
exact project key -> S8810347

Status      = CONFLICT
Recommended = S8810347
Existing    = S8810112
```

Only an engineer Apply action changes the source-local mapping.

## 6.6 Process From — source-only semantics

Process reference direction is **source-only**.

The current mapped line is always the fixed target:

```text
Current mapped target = S8810009
Process From source    = D8810025
```

The user selects only the line/source to take process data **from**. There is no independent `To` selector.

Selecting a new Process From source replaces the prior process reference for the current mapped target line.

Process From shall never change:

```text
linelist.branchLineKeyMap
```

It affects source-local process overrides/provenance only.

A user may choose **Use Own Line Data** to clear the Process From reference and return the mapped line to its own project process data.

## 6.7 Process fields

The Process From mechanism is intended for selected numeric process fields such as:

```text
P1 / Design Pressure
T1
T2
T3
Density
Hydro/Test Pressure only when numeric
```

Non-numeric values such as:

```text
Hydro/Test Pressure = Water
```

shall not be copied as numeric process values.

## 6.8 Existing Preview fill-down rules

Where retained, the current grouping intent is:

```text
P1/T1/T2/T3/Density        -> same Line Key
Hydro/Material/Rating/CA   -> same Piping Class
Material Code/Wall         -> same Piping Class + Size
```

Existing exact/master/manual authority shall not be silently overwritten by bulk convenience actions.

---

# 7. Weight Match concept

Weight Match is separate from Preview line mapping and Process From.

The consolidated Weight UI supports exact-candidate acceleration while preserving engineer review for weaker evidence.

Bulk exact application shall be restricted to qualified direct/exact candidates. Interpolated, extrapolated, inferred, fallback, or otherwise non-exact candidates remain Review unless explicitly accepted by the engineer.

Weight state remains source-local under Mode A.

The programme shall explicitly distinguish:

```text
source component mass [kg]
master candidate mass [kg]
selected/finalized mass [kg]
manual override mass [kg]
allocated split-child mass [kg]
CII weight/force [N]
```

A governing conservation invariant remains:

```text
selected physical-component mass
=
sum(final allocated child/split masses)
```

within the declared tolerance, with kg→N applied exactly once where the CII contract expects force.

Historical benchmark concerns about large rigid weights are not closed merely because the current UI is improved. They require exact component-group lineage and conservation proof.

---

# 8. Support, restraint and JSON Trace authority

The support/restraint chain shall retain separation between:

```text
captured staged evidence
-> classified support kind
-> production support-mapping rule
-> materialized XML restraint
-> CII restraint
```

JSON Trace / DTXR is evidence and resolver context; it is not automatically production support authority.

Where multiple independent support members exist at one position, deduplication shall be by actual restraint identity and governed mapping semantics, not by broad text collapse.

---

# 9. Geometry, topology and property custody

## 9.1 Coordinate invariant

Every final coordinate shall be traceable to one of:

```text
SOURCE_COORDINATE
EXPLICITLY_DERIVED_SPLIT_COORDINATE
EXPLICITLY_DERIVED_TOPOLOGY_COORDINATE
```

A missing/failed parse shall not silently become `(0,0,0)`.

## 9.2 Topology invariant

Every emitted element shall retain consistent:

```text
from-node identity + coordinate
to-node identity + coordinate
component geometry
parent/generated-node provenance where applicable
```

Qualification shall detect:

- orphan nodes;
- unintended zero-length elements;
- unexpected coordinate resets;
- impossible jumps;
- generated nodes without parent provenance;
- cross-branch or cross-source identity leakage.

## 9.3 Geometry-property authority

The programme shall not conflate:

```text
nominal line size
BoreMm
OutsideDiameter
WallThickness
CorrosionAllowance
derived inside diameter
weight-master bore key
```

A valid source Outside Diameter shall not be overwritten merely because a weight candidate or approximate class candidate uses a different bore key.

Historical GLRD observations involving `(0,0,0)` coordinates and repeated `OD = 26.7 mm` remain exact-head regression targets until proven closed.

---

# 10. Batch run and output artifacts

## 10.1 Fan-out execution

The run phase shall execute enabled Mode A sources independently.

Each batch row retains, at minimum:

```text
sourceId
sourceDigest
fileName
alias
selectedBranchCount
status
error, if any
result
sourceManifest
```

Status is source-specific:

```text
SUCCEEDED
FAILED
BLOCKED
CANCELLED
```

One source failure shall not cause another source to share its partial state or artifact.

## 10.2 Per-source artifacts

Successful source results may expose independently downloadable:

```text
Enriched XML
CII
Diagnostics
Manifest
```

The per-source result retains the exact generated `ciiText`; batch ZIP creation shall use that already-produced output rather than rerunning conversion or reconstructing CII.

## 10.3 Save All CII Files (.zip)

The Batch Results panel provides:

```text
Save All CII Files (.zip) · N
```

where `N` is the number of successful rows containing an actual CII output.

ZIP rules:

- include successful CII outputs only;
- exclude failed, blocked, cancelled, and empty-output rows;
- preserve each XML as one independent `.cii` file;
- derive the `.cii` filename from the source XML basename;
- use deterministic `_2`, `_3`, ... suffixes when source filenames collide;
- do not merge models;
- do not rerun conversion;
- do not fabricate empty CII files.

Example:

```text
XML_CII_ModeA_20260814_HHMMSS.zip
├── SYS-0014.cii
├── SYS-0015.cii
└── SYS-0015_2.cii
```

The current ZIP implementation is dependency-free and uses standard ZIP records/CRC handling.

## 10.4 Batch CII ZIP versus evidence ZIP

The implemented **Save All CII Files** ZIP is a convenience/export package of successful CII files.

It is not equivalent to a future complete replay/evidence package containing:

```text
source XML
enriched XML
Preview evidence
Weight evidence
final rigid-review evidence
diagnostics
manifest
exact engine-input digest
CII
```

That broader evidence package remains a separate qualification/evidence objective.

---

# 11. Canonical data authority and provenance

Every conversion-critical CII quantity shall have one traceable chain:

```text
raw source fact
-> normalized fact
-> explicit derived/master fact where permitted
-> explicit user override/reference where permitted
-> effective Preview/review fact
-> exact enriched XML fact
-> exact engine-input fact
-> emitted CII quantity
```

No stage may silently substitute a generic default when an authoritative source exists.

When source data is absent or contradictory, the system shall either:

1. derive using a declared, testable rule and retain `derived` provenance; or
2. warn/block according to a declared policy.

Convenience UI actions shall never become hidden engineering kernels.

---

# 12. Evidence model

Conversion-critical operator decisions should be retained as machine-readable evidence at the authoritative transition rather than reconstructed later from mutated state.

The historical evidence objective remains:

```xml
<preview>...</preview>
<RigidMatch1>...</RigidMatch1>
<Rigidmatch2>...</Rigidmatch2>
```

or an equivalent schema-safe evidence package that retains the same engineering meaning.

If the PSI116 engine-input schema cannot safely accept non-schema evidence, retain a hash-linked post-engine evidence artifact rather than breaking the engine contract.

Required replay digests should include, as applicable:

```text
source digest
branch-selection digest
staged JSON digest
configuration digest
Preview evidence digest
Weight evidence digest
final rigid-review evidence digest
exact engine-input digest
enriched evidence digest
CII digest
```

Evidence completeness is not yet implied solely by the presence of the batch CII ZIP.

---

# 13. Current capability matrix

| Capability | Current state | Governing note |
|---|---|---|
| Single PSI116 XML | Implemented | Retain exact source/unit provenance |
| Single InputXML | Implemented | Separate enrichment semantics |
| Multi-PSI116 browser selection | Implemented in Mode A route | One file remains one model |
| Source inventory | Implemented | Source-local state |
| Duplicate Branchname/NodeNumber validation | Disabled by Mode A policy | Occurrence identity handles ambiguity |
| Source-local branch scope | Implemented | No cross-file namespace merge |
| Shared Regex / master authorities | Implemented | Shared configuration may fan out; model state remains isolated |
| Consolidated Preview | Implemented | Read/review across source-separated rows |
| Smart Map grouped workbench | Implemented | SourceId participates in grouping |
| Source-specific Map To dropdown | Implemented | Native select; project keys limited to source |
| Smart ranking Service→ClassPrefix→Similarity | Implemented | Exact authority still outranks fuzzy ranking |
| Process From source-only | Implemented | Current mapped line is fixed target |
| Preview fill-down | Implemented with safeguards | Preserve stronger authority |
| Consolidated Weight Match | Implemented | Source-local overrides |
| Consolidated rigid review | Implemented | Run remains source-isolated |
| Batch fan-out run | Implemented | N sources -> N jobs/results |
| Per-source CII download | Implemented | Exact generated output |
| Batch manifest | Implemented | Orchestration evidence; no model merge |
| Save All CII ZIP | Implemented | Successful CII outputs only |
| Embedded/replayable Preview & rigid evidence | Qualification objective | Do not infer from UI alone |
| Exact geometry/property parity | Qualification objective | GLRD regressions remain governing checks |
| Component-group weight conservation | Qualification objective | Must be numerically proven |
| Production authorization | Not established by this document | Requires exact-head benchmark evidence |

---

# 14. Historical defects and current qualification debt

Earlier revisions documented real or reported defects. Current UI/product improvements do not automatically close them.

## 14.1 Historical Mode A visibility defect — functionally addressed

The earlier state in which Mode A source files existed but the multi-file UI was not visible has been functionally addressed through the current Mode A browser route and cache-busted shell composition.

Regression requirement: keep browser-level proof that multi-file selection, inventory, source switching, and source-local branch scope remain visible and bound at the exact head.

## 14.2 Coordinate/topology custody — still a qualification gate

Historical GLRD outputs included repeated `(0,0,0)` coordinates despite non-zero source positions.

Required closure evidence:

```text
raw source Position
-> normalized occurrence
-> enriched XML
-> exact engine input
-> converter node table
-> emitted CII coordinate
```

for representative direct and generated nodes.

## 14.3 OD/property custody — still a qualification gate

Historical repeated `OD = 26.7 mm` observations require exact occurrence-level tracing through source OD, bore/size, class resolution, enriched XML, engine input, and CII.

## 14.4 Weight mapping/conservation — still a qualification gate

Historical suspect rigid/component weights require proof of:

- selected physical component mass;
- candidate/override lineage;
- split ownership;
- conservation;
- kg→N exactly once;
- no adjacent-component leakage.

## 14.5 Retained Preview/Weight/final-review evidence — still an evidence gate

The current Preview and Weight UX does not by itself prove that all operator decisions are frozen and replayable in final retained artifacts.

## 14.6 Batch CII ZIP — implemented

The earlier concept for a batch-level CII ZIP has been implemented as **Save All CII Files (.zip)**.

A richer evidence ZIP remains a separate future objective.

---

# 15. Benchmark and qualification programme

## 15.1 Governing benchmark family

Immediate regression work shall continue to include:

```text
Benchmarks/XML to CII 2019/GLRD-1000-PI-01.xml
```

plus targeted Mode A multi-source fixtures that deliberately reuse `Branchname` and `NodeNumber` values across independent sources.

## 15.2 Qualification layers

### QL-1 — Source parse

Prove source kind, units, branch/node counts, occurrence identity, coordinates, component refs, OD/wall/corrosion, and deterministic parse behavior.

### QL-2 — Mode A isolation

Prove multiple XML sources remain independent through source state, branch scope, overrides, process reference, weight review, run, and artifact output.

### QL-3 — Preview / Smart Map / Process From

Prove mapping identity, source-specific candidate lists, exact/conflict status, ranking semantics, fixed-target Process From behavior, replacement semantics, and provenance.

### QL-4 — Weight Match

Prove candidate qualification, selected value, override key, component grouping, split ownership, and conservation.

### QL-5 — Support/restraint

Prove staged evidence → classification → XML restraint → CII restraint.

### QL-6 — Enriched XML and engine input

Prove exact effective values, no silent defaults, exact payload digest, and schema compatibility.

### QL-7 — CII numerical parity

Prove geometry, OD/wall, weight, restraints, topology, process properties, and identity against the governed engine input.

### QL-8 — Batch artifacts

Prove source-specific artifact lineage, batch manifest integrity, successful-only CII ZIP packaging, deterministic names, and no model merge.

### QL-9 — Browser exact-head proof

Prove the actual user path at the exact deployed/browser head, including cache/module identity where relevant.

## 15.3 Negative controls

Required negative controls include:

```text
same Branchname in two Mode A files remains source-distinct
same NodeNumber in two Mode A files remains source-distinct
same line key in two Mode A files retains source-local Process From/overrides
zero branch selection blocks the applicable run path
conflicting sibling mapping is surfaced as CONFLICT
wrong-service fuzzy candidate cannot outrank a same-service candidate only by text similarity
non-numeric Water cannot be copied as numeric Hydro/Test Pressure
changing Process From replaces prior reference without changing branch mapping
failed batch source is absent from Save All CII ZIP
source filename collision produces deterministic _2/_3 ZIP names
missing Position does not silently become 0,0,0
valid source OD is not overwritten by weight-master bore
component mass cannot be duplicated across split children without conservation failure
kg-to-N cannot be applied twice
```

---

# 16. Near-term roadmap

## R1 — preserve current Mode A product behavior

Protect with regression coverage:

- multi-source import;
- source-local branch scope;
- disabled duplicate-label validation;
- consolidated Preview;
- Smart Map grouping and evidence states;
- source-specific Map To select;
- Service→ClassPrefix→Similarity ranking;
- Process From source-only semantics;
- consolidated Weight Match;
- separate-model batch run;
- Save All CII ZIP.

## R2 — close geometry/topology parity

Establish occurrence-scoped coordinate/property ledgers and exact GLRD source→engine→CII traces.

## R3 — close component/property authority

Prove OD/bore/wall/corrosion precedence and prevent convenience masters from becoming hidden geometry authority.

## R4 — close weight conservation

Introduce/qualify physical component-group ownership, split allocation, mass conservation, and single kg→N conversion.

## R5 — close evidence/replay gap

Freeze Preview, Weight Match, and final rigid-review evidence at authoritative transitions, link exact engine input and CII by digest, and define a replayable evidence bundle.

## R6 — exact-head qualification

Run full browser + engine benchmark evidence before advancing `PRODUCTION_AUTHORIZED`.

---

# 17. Canonical source inventory — current high-signal files

## 17.1 Standalone application and workflow

```text
tabs/xml-cii-2019-standalone-tab.js
tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js
tabs/xml-cii-2019-standalone/xml-cii-workflow-service.js
tabs/xml-cii-2019-standalone/xml-cii-workflow-types.js
tabs/xml-cii-2019-standalone/xml-cii-workflow-engine-client.js
```

## 17.2 Mode A state, shell and batch orchestration

```text
tabs/xml-cii-2019-standalone/xml-cii-mode-a-batch.js
tabs/xml-cii-2019-standalone/xml-cii-mode-a-batch-core.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-state.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-propagation.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell-mode-a-easy-bulk-v6.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-panels-mode-a.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-events-mode-a-consolidated-review-v2.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow-mode-a-consolidated-review-v2.js
```

## 17.3 Preview / Smart Map / Process From

```text
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-consolidated-easy-ui.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-consolidated-easy-ui-hook.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-smart-map.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-smart-map-ui.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-smart-map-ui-v2.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-process-from.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-process-from-ui.js
```

## 17.4 Weight Match and rigid review

```text
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-consolidated-easy-weight-ui.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-consolidated-easy-weight-hook.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-review-mode-a.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-review-mode-a-state.js
```

## 17.5 CII ZIP batch export

```text
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-cii-zip.js
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-events-mode-a-cii-zip.js
```

## 17.6 Parity, support and core conversion

```text
tabs/xml-cii-2019-standalone/xml-cii-standalone-run-parity.js
tabs/xml-cii-2019-standalone/xml-cii-run-parity-evidence.js
tabs/xml-cii-2019-standalone/xml-cii-resolver-json-trace.js
tabs/xml-cii-2019-standalone/xml-cii-support-type-mapper.js
tabs/model-converters/converters/inputxml-to-cii2019.js
converters/xml-cii2019-core/weight-match-model.js
converters/xml-cii2019-core/support-mapping.js
```

---

# 18. Mandatory PR maintenance checklist

Every future XML/InputXML → CII 2019 capability PR shall answer:

```text
1. What exact capability changed?
2. Which source/runtime file is authority?
3. Which source kinds are affected: PSI116 XML, InputXML, or both?
4. Which UI phase is affected?
5. Does Mode A source isolation change?
6. Does branch/node occurrence identity change?
7. Does Branch→Line mapping authority change?
8. Does Smart Map ranking/evidence change?
9. Does Process From authority or provenance change?
10. Does coordinate/topology authority change?
11. Does bore/OD/wall/corrosion authority change?
12. Does process-data authority change?
13. Does weight matching/allocation/conservation change?
14. Does restraint/support authority change?
15. Does exact enriched XML or engine input change?
16. Which CII quantities or artifacts change?
17. Which independent benchmark validates it?
18. Which exact-head browser proof ran?
19. Which authority states advanced and which remain false?
20. Was this governing document updated?
```

A PR shall be blocked when source, UI, state, engine input, and emitted CII cannot be reconciled for the changed engineering quantity.

---

# 19. Final governing statement

The programme now has a useful multi-source engineering workflow, but product convenience shall not be confused with numerical qualification.

The governing sequence is:

```text
preserve Mode A source isolation
-> preserve explicit mapping and Process From provenance
-> prove geometry/topology/property custody
-> prove component-group weight conservation
-> retain replayable operator evidence
-> prove exact engine-input parity
-> prove CII numerical parity
-> retain source-separated artifacts / ZIP packaging
-> pass exact-head browser + engine benchmarks
-> only then advance production authorization
```

No future PR may shorten this chain by treating source presence, a green isolated unit test, a plausible Preview row, a successful ZIP download, or a visually plausible CII file as end-to-end engineering qualification.

---

# Appendix A — Mandatory Expert Questionnaire (10 Questions)

## A.1 Purpose and authority

This appendix is the current mandatory written expert gate for any new agent, contractor, replacement maintainer, or reviewer seeking implementation authority on the XML/InputXML → CII 2019 programme.

A candidate shall answer **all 10 questions before changing production code** unless the owner explicitly waives the gate for a narrowly named non-engineering task.

Passing this written gate does not grant merge authority. Merge authority remains owner-controlled and scope-specific.

## A.2 Scoring

Each question carries 10 marks.

```text
Question 1  = 10
Question 2  = 10
Question 3  = 10
Question 4  = 10
Question 5  = 10
Question 6  = 10
Question 7  = 10
Question 8  = 10
Question 9  = 10
Question 10 = 10

Maximum total = 100
Minimum total = 92/100
Minimum per question = 8/10
```

A safety-critical, numerical-authority, or provenance-critical false claim may cause immediate failure regardless of score.

## A.3 Mandatory answer format

Each answer shall contain:

```text
A. Governing engineering principle / diagnosis
B. Exact repository files and functions to inspect
C. One concrete source→state→engine→CII trace or UI/state trace
D. Narrow/single-factor tests
E. Negative controls
F. Expected retained evidence
G. What the answer does NOT yet prove
```

Generic software statements or paraphrases of this document do not qualify.

---

## Question 1 — Mode A architecture and namespace isolation — 10 marks

Explain the current Mode A architecture from multi-file browser selection through batch results. Prove why repeated `NodeNumber` and `Branchname` values are valid and why no global renumbering or model merge is required.

A qualified answer must include:

- `one UI batch -> N independent jobs -> N independent CII outputs`;
- source-local state and branch scope;
- occurrence identity versus raw engineering labels;
- shared authorities versus source-local overrides/results;
- duplicate-label validation policy;
- identical-file import protection as a separate operational concern;
- a two-source hostile test using repeated branch and node labels;
- proof that one source failure cannot mutate another source result.

**Immediate fail:** proposing a global node/branch namespace for Mode A or claiming duplicate engineering labels are invalid solely because they repeat across files.

---

## Question 2 — Source parsing, coordinates, topology and generated-node custody — 10 marks

Using the GLRD benchmark or an equivalent frozen fixture, describe how you will trace one source node and one generated/split node from raw XML to emitted CII coordinates and topology.

A qualified answer must include:

- declared unit handling;
- branch/node occurrence identity;
- source `<Position>` custody;
- generated-node parent provenance;
- from/to continuity;
- orphan and zero-length detection;
- prohibition of silent `(0,0,0)` fallback;
- exact engine-input trace;
- one malformed-position negative control.

**Immediate fail:** repairing coordinates only in the CII writer without restoring source provenance.

---

## Question 3 — Branch → Line Smart Map authority and ranking — 10 marks

Explain how Smart Map shall group branches, rank candidates, surface conflicts, and write mappings without becoming a second line-list authority.

A qualified answer must include:

- sourceId in grouping identity;
- sibling `/B#` grouping behavior;
- `EXACT / SIMILAR / CONFLICT / UNRESOLVED` states;
- exact candidate authority;
- governing non-exact priority: **Service → first 3 alphabetic Piping Class characters → Line-Key similarity**;
- why text similarity cannot overrule wrong service;
- source-specific Map To dropdown validation;
- `Accept All Exact` limitations;
- conflict example where an existing sibling mapping disagrees with an exact project key;
- proof that mapping writes only source-local `branchLineKeyMap` entries.

**Immediate fail:** bulk-applying fuzzy/conflict rows as exact or allowing a key from another XML source to be written without source validation.

---

## Question 4 — Process From source-only semantics and precedence — 10 marks

Explain the Process From contract and how user selection overrides a previous process reference without changing branch identity.

A qualified answer must include:

- current mapped line is the fixed target;
- only the source line/source occurrence is selectable;
- no independent `To` selector;
- new Process From replaces prior Process From for that target;
- `Use Own Line Data` clearing semantics;
- branch mapping remains unchanged;
- source-local provenance storage;
- numeric field validation;
- `Water` or other non-numeric Hydro/Test values rejected as numeric data;
- same target line key in two XML files remains source-distinct.

**Immediate fail:** implementing Process From as target remapping or allowing the chosen source line to replace `branchLineKeyMap`.

---

## Question 5 — Process/property authority, Preview propagation and master precedence — 10 marks

Define the authoritative precedence for line identity, piping class, material, rating, pressure, temperature, density, wall thickness, corrosion and material code through Preview to engine input.

A qualified answer must include:

- source versus exact master versus derived versus explicit override;
- distinction between identity mapping and process inheritance;
- current fill-down grouping rules;
- preservation of stronger exact/master/manual values;
- exact versus approximate provenance;
- prevention of approximate class similarity from becoming hidden geometry authority;
- one row-level source→Preview→engine-input trace;
- a negative test showing an unrelated row is not overwritten by bulk fill.

**Immediate fail:** treating every Preview convenience action as an authoritative global write.

---

## Question 6 — Bore, OD, wall, corrosion and component geometry authority — 10 marks

Explain how you will prevent nominal size, bore, OD, wall, corrosion and weight-master bore keys from being conflated.

A qualified answer must include:

- separate contracts for nominal size, `BoreMm`, `OutsideDiameter`, `WallThickness`, `CorrosionAllowance` and derived ID;
- source OD precedence where valid;
- component/end-specific geometry for reducers, valves, flanges and branches;
- why a weight candidate cannot silently overwrite OD;
- exact trace of one historical OD=26.7 occurrence;
- impossible-geometry checks;
- exact/approximate master restrictions;
- negative test proving source OD survives weight matching unchanged absent explicit authorized override.

**Immediate fail:** deriving OD solely from a fuzzy line/class or weight candidate when valid source OD exists.

---

## Question 7 — Rigid/valve/flange weight mechanics and conservation — 10 marks

Explain how Weight Match, manual overrides, final rigid review, split/condensed components and CII weight output are reconciled numerically.

A qualified answer must include:

- mass `[kg]` versus force `[N]`;
- candidate classification: exact/interpolated/extrapolated/inferred/manual as applicable;
- source-local override identity;
- physical component-group ownership;
- split-child allocation;
- component-group conservation;
- model-level conservation with declared exclusions;
- kg→N exactly once;
- rerun determinism;
- one back-calculation from a suspect CII weight to implied mass and candidate/override lineage.

**Immediate fail:** copying the full physical component mass to multiple split children without conservation proof or treating kg and N as interchangeable.

---

## Question 8 — Support/restraint, staged JSON and DTXR authority — 10 marks

Explain the separation between captured staged evidence, JSON Trace/DTXR, production support classification, XML restraint materialization and final CII restraint.

A qualified answer must include:

- JSON Trace as evidence/context rather than automatic production authority;
- support-type mapping ownership;
- source/member/position identity;
- handling of multiple independent supports at one position;
- deduplication by actual restraint identity;
- source-local Mode A behavior;
- one GT/ST/REST-style trace from staged evidence to CII;
- negative control against broad REST-class collapse.

**Immediate fail:** treating DTXR text alone as sufficient authority to emit a restraint without the governed mapping path.

---

## Question 9 — Batch execution, artifacts and Save All CII ZIP — 10 marks

Explain how the batch run and ZIP export preserve independent-model semantics and exact output custody.

A qualified answer must include:

- source-specific `SUCCEEDED/FAILED/BLOCKED/CANCELLED` result states;
- exact generated `ciiText` retained per successful source;
- no conversion rerun during ZIP creation;
- successful-only ZIP filtering;
- source-derived CII filenames;
- deterministic duplicate filename suffixes;
- CRC/archive validation strategy;
- batch manifest role;
- distinction between batch CII ZIP and a replay/evidence ZIP;
- proof that ZIP packaging cannot merge namespaces or alter CII content.

**Immediate fail:** regenerating CII from a different state merely to build the ZIP or placing failed/empty fabricated models into the archive.

---

## Question 10 — Exact-head qualification, debugging strategy and production authorization — 10 marks

Design the minimum safe qualification programme for a change that touches Preview mapping, process inheritance, geometry, weight or output artifacts.

A qualified answer must include:

- exact repository head and browser-loaded asset identity;
- smallest-change / single-factor debugging strategy;
- source→state→enriched XML→engine-input→CII provenance;
- exact benchmark and hostile negative controls;
- retained diagnostics/manifests/digests;
- distinction among unit tests, browser proof, numerical parity and production authorization;
- rollback criteria;
- explicit statement of which authority states remain false after a partial fix;
- independent review requirements for numerical changes;
- why a successful UI action or plausible CII file is insufficient proof by itself.

**Immediate fail:** claiming production authorization from source presence, isolated unit tests, screenshots, or a successful download without exact-head numerical evidence.

---

## A.4 Immediate-fail claims across the questionnaire

Any of the following may cause immediate failure:

- merging independent Mode A models or globally renumbering them merely to avoid duplicate labels;
- using raw `NodeNumber` or `Branchname` as a universal unique key;
- treating Smart Map fuzzy similarity as exact authority;
- reversing Process From direction or changing branch mapping as a side effect;
- accepting silent coordinate `(0,0,0)` fallback;
- conflating bore, OD, wall and weight-master bore;
- applying kg→N twice or duplicating physical mass across split children;
- treating JSON Trace/DTXR as automatic restraint authority;
- claiming ZIP creation proves CII numerical correctness;
- claiming benchmark/production parity without tracing the exact engine input and emitted CII.

## A.5 Authority progression after the written gate

Recommended progression:

```text
Questionnaire failed
  -> NO_IMPLEMENTATION_AUTHORITY

Questionnaire passed
  -> REPOSITORY_TRACE_EXERCISES_ALLOWED

Questionnaire + trace exercises passed + owner authorization
  -> LIMITED_IMPLEMENTATION_AUTHORITY

Implementation + exact-head benchmark evidence passed
  -> PR_READY_FOR_INDEPENDENT_REVIEW

Independent review + explicit owner approval
  -> MERGE_AUTHORITY_FOR_NAMED_SCOPE_ONLY
```

Qualification is scope-specific. Passing Appendix A does not authorize unrelated FEA solvers, code-stress engines, vibration modules, FBX/GLB conversion, or other repository programmes.
