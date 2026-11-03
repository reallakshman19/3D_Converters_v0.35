#!/usr/bin/env python3
"""[SIMULATED] Exact-output semantic-split approval checks."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.inputxml_approved_semantic_split import (
    ApprovedSemanticSplitError,
    build_approval_candidate,
    build_unapproved_candidate,
    validate_approval,
)

SOURCE = ROOT / "contracts/inputxml/v1/golden/negative/restraint-overflow.xml"
APPROVED = ROOT / "contracts/inputxml/v1/golden/positive/minimal.canonical.input.xml"
XSD = ROOT / "contracts/inputxml/v1/inputxml-canonical-v1.xsd"
TOPOLOGY = b'{"schema":"CanonicalTopology.v2"}\n'


def main() -> None:
    """Build, validate, and tamper-check one simulated approval."""
    source_bytes = SOURCE.read_bytes()
    canonical_bytes = APPROVED.read_bytes()
    candidate = build_approval_candidate(
        source_bytes, canonical_bytes, TOPOLOGY, APPROVED.name, "approved-topology.json",
        "IAS-SIMULATED-OVERFLOW", ["engineering-reviewer"],
        "2026-07-23T00:00:00Z", "Reviewed simulated replacement.", XSD,
    )
    validate_approval(candidate, source_bytes, canonical_bytes, TOPOLOGY)
    unapproved = build_unapproved_candidate(
        source_bytes, canonical_bytes, TOPOLOGY, APPROVED.name, "approved-topology.json",
        "IAS-SIMULATED-UNAPPROVED", "Awaiting engineering review.", XSD,
    )
    try:
        validate_approval(unapproved, source_bytes, canonical_bytes, TOPOLOGY)
    except ApprovedSemanticSplitError:
        pass
    else:
        raise AssertionError("An unapproved candidate must not be runtime-selectable.")
    try:
        validate_approval(candidate, source_bytes + b" ", canonical_bytes, TOPOLOGY)
    except ApprovedSemanticSplitError as exc:
        assert "sourceHashSha256" in str(exc)
    else:
        raise AssertionError("A modified source must invalidate the approval.")
    print("[SIMULATED] approved semantic split exact-hash checks passed.")


if __name__ == "__main__":
    main()
