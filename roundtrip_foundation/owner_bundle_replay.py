"""Private Owner GLRD bundle intake and independent no-edit replay; no edits.

Usage: python3 -m roundtrip_foundation.owner_bundle_replay
         --bundle-dir /private/owner-glrd --report-dir /private/owner-reports
Never commit original Owner data or private lineage to a public repository.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import platform
import sys

from .snapshot_replay import (Hold, REPO, ENTRYPOINT, capture_snapshot,
                              converter_code_identity, digest, canonical_json,
                              replay_cii_without_edits, require)
from .lineage import build_lineage_ledger, validate_lineage_ledger

SCHEMA = "xml-cii-owner-frozen-run-bundle/v1"


def _safe_file(root: Path, descriptor: dict, label: str) -> bytes:
    require(type(descriptor) is dict and type(descriptor.get("path")) is str and
            type(descriptor.get("sha256")) is str and
            type(descriptor.get("bytes")) is int and descriptor["bytes"] >= 0,
            "HOLD_MISSING_INPUT", f"{label}: path, sha256 and byte length mandatory")
    relative = descriptor["path"]
    path = (root / relative).resolve()
    require(not Path(relative).is_absolute() and path.is_relative_to(root),
            "HOLD_MISSING_INPUT", f"{label}: unsafe path outside private bundle")
    require(path.is_file(), "HOLD_MISSING_INPUT", f"{label}: missing file {relative}")
    data = path.read_bytes()
    mismatch_code = (
        "HOLD_STALE_CII" if label == "originalCii" else
        "HOLD_CONFIGURATION_MISMATCH" if label in ("effectiveConfigJson", "staged.json", "template.cii")
        or label.startswith("upstream:") else "HOLD_STALE_SOURCE"
    )
    require(len(data) == descriptor["bytes"] and digest(data) == descriptor["sha256"],
            mismatch_code, f"{label}: archive SHA-256/byte length mismatch")
    return data


def inspect_bundle(bundle_dir: Path):
    root = bundle_dir.resolve()
    manifest_path = root / "run-custody.json"
    require(manifest_path.is_file(), "HOLD_MISSING_INPUT", "Actual run-custody.json missing")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise Hold("HOLD_MISSING_INPUT", "Invalid archive manifest: " + str(exc)) from exc
    require(type(manifest) is dict and manifest.get("schema") == SCHEMA and
            manifest.get("sourceStage") == "ENGINE_INPUT_XML" and
            type(manifest.get("runId")) is str and bool(manifest["runId"].strip()),
            "HOLD_MISSING_INPUT", "No valid exact run and source-stage custody")
    require(manifest.get("attestation") == {
        "effectiveRunInputsComplete": True,
        "originalCiiIndependentlyRetained": True,
        "upstreamMastersComplete": True,
    }, "HOLD_MISSING_INPUT", "Original run/independent CII custody is incomplete")
    converter = manifest.get("converter", {})
    require(converter.get("entrypoint") == ENTRYPOINT and
            converter.get("codeIdentity") == converter_code_identity() and
            converter.get("runtimeIdentity") == {
                "implementation": platform.python_implementation(),
                "pythonVersion": platform.python_version()},
            "HOLD_CONVERTER_IDENTITY", "Archived converter code/runtime identity differs")
    artifacts = manifest.get("artifacts")
    keys = ("originalUploadedXml", "engineInputXml", "originalCii", "effectiveConfigJson")
    require(type(artifacts) is dict and all(k in artifacts for k in keys),
            "HOLD_MISSING_INPUT", "Original uploaded XML, engine XML, CII and config required")
    primary = {k: _safe_file(root, artifacts[k], k) for k in keys}
    options = manifest.get("options")
    require(type(options) is dict, "HOLD_MISSING_INPUT", "Original invocation options missing")
    python_desc = manifest.get("pythonAssets")
    require(type(python_desc) is dict, "HOLD_MISSING_INPUT", "Python asset inventory missing")
    expected = ({"staged.json"} if options.get("stagedJsonPresent") is True else set()) | (
        {"template.cii"} if options.get("templateCiiPresent") is True else set())
    require(set(python_desc) == expected, "HOLD_MISSING_INPUT",
            "Actual staged/template assets differ from declared options")
    assets = {name: _safe_file(root, desc, name) for name, desc in python_desc.items()}
    upstream = manifest.get("upstreamAssets")
    # The original run—not today's expected defaults—defines which imported
    # masters/other dependencies are mandatory. A complete audit records those
    # actual roles explicitly, including an intentionally empty set if true.
    expected_roles = manifest.get("requiredUpstreamAssetRoles")
    require(type(expected_roles) is list and
            all(type(role) is str and bool(role.strip()) for role in expected_roles)
            and len(set(expected_roles)) == len(expected_roles),
            "HOLD_MISSING_INPUT", "Actual-run required upstream asset roles missing or duplicate")
    require(type(upstream) is list and all(type(row) is dict for row in upstream),
            "HOLD_MISSING_INPUT", "Original imported master inventory missing")
    roles = [row.get("role") for row in upstream]
    require(all(type(role) is str and bool(role.strip()) for role in roles)
            and len(roles) == len(set(roles)) and set(roles) == set(expected_roles),
            "HOLD_MISSING_INPUT", "Archived upstream roles do not match actual-run dependency manifest")
    upstream_sha = {}
    for row in upstream:
        role = row["role"]
        upstream_sha[role] = digest(_safe_file(root, row, "upstream:" + role))
    # Record actual historical selection, even if it is 'Coversheet'. NEVER
    # silently correct an original configuration to the 'Linelist' worksheet.
    require(type(manifest.get("effectiveLineListSheet")) is str and
            bool(manifest["effectiveLineListSheet"].strip()),
            "HOLD_MISSING_INPUT", "Historical line-list sheet selection not recorded")
    snapshot = capture_snapshot(
        engine_input_xml=primary["engineInputXml"], original_cii=primary["originalCii"],
        effective_config_json=primary["effectiveConfigJson"],
        original_uploaded_xml=primary["originalUploadedXml"],
        options=options, assets=assets, run_id=manifest["runId"],
        completeness_attestation="COMPLETE_NO_EXTERNAL_MASTERS")
    # The attestation above means no *additional direct Python CLI* masters:
    # all original upstream files were verified separately, and their effects
    # are frozen within the browser engine-input XML and effective config.
    complete_bundle_identity = {
        "runId": manifest["runId"], "sourceStage": manifest["sourceStage"],
        "replaySnapshotFingerprintSha256": snapshot["fingerprintSha256"],
        "originalUploadedXmlSha256": digest(primary["originalUploadedXml"]),
        "requiredUpstreamAssetRoles": sorted(expected_roles),
        "upstreamAssetsSha256": upstream_sha,
        "effectiveLineListSheet": manifest["effectiveLineListSheet"],
        "originalCiiArchiveAttestation": manifest["attestation"]["originalCiiIndependentlyRetained"],
    }
    return {"manifest": manifest, "primary": primary, "pythonAssets": assets,
            "upstreamAssetSha256": upstream_sha, "snapshot": snapshot,
            "bundleFingerprintSha256": digest(canonical_json(complete_bundle_identity))}


def run_owner_bundle(bundle_dir: Path):
    """Return receipt and private read-only ledger, or precise HOLD with no ledger."""
    try:
        custody = inspect_bundle(bundle_dir)
        p, snapshot = custody["primary"], custody["snapshot"]
        replay = replay_cii_without_edits(
            conversion_snapshot=snapshot, engine_input_xml=p["engineInputXml"],
            original_cii=p["originalCii"],
            effective_config_json=p["effectiveConfigJson"],
            configuration_assets=custody["pythonAssets"])
        result = {
            "schema": "xml-cii-owner-independent-replay-report/v1",
            "runId": custody["manifest"]["runId"],
            "evidenceClass": "CLAIMED_ARCHIVED_ORIGINAL_CII_INDEPENDENCE_REQUIRES_EXTERNAL_RECEIPT",
            "status": replay["verdict"],
            "snapshotFingerprintSha256": snapshot["fingerprintSha256"],
            "bundleFingerprintSha256": custody["bundleFingerprintSha256"],
            "requiredUpstreamAssetRoles": sorted(custody["manifest"]["requiredUpstreamAssetRoles"]),
            "upstreamAssetsSha256": custody["upstreamAssetSha256"],
            "originalUploadedXmlSha256": digest(p["originalUploadedXml"]),
            "engineInputXmlSha256": digest(p["engineInputXml"]),
            "originalCiiSha256": digest(p["originalCii"]),
            "effectiveConfigSha256": digest(p["effectiveConfigJson"]),
            "effectiveLineListSheet": custody["manifest"]["effectiveLineListSheet"],
            "configSelectionNotSilentlyCorrected": True,
            "comparison": replay.get("comparison"),
            "structure": replay.get("structure"),
            "reason": replay.get("reason"),
            "physicalMassApproval": "NOT_ATTESTED",
        }
        if replay["verdict"] != "PASS_EXACT_REPLAY":
            return result, None
        ledger = build_lineage_ledger(
            conversion_snapshot=snapshot, engine_input_xml=p["engineInputXml"],
            original_cii=p["originalCii"],
            effective_config_json=p["effectiveConfigJson"],
            configuration_assets=custody["pythonAssets"], replay_report=replay)
        result["lineageValidation"] = validate_lineage_ledger(
            ledger, expected_snapshot=snapshot)
        result["lineageCoverage"] = ledger["statistics"]
        return result, ledger
    except Hold as exc:
        return {"schema": "xml-cii-owner-independent-replay-report/v1",
                "status": exc.code, "reason": str(exc), "publishable": False}, None
    except Exception as exc:
        return {"schema": "xml-cii-owner-independent-replay-report/v1",
                "status": "HOLD_INTERNAL_ERROR", "reason": str(exc),
                "publishable": False}, None


def main():
    parser = argparse.ArgumentParser(description="Read-only archived Owner replay")
    parser.add_argument("--bundle-dir", required=True, type=Path)
    parser.add_argument("--report-dir", required=True, type=Path)
    args = parser.parse_args()
    root = REPO.resolve()
    bundle, reports = args.bundle_dir.resolve(), args.report_dir.resolve()
    if bundle.is_relative_to(root) or reports.is_relative_to(root):
        print("HOLD_PRIVATE_OUTPUT_PATH: Owner files must stay outside public repository",
              file=sys.stderr)
        return 2
    report, ledger = run_owner_bundle(bundle)
    reports.mkdir(parents=True, exist_ok=True)
    # Never leave a previously verified lineage file beside a new HOLD report:
    # it could otherwise be mistaken for this failed run's owner mapping.
    current_ledger_path = reports / "owner-private-lineage.json"
    current_ledger_path.unlink(missing_ok=True)
    (reports / "owner-independent-replay.json").write_text(
        json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    if ledger is not None:
        current_ledger_path.write_text(
            json.dumps(ledger, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "reportDir": str(reports),
                      "privateLineageWritten": ledger is not None}))
    return 0 if report["status"] == "PASS_EXACT_REPLAY" else 3

if __name__ == "__main__":
    raise SystemExit(main())
