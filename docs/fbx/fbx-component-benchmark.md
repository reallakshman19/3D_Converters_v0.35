# FBX Component Benchmark Qualification

This directory is the Agent C boundary for semantic component qualification. It does not assign zones, classify supports, construct topology authority, define engineering tolerances, or create benchmark occurrences.

## Integrated dependencies

Agent C consumes Agent E's immutable `FbxBenchmarkLoaded.v1` contract. Component discovery and subject construction use only `loaded.occurrences` and `loaded.occurrenceById`; Agent C does not parse benchmark JSON or independently traverse raw branch children. Every ledger locator retains both `sourceOccurrenceId` and `branchOccurrenceId`, and both loaded input identities are recorded in execution evidence.

Agent Z's `FbxZoneMembershipIndex.v1` is also mandatory. Reference and actual indexes are validated, bound to the benchmark identity, required to cover the loaded branch population exactly, and hashed into execution evidence.

## Files

```text
contracts/fbx/fbx-component-identity-policy.v1.schema.json
contracts/fbx/fbx-component-benchmark-report.v1.schema.json

tabs/model-converters/converters/fbx/benchmark/component-common.js
tabs/model-converters/converters/fbx/benchmark/component-policy.js
tabs/model-converters/converters/fbx/benchmark/component-occurrences.js
tabs/model-converters/converters/fbx/benchmark/component-zone.js
tabs/model-converters/converters/fbx/benchmark/component-catalog.js
tabs/model-converters/converters/fbx/benchmark/component-matching.js
tabs/model-converters/converters/fbx/benchmark/component-comparators.js
tabs/model-converters/converters/fbx/benchmark/component-ledger.js
tabs/model-converters/converters/fbx/benchmark/component-qualification.js

tests/fbx/component-benchmark-fixtures.mjs
tests/fbx/test-component-benchmark.mjs
tests/fbx/test-component-benchmark-adversarial.mjs
tests/fbx/test-component-matching-boundaries.mjs
tests/fbx/test-component-benchmark-inventory.mjs
```

Production JavaScript modules are each below 300 lines. Occurrence admission, zone admission, catalog construction, identity matching, comparison, ledger construction, and orchestration are separate units.

## Public API

```js
import {
  buildComponentSubjects,
  discoverComponentCatalog,
  qualifyComponents,
  validateComponentIdentityPolicy,
  validateFrozenComponentIdentityPolicy,
} from './component-qualification.js';
```

### `discoverComponentCatalog(loadedBenchmark)`

Requires Agent E `FbxBenchmarkLoaded.v1`. It inventories child occurrences, counts supports separately, and returns component counts by outer and raw type. Raw benchmark arrays are rejected.

### Component identity policy validation

`validateComponentIdentityPolicy(policy)` validates the closed structural contract. It rejects non-multimap indexes, duplicate merging, greedy collision resolution, passing diagnostic rules, non-one-to-one cardinality, overlapping type catalogs, incomplete scope keys, and malformed frozen-policy identities.

`validateFrozenComponentIdentityPolicy(policy)` additionally recomputes `policyContentSha256` from the canonical normalized policy with the identity field set to `null`. A merely well-formed or caller-supplied digest cannot establish frozen authority.

A `ZONE` identity rule must use `zoneIds`. Shared-boundary membership is a set and is never collapsed to an arbitrary single zone.

### `buildComponentSubjects(loadedBenchmark, policy, side, options)`

Required inputs:

```text
Agent E FbxBenchmarkLoaded.v1
options.zoneIndex
options.benchmarkIdentity
```

Occurrence structure and lookup coverage are validated before use. Supports are excluded from Agent C's component population. Identical semantic components remain distinct through multiplicity indexes ordered by the stable occurrence handles supplied by Agent E.

The zone index must be a valid `FbxZoneMembershipIndex.v1`, match the benchmark identity, and exactly cover the loaded branch occurrences. `CONFLICT`, `UNASSIGNED`, and `EXCLUDED` records remain visible but block qualification. No coordinate, file-order, or naming inference assigns zones.

### `qualifyComponents(options)`

Requires separately loaded reference and actual benchmarks plus separate reference and actual zone indexes. It requires a content-verified frozen identity policy and produces `FbxComponentBenchmarkReport.v1` with complete two-sided ledgers, occurrence evidence, ranked identity evidence, conflict-preserving collision groups, atomic one-to-one reservations, family comparison evidence, zone evidence, and deterministic summaries.

Numeric comparisons have no fallback tolerance. Missing tolerance rules produce blocked evidence. Structural and spatial diagnostic rules may expose candidates but cannot reserve a passing match or create a blocking collision group.

A later approved rule may resolve an earlier collision only within that collision group's reference and actual candidate sets. It cannot pair a colliding subject with an unrelated counterpart outside the original group.

## Evidence retained

Every component ledger locator includes:

```text
sourceOccurrenceId
branchOccurrenceId
branchId
owner
canonicalSubjectPayloadSha256
multiplicityIndex
zoneMembership
```

The complete zone membership record preserves `branchName`, `status`, `authority`, `zoneIds`, `candidateZoneIds`, and `exclusionReason`. Common comparisons evaluate status and the canonical zone set. Authority differences are observation-only; membership differences fail.

`executionIdentity` binds:

```text
reference and actual FbxBenchmarkLoaded.v1 content SHA-256 and byte length
verified component identity policy ID and content SHA-256
tolerance profile identity when supplied
reference and actual zone-index SHA-256 identities
```

## Built-in comparator IDs

```text
PIPE.v1
ELBOW.v1
TEE.v1
REDUCER.v1
FLANGE.v1
VALVE.v1
GASKET.v1
BRANCH_FITTING.v1
INSTRUMENT.v1
```

Selecting a comparator in a frozen type catalog is an authority decision. Orientation text remains observation-only until its grammar and frame semantics are frozen.

## Tests

`test-component-benchmark.mjs` covers E occurrence consumption, schema admission, Z-index binding, zone-set scope, deterministic semantic identities, exact matching, and approved composite matching.

`test-component-benchmark-adversarial.mjs` covers duplicate collisions, approved collision resolution, policy-hash forgery, diagnostic-only evidence, family/attribute/geometry failures, missing and unexpected components, absent tolerances, observation-only differences, unknown types, cross-zone mismatches, zone conflicts, and forged zone coverage.

`test-component-matching-boundaries.mjs` proves that later rules can resolve an earlier collision only within the original candidate group and cannot escape to unrelated counterparts.

`test-component-benchmark-inventory.mjs` loads the immutable benchmark through Agent E and asserts 37 branches, 354 components, 145 supports, 536 occurrences, and the complete observed outer/raw type populations.

## Remaining qualification blockers

- No frozen production component identity policy exists.
- No frozen tolerance profile exists.
- No approved actual zone manifest exists.
- `GASK`, `OLET`, `INST`, synthetic `PIPE`, `BEND`, tee third-port, specification, material, and orientation authorities remain unresolved.
- The real benchmark and complete FBX suite still require exact-head execution by the integration lead.
