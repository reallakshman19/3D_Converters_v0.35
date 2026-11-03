# Status

**AUTHORIZED FOR IMPLEMENTATION**

Owner activation record:

1. PR #254 latest-head hosted-runner certification was blocked by GitHub Actions credit exhaustion; the Owner explicitly waived that administrative gate and ordered merge/proceed.
2. PR #254 was squash-merged.
3. Issue #251 was closed as completed.
4. The accepted F2S-001 squash-merge SHA is recorded below.
5. The Owner authorized F2S-002 implementation on July 22, 2026.

# Mission number

`F2S-002`

# Mission title

Complete all-category FBX source provenance and deterministic source-graph qualification

# One-line mission statement

Upgrade the accepted FBX parser boundary so `FbxSourceGraph.v2` preserves exact DOM class, subtype, source name and ufbx element-type evidence for every FBX source-object category, while retaining F2S-001 conversion behavior and proving deterministic compatibility with the existing mapping-gated PIPE converter.

# Repository

```text
reallaksh19/3D_Converters
```

# Dependency status

```text
Depends on: F2S-001 / Issue #251 / PR #254
Required merge SHA: a883f3c0b077c5867937a61b10954ebf095871bc
```

No implementation may begin from the feature branch or an unmerged PR head.

Implementation must begin from the latest `main` after the accepted F2S-001 squash merge.

# Parallel-agent decision

```text
Parallel agents: NO
Ownership:       one core parser/provenance agent
```

The C/WASM parser bridge, source-graph schema, canonicalization, compatibility adapter and deterministic fixture proof form one tightly coupled authority boundary.

Do not split the parser, schema and compatibility work across agents.

# Reason for the work

F2S-001 delivers a safe mapping-gated PIPE conversion but intentionally limits promotion-relevant evidence to:

```text
NODE
MESH
NURBS_CURVE
```

Other FBX source categories remain explicit unsupported records and may be represented by a quarantine class.

That containment is acceptable for F2S-001 because those records cannot be promoted. It is not sufficient for later component-family mapping, real-project mapping-registry authoring, material/attribute inspection or complete source provenance.

Before extending engineering component promotion, the source graph must preserve exact source identity for all FBX object classes without collapsing materials, cameras, lights, deformers, animation objects, textures, videos, constraints or unknown objects into a generic category.

# Required delivered capability

```text
binary FBX bytes
→ pinned ufbx/WASM parser
→ exact all-category FBX source-object evidence
→ FbxSourceGraph.v2
→ deterministic v2 canonicalization
→ explicit v1 compatibility projection
→ unchanged F2S-001 PIPE conversion behavior
```

The mission must deliver a usable source-evidence improvement. It must not be an audit-only or documentation-only PR.

# Allowed files

The implementation may add or modify only:

```text
contracts/fbx/**

third_party/ufbx/fbx_parser.c
third_party/ufbx/fbx_parser.wasm
third_party/ufbx/provenance.json
third_party/ufbx/LICENSE
third_party/ufbx/ufbx.c
third_party/ufbx/ufbx.h

scripts/fbx/**

tabs/model-converters/converters/fbx/source-graph.js
tabs/model-converters/converters/fbx/source-graph-v1-compat.js
tabs/model-converters/converters/fbx/parser-wasm.js
tabs/model-converters/converters/fbx/parser-worker.js
tabs/model-converters/converters/fbx/parser-node.js
tabs/model-converters/converters/fbx/canonical-json.js
tabs/model-converters/converters/fbx/conversion.js

tests/fbx/**
tests/fixtures/fbx/**

docs/fbx/**

.github/workflows/fbx-stagedjson.yml
```

A compatibility module may be added under:

```text
tabs/model-converters/converters/fbx/**
```

only when it is directly required for `FbxSourceGraph.v2` or v1 compatibility.

Small deterministic binary FBX fixtures are permitted.

# Forbidden files

Do not modify:

```text
tabs/model-converters/converter-registry.js
tabs/model-converters/legacy-adapter.js
tabs/model-converters/legacy-adapter.js.bak

tabs/model-converters/converters/fbx-to-stagedjson.js
tabs/model-converters/converters/fbx/staged-writer.js
tabs/model-converters/converters/fbx/connectivity.js
tabs/model-converters/converters/fbx/mapping-validator.js
tabs/model-converters/converters/fbx/port-resolver.js
tabs/model-converters/converters/fbx/transform-policy.js

contracts/stagedjson-contract.js

tabs/model-converters/converters/stagedjson-to-xml.js
tabs/model-converters/converters/stagedjson-to-inputxml.js
tabs/model-converters/converters/stagedjson-to-csv.js

tabs/stagedjson-to-enrichxml/**
component-topology/**
topology/**
node-history/**

contracts/inputxml/**
converters/scripts/inputxml_to_cii2019*.py

viewer/**
index.html
canvas modules
Three.js modules
RVM/GLB writers

Benchmarks/**
docs/fbxsample

package.json
package-lock.json

.github/workflows/**
except .github/workflows/fbx-stagedjson.yml
```

