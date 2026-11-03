# Overall Roadmap — XML/InputXML → CII 2019 Exact-Head Closure

Maintained by the Owner. Updated after every merged XML/InputXML → CII 2019
Work Pack. This is the single source of truth for **phase status, sequencing,
and release authority** for this workstream.

The detailed engineering mandate remains
[`docs/InputxmltoCII2019Fixplan.md`](./InputxmltoCII2019Fixplan.md). That file
contains the full defect narrative, evidence requirements, expert gate, and
technical constraints. This roadmap does not replace it; it converts that
mandate into an owner-controlled implementation and qualification sequence.

Repository source is authoritative over prose. If this roadmap or any older
planning document conflicts with the executable source, the exact source at
the qualified commit must be inspected and the roadmap corrected. A claim is
not accepted merely because it appears in a document, PR description, test
name, UI label, or agent summary.

---

## 1. Frozen baseline and current authority

Roadmap baseline established on **10 August 2026**.

| Item | Frozen authority |
|---|---|
| Repository | `reallaksh19/3D_Converters` |
| Roadmap / mandate head | `152f0d18e4c9371c384f291799f7695a153d1755` |
| Executable parent baseline | `b168cced3f5aaaada15de290d14ce64928a9a7a3` |
| Governing fix plan | `docs/InputxmltoCII2019Fixplan.md` |
| Governing benchmark | `Benchmarks/XML to CII 2019/GLRD-1000-PI-01.xml` |
| Primary target | Standalone XML/InputXML → CII 2019 production workflow |
| Batch target | Mode A — multiple XML files, separate models, no model merge |

Current qualification verdict at this baseline:

```text
SOURCE_CAPABILITY_PRESENT
RUNTIME_UI_PROOF_INCOMPLETE
BENCHMARK_NUMERICAL_PARITY_FAILED
PRODUCTION_AUTHORIZATION_NOT_ESTABLISHED
```

Therefore **production release remains blocked**. Documentation, repository
inspection, scoped implementation after Owner authorization, and qualification
work are allowed. No future agent may convert source presence or a green unit
test into a claim of browser/runtime activation or numerical correctness.

---

## 2. Phase status

| Phase | Status | Governing output |
|---|---|---|
| P0 Baseline freeze + expert qualification gate | **Done** | Fix plan at `152f0d18…`; repository-specific expert gate answered |
| P1 Runtime route / Mode A activation proof | **Incomplete** | Exact browser/deployed-module proof, not source-text proof only |
| P2 Coordinate + topology custody | **Ready — first implementation phase** | Occurrence-scoped identity, fail-closed coordinates, correct COORDS anchoring |
| P3 OD / bore / property authority | **Blocked on P2 isolation** | Raw-vs-effective OD, unit-qualified bore authority, reducer/change-size rules |
| P4 Rigid / valve / flange weight authority | **Blocked on P3 isolation** | Review-state separation, stable identity, mass conservation, explicit kg→N contract |
| P5 Immutable Preview / Weight evidence | **Blocked on P4 data contracts** | `<preview>`, `<RigidMatch1>`, `<Rigidmatch2>` frozen snapshots + digests |
| P6 Enriched XML ZIP package | **Blocked on P5** | Deterministic per-source evidence ZIP + manifest |
| P7 Exact GLRD end-to-end qualification | **Blocked on P2–P6** | Coordinate, geometry, property, weight, restraint, provenance and CII parity evidence |
| P8 Mode A multi-source browser qualification | **Blocked on P7 single-source closure** | Real browser multi-file proof; per-source isolation; no cross-file topology |
| P9 Independent release review + Owner production authorization | **Not started** | Exact-head review, full checks, retained artifacts, explicit Owner release decision |

A phase is not marked Done because code exists. It is Done only when its
acceptance evidence has been produced from the real execution path and has
survived the required negative controls.

---

## 3. Work Pack log and mandated order

Work Packs below are intentionally narrow. Coordinate, geometry, weight, and
evidence mechanics must not be changed simultaneously because doing so makes
root-cause attribution impossible.

