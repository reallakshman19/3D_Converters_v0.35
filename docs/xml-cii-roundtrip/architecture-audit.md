# EnrichedXML ↔ CII R1 — Stage 0 architecture audit (partial)

Task: `XML-CII2019-ENRICHEDXML-ROUNDTRIP-LOSSLESS-R1`  
Audited live baseline: `main@3394c022f9400f05a736948033d26eb46274446c` (2026-11-08)  
Status: **PARTIAL — HOLD**; source-backed editing is not enabled.

## Actual active route

1. `runXmlCii2019WorkflowService` merges effective weight overrides, preview/manual facts and support-mapper rules into `supportConfigJson` (`xml-cii-workflow-service.js`).
2. The `xml` route invokes `enrichStandaloneXmlForRun`: JavaScript run-parity enrichment, DTXR annotations and Preview/process/weight resolution. It verifies parity evidence before release.
3. The exact JavaScript output is `finalRigidReviewEvidence.engineInputText`. It is **not** the post-Python-preprocessing XML.
4. The service hands `engineInputText`, staged JSON and effective configuration to `runXmlCii2019StandaloneEngineJob`.
5. `converters/xml-cii-2019-standalone/engine.js` uses Pyodide and `buildStandaloneCiiInvocation` to execute **`xml_to_cii2019_runtime_custody.py`**, not simply `xml_to_cii2019.py`. The invocation includes coordinates mode, weight scale, staged JSON, support JSON, restraint-resolution toggle and split setting.
6. The runtime-custody Python wrapper applies staged-json enrichment, process-field mapping, bend-radius policy and restraint authority. It delegates to the patched converter and base model/writer. Negative length-bearing FLAN/RIGID source nodes may be renumbered by Python; zero/unknown weight fields may be overwritten or defaulted.
7. The writer emits final CII fixed-width sections. `xml-cii-final-rigid-inventory.js` decodes final 15-line ELEMENT records and 1-based RIGID auxiliary pointers. It does **not** establish physical component mass ownership.
8. `xml-cii-final-rigid-source-context.js` uses branch, exact FROM/TO, geometry tolerance and component candidates for *read-only* engineering context. A context match alone is not sufficient proof of an inverse to original XML.

## Critical identity decisions

- R1 canonical editable *candidate* is the exact run-pinned **engine-input XML**, not the earlier uploaded XML and not CII. This is a candidate until no-edit replay and the edit-preservation test pass.
- A CII NODE number is not an auxiliary pointer; source ComponentRefNo is neither.
- Stable source-key candidates use the engine-input digest, branch ordinal and node ordinal. Renumbered/deleted original source identities require additional transformation provenance and remain unresolved.
- One source may affect multiple output RIGIDs; sharing is **not** proof of a permissible mass allocation.
- Source-context status VERIFIED means the existing context evidence matched an engine-input edge, not that the original physical mass owner or inverse has been proven.
- Source-based editing is disabled until dependency closure, override checks, converter read-back and authentic no-edit parity qualify it.

## Replay design and limitations

The new `createPinnedReplayJob` takes already-enriched `engineInputText` and directly calls the **existing low-level engine**, instead of `runXmlCii2019WorkflowService` (which reapplies JavaScript enrichment). Python-side preprocessing remains active. All effective options, staged JSON, support config and executable engine identity must be pinned.

Topology-fix modes are explicitly refused until their selection and generated artifacts can be replayed exactly. Real-engine evidence is distinguished from an injected test runner. No-edit acceptance requires identical bytes/digest, CONTROL counts and RIGID pointer relationships; additional section and engineering validation remains required for edited conversion.

## Known potential overwrite points

- JavaScript Preview/process/weight run parity can update node `Weight`, `WallThickness`, `Rating` and other source fields.
- Split-rigid weight propagation can assign weights to sibling nodes.
- Post-split length cleanup can remove nodes at a configured threshold; it must not be treated as an unconditional 6 mm rule.
- Python staged-json enrichment and process-field transforms can change the actual conversion XML.
- Python process mapping sets some component weights to zero and can renumber negative FLAN/RIGID nodes.
- Writer chooses RIGID weight from specific edge endpoints and applies configured scale. Source mass cannot be presumed one-to-one with RIGID records.
- Source values may be altered by fixed-width serialization.

## Source and standard verification

The primary Hexagon neutral-file documentation and the companion Basic Element Data URL were attempted, but were not accessible to the automated web client. Exact on-disk offsets and section contracts are grounded in the repository's real writer, `cii2019_section_rules.py` and the existing RIGID inventory. Unverified claims about Version 13/14/15 equivalence have **not** been introduced.

## Remaining qualification / non-execution

- Authentic 433-ELEMENT / 144-RIGID GLRD inputs, hydrated masters and complete run snapshot: **NOT_RECEIVED / NOT_RUN**.
- No-edit parity against the authentic CII with exact effective engine identity: **NOT_RUN**.
- Complete source→intermediate→original lineage across all generated and deleted nodes: **NOT_IMPLEMENTED**.
- Python stage trace hooks, inverse RIGID mass ownership and allocation proof: **NOT_IMPLEMENTED**.
- Source-preserving XML patcher, verified edited round-trip, UI and browser downloads: **NOT_IMPLEMENTED**.
- Production acceptance: **HOLD**; no source-based editing entry point is enabled.

This audit records inspected source, not a claim that the complete R1 task is qualified.
