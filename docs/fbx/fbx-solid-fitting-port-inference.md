# FBX solid-fitting PIPE port inference (closed-solid generalization)

`tabs/model-converters/converters/fbx/solid-fitting-ports/` —
`FbxSolidFittingPortEvidence.v1` (contract:
`contracts/fbx/fbx-solid-fitting-port-evidence.v1.schema.json`).

## What this explains

The existing `auto-pipe` classifier only admits a straight PIPE when it finds
exactly two open polygon-boundary loops on one shell
(`auto-pipe/classify.js`). A watertight, fully capped solid (zero boundary
edges) has no boundary loops at all, so it is unconditionally blocked
(`BOUNDARY_COUNT`) regardless of its actual shape.

This module derives PIPE (and other governed two/three-port fitting)
candidates directly from **capped-solid geometry**, without requiring any
open polygon boundary, by finding genuinely flat terminal disc regions on a
watertight shell and classifying the relationship between them:

1. Decode exact topology (`zone-geometry/polygon-topology.js`, reused
   unmodified) and derive connected shells
   (`zone-geometry/shells.js`, reused unmodified). Exactly one manifold shell
   is required; anything else is rejected (`MULTIPLE_SHELLS`,
   `NON_MANIFOLD_SHELL`, `NON_MANIFOLD_EDGE`, `AMBIGUOUS_EDGE_INCIDENCE`).
2. Project a normal and centroid onto every face
   (`topology-projection.js`).
3. Group adjacent faces into flat regions by normal similarity
   (`cap-clustering.js`): two faces sharing an edge join the same region only
   when their normals are near-identical (`planarJoinDotTolerance: 0.999`).
   A genuinely flat disc (fan-triangulated or a single N-gon) joins into one
   region; a curved or faceted wall does not (adjacent wall facets differ by
   a real angle).
4. For each region, trace the ring of edges separating it from the rest of
   the shell (a manifold-internal edge loop, not an open boundary loop) and
   fit a circle to that ring using the **existing** deterministic circle-fit
   and world-transform primitives
   (`zone-geometry/circle-fit.js:fitBoundaryCircleLocal`,
   `zone-geometry/occurrence-transform.js:transformBoundaryFit`, both reused
   unmodified). A rectangle's four corners lie exactly on a circle, so
   circularity alone cannot separate a real disc-shaped cap from an
   elongated wall-facet quad; `candidate-evaluation.js` additionally checks
   the ring's enclosed area against its fitted circle's area
   (`minimumRegionAreaRatio: 0.75`) — a real N-gon disc fills most of its
   circumscribed circle, an elongated rectangle fills only a small fraction.
5. Classify the admitted ports by count and relationship
   (`port-topology-disposition.js`): two anti-parallel, similar-radius ports
   with ordinary span → `STRAIGHT_TWO_PORT` (pipe-eligible); two
   non-anti-parallel ports → `BENT_TWO_PORT` (elbow-shaped); two anti-parallel
   but differing-radius ports → `TAPERED_TWO_PORT` (reducer-shaped); two
   anti-parallel, similar-radius ports with short span relative to radius →
   `SHORT_TWO_PORT` (valve/flange-shaped); three ports → `THREE_PORT`
   (tee-shaped); anything else → rejected (`ZERO_OR_ONE_PORT`,
   `FOUR_PLUS_PORT`).
6. For `STRAIGHT_TWO_PORT` occurrences only, `classifier.js` reuses the
   **exact same** admission gate the existing open-boundary classifier uses —
   `assignRoles`/`radiusMatches`/`cylinderResiduals`, extracted verbatim into
   a new shared module `auto-pipe/pipe-admission-gates.js` — so a closed-solid
   PIPE is held to the identical strictness as an open-boundary PIPE. A
   passing occurrence is wrapped in the same classification shape as the
   existing classifier (`admitted`, `status: 'PIPE_INFERENCE_PASS'`, `A`,
   `L`, `axis`, `spanMm`), plus an added `inferenceMethod:
   'CLOSED_SOLID_CYLINDER'` field for provenance.

## What is delivered and verified

