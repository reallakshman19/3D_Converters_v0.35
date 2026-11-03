#!/usr/bin/env python3
"""Create unapproved candidates and verify reviewed ApprovedSemanticSplit.v1 artifacts.

Inputs are the overflowing source XML, reviewed canonical replacement XML,
expected canonical-topology artifact, rationale, and canonical XSD. The CLI
output is explicitly unapproved and cannot be runtime-selected. There is no inferred split and no
fallback: every exact byte hash must match before an approval can be selected.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from lxml import etree as ET

MAX_RESTRAINTS_PER_ELEMENT = 6


class ApprovedSemanticSplitError(RuntimeError):
    """Raised when approval evidence is incomplete, stale, or invalid."""


def stable_json_bytes(value: dict[str, Any]) -> bytes:
    """Serialize one JSON object deterministically for hashing and storage."""
    return (json.dumps(
        value,
        indent=2,
        sort_keys=True,
        ensure_ascii=False,
        allow_nan=False,
    ) + "\n").encode("utf-8")


def sha256(data: bytes) -> str:
    """Return the lowercase SHA-256 digest of exact bytes."""
    return hashlib.sha256(data).hexdigest()


def artifact_hash(value: dict[str, Any]) -> str:
    """Hash an approval while excluding its self-referential hash field."""
    payload = {key: item for key, item in value.items() if key != "artifactHashSha256"}
    return sha256(stable_json_bytes(payload))


def parse_xml(raw: bytes, label: str) -> ET._Element:
    """Parse exact XML bytes with network and entity expansion disabled."""
    parser = ET.XMLParser(resolve_entities=False, no_network=True, recover=False)
    try:
        return ET.fromstring(raw, parser)
    except ET.XMLSyntaxError as exc:
        raise ApprovedSemanticSplitError(f"{label} is not well-formed XML: {exc}") from exc


def restraint_overflows(root: ET._Element) -> list[dict[str, Any]]:
    """Return every PIPINGELEMENT whose direct restraint count exceeds six."""
    rows: list[dict[str, Any]] = []
    for element in root.xpath("//*[local-name()='PIPINGELEMENT']"):
        count = len(element.xpath("./*[local-name()='RESTRAINT']"))
        if count <= MAX_RESTRAINTS_PER_ELEMENT:
            continue
        rows.append({
            "elementId": element.get("ID") or "",
            "fromNode": element.get("FROM_NODE") or "",
            "toNode": element.get("TO_NODE") or "",
            "observedCount": count,
            "allowedCount": MAX_RESTRAINTS_PER_ELEMENT,
        })
    return rows


def validate_canonical_xml(root: ET._Element, canonical_xsd_path: Path) -> None:
    """Require the reviewed replacement to satisfy the canonical InputXML XSD."""
    schema = ET.XMLSchema(ET.parse(str(canonical_xsd_path)))
    if schema.validate(root):
        return
    messages = "; ".join(str(error) for error in schema.error_log)
    raise ApprovedSemanticSplitError(f"Approved canonical XML fails XSD validation: {messages}")


def candidate_core(
    source_bytes: bytes,
    canonical_bytes: bytes,
    topology_bytes: bytes,
    canonical_file_name: str,
    topology_file_name: str,
    approval_id: str,
    rationale: str,
    canonical_xsd_path: Path,
) -> dict[str, Any]:
    """Build common exact-output evidence from explicit source and reviewed files."""
    source_root = parse_xml(source_bytes, "Source InputXML")
    canonical_root = parse_xml(canonical_bytes, "Approved canonical InputXML")
    overflows = restraint_overflows(source_root)
    if not overflows:
        raise ApprovedSemanticSplitError("Source InputXML has no restraint overflow to approve.")
    if restraint_overflows(canonical_root):
        raise ApprovedSemanticSplitError("Approved canonical InputXML still exceeds restraint capacity.")
    validate_canonical_xml(canonical_root, canonical_xsd_path)
    if not approval_id.startswith("IAS-"):
        raise ApprovedSemanticSplitError("Approval ID must start with IAS-.")
    return {
        "approvalId": approval_id,
        "mode": "ADAPTED_CANONICAL",
        "sourceHashSha256": sha256(source_bytes),
        "approvedCanonicalFile": canonical_file_name,
        "approvedCanonicalHashSha256": sha256(canonical_bytes),
        "expectedCanonicalTopologyFile": topology_file_name,
        "expectedCanonicalTopologyHashSha256": sha256(topology_bytes),
        "rationale": rationale,
        "overflowElements": overflows,
    }


def build_unapproved_candidate(
    source_bytes: bytes,
    canonical_bytes: bytes,
    topology_bytes: bytes,
    canonical_file_name: str,
    topology_file_name: str,
    approval_id: str,
    rationale: str,
    canonical_xsd_path: Path,
) -> dict[str, Any]:
    """Build a deterministic candidate that runtime approval validation must reject."""
    core = candidate_core(source_bytes, canonical_bytes, topology_bytes, canonical_file_name, topology_file_name, approval_id, rationale, canonical_xsd_path)
    candidate = {"schema": "ApprovedSemanticSplitCandidate.v1", "approvalStatus": "UNAPPROVED", **core}
    candidate["artifactHashSha256"] = artifact_hash(candidate)
    return candidate


def build_approval_candidate(
    source_bytes: bytes,
    canonical_bytes: bytes,
    topology_bytes: bytes,
    canonical_file_name: str,
    topology_file_name: str,
    approval_id: str,
    approvers: list[str],
    approved_at: str,
    rationale: str,
    canonical_xsd_path: Path,
) -> dict[str, Any]:
    """Build an exact reviewed approval from explicit evidence and approval metadata."""
    core = candidate_core(source_bytes, canonical_bytes, topology_bytes, canonical_file_name, topology_file_name, approval_id, rationale, canonical_xsd_path)
    normalized_approvers = sorted({value.strip() for value in approvers if value.strip()})
    if not normalized_approvers:
        raise ApprovedSemanticSplitError("At least one named approver is required.")
    candidate = {"schema": "ApprovedSemanticSplit.v1", **core, "approvers": normalized_approvers, "approvedAt": approved_at}
    candidate["artifactHashSha256"] = artifact_hash(candidate)
    return candidate


def validate_approval(
    value: dict[str, Any],
    source_bytes: bytes,
    canonical_bytes: bytes,
    topology_bytes: bytes,
) -> None:
    """Verify an approval and all exact source/output/topology byte anchors."""
    checks = {
        "schema": value.get("schema") == "ApprovedSemanticSplit.v1",
        "mode": value.get("mode") == "ADAPTED_CANONICAL",
        "sourceHashSha256": value.get("sourceHashSha256") == sha256(source_bytes),
        "approvedCanonicalHashSha256": value.get("approvedCanonicalHashSha256") == sha256(canonical_bytes),
        "expectedCanonicalTopologyHashSha256": value.get("expectedCanonicalTopologyHashSha256") == sha256(topology_bytes),
        "artifactHashSha256": value.get("artifactHashSha256") == artifact_hash(value),
    }
    failures = [name for name, passed in checks.items() if not passed]
    if failures:
        raise ApprovedSemanticSplitError(f"Approved semantic split validation failed: {', '.join(failures)}.")


def main(argv: list[str] | None = None) -> int:
    """Write one deterministic approval candidate from explicit CLI paths."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--approved-canonical", type=Path, required=True)
    parser.add_argument("--canonical-topology", type=Path, required=True)
    parser.add_argument("--canonical-xsd", type=Path, required=True)
    parser.add_argument("--approval-id", required=True)
    parser.add_argument("--rationale", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    candidate = build_unapproved_candidate(
        args.source.read_bytes(), args.approved_canonical.read_bytes(),
        args.canonical_topology.read_bytes(), args.approved_canonical.name,
        args.canonical_topology.name,
        args.approval_id, args.rationale, args.canonical_xsd,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(stable_json_bytes(candidate))
    print(json.dumps({"status": "UNAPPROVED", "output": str(args.output), "artifactHashSha256": candidate["artifactHashSha256"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