| Mission | Status | Scope | Exit gate |
|---|---|---|---|
| X001 | **Ready** | Coordinate/topology custody | GLRD origin failures closed without OD/weight changes |
| X002 | Planned | OD/bore/property authority | Six 26.7-mm cases and `4 mm` bore failure closed with source provenance retained |
| X003 | Planned | Weight identity, review lifecycle and conservation | Reported suspect weights trace to one accepted mass each; no stale/sibling duplication |
| X004 | Planned | Immutable Preview / RigidMatch evidence + digest chain | Three snapshots frozen at correct lifecycle points; exact engine inputs hash-linked |
| X005 | Planned | `Save Enriched XML ZIP` | Deterministic per-source ZIP with manifest and qualification artifacts |
| X006 | Planned | GLRD exact-head regression and hostile negative controls | Governing benchmark passes all numerical/provenance gates |
| X007 | Planned | Real browser Mode A qualification | Multi-file separate-model workflow proven in deployed/runtime route |
| X008 | Planned | Independent exact-head release qualification | Owner-reviewed exact SHA with all gates green |

**Mandatory sequence:**

```text
X001 coordinate/topology
    ↓
X002 OD/bore/property authority
    ↓
X003 weight authority/conservation
    ↓
X004 immutable evidence
    ↓
X005 ZIP packaging
    ↓
X006 GLRD exact-head regression
    ↓
X007 Mode A browser qualification
    ↓
X008 release qualification
```

A later mission may expose an earlier defect. If that happens, stop, reopen
the earlier phase, fix it there, and re-run downstream qualification. Do not
hide an upstream defect with a downstream formatting or mapping patch.

---

## 4. X001 — coordinate and topology custody

### 4.1 Governing diagnosis

The GLRD source contains valid non-zero absolute coordinates. Example:

```text
Node 10 source Position = 111369.76 108416.90 101088.18
XML XYZ → CII X,Z,-Y
Expected mapped coordinate = 111369.76, 101088.18, -108416.90
```

The current CII path represents geometry using element deltas plus the `COORDS`
section. Connected-component/anchor logic currently relies too heavily on
engineering `NodeNumber`, while PSI116 contains repeated node-number
occurrences at branch boundaries. An engineering node number is not a safe
occurrence identifier.

The current Python position parser also has an unacceptable failure mode:
malformed `Position` text can fall back to `(0,0,0)`. Coordinate uncertainty
must never silently become the global origin.

### 4.2 Required implementation contract

Introduce or preserve an occurrence-level identity equivalent to:

```text
sourceId
branchOccurrenceId
nodeOccurrenceId
engineeringNodeNumber
componentRefNo
endpoint
sourcePosition
```

Edges and connected components shall be built from occurrence identity.
Engineering node numbers may be reconciled only through an explicit junction
rule. Before serialization, the converter must enforce:

```text
one final CII NodeNumber → one unique physical coordinate within tolerance
```

Conflicting coordinates for the same final node are blocking diagnostics.
Missing/malformed/non-finite coordinates are blocking diagnostics. No origin
fallback is allowed.

### 4.3 Primary code areas

At minimum inspect and qualify:

- `converters/scripts/xml_to_cii2019.py`
  - `_parse_position`
  - `_parse_xml_document`
  - `_build_edges`
  - `_build_degree_map`
  - `_coords_component_map`
  - `_build_coords_payload`
- any patched/directional wrapper that mutates the XML before
  `_parse_xml_document`
- topology cleanup / generated-node logic that changes occurrence identity

### 4.4 GLRD acceptance set

The reported origin nodes are mandatory retained regressions:

```text
10
760
1200
1640
2080
2520
2960
```

For each, retain:

```text
raw source occurrence
raw Position
branch occurrence
post-enrichment Position
engine-request Position
converter-parse Position
parsed XmlNode.position
component/anchor identity
COORDS record used
final reconstructed CII coordinate
```

### 4.5 Negative controls

- duplicate `NodeNumber` on two physically different branch occurrences;
- malformed two-component `Position`;
- non-numeric Position token;
- repeated engineering node with coordinate mismatch beyond tolerance;
- disconnected component requiring its own COORDS anchor.

Each must fail or resolve for the intended, documented reason.

### 4.6 What X001 does not authorize

