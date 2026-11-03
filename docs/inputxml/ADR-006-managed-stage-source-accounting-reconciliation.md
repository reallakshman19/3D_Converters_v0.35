# ADR-006 — Managed-Stage Source-Accounting Reconciliation

## Status

Accepted for corrected PR-7 review. Production activation, migration, PR-8, and PR-10 resource characterization are not authorized.

## Scope

This ADR governs only:

- profile `managed-stage-json`;
- adapter `managed-stage-to-canonical`;
- the managed-stage bridge, evidence verifier, candidate builder, and source-accounting proof;
- the component-topology artifacts consumed by that profile.

The production CII writer, deterministic canonical-InputXML serialization policy, crash-consistent publication protocol, browser UI/runtime, and other profile semantics remain outside PR-7.

## Binding principles

> Source inventory is not source-accounting authority.

> Existence of a valid identifier is not proof that the identifier belongs to the claimed source entity.

> Every mapped source port has exactly one canonical-node owner before any source-port index is constructed.

> RESTRAINT and RIGID identity, owner element, canonical owner, source owner, and engineering evidence form one relation and must reconcile exactly.

> A producer hash is evidence only after independent recomputation over identical canonical bytes.

> Missing engineering evidence remains structured absence; it is never converted to numeric zero.

> Compatibility InputXML cannot repair disagreement among source, canonical topology, trace, engineering, and parsed InputXML evidence.

## Authority order

1. Raw managed-stage bytes and strict JSON occurrence paths.
2. `SourceEnvelope.v1` and independently derived source identity.
3. `ComponentTopologySourceModel.v1` and producer-owned source ports.
4. Explicit producer connectivity evidence.
5. `CanonicalTopology.v1`.
6. Independently reconstructed source-to-canonical relations.
7. `TopologyTraceLedger.v1`.
8. Topology engineering projection.
9. Complete topology InputXML and `ParsedInputXmlTopology.v1`.
10. `TopologySvgScene.v1` and `TopologyParityReport.v1`.
11. Canonical InputXML contract and assurance gates.
12. Unchanged production CII projection behavior.

## Accepted source forms

The only accepted managed-stage roots are:

| Form | Branch collection | Branch path |
|---|---|---|
| non-empty top-level array | `$` | `$[n]` |
| exactly one non-empty `objects` array | `$.objects` | `$.objects[n]` |
| exactly one non-empty `hierarchy` array | `$.hierarchy` | `$.hierarchy[n]` |
| exactly one non-empty `branches` array | `$.branches` | `$.branches[n]` |

Competing branch collections, empty collections, unrelated objects, scalar roots, nested inference, malformed JSON, duplicate keys, non-finite values, trailing data, invalid UTF-8, misleading filenames, and incompatible overrides block.

## Strict media and profile intake

Python performs intake before Node execution. It enforces:

- a source-byte limit;
- fatal UTF-8 decoding;
- duplicate-key rejection at every object depth;
- rejection of non-finite values and trailing data;
- one positively identified root form;
- deterministic ordered occurrence paths;
- raw SHA-256 before transformation;
- explicit `version`, `jobName`, `north`, and positive `sourceRevision` context.

`time` and `issueNo` are optional only when explicitly supplied. No filename, clock, environment, or silent job-name fallback is authoritative.

The occurrence inventory is immutable evidence but cannot certify source accounting.

## Bridge request and result contracts

`InputXmlManagedStageBridgeRequest.v1` is a closed request containing the profile, adapter, source hash, source text, source name, validated context, producer policy, intake evidence, and requested artifacts.

The Node bridge decodes request bytes with fatal UTF-8 and a strict recursive JSON parser. Duplicate keys are rejected before object construction, including duplicate `profileId`, `adapterId`, `sourceHashSha256`, `sourceContext`, and nested context fields.

`InputXmlManagedStageBridgeResult.v1` is a closed result containing:

- resolution status and engine identity/version;
- echoed profile, adapter, and raw source hash;
- source identity, model, entities, and ports;
- canonical topology and engineering projection;
- topology trace ledger;
- complete trace-bearing topology InputXML;
- parsed InputXML topology;
- SVG scene and parity report;
- metrics, build issues, and stable diagnostics.

Expected source/topology failures return a structured blocked result. Nonzero process exit is reserved for request or internal bridge failure.

## Hard bridge containment

The Python bridge runner uses `subprocess.Popen` with `shell=False`, a resolved Node executable, a fixed script path, and a reduced environment.