- The full kernel above, verified end-to-end against a synthetic watertight
  8-sided prism fixture (`tests/fbx/solid-fitting-port-fixtures.mjs:
  prismGeometry`): both flat caps are correctly admitted as ports, all eight
  elongated side-wall quads are correctly rejected by the area-ratio check
  (not just circularity), the occurrence is classified `STRAIGHT_TWO_PORT`,
  and the shared admission gate produces a real `PIPE_INFERENCE_PASS` with
  the correct axis, span, and radii (`test-solid-fitting-port-kernel.mjs`).
- All six port-topology-disposition boundaries exercised directly
  (`test-solid-fitting-port-disposition.mjs`).
- Negative topology cases verified: two disjoint watertight solids bound to
  one occurrence (`MULTIPLE_SHELLS`, never merged into one component); a
  degenerate two-vertex polygon (rejected, not a crash); a single watertight
  tetrahedron (every triangular face correctly rejected as non-disc-shaped,
  never admitted as a pipe) (`test-solid-fitting-port-negative.mjs`).
- `FbxSolidFittingPortEvidence.v1` contract schema, self-validated against a
  real generated evidence artifact via the existing Python
  `jsonschema.Draft202012Validator` pattern
  (`test-solid-fitting-port-evidence-contract.mjs`).
- Feature-scoped static guards confirming both inference paths share one
  admission-gate implementation and one circle-fit/transform implementation,
  never a duplicate (`test-solid-fitting-port-static-guards.mjs`).
- Zero regressions: the full existing `tests/fbx/run-all.mjs` suite (as of
  this change, with the repo's own documented Python schema-validator
  dependencies installed per `scripts/fbx/schema-validator-requirements.txt`)
  passes with no change to any pre-existing test's outcome.
- **Router integration is now live.** `auto-pipe/classify.js`'s
  `classifySelectedPipes()` tries the existing open-boundary classifier
  first; only when it structurally cannot apply (`BOUNDARY_COUNT` — never on
  `SHELL_COUNT`/`ROLE_ASSIGNMENT`/`RADIUS_MISMATCH`/`CYLINDER_RESIDUAL`, which
  are hard rejections) does it consult `classifySolidFittingPipeOccurrence`
  for the same occurrence. `zone-geometry/analyse-zone.js` now builds
  `closedSolidPipeEvidence` via `buildSolidFittingPortEvidence` alongside the
  existing derived-port evidence and passes both into `runFbxAutoPipe`, so a
  genuinely closed-solid straight pipe in a real selected zone now reaches
  `STAGEDJSON_PASS` end-to-end, verified with a real (non-mocked)
  `buildDerivedPortEvidence` + `buildSolidFittingPortEvidence` +
  `runFbxAutoPipe` run (`test-auto-pipe-closed-solid-router.mjs`), plus a
  priority test confirming open-boundary always wins when it structurally
  applies at all (`test-auto-pipe-router-priority.mjs`).
  `contracts/fbx/fbx-internal-pipe-mapping.v1.schema.json`'s `boundaryLoopId`
  and `sourcePortEvidenceId` patterns are now widened (`oneOf`) to accept a
  `cap-ring:` origin alongside the existing `boundary-loop:`/`port-evidence:`
  origins, self-validated against a real `buildInternalPipeMapping()` output
  carrying a `cap-ring:` id (`test-internal-pipe-mapping-cap-ring-contract.mjs`).

## Real-source qualification findings (STF/GLRD, `Benchmarks/FBX2/`)

The user pointed at a real PDMS/E3D-exported stress-analysis FBX source
(`STF_2026Jul23-1554_ASCII.fbx` / `_binary.fbx`, 2,052 `Model` nodes) with a
reference structural output (`ATTRIBUTE_GL_managed_stage.json`) as
qualification data, in place of the originally-planned TAYA source (which
remains unavailable in this environment). Direct inspection of both files,
and running this kernel against real occurrences parsed from the actual
binary, produced findings that materially scope what remains:

