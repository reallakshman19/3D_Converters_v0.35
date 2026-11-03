# FBX-RUNTIME-002 capability and runtime architecture

## 1. Mission and predecessor

FBX-RUNTIME-002 began from exact predecessor:

```text
main:       2ad906b23d62c4701c7ca67c573480f06c438cd3
predecessor PR: #283
mission issue:  #284
merged PR:      #288
merge commit:   a72a412c2568b39fc4173df8a661d473f77b7b6d
```

The merged baseline introduced three separated contracts:

```text
FbxFeatureCapabilityRegistry.v1  deterministic programme policy
FbxFeatureReport.v1              deterministic per-file evidence evaluation
FbxRuntimeBenchmark.v1           non-canonical runtime measurement
```

The governed follow-up stack adds parallel capability vocabulary without rewriting the merged contracts:

```text
Issue #289 / PR #290  FbxFeatureCapabilityRegistry.v2
Issue #291 / PR #292  FbxFeatureReport.v2
Issue #293            stable reuse of FbxRuntimeBenchmark.v1
Issue #294            v1/v2 isolation, guards and documentation
```

The v1 contracts remain API-compatible. The v2 report does not make the v2 registry authoritative for conversion, mapping or publication.

## 2. Authority model

The ufbx/WASM parser and managed worker are the raw parsing authority. An accepted `FbxSourceGraph.v2`, after `enforceSourceGraphPolicy()`, is the retained parser-evidence authority. Repository parser provenance is the parser-identity authority.

`feature-capability-registry.js` is programme policy. It receives no file input and performs no feature detection.

`feature-report.js` evaluates one already accepted source graph against one registry. It accepts no raw FBX bytes, parser callback, browser state, benchmark result, mapping manifest or publication token.

`runtime-benchmark.js` measures an injected execution and hashes exact returned semantic artifact bytes. It is not parser, capability, mapping, conversion or publication authority.

Existing mapping worklists, decisions, packages, binding validation and StagedJSON writers remain the only engineering-mapping and publication authorities.

## 3. Registry authority and versions

Both registries are closed, deterministic and deeply frozen:

```js
{
  schema,
  registryVersion,
  statusVocabulary,
  entries,
}
```

Each entry is exactly:

```js
{
  featureId,
  evidenceStatus,
  renderStatus,
  exportStatus,
  engineeringMappingStatus,
  limitations,
  futureWorkPack,
}
```

`FbxFeatureCapabilityRegistry.v1` preserves the original 27 programme concepts. `FbxFeatureCapabilityRegistry.v2` provides the parallel 21-ID vocabulary requested by the follow-up work pack, including `mesh-control-points`, `normals`, `uv-coordinates`, `vertex-colors`, `animation-stacks`, `animation-curves` and `unknown-element-types`.

A registry records current programme policy. It does not record what is present in a particular file.

## 4. Closed status vocabulary

The ordered vocabulary is:

```text
supported
metadata-only
tessellation-required
blocked-missing-data
blocked-unsupported
requires-governed-mapping
not-applicable
unknown
```

Meanings:

- `supported`: the named capability boundary has the required governed evidence or implementation.
- `metadata-only`: typed identity or metadata is retained, but required operational payload is absent.
- `tessellation-required`: governed tessellation is required before rendering; this is not proof that a full mathematical definition is retained.
- `blocked-missing-data`: required payload is absent from the accepted source graph.
- `blocked-unsupported`: evidence may exist, but the programme has no implementation for the capability.
- `requires-governed-mapping`: deterministic evidence still requires the established mapping and binding process. It is reserved for report publication state, not registry policy fields.
- `not-applicable`: the capability does not apply.
- `unknown`: governed semantics are unavailable and no capability is authorized.

Unknown statuses, fields, feature IDs, limitations and malformed future-work-pack references fail validation.

## 5. Deterministic feature detection

Both feature-report schemas retain the same closed top-level structure:

```js
{
  schema,
  registryVersion,
  sourceGraphSchema,
  sourceIdentity,
  parserIdentity,
  counts,
  features,
  unknownElementTypes,
  warnings,
  blockedCapabilities,
  summary,
}
```

Feature evidence is derived only from accepted graph fields such as exact `ufbxElementType` values, source-object identity, occurrence identity, geometry identity, retained point arrays, edges, warnings and unknown-element evidence.

Detection never uses filenames, `displayName`, `domSourceName`, hierarchy-label text, material names, visual resemblance, proximity or feature combinations.

The v2 report counts unique source-object, occurrence and geometry identities. Repeated references do not recount an object. Unsupported-record mirrors contribute to aggregate unsupported counts but do not duplicate source-object feature evidence.

Feature rows follow registry order. Unknown rows sort by numeric element value and ASCII element type. Warnings follow accepted source-policy order. Blocked capabilities sort by feature ID and fixed capability order. Summary values are integer derivations from finalized rows.

## 6. Evidence is not capability

The following statements are mandatory programme constraints:

```text
Mesh control points do not imply topology.
Material records do not imply renderable materials.
Texture records do not imply available texture bytes.
Animation records do not imply playable animation.
Parsed objects do not imply engineering classification.
Benchmark results are environment-specific and non-canonical.
```

Additional examples:

- A `MESH` record and retained `verticesMm` do not provide polygon indices, face topology, normals, UVs or transferable geometry.
- A `MATERIAL` record does not provide complete shader parameters, channel bindings or renderer implementation.
- A `TEXTURE` record does not prove embedded bytes or a resolvable external URI.
- An `ANIM_CURVE` record does not prove target binding, stack/layer evaluation or sampling.
- A `SKIN_DEFORMER` record does not prove weights, joint indices or bind matrices.
- A `NURBS_SURFACE` record does not provide a renderable surface without retained mathematical definition and tessellation.

## 7. Runtime benchmark methodology

`FbxRuntimeBenchmark.v1` is intentionally non-canonical and closed:

```js
{
  schema: 'FbxRuntimeBenchmark.v1',
  sourceSha256,
  sourceByteLength,
  parserDigest,
  runtimeEnvironment,
  runConfiguration,
  runs,
  aggregate,
  semanticArtifactDigests,
}
```

The benchmark snapshots input bytes and runtime-environment metadata before measured execution. It computes source SHA-256 and byte length from the same snapshot.

A measured duration begins immediately before the injected `execute()` call and ends immediately after successful completion or failure. The v1 contract does not separately claim worker, parse or transfer duration.

Warmup executions are not included in measured aggregates. Successful measured runs contribute minimum, maximum, mean, median and p95 values. Failed runs contribute to failed-run counts but not duration aggregates. A single measured run is diagnostic only and is not a statistically universal result.

## 8. Cold and warm definitions

For this API:

- a cold-labelled invocation is an invocation configured with no prior warmup execution under the same injected executor lifecycle;
- warmups are explicit `warmupRuns` completed before measured runs;
- a warm measured run occurs only after those configured warmups;
- worker reuse is controlled by the injected executor and must be disclosed by the caller; the benchmark does not infer it;
- changing process, worker, parser cache or fixture invalidates direct cold/warm comparisons unless recorded externally.

No benchmark result is a performance guarantee.

## 9. Measurement availability

Optional observations use one of two closed records:

```js
{ status: 'available', value }
{ status: 'unavailable', reason }
```

Unavailable data is never represented as zero. A non-finite, reversed or missing clock yields `CLOCK_UNAVAILABLE`. An aggregate with no available successful duration yields `NO_AVAILABLE_SUCCESSFUL_RUNS`.

The frozen v1 schema does not contain memory sampling, peak-memory values, cancellation states, separate stage timings, semantic output byte length, or object/warning/unsupported-feature measurements. Adding those fields requires a separately governed `FbxRuntimeBenchmark.v2` rather than an in-place v1 change.

## 10. Semantic digest checks