X001 must not change OD/bore rules, weight matching, mass conversion, weight
propagation, evidence XML schema, or ZIP packaging except where a minimal
identity contract is required by topology itself.

---

## 5. X002 — OD, bore and property authority

### 5.1 Confirmed 26.7-mm source pattern

The six reported CII OD failures are:

```text
596  → 598
1036 → 1038
1476 → 1478
1916 → 1918
2356 → 2358
2796 → 2798
```

The frozen PSI116 source contains the characteristic flange endpoint pattern:

```text
Endpoint 1 OutsideDiameter = 60.3 mm
Endpoint 2 OutsideDiameter = 26.7 mm
```

The raw 26.7 value is therefore source evidence, but it is not automatically
the effective pipe-section OD for the following CII element. Component
endpoint metadata and effective connected-flow-path geometry must be separate
concepts.

### 5.2 Required authority model

Internally distinguish at least:

```text
sourceOutsideDiameter
effectiveOutsideDiameter
nominalSize / BoreMm
boreUnit / nominal-size semantic
wallThickness
corrosionAllowance
authority source
resolution reason
```

For FLAN / VALV / RIGID endpoint discontinuities, preserve the raw endpoint
value but resolve the effective CII OD from governed connectivity. A reducer,
branch-size transition, or other legitimate size-changing component must
remain able to change OD; therefore a blanket "take previous OD" rule is not
acceptable.

### 5.3 `4 mm` bore failure

Reference-looking branch names such as:

```text
=134234934/21706
=134234934/21755
```

exist in the raw PSI116 source and must be preserved as raw Branchname
provenance. They must not be renamed merely to make line-list matching easier.

The staged-geometry path accepts values from fields such as `ABORE`, `LBORE`,
`PBORE`, `HBORE`, `TBORE`, `BORE`, `DN`, and `NB`. A numeric staged value
`4` must not become `BoreMm=4` unless its source contract explicitly says
millimetres. If `4` means NPS 4, it is a nominal designation and requires a
governed NPS→DN mapping; it is not `4 mm` and is not simply `4 × 25.4`.

Unknown bore units are blocking or review-required. Staged data shall not
silently override a qualified XML/connected-geometry value when its unit or
semantic is unknown.

### 5.4 Primary code areas

- `converters/xml-cii2019-core/staged-geometry-authority.js`
- `converters/xml-cii2019-core/outside-diameter-resolver.js`
- Preview / branch property resolution modules
- `converters/scripts/xml_to_cii2019.py::_element_outside_diameter`
- reducer / branch / split-component geometry handling

### 5.5 Exit evidence

For all six 26.7-mm pairs retain:

```text
raw endpoint OD
sibling endpoint OD
adjacent connected OD
component type/ref/endpoint
size-change authority if any
effective OD
engine-input OD
CII OD
resolution rule
```

Also retain at least one reference-named branch showing why a displayed
nominal size is 50/80/100 mm (as applicable) and why no NPS/inch value has
been misinterpreted as millimetres.

---

## 6. X003 — rigid, valve and flange weight authority

### 6.1 Governing diagnosis

Large CII weights already correlate with saved/mapped kilogram values before
the CII writer. Example:

```text
478 → 480 CII = 1207.3401 N
1207.3401 / current configured scale 10 = 120.73401 kg
Weight Match RIGID 480 = Mapped (override) 120.734 kg
visible suggestion on that row = 15 kg
```

Therefore the first defect to close is review-state/identity authority, not
short-element physics. Changing the kg→N multiplier must not be used to hide
an incorrect selected mass.

### 6.2 Mandatory state separation

The following are different facts and shall not share one mutable value:

```text
sourceWeightKg
automaticCandidateKg
RigidMatch1SelectedKg
Rigidmatch2AcceptedKg
finalAllocatedPhysicalComponentMassKg
finalCiiChildMassKg
```

`RigidMatch1` is the Weight Match decision. `Rigidmatch2` is the final popup
decision after Finalise and Run. The latter may supersede the former for the
run, but it must not rewrite history.

A previously saved positive override must not make a component disappear from
the final review simply because it has already been materialized into XML.
Review eligibility and review history must be based on component identity and
lifecycle state, not merely `Weight > 0`.

### 6.3 Identity contract