- **The reference output is not produced by the FBX pipeline at all.** It
  matches the shape of the existing, separate
  `converters/inputxml-managed-stage/InputXmlDirectManagedStageBuilder.js`,
  which consumes InputXML (a PDMS database export already carrying
  engineering fields like `SPRE`/`ARRI`/`LEAV`/`DTXR`/`MTXX` as literal
  data). The FBX source embeds **none** of these fields. Full attribute
  parity with that reference file is out of scope for this pipeline and
  requires a catalog/spec-attribute system this repo does not have.
- **Every `PIPE` node in the reference is `AUTO_GENERATED_PIPE: true`** —
  pipe-run positions there are simple gap-fill arithmetic between adjacent
  named fittings, not derived from mesh geometry at all.
- **Real `ELBOW`-named occurrences are `NON_MANIFOLD_SHELL` /
  `NON_MANIFOLD_EDGE`** under this kernel's exact-topology decode. This
  matches a documented, anticipated gap: real FBX exporters duplicate
  geometrically coincident vertices at seams (UV/material/smoothing-group
  boundaries), which this kernel does not yet weld back together before
  shell analysis. A position-based vertex-equivalence merge step (matching
  the original design's `EXACT_POSITION`/`SCALED_POSITION_TOLERANCE`
  intent) is required before real elbow geometry can be analyzed, and is
  **not yet implemented**.
- **Real `TEE`/`VALVE`/`FLANGE`/`REDUCER`-named occurrences, and even plain
  `Cylinder`-named occurrences, are consistently `MULTIPLE_SHELLS`** in this
  source — their bound geometry resolves to more than one connected
  component per occurrence, most likely because the exporter shares or
  batches instanced primitive geometry across many occurrences rather than
  emitting one clean single-shell mesh per component. This kernel's
  single-shell-only requirement (matching the original spec's stated
  intent: never merge two solids into one component) correctly and safely
  rejects these rather than guess, but means **none of the sampled real
  fittings from this specific source currently qualify** for automatic
  port derivation without further work to disambiguate which shell within
  a multi-shell geometry belongs to a given occurrence.

These findings were obtained by actually parsing the real
`STF_2026Jul23-1554_binary.fbx` file and running this kernel's
`buildSolidFittingPortEvidence` against sampled real occurrences of each
named family — not assumed. They are recorded here rather than silently
smoothed over, per the same convention already established by
`docs/fbx/fbx-selected-zone-diagnostic-ledger.md`'s "Known gap" section.

**Practical consequence of router integration on real sources:** with the
router now live, a zone whose selected occurrence is a genuinely single-shell,
seam-clean watertight solid will now be rescued and admitted as a PIPE. A zone
like `/GLRD-1000-FL-3"-G4110001-900#-01` (a real flange-family occurrence
observed in production logs, blocked with `BLOCKED_AUTO_PIPE_CLASSIFICATION`)
is **not** rescued by this change alone — its geometry resolves to
`MULTIPLE_SHELLS` under this kernel's exact-topology decode (consistent with
the FLANGE-family finding above), which the multi-shell disambiguation work
below would need to address first.

## Explicitly deferred / not delivered

- **Vertex-equivalence welding** for seam-duplicated real geometry (needed
  before ELBOW-family real occurrences can be analyzed).
- **Multi-shell disambiguation** for instanced/batched geometry resolving to
  more than one shell per occurrence (needed before TEE/VALVE/FLANGE/REDUCER/
  Cylinder-family real occurrences in this specific source can be analyzed).
- **BRANCH-hierarchy reconstruction** from the `"<TYPE> N of BRANCH M of PIPE
  ID"` name convention, and the branch-route connectivity + PIPE gap-fill
  layer described in the original plan — not built in this increment.
  `mapping-heuristic.js`'s existing keyword table is the natural starting
  point but does not yet parse the nesting structure into a tree.
- **Catalog/spec attribute enrichment** and full parity with
  `ATTRIBUTE_GL_managed_stage.json` — out of scope; no catalog database
  exists in this repo.
- **A formal signed-off precision/recall truth set** and **public
  deployment certification** — out of scope for this session; the real-
  source findings above substitute honest structural qualification evidence
  for a formal truth set, with the limitations stated plainly.
