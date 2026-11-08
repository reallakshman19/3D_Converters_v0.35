#!/usr/bin/env python3
"""Generate auditable R1 qualification evidence by running the real converter.

Reproduce from repository root:
    python3 qualification/build_evidence.py --out qualification
    python3 -m unittest qualification/test_verified_weight_edit.py -v
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from decimal import Decimal
import subprocess
import tempfile
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verified_weight_edit import (
    apply_verified_xml_weight_edit, cii_inventory, create_snapshot, pinned_options,
    run_converter, sha, source_identity, source_nodes,
)

FIXTURE = Path(__file__).resolve().parent / "original.xml"

def duplicate_number_branches(xml: bytes) -> bytes:
    extra = b"""    <Branch>
      <Branchname>/QUALIFICATION/B2</Branchname>
      <Node><NodeNumber>200</NodeNumber><ComponentType>PIPE</ComponentType>
        <ComponentRefNo>/PIPE-200</ComponentRefNo><Position>0 100 0</Position>
        <OutsideDiameter>60.3</OutsideDiameter><Weight>0</Weight></Node>
      <Node><NodeNumber>110</NodeNumber><ComponentType>RIGID</ComponentType>
        <ComponentRefNo>/PHYSICAL-RIGID-B2</ComponentRefNo><Position>100 100 0</Position>
        <OutsideDiameter>60.3</OutsideDiameter><Endpoint>2</Endpoint>
        <Rigid>2</Rigid><Weight>15</Weight></Node>
    </Branch>
"""
    assert xml.count(b"  </Pipe>") == 1
    return xml.replace(b"  </Pipe>", extra + b"  </Pipe>")

def refuse(name, *, xml, cii, snapshot, identity, weight, approved, expected):
    result = apply_verified_xml_weight_edit(
        original_xml=xml, original_cii=cii, conversion_snapshot=snapshot,
        source_identity=identity, proposed_weight_kg=weight, approved=approved)
    assert not result["ok"], name + ": unexpectedly accepted"
    assert result["code"] == expected, name + ": " + str(result)
    assert result["revisedXml"] is None and result["regeneratedCii"] is None
    assert result["audit"] is None
    return {"name": name, "status": "PASS_REFUSED", "code": result["code"],
            "reason": result["reason"], "publishedModifiedFiles": False}


def generated_node_witness():
    """Prove an actual generated CII node from Python negative FLAN renumbering."""
    xml = b"""<PipeStressExport><RestrainOpenEnds>No</RestrainOpenEnds><Pipe><Branch>
