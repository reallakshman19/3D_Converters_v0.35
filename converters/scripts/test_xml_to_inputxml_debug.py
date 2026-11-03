import importlib.util
import pathlib
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

SPEC = importlib.util.spec_from_file_location("xml_to_inputxml_debug", ROOT / "xml_to_inputxml_debug.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

ACTUAL_XML = REPO / "Benchmarks" / "LAUNCHERTOPO.XML"


def _config():
    return {
        "defaultStiffness": 1000000,
        "defaultGap": 0,
        "defaultFriction": 0.3,
        "useFrictionSentinelForNonYSupports": True,
    }


def test_xml_to_cii_enriched_inputxml_debug_export_contains_explicit_fields(tmp_path):
    assert ACTUAL_XML.exists(), f"Missing checked-in benchmark: {ACTUAL_XML}"
    records = []
    tree = mod._inputxml_from_final_xml(
        ACTUAL_XML,
        _config(),
        use_json_restraints=True,
        weight_scale=10,
        diagnostics_records=records,
    )
    output = tmp_path / "launcher-diagnostic.input.xml"
    tree.write(output, encoding="unicode", xml_declaration=True)

    root = ET.parse(output).getroot()
    assert root.tag == "CAESARII"
    assert root.attrib["ARTIFACT_ROLE"] == "diagnostic-reconstruction"
    assert root.attrib["PARITY_AUTHORITY"] == "generated CII"

    model = root.find("PIPINGMODEL")
    assert model is not None
    elements = model.findall("PIPINGELEMENT")
    assert len(elements) > 20
    assert int(model.attrib["NUMELEMENTS"]) == len(elements)
    assert int(model.attrib["NUMREST"]) == sum(
        len(element.findall("RESTRAINT")) for element in elements
    )

    required = {
        "FROM_NODE", "TO_NODE", "DELTA_X", "DELTA_Y", "DELTA_Z",
        "DIAMETER", "WALL_THICK", "LINE_ID", "TEMP_EXP_C1", "PRESSURE_C1",
    }
    for element in elements:
        assert required.issubset(element.attrib)
        assert len(element.findall("RESTRAINT")) <= 6

    assert any(element.find("BEND") is not None for element in elements)
    assert any(element.find("RIGID") is not None for element in elements)

    restraints = [
        restraint
        for element in elements
        for restraint in element.findall("RESTRAINT")
    ]
    assert restraints
    assert all(restraint.attrib.get("TAG") != "ANCI/DTXR-derived" for restraint in restraints)
    assert all(restraint.attrib.get("NUM") in {"1", "2", "3", "4", "5", "6"} for restraint in restraints)
    assert sum(row["code"] == "SIDECAR_RESTRAINT_SOURCE" for row in records) == len(restraints)