Request bytes are bounded before launch. Stdout and stderr are read concurrently through capped readers. If either stream exceeds its limit, the process is killed while it is still executing; output is not first buffered without limit. A deadline independently kills a silent or stalled child. Tests cover stdout overflow, stderr overflow, timeout, and successful bounded execution on Ubuntu and Windows.

PR-10 may characterize full process RSS, but PR-7 supplies a real bounded transport envelope.

## Source identity, entities, and ports

Python independently verifies:

- raw-byte SHA-256;
- normalized source-content hash;
- source file ID, kind, name, and explicit revision;
- entity identity schema and exact occurrence paths;
- exact profile and adapter echoes;
- source identity equality across every artifact.

Every branch and component must reconcile by exact path, independently derived ID, source order, name, type, reference, branch owner, source attributes, and enriched attributes. Duplicate IDs, duplicate paths, collisions, missing entities, and extra entities block before indexing.

Ports reconcile across source-model ports, entity-owned ports, bridge ports, trace-port manifest, canonical ancestry, and semantic decisions. Each port verifies ID, owner, path, field, role, type, units, frame, and finite position.

Before constructing `sourcePortId -> canonicalNode`, Python builds the complete owner relation. A port that appears in more than one canonical node blocks with `MANAGED_STAGE_SOURCE_PORT_OWNER_AMBIGUOUS`; no last-value-wins overwrite is possible.

Point-feature and intentional-nonprojection ports are handled separately. Every remaining port must have exactly one mapped canonical owner and exact incident InputXML element coverage.

## Canonical topology closure

Python verifies canonical schema, source identity, coordinate frame, units, tolerance, semantic hash, unique object IDs, unique InputXML IDs, endpoint existence, finite coordinates, nonzero route length, source ancestry, merge authority, junctions, boundaries, point features, supports, rigids, and blocking build issues.

Canonical rigid IDs are deterministic before artifact hashing. A rigid requires exact source identity, owner edge, InputXML owner element, bounded residual, non-proximity assignment authority, positive weight, and explicit weight authority.

## Exact trace-relation reconstruction

Trace verification does not stop at identifier existence. For every source entity, Python reconstructs the expected relation directly from verified source and canonical arrays and compares it with the trace record.

The following are compared exactly:

- `primaryDisposition`;
- `canonicalNodeIds`;
- `canonicalEdgeIds`;
- `pointFeatureIds`;
- `junctionIds`;
- `boundaryIds`;
- `affectedEdgeIds`;
- `branchEdgeIds`;
- `affectedSourceEntityIds`;
- `inputXmlElementIds`;
- `inputXmlChildIds`;
- InputXML from/to nodes;
- `projectionCardinality`;
- `operation`;
- `lossClassification`;
- `mergeAuthority`;
- `deferredProperties`;
- `status`.

Duplicate, missing, and extra records block before indexing. Valid-ID/wrong-owner substitutions block even after every artifact hash is recomputed.

## Shared canonical JSON and artifact hashing

`fnv1a64-canonical-json-v1` is defined as the UTF-8 bytes produced by the following contract:

- values use ECMAScript `Number` semantics;
- finite numbers use the exact `JSON.stringify` lexical form;
- negative zero is normalized to `0`;
- object keys use ECMAScript UTF-16 code-unit ordering;
- array order is preserved;
- non-finite values are invalid;
- registered self-hash fields are omitted;
- FNV-1a 64 is applied to the resulting UTF-8 bytes.

Python independently implements the same numeric and key-order contract, including IEEE-754 coercion for integer tokens outside the safe-integer range. Shared vectors cover zero, negative zero, `1e-6` and `1e-7`, `1e20` and `1e21`, unsafe integers, fractional residuals, near-rounding coordinates, maximum finite, and minimum positive doubles. Python and JavaScript must produce identical canonical bytes and hashes.

## Engineering projection and missing values

Engineering records reconcile by exact source entity and path. Geometry- or line-text-based cross-component inheritance is prohibited. Conflicting source and enriched values block unless a registered authority resolves them.

Rigid weight evidence uses one of:

- positive `weightKg` with `RESOLVED_WEIGHT_KG`;
- positive `weightKg` with `SOURCE_WEIGHT_KG`;
- `weightKg: null` with `weightAuthority: MISSING`.

The third case blocks rigid projection but preserves absence. It is never materialized as `0`. Compatibility topology InputXML may use a sentinel for a missing required value, which the managed-stage compiler then rejects; it may not invent zero.