Do not change F2S-001 engineering classification, mapping, port, connectivity or native StagedJSON behavior.

# Source-object provenance contract

Create:

```text
FbxSourceGraph.v2
```

Each source object must preserve at least:

```text
sourceObjectId
ufbxElementId
ufbxTypedId
ufbxElementType
ufbxElementTypeValue
domClass
domSubtype
domSourceName
displayName
customProperties
sourceRecordDisposition
```

Where available, preserve:

```text
nodeAttributeType
nodeAttributeTypeValue
objectPropertyPath
connectionPropertyNames
sourceDocumentOrder
```

Definitions:

* `domClass` is the exact FBX DOM object class, such as `Model`, `Geometry`, `Material`, `NodeAttribute`, `Deformer`, `Texture` or `Video`.
* `domSubtype` is the exact source subtype stored by FBX.
* `domSourceName` is the exact source object name as serialized, including namespace prefixes where present.
* `displayName` is the ufbx-decoded display name.
* `ufbxElementType` is the exact symbolic ufbx element category.
* `ufbxElementTypeValue` is the numeric enum value from the pinned ufbx revision.
* `sourceRecordDisposition` must explicitly distinguish supported geometry, supported occurrence, retained evidence and unresolved/unknown records.

Do not use one generic `OTHER` value as the sole class or subtype evidence.

Unknown future enum values must remain numerically and textually traceable and must not be silently discarded.

# Identity requirements

Continue to keep these domains distinct:

```text
FBX source object ID
ufbx element ID
ufbx typed ID
geometry resource ID
scene occurrence ID
logical engineering component ID
```

The new source-graph contract must not merge or repurpose these identities.

F2S-002 must not create new logical engineering components.

# Compatibility requirements

1. Existing `FbxStagedMapping.v1` manifests must continue to work unchanged.
2. Existing F2S-001 fixture conversion must remain byte-identical unless an explicitly documented source-graph schema version field changes.
3. If source-graph bytes must change because the emitted artifact becomes v2, provide:

   * deterministic `FbxSourceGraph.v2`;
   * an explicit pure `v2 → v1 compatibility projection`;
   * byte-equivalence proof for the F2S-001 mapping and StagedJSON artifacts.
4. No implicit fallback from v2 to v1.
5. No dual authority: v2 is authoritative after activation; v1 is a named compatibility projection.
6. The compatibility projection must fail closed if v2 lacks information required to reproduce a valid v1 graph.

# Parser and WASM requirements

1. Continue using pinned `ufbx v0.18.0` unless the Owner explicitly approves a version change.
2. Preserve the exact upstream revision and source hashes.
3. Rebuild the WASM reproducibly.
4. Update the WASM checksum in `provenance.json`.
5. CI must rebuild the committed WASM and fail on byte drift.
6. No runtime network access.
7. No CDN dependency.
8. No Three.js `FBXLoader`.
9. No second parser implementation.
10. The Node and browser-worker adapters must consume the same WASM parser.
11. Do not commit manually altered or unreproducible WASM bytes.

# Determinism requirements

Canonical v2 output must be independent of:

* ufbx collection iteration order;
* worker scheduling;
* object-map insertion order;
* asynchronous completion order;
* machine paths;
* temporary paths;
* clock time;
* random values.

Stable-sort at least:

```text
source objects
occurrences
geometries
hierarchy edges
connection edges
custom properties
warnings
unsupported records
unresolved references
owner occurrence IDs
nested evidence lists
```

Do not reorder geometry vertices, control points, polygon indices, knots or other source-order-sensitive geometric arrays.

# Required representative fixtures

Add or extend small binary FBX fixtures covering at least:

```text
Model / Null
Model / Mesh
Geometry / Mesh
Geometry / NurbsCurve
Material
NodeAttribute / Camera
NodeAttribute / Light
Texture
Video
Deformer or Skin
Animation object
Unknown or retained unsupported object
```

Fixtures must be generated deterministically from a checked-in generator or sourced from an explicitly licensed immutable fixture with checksum evidence.

Do not commit the full project FBX.

# Required tests and proof

Add proof for:

1. exact DOM class preservation;
2. exact DOM subtype preservation;
3. exact source-name preservation;
4. display-name preservation;
5. symbolic and numeric ufbx element-type preservation;
6. node-attribute subtype preservation;
7. material evidence preservation;
8. camera and light evidence preservation;
9. texture and video evidence preservation;
10. deformer or skin evidence preservation;
11. unknown object retention without silent loss;
12. source-object ID uniqueness;
13. ufbx element-ID and typed-ID traceability;
14. stable sorting under input permutations;
15. repeated-run byte determinism;
16. browser-worker and Node-adapter parity;
17. reproducible WASM checksum;
18. v2 schema validation;
19. explicit v2-to-v1 compatibility projection;
20. unchanged F2S-001 mapping validation;
21. unchanged PIPE port resolution;
22. unchanged explicit connectivity;
23. unchanged native APOS/LPOS projection;
24. unchanged disconnected-branch behavior;
25. unchanged `BLOCKED_MAPPING`;
26. unchanged `BLOCKED_TRANSFORM`;
27. unchanged `BLOCKED_STAGEDJSON_CONTRACT`;
28. no new automatic classification;
29. no name-derived engineering semantics;
30. no proximity topology.

