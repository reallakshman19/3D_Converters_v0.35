#!/usr/bin/env python3
"""Component projection for strict Root topology profiles."""
from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from lxml import etree as ET

from .base import DecisionLedger
from .extension import _extension_record
from .topology_diagnostics import block, retain_blocker
from .topology_engineering import decimal_value
from .topology_source_model import NodeOccurrence
from .xml import _decimal, _decimal_text

_ROUTE_ONLY = {"PIPE"}
_UNSUPPORTED_WITH_CANDIDATE = {
    "VALV",
    "VALVE",
    "FLAN",
    "FLANGE",
    "REDU",
    "REDUCER",
    "GASK",
    "GASKET",
}
_JUNCTION_TYPES = {"TEE", "OLET", "BRAN"}
_ATTACHMENT_TYPES = {"SUPPORT", "ATTA"}


def apply_component_evidence(
    target: ET._Element,
    node: NodeOccurrence,
    *,
    mapping: dict[str, Any],
    profile_id: str,
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    element_id = str(mapping["canonicalElementId"])
    component_type = node.fields.get("ComponentType", "").strip().upper()
    connection_type = node.fields.get("ConnectionType", "").strip().upper()
    _preserve_node_evidence(
        target,
        node,
        profile_id=profile_id,
        ledger=ledger,
    )
    _reject_unresolved_sif(node, component_type, connection_type, ledger)
    _reject_unresolved_ownership(
        node,
        component_type,
        connection_type,
        ledger,
    )
    rigid_flag = _optional_decimal(node, "Rigid")
    has_rigid = component_type == "RIGID" or (
        rigid_flag is not None and rigid_flag > 0
    )
    has_bend = component_type in {"ELBO", "BEND"} or _positive_field(
        node,
        "BendRadius",
    )
    if has_rigid:
        _attach_rigid(target, node, context, ledger)
    if has_bend:
        _attach_bend(target, node, ledger)
    if component_type in _UNSUPPORTED_WITH_CANDIDATE:
        _retain_unsupported_component(target, node, profile_id, ledger)
    elif component_type not in _ROUTE_ONLY | {"RIGID", "ELBO", "BEND"}:
        _retain_unsupported_component(target, node, profile_id, ledger)
    _ledger_component(element_id, node, component_type, mapping, ledger)


def _reject_unresolved_ownership(
    node: NodeOccurrence,
    component_type: str,
    connection_type: str,
    ledger: DecisionLedger,
) -> None:
    if component_type in _JUNCTION_TYPES or (
        component_type == "BRAN" and connection_type in {"TEE", "OLET"}
    ):
        block(
            ledger,
            "JUNCTION_OWNERSHIP_UNRESOLVED",
            f"{node.path} classifies a junction without explicit run/branch port authority.",
            node.field_paths.get("ComponentType", node.path),
        )
    if component_type in _ATTACHMENT_TYPES:
        block(
            ledger,
            "AUXILIARY_OWNERSHIP_UNRESOLVED",
            f"{node.path} support/attachment classification cannot become route geometry.",
            node.field_paths.get("ComponentType", node.path),
        )


def _ledger_component(
    element_id: str,
    node: NodeOccurrence,
    component_type: str,
    mapping: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    ledger.add(
        source_entity_id=f"{node.path}/component-mapping",
        source_type="TOPOLOGY_COMPONENT_MAPPING",
        source_fields={
            "sourceNodePath": node.path,
            "componentType": component_type,
            "componentRefNo": node.fields.get("ComponentRefNo", ""),
            "ownershipRule": mapping["ownershipRule"],
        },
        canonical_element_ids=[element_id],
        canonical_node_ids=[str(node.node_number)],
        inputxml_element_ids=[element_id],
        cii_section="ELEMENTS",
        projection_cardinality="MERGE_INTO",
        disposition="EMIT_1_TO_1",
        evidence=["component owner is the exact bridge-verified incident edge"],
    )


def _attach_rigid(
    target: ET._Element,
    node: NodeOccurrence,
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    if target.find("RIGID") is not None:
        block(
            ledger,
            "COMPONENT_PROJECTION_UNRESOLVED",
            f"{target.get('ID')} receives multiple rigid owners.",
            node.path,
        )
    raw_weight = node.fields.get("Weight", "").strip()
    if not raw_weight or "rigidWeightScale" not in context:
        block(
            ledger,
            "RIGID_WEIGHT_UNIT_UNRESOLVED",
            f"{node.path} requires explicit Weight and rigidWeightScale authority.",
            node.field_paths.get("Weight", node.path),
        )
    weight = _decimal(raw_weight, node.field_paths.get("Weight", node.path))
    scale = _decimal(context["rigidWeightScale"], "rigidWeightScale")
    if weight <= 0 or scale <= 0:
        block(
            ledger,
            "RIGID_WEIGHT_UNIT_UNRESOLVED",
            f"{node.path} rigid weight and scale must be positive.",
            node.path,
        )
    ET.SubElement(target, "RIGID", WEIGHT=decimal_value(weight * scale))
    ledger.add(
        source_entity_id=f"compiler-context@rigidWeightScale/{node.sequence}",
        source_type="TOPOLOGY_CONTEXT_SCALE",
        source_fields={
            "key": "rigidWeightScale",
            "value": decimal_value(scale),
            "sourceWeight": decimal_value(weight),
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=["explicit caller-supplied rigid-weight unit authority"],
    )


def _attach_bend(
    target: ET._Element,
    node: NodeOccurrence,
    ledger: DecisionLedger,
) -> None:
    if target.find("BEND") is not None:
        block(
            ledger,
            "COMPONENT_PROJECTION_UNRESOLVED",
            f"{target.get('ID')} receives multiple bend owners.",
            node.path,
        )
    radius = node.fields.get("BendRadius", "").strip()
    if not radius or _decimal(
        radius,
        node.field_paths.get("BendRadius", node.path),
    ) <= 0:
        block(
            ledger,
            "COMPONENT_PROJECTION_UNRESOLVED",
            f"{node.path} bend classification requires explicit positive BendRadius.",
            node.field_paths.get("BendRadius", node.path),
        )
    ET.SubElement(
        target,
        "BEND",
        RADIUS=_decimal_text(
            radius,
            node.field_paths.get("BendRadius", node.path),
        ),
    )


def _reject_unresolved_sif(
    node: NodeOccurrence,
    component_type: str,
    connection_type: str,
    ledger: DecisionLedger,
) -> None:
    raw = node.fields.get("SIF", "").strip()
    explicit_sif = bool(raw) and _decimal(
        raw,
        node.field_paths.get("SIF", node.path),
    ) != 0
    junction = component_type in _JUNCTION_TYPES or connection_type in {
        "TEE",
        "OLET",
    }
    if explicit_sif or junction:
        block(
            ledger,
            "SIF_TYPE_UNRESOLVED",
            f"{node.path} has SIF/junction evidence without an authoritative CII SIF type contract.",
            node.field_paths.get("SIF", node.path),
        )


def _retain_unsupported_component(
    target: ET._Element,
    node: NodeOccurrence,
    profile_id: str,
    ledger: DecisionLedger,
) -> None:
    component_type = node.fields.get("ComponentType", "").strip().upper()
    _extension_record(
        target,
        producer=ledger.producer,
        dialect=profile_id,
        name="UnsupportedComponentEvidence",
        source_path=ledger.source_path,
        source_entity_id=node.path,
        source_field="ComponentType",
        value=json.dumps(
            {
                "componentType": component_type,
                "componentRefNo": node.fields.get("ComponentRefNo", ""),
            },
            sort_keys=True,
            separators=(",", ":"),
        ),
        disposition="UNSUPPORTED_BLOCKING",
        criticality="BLOCKING",
        confidence=1.0,
    )
    ledger.add(
        source_entity_id=f"{node.path}/unsupported-component",
        source_type="KNOWN_UNSUPPORTED_COMPONENT",
        source_fields={"componentType": component_type},
        projection_cardinality="1_TO_0",
        disposition="UNSUPPORTED_BLOCKING",
        evidence=["component evidence retained without generic PIPE substitution"],
    )
    retain_blocker(
        ledger,
        "COMPONENT_PROJECTION_UNRESOLVED",
        f"Component type {component_type!r} has no authorized strict canonical projection.",
        node.path,
    )


def _preserve_node_evidence(
    target: ET._Element,
    node: NodeOccurrence,
    *,
    profile_id: str,
    ledger: DecisionLedger,
) -> None:
    names = (
        "Endpoint",
        "ComponentType",
        "ConnectionType",
        "ComponentRefNo",
        "PipingClass",
        "Rating",
        "BoreMm",
        "MaterialName",
        "DTXR_POS",
        "DTXR_PS",
        "ElementLengthMm",
    )
    values = {
        name: node.fields.get(name, "")
        for name in names
        if node.fields.get(name, "")
    }
    if not values:
        return
    _extension_record(
        target,
        producer=ledger.producer,
        dialect=profile_id,
        name="TopologyNodeEvidence",
        source_path=ledger.source_path,
        source_entity_id=node.path,
        source_field="nodeEvidence",
        value=json.dumps(values, sort_keys=True, separators=(",", ":")),
        disposition="PRESERVE_EXTENSION",
        criticality="MEDIUM",
        confidence=1.0,
    )


def _optional_decimal(node: NodeOccurrence, name: str) -> Decimal | None:
    raw = node.fields.get(name, "").strip()
    if not raw:
        return None
    return _decimal(raw, node.field_paths.get(name, node.path))


def _positive_field(node: NodeOccurrence, name: str) -> bool:
    value = _optional_decimal(node, name)
    return value is not None and value > 0


__all__ = ["apply_component_evidence"]
