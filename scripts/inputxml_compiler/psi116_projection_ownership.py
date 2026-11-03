#!/usr/bin/env python3
"""Policy-closed occurrence and section ownership for PSI116 projection."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from .base import CompileBlocked


@dataclass(frozen=True)
class OccurrenceProjection:
    occurrence_id: str
    node: Any
    segment: Any | None
    role: str
    sections: tuple[str, ...]
    disposition: str
    reason: str


MANDATORY_SECTIONS = frozenset({"ELEMENTS", "BEND", "RIGID", "RESTRANT"})


def require_selectable_production_result(result: dict[str, Any]) -> None:
    """Require the independently accepted TE-013 selectable state."""
    selected = result.get("productionBundle") if isinstance(result, dict) else None
    selection = result.get("selection") if isinstance(result, dict) else None
    selection_bundle = selection.get("productionBundle") if isinstance(selection, dict) else None
    failures = []
    if not isinstance(selected, dict) or selected.get("selectable") is not True:
        failures.append("productionBundle.selectable")
    if not isinstance(selection_bundle, dict) or selection_bundle.get("selectable") is not True:
        failures.append("selection.productionBundle.selectable")
    if failures:
        raise CompileBlocked(
            "TE-013 production bundle is not selectable: " + ", ".join(failures) + "."
        )


def require_topology_occurrence_coverage(result: dict[str, Any]) -> None:
    """Reject edge-owned source topology that has no TE-013 occurrence disposition."""
    topology = result.get("topologyIndex") if isinstance(result, dict) else None
    if not isinstance(topology, dict):
        raise CompileBlocked("TE-013 topology index is required for PSI116 projection coverage.")
    entities = topology.get("sourceEntities") or []
    occurrences = topology.get("occurrences") or []
    if not isinstance(entities, list) or not isinstance(occurrences, list):
        raise CompileBlocked("TE-013 topology sourceEntities and occurrences must be arrays.")
    occurrence_sources = {
        str(row.get("occurrenceId") or ""): str(row.get("sourceEntityId") or "")
        for row in occurrences if isinstance(row, dict) and row.get("occurrenceId")
    }
    missing: list[dict[str, Any]] = []
    mismatched: list[dict[str, Any]] = []
    for entity in entities:
        if not isinstance(entity, dict):
            raise CompileBlocked("TE-013 topology source entity row is not an object.")
        entity_id = str(entity.get("sourceEntityId") or "")
        edge_ids = [str(value) for value in (entity.get("logicalEdgeIds") or []) if str(value)]
        occurrence_ids = [str(value) for value in (entity.get("occurrenceIds") or []) if str(value)]
        if edge_ids and not occurrence_ids:
            missing.append({"sourceEntityId": entity_id, "logicalEdgeIds": sorted(edge_ids)})
        wrong = sorted(
            occurrence_id for occurrence_id in occurrence_ids
            if occurrence_sources.get(occurrence_id) != entity_id
        )
        if wrong:
            mismatched.append({"sourceEntityId": entity_id, "occurrenceIds": wrong})
    if missing or mismatched:
        raise CompileBlocked(
            "TE-013 topology occurrence coverage is incomplete: "
            f"edgeOwnedWithoutOccurrence={missing}, mismatchedOccurrenceOwnership={mismatched}."
        )


def build_occurrence_projections(intake: Any, segments: tuple[Any, ...], policy: dict[str, Any]) -> tuple[OccurrenceProjection, ...]:
    """Bind each emitted occurrence to explicit canonical/CII sections or omit safely."""
    require_topology_occurrence_coverage(intake.production_result)
    segment_index = {(row.branch_index, row.segment_index): row for row in segments}
    result: list[OccurrenceProjection] = []
    for branch in intake.branches:
        if len(branch.nodes) == 1:
            node = branch.nodes[0]
            if not is_payload_free_topology_endpoint(node, policy):
                _unprojectable(node, "isolated emitted occurrence has independent engineering payload")
            result.append(_omitted(node, "PAYLOAD_FREE_ISOLATED_TOPOLOGY_ENDPOINT"))
            continue
        for index, node in enumerate(branch.nodes):
            if index == 0:
                segment = segment_index[(branch.branch_index, 0)]
                sections = {"ELEMENTS"}
                auxiliary = auxiliary_sections(node, policy)
                if auxiliary:
                    _require_outgoing_owner(node, policy)
                    sections.update(auxiliary)
                elif has_independent_engineering_payload(node, policy):
                    _unprojectable(node, "branch-start payload has no accepted outgoing projection")
                result.append(_projected(node, segment, "OUTGOING_ENDPOINT_OWNER", sections))
                continue
            segment = segment_index[(branch.branch_index, index - 1)]
            sections = {"ELEMENTS", *auxiliary_sections(node, policy)}
            _require_component_representation(node, sections, policy)
            result.append(_projected(node, segment, "INCOMING_ELEMENT_OWNER", sections))
    _validate_segment_claims(result)
    return tuple(result)


def projection_index(rows: tuple[OccurrenceProjection, ...]) -> dict[str, OccurrenceProjection]:
    result = {row.occurrence_id: row for row in rows}
    if len(result) != len(rows):
        raise CompileBlocked("PSI116 occurrence projection identities are duplicated.")
    return result


def auxiliary_sections(node: Any, policy: dict[str, Any]) -> set[str]:
    sections: set[str] = set()
    if owns_bend(node, policy):
        sections.add("BEND")
    if owns_rigid(node, policy):
        sections.add("RIGID")
    if getattr(node, "restraints", ()):
        sections.add("RESTRANT")
    return sections


def owns_bend(node: Any, policy: dict[str, Any]) -> bool:
    bend = policy["componentPolicy"]["bend"]
    return (
        getattr(node, "component_type", "") == bend["componentType"]
        and getattr(node, "endpoint", None) == bend["endpoint"]
    )


def owns_rigid(node: Any, policy: dict[str, Any]) -> bool:
    return getattr(node, "rigid", None) in set(policy["componentPolicy"]["rigidOwnerValues"])


def has_independent_engineering_payload(node: Any, policy: dict[str, Any]) -> bool:
    component = str(getattr(node, "component_type", "") or "").upper()
    independent = set(policy["componentPolicy"]["independentPayloadTypes"])
    return any((
        component in independent,
        owns_bend(node, policy),
        owns_rigid(node, policy),
        bool(getattr(node, "restraints", ())),
        _nonzero(getattr(node, "sif", "0")),
        _nonzero(getattr(node, "weight", "0")),
        _nonzero(getattr(node, "bend_radius", "0")),
    ))


def is_payload_free_topology_endpoint(node: Any, policy: dict[str, Any]) -> bool:
    allowed = set(policy["boundaryNodePolicy"]["payloadFreeComponentTypes"])
    component = str(getattr(node, "component_type", "") or "").upper()
    return component in allowed and not has_independent_engineering_payload(node, policy)


def hydro_pressure_policy(policy: dict[str, Any]) -> dict[str, str]:
    row = (policy.get("fieldPolicy") or {}).get("HYDRO_PRESSURE")
    required = {
        "canonicalValue", "canonicalUnit", "authority", "sourceDisposition",
        "projectionDisposition", "ciiSection",
    }
    if not isinstance(row, dict) or set(row) < required or row.get("fallbackAllowed") is not False:
        raise CompileBlocked("PSI116 HYDRO_PRESSURE requires a complete no-fallback policy authority.")
    if str(row["canonicalValue"]) != "0":
        raise CompileBlocked("PSI116 HYDRO_PRESSURE policy must express explicit absence as zero.")
    return {key: str(value) for key, value in row.items()}


def _require_outgoing_owner(node: Any, policy: dict[str, Any]) -> None:
    rule = policy["occurrenceOwnershipPolicy"]["outgoingOwner"]
    role = str((getattr(node, "trace", {}) or {}).get("projectionRole") or "")
    if getattr(node, "node_index", None) != 0:
        _unprojectable(node, "outgoing engineering ownership is permitted only at branch start")
    if getattr(node, "endpoint", None) != rule["requiredEndpoint"]:
        _unprojectable(node, "branch-start engineering payload has the wrong endpoint")
    if role not in set(rule["allowedProjectionRoles"]):
        _unprojectable(node, "branch-start engineering payload has no approved projection role")
    _require_component_representation(node, {"ELEMENTS", *auxiliary_sections(node, policy)}, policy)


def _require_component_representation(node: Any, sections: set[str], policy: dict[str, Any]) -> None:
    component = str(getattr(node, "component_type", "") or "").upper()
    requirements = policy["componentPolicy"]["requiredProjectionSections"]
    required = set(requirements.get(component) or [])
    if not required.issubset(sections):
        _unprojectable(node, f"component {component} requires sections {sorted(required)}")
    if component == policy["componentPolicy"]["bend"]["componentType"]:
        if not owns_bend(node, policy) or not _positive(getattr(node, "bend_radius", "0")):
            _unprojectable(node, "ELBO requires endpoint-qualified positive-radius BEND projection")
    if component == policy["componentPolicy"]["supportType"] and not getattr(node, "restraints", ()):
        _unprojectable(node, "ATTA requires explicit restraint/support projection")
    if _nonzero(getattr(node, "sif", "0")):
        _unprojectable(node, "non-zero SIF has no accepted PSI116 canonical rule")


def _validate_segment_claims(rows: list[OccurrenceProjection]) -> None:
    grouped: dict[str, list[OccurrenceProjection]] = {}
    for row in rows:
        if row.segment is not None:
            grouped.setdefault(row.segment.element_id, []).append(row)
    for element_id, claims in grouped.items():
        element_owners = [row for row in claims if row.role == "INCOMING_ELEMENT_OWNER"]
        if len(element_owners) != 1:
            raise CompileBlocked(f"Canonical element {element_id} requires exactly one incoming element owner.")
        for section in ("BEND", "RIGID"):
            owners = [row.occurrence_id for row in claims if section in row.sections]
            if len(owners) > 1:
                raise CompileBlocked(
                    f"Canonical element {element_id} has conflicting {section} owners: {owners}."
                )


def _projected(node: Any, segment: Any, role: str, sections: set[str]) -> OccurrenceProjection:
    occurrence_id = str((getattr(node, "trace", {}) or {}).get("occurrenceId") or "")
    if not occurrence_id:
        raise CompileBlocked("PSI116 occurrence projection requires a nonblank occurrenceId.")
    return OccurrenceProjection(
        occurrence_id=occurrence_id,
        node=node,
        segment=segment,
        role=role,
        sections=tuple(sorted(sections & MANDATORY_SECTIONS)),
        disposition="PROJECTED",
        reason="EXPLICIT_ADJACENT_ELEMENT_SECTION_OWNERSHIP",
    )


def _omitted(node: Any, reason: str) -> OccurrenceProjection:
    return OccurrenceProjection(
        occurrence_id=str(node.trace["occurrenceId"]),
        node=node,
        segment=None,
        role="TOPOLOGY_ONLY_ENDPOINT",
        sections=(),
        disposition="INTENTIONALLY_OMITTED_PAYLOAD_FREE_ENDPOINT",
        reason=reason,
    )


def _unprojectable(node: Any, reason: str) -> None:
    occurrence = str((getattr(node, "trace", {}) or {}).get("occurrenceId") or "UNKNOWN")
    component = str(getattr(node, "component_type", "") or "UNKNOWN")
    raise CompileBlocked(
        "PSI116_UNPROJECTABLE_ENGINEERING_CONTENT: "
        f"occurrence={occurrence}, component={component}, reason={reason}."
    )


def _decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise CompileBlocked(f"PSI116 engineering scalar {value!r} is not decimal.") from exc


def _nonzero(value: Any) -> bool:
    return _decimal(value) != 0


def _positive(value: Any) -> bool:
    return _decimal(value) > 0


__all__ = [
    "OccurrenceProjection", "auxiliary_sections", "build_occurrence_projections",
    "has_independent_engineering_payload", "hydro_pressure_policy",
    "is_payload_free_topology_endpoint", "owns_bend", "owns_rigid",
    "projection_index", "require_selectable_production_result",
    "require_topology_occurrence_coverage",
]
