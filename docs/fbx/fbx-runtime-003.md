# FBX-RUNTIME-003 — Binary mesh topology and transferable geometry transport

## Status

This work pack adds an opt-in geometry path. It does not redefine the accepted
`FbxSourceGraph.v2`, worker v1, feature registry/report v1 or v2, mapping,
binding, conversion, or StagedJSON contracts.

The source implementation is not merge-ready until the committed parser WASM is
rebuilt with the geometry exports, provenance is updated, all exact-head tests
pass, and browser transfer behavior is certified.

## Authority

Raw mesh topology is authoritative only after ufbx accepts the source and the
repository performs its existing right-handed Y-up millimetre normalization.
For every accepted mesh:

```text
control points       normalized ufbx_mesh.vertices
polygon order        normalized ufbx_mesh.faces order
polygon boundary     ufbx_face.index_begin and ufbx_face.num_indices
polygon vertex       ufbx_mesh.vertex_indices[cornerIndex]
index domain         [0, controlPointCount)
winding evidence     normalized face-corner order and reversed_winding
```

The implementation validates that face ranges begin at zero, are contiguous,
do not overlap, do not overflow, and end at `num_indices`. Every polygon index
must reference an existing control point.

Repeated indices are retained. Empty, point, and line polygons are retained and
counted. Zero-area polygons, non-manifold edges, disconnected shells, and
coincident vertices are not reclassified. Subdivision-evaluated meshes and
NURBS-tessellated meshes are rejected by this raw-mesh contract.

ufbx may sanitize malformed source data before exposing its accepted scene. The
result is therefore accepted ufbx-sanitized topology, not a promise to reproduce
malformed source arrays byte-for-byte.

## Triangle derivation

`FbxGeometryBundle.v1` does not derive triangles:

```json
{
  "status": "not-derived",
  "rule": null
}
```

Raw polygon topology remains the sole topology authority. No fan triangulation,
renderer index generation, or `ufbx_triangulate_face()` result is included.

## Raw parser result

The new parser ABI returns `FbxRawMeshTopology.v1` canonical JSON and a parallel
ordered list of binary buffers. Geometry descriptors reference the existing
`geometryObjectId` and `sourceObjectId`; no mapping identity is created.

Each mesh has exactly three raw buffers in this order:

```text
controlPointsMm
polygonOffsets
polygonVertexIndices
```

`polygonOffsets` contains `polygonCount + 1` values. It starts at zero, is
non-decreasing, and ends at `polygonVertexCount`. Repeated adjacent offsets
represent empty polygons.

## FbxGeometryBundle.v1

The deterministic public artifact is a standalone bundle:

```text
manifest: canonical structured data
buffers:  ordered { bufferId, bytes: ArrayBuffer } values
```

The manifest records:

- source graph schema and canonical SHA-256;
- source byte SHA-256, byte length, and FBX version;
- parser provenance schema, upstream revision, source SHA-256, and WASM SHA-256;
- coordinate unit and byte order;
- triangle derivation status;
- geometry counts and ordered buffer identifiers;
- exact buffer descriptors and SHA-256 values;
- a bundle digest committing to the canonical manifest.

### Binary layout

| Role | Scalar | Components | Byte order | Alignment | Authority |
|---|---:|---:|---|---:|---|
| `control-points-mm` | IEEE-754 binary64 | 3 | little-endian | 8 | normalized millimetre control points |
| `polygon-offsets` | unsigned 32-bit | 1 | little-endian | 4 | polygon boundaries |
| `polygon-vertex-indices` | unsigned 32-bit | 1 | little-endian | 4 | control-point indices |

There is no Float32 geometry buffer in v1. Negative zero is normalized to
positive zero and non-finite coordinates are rejected.

### Ordering

```text
geometry order: numeric decimal geometryObjectId
role order:     control-points-mm, polygon-offsets, polygon-vertex-indices
bufferId:       geometry/<geometryObjectId>/<role>
```

Identifiers are canonical unsigned 64-bit decimal strings without leading
zeroes, except the value `0`.

### Digests

Each buffer SHA-256 covers all bytes in the exact transferred buffer.
`sourceGraphSha256` covers `canonicalJson(FbxSourceGraph.v2)` UTF-8 bytes.
The bundle digest is:

```text
SHA-256(
  UTF8("FbxGeometryBundle.v1\0") ||
  UTF8(canonicalJson(manifest with bundleDigest omitted))
)
```

Because the manifest includes the ordered buffer digests, the bundle digest
commits transitively to every binary payload.

## Resource limits

The programme limits are theoretical bounds, not measured memory results:

```text
geometries per bundle             65,536
control points per geometry       8,388,608
polygons per geometry             16,777,215
polygon vertices per geometry     67,108,864
individual buffer bytes           268,435,456
total bundle buffer bytes         536,870,912
```

The effective limit is the smallest of the programme limit, JavaScript safe
integer range, unsigned-32 index range, WASM address space, and available
allocation capacity. No limit breach truncates or wraps.

## Parser APIs

Legacy APIs remain unchanged:

```js
parseFbxBytesWithWasm(bytes, options)
parseFbxBytesNode(bytes)
parseFbxInWorker(bytes, options)
```

New opt-in APIs are:

```js
parseFbxGeometryBundleWithWasm(bytes, options)
parseFbxGeometryBundleNode(bytes, options)
parseFbxGeometryBundleInWorker(bytes, options)
validateFbxGeometryBundle({ manifest, buffers })
```

