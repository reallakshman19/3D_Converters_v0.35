#!/usr/bin/env python3
"""Pure profile-resolution primitives for InputXML-family adapters."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from .base import CompileBlocked, DecisionLedger
from .family_profiles import FamilyProfileContract
from .xml import _decimal, _decimal_text, _safe_ncname


@dataclass
class LineScopeState:
    sequence: int = 0
    scope_id: str = ""
    line_identity: str = ""
    seed_element_id: str = ""
    last_element_id: str = ""
    last_from_node: str = ""
    last_to_node: str = ""
    previous_scope_id: str = ""
    previous_line_identity: str = ""
    previous_to_node: str = ""
    transition_reason: str = "INITIAL"
    inherited_values: dict[str, str] = field(default_factory=dict)
    seed_fields: dict[str, str] = field(default_factory=dict)

    def enter(
        self,
        line_identity: str,
        element_id: str,
        from_node: str,
        to_node: str,
    ) -> bool:
        same_line = bool(self.scope_id and self.line_identity == line_identity)
        connected = bool(same_line and self.last_to_node == from_node)
        if connected:
            self.transition_reason = "CONTIGUOUS_NODE_CHAIN"
            self.last_element_id = element_id
            self.last_from_node = from_node
            self.last_to_node = to_node
            return False
        self.previous_scope_id = self.scope_id
        self.previous_line_identity = self.line_identity
        self.previous_to_node = self.last_to_node
        self.sequence += 1
        self.scope_id = f"LINE-SCOPE-{self.sequence:06d}"
        self.line_identity = line_identity
        self.seed_element_id = element_id
        self.last_element_id = element_id
        self.last_from_node = from_node
        self.last_to_node = to_node
        self.transition_reason = (
            "LINE_IDENTITY_CHANGED"
            if self.previous_scope_id and self.previous_line_identity != line_identity
            else (
                "NODE_CONTINUITY_NOT_PROVEN"
                if self.previous_scope_id
                else "INITIAL_SCOPE"
            )
        )
        self.inherited_values = {}
        self.seed_fields = {}
        return True

    def define(self, field_name: str, value: str, element_id: str) -> None:
        self.inherited_values[field_name] = value
        if element_id == self.seed_element_id:
            self.seed_fields[field_name] = value

    def inherit(self, field_name: str) -> str | None:
        return self.inherited_values.get(field_name)


@dataclass
class IdentityRegistry:
    source_ids: set[str] = field(default_factory=set)
    canonical_ids: dict[str, str] = field(default_factory=dict)

    def resolve(
        self,
        *,
        source_id: str | None,
        fallback_id: str,
        ledger: DecisionLedger,
        source_entity_id: str,
    ) -> str:
        lexical = str(source_id or "").strip()
        if lexical:
            if lexical in self.source_ids:
                _block(
                    ledger,
                    "IDENTITY_COLLISION",
                    f"Duplicate source PIPINGELEMENT ID {lexical!r}.",
                    source_entity_id,
                )
            self.source_ids.add(lexical)
        candidate = _safe_ncname(lexical or fallback_id, "E")
        owner = self.canonical_ids.get(candidate)
        if owner is not None:
            _block(
                ledger,
                "IDENTITY_COLLISION",
                f"Canonical ID {candidate!r} collides between {owner!r} and {source_entity_id!r}.",
                source_entity_id,
            )
        self.canonical_ids[candidate] = source_entity_id
        if lexical and lexical != candidate:
            ledger.add(
                source_entity_id=f"{source_entity_id}@ID",
                source_type="IDENTITY_SANITIZATION",
                source_fields={"sourceId": lexical, "canonicalId": candidate},
                canonical_element_ids=[candidate],
                inputxml_element_ids=[candidate],
                disposition="PRESERVE_EXTENSION",
                evidence=["source ID sanitized only to satisfy canonical xs:ID/NCName"],
            )
        elif not lexical:
            ledger.add(
                source_entity_id=f"{source_entity_id}@ID",
                source_type="GENERATED_IDENTITY",
                source_fields={"canonicalId": candidate, "basis": fallback_id},
                canonical_element_ids=[candidate],
                inputxml_element_ids=[candidate],
                disposition="EMIT_1_TO_1",
                evidence=["deterministic profile-declared source ordinal identity"],
            )
        return candidate


def resolve_document_context(
    *,
    profile: FamilyProfileContract,
    source_version: str | None,
    source_job_name: str | None,
    source_time: str | None,
    source_issue_no: str | None,
    source_north: tuple[str | None, str | None, str | None],
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, Any]:
    values: dict[str, Any] = {}
    values["version"] = _resolve_text(
        "version", source_version, context, profile, ledger, required=True
    )
    values["jobName"] = _resolve_text(
        "jobName", source_job_name, context, profile, ledger, required=True
    )
    values["time"] = _resolve_text(
        "time", source_time, context, profile, ledger, required=False
    )
    values["issueNo"] = _resolve_issue(
        source_issue_no, context, profile, ledger
    )
    values["north"] = _resolve_north(source_north, context, profile, ledger)
    return values


def reconcile_coordinate_delta(
    *,
    element_id: str,
    deltas: dict[str, str],
    coordinates: dict[str, str],
    ledger: DecisionLedger,
) -> None:
    if not coordinates:
        return
    actual = {
        "DELTA_X": _decimal(coordinates["TO_X"], "TO_X")
        - _decimal(coordinates["FROM_X"], "FROM_X"),
        "DELTA_Y": _decimal(coordinates["TO_Y"], "TO_Y")
        - _decimal(coordinates["FROM_Y"], "FROM_Y"),
        "DELTA_Z": _decimal(coordinates["TO_Z"], "TO_Z")
        - _decimal(coordinates["FROM_Z"], "FROM_Z"),
    }
    mismatches = {
        field: {
            "declared": deltas[field],
            "coordinateDifference": _decimal_text(value, field),
        }
        for field, value in actual.items()
        if value != _decimal(deltas[field], field)
    }
    if mismatches:
        ledger.add(
            source_entity_id=element_id,
            source_type="COORDINATE_DELTA_RECONCILIATION",
            source_fields={"mismatches": mismatches, "coordinates": coordinates},
            disposition="REJECT_INVALID",
            diagnostics=["coordinate and delta evidence disagree"],
        )
        _block(
            ledger,
            "COORDINATE_DELTA_MISMATCH",
            f"{element_id} coordinate differences do not equal declared deltas.",
            element_id,
        )
    ledger.add(
        source_entity_id=f"{element_id}/coordinate-delta",
        source_type="COORDINATE_DELTA_RECONCILIATION",
        source_fields={"deltas": deltas, "coordinates": coordinates},
        disposition="EMIT_1_TO_1",
        evidence=["exact decimal coordinate differences equal declared deltas"],
    )


def ledger_context_value(
    *,
    key: str,
    value: Any,
    ledger: DecisionLedger,
    canonical_target: str,
) -> None:
    ledger.add(
        source_entity_id=f"compiler-context@{key}",
        source_type="CONTEXT_FIELD",
        source_fields={key: value, "sourceAbsent": True},
        disposition="EMIT_1_TO_1",
        evidence=[f"profile contract permits context authority for {canonical_target}"],
    )


def _resolve_text(
    key: str,
    source_value: str | None,
    context: dict[str, Any],
    profile: FamilyProfileContract,
    ledger: DecisionLedger,
    *,
    required: bool,
) -> str | None:
    source = str(source_value or "").strip()
    if source:
        return source
    if key in profile.permitted_context and key in context:
        value = str(context[key]).strip()
        if value:
            ledger_context_value(
                key=key,
                value=value,
                ledger=ledger,
                canonical_target=key,
            )
            return value
    if required:
        _block(
            ledger,
            "CONTEXT_AUTHORITY_MISSING",
            f"{profile.profile_id} requires explicit {key} authority.",
            "document",
        )
    return None


def _resolve_issue(
    source_value: str | None,
    context: dict[str, Any],
    profile: FamilyProfileContract,
    ledger: DecisionLedger,
) -> str | None:
    if source_value is not None:
        return str(source_value)
    if "issueNo" in profile.permitted_context and "issueNo" in context:
        value = str(context["issueNo"])
        ledger_context_value(
            key="issueNo",
            value=value,
            ledger=ledger,
            canonical_target="PIPINGMODEL@ISSUE_NO",
        )
        return value
    return None


def _resolve_north(
    source_values: tuple[str | None, str | None, str | None],
    context: dict[str, Any],
    profile: FamilyProfileContract,
    ledger: DecisionLedger,
) -> tuple[str, str, str]:
    if all(value is not None for value in source_values):
        result = tuple(
            _decimal_text(value, f"PIPINGMODEL@NORTH_{axis}")
            for axis, value in zip("XYZ", source_values)
        )
    elif "north" in profile.permitted_context and "north" in context:
        result = tuple(
            _decimal_text(value, f"context north[{index}]")
            for index, value in enumerate(context["north"])
        )
        ledger_context_value(
            key="north",
            value=list(result),
            ledger=ledger,
            canonical_target="PIPINGMODEL@NORTH_X/Y/Z",
        )
    else:
        _block(
            ledger,
            "CONTEXT_AUTHORITY_MISSING",
            f"{profile.profile_id} requires a complete source or permitted context north vector.",
            "PIPINGMODEL",
        )
    magnitude = sum(Decimal(value) ** 2 for value in result)
    if not Decimal("0.9") < magnitude < Decimal("1.1"):
        _block(
            ledger,
            "CONTEXT_AUTHORITY_MISSING",
            f"NORTH vector magnitude squared must be approximately 1, got {magnitude}.",
            "PIPINGMODEL",
        )
    return result


def _block(
    ledger: DecisionLedger,
    code: str,
    message: str,
    source_entity_id: str,
) -> None:
    ledger.diagnostic("BLOCKING", code, message, source_entity_id)
    raise CompileBlocked(message)


__all__ = [
    "IdentityRegistry",
    "LineScopeState",
    "ledger_context_value",
    "reconcile_coordinate_delta",
    "resolve_document_context",
]
