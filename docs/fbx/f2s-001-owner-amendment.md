# F2S-001 Owner Amendment — promotion evidence scope

Status: governing clarification for Issue #251 and PR #254.

F2S-001 remains responsible for deterministic native StagedJSON publication of explicitly mapped two-port `PIPE` occurrences. Its parser evidence acceptance is clarified as follows:

1. Exact promotion-relevant ufbx categories, display names, source IDs, typed IDs, hierarchy, connections, geometry ownership and custom properties are required for `NODE`, `MESH` and `NURBS_CURVE` objects used by the mapping boundary.
2. FBX object categories outside the F2S-001 promotion surface must remain explicit unsupported records. The parser bridge may quarantine them as `OTHER`; they cannot be promoted or treated as fully classified.
3. Complete DOM class/subtype/source-name fidelity for all non-promotable FBX categories is deferred to the next source-fidelity Work Pack. F2S-001 must state this limitation and must not claim complete all-class preservation.
4. Native StagedJSON acceptance now requires proof through the existing topology source-model and connectivity boundaries, not only `normalizeStagedJson()`.
5. Mapped ports must project to native `APOS`/`LPOS`; disconnected mapping components must be separated into different branches; non-linear or cyclic PIPE graphs must fail `BLOCKED_STAGEDJSON_CONTRACT`.
6. Parse failure must not emit an incomplete artifact labeled `FbxSourceGraph.v1`.
7. Canonical source and mapping collections must use stable-key ordering independent of parser iteration or manifest input order.

This clarification narrows unsupported non-engineering provenance rather than relaxing any promotion, topology, transform, deterministic-output or fail-closed requirement.