<Branchname>/GENERATED-NODE/B1</Branchname>
<Node><NodeNumber>100</NodeNumber><ComponentType>PIPE</ComponentType>
<ComponentRefNo>/ORIGINAL-100</ComponentRefNo><Position>0 0 0</Position>
<OutsideDiameter>60.3</OutsideDiameter><Weight>0</Weight></Node>
<Node><NodeNumber>-1</NodeNumber><ComponentType>FLAN</ComponentType>
<ComponentRefNo>/ORIGINAL-FLAN-NEG1</ComponentRefNo><Position>50 0 0</Position>
<ElementLengthMm>50</ElementLengthMm><OutsideDiameter>60.3</OutsideDiameter>
<Rigid>2</Rigid><Endpoint>2</Endpoint><Weight>15</Weight></Node>
<Node><NodeNumber>120</NodeNumber><ComponentType>PIPE</ComponentType>
<ComponentRefNo>/ORIGINAL-120</ComponentRefNo><Position>100 0 0</Position>
<OutsideDiameter>60.3</OutsideDiameter><Weight>0</Weight></Node>
</Branch></Pipe></PipeStressExport>"""
    with tempfile.TemporaryDirectory(prefix="qualified-generated-") as folder:
        inp, out = Path(folder) / "input.xml", Path(folder) / "generated.cii"
        inp.write_bytes(xml)
        script = Path(__file__).resolve().parents[1] / "converters/scripts/xml_to_cii2019_runtime_custody.py"
        argv = [sys.executable, str(script), "--input", str(inp), "--output", str(out),
                "--coords-mode", "first", "--weight-scale", "10",
                "--support-config-json", "{}", "--split-condensed-valve-flange",
                "--use-restraint-type-based-on-json"]
        subprocess.run(argv, check=True, capture_output=True, text=True)
        parsed = cii_inventory(out.read_bytes())
    original_numbers = {"100", "-1", "120"}
    emitted_numbers = {value for e in parsed["elements"]
                       for value in (e["fromNode"], e["toNode"])}
    generated = sorted(emitted_numbers - original_numbers)
    assert len(generated) == 1, f"Expected real generated node, found {generated}"
    return {"generatedCiiNodeNumber": generated[0],
            "originalEnrichedXmlNodeNumbers": sorted(original_numbers),
            "engine": "xml_to_cii2019_runtime_custody.py",
            "effectiveSplitSetting": True,
            "sourceLineageQualifiedForEditing": False,
            "emittedElements": len(parsed["elements"])}

def build(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    original_xml = FIXTURE.read_bytes()
    pinned = {"options": pinned_options()}
    # This is the actual checked-in Python runtime-custody converter, not a mock.
    original_cii, original_run = run_converter(original_xml, pinned)
    baseline_again, replay_run = run_converter(original_xml, pinned)
    assert original_cii == baseline_again, "No-edit real-converter byte parity FAILED"
    snapshot = create_snapshot(original_xml, original_cii)
    source, _ = source_nodes(original_xml)
    owner = next(n for n in source if n["componentRefNo"] == "/PHYSICAL-RIGID-110")
    identity = source_identity(snapshot, owner)
    result = apply_verified_xml_weight_edit(
        original_xml=original_xml, original_cii=original_cii,
        conversion_snapshot=snapshot, source_identity=identity,
        proposed_weight_kg="2.984", approved=True)
    assert result["ok"], "Positive scenario FAILED: " + str(result)
    assert Decimal(result["audit"]["ciiWeightBefore"]) == Decimal("150")
    assert Decimal(result["audit"]["ciiWeightAfter"]) == Decimal("29.84")
    # Assert independent serialized CII reparse and no unexpected engineering bytes.
    before = cii_inventory(original_cii)
    after = cii_inventory(result["regeneratedCii"])
    assert len(before["elements"]) == len(after["elements"]) == 1
    assert len(before["rigidWeights"]) == len(after["rigidWeights"]) == 1
    assert before["rigidWeights"][0] == Decimal("150")
    assert after["rigidWeights"][0] == Decimal("29.84")
    assert result["audit"]["ciiIntegrity"]["unexplainedEngineeringByteDifferences"] == 0
    assert result["audit"]["xmlUnrelatedByteDifferences"] == 0

    ambiguous_xml = duplicate_number_branches(original_xml)
    ambiguity_cii, _ = run_converter(ambiguous_xml, pinned)
    ambiguity_snapshot = create_snapshot(ambiguous_xml, ambiguity_cii)
    amb_nodes, _ = source_nodes(ambiguous_xml)
    assert len([n for n in amb_nodes if n["nodeNumber"] == "110"]) == 2
    generated_witness = generated_node_witness()
    assert generated_witness['generatedCiiNodeNumber'] not in {n['nodeNumber'] for n in source}
    scenarios = [
        refuse("AMBIGUOUS_SOURCE", xml=ambiguous_xml, cii=ambiguity_cii,
               snapshot=ambiguity_snapshot,
               identity={"nodeNumber": "110"}, weight="2.984", approved=True,
               expected="HOLD_SOURCE_OWNER"),
        refuse("STALE_SOURCE", xml=original_xml.replace(b"<Weight>15</Weight>", b"<Weight>16</Weight>"),
               cii=original_cii, snapshot=snapshot, identity=identity,
               weight="2.984", approved=True, expected="HOLD_STALE_SOURCE"),
        refuse("SYNTHETIC_GENERATED_NODE", xml=original_xml, cii=original_cii,
               snapshot=snapshot, identity={**identity, "nodeNumber": generated_witness["generatedCiiNodeNumber"]},
               weight="2.984", approved=True, expected="HOLD_SOURCE_OWNER"),
        refuse("UNAPPROVED_SUGGESTION", xml=original_xml, cii=original_cii,
               snapshot=snapshot, identity=identity, weight="2.984",
               approved=False, expected="HOLD_UNAPPROVED"),
    ]

    (out / "original.xml").write_bytes(original_xml)
    (out / "original.cii").write_bytes(original_cii)
    (out / "revised.xml").write_bytes(result["revisedXml"])
    (out / "regenerated.cii").write_bytes(result["regeneratedCii"])
    (out / "source-edit-audit.json").write_text(
        json.dumps(result["audit"], indent=2, sort_keys=True) + "\n", encoding="utf-8")
    manifest = {
        **snapshot,
        "fixtureType": "SYNTHETIC_NOT_GLRD_433_144",
        "sourceIdentity": identity,
        "baselineNoEdit": {"sha256Original": sha(original_cii),
                           "sha256Regenerated": sha(baseline_again),
                           "bytesOriginal": len(original_cii),
                           "bytesRegenerated": len(baseline_again),
                           "differingBytes": 0,
                           "byteParity": True},
        "conversion": {"realConverter": "converters/scripts/xml_to_cii2019_runtime_custody.py",
                       "commandTemplate": original_run["commandTemplate"],
                       "nativePython": True,
                       "converterStdout": original_run["stdout"]},
        "negativeScenarios": scenarios,
        "generatedNodeWitness": generated_witness,
        "positiveVerified": True,
        "directCiiPatch": False,
    }
    (out / "baseline-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    lines = [
        "Task XML-CII2019-CODER-QUALIFICATION-SAMPLE-R1",
        "Mode: SYNTHETIC_REAL_PYTHON; NOT complete bidirectional support",
        "REPRODUCE FROM REPOSITORY ROOT:",
        "  python3 qualification/build_evidence.py --out qualification",
        "  python3 -m unittest qualification/test_verified_weight_edit.py -v",
        "  python3 converters/scripts/xml_to_cii2019_runtime_custody.py --input qualification/original.xml --output /tmp/qualification-noedit.cii --coords-mode first --weight-scale 10 --support-config-json '{}' --no-split-condensed-valve-flange --use-restraint-type-based-on-json",
        "  sha256sum qualification/original.cii /tmp/qualification-noedit.cii",
        "  cmp qualification/original.cii /tmp/qualification-noedit.cii",
        "REAL CONVERTER: " + original_run["stdout"],
        "ORIGINAL_CII_SHA256: " + sha(original_cii),
        "NO_EDIT_REGENERATED_CII_SHA256: " + sha(baseline_again),
        "ORIGINAL_CII_BYTES: " + str(len(original_cii)),
        "NO_EDIT_REGENERATED_CII_BYTES: " + str(len(baseline_again)),
        "NO_EDIT_DIFFERING_BYTES: 0",
        "SOURCE_WEIGHT: 15 kg -> 2.984 kg",
        "CII_WEIGHT: 150 -> 29.84 (scale 10)",
        "XML_NON_TARGET_BYTE_DIFFERENCES: 0",
        "UNEXPLAINED_CII_ENGINEERING_BYTE_DIFFERENCES: 0",
        "CONTROL/POINTERS: valid via section_rules and independent cii2019_reparse_proof",
        "POSITIVE: PASS",
        *[f"{s['name']}: {s['status']} {s['code']} output_published={s['publishedModifiedFiles']}"
          for s in scenarios],
        "GENERATED_NODE_WITNESS: " + str(generated_witness["generatedCiiNodeNumber"]) + " emitted from real split-mode converter; absent from selected original source",
        "NEGATIVE_PASS: 4",
        "NEGATIVE_FAIL: 0",
        "NOT_RUN: authentic Owner GLRD 433/144, GUI/Pyodide, full split mass allocation",
        "WARNING: The original fixture must not be replaced by a catalog weight without physical approval.",
    ]
    (out / "test-results.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[8:]))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="qualification")
    opts = parser.parse_args()
    build(Path(opts.out))
