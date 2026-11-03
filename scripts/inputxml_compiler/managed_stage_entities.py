#!/usr/bin/env python3
"""Exact source entity, path, attribute, and producer-port reconciliation."""
from __future__ import annotations

import math
from typing import Any

from .base import DecisionLedger
from .managed_stage_diagnostics import block
from .managed_stage_hashes import source_entity_id, source_file_id
from .managed_stage_intake import ManagedStageIntake, MAX_SOURCE_PORTS

_COMPONENT_PORTS = (("APOS", "A"), ("POS", "P"), ("LPOS", "L"))
_BRANCH_PORTS = (("HPOS", "H"), ("TPOS", "T"))
_ENTITY_FIELDS = (
    "sourceEntityId", "sourcePath", "sourceType", "name", "sourceRef",
    "sourceBranchEntityId", "attributes", "enrichedAttributes",
)
_PORT_FIELDS = (
    "sourcePortId", "sourceEntityId", "sourcePath", "field", "role",
    "sourceType", "position",
)
_TRACE_PORT_FIELDS = _PORT_FIELDS[:-1]


def verify_source_entities_and_ports(
    intake: ManagedStageIntake,
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, Any]:
    model = result["sourceModel"]
    entities, ports = _expected_rows(intake)
    model_entities = _array(model.get("entities"), "sourceModel.entities", ledger)
    bridge_entities = _array(result.get("sourceEntities"), "sourceEntities", ledger)
    model_ports = _array(model.get("sourcePorts"), "sourceModel.sourcePorts", ledger)
    bridge_ports = _array(result.get("sourcePorts"), "sourcePorts", ledger)
    if len(ports) > MAX_SOURCE_PORTS:
        _port_block(ledger, "Managed-stage source-port limit is exceeded.")
    _unique_entities(model_entities, ledger)
    _verify_entities(entities, model_entities, "source model", ledger)
    _verify_entities(entities, bridge_entities, "bridge entity array", ledger)
    _verify_collections(model, entities, ledger)
    _verify_ports(ports, model_ports, "source model", _PORT_FIELDS, ledger)
    _verify_ports(ports, bridge_ports, "bridge port array", _PORT_FIELDS, ledger)
    _verify_entity_port_union(model_entities, ports, ledger)
    _verify_trace_ports(ports, result["traceLedger"], ledger)
    ledger.add(
        source_entity_id="managed-stage-source-model-closure",
        source_type="MANAGED_STAGE_SOURCE_MODEL_CLOSURE",
        source_fields={
            "sourceEntityCount": len(entities),
            "sourcePortCount": len(ports),
            "branchCount": len(intake.branches),
            "componentCount": len(entities) - len(intake.branches),
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "source paths and IDs were independently derived from strict JSON occurrences",
            "source-model and bridge port positions agree with strict source geometry",
            "trace-ledger port identity manifest agrees without inventing absent position fields",
        ],
    )
    return {
        "entities": tuple(entities),
        "ports": tuple(ports),
        "entityById": {row["sourceEntityId"]: row for row in entities},
        "portById": {row["sourcePortId"]: row for row in ports},
        "sourceModel": model,
    }


