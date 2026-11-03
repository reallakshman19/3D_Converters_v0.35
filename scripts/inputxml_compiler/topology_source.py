#!/usr/bin/env python3
"""Lossless Root/Branch/Node source parser for PR-6 topology profiles."""
from __future__ import annotations

from lxml import etree as ET

from .base import DecisionLedger
from .topology_diagnostics import block, retain_blocker
from .topology_inventory import build_source_inventory
from .topology_profiles import TopologyProfileContract
from .topology_source_model import (
    BranchOccurrence,
    NodeOccurrence,
    RestraintOccurrence,
    TopologySourceDocument,
)
from .xml import _decimal_text, _integer_text, _local, _namespace, _sha256

_BRANCH_FIELDS = {
    "Branchname",
    "LineNo",
    "LINE_ID",
    "MaterialNumber",
    "InsulationDensity",
    "FluidDensity",
}
_NODE_FIELDS = {
    "NodeNumber",
    "NodeName",
    "Endpoint",
    "Position",
    "ComponentType",
    "ConnectionType",
    "ComponentRefNo",
    "Rigid",
    "Weight",
    "OutsideDiameter",
    "WallThickness",
    "CorrosionAllowance",
    "InsulationThickness",
    "BendRadius",
    "SIF",
    "PipingClass",
    "Rating",
    "BoreMm",
    "MaterialName",
    "MaterialCode",
    "DTXR_POS",
    "DTXR_PS",
    "ElementLengthMm",
}
_RESTRAINT_FIELDS = {
    "Type",
    "Direction",
    "Stiffness",
    "Gap",
    "Friction",
    "DirectionCosineX",
    "DirectionCosineY",
    "DirectionCosineZ",
    "Tag",
    "GUID",
}
_ROOT_METADATA = {
    "Producer",
    "Profile",
    "SourceIdentity",
    "SelectionJsonSourceIds",
}
_STRUCTURAL_CHILDREN = {
    "Node",
    "Pressure",
    "Temperature",
    "Restraint",
    "CustomRestraint",
}


def build_topology_source_document(
    source: bytes,
    root: ET._Element,
    *,
    profile: TopologyProfileContract,
    ledger: DecisionLedger,
) -> TopologySourceDocument:
    inventory = build_source_inventory(root)
    metadata = _metadata(root)
    branches = tuple(
        _parse_branch(branch, index, ledger)
        for index, branch in enumerate(_direct(root, "Branch"), 1)
    )
    _validate_document_node_identities(branches, ledger)
    return TopologySourceDocument(
        profile_id=profile.profile_id,
        adapter_id=profile.adapter_id,
        source_hash_sha256=_sha256(source),
        inventory=inventory,
        metadata=metadata,
        branches=branches,
    )


def _parse_branch(
    branch: ET._Element,
    index: int,
    ledger: DecisionLedger,
) -> BranchOccurrence:
    path = f"/Root[1]/Branch[{index}]"
    fields, field_paths = _field_map(
        branch,
        path,
        _BRANCH_FIELDS,
        ledger,
    )
    branch_name = fields.get("Branchname", "").strip()
    line_identity = _line_identity(fields, field_paths, path, ledger)
    _parse_case_container(
        branch,
        path,
        "Pressure",
        "Pressure",
        fields,
        field_paths,
        ledger,
    )
    _parse_case_container(
        branch,
        path,
        "Temperature",
        "Temperature",
        fields,
        field_paths,
        ledger,
    )
    nodes = tuple(
        _parse_node(node, path, node_index, ledger)
        for node_index, node in enumerate(_direct(branch, "Node"), 1)
    )
    if len(nodes) < 2:
        block(
            ledger,
            "SOURCE_ADJACENCY_UNPROVEN",
            f"{path} requires at least two direct Node occurrences.",
            path,
        )
    ledger.add(
        source_entity_id=path,
        source_type="SOURCE_BRANCH_OCCURRENCE",
        source_fields={
            "branchName": branch_name,
            "lineIdentity": line_identity,
            "nodeCount": len(nodes),
        },
        projection_cardinality="1_TO_MANY",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "branch occurrence identity is its exact source path",
            "Branchname is display/path evidence and is not line identity",
        ],
    )
    return BranchOccurrence(
        path,
        index,
        branch_name,
        line_identity,
        fields,
        field_paths,
        nodes,
    )


