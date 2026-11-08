# XML → CII 2019 coder qualification — source understanding

**Task:** `XML-CII2019-CODER-QUALIFICATION-SAMPLE-R1`  
**Inspected baseline:** `main@3394c022f9400f05a736948033d26eb46274446c`  
**Qualification scope:** one uniquely identified positive, retained `RIGID` TO-node with known `ComponentRefNo`, no external masters/staged JSON/overrides and a pinned 10× output weight multiplier. Do not generalize this proof to all source nodes.

## Exact source trace

1. **Reads EnrichedXML `Node/Weight`:** `converters/scripts/xml_to_cii2019.py`, `_parse_xml_document` at lines 501–630; reads `_child_text(node_element, namespace, "Weight")` with `_parse_optional_float` at lines 574–579, assigning default `0.0` if absent. Parses `NodeNumber`, `Rigid`, `ComponentType`, geometry and other fields into `XmlNode`. `ComponentRefNo` is **not** stored in `XmlNode`; it must be preserved independently from the original XML.

2. **Forms final ELEMENTS:** `_build_edges` at lines 705–725 constructs edges between consecutive retained branch nodes. `_build_elements_payload` at lines 1104–1227 builds the 15 physical lines per emitted ELEMENT, using FROM/TO node numbers, position deltas, dimensions and auxiliary record pointers. The active runtime-custody converter overrides this payload builder with `xml_to_cii2019_patched.py::_patched_elements_payload_factory` (lines 672–706) for process cases; its pointer ordering remains aligned with the base writer.

3. **Creates RIGID records:** `_build_rigid_indices` at lines 817–826 selects edges whose TO node has `rigid == 2`, or whose FROM node is rigid with TO `ComponentType == "FLAN"`. `_rigid_weight_for_edge` at lines 1269–1286 selects the weight; `_build_rigid_payload` at lines 1289–1294 multiplies by `weight_scale` and emits the auxiliary lines. `_build_cii_text` at lines 1658–1730 assembles all named sections and CONTROL counts.

4. **ELEMENT → RIGID reference:** `_build_elements_payload` looks up `model.edge_to_rigid_index.get(edge_index, 0)` (line 1176), writing it in **physical ELEMENT line 13, second integer field** (lines 1181–1190). The pointer is **1-based within the current `#$ RIGID` section**; zero means no reference. `#$ CONTROL` row 2, second count is the number of RIGID records.

5. **Weight selection:** `_rigid_weight_for_edge`: if `edge.to_node.rigid == 2`, take `edge.to_node.weight`. Otherwise, for a FROM-rigid → TO-`FLAN` edge, also take the **TO/flange** node's weight, not the FROM-rigid weight. Otherwise zero. The sample allows only the first case to avoid silently extending mass ownership policy. `--weight-scale 10` converts source mass 15 to output 150 and 2.984 to output 29.84 *according to this configured multiplier*, not by asserting a universal SI conversion.

6. **Renumbering and deletion:** `xml_to_cii2019_patched.py::_renumber_length_bearing_negative_nodes` at lines 358–385 can replace eligible negative `FLAN`/`RIGID` nodes with generated positive NodeNumbers; it is called by `_apply_process_data_to_xml` at lines 387–441 when the split option is enabled. `xml_to_cii2019.py::_parse_xml_document` calls `_drop_short_element_nodes` at line 627; the cleanup function at lines 649–703 removes arriving node blocks whose recomputed span length is ≤6 mm in the current code. The qualified sample uses a positive retained TO node and a 100 mm segment; neither case is inferred from CII geometry.

7. **Why RIGID pointer is not stable source identity:** it is assigned in `_build_rigid_indices` by enumerating **emitted** edges after renumbering/cleanup and is not `ComponentRefNo` or XML node identity. Splits, deletions and output-order changes may alter pointer numbers even if physical component identity persists. The sample verifies the original source branch/node ordinal, `NodeNumber`, `ComponentRefNo`, parser-retained edge and regenerated element connectivity separately before using the current generated pointer to read back its RIGID weight.

## Identity vocabulary

| Term | Meaning / stability |
|---|---|
| Original EnrichedXML node identity | Original document digest + unique branch ordinal/name + node ordinal/number + ComponentRefNo; edit authority needs exact XML Weight token span |
| Source ComponentRefNo | Physical-component label in XML; can occur on multiple nodes and is **not** CII pointer |
| CII NodeNumber | Graph node identifier, may be generated or renumbered; not source identity by itself |
| CII ELEMENT index | 1-based emitted edge order, can change on new conversion |
| CII RIGID pointer | 1-based index into RIGID auxiliary section, stored in ELEMENT's integer pointer line; can change |

## Actual runner

`converters/scripts/xml_to_cii2019_runtime_custody.py::main` (lines 151–225) obtains CLI settings from `xml_to_cii2019_patched.py::_parse_args`, applies Python-side process and split handling, parses XML with `base._parse_xml_document`, builds a model with patched logic, installs active runtime payload functions, then calls `base._build_cii_text`. The qualification invokes this **unmodified real executable** with the exact same pinned command for baseline, no-edit replay and revised XML. It does not invoke a replacement CII serializer, nor patch any CII bytes.

The scope deliberately rejects external configurations, overrides, generated-node lineage, multi-owner components, short-element drops and unsupported XML lexical structures until fully qualified. Structural acceptance is checked using `converters/scripts/cii2019_section_rules.py::assert_cii2019_sections_valid`, with additional explicit element/pointer and non-target byte comparisons.