def _expected_rows(
    intake: ManagedStageIntake,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    file_id = source_file_id(intake.source_text)
    entities: list[dict[str, Any]] = []
    ports: list[dict[str, Any]] = []
    for branch_index, branch in enumerate(intake.branches):
        branch_path = _branch_path(intake.branch_collection_path, branch_index)
        branch_row = _entity(
            branch,
            branch_path,
            str(branch.get("type") or _attrs(branch).get("TYPE") or "BRANCH").upper(),
            file_id,
            "",
        )
        entities.append(branch_row)
        ports.extend(_ports(branch_row, branch, _BRANCH_PORTS, file_id))
        children = branch.get("children") if isinstance(branch.get("children"), list) else []
        for child_index, child in enumerate(children):
            if not isinstance(child, dict):
                continue
            path = f"{branch_path}.children[{child_index}]"
            source_type = str(child.get("type") or _attrs(child).get("TYPE") or "").upper()
            row = _entity(child, path, source_type, file_id, branch_row["sourceEntityId"])
            row["sourceBranchName"] = branch_row["name"]
            entities.append(row)
            ports.extend(_ports(row, child, _COMPONENT_PORTS, file_id))
    return entities, ports


def _entity(
    source: dict[str, Any],
    path: str,
    source_type: str,
    file_id: str,
    branch_id: str,
) -> dict[str, Any]:
    attributes = _attrs(source)
    return {
        "sourceEntityId": source_entity_id(file_id, path),
        "sourcePath": path,
        "sourceType": source_type.strip(),
        "name": str(source.get("name") or attributes.get("NAME") or "").strip(),
        "sourceRef": str(attributes.get("REF") or "").strip(),
        "sourceBranchEntityId": branch_id,
        "attributes": attributes,
        "enrichedAttributes": _record(source.get("enrichedAttributes")),
    }


def _ports(
    entity: dict[str, Any],
    source: dict[str, Any],
    definitions: tuple[tuple[str, str], ...],
    file_id: str,
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    attributes = _attrs(source)
    for field, role in definitions:
        position = _point(attributes.get(field))
        if position is None:
            continue
        path = f"{entity['sourcePath']}.attributes.{field}"
        result.append({
            "sourcePortId": source_entity_id(file_id, path),
            "sourceEntityId": entity["sourceEntityId"],
            "sourcePath": path,
            "field": field,
            "role": role,
            "sourceType": entity["sourceType"],
            "position": position,
        })
    return result


def _unique_entities(rows: list[dict[str, Any]], ledger: DecisionLedger) -> None:
    ids = [str(row.get("sourceEntityId") or "") for row in rows]
    paths = [str(row.get("sourcePath") or "") for row in rows]
    if not all(ids) or len(ids) != len(set(ids)):
        block(
            ledger,
            "MANAGED_STAGE_SOURCE_ENTITY_DUPLICATE",
            "Managed-stage source entity IDs are empty or duplicated.",
            "sourceModel.entities",
        )
    if not all(paths) or len(paths) != len(set(paths)):
        block(
            ledger,
            "MANAGED_STAGE_SOURCE_ENTITY_DUPLICATE",
            "Managed-stage source paths are empty or duplicated.",
            "sourceModel.entities",
        )


def _verify_entities(
    expected: list[dict[str, Any]],
    actual: list[dict[str, Any]],
    label: str,
    ledger: DecisionLedger,
) -> None:
    if len(actual) != len(expected):
        _entity_block(ledger, f"{label} entity count differs from strict source inventory.")
    for wanted, row in zip(expected, actual):
        for field in _ENTITY_FIELDS:
            value = row.get(field) or "" if field == "sourceBranchEntityId" else row.get(field)
            if field in {"attributes", "enrichedAttributes"}:
                value = _record(row.get(field))
            if value != wanted[field]:
                _entity_block(ledger, f"{label} field {field} differs for {wanted['sourcePath']}.")


def _verify_collections(
    model: dict[str, Any],
    expected: list[dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    branches = [row for row in expected if not row["sourceBranchEntityId"]]
    components = [row for row in expected if row["sourceBranchEntityId"]]
    for field, wanted in (("branches", branches), ("components", components)):
        actual = _array(model.get(field), f"sourceModel.{field}", ledger)
        if [str(row.get("sourceEntityId") or "") for row in actual] != [
            row["sourceEntityId"] for row in wanted
        ]:
            _entity_block(ledger, f"sourceModel.{field} order or coverage differs from source arrays.")


def _verify_ports(
    expected: list[dict[str, Any]],
    actual: list[dict[str, Any]],
    label: str,
    fields: tuple[str, ...],
    ledger: DecisionLedger,
) -> None:
    ids = [str(row.get("sourcePortId") or "") for row in actual]
    path_roles = [(str(row.get("sourcePath") or ""), str(row.get("role") or "")) for row in actual]
    if len(ids) != len(set(ids)) or len(path_roles) != len(set(path_roles)):
        block(
            ledger,
            "MANAGED_STAGE_SOURCE_PORT_DUPLICATE",
            f"{label} ports contain duplicate IDs or path/role pairs.",
            "sourcePorts",
        )
    if len(actual) != len(expected):
        _port_block(ledger, f"{label} port count differs from strict source evidence.")
    for wanted, row in zip(expected, actual):
        for field in fields:
            if row.get(field) != wanted[field]:
                _port_block(ledger, f"{label} port {wanted['sourcePath']} has wrong {field}.")


def _verify_entity_port_union(
    entities: list[dict[str, Any]],
    expected: list[dict[str, Any]],
    ledger: DecisionLedger,
) -> None:
    union = [port for entity in entities for port in entity.get("ports") or []]
    _verify_ports(expected, union, "entity-owned", _PORT_FIELDS, ledger)
    owners = {str(row.get("sourceEntityId") or "") for row in entities}
    if any(str(port.get("sourceEntityId") or "") not in owners for port in union):
        block(
            ledger,
            "MANAGED_STAGE_SOURCE_PORT_ORPHAN",
            "Entity-owned port references a missing owner.",
            "sourceModel.entities",
        )


def _verify_trace_ports(
    expected: list[dict[str, Any]],
    trace: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    manifest = _array(trace.get("sourcePorts"), "traceLedger.sourcePorts", ledger)
    _verify_ports(expected, manifest, "trace-ledger", _TRACE_PORT_FIELDS, ledger)


def _branch_path(collection: str, index: int) -> str:
    return f"$[{index}]" if collection == "$" else f"{collection}[{index}]"


def _attrs(source: dict[str, Any]) -> dict[str, Any]:
    return _record(source.get("attributes"))


def _record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _point(value: Any) -> dict[str, float] | None:
    if not isinstance(value, dict):
        return None
    try:
        point = {axis: float(value[axis]) for axis in ("x", "y", "z")}
    except (KeyError, TypeError, ValueError):
        return None
    return point if all(math.isfinite(item) for item in point.values()) else None


def _array(value: Any, name: str, ledger: DecisionLedger) -> list[dict[str, Any]]:
    if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
        block(
            ledger,
            "MANAGED_STAGE_ARTIFACT_SCHEMA_INVALID",
            f"{name} must be an object array.",
            name,
        )
    return value


def _entity_block(ledger: DecisionLedger, message: str) -> None:
    block(ledger, "MANAGED_STAGE_SOURCE_ENTITY_MISSING", message, "sourceModel.entities")


def _port_block(ledger: DecisionLedger, message: str) -> None:
    block(ledger, "MANAGED_STAGE_SOURCE_PORT_ORPHAN", message, "sourcePorts")


__all__ = ["verify_source_entities_and_ports"]
