# FBX selected-zone geometry diagnostic ledger (Phase 5)

`contracts/fbx/fbx-selected-zone-diagnostic-ledger.v1.schema.json` —
`FbxSelectedZoneDiagnosticLedger.v1`.

## What this explains

`buildSelectedZoneDiagnosticLedger` classifies every geometry already
present in the Phase 1 `FbxSelectedZoneGeometryManifest.v1` into exactly
one governed disposition, using a self-contained mesh-topology graph
analysis (`mesh-topology-classifier.js`) over the polygon buffers:

- `CLOSED` — watertight, single shell, zero boundary edges.
- `CAPPED` — single shell with exactly two boundary loops (the
  open-ended-tube pattern, e.g. an uncapped pipe run with two rim loops).
- `MERGED` — single shell with exactly one boundary loop (a single open
  seam/slit rather than two separate rims).
- `MULTI_SHELL` — watertight but more than one connected component.
- `INVALID_TOPOLOGY` — empty geometry, a degenerate (point/line) polygon,
  or a non-manifold edge (shared by more than two polygons).
- `OTHER_GOVERNED` — any topology outside the above (irregular boundary,
  multiple shells that also carry boundary edges, or any other boundary
  loop count). This is the explicit catch-all so no geometry is ever left
  unexplained.

## Coverage requirement

The ledger must contain exactly one entry per manifest geometry — a
geometry the ledger cannot explain is treated as a hard defect
(`ZONE_PACKAGE_UNEXPLAINED_GEOMETRY`), not a silent omission.
`summary.countsByDisposition` sums to `summary.totalGeometries` by
construction.

## Non-scope

This diagnostic is read-only over an already-selected geometry set. It
does not widen `FbxAutoPipeProfile.v1` admission, does not reclassify
anything as a PIPE, and carries no support/host semantics.

## Known gap

This has been exercised against small synthetic fixtures
(`tests/fbx/zone-package-fixtures.mjs`) covering every disposition, not
against the real TAY-A source model referenced in the original plan
(~389 selected geometries). The real TAY-A `.fbx` binary is hosted on
Google Drive and was not fetched into this environment, so no TAY-A
geometry count is claimed here.
