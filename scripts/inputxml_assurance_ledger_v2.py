#!/usr/bin/env python3
"""Build mandatory-topology InputXmlCiiAssuranceLedger.v2 evidence.

The builder upgrades an existing v1 pre-writer assurance ledger by verifying
compatibility, normalization, canonical topology, node-plan projection,
post-serialization parsing, and TopologyParityReport.v2 hash anchors. Release
status is PASS only when every required gate passes; NOT_APPLICABLE is not used.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


class AssuranceV2Error(RuntimeError):
    """Raised when required v2 assurance inputs are structurally invalid."""


def stable_json_bytes(value: dict[str, Any]) -> bytes:
    """Serialize one JSON object identically for artifact hashing."""
    return (json.dumps(
        value,
        indent=2,
        sort_keys=True,
        ensure_ascii=False,
        allow_nan=False,
    ) + "\n").encode("utf-8")


def sha256(data: bytes) -> str:
    """Return a lowercase SHA-256 digest for exact bytes."""
    return hashlib.sha256(data).hexdigest()


def hash_without(value: dict[str, Any], field: str) -> str:
    """Hash deterministic JSON after excluding one self-hash field."""
    return sha256(stable_json_bytes({key: item for key, item in value.items() if key != field}))


def require_schema(value: dict[str, Any], schema: str, label: str) -> None:
    """Require an explicit artifact schema before using any fields."""
    if not isinstance(value, dict) or value.get("schema") != schema:
        raise AssuranceV2Error(f"{label} must use schema {schema}.")


def diagnostic(code: str, message: str, context: dict[str, Any]) -> dict[str, Any]:
    """Create one immutable-friendly blocking diagnostic value."""
    return {"severity": "BLOCKING", "code": code, "message": message, "context": context}


def compare_anchor(
    diagnostics: list[dict[str, Any]],
    code: str,
    expected: Any,
    actual: Any,
) -> None:
    """Append a blocking diagnostic when two exact hash/status anchors differ."""
    if expected == actual:
        return
    diagnostics.append(diagnostic(code, "InputXML release evidence anchor mismatch.", {
        "expected": expected,
        "actual": actual,
    }))


def validate_artifact_hashes(
    diagnostics: list[dict[str, Any]],
    normalization: dict[str, Any],
    canonical_topology: dict[str, Any],
    projection: dict[str, Any],
    parsed_topology: dict[str, Any],
    parity: dict[str, Any],
) -> None:
    """Verify every self-hash and cross-artifact topology anchor."""
    compare_anchor(diagnostics, "NORMALIZATION_PLAN_HASH_MISMATCH", hash_without(normalization, "normalizationPlanHashSha256"), normalization.get("normalizationPlanHashSha256"))
    compare_anchor(diagnostics, "CANONICAL_TOPOLOGY_HASH_MISMATCH", hash_without(canonical_topology, "canonicalTopologyHashSha256"), canonical_topology.get("canonicalTopologyHashSha256"))
    compare_anchor(diagnostics, "NUMBERED_PROJECTION_HASH_MISMATCH", hash_without(projection, "numberedTopologyProjectionHashSha256"), projection.get("numberedTopologyProjectionHashSha256"))
    compare_anchor(diagnostics, "PARSED_TOPOLOGY_HASH_MISMATCH", hash_without(parsed_topology, "parsedInputXmlTopologyHashSha256"), parsed_topology.get("parsedInputXmlTopologyHashSha256"))
    compare_anchor(diagnostics, "TOPOLOGY_PARITY_HASH_MISMATCH", hash_without(parity, "topologyParityReportHashSha256"), parity.get("topologyParityReportHashSha256"))
    compare_anchor(diagnostics, "PROJECTION_CANONICAL_HASH_MISMATCH", canonical_topology.get("canonicalTopologyHashSha256"), projection.get("canonicalTopologyHashSha256"))
    compare_anchor(diagnostics, "PARSED_CANONICAL_HASH_MISMATCH", canonical_topology.get("canonicalTopologyHashSha256"), parsed_topology.get("canonicalTopologyHashSha256"))
    compare_anchor(diagnostics, "PARITY_CANONICAL_HASH_MISMATCH", canonical_topology.get("canonicalTopologyHashSha256"), parity.get("canonicalTopologyHashSha256"))
    compare_anchor(diagnostics, "PARITY_PROJECTION_HASH_MISMATCH", projection.get("numberedTopologyProjectionHashSha256"), parity.get("numberedTopologyProjectionHashSha256"))
    compare_anchor(diagnostics, "PARITY_PARSED_HASH_MISMATCH", parsed_topology.get("parsedInputXmlTopologyHashSha256"), parity.get("parsedInputXmlTopologyHashSha256"))


def validate_approval_anchor(
    diagnostics: list[dict[str, Any]],
    policy: dict[str, Any],
    v1_assurance: dict[str, Any],
    canonical_topology: dict[str, Any],
    approval: dict[str, Any] | None,
) -> dict[str, str] | None:
    """Require an exact bundled approval only when the policy selects one."""
    approval_id = policy.get("approvedSemanticSplitId")
    if approval_id is None:
        if approval is not None:
            diagnostics.append(diagnostic("UNSELECTED_APPROVAL", "An approval was supplied but not selected by policy.", {}))
        return None
    if approval is None:
        diagnostics.append(diagnostic("SELECTED_APPROVAL_MISSING", "Selected semantic split approval is missing.", {"approvalId": approval_id}))
        return None
    require_schema(approval, "ApprovedSemanticSplit.v1", "Approved semantic split")
    compare_anchor(diagnostics, "APPROVAL_ID_MISMATCH", approval_id, approval.get("approvalId"))
    compare_anchor(diagnostics, "APPROVAL_SOURCE_HASH_MISMATCH", policy.get("sourceHashSha256"), approval.get("sourceHashSha256"))
    compare_anchor(diagnostics, "APPROVAL_CANONICAL_HASH_MISMATCH", (v1_assurance.get("chain") or {}).get("canonicalHashSha256"), approval.get("approvedCanonicalHashSha256"))
    topology_file_hash = sha256(stable_json_bytes(canonical_topology))
    compare_anchor(diagnostics, "APPROVAL_TOPOLOGY_HASH_MISMATCH", topology_file_hash, approval.get("expectedCanonicalTopologyHashSha256"))
    compare_anchor(diagnostics, "APPROVAL_ARTIFACT_HASH_MISMATCH", hash_without(approval, "artifactHashSha256"), approval.get("artifactHashSha256"))
    return {"approvalId": str(approval.get("approvalId") or ""), "artifactHashSha256": str(approval.get("artifactHashSha256") or "")}


def build_assurance_ledger_v2(
    v1_assurance: dict[str, Any],
    compatibility_policy: dict[str, Any],
    normalization_plan: dict[str, Any],
    canonical_topology: dict[str, Any],
    topo_node_plan: dict[str, Any],
    numbered_projection: dict[str, Any],
    parsed_topology: dict[str, Any],
    topology_parity: dict[str, Any],
    diagnostic_report: dict[str, Any],
    resolver_trace: dict[str, Any],
    approved_semantic_split: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build mandatory-gate v2 assurance from explicit release evidence."""
    require_schema(v1_assurance, "InputXmlCiiAssuranceLedger.v1", "V1 assurance")
    require_schema(compatibility_policy, "InputXmlCompatibilityPolicy.v1", "Compatibility policy")
    require_schema(normalization_plan, "InputXmlNormalizationPlan.v1", "Normalization plan")
    require_schema(canonical_topology, "CanonicalTopology.v2", "Canonical topology")
    require_schema(topo_node_plan, "TopoNodePlan.v1", "Topo node plan")
    require_schema(numbered_projection, "NumberedTopologyProjection.v1", "Numbered projection")
    require_schema(parsed_topology, "ParsedInputXmlTopology.v1", "Parsed topology")
    require_schema(topology_parity, "TopologyParityReport.v2", "Topology parity")
    require_schema(diagnostic_report, "InputXmlDiagnosticReport.v1", "Diagnostic report")
    require_schema(resolver_trace, "InputXmlResolverTrace.v1", "Resolver trace")
    diagnostics: list[dict[str, Any]] = []
    validate_artifact_hashes(diagnostics, normalization_plan, canonical_topology, numbered_projection, parsed_topology, topology_parity)
    v1_chain = v1_assurance.get("chain") or {}
    compare_anchor(diagnostics, "SOURCE_HASH_MISMATCH", v1_chain.get("sourceHashSha256"), compatibility_policy.get("sourceHashSha256"))
    compare_anchor(diagnostics, "NORMALIZATION_SOURCE_HASH_MISMATCH", compatibility_policy.get("sourceHashSha256"), normalization_plan.get("sourceHashSha256"))
    compare_anchor(diagnostics, "NORMALIZATION_CANONICAL_HASH_MISMATCH", v1_chain.get("canonicalHashSha256"), normalization_plan.get("canonicalHashSha256"))
    compare_anchor(diagnostics, "NODE_PLAN_HASH_MISMATCH", str(topo_node_plan.get("nodePlanHash") or "").removeprefix("sha256:"), numbered_projection.get("topoNodePlanHashSha256"))
    compare_anchor(diagnostics, "DIAGNOSTIC_REPORT_HASH_MISMATCH", hash_without(diagnostic_report, "diagnosticReportHashSha256"), diagnostic_report.get("diagnosticReportHashSha256"))
    compare_anchor(diagnostics, "RESOLVER_TRACE_HASH_MISMATCH", hash_without(resolver_trace, "resolverTraceHashSha256"), resolver_trace.get("resolverTraceHashSha256"))
    compare_anchor(diagnostics, "DIAGNOSTIC_SOURCE_HASH_MISMATCH", compatibility_policy.get("sourceHashSha256"), diagnostic_report.get("sourceHashSha256"))
    compare_anchor(diagnostics, "RESOLVER_SOURCE_HASH_MISMATCH", compatibility_policy.get("sourceHashSha256"), resolver_trace.get("sourceHashSha256"))
    for label, value in (
        ("v1 assurance", v1_assurance.get("status")),
        ("compatibility", compatibility_policy.get("status")),
        ("normalization", normalization_plan.get("status")),
        ("topology parity", topology_parity.get("status")),
        ("diagnostics", diagnostic_report.get("status")),
        ("resolver trace", resolver_trace.get("status")),
    ):
        if value != "PASS":
            diagnostics.append(diagnostic("RELEASE_GATE_NOT_PASS", f"{label} status must be PASS.", {"status": value}))
    approval_ref = validate_approval_anchor(diagnostics, compatibility_policy, v1_assurance, canonical_topology, approved_semantic_split)
    status = "PASS" if not diagnostics else "BLOCKED"
    gate = "PASS" if status == "PASS" else "BLOCKED"
    base = {
        "schema": "InputXmlCiiAssuranceLedger.v2",
        "status": status,
        "chain": {
            **v1_chain,
            "normalizationPlanHashSha256": normalization_plan.get("normalizationPlanHashSha256"),
            "canonicalTopologyHashSha256": canonical_topology.get("canonicalTopologyHashSha256"),
            "topoNodePlanHashSha256": numbered_projection.get("topoNodePlanHashSha256"),
            "numberedTopologyProjectionHashSha256": numbered_projection.get("numberedTopologyProjectionHashSha256"),
            "parsedInputXmlTopologyHashSha256": parsed_topology.get("parsedInputXmlTopologyHashSha256"),
            "topologyParityReportHashSha256": topology_parity.get("topologyParityReportHashSha256"),
            "diagnosticReportHashSha256": diagnostic_report.get("diagnosticReportHashSha256"),
            "resolverTraceHashSha256": resolver_trace.get("resolverTraceHashSha256"),
        },
        "gates": {
            "compatibility": "PASS" if compatibility_policy.get("status") == "PASS" else "BLOCKED",
            "canonicalization": "PASS" if (v1_assurance.get("gates") or {}).get("canonicalization") == "PASS" else "BLOCKED",
            "canonicalValidation": "PASS" if (v1_assurance.get("gates") or {}).get("canonicalValidation") == "PASS" else "BLOCKED",
            "topologyTrace": gate,
            "topologyParity": "PASS" if topology_parity.get("status") == "PASS" and not diagnostics else "BLOCKED",
            "diagnostics": "PASS" if diagnostic_report.get("status") == "PASS" and not diagnostics else "BLOCKED",
            "resolverTrace": "PASS" if resolver_trace.get("status") == "PASS" and not diagnostics else "BLOCKED",
            "ciiProjectionReadiness": "PASS" if (v1_assurance.get("gates") or {}).get("ciiProjectionReadiness") == "PASS" and not diagnostics else "BLOCKED",
        },
        "approvedSemanticSplit": approval_ref,
        "records": v1_assurance.get("records") or [],
        "diagnostics": [*(v1_assurance.get("diagnostics") or []), *diagnostics],
    }
    base["assuranceHashSha256"] = hash_without(base, "assuranceHashSha256")
    return base


def load_json(path: Path) -> dict[str, Any]:
    """Load one UTF-8 JSON object from an explicit path."""
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AssuranceV2Error(f"{path} must contain a JSON object.")
    return value


def main(argv: list[str] | None = None) -> int:
    """Build one v2 assurance ledger from explicit artifact paths."""
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("v1-assurance", "compatibility-policy", "normalization-plan", "canonical-topology", "topo-node-plan", "numbered-projection", "parsed-topology", "topology-parity", "diagnostic-report", "resolver-trace"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--approved-semantic-split", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    approval = load_json(args.approved_semantic_split) if args.approved_semantic_split else None
    ledger = build_assurance_ledger_v2(
        load_json(args.v1_assurance), load_json(args.compatibility_policy),
        load_json(args.normalization_plan), load_json(args.canonical_topology),
        load_json(args.topo_node_plan), load_json(args.numbered_projection),
        load_json(args.parsed_topology), load_json(args.topology_parity),
        load_json(args.diagnostic_report), load_json(args.resolver_trace), approval,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(stable_json_bytes(ledger))
    print(json.dumps({"status": ledger["status"], "output": str(args.output), "assuranceHashSha256": ledger["assuranceHashSha256"]}, indent=2))
    return 0 if ledger["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
