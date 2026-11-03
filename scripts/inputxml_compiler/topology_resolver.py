#!/usr/bin/env python3
"""Shared strict resolver used after profile-specific Root intake identity."""
from __future__ import annotations

from typing import Any

from lxml import etree as ET

from .base import DecisionLedger
from .topology_bridge import invoke_topology_bridge
from .topology_candidate import build_topology_candidate
from .topology_candidate_policy import apply_topology_candidate_policy
from .topology_diagnostics import policy_rows
from .topology_profiles import get_topology_profile
from .topology_source import build_topology_source_document
from .topology_source_decisions import record_topology_source_decisions


def compile_strict_topology_candidate(
    source: bytes,
    *,
    source_root: ET._Element,
    profile_id: str,
    ledger: DecisionLedger,
    context: dict[str, Any],
) -> ET._Element:
    profile = get_topology_profile(profile_id)
    source_document = build_topology_source_document(
        source,
        source_root,
        profile=profile,
        ledger=ledger,
    )
    request = source_document.bridge_request(context)
    bridge_result = invoke_topology_bridge(
        request,
        context=context,
        ledger=ledger,
    )
    ledger.add(
        source_entity_id="topology-diagnostic-policy",
        source_type="TOPOLOGY_DIAGNOSTIC_POLICY",
        source_fields={
            "schema": "InputXmlTopologyDiagnosticPolicy.v1",
            "records": policy_rows(),
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "blocking behavior is selected by registered code policy, never substring matching"
        ],
    )
    candidate = build_topology_candidate(
        source,
        source_document,
        bridge_result,
        profile=profile,
        context=context,
        ledger=ledger,
    )
    apply_topology_candidate_policy(candidate, ledger)
    record_topology_source_decisions(
        source_document,
        bridge_result,
        ledger,
    )
    return candidate


__all__ = ["compile_strict_topology_candidate"]
