import importlib.util
import pathlib
import sys
import textwrap
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location("xml_to_cii2019_patched", ROOT / "xml_to_cii2019_patched.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


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


def test_semantic_field_map_rejects_pressure_min_and_insulation_type():
    cfg = {
        "linelist": {
            "masterRows": [
                {
                    "__EMPTY_12": "Density",
                    "__EMPTY_14": "Mixed kg/m³",
                    "__EMPTY_23": "Pressure Min kPa(g)",
                    "__EMPTY_24": "Temp Max ºC",
                    "__EMPTY_25": "Temp Min ºC",
                    "__EMPTY_27": "Insulation Type",
                    "__EMPTY_28": "Insulation Thickness [mm]",
                    "__EMPTY_32": "Test Pressure",
                },
                {
                    "__EMPTY_12": "8.44",
                    "__EMPTY_14": "42.8",
                    "__EMPTY_23": "0",
                    "__EMPTY_24": "260",
                    "__EMPTY_25": "5",
                    "__EMPTY_27": "PP",
                    "__EMPTY_28": "40",
                    "__EMPTY_32": "15000",
                },
            ],
            "fieldMap": {},
        }
    }
    mod._normalize_process_field_map(cfg)
    fm = cfg["linelist"]["fieldMap"]
    assert fm["t1"] == "__EMPTY_24"
    assert fm["t3"] == "__EMPTY_25"
    assert fm["insThk"] == "__EMPTY_28"
    assert fm["densityMixed"] == "__EMPTY_14"
    assert fm["hydroPressure"] == "__EMPTY_32"
    assert fm.get("t2") != "__EMPTY_23"
    assert fm.get("insThk") != "__EMPTY_27"


def test_final_xml_enrichment_sets_ins_density_hydro_pressure_and_cii_item_36(tmp_path):
    xml = tmp_path / "in.xml"
    xml.write_text(textwrap.dedent("""
    <PipeStressExport>
      <DateTime/><Source/><Version/><UserName/><Purpose/><ProjectName/><MDBName/><TitleLine/>
      <RestrainOpenEnds>No</RestrainOpenEnds><AmbientTemperature>0</AmbientTemperature>
      <Pipe><FullName>/P</FullName><Ref>=P</Ref>
        <Branch>
          <Branchname>/ASIM-1885-10&quot;-S8810101-91261M7-HC/B1</Branchname>
          <Temperature><Temperature1>0</Temperature1><Temperature2>0</Temperature2><Temperature3>0</Temperature3></Temperature>
          <Pressure><Pressure1>0</Pressure1></Pressure>
          <MaterialNumber>106</MaterialNumber><InsulationDensity>0</InsulationDensity><FluidDensity>0</FluidDensity>
          <Node><NodeNumber>1040</NodeNumber><ComponentType>PIPE</ComponentType><OutsideDiameter>273</OutsideDiameter><WallThickness>21</WallThickness><Weight>0</Weight><InsulationThickness>80</InsulationThickness><ElementLengthMm>147</ElementLengthMm><Position>0 0 0</Position></Node>
          <Node><NodeNumber>1050</NodeNumber><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><OutsideDiameter>273</OutsideDiameter><WallThickness>21</WallThickness><Weight>59</Weight><InsulationThickness>80</InsulationThickness><ElementLengthMm>145.5</ElementLengthMm><Position>147 0 0</Position></Node>
          <Node><NodeNumber>1060</NodeNumber><ComponentType>REDU</ComponentType><OutsideDiameter>273</OutsideDiameter><WallThickness>21</WallThickness><Weight>59</Weight><InsulationThickness>80</InsulationThickness><ElementLengthMm>100</ElementLengthMm><Position>247 0 0</Position></Node>
        </Branch>
      </Pipe>
    </PipeStressExport>
    """), encoding="utf-8")
    cfg = {
        "insulationDensityDefault": 210,
        "linelist": {
            "lineKeyTokenPositions": "4",
            "masterRows": [
                {"lineNo": "S8810101", "Temp Max ºC": "82", "Temp": "120", "Temp Min ºC": "5", "Mixed kg/m³": "42.8", "__EMPTY_32": "Test Pressure"},
                {"lineNo": "S8810101", "Temp Max ºC": "82", "Temp": "120", "Temp Min ºC": "5", "Mixed kg/m³": "42.8", "__EMPTY_32": "15000"},
            ],
            "fieldMap": {"t1": "Temp Max ºC", "t2": "Temp", "t3": "Temp Min ºC", "densityMixed": "Mixed kg/m³"},
        },
    }
    mod._normalize_process_field_map(cfg)
    assert cfg["linelist"]["fieldMap"]["hydroPressure"] == "__EMPTY_32"
    out = mod._apply_process_data_to_xml(xml, cfg)
    root = ET.parse(out).getroot()
    branch = root.find(".//Branch")
    assert branch.findtext("Temperature/Temperature1") == "82"
    assert branch.findtext("Temperature/Temperature2") == "120"
    assert branch.findtext("Temperature/Temperature3") == "5"
    assert branch.findtext("Pressure/HydroPressure") == "15000"
    assert branch.findtext("FluidDensity") == "42.8"
    assert branch.findtext("InsulationDensity") == "210.0"
    assert branch.findall("Node")[2].findtext("Weight") == "0"

    document = mod.base._parse_xml_document(out)
    tmap, pmap = mod._branch_case_maps(document)
    imap = mod._branch_insulation_density_map(out)
    hmap = mod._branch_hydro_pressure_map(out)
    model = mod._build_conversion_model(document, {}, {})
    mod.base._build_elements_payload = mod._patched_elements_payload_factory(tmap, pmap, imap, hmap)
    cii = mod.base._build_cii_text(model, "first", mod.base.DEFAULT_VERSION_LINE, 1.0)
    values = _first_element_values(cii, 36)
    assert len(values) == 36
    assert values[30] == 0.00021
    assert values[31] == 0.0000428
    assert values[35] == 15000.0