Run the complete existing FBX suite, not only new v2 tests.

# Static guards

Tests must reject:

```text
FBXLoader
THREE.FBXLoader
Math.random
Date.now
runtime CDN imports
default exports
name-regex engineering classification
nearest-neighbour topology
distance-created topology
fallback component types
mock engineering dimensions
silent OTHER-only classification
```

Every new JavaScript file must remain under 300 lines.

Every function must remain under 40 lines where practical.

Use named exports only.

# Validation commands

At minimum:

```text
node tests/fbx/run-all.mjs
node tests/fbx/test-source-graph-v2.mjs
node tests/fbx/test-v1-compatibility.mjs
node tests/fbx/test-determinism.mjs
node tests/fbx/test-provenance.mjs
node tests/fbx/test-static-guards.mjs
```

Also run every applicable existing F2S-001 parser, mapping, transform, worker and registry test.

# Acceptance criteria

The PR is acceptable only when:

1. every representative FBX object category retains exact DOM class, subtype and source name;
2. no source category relies solely on generic `OTHER` evidence;
3. symbolic and numeric ufbx element types are preserved;
4. `FbxSourceGraph.v2` has a strict executable schema;
5. v2 output is canonical and byte-deterministic;
6. v1 compatibility is explicit and tested;
7. all F2S-001 PIPE conversion behavior remains unchanged;
8. mapping, ports and connectivity remain external-authority-driven;
9. no downstream writer or topology behavior changes;
10. the committed WASM rebuilds without drift;
11. all applicable tests pass;
12. the latest PR head SHA is verified;
13. required checks are green on that exact head;
14. no forbidden files change;
15. the PR delivers usable improved source evidence and is not audit-only.

# Stop conditions

Stop and report `BLOCKED` if:

* exact DOM class/subtype/source-name evidence cannot be extracted through the pinned ufbx retained DOM;
* implementation requires replacing ufbx;
* implementation requires changing F2S-001 mapping or engineering behavior;
* v2 cannot coexist with an explicit safe v1 compatibility boundary;
* WASM cannot be rebuilt reproducibly;
* required Actions jobs fail before executing steps;
* current `main` materially changes the parser or allowed-file boundaries;
* an overlapping FBX provenance PR exists;
* licensing or source provenance cannot be established.

Do not work around a stop condition with:

```text
a second parser
a JavaScript binary-FBX parser
FBXLoader
mock evidence
name inference
unversioned schema changes
hand-edited WASM
```

# Explicit non-goals

* PIPE conversion changes;
* ELBOW, TEE, REDUCER, FLANGE, VALVE or OLET promotion;
* support or structural conversion;
* automatic component classification;
* mapping-registry authoring;
* automatic centerline discovery;
* engineering dimension inference;
* proximity or ray-shoot topology;
* downstream InputXML/XML/CII changes;
* 3D canvas or preview;
* project-FBX production qualification;
* F2S-003 implementation.

# Expected PR title

```text
feat(fbx): preserve complete source-object provenance
```

# PR requirements

* Branch from the exact accepted F2S-001 merge commit or verified current `main`.
* Use one reviewable branch.
* Link and close the activated F2S-002 issue.
* Keep the PR draft until implementation and self-review are complete.
* State the exact base and submitted head SHAs.
* List every changed file.
* Identify all generated and third-party files.
* Record source and WASM hashes.
* State whether parser version changed.
* Report v1 compatibility results.
* Report complete F2S-001 regression results.
* Do not merge or self-approve.

# Expected completion report

```text
Mission: F2S-002
Status: COMPLETE | PARTIAL | BLOCKED
Base SHA:
Head SHA:
Branch:
PR:

Capability delivered:

Changed files:

Generated/third-party files:

Parser provenance:
- upstream revision:
- source hash:
- WASM hash:
- build command:
- license:

FbxSourceGraph.v2 decisions:

All-category evidence proof:

V1 compatibility proof:

F2S-001 regression proof:

Determinism proof:

Tests run:
- command:
- result:

CI:
- latest head:
- workflow run:
- conclusion:

Known limitations:

Scope verdict:
- forbidden files changed:
- generated files changed:
- scope drift:

Owner review required:
```

# Owner sequencing

Do not begin F2S-003.

The Owner will review the latest head, complete diff, generated artifacts, parser provenance and all required checks. Only after F2S-002 is green and squash-merged may the multi-family component-mapping Work Pack be activated.
