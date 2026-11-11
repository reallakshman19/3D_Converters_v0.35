"""Synthetic-only real-Python CII baseline for JS/browser R2 tests.
Never treat generated outputs as independently retained historical Owner CII.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from roundtrip_foundation.snapshot_replay import capture_snapshot, run_existing_converter
FIXTURE = ROOT / "roundtrip_foundation/fixtures/multi-stage-synthetic.xml"
OPTIONS = {"coordsMode":"first", "weightScale":"10",
           "splitCondensedValveFlange":True,
           "useRestraintTypeBasedOnJson":True,
           "stagedJsonPresent":False, "templateCiiPresent":False}

def generate(out: Path):
    xml = FIXTURE.read_bytes()
    original = xml
    # A single uniquely owned synthetic source RIGID /RIGID-40: 6 kg -> 2.984 kg.
    revised = xml.replace(b"<ComponentRefNo>/RIGID-40</ComponentRefNo><Position>300 0 0</Position><OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness><Rigid>2</Rigid><Endpoint>2</Endpoint><Weight>6</Weight>",
                          b"<ComponentRefNo>/RIGID-40</ComponentRefNo><Position>300 0 0</Position><OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness><Rigid>2</Rigid><Endpoint>2</Endpoint><Weight>2.984</Weight>")
    assert revised != original, "The test fixture target was not found"
    zero = revised.replace(b"<Weight>2.984</Weight>", b"<Weight>0</Weight>")
    assert zero != revised and zero != original, "Explicit zero fixture failed"
    original15 = original.replace(
        b"<ComponentRefNo>/RIGID-40</ComponentRefNo><Position>300 0 0</Position><OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness><Rigid>2</Rigid><Endpoint>2</Endpoint><Weight>6</Weight>",
        b"<ComponentRefNo>/RIGID-40</ComponentRefNo><Position>300 0 0</Position><OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness><Rigid>2</Rigid><Endpoint>2</Endpoint><Weight>15</Weight>")
    assert original15 != original and original15 != revised, "15 kg Owner example fixture failed"
    # Synthetic duplicated physical mass: one RIGID writer, one non-writer
    # endpoint carrying the same ComponentRefNo and original mass.
    alias_old = (b"<ComponentRefNo>/PIPE-50</ComponentRefNo><Position>400 0 0</Position>"
                 b"<OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness><Weight>0</Weight>")
    alias_new = (b"<ComponentRefNo>/RIGID-40</ComponentRefNo><Position>400 0 0</Position>"
                 b"<OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness><Weight>15</Weight>")
    original15alias = original15.replace(alias_old, alias_new)
    assert original15alias != original15 and original15alias.count(b"<ComponentRefNo>/RIGID-40</ComponentRefNo>") == 2
    writer15 = b"<ComponentRefNo>/RIGID-40</ComponentRefNo><Position>300 0 0</Position><OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness><Rigid>2</Rigid><Endpoint>2</Endpoint><Weight>15</Weight>"
    writer2984 = writer15.replace(b"<Weight>15</Weight>",b"<Weight>2.984</Weight>")
    alias2984 = alias_new.replace(b"<Weight>15</Weight>",b"<Weight>2.984</Weight>")
    approved15alias = original15alias.replace(writer15,writer2984).replace(alias_new,alias2984)
    assert approved15alias != original15alias
    out.mkdir(parents=True, exist_ok=True)
    for label, data in (("original", original), ("approved", revised), ("zero", zero),
                        ("original15", original15),("original15alias",original15alias),
                        ("approved15alias",approved15alias)):
        snapshot = capture_snapshot(
            engine_input_xml=data, original_cii=b"SYNTHETIC_NOT_OWNER",
            effective_config_json=b"{}", options=OPTIONS, assets={},
            run_id="R2_SYNTHETIC_ONLY", completeness_attestation="COMPLETE_NO_EXTERNAL_MASTERS")
        cii, _ = run_existing_converter(snapshot, data, b"{}", {})
        (out / (label + ".cii")).write_bytes(cii)
        (out / (label + ".xml")).write_bytes(data)
    print("R2_SYNTHETIC_CURRENT_WRITER_ONLY", out)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    generate(args.output)
