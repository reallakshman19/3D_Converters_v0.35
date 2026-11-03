# Topology Parity Architecture — Audit and Gap Matrix

## Scope and baselines

This audit covers the topology-only chain:

```text
Managed source JSON
  -> ComponentTopologySourceModel.v1
  -> explicit connectivity
  -> engineering projection
  -> CanonicalTopology.v1
       -> TopologyTraceLedger.v1
       -> topology InputXML
       -> TopologySvgScene.v1
       -> TopologyParityReport.v1
```

Repository baselines inspected before production modification:

- `reallaksh19/3D_Converters@a77b3944fdf585e7e522ca072cd9bdf3fb01b98d`
- `reallaksh19/XML_Compare_Utilities@8b92827e821264f7949ddd2c1c455c6b18012ce3`
- PR #160 is merged and is the support-projection baseline.
- InputXML schema and InputXML-to-CII assurance are owned separately by Agent IXSD-00. This work does not modify the canonical InputXML compiler, XSD/Schematron policy, or `inputxml_to_cii2019.py`.

## Current producer path

```text
topology-source-model.js
  -> topology-connectivity.js
  -> topology-engineering-projection.js
  -> topology-canonical-builder.js
  -> topology-ledger-builder.js
  -> topology-inputxml-writer.js
  -> topology-artifact-exporter.js
```

The topology InputXML writer already consumes `CanonicalTopology.v1`; it does not rebuild route continuity. The remaining producer gaps concern identity completeness, deterministic artifact hashes, scene generation, round-trip parsing, and exact parity enforcement.

## Current validator path

```text
topology-source-reader.js
  + topology-artifact-reader.js
  + topology-independent-validator.js
  -> topology-svg-view-model.js
  -> topology-svg-renderer.js
```

The current validator is read-only and performs useful lineage, vector, degree, and component checks. However, its topology-bearing SVG view model consumes raw source geometry together with canonical artifacts. There is no producer-owned `TopologySvgScene.v1`, no `ParsedInputXmlTopology.v1`, and no exact three-way parity report.

## Gap matrix

