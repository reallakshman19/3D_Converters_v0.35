# FBX-PREVIEW-001 — selected-zone polygon wireframe

## Problem

The pre-analysis FBX source-graph preview is intentionally a bounded point cloud.
It has no polygon topology and reports:

```text
adapter: FbxSourceGraphPointPreview
points: sampled source points
segments: 0
```

This is useful for selecting a zone, but it does not display the accepted mesh
shape after exact geometry analysis.

## Corrective preview path

After `Analyse zone geometry` succeeds, the preview overlays polygon perimeter
edges derived from the already validated `FbxGeometryBundle.v1` selection:

```text
control-points-mm
polygon-offsets
polygon-vertex-indices
accepted occurrence geometryMatrixMm
→ FbxZoneGeometryWireframePreview.v1
→ preview line overlay
```

The wireframe is visualization only. It does not modify source, topology,
boundary-loop, PIPE-inference, connectivity, mapping, or StagedJSON evidence.

## Edge rules

- Empty and one-point polygons emit no segment.
- Two-point polygons emit one segment.
- Polygons with three or more vertices emit their closed perimeter edges.
- No diagonals or triangles are invented.
- No points are connected across polygon boundaries.
- No coordinate snapping, averaging, healing, or topology rewriting occurs.
- Every endpoint is transformed through the accepted occurrence matrix.

Geometry and occurrence traversal are sorted by numeric identity. Polygon and
polygon-vertex order remain the exact accepted order.

## Resource boundary

The preview displays at most 250,000 polygon-edge occurrences. When the source
edge count exceeds this boundary, one deterministic global stride is applied:

```text
stride = ceil(source edge count / 250000)
```

Metadata reports displayed and source segment counts. This limit affects only
visualization and never changes the complete geometry evidence.

## Classification independence

A selected zone may contain valid polygon geometry but no admitted open-boundary
loops. In that case:

```text
wireframe preview: available
geometry evidence: available
PIPE-only release: BLOCKED_AUTO_PIPE_CLASSIFICATION
StagedJSON: blocked
```

The visible wireframe therefore does not imply that the zone qualifies as PIPE.
