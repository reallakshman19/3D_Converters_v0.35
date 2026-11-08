#!/usr/bin/env python3
"""Run the real repository converter to produce all qualification/ evidence."""
from __future__ import annotations
import json
import sys
from itertools import zip_longest
from pathlib import Path

from verified_weight_edit import (
    FLAGS, ROOT, SCRIPTS, apply_verified_xml_weight_edit, make_snapshot,
    mask_only_rigid_line, read_rigid_on_edge, real_converter, sha,
    inspect_source,
)

OUT = Path(__file__).resolve().parent
IDENTITY = {
    "branchOrdinal": 0, "branchName": "/QUAL", "nodeOrdinal": 1,
    "nodeNumber": "20", "componentRefNo": "/QUAL-RIGID",
}


def required(condition, message):
    if not condition:
        raise AssertionError(message)


def refusal(label, call, expected_code, log):
    result = apply_verified_xml_weight_edit(**call)
    required(result.get("status") == "HOLD", label + " incorrectly released a result")
    required(result.get("code") == expected_code,
             label + ": expected " + expected_code + ", got " + str(result.get("code")))
    required(result.get("revisedXml") is None and result.get("regeneratedCii") is None,
             label + " leaked modified outputs")
    log.append(f"{label}: PASS ({expected_code}; zero published outputs)")
    return result