Do not use plain `NodeNumber` as a weight decision key. Use an occurrence /
physical-component identity equivalent to:

```text
sourceId
branchOccurrenceId
componentOccurrenceId
physicalComponentGroupId
ComponentRefNo
Endpoint
```

Generated/split node numbers may be display/export identifiers; they are not
sufficient authority for persisted component mass.

### 6.4 Conservation contract

When a physical valve/flange/rigid component is represented by more than one
CII child:

```text
selected physical component mass
    = sum(final child masses assigned to that physical component)
```

Copying the full component mass to every zero-weight sibling is prohibited
unless the source explicitly represents independent physical masses. Any split
allocation must state its basis and prove conservation.

### 6.5 Unit contract

The current standalone invocation uses a configured scale equivalent to
`--weight-scale 10` when kg→N conversion is enabled. That compatibility choice
must be explicit in evidence and tests. Any future change to `9.80665`, `10`,
or another factor requires a separate Owner decision and benchmark impact
review.

### 6.6 Mandatory GLRD traces

All reported suspect rows remain regression data. At minimum the retained
detailed traces shall include:

```text
48   → 50    2987.8701 N
168  → 170   2760.8601 N
478  → 480   1207.3401 N
529  → 530   1288.9501 N
888  → 890    978.67   N
3460 → 3469   950      N
```

`529 → 530` is especially important because the supplied Weight Match extract
does not by itself establish where the implied `128.89501 kg` became final.
`<Rigidmatch2>` must close that provenance gap.

### 6.7 Primary code areas

- `converters/xml-cii2019-core/weight-match-model.js`
- `converters/xml-cii2019-core/split-rigid-weight-propagation.js`
- standalone Weight Match UI/state
- Finalise-and-Run rigid review popup/state
- `tabs/model-converters/converters/xmltocii2019_runner.js`
- `converters/xml-cii-2019-standalone/invocation-builder.js`
- `converters/scripts/xml_to_cii2019.py::_rigid_weight_for_edge`
- `converters/scripts/xml_to_cii2019.py::_build_rigid_payload`

### 6.8 Negative controls

- stale prior override disagrees with current suggestion;
- duplicate engineering node numbers in different branches;
- one physical component split into multiple generated children;
- user presses `Use All Suggestions` at final popup;
- user manually edits one final weight;
- final review is skipped;
- component has a legitimate large weight on a short rigid.

The last case must remain valid: **large weight + short length is not itself a
defect**. The defect is wrong ownership, mapping, unit interpretation, or
conservation.

---

## 7. X004 — immutable Preview and weight evidence

The following XML element names are Owner-required and case-sensitive:

```xml
<preview>...</preview>
<RigidMatch1>...</RigidMatch1>
<Rigidmatch2>...</Rigidmatch2>
```

### 7.1 Freeze points

| Evidence | Freeze point |
|---|---|
| `<preview>` | immediately after Phase 4 Preview is finalized |
| `<RigidMatch1>` | immediately after Weight Match is finalized |
| `<Rigidmatch2>` | immediately after Finalise-and-Run popup is accepted/skipped, before later mutation/conversion |

A later stage may reference an earlier snapshot but shall never regenerate it
from mutated state.

### 7.2 Minimum Preview evidence

Retain the operator-visible row plus machine-readable provenance for:

```text
sourceId
branchOccurrenceId
raw Branchname
Line Key
From / To
Size / nominal bore
Piping Class + method/confidence
Material
Rating
Material Code
P1 / design pressure
Hydro/Test pressure
T1 / T2 / T3
Density
Wall thickness
Corrosion allowance
field-by-field authority source
```

### 7.3 Minimum RigidMatch evidence

For every reviewable physical component retain:

```text
componentOccurrenceId
physicalComponentGroupId
ComponentRefNo
Endpoint
component type
node display + real occurrence identity
bore/rating/length used for matching
source XML weight
pre-existing override, if any
candidate list shown
candidate method and score/basis
selected value
action taken
final accepted value
allocation to generated children
```

### 7.4 Digest chain

At minimum retain distinct digests for:

```text
source XML
branch selection
staged JSON
master/config
preview evidence
RigidMatch1 evidence
Rigidmatch2 evidence
JS engine-request XML
Python converter-parse XML
post-run enriched evidence XML
CII output
```

