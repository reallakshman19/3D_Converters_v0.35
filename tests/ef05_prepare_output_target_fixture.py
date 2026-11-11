"""EF-05 output-unit target regression: converter-generated 1050.70 → 0.001.

Uses a synthetic, uniquely owned RIGID in the repository fixture. Both
baseline and corrected CII bytes come from the real production Python writer.
The user-uploaded EF-05 file is separately checked in private custody and
is NEVER committed to the public repository or treated as live-run evidence.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(ROOT/"tests"))
from roundtrip_foundation.snapshot_replay import capture_snapshot,run_existing_converter
from r4a_prepare_lineage import generate as generate_r1
OPTIONS={"coordsMode":"first","weightScale":"10","splitCondensedValveFlange":True,
         "useRestraintTypeBasedOnJson":True,"stagedJsonPresent":False,
         "templateCiiPresent":False}
def generate(output:Path):
    original=(ROOT/"roundtrip_foundation/fixtures/multi-stage-synthetic.xml").read_bytes()
    old=(b"<ComponentRefNo>/RIGID-40</ComponentRefNo><Position>300 0 0</Position>"
         b"<OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness>"
         b"<Rigid>2</Rigid><Endpoint>2</Endpoint><Weight>6</Weight>")
    assert original.count(old)==1
    seeded=old.replace(b"<Weight>6</Weight>",b"<Weight>105.07</Weight>")
    edited=old.replace(b"<Weight>6</Weight>",b"<Weight>0.0001</Weight>")
    baseline=original.replace(old,seeded)
    revised=original.replace(old,edited)
    output.mkdir(parents=True,exist_ok=True)
    for name,xml in (("original",baseline),("approved",revised)):
        snap=capture_snapshot(
            engine_input_xml=xml,original_cii=b"SYNTHETIC_NOT_OWNER",
            effective_config_json=b"{}",options=OPTIONS,assets={},
            run_id="EF05_OUTPUT_UNITS_SYNTHETIC",
            completeness_attestation="COMPLETE_NO_EXTERNAL_MASTERS")
        cii,_=run_existing_converter(snap,xml,b"{}",{})
        (output/(name+".xml")).write_bytes(xml)
        (output/(name+".cii")).write_bytes(cii)
    generate_r1(output)
    print("EF05_OUTPUT_TARGET_SYNTHETIC_CONVERTER_FIXTURE_READY",output)
if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--output",type=Path,required=True)
    generate(p.parse_args().output)
