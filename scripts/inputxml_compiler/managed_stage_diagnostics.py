#!/usr/bin/env python3
"""Registered diagnostic authority for the managed-stage profile."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .base import CompileBlocked, DecisionLedger


@dataclass(frozen=True)
class ManagedStageDiagnosticPolicy:
    code: str
    stage: str
    disposition: str
    candidate_policy: str
    production_effect: str = "BLOCK"
    severity: str = "BLOCKING"


def _policy(
    code: str,
    stage: str,
    *,
    candidate: str = "NO_CANDIDATE",
    disposition: str = "REJECT_INVALID",
) -> ManagedStageDiagnosticPolicy:
    return ManagedStageDiagnosticPolicy(
        code=code,
        stage=stage,
        disposition=disposition,
        candidate_policy=candidate,
    )


_POLICIES = {
    row.code: row
    for row in (
        _policy("MANAGED_STAGE_JSON_INVALID", "MEDIA_INSPECTION_GATE"),
        _policy("MANAGED_STAGE_ROOT_AMBIGUOUS", "PROFILE_INTAKE_GATE"),
        _policy("MANAGED_STAGE_PROFILE_MISMATCH", "PROFILE_INTAKE_GATE"),
        _policy("MANAGED_STAGE_CONTEXT_MISSING", "PROFILE_INTAKE_GATE"),
        _policy("MANAGED_STAGE_BRIDGE_CONTRACT_INVALID", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_PRODUCER_BLOCKED", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_BRIDGE_SOURCE_HASH_MISMATCH", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_SOURCE_IDENTITY_MISMATCH", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_ARTIFACT_SCHEMA_INVALID", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_ARTIFACT_HASH_MISMATCH", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_SOURCE_ENTITY_DUPLICATE", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_SOURCE_ENTITY_MISSING", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_SOURCE_PORT_DUPLICATE", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_SOURCE_PORT_OWNER_AMBIGUOUS", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_SOURCE_PORT_ORPHAN", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_COMPONENT_MAPPING_INCOMPLETE", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_TRACE_RECORD_DUPLICATE", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_TRACE_RECORD_MISSING", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_TRACE_RECORD_EXTRA", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_TRACE_RELATION_MISMATCH", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_TOPOLOGY_RELATION_MISMATCH", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_INPUTXML_RELATION_MISMATCH", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_PARITY_FAILED", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_METRIC_MISMATCH", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_ENGINEERING_RECORD_MISSING", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_ENGINEERING_CONFLICT", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_COUNT_MISMATCH", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_SAFE_NONPROJECTION_UNPROVEN", "PROFILE_RESOLVER_GATE"),
        _policy(
            "MANAGED_STAGE_BEND_PROJECTION_GAP",
            "LEDGER_GATE",
            candidate="RETAIN_CANDIDATE",
            disposition="DEFER_EXPLICITLY",
        ),
        _policy("MANAGED_STAGE_SUPPORT_OWNERSHIP_UNRESOLVED", "PROFILE_RESOLVER_GATE"),
        _policy("MANAGED_STAGE_RIGID_OWNERSHIP_UNRESOLVED", "PROFILE_RESOLVER_GATE"),
        _policy(
            "MANAGED_STAGE_UNSUPPORTED_ENGINEERING",
            "LEDGER_GATE",
            candidate="RETAIN_CANDIDATE",
            disposition="DEFER_EXPLICITLY",
        ),
        _policy(
            "MANAGED_STAGE_SOURCE_ACCOUNTING_INCOMPLETE",
            "SOURCE_ACCOUNTING_GATE",
            candidate="RETAIN_CANDIDATE",
        ),
    )
}


def diagnostic_policy(code: str) -> ManagedStageDiagnosticPolicy:
    try:
        return _POLICIES[code]
    except KeyError as exc:
        raise RuntimeError(f"Unregistered managed-stage diagnostic {code!r}.") from exc


def diagnose(
    ledger: DecisionLedger,
    code: str,
    message: str,
    source_entity_id: str,
    **context: Any,
) -> ManagedStageDiagnosticPolicy:
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
) -> ManagedStageDiagnosticPolicy:
    policy = diagnose(ledger, code, message, source_entity_id, **context)
    if policy.candidate_policy != "RETAIN_CANDIDATE":
        raise RuntimeError(f"Diagnostic {code} cannot retain a candidate.")
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
    "ManagedStageDiagnosticPolicy",
    "block",
    "diagnose",
    "diagnostic_policy",
    "policy_rows",
    "retain_blocker",
]
