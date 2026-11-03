#!/usr/bin/env python3
"""Finalize PR-6 retained-candidate evidence without altering engineering data."""
from __future__ import annotations

from lxml import etree as ET

from .base import DecisionLedger, EXT_NS


def apply_topology_candidate_policy(
    canonical: ET._Element,
    ledger: DecisionLedger,
) -> None:
    """Keep unresolved component evidence blocking at LEDGER_GATE.

    The source resolver has already set ``ledger.blocked``. This function only
    aligns the canonical extension disposition and decision record with the
    registered retained-candidate policy; it does not repair or project the
    unsupported component.
    """
    for record in canonical.findall(f".//{{{EXT_NS}}}Record"):
        if record.get("name") != "UnsupportedComponentEvidence":
            continue
        record.set("disposition", "DEFER_EXPLICITLY")
        record.set("criticality", "HIGH")
    for record in ledger.records:
        if record.get("sourceType") != "KNOWN_UNSUPPORTED_COMPONENT":
            continue
        record["disposition"] = "DEFER_EXPLICITLY"
        evidence = list(record.get("evidence") or [])
        evidence.append(
            "candidate is retained for inspection; production remains blocked"
        )
        record["evidence"] = evidence


__all__ = ["apply_topology_candidate_policy"]