**Important:** the JS input passed to Pyodide and the post-Python-enrichment
XML handed to `_parse_xml_document` are not necessarily byte-identical. They
require separate digests and, for qualification, separately retainable
artifacts.

### 7.5 Schema safety

Do not place non-PSI116 evidence elements inside the exact engine-input XML
unless compatibility has been proven. The preferred qualification package is:

```text
schema-safe engine-input XML
+
hash-linked post-engine enriched-evidence XML containing ConversionEvidence
```

This preserves the requested enriched XML without contaminating the engine
contract.

---

## 8. X005 — Save Enriched XML ZIP

Add a dedicated user action:

```text
Save Enriched XML ZIP
```

The button packages already-frozen evidence. It shall not recompute Preview,
Weight Match, final popup decisions, or converter inputs after the run.

### 8.1 Per-source package

Recommended deterministic layout:

```text
<source-stem>/
  <source-stem>.source.xml
  <source-stem>.enriched-evidence.xml
  <source-stem>.engine-input.xml
  <source-stem>.converter-parse-input.xml
  <source-stem>.cii
  <source-stem>.diagnostics.json
  <source-stem>.topology.json
  <source-stem>.geometry-parity.json
  <source-stem>.weight-conservation.json
  <source-stem>.manifest.json
```

The manifest records filenames, byte sizes, digests, exact repository SHA,
runtime/build identity when available, branch selection, and qualification
status.

### 8.2 Mode A package

Mode A uses one directory per source plus one batch manifest:

```text
batch/
  source-A/...
  source-B/...
  source-C/...
  batch-manifest.json
```

No model merge, cross-file node offset, cross-file branch stitching, or
cross-file physical-component grouping is permitted.

---

## 9. X006 — exact GLRD qualification matrix

The GLRD benchmark is the governing acceptance case because it currently
exposes all major failure classes in one real source.

### 9.1 Coordinate matrix

Mandatory nodes:

```text
10, 760, 1200, 1640, 2080, 2520, 2960
```

No node may land at origin unless the qualified source occurrence is actually
at origin.

### 9.2 OD matrix

Mandatory element pairs:

```text
596→598
1036→1038
1476→1478
1916→1918
2356→2358
2796→2798
```

The output shall not contain 26.7 mm merely because a flange endpoint carries
that raw source value. Any retained 26.7 must be justified by a real
size-changing flow-path authority.

### 9.3 Bore/property matrix

At least one `=134234934/...` raw Branchname must be traced end to end. Raw
branch identity must survive even when process/piping-class authority is
inherited from a connected engineering line. NPS/inch values must not appear
as millimetres through unqualified staged data.

### 9.4 Weight matrix

Every reported suspect weight in the governing fix plan shall have a final
machine-readable trace:

```text
source physical component
→ review candidates
→ RigidMatch1 selection
→ Rigidmatch2 final action
→ physical component final mass
→ child allocation
→ kg→N scale
→ CII RIGID record
```

Model-level and physical-component-level conservation shall both be reported.

### 9.5 Restraints and generated-node custody

Qualification must also retain at least one real restraint trace and one
synthetic/generated-node trace. Generated IDs must never become anonymous
authority for source properties or component weight.

### 9.6 Provenance parity

The final qualification report shall identify the first divergent
representation for every failed row. It is not sufficient to compare only raw
XML and final CII.

---

## 10. X007 — Mode A real browser qualification

Source-level tests show Mode A capability exists, including multi-file input,
branch selection, per-source state and separate-source execution. That does
**not** yet prove the deployed browser is actually executing that route.

Qualification requires runtime evidence including, as applicable:

```text
repository SHA
build/deploy identity
loaded module URL and digest
visible Mode A multi-source controls
file input multiple=true
source inventory state
per-source branch selection state
zero-branch run blocking
source-switch state restoration
run loop source identity
per-source outputs
absence of mergedSourceText / cross-file graph construction
```

Hostile tests must include duplicate Branchname and duplicate NodeNumber values
across two different files. They are allowed as separate-model warnings but
must not create cross-file connections.

P1 is not closed by static regex/source tests alone.

---

