"""R4A source-backed 135th RIGID, real converter E2E fixture.

This generated case is deliberately SYNTHETIC. It verifies a physically unique
Node/Weight writer source for a RIGID at pointer 135 and element #384, unlike
an archived Owner GLRD source/effective-config/CII execution.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from roundtrip_foundation.snapshot_replay import (
    capture_snapshot, run_existing_converter, parse_section_map,
)
from roundtrip_foundation.full_pointer_validation import validate_all_element_pointers

BASE = ROOT / "roundtrip_foundation/fixtures/multi-stage-synthetic.xml"
OPTIONS = {
    "coordsMode": "first", "weightScale": "10",
    "splitCondensedValveFlange": True,
    "useRestraintTypeBasedOnJson": True,
    "stagedJsonPresent": False, "templateCiiPresent": False,
}
TARGET = "/POINTER-135-UNIQUE"
ORIGINAL = "<Weight>15</Weight>"
REVISED = "<Weight>2.984</Weight>"


def one_rigid_branch(ordinal: int, target: bool = False) -> str:
    name = "/R4A/POINTER-135" if target else f"/R4A/FILL-{ordinal}"
    from_node = 3429 if target else 20000 + 2 * ordinal
    to_node = 10120 if target else from_node + 1
    source = TARGET if target else f"/FILL-RIGID-{ordinal}"
    y = 2000 + ordinal * 100
    mass = "15" if target else "1"
    return f"""
    <Branch>
      <Branchname>{name}</Branchname>
      <Node><NodeNumber>{from_node}</NodeNumber><ComponentType>PIPE</ComponentType>
        <ComponentRefNo>/FILL-START-{ordinal}</ComponentRefNo>
        <Position>0 {y} 0</Position><OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.9</WallThickness><Weight>0</Weight></Node>
      <Node><NodeNumber>{to_node}</NodeNumber><ComponentType>RIGID</ComponentType>
        <ComponentRefNo>{source}</ComponentRefNo>
        <Position>19.1 {y} 0</Position><OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.9</WallThickness><Rigid>2</Rigid><Endpoint>2</Endpoint>
        <Weight>{mass}</Weight></Node>
    </Branch>"""


def padding_branch(number: int) -> str:
    if number == 0:
        return ""
    nodes = []
    for i in range(number + 1):
        nodes.append(f"""<Node><NodeNumber>{45000 + i}</NodeNumber>
          <ComponentType>PIPE</ComponentType>
          <ComponentRefNo>/PADDING-PIPE-{i}</ComponentRefNo>
          <Position>{i * 100} 75000 0</Position>
          <OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness>
          <Weight>0</Weight></Node>""")
    return "<Branch><Branchname>/R4A/PADDING</Branchname>" + "".join(nodes) + "</Branch>"


def engine_xml(padding: int) -> bytes:
    base = BASE.read_text("utf-8")
    assert base.count("</Pipe>") == 1
    new_branches = "".join(one_rigid_branch(i) for i in range(128))
    new_branches += padding_branch(padding)
    new_branches += one_rigid_branch(128, target=True)
    return base.replace("</Pipe>", new_branches + "</Pipe>").encode("utf-8")


def converter(xml: bytes) -> bytes:
    snap = capture_snapshot(
        engine_input_xml=xml, original_cii=b"NOT_OWNER_HISTORICAL_CII",
        effective_config_json=b"{}", options=OPTIONS, assets={},
        run_id="SYNTHETIC_R4A_POINTER_135_ONLY",
        completeness_attestation="COMPLETE_NO_EXTERNAL_MASTERS",
    )
    data, _ = run_existing_converter(snap, xml, b"{}", {})
    return data


def target_identity(cii: bytes) -> tuple[int, int, int, int, float, float]:
    checked = validate_all_element_pointers(cii)
    pointers = checked["elementPointers"]
    matched = [i + 1 for i, row in enumerate(pointers) if row["RIGID"] == 135]
    assert len(matched) == 1, f"135 must link exactly one ELEMENT, got {matched}"
    sections = parse_section_map(cii.decode("utf-8"))
    element = sections["ELEMENTS"][15 * (matched[0] - 1)].split()
    weight = float(sections["RIGID"][(135 - 1) * 2].split()[0])
    return (
        checked["recordCounts"]["RIGID"],
        matched[0],
        int(float(element[0])), int(float(element[1])),
        float(element[2]), weight,
    )


def make(out: Path):
    first_xml = engine_xml(0)
    first_cii = converter(first_xml)
    count, index, nfrom, nto, length, weight = target_identity(first_cii)
    assert count == 135 and nfrom == 3429 and nto == 10120, (
        count, index, nfrom, nto, length, weight)
    pad = 384 - index
    assert pad >= 0, f"cannot position pointer 135 at ELEMENT 384; initial index {index}"
    original_xml = engine_xml(pad)
    original_cii = converter(original_xml)
    assert target_identity(original_cii) == (135, 384, 3429, 10120, 19.1, 150.0), (
        target_identity(original_cii))
    token = f"<ComponentRefNo>{TARGET}</ComponentRefNo>"
    source_text = original_xml.decode("utf-8")
    assert source_text.count(token) == 1
    before, after = source_text.split(token, 1)
    assert after.count(ORIGINAL) >= 1
    pos = after.index(ORIGINAL)
    edited = (before + token + after[:pos] + REVISED +
              after[pos + len(ORIGINAL):]).encode("utf-8")
    revised_cii = converter(edited)
    assert target_identity(revised_cii) == (135, 384, 3429, 10120, 19.1, 29.84), (
        target_identity(revised_cii))
    out.mkdir(parents=True, exist_ok=True)
    for name, data in (
        ("pointer135-original.xml", original_xml),
        ("pointer135-original.cii", original_cii),
        ("pointer135-approved.xml", edited),
        ("pointer135-approved.cii", revised_cii),
    ):
        (out / name).write_bytes(data)
    print("SYNTHETIC_REAL_CONVERTER_POINTER135", {
        "baselineCiiBytes": len(original_cii),
        "revisedCiiBytes": len(revised_cii),
        "paddingPipeEdges": pad,
        "element": 384, "rigidPointer": 135,
        "nodes": "3429 -> 10120", "lengthMm": 19.1,
        "oldCiiWeight": 150, "revisedCiiWeight": 29.84,
        "historicalGlrd": False,
    })


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    make(parser.parse_args().output)
