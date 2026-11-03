import importlib.util
import json
import os
import pathlib
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

SPEC = importlib.util.spec_from_file_location("xml_to_cii2019_patched", ROOT / "xml_to_cii2019_patched.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

ACTUAL_XML = REPO / "CII error" / "BM8" / "1885" / "1885-GH-TYP-04-STEAM-02.xml"
ACTUAL_JSON = REPO / "CII error" / "1885s.json"
PIPING_CLASS = REPO / "docs" / "Masters" / "Piping_class_master.json"
MATERIAL_MAP = REPO / "docs" / "Masters" / "PCF_MAT_MAP.TXT"
WEIGHTS = REPO / "docs" / "Masters" / "wtValveweights.json"
UI_ENHANCER = REPO / "viewer" / "tabs" / "model-converters-ui-enhancements.js"


def _artifact_dir():
    raw = os.environ.get("XML_CII_ARTIFACT_DIR", "").strip()
    if not raw:
        return None
    path = pathlib.Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _parse_material_map_rows(path: pathlib.Path):
    rows = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        parts = line.strip().split(maxsplit=1)
        if len(parts) == 2 and parts[0].isdigit():
            rows.append({"code": parts[0], "material": parts[1]})
    return rows


def _branch_with_name(root, suffix):
    for branch in root.iter():
        if branch.tag.split('}', 1)[-1] != 'Branch':
            continue
        name = next((c.text or '' for c in branch if c.tag.split('}', 1)[-1] == 'Branchname'), '')
        if suffix in name:
            return branch
    raise AssertionError(f"branch containing {suffix} not found")


def _child_text(parent, name):
    for child in list(parent):
        if child.tag.split('}', 1)[-1] == name:
            return (child.text or '').strip()
    return ''


def _nodes(branch):
    return [n for n in list(branch) if n.tag.split('}', 1)[-1] == 'Node']


def _find_node(branch, node_number):
    for node in _nodes(branch):
        if _child_text(node, "NodeNumber") == str(node_number):
            return node
    raise AssertionError(f"node {node_number} not found")


def _restraint_types(node):
    return [_child_text(rest, "Type") for rest in list(node) if rest.tag.split('}', 1)[-1] == 'Restraint']


def _first_element_values(cii_text: str, count: int = 36):
    lines = cii_text.splitlines()
    start = lines.index("#$ ELEMENTS") + 1
    values = []
    for line in lines[start:]:
        if line.startswith("#$ "):
            break
        for token in line.split():
            try:
                values.append(float(token))
            except ValueError:
                pass
        if len(values) >= count:
            return values[:count]
    return values


def _write_xml(path: pathlib.Path, node_numbers):
    branch_xml = []
    x = 0
    for branch_index in range(2):
        first, second = node_numbers[branch_index * 2: branch_index * 2 + 2]
        branch_xml.append(f"""
        <Branch><Branchname>/B{branch_index + 1}</Branchname>
          <Node><NodeNumber>{first}</NodeNumber><ComponentType>FLAN</ComponentType><ElementLengthMm>100</ElementLengthMm><InsulationThickness>0</InsulationThickness><Position>{x} 0 0</Position></Node>
          <Node><NodeNumber>{second}</NodeNumber><ComponentType>RIGID</ComponentType><ElementLengthMm>100</ElementLengthMm><InsulationThickness>0</InsulationThickness><Position>{x + 1} 0 0</Position></Node>
        </Branch>""")
        x += 2
    path.write_text(f"<PipeStressExport><RestrainOpenEnds>No</RestrainOpenEnds><Pipe>{''.join(branch_xml)}</Pipe></PipeStressExport>", encoding="utf-8")
    return path


def test_actual_repo_files_and_masters_are_present_with_expected_counts():
    assert ACTUAL_XML.exists(), ACTUAL_XML
    assert ACTUAL_JSON.exists(), ACTUAL_JSON
    assert PIPING_CLASS.exists(), PIPING_CLASS
    assert MATERIAL_MAP.exists(), MATERIAL_MAP
    assert WEIGHTS.exists(), WEIGHTS
    assert UI_ENHANCER.exists(), UI_ENHANCER
    piping_class_count = len(json.loads(PIPING_CLASS.read_text(encoding="utf-8-sig")))
    material_count = len(_parse_material_map_rows(MATERIAL_MAP))
    weights_count = len(json.loads(WEIGHTS.read_text(encoding="utf-8-sig")))
    assert piping_class_count == 10699
    assert material_count == 383
    assert weights_count == 1595
    artifacts = _artifact_dir()
    if artifacts:
        (artifacts / "master-counts.json").write_text(json.dumps({
            "pipingClassRows": piping_class_count,
            "materialMapRows": material_count,
            "weightRows": weights_count,
            "xml": str(ACTUAL_XML.relative_to(REPO)),
            "json": str(ACTUAL_JSON.relative_to(REPO)),
        }, indent=2), encoding="utf-8")


def test_actual_bm8_pipeline_outputs_insulation_density_hydro_pressure_and_cii_positions(tmp_path):
    cfg = {
        "insulationDensityDefault": 210,
        "dtxrPositionOffset": {"enabled": True, "xOffset": 150500, "yOffset": 43000, "zOffset": 100000, "tolerance": 0.5},
        "linelist": {
            "lineKeyTokenPositions": "4",
            "masterRows": [
                {"lineNo": "S8810101", "__EMPTY_12": "Density", "__EMPTY_14": "Mixed kg/m³", "__EMPTY_23": "Pressure Min kPa(g)", "__EMPTY_24": "Temp Max ºC", "__EMPTY_25": "Temp Min ºC", "__EMPTY_27": "Insulation Type", "__EMPTY_28": "Insulation Thickness [mm]", "__EMPTY_32": "Test Pressure"},
                {"lineNo": "S8810101", "__EMPTY_12": "Gas kg/m³", "__EMPTY_14": "-", "__EMPTY_23": "FV", "__EMPTY_24": "82", "__EMPTY_25": "0", "__EMPTY_27": "-", "__EMPTY_28": "50", "__EMPTY_32": "kPa(g)"},
                {"lineNo": "S8810101", "__EMPTY_12": "8.44", "__EMPTY_14": "42.8", "__EMPTY_23": "0", "__EMPTY_24": "260", "__EMPTY_25": "5", "__EMPTY_27": "PP", "__EMPTY_28": "40", "__EMPTY_32": "15000"},
            ],
            "fieldMap": {},
        },
    }
    mod._normalize_process_field_map(cfg)
    fm = cfg["linelist"]["fieldMap"]
    assert fm["t1"] == "__EMPTY_24"
    assert fm["t3"] == "__EMPTY_25"
    assert fm["insThk"] == "__EMPTY_28"
    assert fm["densityMixed"] == "__EMPTY_14"
    assert fm["densityGas"] == "__EMPTY_12"
    assert fm["hydroPressure"] == "__EMPTY_32"

    staged = mod._maybe_enrich_from_staged_json(ACTUAL_XML, ACTUAL_JSON, cfg)
    final_xml = mod._apply_process_data_to_xml(staged, cfg)
    root = ET.parse(final_xml).getroot()
    branch = _branch_with_name(root, "S8810101")
    temperature = next(c for c in list(branch) if c.tag.split('}', 1)[-1] == 'Temperature')
    pressure = next(c for c in list(branch) if c.tag.split('}', 1)[-1] == 'Pressure')
    assert _child_text(branch, "InsulationDensity") == "210.0"
    assert _child_text(branch, "FluidDensity") == "42.8"
    assert _child_text(temperature, "Temperature1") == "82"
    assert _child_text(temperature, "Temperature3") == "5"
    assert _child_text(pressure, "HydroPressure") == "15000"
    assert any(_child_text(node, "InsulationThickness") == "120" for node in _nodes(branch))
    assert any(_child_text(node, "DTXR_POS") for node in _nodes(branch))

    node30 = _find_node(branch, 30)
    assert "+Y" in _restraint_types(node30)
    assert "Y" not in _restraint_types(node30)
    dtxr_text = f"{_child_text(node30, 'DTXR_POS')}|{_child_text(node30, 'DTXR_PS')}"
    dtxr_types = [spec.type_code for spec in mod._specs_from_dtxr_text(dtxr_text, cfg)]
    assert 14 in dtxr_types
    assert 3 not in dtxr_types
    assert 19 not in dtxr_types

    ui_source = UI_ENHANCER.read_text(encoding="utf-8")
    assert "'+Y'" in ui_source
    assert "_applyDtxrRestraints" in ui_source
    assert "_xmlSet(doc, restraint, 'Type', type)" in ui_source
    assert "Split Condensed Valve/Flange" in ui_source
    assert "splitCondensedValveFlange" in ui_source
    assert "Hydro Test Pressure" in ui_source
    assert "hydroPressure" in ui_source

    cii_path = tmp_path / "out.cii"
    document = mod.base._parse_xml_document(final_xml)
    tmap, pmap = mod._branch_case_maps(document)
    imap = mod._branch_insulation_density_map(final_xml)
    hmap = mod._branch_hydro_pressure_map(final_xml)
    dtxr_specs, node_kind_map = mod._build_keyword_restraint_specs(final_xml, cfg)
    model = mod._build_conversion_model(document, dtxr_specs, mod._node_name_kind_map(document, node_kind_map))
    node30_restraint = next((rest for rest in model.restraints if rest.node_number == 30), None)
    assert node30_restraint is not None
    node30_codes = [spec.type_code for spec in node30_restraint.specs]
    assert 14 in node30_codes
    assert 3 not in node30_codes
    assert 19 not in node30_codes
    mod.base._build_elements_payload = mod._patched_elements_payload_factory(tmap, pmap, imap, hmap)
    cii_path.write_text(mod.base._build_cii_text(model, "first", mod.base.DEFAULT_VERSION_LINE, 1.0), encoding="utf-8")
    cii = cii_path.read_text(encoding="utf-8")
    values = _first_element_values(cii, 36)
    assert values[30] == 0.00021
    assert values[31] == 0.0000428
    assert values[35] == 15000.0

    artifacts = _artifact_dir()
    if artifacts:
        final_xml_text = pathlib.Path(final_xml).read_text(encoding="utf-8")
        (artifacts / "bm8-final-enriched.xml").write_text(final_xml_text, encoding="utf-8")
        (artifacts / "bm8-generated.cii").write_text(cii, encoding="utf-8")
        (artifacts / "bm8-validation-summary.json").write_text(json.dumps({
            "fieldMap": fm,
            "branchNameContains": "S8810101",
            "temperature1": _child_text(temperature, "Temperature1"),
            "temperature3": _child_text(temperature, "Temperature3"),
            "hydroPressure": _child_text(pressure, "HydroPressure"),
            "insulationDensity": _child_text(branch, "InsulationDensity"),
            "fluidDensity": _child_text(branch, "FluidDensity"),
            "ciiItem31InsulationDensity": values[30],
            "ciiItem32FluidDensity": values[31],
            "ciiItem36HydroPressure": values[35],
            "hasNodeInsulationThickness120": any(_child_text(node, "InsulationThickness") == "120" for node in _nodes(branch)),
            "hasDtxrPos": any(_child_text(node, "DTXR_POS") for node in _nodes(branch)),
            "node30XmlTypes": _restraint_types(node30),
            "node30DtxrCodes": dtxr_types,
            "node30ModelCodes": node30_codes,
            "uiFinalizerWritesDtxrRestraintTypes": "_applyDtxrRestraints" in ui_source,
        }, indent=2), encoding="utf-8")


def test_split_condensed_valve_flange_default_off_keeps_negative_nodes(tmp_path):
    out = mod._apply_process_data_to_xml(_write_xml(tmp_path / "off.xml", ["-1", "-2", "-1", "-2"]), {"insulationDensityDefault": 210, "linelist": {"masterRows": [], "fieldMap": {}}})
    nums = [n.text for n in ET.parse(out).getroot().iter() if n.tag.split('}', 1)[-1] == 'NodeNumber']
    assert nums == ["-1", "-2", "-1", "-2"]


def test_split_condensed_valve_flange_on_renumbers_against_positive_neighbor(tmp_path):
    xml = tmp_path / "reported.xml"
    xml.write_text("""
    <PipeStressExport><RestrainOpenEnds>No</RestrainOpenEnds><Pipe><Branch><Branchname>/B1</Branchname>
      <Node><NodeNumber>-1</NodeNumber><ComponentType>FLAN</ComponentType><Weight>59</Weight><InsulationThickness>80</InsulationThickness><ElementLengthMm>147</ElementLengthMm><Position>0 0 0</Position></Node>
      <Node><NodeNumber>1050</NodeNumber><Rigid>2</Rigid><ComponentType>RIGID</ComponentType><Weight>59</Weight><InsulationThickness>80</InsulationThickness><ElementLengthMm>145</ElementLengthMm><Position>1 0 0</Position></Node>
    </Branch></Pipe></PipeStressExport>
    """, encoding="utf-8")
    out = mod._apply_process_data_to_xml(xml, {"insulationDensityDefault": 210, "splitCondensedValveFlange": True, "linelist": {"masterRows": [], "fieldMap": {}}})
    branch = ET.parse(out).getroot().find(".//Branch")
    assert branch.findtext("Node/NodeNumber") == "1049"
    assert branch.findtext("InsulationDensity") == "210.0"


def test_split_condensed_valve_flange_on_uses_global_10000_series_across_branches(tmp_path):
    out = mod._apply_process_data_to_xml(_write_xml(tmp_path / "on.xml", ["-1", "-2", "-1", "-2"]), {"insulationDensityDefault": 210, "splitCondensedValveFlange": True, "linelist": {"masterRows": [], "fieldMap": {}}})
    nums = [n.text for n in ET.parse(out).getroot().iter() if n.tag.split('}', 1)[-1] == 'NodeNumber']
    assert nums == ["10000", "10010", "10020", "10030"]
