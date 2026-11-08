# XML ↔ CII source-backed round-trip: initial architecture audit (R1)

Status: **PARTIAL — HOLD**. Baseline source `main@3394c022f9400f05a736948033d26eb46274446c`.
This document records source observations; it is NOT a complete executable GLRD configuration or a round-trip qualification certificate.

## Actual conversion boundary

1. `xml-cii-workflow-service.js` merges weight overrides, preview/manual facts and support rules into `supportConfigJson` and calls `enrichStandaloneXmlForRun`.
2. `xml-cii-standalone-run-parity.js` may apply staged-source matching, split-node enrichment, process mapping, DTXR and Weight Match facts; its `parity.xmlText` is handed to the engine.
3. `xml-cii-workflow-engine-client.js` invokes `converters/xml-cii-2019-standalone/engine.js`.
4. `engine.js` passes that XML to the Pyodide Python runtime. `invocation-builder.js` selects `xml_to_cii2019_runtime_custody.py`, with `supportConfigJson`, staged JSON, split, restraint and weight-scale options.
5. The runtime custody wrapper uses `xml_to_cii2019_patched.py` and the base `xml_to_cii2019.py`. Python can still rewrite/process the engine-input XML, renumber negative length-bearing nodes, apply staged/config values and transform the model before writing fixed-width CII.
6. A requested TopoFix transaction may replace the input XML for CII; the ordinary run-parity engine-input evidence then is not the exact final input chosen for conversion.

Consequences: The first replay adapter operates at the exact **engine-input** boundary and invokes the existing engine with `cii-only`. It MUST NOT route that already-enriched XML through `runXmlCii2019WorkflowService` again. TopoFix CII substitution is held until the actual post-TopoFix writer input is captured.

## Identity and editing restrictions

* A node number is not an ELEMENT index, and neither is a 1-based auxiliary pointer.
* The RIGID parser reads 15 physical lines per ELEMENT, the RIGID pointer from ELEMENT line 13, and the RIGID record from the RIGID section. This is a validated output-reader contract, not source ownership.
* Existing `buildFinalRigidSourceContexts` qualifies exact branch, FROM/TO and geometry matches and can return read-only bore/rating information. It does not provide complete XML byte selectors, every deleted/split/generated-node transition, or every dependency through converter overrides.
* The initial lineage projection always has `editable: false`. Even an `EXACT_UNIQUE` contextual edge requires additional provenance and a full allocation/override check before authorizing an XML `Node/Weight` edit.
* No direct-CII transaction files, UI controls, original XML, or original CII have been modified in this initial slice.

## External documentation

The user-provided Version 14 Hexagon URL may be inaccessible through automated clients. Accessible official guides describe fixed-width neutral ELEMENTS and the separate RIGID auxiliary array. Version 12 describes a different RIGID array from Version 13, so version-specific writer behavior must come from the actual repository writer and authenticated reference, not assumed common across releases.

- [Hexagon basic element data, Version 13](https://docs.hexagonppm.com/r/en-US/CAESAR-II-Users-Guide/Version-13/1281862)
- [Hexagon auxiliary element data, Version 13](https://docs.hexagonppm.com/r/en-US/CAESAR-II-Users-Guide/Version-13/1281863)
- [Hexagon auxiliary element data, Version 14](https://docs.hexagonppm.com/r/en-US/CAESAR-II-Users-Guide/Version-14/1471418)

## First gate

The `roundtrip/xml-cii-roundtrip-snapshot.js` and `roundtrip/xml-cii-roundtrip-reextract.js` modules stage a no-edit replay. They enforce source/config/engine identity and report exact SHA-256 and byte comparison, plus structural RIGID inventory parity. They do **not** publish any regenerated CII.

The CI smoke test may demonstrate repeatability of a smaller repository GLRD source. It is not equivalent to reproducing the Owner's configured 433-ELEMENT / 144-RIGID GLRD conversion. The authentic run-pinned XML, hydrated config/masters, staged JSON, converter version and original emitted CII remain mandatory for that acceptance gate.

## Remaining required work / HOLD

- Freeze all effective converter inputs including the actual Python/preprocessing input and post-TopoFix data when used.
- Replay the **authentic** Owner conversion with byte-identical original CII evidence (Gate A).
- Establish complete source-node and source-weight dependency lineage, including synthetic/deleted/split cases.
- Audit all requested properties for losslessness; generate selector-backed XML patch plans only after the audit.
- Implement targeted XML patches, RIGID weight vertical slice, real converter read-back, atomic transactions, UI integration and the full 24-test + mutation matrix.
- No revised CII publication, GO verdict, merge or deployment is authorized by this slice.