def _parse_node(
    node: ET._Element,
    branch_path: str,
    index: int,
    ledger: DecisionLedger,
) -> NodeOccurrence:
    path = f"{branch_path}/Node[{index}]"
    fields, field_paths = _field_map(
        node,
        path,
        _NODE_FIELDS,
        ledger,
    )
    raw_number = fields.get("NodeNumber", "")
    try:
        number = int(
            _integer_text(
                raw_number,
                f"{path}/NodeNumber",
                positive=True,
            )
        )
    except Exception as exc:
        block(
            ledger,
            "NODE_NUMBER_INVALID",
            f"{path} requires an integer-like positive NodeNumber: {exc}",
            field_paths.get("NodeNumber", path),
        )
    position = _position(fields, field_paths, path, ledger)
    component_type = fields.get("ComponentType", "").strip()
    if not component_type:
        block(
            ledger,
            "HIDDEN_DEFAULT_PROHIBITED",
            f"{path} requires explicit ComponentType; PIPE is not inferred.",
            path,
        )
    restraints = tuple(
        _parse_restraint(child, path, occurrence, ledger)
        for occurrence, child in enumerate(
            [
                child
                for child in node
                if _local(child.tag) in {
                    "Restraint",
                    "CustomRestraint",
                }
            ],
            1,
        )
    )
    ledger.add(
        source_entity_id=path,
        source_type="SOURCE_NODE_OCCURRENCE",
        source_fields={
            "nodeNumberLexical": raw_number,
            "nodeNumber": number,
            "position": list(position),
            "componentType": component_type,
        },
        projection_cardinality="1_TO_1",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "node occurrence identity remains separate from logical node identity"
        ],
    )
    return NodeOccurrence(
        path,
        index,
        number,
        raw_number,
        position,
        fields,
        field_paths,
        restraints,
    )


def _position(
    fields: dict[str, str],
    field_paths: dict[str, str],
    path: str,
    ledger: DecisionLedger,
) -> tuple[str, str, str]:
    raw = fields.get("Position", "")
    source_path = field_paths.get("Position", path)
    if not raw:
        block(
            ledger,
            "NODE_POSITION_MISSING",
            f"{path} requires an explicit Position.",
            source_path,
        )
    parts = raw.split()
    if len(parts) != 3:
        block(
            ledger,
            "NODE_POSITION_INVALID",
            f"{path} Position must contain exactly three finite decimals.",
            source_path,
        )
    try:
        return tuple(
            _decimal_text(value, source_path)
            for value in parts
        )
    except Exception as exc:
        block(
            ledger,
            "NODE_POSITION_INVALID",
            f"{path} Position is invalid: {exc}",
            source_path,
        )
    raise RuntimeError("unreachable")


def _parse_restraint(
    element: ET._Element,
    node_path: str,
    occurrence: int,
    ledger: DecisionLedger,
) -> RestraintOccurrence:
    name = _local(element.tag)
    path = f"{node_path}/{name}[{occurrence}]"
    fields, field_paths = _field_map(
        element,
        path,
        _RESTRAINT_FIELDS,
        ledger,
    )
    ledger.add(
        source_entity_id=path,
        source_type=(
            "CUSTOM_RESTRAINT_COMPATIBILITY"
            if name == "CustomRestraint"
            else "SOURCE_RESTRAINT_OCCURRENCE"
        ),
        source_fields={"sourceName": name, "fields": fields},
        projection_cardinality="ATTACH_AUXILIARY",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "source auxiliary retained before type and owner resolution"
        ],
    )
    return RestraintOccurrence(path, name, fields, field_paths)


