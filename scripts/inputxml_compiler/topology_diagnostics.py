#!/usr/bin/env python3
"""Structured diagnostic authority for PR-6 topology profiles."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .base import CompileBlocked, DecisionLedger


@dataclass(frozen=True)
class TopologyDiagnosticPolicy:
    code: str
    stage: str
    severity: str
    disposition: str
    candidate_policy: str
    production_effect: str


def _policy(
    code: str,
    stage: str,
    *,
    candidate: str = "NO_CANDIDATE",
    disposition: str = "REJECT_INVALID",
) -> TopologyDiagnosticPolicy:
    return TopologyDiagnosticPolicy(
        code=code,
        stage=stage,
        severity="BLOCKING",
        disposition=disposition,
        candidate_policy=candidate,
        production_effect="BLOCK",
    )


_POLICIES = {
    row.code: row
    for row in (
        _policy("ROOT_PROFILE_MISMATCH", "PROFILE_INTAKE_GATE"),
        _policy("SELECTIONJSON_IDENTITY_REQUIRED", "PROFILE_INTAKE_GATE"),
        _policy("ROOT_STRUCTURE_INVALID", "PROFILE_INTAKE_GATE"),
        _policy("BRANCH_IDENTITY_CONFLICT", "PROFILE_RESOLVER_GATE"),
        _policy("BRANCH_LINE_IDENTITY_MISSING", "PROFILE_RESOLVER_GATE"),
        _policy("DUPLICATE_NODE_NUMBER", "PROFILE_RESOLVER_GATE"),
        _policy("LOGICAL_NODE_EVIDENCE_CONFLICT", "PROFILE_RESOLVER_GATE"),
        _policy("NODE_NUMBER_INVALID", "PROFILE_RESOLVER_GATE"),
        _policy("NODE_POSITION_MISSING", "PROFILE_RESOLVER_GATE"),
        _policy("NODE_POSITION_INVALID", "PROFILE_RESOLVER_GATE"),
        _policy("NODE_POSITION_CONFLICT", "PROFILE_RESOLVER_GATE"),
        _policy("SOURCE_ADJACENCY_UNPROVEN", "PROFILE_RESOLVER_GATE"),
        _policy("EDGE_SELF_LOOP", "PROFILE_RESOLVER_GATE"),
        _policy("EDGE_ZERO_LENGTH", "PROFILE_RESOLVER_GATE"),
        _policy("EDGE_DUPLICATE_CONFLICT", "PROFILE_RESOLVER_GATE"),
        _policy("CROSS_BRANCH_CONNECTION_UNPROVEN", "PROFILE_RESOLVER_GATE"),
        _policy("JUNCTION_OWNERSHIP_UNRESOLVED", "PROFILE_RESOLVER_GATE"),
        _policy("COORDINATE_FRAME_UNRESOLVED", "PROFILE_RESOLVER_GATE"),
        _policy("COORDINATE_TRANSFORM_MISMATCH", "PROFILE_RESOLVER_GATE"),
        _policy("PROHIBITED_COORDINATE_COALESCING", "PROFILE_RESOLVER_GATE"),
        _policy("PROHIBITED_FILLER_TOPOLOGY", "PROFILE_RESOLVER_GATE"),
        _policy("SYNTHETIC_NODE_PROHIBITED", "PROFILE_RESOLVER_GATE"),
        _policy("HIDDEN_DEFAULT_PROHIBITED", "PROFILE_RESOLVER_GATE"),
        _policy("BRANCH_STATE_SEED_MISSING", "PROFILE_RESOLVER_GATE"),
        _policy(
            "COMPONENT_PROJECTION_UNRESOLVED",
            "LEDGER_GATE",
            candidate="RETAIN_CANDIDATE",
            disposition="DEFER_EXPLICITLY",
        ),
        _policy("SIF_TYPE_UNRESOLVED", "PROFILE_RESOLVER_GATE"),
        _policy("RIGID_WEIGHT_UNIT_UNRESOLVED", "PROFILE_RESOLVER_GATE"),
        _policy("RESTRAINT_TYPE_UNRESOLVED", "PROFILE_RESOLVER_GATE"),
        _policy("RESTRAINT_CARDINALITY_EXCEEDED", "PROFILE_RESOLVER_GATE"),
        _policy("AUXILIARY_OWNERSHIP_UNRESOLVED", "PROFILE_RESOLVER_GATE"),
        _policy(
            "TOPOLOGY_SOURCE_ACCOUNTING_INCOMPLETE",
            "SOURCE_ACCOUNTING_GATE",
            candidate="RETAIN_CANDIDATE",
        ),
        _policy("BRIDGE_CONTRACT_INVALID", "PROFILE_RESOLVER_GATE"),
        _policy("BRIDGE_SOURCE_HASH_MISMATCH", "PROFILE_RESOLVER_GATE"),
        _policy("BRIDGE_MAPPING_INCOMPLETE", "PROFILE_RESOLVER_GATE"),
    )
}


def diagnostic_policy(code: str) -> TopologyDiagnosticPolicy:
    try:
        return _POLICIES[code]
    except KeyError as exc:
        raise RuntimeError(f"Unregistered topology diagnostic code {code!r}.") from exc


def diagnose(
    ledger: DecisionLedger,
    code: str,
    message: str,
    source_entity_id: str,
    **context: Any,
) -> TopologyDiagnosticPolicy:
    policy = diagnostic_policy(code)
    ledger.diagnostic(
        policy.severity,
        code,
        message,
        source_entity_id,
        diagnosticStage=policy.stage,
        disposition=policy.disposition,
        candidatePolicy=policy.candidate_policy,
        productionEffect=policy.production_effect,
        **context,
    )
    return policy


def block(
    ledger: DecisionLedger,
    code: str,
    message: str,
    source_entity_id: str,
    **context: Any,
) -> None:
    diagnose(ledger, code, message, source_entity_id, **context)
    raise CompileBlocked(message)


def retain_blocker(
    ledger: DecisionLedger,
    code: str,
    message: str,
    source_entity_id: str,
    **context: Any,
) -> TopologyDiagnosticPolicy:
    policy = diagnose(ledger, code, message, source_entity_id, **context)
    if policy.candidate_policy != "RETAIN_CANDIDATE":
        raise RuntimeError(f"Diagnostic {code} does not permit a retained candidate.")
    return policy


def policy_rows() -> list[dict[str, str]]:
    return [
        {
            "code": row.code,
            "stage": row.stage,
            "severity": row.severity,
            "disposition": row.disposition,
            "candidatePolicy": row.candidate_policy,
            "productionEffect": row.production_effect,
        }
        for row in _POLICIES.values()
    ]


__all__ = [
    "TopologyDiagnosticPolicy",
    "block",
    "diagnose",
    "diagnostic_policy",
    "policy_rows",
    "retain_blocker",
]
