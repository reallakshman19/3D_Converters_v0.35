# Source understanding — XML-CII2019 coder qualification sample R1

**Inspected repository:** `reallakshman19/3D_Converters_v0.35`  
**Immutable baseline:** `3394c022f9400f05a736948033d26eb46274446c`  
**Scope:** direct, *already-EnrichedXML* → existing Python runtime-custody converter. This does not claim to invert the JavaScript Preview/enrichment stages, and does not enable editing on nonunique physical mass ownership.

## Actual functions, grounded in baseline

1. **Read `Node/Weight`:** `converters/scripts/xml_to_cii2019.py::_parse_xml_document` (approx. lines 500–615), with `_child_text(node_element, namespace, "Weight")` (around 573–586) and `_parse_optional_float`. Missing weight becomes `0.0`. `XmlNode.weight` is populated before edge construction. This function also skips nonpositive `NodeNumber` nodes and reads `ComponentType`, `Rigid`, `Position`, `Endpoint`.
2. **Build ELEMENT records:** `xml_to_cii2019.py::_build_edges` (around 706–722) constructs adjacent node-pair edges in branch order. `_build_elements_payload` (around 1109–1240) serializes one 15-line CII ELEMENT block per edge. Its first numeric row contains FROM, TO and geometry. The branch-name metadata is length-prefixed at block row 11.
3. **Build RIGID records and weights:** `xml_to_cii2019.py::_build_rigid_indices` (around 816–827) creates the ordered one-based RIGID index set. `_rigid_weight_for_edge` (around 1271–1287) resolves owner node's weight. `_build_rigid_payload` (around 1289–1296) writes the one-line record with `weight * weight_scale`.
4. **ELEMENT→RIGID pointer:** `_build_elements_payload` puts `model.edge_to_rigid_index[edge_index]` (zero when absent) into the **second numeric slot of ELEMENT row 13**, i.e. `block[12].split()[1]` for the 15-line block. The pointer is a **1-based auxiliary record index**, not a node number. `converters/scripts/cii2019_reparse_proof.py::parse_cii2019` (around 131–179) independently parses the pointer and other indices.
5. **Weight FROM/TO policy:** `_rigid_weight_for_edge` returns **TO.weight** when `TO.rigid == 2`; for `FROM.rigid == 2` and `TO.component_type == "FLAN"`, the edge still uses **TO (flange) weight**, never the upstream FROM weight. Otherwise `0.0`. This sample qualifies only the single unambiguous TO-owned case and refuses cross-owner/split cases.
6. **Renumbering/deletion:** `converters/scripts/xml_to_cii2019_patched.py::_renumber_length_bearing_negative_nodes` (approx. lines 355–387) can renumber negative length-bearing FLAN/RIGID nodes when split is configured, during `_apply_process_data_to_xml` (approx. 389–440). `xml_to_cii2019.py::_parse_xml_document` (around line 628) calls `_drop_short_element_nodes` (around 639–700), which removes arriving node blocks whose newly calculated segment length is **≤6 mm**, and may transfer restraint specifications. JS may also perform split weight propagation and cleanup earlier: `converters/xml-cii2019-core/split-rigid-weight-propagation.js` and `xml-cii-node-block-cleanup.js`.
7. **Why pointers are not permanent:** RIGID pointer numbers are ordinal indices in **the emitted list of qualifying edges**. Splitting, deletion, renumbering, reordering or changes to `rigid==2` recompute the list. Two different files may therefore use the same numeric RIGID pointer for different physical components. An exported CII pointer cannot be substituted for `ComponentRefNo` or original-source node identity.

## Five non-interchangeable identities

| Identity | Meaning | Stability/authority |
|---|---|---|
| CII NodeNumber | Numeric endpoint identifier in ELEMENT FROM/TO slots | May be renumbered or repeated in different branches; not a physical owner |
| CII ELEMENT index | 1-based ordinal of a 15-line emitted ELEMENT block | Recomputed for each conversion; not a source identity |
| CII RIGID pointer | 1-based index of an auxiliary `RIGID` record, referenced from ELEMENT row 13 slot 2 | Changes with emitted rigid-edge list |
| Source ComponentRefNo | Original XML's physical-component reference (e.g. `/COMP-001`) | Necessary clue but **not sufficient alone**; can repeat at endpoints |
| Original EnrichedXML node identity | Run-pinned XML SHA-256 + exact Branch occurrence + Node occurrence + source `NodeNumber` + `ComponentRefNo` | Source-backed selector; only valid against same pinned original XML bytes, never inferred from generated CII node numbers |

## Actual invoked converter and reproducibility

- `converters/xml-cii-2019-standalone/invocation-builder.js::buildStandaloneCiiInvocation` selects `xml_to_cii2019_runtime_custody.py` for XML source mode, including effective support config, weight scale, split and restraint flags.
- `converters/scripts/xml_to_cii2019_runtime_custody.py::main` (around 150–222) invokes staged enrichment, process mapping, bend-radius policy, parses XML, constructs model, and writes CII through `base._build_cii_text`.
- `converters/scripts/cii2019_section_rules.py::assert_cii2019_sections_valid` validates structural sections and declared CONTROL counts.
- `converters/scripts/cii2019_reparse_proof.py::parse_cii2019` reparses emitted ELEMENT records and auxiliary pointers.

**Sample policy:** use the real runtime-custody script with pinned `--coords-mode first`, `--weight-scale 10`, explicitly disabled condensed split, no staged JSON, and explicit effective `--support-config-json '{}'`. The source sample has 2+ nodes more than 6 mm apart, a unique physical component reference, TO `Rigid=2`, explicit positive source weight, and no overlapping source ownership. Refuse absent lineage rather than guessing by geometry/nearest weight.

**Critical bound:** Successful one-component source edit is **not** proof of full bidirectional CII recovery; no physical-mass estimate/cross-component override can be accepted by this qualification.
