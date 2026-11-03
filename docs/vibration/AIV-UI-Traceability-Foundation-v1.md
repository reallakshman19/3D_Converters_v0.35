# AIV UI Traceability Foundation v1

Status: **BLOCKED QUALIFICATION WORKSPACE — NO SCREENING OR DESIGN AUTHORITY**

## Purpose

This slice establishes the read-only AIV product foundation for `VIB.AIV.ACOUSTIC` while the engineering method remains blocked under issue #441.

It deliberately adds **no AIV numerical kernel, equation, threshold, PWL, attenuation, LOF or pass/safe logic**.

## Controlled evidence pins

### EI worked-example evidence

Repository: `reallaksh19/Common`

Pinned revision reviewed for this slice:

```text
commit: fb549185b9b27edc2379734240320a85c5bef9f6
file: Energy-Institute-AVIFF---Worked-Examples.doc.docx
blob: ceee15ed5f7f320045d5f3979024e2e8664613f2
```

The AIV qualification workspace records D.2.3 coverage dimensions without promoting them into screening authority. The controlled example covers the non-sonic source branch (`SFF = 0`), gauge-to-absolute pressure treatment, low-noise-trim example behavior, the 155 dB branch, downstream discontinuity attenuation and a T2-6 weldolet assessment chain. Sonic `SFF = 6` and multiple simultaneous-source behavior remain explicit qualification gaps requiring independent benchmark evidence.

### Advanced_Analysis visual lineage

Repository: `reallaksh19/Advanced_Analysis`

Pinned visual source revision:

```text
commit: 6463b39866f68eb6476bfa41764538eb19f8b9f9
source: src/workspace/sequential-sketcher/svg-symbol-factory.js
```

Only the engineering **symbol language** is adapted. The downstream AIV UI does not import the Advanced_Analysis runtime.

## Permanent product boundary

Issue #441 remains authoritative:

```text
Advanced_Analysis
  AUTHOR / EDIT / VALIDATE / CERTIFY / EXPORT
        |
        | TopologyEditTableHumanExport.v1
        v
3D_Converters / Vibration Integrity
  IMPORT / VERIFY / JOIN / ASSESS / EXPLAIN
```

The AIV product does not add:

- a 3D viewer;
- a free-form model/topology canvas;
- coordinate projection (ISO/XY/XZ/YZ);
- geometry editing;
- click-on-model calculation selection;
- Advanced_Analysis `WorkspaceState`, `EventBus` or `SequentialCommandGateway` dependencies.

SVG use is restricted to small inline table glyphs for recognizable pipe/device/discontinuity identity.

## Certified topology projection

`converters/vibration/topology/graph.js` consumes only the already parsed vibration exchange fields:

```text
elements
connections
authority
```

The graph preserves `Canonical ID` as the downstream identity and builds deterministic adjacency from certified `Node ID` membership.

The path resolver returns one of:

```text
RESOLVED
IDENTITY_NOT_FOUND
NO_PATH
AMBIGUOUS_SHORTEST_PATH
```

Ambiguous paths fail closed. The UI does not silently select the first/nearest branch.

## Distance rule

The visualization layer intentionally returns:

```text
physicalDistanceMm = null
distanceStatus = NOT_DERIVED_BY_TOPOLOGY_VIEW
```

Even when connected pipe rows contain declared lengths.

This prevents the SVG/table projection from inventing the EI AIV source-to-assessment distance rule before that rule is frozen in the AIV engineering method specification. Physical distance must eventually come from the qualified AIV resolver and its explicit provenance, not SVG pixels or presentation topology.

## AIV topology view model

`AivTopologyViewModel.v1` preserves:

```text
methodId
sourceCanonicalId
assessmentCanonicalId
pathStatus
shortestPathCount
shortestHopCount
rows
topologyAuthority
diagnostics
authority
```

Each resolved row carries:

```text
sequence
canonicalId
tag
type
line
declaredLengthMm
role
roleLabel
sourceStatus
catalogueAuthority
```

Roles are presentation/evidence semantics only:

```text
SOURCE
PROPAGATION_PATH
ASSESSMENT
SOURCE_AND_ASSESSMENT
```

## BLOCKED qualification workspace

Selecting `VIB.AIV.ACOUSTIC` opens a qualification workspace instead of the generic calculator form.

It displays:

- issue #441 authority boundary;
- pinned EI worked-example evidence;
- pinned Advanced_Analysis visual lineage;
- table-first SVG adaptation rules;
- D.2.3 covered/gap matrix;
- permanent UI boundary.

It deliberately exposes no:

```text
Calculate
Run AIV benchmark
Run AIV screening
qualification-mode selector
AIV numerical output
```

The registered definition remains:

```text
calculationState      = BLOCKED
qualificationState    = BLOCKED
engineeringAuthority  = NONE
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
```

## Traceability and quality targets

These are implementation scorecard targets, not confidence probabilities:

```text
Traceability                         >= 97%
Engineering/software quality         >= 95%
UI engineering explainability        >= 95%
Critical trace gaps                  = 0 before screening promotion
Anonymous engineering constants      = 0
Silent defaults                       = 0
UI-side AIV equations                 = 0
Accepted ambiguous source mappings    = 0
```

The percentages cannot by themselves promote method authority. Issue #441 qualification checkpoints and independent vibration-engineer review remain required.

## Next slice

The next implementation should qualify and freeze the canonical AIV data/readiness contract before numerical execution is enabled:

1. source-device and assessment-point enrichment schema;
2. operating-case pressure-basis/provenance rules;
3. AIV applicability resolver;
4. qualified physical source-to-assessment distance rule;
5. EI D.2.3 benchmark fixture with published inputs/intermediates/finals and justified rounding tolerance;
6. independent sonic and multi-source benchmarks;
7. readiness table that stops before numerical execution.
