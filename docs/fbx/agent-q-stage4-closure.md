# Agent Q Stage 4 — Integrated Audit Closure

Stage 4 supersedes the stale Agent Q PR #319 and restacks its audit-only modules on the merged Stage 1–3 evidence chain. It does not change FBX parsing, conversion, mapping, StagedJSON generation, support behavior, topology production, or benchmark data.

## False-pass paths closed

1. `BLOCKED_AUTHORITY` now permits exactly one consumed occurrence, never one-to-many or many-to-one.
2. Agent C reconciliation populations are derived from the exact reference and actual `FbxBenchmarkLoaded.v1` occurrences, excluding supports, rather than from the report ledger.
3. An unconsumed actual component must retain producer state `UNEXPECTED_ACTUAL`; Agent Q cannot silently relabel it `BLOCKED_IDENTITY`.
4. Agent T coverage and overall producer status are mandatory. Unrepresented entities or relationships block admission, and producer `FAIL` or `BLOCKED` dominates an independently passing ledger.
5. Exact-head observations can be derived from Git and repository bytes through `FbxExactHeadObservationSpec.v1`; caller-provided observations alone are not repository evidence.
6. All Agent Q suites, including the Stage 4 adversarial closure suite, are registered and protected exactly once.

## Evidence-chain gate

`auditLineageDerivationAuthority()` binds:

```text
FbxBenchmarkLoaded.v1
FbxBenchmarkSourceBinding.v1
FbxBenchmarkLineageAccounting.v1
FbxBenchmarkProducerAuthority.v1
FbxBenchmarkDerivationAuthority.v1
```

It validates benchmark identities, source-binding hashes, producer authority, lineage and derivation coverage, and cross-artifact hashes. The current real chain is expected to remain `BLOCKED` because the RMSS/ATT input identity, generation command, routing options, support-mapper configuration, and real Stage 2/3 artifacts are not yet bound.

## Exact-head execution

```text
node scripts/fbx/build-agent-q-exact-head-evidence.mjs <authority.json> <observation-spec.json> [output.json]
```

The observer derives repository commit, repository tree, checkout cleanliness, benchmark path, benchmark commit, benchmark Git blob, benchmark content SHA-256, and benchmark byte length. Remaining policy, schema, manifest, and evidence identities are read from explicitly declared repository files or JSON fields.

The CLI defaults regression and determinism statuses to `BLOCKED`; they must be explicitly supplied as `PASS` by the exact-head execution environment.

## Certification boundary

Stage 4 closes Agent Q implementation false-pass paths. It does not make benchmark provenance complete and does not grant benchmark or release certification while Stage 1–3 authority remains blocked or real exact-head execution is absent.
