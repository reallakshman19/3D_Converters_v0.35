# FBX Source-to-Benchmark Lineage — Stage 2

## Scope

Stage 2 adds deterministic branch and direct-child occurrence accounting between:

```text
FbxSourceGraph.v2
FbxBenchmarkLoaded.v1
FbxBenchmarkSourceBinding.v1
```

It is qualification-only evidence. It does not change FBX parsing, conversion, mapping, StagedJSON output, component qualification, support qualification, topology qualification, or Agent Q reconciliation behavior.

## Authority boundary

The accounting engine admits only exact identity-token equality. Source tokens are the retained `displayName` and `domSourceName`, with removal of the literal FBX `Model::` namespace prefix. Benchmark tokens are `record.attributes.NAME` and `record.name`.

A candidate component becomes `DIRECT_ENGINEERING_RECORD` only when its connected candidate component contains exactly one source occurrence and one benchmark occurrence. All other states remain `UNRESOLVED`:

```text
SOURCE_ONLY
BENCHMARK_ONLY
AMBIGUOUS
BRANCH_UNRESOLVED
```

Stage 2 does not authorize:

- component-name normalization;
- type-family equivalence;
- geometry proximity matching;
- coordinate or ordering inference;
- synthetic pipe or gasket consumption;
- geometry-only classification;
- exclusion policy;
- support-class equivalence.

Those decisions belong to Stage 3 and require separately frozen authority.

## Population binding

The real run must match the merged Stage 1 populations exactly:

```text
source branches:          37
source direct children:   441
benchmark branches:       37
benchmark children:       499
net benchmark difference: 58
```

Population drift blocks artifact construction before matching begins.

## Evidence artifact

`FbxBenchmarkLineageAccounting.v1` contains:

- the Stage 1 binding SHA-256;
- the bounded source accounting-projection SHA-256;
- the exact benchmark content SHA-256 and byte length;
- repository parser provenance;
- complete branch accounting;
- complete two-sided child ledgers;
- candidate collision evidence;
- exact coverage and duplicate-consumption invariants;
- a fail-closed `PASS` or `BLOCKED` status.

The source accounting projection includes only branch/direct-child occurrence identity and the source-object fields used by Stage 2. It does not falsely claim to hash the complete geometry graph.

## Real execution

From a complete repository checkout:

```text
node scripts/fbx/build-source-benchmark-lineage.mjs /absolute/path/to/fbxtaya.fbx
```

Default output:

```text
.qualification/fbx-benchmark/FbxBenchmarkLineageAccounting.v1.json
```

The CLI verifies the exact source bytes and benchmark Git blob through the merged Stage 1 binding before invoking the production Node/WASM parser.

## Exit condition

Stage 2 is implementation-complete when the focused tests pass and the real CLI produces a schema-valid artifact with exact two-sided coverage. A `BLOCKED` artifact is expected while normalized and synthetic authorities remain unresolved; it is not a test failure or a benchmark certification.