def _field_map(
    parent: ET._Element,
    parent_path: str,
    allowed: set[str],
    ledger: DecisionLedger,
) -> tuple[dict[str, str], dict[str, str]]:
    fields: dict[str, str] = {}
    paths: dict[str, str] = {}
    counts: dict[str, int] = {}
    for child in parent:
        name = _local(child.tag)
        counts[name] = counts.get(name, 0) + 1
        child_path = f"{parent_path}/{name}[{counts[name]}]"
        if name in _STRUCTURAL_CHILDREN:
            continue
        if name not in allowed:
            _unknown(child_path, name, child, ledger)
            continue
        if counts[name] > 1:
            block(
                ledger,
                "ROOT_STRUCTURE_INVALID",
                f"Duplicate source field {name!r} occurs under {parent_path}.",
                child_path,
            )
        fields[name] = (child.text or "").strip()
        paths[name] = child_path
    return fields, paths


def _parse_case_container(
    branch: ET._Element,
    branch_path: str,
    container_name: str,
    prefix: str,
    fields: dict[str, str],
    paths: dict[str, str],
    ledger: DecisionLedger,
) -> None:
    containers = _direct(branch, container_name)
    if len(containers) > 1:
        block(
            ledger,
            "ROOT_STRUCTURE_INVALID",
            f"{branch_path} contains duplicate {container_name} containers.",
            branch_path,
        )
    if not containers:
        return
    container_path = f"{branch_path}/{container_name}[1]"
    allowed = {f"{prefix}{index}" for index in range(1, 10)}
    if container_name == "Pressure":
        allowed.add("HydroPressure")
    values, value_paths = _field_map(
        containers[0],
        container_path,
        allowed,
        ledger,
    )
    fields.update(values)
    paths.update(value_paths)


def _line_identity(
    fields: dict[str, str],
    paths: dict[str, str],
    branch_path: str,
    ledger: DecisionLedger,
) -> str:
    line_no = fields.get("LineNo", "").strip()
    line_id = fields.get("LINE_ID", "").strip()
    if not line_no and not line_id:
        block(
            ledger,
            "BRANCH_LINE_IDENTITY_MISSING",
            f"{branch_path} requires explicit LineNo or LINE_ID.",
            branch_path,
        )
    if line_no and line_id and line_no != line_id:
        block(
            ledger,
            "BRANCH_IDENTITY_CONFLICT",
            f"{branch_path} LineNo and LINE_ID evidence conflicts.",
            paths.get("LINE_ID") or paths.get("LineNo") or branch_path,
            lineNo=line_no,
            lineId=line_id,
        )
    return line_no or line_id


def _validate_document_node_identities(
    branches: tuple[BranchOccurrence, ...],
    ledger: DecisionLedger,
) -> None:
    node_owners: dict[int, str] = {}
    for branch in branches:
        for node in branch.nodes:
            first = node_owners.get(node.node_number)
            if first is not None:
                block(
                    ledger,
                    "DUPLICATE_NODE_NUMBER",
                    f"NodeNumber {node.node_number} occurs in multiple source occurrences.",
                    node.path,
                    firstOwner=first,
                )
            node_owners[node.node_number] = node.path


def _metadata(root: ET._Element) -> dict[str, str]:
    return {
        _local(child.tag): (child.text or "").strip()
        for child in root
        if _namespace(child.tag) == ""
        and _local(child.tag) in _ROOT_METADATA
    }


def _unknown(
    path: str,
    name: str,
    child: ET._Element,
    ledger: DecisionLedger,
) -> None:
    ledger.add(
        source_entity_id=path,
        source_type="UNKNOWN_ROOT_TOPOLOGY_FIELD",
        source_fields={
            "name": name,
            "xml": ET.tostring(child, encoding="unicode"),
        },
        projection_cardinality="1_TO_0",
        disposition="UNSUPPORTED_BLOCKING",
        evidence=[
            "unknown Root topology evidence is retained in the full source extension"
        ],
    )
    retain_blocker(
        ledger,
        "COMPONENT_PROJECTION_UNRESOLVED",
        f"Unknown source field {name!r} is retained and blocks production.",
        path,
    )


def _direct(parent: ET._Element, name: str) -> list[ET._Element]:
    return [
        child
        for child in parent
        if _namespace(child.tag) == "" and _local(child.tag) == name
    ]


__all__ = [
    "BranchOccurrence",
    "NodeOccurrence",
    "RestraintOccurrence",
    "TopologySourceDocument",
    "build_topology_source_document",
]
