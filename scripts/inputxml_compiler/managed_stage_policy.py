#!/usr/bin/env python3
"""Explicit component and source-port disposition policy for managed-stage."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ManagedStageComponentPolicy:
    category: str
    topology_role: str
    required_ports: tuple[str, ...]
    canonical_representation: str
    engineering_requirement: str
    trace_dispositions: tuple[str, ...]
    inputxml_representation: str
    cii_projection_status: str
    candidate_policy: str
    production_effect: str
    intentionally_unused_ports: tuple[str, ...] = ()


def _row(
    category: str,
    role: str,
    ports: tuple[str, ...],
    canonical: str,
    engineering: str,
    dispositions: tuple[str, ...],
    inputxml: str,
    cii: str,
    candidate: str,
    effect: str,
    unused: tuple[str, ...] = (),
) -> ManagedStageComponentPolicy:
    return ManagedStageComponentPolicy(
        category,
        role,
        ports,
        canonical,
        engineering,
        dispositions,
        inputxml,
        cii,
        candidate,
        effect,
        unused,
    )


_POLICIES = {
    "BRANCH": _row(
        "BRANCH", "SOURCE_CONTAINER_AND_CONNECTION_BOUNDARY", (),
        "EDGE_ANCESTRY_OR_JUNCTION_OR_BOUNDARY", "NONE_DIRECT",
        ("EMIT_ROUTE_EDGE", "EXTERNAL_BOUNDARY", "EMIT_TEE_JUNCTION", "EMIT_OLET_JUNCTION"),
        "NO_FALSE_ONE_TO_ONE_ELEMENT", "TRACE_ONLY", "ACCEPT_WHEN_RECONCILED", "ALLOW",
    ),
    "PIPE": _row(
        "PIPE", "ROUTE_EDGE", ("A", "L"), "ONE_CANONICAL_EDGE",
        "COMPLETE_ROUTE_ENGINEERING", ("EMIT_ROUTE_EDGE",),
        "ONE_PIPINGELEMENT", "SUPPORTED", "ACCEPT_WHEN_RECONCILED", "ALLOW", ("P",),
    ),
    "ELBO/BEND": _row(
        "ELBO/BEND", "BEND_EDGE_SET", ("A", "P", "L"), "TWO_BEND_ARM_EDGES",
        "AUTHORIZED_BEND_CHILD_REQUIRED", ("EMIT_BEND_EDGE_SET",),
        "EDGE_SET_PLUS_BEND_CHILD", "BLOCK_UNTIL_BEND_ENGINEERING", "BLOCKED_WITH_CANDIDATE", "BLOCK",
    ),
    "TEE": _row(
        "TEE", "TEE_JUNCTION", ("A", "P", "L"), "JUNCTION_AND_PARTICIPATING_EDGES",
        "SIF_DISPOSITION_REQUIRED", ("EMIT_TEE_JUNCTION",),
        "TOPOLOGY_ELEMENTS_PLUS_SIF_POLICY", "BLOCK_UNTIL_SIF_AUTHORITY", "BLOCKED_WITH_CANDIDATE", "BLOCK",
    ),
    "OLET": _row(
        "OLET", "OLET_JUNCTION", ("P",), "JUNCTION_AND_HEADER_PARTICIPATION",
        "SIF_DISPOSITION_REQUIRED", ("EMIT_OLET_JUNCTION",),
        "TOPOLOGY_ELEMENTS_PLUS_SIF_POLICY", "BLOCK_UNTIL_SIF_AUTHORITY", "BLOCKED_WITH_CANDIDATE", "BLOCK", ("A", "L"),
    ),
    "VALVE": _row(
        "VALVE", "INLINE_COMPONENT_EDGE", ("A", "L"), "DEDICATED_EDGE_ANCESTRY",
        "COMPONENT_ENGINEERING_UNSUPPORTED", ("EMIT_INLINE_COMPONENT_EDGE",),
        "RETAINED_ROUTE_ELEMENT", "UNSUPPORTED", "BLOCKED_WITH_CANDIDATE", "BLOCK", ("P",),
    ),
    "FLANGE": _row(
        "FLANGE", "INLINE_OR_POINT_FEATURE", ("A", "L"), "DEDICATED_EDGE_OR_POINT_FEATURE",
        "COMPONENT_ENGINEERING_UNSUPPORTED", ("EMIT_INLINE_COMPONENT_EDGE", "EMIT_POINT_FEATURE"),
        "RETAINED_ELEMENT_OR_POINT_EVIDENCE", "UNSUPPORTED", "BLOCKED_WITH_CANDIDATE", "BLOCK", ("P",),
    ),
    "GASK": _row(
        "GASK", "INLINE_COMPONENT_EDGE", ("A", "L"), "DEDICATED_EDGE_ANCESTRY",
        "RIGID_MERGE_POLICY_UNRESOLVED", ("EMIT_INLINE_COMPONENT_EDGE",),
        "RETAINED_ROUTE_ELEMENT", "UNSUPPORTED", "BLOCKED_WITH_CANDIDATE", "BLOCK", ("P",),
    ),
    "INST": _row(
        "INST", "INLINE_OR_POINT_FEATURE_OR_MANAGED_MERGE", ("A", "L"),
        "DEDICATED_EDGE_POINT_OR_EXPLICIT_MANY_TO_ONE", "MERGE_AND_WEIGHT_AUTHORITY_REQUIRED",
        ("EMIT_INLINE_COMPONENT_EDGE", "EMIT_POINT_FEATURE", "EMIT_ROUTE_EDGE"),
        "RETAINED_OR_SHARED_ELEMENT", "UNSUPPORTED_UNLESS_EXPLICIT_MERGE", "BLOCKED_WITH_CANDIDATE", "BLOCK", ("P",),
    ),
    "REDUCER": _row(
        "REDUCER", "INLINE_COMPONENT_EDGE", ("A", "L"), "DEDICATED_EDGE_ANCESTRY",
        "DIAMETER_TRANSITION_UNRESOLVED", ("EMIT_INLINE_COMPONENT_EDGE",),
        "RETAINED_ROUTE_ELEMENT", "UNSUPPORTED", "BLOCKED_WITH_CANDIDATE", "BLOCK", ("P",),
    ),
    "RIGID": _row(
        "RIGID", "RIGID_CHILD", ("P",), "CANONICAL_RIGID_ON_EXACT_EDGE",
        "EXPLICIT_WEIGHT_AND_OWNER", ("EMIT_INLINE_COMPONENT_EDGE", "EMIT_POINT_FEATURE"),
        "RIGID_CHILD", "SUPPORTED_WHEN_EXACT", "ACCEPT_WHEN_RECONCILED", "ALLOW", ("A", "L"),
    ),
    "SUPPORT": _row(
        "SUPPORT", "SUPPORT_ATTACHMENT_OR_SAFE_NONPROJECTION", ("P",),
        "CANONICAL_SUPPORT_OR_NONE_WITH_AUTHORITY", "SUPPORT_POLICY_AND_RESTRAINTS",
        ("EMIT_SUPPORT_ATTACHMENT", "DEFER_SUPPORT"), "RESTRAINT_CHILD_OR_NONE",
        "SUPPORTED_OR_INTENTIONALLY_NONPROJECTED", "POLICY_DEPENDENT", "POLICY_DEPENDENT", ("A", "L"),
    ),
    "UNKNOWN": _row(
        "UNKNOWN", "UNKNOWN_ENGINEERING", (), "RETAIN_ONLY",
        "UNRESOLVED", ("BLOCK_AMBIGUOUS",), "NONE", "UNSUPPORTED",
        "BLOCKED_WITH_CANDIDATE", "BLOCK",
    ),
}

_ALIASES = {
    "BRANCH": "BRANCH", "PIPE": "PIPE",
    "ELBO": "ELBO/BEND", "BEND": "ELBO/BEND",
    "TEE": "TEE", "OLET": "OLET",
    "VALV": "VALVE", "VALVE": "VALVE",
    "FLAN": "FLANGE", "FLANGE": "FLANGE",
    "GASK": "GASK", "GASKET": "GASK",
    "INST": "INST", "REDU": "REDUCER", "REDUCER": "REDUCER",
    "RIGID": "RIGID", "FBLI": "RIGID",
    "SUPPORT": "SUPPORT", "ATTA": "SUPPORT",
}


def component_policy(source_type: str) -> ManagedStageComponentPolicy:
    return _POLICIES[_ALIASES.get(str(source_type or "").strip().upper(), "UNKNOWN")]


def policy_rows() -> list[dict[str, object]]:
    return [
        {
            "category": row.category,
            "topologyRole": row.topology_role,
            "requiredSourcePorts": list(row.required_ports),
            "canonicalTopologyRepresentation": row.canonical_representation,
            "engineeringProjectionRequirement": row.engineering_requirement,
            "traceDispositions": list(row.trace_dispositions),
            "inputXmlRepresentation": row.inputxml_representation,
            "ciiProjectionStatus": row.cii_projection_status,
            "candidatePolicy": row.candidate_policy,
            "productionEffect": row.production_effect,
            "intentionallyUnusedPorts": list(row.intentionally_unused_ports),
        }
        for row in _POLICIES.values()
    ]


__all__ = ["ManagedStageComponentPolicy", "component_policy", "policy_rows"]
