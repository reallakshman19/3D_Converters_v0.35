# Automatic whole-model StagedJSON

When no mapping file is supplied, the converter may analyse every preview zone using the existing per-zone PIPE classifier.

## Corrected orchestration

- Zone IDs are validated, deduplicated, and sorted.
- Analysis uses bounded concurrency; it no longer launches every zone simultaneously.
- Every admitted zone's locally numbered branch IDs and names are deterministically namespaced from the zone identity.
- Branch `CREF` values are rewritten with the same namespace map.
- Global branch and component identities and `CREF` targets are validated before publication.
- A full result is `STAGEDJSON_PASS` only when every zone passes.
- A result containing admitted zones plus blocked or errored zones is explicitly `STAGEDJSON_PARTIAL_PASS`.
- No admitted branch, zone error, blocked-zone count, or original stderr evidence is silently discarded.

## Failure behavior

Malformed staged payloads, duplicate zone IDs, unresolved cross-references, duplicate global identities, unavailable geometry evidence, or zero admitted branches block whole-model publication and preserve the source-graph fallback.

Per-zone classification rules are unchanged. This module provides resource-bounded orchestration and identity-safe merging; it does not widen `FbxAutoPipeProfile.v1`.

## Remaining source-specific evidence

The mechanism is covered by synthetic and Worker-path tests. A real TAY-A run remains required to claim that TAY-A itself produces a complete zero-click StagedJSON result.