def run():
    log = ["TASK XML-CII2019-CODER-QUALIFICATION-SAMPLE-R1",
           "Evidence: actual repository xml_to_cii2019_runtime_custody.py, not a mocked writer"]
    original = (OUT / "original.xml").read_bytes()
    baseline = real_converter(original)
    replay = real_converter(original)
    diff = sum(a != b for a, b in zip_longest(baseline, replay))
    required(baseline == replay and diff == 0, "No-edit converter output is not byte-identical.")
    manifest = make_snapshot(original, baseline)
    proof = inspect_source(original, IDENTITY)
    orig_readback = read_rigid_on_edge(baseline, proof)
    required(orig_readback["weight"] == 150, "Unexpected source/weight or original RIGID read-back.")

    positive = apply_verified_xml_weight_edit(
        originalXml=original, originalCii=baseline, conversionSnapshot=manifest,
        sourceIdentity=IDENTITY, proposedWeightKg="2.984", approved=True)
    required(positive["status"] == "VERIFIED",
             "Positive edit refused: " + str(positive.get("code")) + ": " + str(positive.get("detail")))
    revised, regenerated = positive["revisedXml"], positive["regeneratedCii"]
    edit_proof = inspect_source(revised, IDENTITY)
    corrected = read_rigid_on_edge(regenerated, edit_proof)
    required(corrected["weight"] == 29.84, "New RIGID weight does not read back as 29.84.")
    required(baseline != regenerated, "Updated CII is byte-identical despite approved edit.")
    required(mask_only_rigid_line(baseline, orig_readback["pointer"]) ==
             mask_only_rigid_line(regenerated, corrected["pointer"]),
             "Non-target CII bytes changed.")
    required(positive["audit"]["unexplainedCiiDifferences"] == 0, "Unexplained engineering change.")
    log.append("POSITIVE: PASS (Node/Weight 15 -> 2.984; CII RIGID 150 -> 29.84)")
    log.append("XML NON-TARGET BYTES: PASS (only exact Weight token span replaced)")
    log.append("REGENERATED CII: PASS (real converter, structural validator, pointer read-back, no other bytes)")

    # A: two distinct branches contain the same numerical source NodeNumber 20.
    from verified_weight_edit import BRANCH_RE
    match = BRANCH_RE.search(original)
    required(match is not None, "Fixture has no Branch.")
    second = match.group(0).replace(b"/QUAL", b"/SECOND")
    duplicated = original.replace(b"</CleanXML>", b"\n" + second + b"\n</CleanXML>")
    duplicate_cii = real_converter(duplicated)
    duplicate_manifest = make_snapshot(duplicated, duplicate_cii)
    refusal("AMBIGUOUS SOURCE", dict(originalXml=duplicated, originalCii=duplicate_cii,
        conversionSnapshot=duplicate_manifest, sourceIdentity={"nodeNumber": "20"},
        proposedWeightKg="2.984", approved=True), "HOLD_SOURCE_OWNER", log)

    # B: alteration after preview invalidates immutable source digest.
    stale = original.replace(b"<Weight>15</Weight>", b"<Weight>16</Weight>")
    required(stale != original, "Could not create stale source.")
    refusal("STALE SOURCE", dict(originalXml=stale, originalCii=baseline,
        conversionSnapshot=manifest, sourceIdentity=IDENTITY,
        proposedWeightKg="2.984", approved=True), "HOLD_STALE_SOURCE", log)

    # C: a generated number not in the original source has no source lineage.
    synthetic_identity = {**IDENTITY, "nodeNumber": "10000"}
    refusal("SYNTHETIC GENERATED NODE", dict(originalXml=original, originalCii=baseline,
        conversionSnapshot=manifest, sourceIdentity=synthetic_identity,
        proposedWeightKg="2.984", approved=True), "HOLD_SOURCE_OWNER", log)

    # D: catalog suggestion cannot edit without explicit user approval.
    refusal("UNAPPROVED CATALOG WEIGHT", dict(originalXml=original, originalCii=baseline,
        conversionSnapshot=manifest, sourceIdentity=IDENTITY,
        proposedWeightKg="2.984", approved=False), "HOLD_NOT_APPROVED", log)

    manifest["noEditProof"] = {
        "originalCiiSha256": sha(baseline), "regeneratedCiiSha256": sha(replay),
        "originalByteLength": len(baseline), "regeneratedByteLength": len(replay),
        "differingBytes": diff, "verdict": "PASS",
        "fixtureType": "SYNTHETIC_REAL_CONVERTER",
    }
    (OUT / "original.cii").write_bytes(baseline)
    (OUT / "revised.xml").write_bytes(revised)
    (OUT / "regenerated.cii").write_bytes(regenerated)
    (OUT / "baseline-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    (OUT / "source-edit-audit.json").write_text(json.dumps(positive["audit"], indent=2, sort_keys=True) + "\n")
    log.extend([
        f"ORIGINAL CII SHA-256: {sha(baseline)}",
        f"NO-EDIT REPLAY SHA-256: {sha(replay)}",
        f"ORIGINAL BYTE LENGTH: {len(baseline)}",
        f"REGENERATED NO-EDIT BYTE LENGTH: {len(replay)}",
        f"DIFFERING BYTES: {diff}",
        "SOURCE XML ORIGINAL PRESERVED: YES",
        "UNEXPLAINED CII DIFFERENCES: 0",
        "TESTS: 5 scenarios (1 positive + 4 refusals), PASS 5, FAIL 0",
        "EXACT REPRODUCTION COMMANDS (from repository root):",
        "  python3 qualification/run_qualification.py",
        "  python3 converters/scripts/xml_to_cii2019_runtime_custody.py --input qualification/original.xml --output /tmp/qualification-original.cii " + " ".join(FLAGS),
        "  cmp qualification/original.cii /tmp/qualification-original.cii",
        "  python3 converters/scripts/xml_to_cii2019_runtime_custody.py --input qualification/revised.xml --output /tmp/qualification-regenerated.cii " + " ".join(FLAGS),
        "  cmp qualification/regenerated.cii /tmp/qualification-regenerated.cii",
        "  sha256sum qualification/original.cii qualification/regenerated.cii",
    ])
    (OUT / "test-results.txt").write_text("\n".join(log) + "\n")
    print("\n".join(log))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(run())
    except Exception as exc:
        print("QUALIFICATION FAIL: " + str(exc), file=sys.stderr)
        raise