Each injected execution returns a map of semantic artifact names to exact bytes. The benchmark hashes those bytes with SHA-256.

Artifact names are ASCII-sorted. Successful measured runs must return the same complete digest map. Any cross-run difference raises `SEMANTIC_ARTIFACT_DRIFT`; incompatible runs are never averaged together.

The benchmark may observe semantic bytes but may not canonicalize, rewrite, publish or authorize them.

## 11. Deterministic/runtime isolation

Runtime-only data must not enter:

```text
FbxSourceGraph.v2
FbxFeatureReport.v1
FbxFeatureReport.v2
mapping worklists
mapping decisions
mapping packages
binding reports
conversion reports
StagedJSON
promoted no-mapping JSON
canonical hashes
```

Prohibited semantic keys include job/worker IDs, timestamps, durations, stage timings, memory fields, browser capabilities, progress stages, terminal codes, benchmark configuration, runtime environment, runs and aggregates.

Static guards enforce import direction. The registry imports only canonical freezing support. The feature report imports source-graph policy and registry policy but never benchmark code. The benchmark imports only hashing and non-policy freezing support. Conversion and mapping production modules do not import the benchmark.

Isolation tests independently hash deterministic artifacts with benchmarking disabled, then recreate and hash them under different repetition counts, clocks, unavailable duration measurements and runtime-environment metadata. Every semantic digest must remain identical.

## 12. Fixture matrix

| Fixture | Purpose | Committed requirement |
|---|---|---|
| Accepted two-pipe fixture | Parser, graph, v1/v2 report, mapping and StagedJSON parity | Required |
| Deterministic fake executor | Benchmark success, failure, timeout and drift tests | Required |
| Locally supplied large FBX | Environment-specific exploratory timing only | Optional; never committed by this work pack |

A local large file must be identified by SHA-256, byte length, parser digest and exact run configuration. Results from one machine are not universal.

## 13. Known limitations and non-scope

This work does not add or change:

- mesh topology, polygon indices or transferable geometry;
- normals, UV coordinates or vertex colors;
- material parameters, texture bytes or texture resolution;
- NURBS tessellation;
- skin weights, joint binding or rig evaluation;
- animation target binding, sampling or playback;
- GLB generation or general model export;
- engineering component classification;
- mapping manifests, decisions, packages, binding behavior or publication rules;
- parser/WASM behavior, worker persistence or browser capability detection;
- universal performance, memory or throughput claims.

## 14. Handoffs and certification

```text
Original Agent A registry:       a862a22671dc2c7c00c93df72673aa9786a1a80b
Original Agent B report:         ec40e9bdc8dcf60cdc56679cf5a4bb3f721e9065
Original Agent C benchmark:      1539083170ae9a52b32750df750bf4c07160586f
Benchmark hardening:             002cfb44f975a8a282a511dcaf11ed11f28aa316
Parallel registry v2 handoff:    24f0ebc052c755396ec75e945cba80a43f8d3fdc
Parallel report v2 handoff:      7710261db571594cf2baa3c5a810c219fc6ba85f
```

Required focused commands are:

```bash
node tests/fbx/test-feature-capability-registry.mjs
node tests/fbx/test-feature-report.mjs
node tests/fbx/test-feature-report-determinism.mjs
node tests/fbx/test-runtime-benchmark.mjs
node tests/fbx/test-runtime-benchmark-failures.mjs
node tests/fbx/test-runtime-capability-isolation.mjs
node tests/fbx/test-static-guards.mjs
node tests/fbx/run-all.mjs
```

A missing checkout, fixture, WASM artifact, browser environment, workflow or hosted status is not a passing result.

## 15. Future work-pack boundary

`FBX-RUNTIME-003` owns binary mesh topology and transferable geometry transport. It must add explicit retained topology evidence and must not infer topology from control-point arrays.

A future benchmark schema may add governed cancellation, memory and stage-timing semantics, but those additions must not alter deterministic source graphs, feature reports or canonical artifact hashes.
