#!/usr/bin/env python3
"""Run structural InputXML compilation and publish mandatory release preflight evidence."""
from __future__ import annotations

import argparse
import copy
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

from inputxml_approved_semantic_split import validate_approval
from inputxml_assurance_ledger import build_assurance_ledger
from inputxml_assurance_ledger_v2 import build_assurance_ledger_v2
from inputxml_compatibility_request import (
    build_compatibility_request,
    validate_compatibility_request,
)
from inputxml_compiler.compiler import compile_document
from inputxml_compiler.publication_contract import CompilationView
from inputxml_compiler.serialization import hash_source_bytes
from inputxml_compiler.serialization_policy import load_serialization_policy
from inputxml_diagnostics import build_diagnostic_report
from inputxml_import_topology import build_import_topology_evidence, stable_json_bytes
from inputxml_release_policy import (
    build_canonical_source_model,
    build_compatibility_policy,
    build_normalization_plan,
    build_resolved_relationships,
    sha256,
)
from inputxml_resolver_trace import build_resolver_trace


class InputXmlReleasePreflightError(RuntimeError):
    """Raised when preflight inputs or bundled approvals are invalid."""


def load_json(path: Path) -> dict[str, Any]:
    """Load one required UTF-8 JSON object."""
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise InputXmlReleasePreflightError(f"{path} must contain a JSON object.")
    return value