Unsupported components may retain a candidate only under their registered blocked-candidate policy.

## Exact RESTRAINT and RIGID ownership

Parsed child validation reconstructs expected ownership independently from canonical topology and writer ownership rules.

For every RESTRAINT, the verifier compares:

- child ID;
- support ID;
- source support IDs and paths;
- canonical node ID;
- InputXML node;
- owning `PIPINGELEMENT`;
- branch IDs, tag, attachment authority/references;
- source and attachment positions;
- connection residual.

For every RIGID, the verifier compares:

- child ID;
- source rigid IDs and paths;
- canonical edge ID;
- owning `PIPINGELEMENT`;
- body count;
- weight and weight authority;
- assignment authority;
- branch IDs and connection residual.

Child IDs and aggregate counts are insufficient. Moving a valid child to another valid element, or exchanging valid source/support identities, blocks even with recomputed parsed/parity hashes.

## Topology InputXML, counts, and sentinels

Complete trace-bearing topology InputXML is securely parsed. Element and child trace attributes are checked against independent canonical, trace, engineering, and child-ownership evidence. Approved evidence is retained in registered extension records and removed individually. Regex mutation is not used.

Producer `NUM*` values are assertions. Canonical values are independently calculated under PR-5 owner/count authority. Disagreement blocks and is not silently repaired.

Missing is absent, unresolved is structured blocking evidence, and actual zero is `0`. Required geometry and engineering sentinels block. Optional compatibility sentinels may be removed only with explicit absence evidence. `CNODE=0` is accepted only under verified no-connection authority.

## Parity and metrics

`ParsedInputXmlTopology.v1`, `TopologySvgScene.v1`, and `TopologyParityReport.v1` are mandatory. Schemas, identities, hashes, populations, incidence, coordinates, source ancestry, merge ancestry, child ownership, and mismatch arrays are verified. Failed, missing, stale, or forged-success parity blocks.

Metrics are independently recomputed from artifact arrays. They are evidence, never authority.

## Source-accounting proof

`InputXmlManagedStageSourceAccountingProof.v1` reconciles occurrences, branches, components, fields, ports, references, engineering records, topology objects, trace records, InputXML elements and children, extension evidence, and blockers.

Only post-verification `MANAGED_STAGE_SOURCE_DECISION` records certify coverage. Inventory, document, digest, extension, closure, and accounting-index records are non-authoritative.

`selfCertificationCount` is executable: a non-authority record associated with a source occurrence that claims coverage through fields such as `certifiesCoverage`, `covered`, `accounted`, or `accountingAuthoritySourceType` is counted, identified in the proof, and blocks completion.

COMPLETE requires every registered invariant to be zero.

## Diagnostics and candidate behavior

Managed-stage diagnostics register code, stage, severity, disposition, candidate policy, and production effect. Substring-based blocking is prohibited.

- invalid UTF-8 or JSON → `MEDIA_INSPECTION_GATE`;
- root, profile, or context ambiguity → `PROFILE_INTAKE_GATE`;
- bridge, schema, hash, identity, topology, trace, child ownership, parity, or metric failure → `PROFILE_RESOLVER_GATE`;
- accounting incompleteness → `SOURCE_ACCOUNTING_GATE`;
- retained unsupported engineering → `LEDGER_GATE`;
- production eligibility → `PRODUCTION_ACCEPTANCE_GATE`.

Nonconstructible closure failures return no candidate. Complete topology with registered unsupported engineering may return a blocked candidate. Acceptance requires every gate to pass.

## Linear review stack

The corrected PR-7 stack is an exact descendant chain rooted at current `main`:

```text
current main
  └─ PR-7A production core
       └─ PR-7B qualification
            └─ PR-7C corpus/profile gates
                 └─ PR-7D workflow/evidence
```

Each child contains only its declared batch delta. Production corrections are owned by PR-7A and are not mirrored into later branches.

## Unchanged boundaries

- Production CII writer: unchanged.
- Canonical InputXML deterministic serialization policy: unchanged.
- Crash-consistent publication protocol: unchanged.
- Browser UI/runtime: unchanged.
- Other profile semantics: unchanged.
- Migration and production activation: not authorized.
- PR-8: not started.

## Deferred findings

- New bend engineering projection.
- Tee/Olet SIF projection.
- Production authorization for unsupported inline components.
- Full RSS/resource characterization under PR-10.
- Full-corpus expansion and legacy migration.