| ID | Requirement | Current 3D_Converters state | Current XML_Compare_Utilities state | Gap / risk | Owner module | Severity | Planned evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TP-001 | `CanonicalTopology.v1` is sole topology authority | Canonical builder owns route edges, support splits, junctions, boundaries and rigid assignments | SVG view model also reads source component positions | Topology-bearing source geometry can diverge from canonical topology | producer scene builder; validator scene view model | BLOCKING | static import guard and scene-only renderer test |
| TP-002 | Every InputXML element retains canonical endpoint identity | Writer emits `CANONICAL_EDGE_ID` but not canonical FROM/TO node IDs | Reader primarily relies on ledger mappings and numeric node IDs | Exact incidence cannot be proven from InputXML alone | topology InputXML trace-attribute owner | BLOCKING | parser test with reversed canonical incidence |
| TP-003 | InputXML retains complete source and merge ancestry | Writer emits source entity IDs only | Reader does not expose source ports, branch IDs, cardinality or merge authority as normalized fields | MANY_TO_ONE and branch ancestry cannot be compared exactly | trace-attribute owner and parser | HIGH | merge/cardinality fixture |
| TP-004 | Deterministic canonical topology hash | No canonical artifact hash | Controller hashes loaded browser read models only | Cross-artifact authority and staleness cannot be proven | deterministic hash module | BLOCKING | byte/order determinism tests |
| TP-005 | `TopologySvgScene.v1` | Not implemented | `TopologySvgViewModel.v1` is built directly from source/canonical/ledger | No source-neutral scene contract; renderer can receive noncanonical topology | scene builder | BLOCKING | schema and source-import guard tests |
| TP-006 | SVG world coordinates preserved before screen projection | Canonical positions exist in millimetres | View model calculates projected positions, but no producer scene hash or world-geometry contract exists | Screen projection and topology evidence are insufficiently separated | scene builder and scene reader | BLOCKING | world-coordinate equality tests |
| TP-007 | `ParsedInputXmlTopology.v1` reconstructed only from generated XML | Not implemented | Existing regex reader returns element rows, deltas and children but not a normalized graph | Missing identities can be masked by ledger-assisted validation | InputXML topology parser | BLOCKING | missing-identity and malformed-identity tests |
| TP-008 | Exact canonical/InputXML edge population parity | Producer metrics assume `canonical.edges.length` equals InputXML elements | Validator checks ancestry/orphans but not exact canonical-edge identity sets | Missing and additional topology elements are not reported with required categories | parity engine | BLOCKING | missing/extra element tests |
| TP-009 | Exact canonical/SVG edge population parity | No scene artifact | Current SVG derives visible slices and may omit CREF edges by UI state | Display filtering is conflated with topology population | scene builder; parity engine | BLOCKING | missing/extra SVG edge tests |
| TP-010 | Exact node population and incidence parity | Canonical nodes contain InputXML node IDs | Existing validator checks degree and connected components | Degree equality does not prove exact incidence or direction | parity engine | BLOCKING | reversed FROM/TO and incidence tests |
| TP-011 | Coordinate comparison uses writer precision only | Writer uses 3 decimals for globals and 6 for deltas | Existing validator uses a general 0.5 mm vector tolerance | A large tolerance can conceal serialization mismatches | normalization contract and parity engine | BLOCKING | one-unit-in-last-place mismatch tests |
| TP-012 | Support identity and attachment parity | Canonical support contains projected node, source datum, residual and authority | Existing reader treats RESTRAINT as a generic child; SVG has no canonical support scene collection | Wrong-node restraint or missing support symbol is not compared three ways | parser, scene builder and parity engine | BLOCKING | explicit-carrier and wrong-node tests |
| TP-013 | Deferred attachment remains accepted and non-topology-bearing | PR #160 correctly emits ledger-only `DEFER_SUPPORT` | Current spatial view derives support markers from source search/component symbols | Deferred marker classification is not represented by a scene contract | scene builder and renderer | HIGH | `=1006649732/53464` benchmark assertions |
| TP-014 | Rigid-to-edge assignment parity | Canonical rigid records retain edge ID and residual | InputXML RIGID child lacks complete canonical assignment attributes; SVG lacks rigid scene overlay | Wrong-edge rigid cannot be identified deterministically | trace attrs, parser, scene and parity engine | BLOCKING | wrong-edge rigid test |
| TP-015 | TEE/OLET graph participation parity | Canonical junction carries node and expected degree | Existing validator checks canonical degree; InputXML comparison is indirect | Participating edge sets and SVG junction symbol are not compared exactly | scene builder and parity engine | BLOCKING | TEE/OLET participation tests |
| TP-016 | Boundary parity | Canonical boundaries are explicit | Validator displays boundaries; InputXML terminal relationship comparison is not formalized | Missing or synthetic boundary representation may pass general graph checks | parser and parity engine | HIGH | external-boundary fixture |
| TP-017 | Point-feature disposition parity | Point features are explicit and excluded from route edges | SVG can render point features, but no scene/report disposition contract exists | Point objects may be mistaken for missing route elements | scene builder and parity engine | HIGH | point-only component fixture |
| TP-018 | Legal merge cardinality is ledger-authoritative | Canonical edge records retain cardinality and merge authority | Existing component checks identify some unexplained merge/split conditions | Three-way comparison does not use ledger cardinality as the exact expected population rule | parity engine | BLOCKING | exact duplicate and auto-pipe merge tests |
| TP-019 | No silent topology repair | Producer throws on missing endpoints and invalid supports | Validator is read-only, but existing validation can use ledger to reconcile missing XML identity | Missing XML identity must be an explicit mismatch, never inferred | parser and parity engine | BLOCKING | missing canonical-ID test |
| TP-020 | Required SVG semantic identity attributes | Renderer includes partial canonical/source attributes | Missing endpoint IDs, world coordinates, branch, ports, cardinality and operation attributes | DOM selection cannot prove complete traceability | scene renderer | HIGH | markup contract test |
| TP-021 | Required SVG layer groups | Current renderer uses CSS classes and one content group | Named engineering layers are absent | Layer ownership and selective highlighting are not deterministic | scene renderer | MEDIUM | static layer list test |
| TP-022 | ISO, XY, XZ and YZ projections | XY/XZ/YZ/3D exist | ISO is absent | Required engineering projection mode missing | projection helper and controller | MEDIUM | projection fixture |
| TP-023 | Parity status and staleness lifecycle | No parity report | Controller invalidates validation on load but has no `NOT_RUN/RUNNING/PASS/FAIL/STALE` contract | Users can view outdated parity without an explicit stale state | controller and parity panel | BLOCKING | hash-change staleness test |
| TP-024 | Mismatch evidence and synchronized focus | Existing issue selection links source/canonical/ledger/InputXML objects | No three-way mismatch records or scene-specific identities | Required exact expected/actual evidence and owner module are unavailable | parity report, selection model and UI | HIGH | mismatch-selection browser test |
| TP-025 | Required export set | Producer exports three artifacts | Validator offers InputXML download only | Scene, parsed graph, parity JSON/CSV and topology SVG are missing | artifact exporter and UI downloads | HIGH | output-name and download tests |
| TP-026 | Conversion/topology success is fail-closed on parity | Producer returns artifacts without round-trip parity | Validator reports findings but conversion can still be described as successful | Topology divergence is not a hard gate | artifact orchestrator | BLOCKING | mutation test must throw/fail gate |
| TP-027 | Real `1885_NC` parity | Support policy fixture is green | Existing validator benchmark predates scene/parity contracts | No proof that canonical, InputXML and SVG use identical topology | cross-repository benchmark tests | BLOCKING | zero-mismatch benchmark |
| TP-028 | ASIM-1835 compatibility | Existing producer artifact test exists | Existing validator test exists | New hashes, scene and parity contracts require compatibility proof | cross-repository benchmark tests | HIGH | zero-mismatch compatibility test |

## Preserved support contracts

### Deferred floor/fence opening attachment

Source reference `=1006649732/53464` remains:

```text
primaryDisposition     = DEFER_SUPPORT
projectionCardinality = DEFERRED
lossClassification    = DEFERRED_NON_RESTRAINT_ATTACHMENT
status                = ACCEPTED
```

It remains ledger- and scene-traceable but creates no canonical support node, PIPINGELEMENT or RESTRAINT.

### Referenced stress support

`PS02705.1` resolves explicit carrier `=1006649732/54494`. Its source datum, projected attachment position, residual, reference and authority remain immutable evidence. The canonical attachment node is the authority used by both InputXML and the SVG scene.

## Implementation boundaries

- No production changes to `inputxml_to_cii2019.py`.
- No modification of IXSD XSD/Schematron, canonical compiler, dialect registry or conversion-assurance ledger.
- Topology metadata serialization is isolated in one owner module so IXSD can later prescribe namespace placement without changing topology construction.
- The SVG renderer may project, style, label, pan, zoom and select. It may not construct continuity, choose carrier edges, infer junction participation or mutate world topology.
