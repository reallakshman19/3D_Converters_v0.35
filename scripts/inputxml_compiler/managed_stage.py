#!/usr/bin/env python3
"""Strict managed-stage resolver orchestrating the authoritative producer."""
from __future__ import annotations

from typing import Any

from lxml import etree as ET

from .base import DecisionLedger, SUPPORTED_COMPILER_DIALECTS
from .managed_stage_bridge_io import run_bridge
from .managed_stage_component_closure import (
    attach_verified_trace_elements,
    verify_component_topology_closure,
)
from .managed_stage_engineering import verify_engineering_projection
from .managed_stage_entities import verify_source_entities_and_ports
from .managed_stage_identity import verify_result_identity
from .managed_stage_inputxml import build_managed_stage_candidate
from .managed_stage_intake import ManagedStageIntake
from .managed_stage_parity_closure import verify_parity_and_metrics
from .managed_stage_port_coverage import bind_source_port_element_coverage
from .managed_stage_source_decisions import record_managed_stage_source_decisions
from .managed_stage_topology import verify_topology_and_trace

SUPPORTED_COMPILER_DIALECTS.add("managed-stage-json")


def _compile_managed_stage_source(
    source: bytes,
    *,
    source_name: str,
    ledger: DecisionLedger,
    context: dict[str, Any],
    intake: ManagedStageIntake,
) -> tuple[ET._Element, dict[str, Any]]:
    del source, source_name
    request = intake.bridge_request()
    result = run_bridge(request, context=context, ledger=ledger)
    identity = verify_result_identity(intake, result, ledger)
    source_evidence = verify_source_entities_and_ports(intake, result, ledger)
    topology = verify_topology_and_trace(result, source_evidence, ledger)
    component_mappings = verify_component_topology_closure(
        result["canonicalTopology"],
        topology["collections"],
        source_evidence,
        ledger,
    )
    attach_verified_trace_elements(component_mappings, topology["traceByEntity"], ledger)
    topology["componentMappings"] = component_mappings
    topology["branchCollectionPath"] = intake.branch_collection_path
    engineering = verify_engineering_projection(
        result,
        source_evidence,
        topology,
        ledger,
    )
    metrics = verify_parity_and_metrics(
        result,
        source_evidence,
        topology,
        engineering,
        ledger,
    )
    candidate = build_managed_stage_candidate(
        result,
        intake,
        topology,
        ledger,
    )
    record_managed_stage_source_decisions(
        intake,
        source_evidence,
        topology,
        engineering,
        ledger,
    )
    bind_source_port_element_coverage(topology, ledger)
    evidence = {
        "intake": intake,
        "identity": identity,
        "source": source_evidence,
        "topology": topology,
        "engineering": engineering,
        "metrics": metrics,
        "result": result,
    }
    return candidate, evidence


__all__ = ["_compile_managed_stage_source"]
