#!/usr/bin/env python3
"""[SIMULATED] Exercise exact approved semantic split through CII release."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.inputxml_approved_semantic_split import build_approval_candidate  # noqa: E402
from scripts.inputxml_compiler.serialization import hash_source_bytes  # noqa: E402
from scripts.inputxml_import_topology import build_import_topology_evidence, stable_json_bytes  # noqa: E402

SOURCE = ROOT / "contracts/inputxml/v1/golden/negative/restraint-overflow.xml"
REVIEWED_SOURCE = ROOT / "contracts/inputxml/v1/golden/positive/minimal.canonical.input.xml"
XSD = ROOT / "contracts/inputxml/v1/inputxml-canonical-v1.xsd"
PREFLIGHT = ROOT / "converters/scripts/inputxml_release_preflight.py"
RELEASE = ROOT / "converters/scripts/inputxml_to_cii2019_release.py"
CONTRACTS = ROOT / "contracts/inputxml/v1"
APPROVAL_ID = "IAS-SIMULATED-EXACT"


def run(command: list[str], expected: int) -> subprocess.CompletedProcess[str]:
    """Run one explicit local command and require its expected status."""
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if result.returncode != expected:
        raise AssertionError(f"Expected exit {expected}, got {result.returncode}:\n{result.stdout}\n{result.stderr}")
    return result


def preflight_command(source: Path, output: Path, approvals: Path, mode: str, approval_id: str | None) -> list[str]:
    """Build one explicit structural preflight command."""
    command = [
        sys.executable, str(PREFLIGHT), "--input", str(source), "--output-dir", str(output),
        "--contracts-dir", str(CONTRACTS), "--approval-dir", str(approvals), "--mode", mode,
        "--converter-id", "inputxml_to_cii2019",
    ]
    if approval_id is not None:
        command.extend(["--approved-split-id", approval_id])
    return command


def release_command(directory: Path) -> list[str]:
    """Build the exact v2-authorized CII release command for one directory."""
    def path(name: str) -> str:
        return str(directory / name)
    return [
        sys.executable, str(RELEASE), "--input", path("canonical.input.xml"),
        "--assurance-ledger", path("assurance-ledger-v2.json"),
        "--projection-contract", str(CONTRACTS / "catalogs/inputxml-cii-projection-contract.json"),
        "--compatibility-request", path("compatibility-request.json"),
        "--compatibility-policy", path("compatibility-policy.json"),
        "--canonicalization-ledger", path("canonicalization-ledger.json"),
        "--canonical-validation", path("canonical-validation.json"),
        "--normalization-plan", path("normalization-plan.json"),
        "--diagnostic-report", path("diagnostic-report.json"),
        "--resolver-trace", path("resolver-trace.json"),
        "--canonical-source-model", path("canonical-source-model.json"),
        "--resolved-relationships", path("resolved-relationships.json"),
        "--canonical-topology", path("canonical-topology-v2.json"),
        "--topo-node-plan", path("topo-node-plan.json"),
        "--numbered-projection", path("numbered-topology-projection.json"),
        "--parsed-topology", path("parsed-inputxml-topology.json"),
        "--topology-parity", path("topology-parity-report-v2.json"),
        "--output", path("released.cii"), "--projection-ledger", path("cii-projection-ledger.json"),
        "--selected-output-manifest", path("selected-output-manifest.json"),
        "--approved-semantic-split", path("approved-semantic-split.json"),
    ]


def prepare_approval(seed: Path, approvals: Path) -> None:
    """Create an exact reviewed approval from explicit source/output files."""
    canonical_name = "approved-canonical.input.xml"
    topology_name = "approved-canonical-topology.json"
    canonical_bytes = (seed / "canonical.input.xml").read_bytes()
    canonical = ET.fromstring(canonical_bytes)
    topology = build_import_topology_evidence(canonical, canonical_bytes, hash_source_bytes(SOURCE.read_bytes()))
    topology_bytes = stable_json_bytes(topology["canonicalTopology"])
    candidate = build_approval_candidate(
        SOURCE.read_bytes(), canonical_bytes, topology_bytes, canonical_name, topology_name,
        APPROVAL_ID, ["engineering-reviewer"], "2026-07-23T00:00:00Z",
        "Reviewed simulated exact semantic replacement.", XSD,
    )
    approvals.mkdir(parents=True)
    (approvals / canonical_name).write_bytes(canonical_bytes)
    (approvals / topology_name).write_bytes(topology_bytes)
    (approvals / f"{APPROVAL_ID}.json").write_text(json.dumps(candidate, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    """Require exact adapted PASS release and altered-source rejection."""
    with TemporaryDirectory(prefix="inputxml-adapted-release-") as temporary:
        root = Path(temporary)
        seed, approvals, adapted = root / "seed", root / "approvals", root / "adapted"
        run(preflight_command(REVIEWED_SOURCE, seed, approvals, "CANONICAL_STRICT", None), 0)
        prepare_approval(seed, approvals)
        run(preflight_command(SOURCE, adapted, approvals, "ADAPTED_CANONICAL", APPROVAL_ID), 0)
        run(release_command(adapted), 0)
        assurance = json.loads((adapted / "assurance-ledger-v2.json").read_text(encoding="utf-8"))
        manifest = json.loads((adapted / "selected-output-manifest.json").read_text(encoding="utf-8"))
        assert assurance["status"] == "PASS"
        assert assurance["approvedSemanticSplit"]["approvalId"] == APPROVAL_ID
        assert manifest["approvedSemanticSplit"]["approvalId"] == APPROVAL_ID
        assert "approvedSemanticSplitEvidence" in manifest["artifacts"]
        altered = root / "altered-source.xml"
        altered.write_bytes(SOURCE.read_bytes() + b" ")
        run(preflight_command(altered, root / "altered", approvals, "ADAPTED_CANONICAL", APPROVAL_ID), 1)
    print("[SIMULATED] Exact approved split released CII with approval evidence; altered source was BLOCKED.")


if __name__ == "__main__":
    main()