def compile_source(
    source: bytes,
    source_name: str,
    source_path: str,
    contracts: Path,
    dialect_override: str | None,
) -> tuple[Any, dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Compile exact source bytes with the verified structural contract bundle."""
    policy_path = contracts / "compiler/inputxml-deterministic-serialization.json"
    canonical, ledger, validation = compile_document(
        source,
        source_name=source_name,
        source_repository="reallaksh19/3D_Converters",
        source_path=source_path,
        producer="inputxml-release-preflight",
        registry_path=contracts / "inputxml-dialect-registry.json",
        adapter_registry_path=contracts / "compiler/inputxml-compiler-adapters.json",
        serialization_policy_path=policy_path,
        alias_registry_path=contracts / "catalogs/inputxml-alias-registry.json",
        canonical_xsd_path=contracts / "inputxml-canonical-v1.xsd",
        categorized_xsd_path=contracts / "categorized-inputxml-v3.xsd",
        semantic_rules_path=contracts / "inputxml-semantic-rules-v1.sch",
        dialect_override=dialect_override,
        context={},
    )
    policy = load_serialization_policy(policy_path)
    return canonical, ledger, validation, policy


def canonical_bytes(
    source_hash: str,
    stem: str,
    canonical: Any,
    ledger: dict[str, Any],
    validation: dict[str, Any],
    policy: dict[str, Any],
) -> bytes:
    """Return exact deterministic compiler bytes after publication invariants pass."""
    view = CompilationView.from_compiler_result(
        stem=stem,
        source_hash=source_hash,
        canonical=canonical,
        ledger=ledger,
        validation=validation,
        policy=policy,
    )
    if view.canonical_bytes is None:
        raise InputXmlReleasePreflightError("Structural compiler produced no canonical candidate.")
    return view.canonical_bytes


def approval_paths(approval_dir: Path, approval_id: str) -> tuple[Path, Path, Path]:
    """Resolve one bundled approval and its exact reviewed artifacts."""
    approval_path = approval_dir / f"{approval_id}.json"
    approval = load_json(approval_path)
    canonical_path = approval_dir / str(approval.get("approvedCanonicalFile") or "")
    topology_path = approval_dir / str(approval.get("expectedCanonicalTopologyFile") or "")
    for path in (canonical_path, topology_path):
        if not path.is_file() or path.parent.resolve() != approval_dir.resolve():
            raise InputXmlReleasePreflightError(f"Bundled approval file is missing or escapes its directory: {path}.")
    return approval_path, canonical_path, topology_path


def select_approved_source(
    source: bytes,
    approval_dir: Path,
    approval_id: str,
) -> tuple[bytes, dict[str, Any], bytes]:
    """Select an exact reviewed replacement only after all approval hashes match."""
    approval_path, canonical_path, topology_path = approval_paths(approval_dir, approval_id)
    approval = load_json(approval_path)
    approved_bytes = canonical_path.read_bytes()
    topology_bytes = topology_path.read_bytes()
    validate_approval(approval, source, approved_bytes, topology_bytes)
    return approved_bytes, approval, topology_bytes


def write_json(output_dir: Path, name: str, value: Any) -> str:
    """Write one deterministic JSON artifact and return its absolute path."""
    path = output_dir / name
    path.write_bytes(stable_json_bytes(value))
    return str(path)


def write_preliminary(
    output_dir: Path,
    request: dict[str, Any],
    ledger: dict[str, Any],
    validation: dict[str, Any],
    policy: dict[str, Any],
    normalization: dict[str, Any],
    diagnostic_report: dict[str, Any],
    resolver_trace: dict[str, Any],
) -> dict[str, str]:
    """Write evidence available for PASS, BLOCKED, and diagnostic outcomes."""
    return {
        "compatibilityRequest": write_json(output_dir, "compatibility-request.json", request),
        "canonicalizationLedger": write_json(output_dir, "canonicalization-ledger.json", ledger),
        "canonicalValidation": write_json(output_dir, "canonical-validation.json", validation),
        "compatibilityPolicy": write_json(output_dir, "compatibility-policy.json", policy),
        "normalizationPlan": write_json(output_dir, "normalization-plan.json", normalization),
        "diagnosticReport": write_json(output_dir, "diagnostic-report.json", diagnostic_report),
        "resolverTrace": write_json(output_dir, "resolver-trace.json", resolver_trace),
    }


def build_v1_assurance(
    canonical_xml: bytes,
    ledger: dict[str, Any],
    validation: dict[str, Any],
    contracts: Path,
) -> dict[str, Any]:
    """Reuse the established field/projection readiness builder before v2 gates."""
    return build_assurance_ledger(
        canonical_xml=canonical_xml,
        canonicalization_ledger=ledger,
        canonical_validation=validation,
        field_catalog=load_json(contracts / "catalogs/inputxml-field-catalog.json"),
        projection_contract=load_json(contracts / "catalogs/inputxml-cii-projection-contract.json"),
        topology_trace=None,
        topology_parity=None,
    )


def write_release_evidence(
    output_dir: Path,
    canonical_xml: bytes,
    topology: dict[str, dict[str, Any]],
    source_model: dict[str, Any],
    relationships: list[dict[str, Any]],
    v1_assurance: dict[str, Any],
    v2_assurance: dict[str, Any],
    approval: dict[str, Any] | None,
) -> dict[str, str]:
    """Write canonical bytes and all mandatory topology/assurance artifacts."""
    canonical_path = output_dir / "canonical.input.xml"
    canonical_path.write_bytes(canonical_xml)
    outputs = {"canonicalInputXml": str(canonical_path)}
    names = {
        "canonicalTopology": "canonical-topology-v2.json",
        "topoNodePlan": "topo-node-plan.json",
        "numberedTopologyProjection": "numbered-topology-projection.json",
        "parsedInputXmlTopology": "parsed-inputxml-topology.json",
        "topologyParityReport": "topology-parity-report-v2.json",
    }
    outputs.update({key: write_json(output_dir, name, topology[key]) for key, name in names.items()})
    outputs["canonicalSourceModel"] = write_json(output_dir, "canonical-source-model.json", source_model)
    outputs["resolvedRelationships"] = write_json(output_dir, "resolved-relationships.json", relationships)
    outputs["assuranceLedgerV1"] = write_json(output_dir, "assurance-ledger-v1.json", v1_assurance)
    outputs["assuranceLedger"] = write_json(output_dir, "assurance-ledger-v2.json", v2_assurance)
    if approval is not None:
        outputs["approvedSemanticSplitEvidence"] = write_json(output_dir, "approved-semantic-split.json", approval)
    return outputs


def run_preflight(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    """Execute structural preflight and return its summary plus process status."""
    source = args.input.read_bytes()
    source_hash = hash_source_bytes(source)
    if args.compatibility_request is not None:
        request = validate_compatibility_request(
            load_json(args.compatibility_request),
            args.input.name,
            source,
            args.mode,
            args.approved_split_id,
        )
    else:
        request = build_compatibility_request(
            args.converter_id,
            args.mode,
            args.input.name,
            source,
            args.approved_split_id,
        )
    initial = compile_source(source, args.input.name, str(args.input), args.contracts_dir, None)
    _, initial_ledger, initial_validation, _ = initial
    detected_dialect = str(initial_validation.get("dialect") or initial_ledger.get("dialect") or "unresolved")
    approval, approved_topology_bytes = None, None
    compiled = initial
    compiler_source = source
    if args.approved_split_id:
        approved_bytes, approval, approved_topology_bytes = select_approved_source(source, args.approval_dir, args.approved_split_id)
        compiler_source = approved_bytes
        compiled = compile_source(approved_bytes, args.input.name, str(args.input), args.contracts_dir, "canonical-inputxml-v1")
    canonical, ledger, validation, serialization_policy = compiled
    compiled_canonical_xml = None
    if canonical is not None and validation.get("status") == "PASS":
        compiled_canonical_xml = canonical_bytes(
            hash_source_bytes(compiler_source), args.input.stem,
            canonical, ledger, validation, serialization_policy,
        )
    if approval is not None:
        ledger = copy.deepcopy(ledger)
        ledger["sourceHashSha256"] = source_hash
        ledger["dialect"] = detected_dialect
    policy = build_compatibility_policy(args.mode, detected_dialect, source_hash, args.approved_split_id, validation.get("status"))
    compiled_hash = ledger.get("canonicalHashSha256") if canonical is not None else None
    normalization = build_normalization_plan(source_hash, compiled_hash, policy, ledger, args.approved_split_id)
    diagnostic_report = build_diagnostic_report(
        source_hash,
        policy["status"],
        [
            list(ledger.get("diagnostics") or []),
            list(validation.get("diagnostics") or []),
            list(policy.get("diagnostics") or []),
            list(normalization.get("diagnostics") or []),
        ],
    )
    resolver_trace = build_resolver_trace(
        source_hash,
        policy["status"],
        ledger,
        validation,
        None,
    )
    outputs = write_preliminary(
        args.output_dir,
        request,
        ledger,
        validation,
        policy,
        normalization,
        diagnostic_report,
        resolver_trace,
    )
    if canonical is None or validation.get("status") != "PASS":
        result = {"schema": "InputXmlReleasePreflightResult.v1", "status": policy["status"], "releaseEligible": False, "outputs": outputs}
        outputs["preflightResult"] = write_json(args.output_dir, "preflight-result.json", result)
        return result, 0 if args.mode == "DIAGNOSTIC_ONLY" else 2
    if compiled_canonical_xml is None:
        raise InputXmlReleasePreflightError("PASS compiler result has no canonical bytes.")
    canonical_xml = compiled_canonical_xml
    topology = build_import_topology_evidence(canonical, canonical_xml, source_hash)
    if approved_topology_bytes is not None and sha256(stable_json_bytes(topology["canonicalTopology"])) != sha256(approved_topology_bytes):
        raise InputXmlReleasePreflightError("Approved canonical topology bytes differ from computed release topology.")
    relationships = build_resolved_relationships(topology["canonicalTopology"])
    source_model = build_canonical_source_model(source_hash, detected_dialect, ledger, [row["relationshipId"] for row in relationships])
    v1_assurance = build_v1_assurance(canonical_xml, ledger, validation, args.contracts_dir)
    diagnostic_report = build_diagnostic_report(
        source_hash,
        policy["status"],
        [
            list(ledger.get("diagnostics") or []),
            list(validation.get("diagnostics") or []),
            list(policy.get("diagnostics") or []),
            list(normalization.get("diagnostics") or []),
            list(topology["topologyParityReport"].get("diagnostics") or []),
        ],
    )
    resolver_trace = build_resolver_trace(
        source_hash,
        policy["status"],
        ledger,
        validation,
        topology["topologyParityReport"],
    )
    outputs["diagnosticReport"] = write_json(args.output_dir, "diagnostic-report.json", diagnostic_report)
    outputs["resolverTrace"] = write_json(args.output_dir, "resolver-trace.json", resolver_trace)
    v2_assurance = build_assurance_ledger_v2(
        v1_assurance,
        policy,
        normalization,
        topology["canonicalTopology"],
        topology["topoNodePlan"],
        topology["numberedTopologyProjection"],
        topology["parsedInputXmlTopology"],
        topology["topologyParityReport"],
        diagnostic_report,
        resolver_trace,
        approval,
    )
    outputs.update(write_release_evidence(args.output_dir, canonical_xml, topology, source_model, relationships, v1_assurance, v2_assurance, approval))
    release_eligible = policy["status"] == "PASS" and v2_assurance["status"] == "PASS"
    result = {"schema": "InputXmlReleasePreflightResult.v1", "status": "PASS" if release_eligible else policy["status"], "releaseEligible": release_eligible, "outputs": outputs}
    outputs["preflightResult"] = write_json(args.output_dir, "preflight-result.json", result)
    return result, 0 if release_eligible or args.mode == "DIAGNOSTIC_ONLY" else 2
def parser() -> argparse.ArgumentParser:
    """Create the explicit release-preflight CLI parser."""
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("--input", type=Path, required=True)
    value.add_argument("--output-dir", type=Path, required=True)
    value.add_argument("--contracts-dir", type=Path, required=True)
    value.add_argument("--approval-dir", type=Path, required=True)
    value.add_argument("--mode", choices=["CANONICAL_STRICT", "ADAPTED_CANONICAL", "DIAGNOSTIC_ONLY"], required=True)
    value.add_argument("--approved-split-id")
    request = value.add_mutually_exclusive_group(required=True)
    request.add_argument("--converter-id")
    request.add_argument("--compatibility-request", type=Path)
    return value


def main(argv: list[str] | None = None) -> int:
    """Run preflight and print the machine-readable result."""
    args = parser().parse_args(argv)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    result, exit_code = run_preflight(args)
    print(json.dumps(result, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
