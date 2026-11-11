"""Native writer custody fixture: ASIM-1885 reducer OD323.8→168.3.
All geometry, physical weights and converter options remain identical while
BoreMm metadata is corrected to per-node nominal DN. No private full run used.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from roundtrip_foundation.snapshot_replay import capture_snapshot,run_existing_converter,digest

BRANCH='/ASIM-1885-PL-6"-S8810106-HOT-01/B4'
OPTIONS={"coordsMode":"first","weightScale":"10",
 "splitCondensedValveFlange":True,
 "useRestraintTypeBasedOnJson":True,
 "stagedJsonPresent":False,"templateCiiPresent":False}
ROWS=[
 ("5460","REDU",1,"323.8","803427.00 -1147438.00 98762.35",0,"=1006657947/64",None),
 ("5470","REDU",2,"168.3","803427.00 -1147641.00 98684.60",0,"=1006657947/64",1),
 ("5480","ELBO",0,"168.3","803427.00 -1147870.00 98684.60",0,"=1006657947/66",None),
 ("5500","ATTA",0,"168.3","804209.00 -1147870.00 98684.60",0,"=1006649755/5711",None),
 ("5530","FLAN",1,"168.3","805203.60 -1147870.00 98684.60",57.25,"=1006657947/152",1),
 ("5536","FLAN",2,"168.3","805350.60 -1147870.00 98684.60",59,"=1006657947/152",2),
 ("5538","PIPE",0,"168.3","805963.80 -1147870.00 98684.60",0,"=1006657947/70",None),
]
def xml(corrected:bool)->bytes:
    body=[]
    for number,component,endpoint,od,pos,weight,ref,rigid in ROWS:
        bore="300.000" if not corrected or number=="5460" else "150.000"
        body.append(
            "<Node>"
            f"<NodeNumber>{number}</NodeNumber><ComponentType>{component}</ComponentType>"
            f"<Endpoint>{endpoint}</Endpoint>"
            +(f"<Rigid>{rigid}</Rigid>" if rigid is not None else "")+
            f"<ComponentRefNo>{ref}</ComponentRefNo>"
            f"<OutsideDiameter>{od}</OutsideDiameter><WallThickness>10.97</WallThickness>"
            f"<Position>{pos}</Position><BoreMm>{bore}</BoreMm>"
            f"<PipingClass>HOT</PipingClass><Rating>900</Rating><Weight>{weight}</Weight>"
            +"<DTXR_POS>WELDING NECK FLANGE SCH 80 900#</DTXR_POS>" * (component=="FLAN")
            +"</Node>"
        )
    return (
      '<?xml version="1.0" encoding="utf-8"?>'
      '<PipeStressExport><DateTime>01:00 11 November 2026</DateTime>'
      '<Source>ASIM-1885-BOUNDARY-REDUCER-TEST</Source>'
      '<ProjectName>BOUNDED-REDUCER-NOMINAL-DN-TEST</ProjectName>'
      '<RestrainOpenEnds>No</RestrainOpenEnds><Pipe><Branch>'
      f'<Branchname>{BRANCH}</Branchname>'
      '<Pressure><Pressure1>700</Pressure1></Pressure>'
      '<Temperature><Temperature1>120</Temperature1><Temperature2>309</Temperature2><Temperature3>-5</Temperature3></Temperature>'
      +''.join(body)+'</Branch></Pipe></PipeStressExport>'
    ).encode('utf8')
def sections(text:str)->dict[str,list[str]]:
    output={};current=None
    for line in text.splitlines():
        if line.lstrip().startswith('#$ '):
            current=line.lstrip()[3:].strip()
            if current in output:raise AssertionError('Duplicate section '+current)
            output[current]=[]
        elif current and line.strip(): output[current].append(line)
    return output
def assert_element(cii:bytes):
    parsed=sections(cii.decode('utf-8'))
    elements=parsed['ELEMENTS'];assert len(elements)%15==0
    matched=[]
    for offset in range(0,len(elements),15):
        block=elements[offset:offset+15]
        head=block[0].split()
        if len(head)<6:continue
        if float(head[0])==5530 and float(head[1])==5536:
            pointer=int(block[12].split()[1])
            matched.append({
                'elementIndex':offset//15+1,'fromNode':5530,'toNode':5536,
                'outsideDiameterMm':float(head[5]),'lengthMm':abs(float(head[2])),
                'rigidPointer':pointer,
                'weightCiiUnits':float(parsed['RIGID'][pointer-1][:15]),
            })
    assert len(matched)==1,matched
    item=matched[0]
    assert item['outsideDiameterMm']==168.3,item
    assert item['lengthMm']==147.0,item
    assert item['weightCiiUnits']==590.0,item
    return item
def generate(output:Path):
    output.mkdir(parents=True,exist_ok=True)
    receipts={}
    for name,corrected in [('original',False),('corrected',True)]:
        source=xml(corrected)
        snap=capture_snapshot(engine_input_xml=source,
            original_cii=b'SYNTHETIC_NOT_OWNER',
            effective_config_json=b'{}',options=OPTIONS,assets={},
            run_id='ASIM1885_REDUCER_BORE_BOUNDED',
            completeness_attestation='COMPLETE_NO_EXTERNAL_MASTERS')
        cii,_=run_existing_converter(snap,source,b'{}',{})
        receipt=assert_element(cii)
        (output/(name+'.xml')).write_bytes(source)
        (output/(name+'.cii')).write_bytes(cii)
        receipts[name]={**receipt,'sourceSha256':digest(source),'ciiSha256':digest(cii)}
    assert (output/'original.cii').read_bytes()==(output/'corrected.cii').read_bytes(),(
      'BoreMm change alone must NOT change any CII engineering record or weight')
    record={
      'status':'PASS_NATIVE_WRITER_BORE_METADATA_ONLY_CII_BYTE_IDENTICAL',
      'evidenceClass':'BOUNDED_ASIM1885_NUMERIC_TEST_NOT_FROZEN_OWNER_CII',
      'original':receipts['original'],'corrected':receipts['corrected'],
      'allOtherCiiBytesChanged':0,'rigidWeightChanged':False,
      'expectedNominalDn':{'5460':300,'5470':150,'5530':150,'5536':150},
    }
    (output/'receipt.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record,sort_keys=True))
if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--output',type=Path,required=True)
    generate(p.parse_args().output)
