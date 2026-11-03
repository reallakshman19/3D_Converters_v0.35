import importlib.util
import json
import pathlib
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import xml_to_cii2019 as base
import xml_to_cii_inputxml_sidecar_diagnostics as diag

SPEC = importlib.util.spec_from_file_location("xml_to_inputxml_debug", ROOT / "xml_to_inputxml_debug.py")
sidecar = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sidecar)


def _fields(values):
    return "  " + "".join(f"{value:>13}" for value in values)


def _cii_text(from_node=10, to_node=20, dx=100, dy=0, dz=0):
    control = [
        _fields([1, 0, 0, 0, 0, 0]),
        _fields([1, 1, 0, 1, 0, 0]),
        _fields([0, 0, 0, 0, 1, 0]),
        _fields([0]),
    ]
    rows = [_fields([from_node, to_node, dx, dy, dz, 100])]
    rows.extend(_fields([0, 0, 0, 0, 0, 0]) for _ in range(8))
    rows.extend([f"{0:>12} ELEMENT", f"{0:>12} LINE"])
    rows.extend([
        _fields([0, 0]),
        _fields([1, 1, 0, 1, 0, 0]),
        _fields([0, 0, 0, 0, 1, 0]),
        _fields([0, 0, 0]),
    ])
    return "\n".join(["#$ CONTROL", *control, "#$ ELEMENTS", *rows, ""])


def _sidecar_tree(to_node=20, dx=100):
    root = ET.Element("CAESARII", {"XML_TYPE": "Input", "VERSION": "2019"})
    model = ET.SubElement(root, "PIPINGMODEL")
    element = ET.SubElement(model, "PIPINGELEMENT", {
        "FROM_NODE": "10", "TO_NODE": str(to_node),
        "DELTA_X": str(dx), "DELTA_Y": "0", "DELTA_Z": "0",
    })
    ET.SubElement(element, "BEND")
    ET.SubElement(element, "RIGID")
    ET.SubElement(element, "RESTRAINT")
    ET.SubElement(element, "SIF")
    return ET.ElementTree(root)


def test_parity_engine_matches_observable_cii_artifacts(tmp_path):
    cii = tmp_path / "sample.cii"
    cii.write_text(_cii_text(), encoding="utf-8")
    document = diag.build_diagnostics(
        source_name="sample.xml",
        sidecar_name="sample.input.xml",
        tree=_sidecar_tree(),
        cii_path=cii,
    )
    assert document["parityChecked"] is True
    assert document["parityStatus"] == "WARNING"
    assert document["metrics"]["cii"]["elements"] == 1
    assert document["metrics"]["sidecar"]["restraintBlocks"] == 1
    assert not [row for row in document["records"] if row["severity"] == "ERROR"]
    assert any(row["code"] == "SIDECAR_NODE_PAIR_MATCH" for row in document["records"])
    assert any(row["code"] == "SIDECAR_DELTA_MATCH" for row in document["records"])


def test_parity_engine_reports_node_and_delta_divergence(tmp_path):
    cii = tmp_path / "sample.cii"
    cii.write_text(_cii_text(), encoding="utf-8")
    document = diag.build_diagnostics(
        source_name="sample.xml",
        sidecar_name="sample.input.xml",
        tree=_sidecar_tree(to_node=30, dx=101),
        cii_path=cii,
    )
    assert document["parityStatus"] == "ERROR"
    codes = {row["code"] for row in document["records"] if row["severity"] == "ERROR"}
    assert "SIDECAR_NODE_PAIR_MISMATCH" in codes
    assert "SIDECAR_DELTA_MISMATCH" in codes


def _spec(type_code):
    return base.RestraintSpec(
        type_code=type_code,
        stiffness=1000.0,
        gap=0.0,
        friction=0.3,
        is_open_end=False,
    )


def test_sidecar_retains_six_restraints_and_reports_provenance():
    parent = ET.Element("PIPINGELEMENT")
    specs = tuple(_spec(code) for code in range(1, 8))
    records = []
    source_maps = {
        "xml": {20: (specs[0],)},
        "component": {20: (specs[1],)},
        "dtxr": {20: tuple(specs[2:])},
    }
    count = sidecar._emit_restraints(
        parent,
        node_number=20,
        specs=specs,
        source_maps=source_maps,
        kind_map={20: "GUIDE"},
        support_config={},
        records=records,
    )
    assert count == 6
    restraints = parent.findall("RESTRAINT")
    assert len(restraints) == 6
    assert restraints[0].attrib["TAG"] == "XML-explicit"
    assert restraints[1].attrib["TAG"] == "ComponentType-derived"
    assert restraints[2].attrib["TAG"] == "DTXR-derived"
    assert any(row["code"] == "SIDECAR_RESTRAINT_TRUNCATED" for row in records)
    assert sum(row["code"] == "SIDECAR_RESTRAINT_SOURCE" for row in records) == 6


def _run(command):
    return subprocess.run(
        command,
        cwd=REPO,
        check=True,
        capture_output=True,
        text=True,
    )


def test_checked_in_launcher_generates_cii_sidecar_and_parity_json(tmp_path):
    source = REPO / "Benchmarks" / "LAUNCHERTOPO.XML"
    cii = tmp_path / "launcher.cii"
    inputxml = tmp_path / "launcher.input.xml"
    report = tmp_path / "launcher.sidecar.json"
    _run([
        sys.executable,
        str(ROOT / "xml_to_cii2019_contracted_direction.py"),
        "--input", str(source),
        "--output", str(cii),
        "--weight-scale", "10",
    ])
    _run([
        sys.executable,
        str(ROOT / "xml_to_inputxml_debug.py"),
        "--input", str(source),
        "--output", str(inputxml),
        "--cii-output", str(cii),
        "--diagnostics-output", str(report),
        "--weight-scale", "10",
        "--coords-mode", "first",
    ])
    assert cii.exists() and cii.stat().st_size > 0
    assert inputxml.exists() and inputxml.stat().st_size > 0
    document = json.loads(report.read_text(encoding="utf-8"))
    assert document["schema"] == diag.SCHEMA
    assert document["parityChecked"] is True
    assert document["artifactRole"] == "diagnostic-reconstruction"
    assert document["metrics"]["cii"]["elements"] > 0
    assert document["metrics"]["sidecar"]["elements"] > 0
    assert any(row["code"].startswith("SIDECAR_") for row in document["records"])
