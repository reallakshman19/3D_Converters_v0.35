"""Actual current Python converter: two-writer synthetic ownership regression.

RIGID /SHARED-COMP writer 20 (15 kg), and writer 40 (15 kg) deliberately
share a ComponentRefNo; non-writer endpoint 30 remains at zero. The exported
CIIs are produced by the production converter, not a handcrafted CII fixture.
This is NOT the private Owner GLRD exact-run benchmark.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from roundtrip_foundation.snapshot_replay import capture_snapshot,run_existing_converter
from tests.r4a_prepare_lineage import generate as generate_r1

OPTIONS={"coordsMode":"first","weightScale":"10",
         "splitCondensedValveFlange":True,
         "useRestraintTypeBasedOnJson":True,
         "stagedJsonPresent":False,"templateCiiPresent":False}

def generate(out:Path)->None:
    original=(ROOT/"roundtrip_foundation/fixtures/multi-stage-synthetic.xml").read_bytes()
    old=(b"<ComponentRefNo>/RIGID-40</ComponentRefNo><Position>300 0 0</Position>"
         b"<OutsideDiameter>60.3</OutsideDiameter><WallThickness>3.9</WallThickness>"
         b"<Rigid>2</Rigid><Endpoint>2</Endpoint><Weight>6</Weight>")
    new=old.replace(b"/RIGID-40",b"/SHARED-COMP").replace(b"<Weight>6</Weight>",b"<Weight>15</Weight>")
    assert original.count(old)==1
    source=original.replace(old,new)
    target=new.replace(b"<Weight>15</Weight>",b"<Weight>2.6</Weight>")
    assert source.count(new)==1
    revised=source.replace(new,target)
    out.mkdir(parents=True,exist_ok=True)
    for name,xml in (("original",source),("approved",revised)):
        s=capture_snapshot(
            engine_input_xml=xml,original_cii=b"SYNTHETIC_NOT_OWNER",
            effective_config_json=b"{}",options=OPTIONS,assets={},
            run_id="R4B_TWO_WRITER_SYNTHETIC",
            completeness_attestation="COMPLETE_NO_EXTERNAL_MASTERS")
        cii,_=run_existing_converter(s,xml,b"{}",{})
        (out/(name+".xml")).write_bytes(xml)
        (out/(name+".cii")).write_bytes(cii)
    generate_r1(out)
    print("R4B_REAL_WRITER_TWO_SOURCE_FIXTURE_READY")

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    generate(parser.parse_args().output)
