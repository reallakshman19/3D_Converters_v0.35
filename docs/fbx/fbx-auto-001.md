# FBX-AUTO-001 — selected-zone geometry and derived boundary-port evidence

## Authority boundary

The implementation consumes the accepted `FbxGeometryBundle.v1` produced from the exact FBX bytes and accepted parser provenance. The complete bundle is validated before any selected-zone filtering. Preview point samples, renderer buffers, names, materials and visual output are not topology authority.

The evidence chain is:

```text
exact FBX bytes
→ accepted parser identity
→ canonical FbxSourceGraph.v2 SHA-256
→ validated FbxGeometryBundle.v1 and buffer digests
→ independently derived selected-zone scope
→ FbxZoneGeometryEvidence.v1
→ exact polygon boundary derivation
→ FbxDerivedPortEvidence.v1
```

No parser/WASM, `FbxSourceGraph.v2`, `FbxGeometryBundle.v1`, mapping, connectivity, StagedJSON writer or converter-route semantic is changed.

## Zone scope

Zone membership is independently recomputed from source-graph occurrence ancestry using the same hierarchy rule represented by preview zone IDs. Only selected occurrences that reference accepted mesh geometry enter topology evidence. Strict ancestors are retained only as ordered identity evidence. Geometry referenced by a selected occurrence is retained even when it is shared with sibling zones; sibling owners are recorded explicitly. Geometry referenced exclusively by sibling zones is excluded.

The unowned preview zone is blocked because it has no accepted occurrence transform and this mission permits no hidden identity transform fallback.

## Zone geometry evidence

`FbxZoneGeometryEvidence.v1` binds:

- source byte SHA-256, byte length and FBX version;
- parser provenance identity;
- canonical source-graph SHA-256;
- accepted geometry-bundle digest;
- selected zone ID and label;
- ordered selected occurrence, ancestor and geometry identities;
- occurrence transform evidence;
- complete selected geometry descriptors;
- the exact three accepted topology-buffer descriptors and SHA-256 values per geometry;
- millimetre coordinate authority and conservation counts.

The artifact ID is a domain-separated SHA-256 over canonical JSON with the ID omitted. Binary topology buffers are not expanded into JSON arrays.

## Boundary derivation

Polygon offsets and polygon-vertex indices are decoded from the validated binary buffers. Undirected edges use `[minVertexIndex, maxVertexIndex]`. An eligible boundary edge has one distinct incident polygon and one directed occurrence. Repeated same-face incidence, self-edges and edges with more than two incident polygons are rejected.

Face shells are connected through shared undirected edges. Shell identity hashes the geometry identity, canonical face-signature multiset and edge-incidence evidence. Boundary components are admitted structurally only when they are connected closed cycles with at least three vertices, every vertex has degree two, and directed face winding supplies exactly one incoming and one outgoing boundary edge at every vertex.

The canonical loop walk starts at the smallest vertex index and chooses the lexicographically smaller of the two undirected traversals. A separate winding-preserving walk supplies normal orientation. Discovery order, polygon order, face-cycle start and traversal direction do not affect shell or loop identity.

## Fit and transform rule

Local control points are fitted using a fixed-sweep symmetric 3×3 Jacobi eigensolver, a winding-aligned plane normal, a deterministic in-plane basis and fixed-pivot Gaussian elimination for the 2D circle. No numeric rounding is used to force equality. Only negative zero is normalized.

The closed tolerance profile is `FbxDerivedPortToleranceProfile.v1`:

```text
minimum radius:                 0.000001 mm
planarity tolerance:            max(0.01 mm, radius × 0.0001)
circular residual tolerance:    max(0.05 mm, radius × 0.001)
comparison:                     inclusive
```

The world centre is transformed by the accepted occurrence geometry matrix. The world normal is:

```text
normalize(sign(det(A)) × inverseTranspose(A) × localWindingNormal)
```

The determinant sign correction preserves transformed polygon winding for mirrored transforms. The implementation verifies the result against a Newell normal calculated from the transformed ordered loop points. Singular, inherited, sheared and non-uniform transforms fail closed without fallback.

## Derived port evidence

`FbxDerivedPortEvidence.v1` records every detected candidate component, including rejected candidates. Each record binds occurrence, geometry, shell, loop and ordered topology identity plus centre, normal, fitted dimensions, residuals, tolerance evidence, transform disposition, admission status and ordered rejection reasons. The artifact binds its parent zone-geometry artifact ID.

This is geometric evidence only. `classificationDisposition` and `connectivityDisposition` are both `NOT_PERFORMED`. Derived ports do not authorize engineering StagedJSON.

## Terminal behavior

Terminal failures use the closed statuses:

```text
BLOCKED_ZONE_GEOMETRY_BINDING
BLOCKED_ZONE_GEOMETRY_SCOPE
BLOCKED_ZONE_GEOMETRY_TOPOLOGY
BLOCKED_ZONE_GEOMETRY_RESOURCE
BLOCKED_ZONE_GEOMETRY_CANCELLED
```

Candidate-level structural and fit failures use `BLOCKED_DERIVED_PORT_LOOP` and `BLOCKED_DERIVED_PORT_FIT` inside the derived artifact. A terminal failure or invalidation publishes no canonical artifact text and leaves no stale download enabled.

## Browser workflow

```text
Load FBX
→ run without mapping
→ select one zone
→ Analyse zone geometry
→ Download zone geometry evidence
→ Download derived port evidence
```

Changing the zone or starting another FBX run cancels active analysis and clears prior evidence. The existing source-graph action remains owned by the accepted selected-zone selector. The existing zone StagedJSON action remains gated only by `STAGEDJSON_PASS`.

## Explicit non-scope

No PIPE or fitting classification, engineering connectivity, mapping authority, StagedJSON generation, parser rebuild, triangulation admission, benchmark modification or FBX-AUTO-002 behavior is included.
