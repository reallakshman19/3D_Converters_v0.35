#!/usr/bin/env python3
"""Project PASS InputXML v2 assurance to CII and publish an exact output manifest."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
if REPOSITORY_ROOT.is_dir() and str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))
REPOSITORY_SCRIPTS = REPOSITORY_ROOT / "scripts"
if REPOSITORY_SCRIPTS.is_dir() and str(REPOSITORY_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_SCRIPTS))

from inputxml_assurance_ledger_v2 import hash_without as assurance_hash_without
from inputxml_selected_output_manifest import (
    build_selected_output_manifest,
    stable_json_bytes,
    verify_selected_output_files,
)
from inputxml_to_cii2019_assured import build_assured_projection


class InputXmlReleaseProjectionError(RuntimeError):
    """Raised when v2 assurance cannot authorize production CII output."""


def load_json(path: Path) -> dict[str, Any]:
    """Load one required UTF-8 JSON object."""
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise InputXmlReleaseProjectionError(f"{path} must contain a JSON object.")
    return value


def validate_assurance_v2(value: dict[str, Any], canonical_xml: bytes) -> None:
    """Require PASS v2 assurance and an exact canonical InputXML hash anchor."""
    if value.get("schema") != "InputXmlCiiAssuranceLedger.v2" or value.get("status") != "PASS":
        raise InputXmlReleaseProjectionError("CII release requires PASS InputXmlCiiAssuranceLedger.v2 evidence.")
    failed = [name for name, status in (value.get("gates") or {}).items() if status != "PASS"]
    if failed:
        raise InputXmlReleaseProjectionError(f"CII release assurance gates are blocked: {', '.join(sorted(failed))}.")
    canonical_hash = hashlib.sha256(canonical_xml).hexdigest()
    if (value.get("chain") or {}).get("canonicalHashSha256") != canonical_hash:
        raise InputXmlReleaseProjectionError("CII release canonical hash differs from assurance evidence.")
    if value.get("assuranceHashSha256") != assurance_hash_without(value, "assuranceHashSha256"):
        raise InputXmlReleaseProjectionError("CII release assurance hash is stale.")


def legacy_assurance_view(value: dict[str, Any]) -> dict[str, Any]:
    """Create the established writer-adapter view after v2 authorization succeeds."""
    result = copy.deepcopy(value)
    result["schema"] = "InputXmlCiiAssuranceLedger.v1"
    result["gates"] = {
        "canonicalization": value["gates"]["canonicalization"],
        "canonicalValidation": value["gates"]["canonicalValidation"],
        "topologyTrace": value["gates"]["topologyTrace"],
        "topologyParity": value["gates"]["topologyParity"],
        "ciiProjectionReadiness": value["gates"]["ciiProjectionReadiness"],
    }
    return result


def artifact_paths(args: argparse.Namespace) -> dict[str, Path]:
    """Map selected manifest roles to exact release artifact paths."""
    paths = {
        "canonicalInputXml": args.input,
        "cii": args.output,
        "compatibilityRequest": args.compatibility_request,
        "compatibilityPolicy": args.compatibility_policy,
        "canonicalizationLedger": args.canonicalization_ledger,
        "canonicalValidation": args.canonical_validation,
        "normalizationPlan": args.normalization_plan,
        "diagnosticReport": args.diagnostic_report,
        "resolverTrace": args.resolver_trace,
        "canonicalSourceModel": args.canonical_source_model,
        "resolvedRelationships": args.resolved_relationships,
        "canonicalTopology": args.canonical_topology,
        "topoNodePlan": args.topo_node_plan,
        "numberedTopologyProjection": args.numbered_projection,
        "parsedInputXmlTopology": args.parsed_topology,
        "topologyParityReport": args.topology_parity,
        "assuranceLedger": args.assurance_ledger,
        "ciiProjectionLedger": args.projection_ledger,
    }
    if args.approved_semantic_split is not None:
        paths["approvedSemanticSplitEvidence"] = args.approved_semantic_split
    return paths


def run_release(args: argparse.Namespace) -> dict[str, Any]:
    """Generate CII, projection ledger, and selected-output manifest atomically by gates."""
    canonical_xml = args.input.read_bytes()
    assurance = load_json(args.assurance_ledger)
    validate_assurance_v2(assurance, canonical_xml)
    projection_contract = load_json(args.projection_contract)
    cii_text, projection = build_assured_projection(
        canonical_xml=canonical_xml,
        assurance=legacy_assurance_view(assurance),
        projection_contract=projection_contract,
        canonical_path=args.input,
    )
    args.projection_ledger.write_bytes(stable_json_bytes(projection))
    if cii_text is None or projection.get("status") != "PASS":
        raise InputXmlReleaseProjectionError("Production CII projection is BLOCKED; inspect the projection ledger.")
    args.output.write_text(cii_text, encoding="utf-8")
    policy = load_json(args.compatibility_policy)
    manifest = build_selected_output_manifest(
        (assurance.get("chain") or {}).get("sourceHashSha256"),
        policy, assurance, projection, artifact_paths(args),
    )
    args.selected_output_manifest.write_bytes(stable_json_bytes(manifest))
    verify_selected_output_files(manifest, args.selected_output_manifest.parent)
    return {"status": "PASS", "output": str(args.output), "projectionLedger": str(args.projection_ledger), "selectedOutputManifest": str(args.selected_output_manifest), "manifestHashSha256": manifest["manifestHashSha256"]}


def parser() -> argparse.ArgumentParser:
    """Create the explicit assured-release CLI parser."""
    value = argparse.ArgumentParser(description=__doc__)
    for name in ("input", "assurance-ledger", "projection-contract", "compatibility-request", "compatibility-policy", "canonicalization-ledger", "canonical-validation", "normalization-plan", "diagnostic-report", "resolver-trace", "canonical-source-model", "resolved-relationships", "canonical-topology", "topo-node-plan", "numbered-projection", "parsed-topology", "topology-parity", "output", "projection-ledger", "selected-output-manifest"):
        value.add_argument(f"--{name}", type=Path, required=True)
    value.add_argument("--approved-semantic-split", type=Path)
    return value


def main(argv: list[str] | None = None) -> int:
    """Run one v2-authorized production projection."""
    result = run_release(parser().parse_args(argv))
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