## 11. X008 — independent exact-head release qualification

Before production authorization:

1. Rebase/qualify against the exact current `main` head.
2. Inspect the complete diff from the frozen executable baseline and from the
   previous qualified Work Pack.
3. Run the focused tests for every Work Pack.
4. Run the aggregate XML/InputXML → CII 2019 regression suite.
5. Run the GLRD benchmark through the real browser/runtime path.
6. Retain the evidence ZIP and digest manifest.
7. Independently spot-check at least:
   - Node 10 coordinate;
   - one repeated-node-number component;
   - one 26.7-mm flange case;
   - one reference-named branch bore/class case;
   - `478→480` weight;
   - `529→530` final popup provenance;
   - one restraint;
   - one Mode A two-source hostile case.
8. Confirm no unrelated converter modes regressed.
9. Record the exact qualified commit SHA.
10. Obtain explicit Owner production authorization.

A PR merge, CI green state, or agent self-certification is not production
authorization.

---

## 12. Owner decisions already established

These are governing decisions unless the Owner explicitly changes them:

1. **Occurrence identity outranks engineering NodeNumber for internal custody.**
2. **Raw source properties are evidence; effective CII properties require
   component/flow-path authority.**
3. **Raw reference-looking Branchname values are preserved.** Engineering
   inheritance must not rewrite source identity.
4. **Nominal-size units are explicit.** NPS/inch/DN/mm semantics may not be
   inferred from a naked number without a declared rule.
5. **Weight Review 1 and final popup Review 2 are separate immutable decisions.**
6. **Physical-component mass is conserved across generated/split CII children.**
7. **A large weight on a short rigid is not automatically wrong.** Mapping and
   conservation must prove the defect.
8. **Malformed/unknown engineering values fail closed.** Origin, zero OD, zero
   wall, default class, or default mass cannot be silently manufactured merely
   to keep conversion running.
9. **Engine-request XML and converter-parse XML are separately hashable facts.**
10. **Mode A is separate-model batch execution.** No cross-file merge or node
    offset scheme is authorized.
11. **Evidence snapshots are frozen at lifecycle boundaries and never
    regenerated from later state.**
12. **Do not change several mechanics at once.** Each Work Pack must retain
    negative controls that prove which mechanism changed.

---

## 13. Agent authority and takeover rules

No new agent receives implementation or merge authority from a generic claim
of XML, JavaScript, Python, CAESAR, or piping expertise.

The mandatory expert qualification gate in
`InputxmltoCII2019Fixplan.md` remains in force. Repository-specific answers
must identify real files/functions, real GLRD traces, focused tests, negative
controls, expected artifacts, and what the evidence still does not prove.

Authority should progress conservatively:

```text
READ_ONLY_REPOSITORY_INSPECTION_ALLOWED
→ REPOSITORY_TRACE_EXERCISES_ALLOWED
→ LIMITED_WORK_PACK_IMPLEMENTATION_ALLOWED
→ EXACT_HEAD_QUALIFICATION_ALLOWED
→ OWNER_MERGE / PRODUCTION_AUTHORIZATION
```

Passing one Work Pack does not grant unrestricted authority over later phases.

---

## 14. Status update rules

Update this roadmap after every merged Work Pack or Owner decision.

Every update should record:

```text
mission / issue / PR
exact merged SHA
phase status change
benchmark evidence produced
newly discovered defects
known limitations still open
next authorized mission
```

Do not mark a phase Done based on:

- code search showing a function exists;
- source-text/regex tests alone;
- a screenshot without build/SHA identity;
- a hand reconstruction that did not execute the repository path;
- a PR description saying a test passed;
- a generated report that cannot be tied by digest to the exact engine input;
- numerical agreement obtained by changing unrelated defaults or tolerances.

---

## 15. Immediate next action

**X001 — Coordinate/topology custody is the next authorized implementation
scope after this roadmap is accepted.**

The first implementation should close the coordinate/origin failure with the
smallest possible patch set and produce the seven-node GLRD trace before any
OD/bore or weight code is changed.

After X001 evidence is accepted, proceed to X002. Do not start X002–X005 in
parallel merely to accelerate the schedule; these phases deliberately depend
on a stable identity/topology contract from X001.