The parser identity loader hashes the actual committed WASM and rejects any
mismatch with `third_party/ufbx/provenance.json`.

## Worker transport

Geometry transport uses parallel contracts:

```text
job schema:       FbxWorkerJob.v2
message schema:   FbxWorkerMessage.v2
operation:        PARSE_GEOMETRY_BUNDLE
completion type:  FBX_WORKER_GEOMETRY_COMPLETE
```

The caller's input is never transferred directly. The client snapshots the
input and transfers only that copied `ArrayBuffer` to the worker.

The worker validates topology, constructs the bundle, validates every digest,
and creates a transfer list in manifest buffer order. Every payload must be a
distinct ordinary `ArrayBuffer`; `SharedArrayBuffer`, aliases, missing buffers,
extra buffers, detached buffers, and length mismatches are rejected.

After successful `postMessage(envelope, transferList)`, the worker verifies that
all transferred output buffers are detached. This proves transfer of ownership,
not end-to-end zero copy. Input bytes are copied into WASM memory and geometry
bytes are copied from WASM memory into exact-length transferable buffers.

The client validates the full message schema, job ID, progress order, manifest,
buffer relationships, byte lengths, digests, source identity, and parser
identity before exposing success.

Cancellation, timeout, runtime error, malformed messages, wrong job IDs,
duplicate acceptance, and failed transfer settle once and terminate the worker.
A late message cannot replace an accepted terminal result.

## Capability reporting v3

Topology support is reported only by new additive contracts:

```text
FbxFeatureCapabilityRegistry.v3 / 3.0.0
FbxFeatureReport.v3
```

The v3 registry retains the complete v2 feature-ID order. Only these policies
change:

```text
mesh-control-points
  evidenceStatus:           supported
  renderStatus:             blocked-unsupported
  exportStatus:             blocked-unsupported
  engineeringMappingStatus: supported

mesh-topology
  evidenceStatus:           supported
  renderStatus:             blocked-unsupported
  exportStatus:             blocked-unsupported
  engineeringMappingStatus: not-applicable
```

`FbxFeatureReport.v3` is built only from an accepted `FbxSourceGraph.v2` and a
fully validated matching `FbxGeometryBundle.v1`. It adds the bundle schema and
digest plus topology geometry, polygon, and polygon-vertex counts.

A mesh-topology evidence count is the number of validated mesh geometry
descriptors. It is not an edge count, shell count, connected-component count,
or engineering connection count.

## Compatibility and authority boundaries

The following remain unchanged and authoritative for their existing purposes:

```text
FbxSourceGraph.v2
FbxFeatureCapabilityRegistry.v1 and v2
FbxFeatureReport.v1 and v2
FbxWorkerJob.v1 and FbxWorkerMessage.v1
FbxRuntimeBenchmark.v1
mapping worklists, decisions, packages, and IDs
binding and conversion reports
no-mapping promoted JSON
StagedJSON publication and canonical hashes
```

Topology does not create engineering connectivity or component classification.
In particular:

```text
Polygon adjacency is not engineering connectivity.
Shared control points are not engineering ports.
Coincident vertices are not connected components.
Coplanarity is not a fitting or pipe classification rule.
Visual shape is not governed mapping authority.
Names, materials, and renderer output are not mapping authority.
```

The closed limitation `TOPOLOGY_NOT_ENGINEERING_CONNECTIVITY` is carried by the
new mesh capability policies.

## Failure behavior

The whole result is rejected for:

- malformed, non-contiguous, non-monotonic, or overflowing face ranges;
- a final polygon offset that differs from the index count;
- an index outside the control-point range;
- unsupported scalar or index representation;
- count, byte-length, or allocation overflow;
- non-finite or negative-zero control-point bytes;
- duplicate, missing, unexpected, aliased, truncated, or detached buffers;
- buffer or bundle digest mismatch;
- source graph, source identity, or parser identity mismatch;
- parser allocation, decode, packing, or transfer failure;
- cancellation, timeout, worker termination, or protocol violation;
- direct and worker byte drift;
- parser/WASM provenance drift or governed fixture drift.

No partial bundle is published.

## Certification gates

Before merge, the exact final head must record:

```text
all focused topology, bundle, transport, v3, and failure tests passing
node --check for every changed JavaScript module
real direct Node/WASM versus managed-worker parity on all four fixture families
legacy v1/v2 canonical byte parity
node tests/fbx/test-worker-byte-parity.mjs
node tests/fbx/test-runtime-capability-isolation.mjs
node tests/fbx/run-all.mjs
node tests/fbx/test-static-guards.mjs
clean-checkout WASM rebuild with compiler and WASI sysroot recorded
committed WASM SHA-256 reproducibility
provenance and governed fixture reproducibility
manual browser success, output detachment, cancellation, timeout, and repeated cleanup
hosted exact-head statuses where available
```

Synthetic parser output is valid for focused contract and transfer tests, but it
is not a substitute for the real WASM, fixture, clean-checkout, or browser gates.

## Explicit non-scope

This work pack does not implement normals, tangents, UVs, colors, materials,
textures, skinning, deformation, animation playback, NURBS tessellation,
rendering, GLB export, a general model exporter, component-family inference,
engineering ports, or engineering connectivity.
