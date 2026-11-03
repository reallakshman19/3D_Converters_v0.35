#!/usr/bin/env python3
"""Explicit intake contracts for PR-6 Root topology profiles."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from lxml import etree as ET

from .base import CompileBlocked, DecisionLedger
from .topology_diagnostics import block
from .xml import _local, _namespace

_MAX_BRANCHES = 2000
_MAX_NODES = 100000
_MAX_AUXILIARIES = 100000
_ROOT_METADATA = {
    "Producer",
    "Profile",
    "SourceIdentity",
    "SelectionJsonSourceIds",
}
_ROOT_CHILDREN = {"Branch", *_ROOT_METADATA}
_AUXILIARY_NAMES = {"Restraint", "CustomRestraint"}
_SELECTIONJSON_PRODUCERS = ("selectionjson-transfer-v1",)


@dataclass(frozen=True)
class TopologyProfileContract:
    profile_id: str
    adapter_id: str
    extension_name: str
    document_source_type: str
    explicit_selection_required: bool
    required_context: tuple[str, ...]
    optional_context: tuple[str, ...]
    allowed_producers: tuple[str, ...] = ()


TOPOLOGY_PROFILE_CONTRACTS = {
    "xml-builder-root-branch-node": TopologyProfileContract(
        profile_id="xml-builder-root-branch-node",
        adapter_id="xml-cii-node-to-canonical",
        extension_name="XmlBuilderSourceDocument",
        document_source_type="XML_BUILDER_ROOT_DOCUMENT",
        explicit_selection_required=False,
        required_context=("version", "jobName", "north"),
        optional_context=(
            "time",
            "issueNo",
            "rigidWeightScale",
            "fluidDensityScale",
        ),
    ),
    "seljson-custom-root": TopologyProfileContract(
        profile_id="seljson-custom-root",
        adapter_id="seljson-custom-model-to-canonical",
        extension_name="SelectionJsonSourceDocument",
        document_source_type="SELECTIONJSON_CUSTOM_ROOT_DOCUMENT",
        explicit_selection_required=True,
        required_context=("version", "jobName", "north"),
        optional_context=(
            "time",
            "issueNo",
            "rigidWeightScale",
            "fluidDensityScale",
        ),
        allowed_producers=_SELECTIONJSON_PRODUCERS,
    ),
}


def get_topology_profile(profile_id: str) -> TopologyProfileContract:
    try:
        return TOPOLOGY_PROFILE_CONTRACTS[profile_id]
    except KeyError as exc:
        raise CompileBlocked(
            f"Unknown Root topology profile {profile_id!r}."
        ) from exc


def validate_topology_profile_intake(
    *,
    profile_id: str,
    root: ET._Element | None,
    context: dict[str, Any],
    explicit_override: bool,
    ledger: DecisionLedger,
) -> None:
    profile = get_topology_profile(profile_id)
    if root is None or _namespace(root.tag) != "" or _local(root.tag) != "Root":
        block(
            ledger,
            "ROOT_PROFILE_MISMATCH",
            f"{profile_id} requires one unqualified Root document.",
            "/Root[1]",
        )
    if profile.explicit_selection_required and not explicit_override:
        block(
            ledger,
            "SELECTIONJSON_IDENTITY_REQUIRED",
            "SelectionJSON custom Root requires explicit registered profile selection.",
            "/Root[1]",
        )
    _validate_context(profile, context, ledger)
    _validate_root_shape(root, ledger)
    metadata = _validate_profile_metadata(root, profile, ledger)
    ledger.add(
        source_entity_id="/Root[1]",
        source_type="TOPOLOGY_PROFILE_INTAKE",
        source_fields={
            "profileId": profile.profile_id,
            "adapterId": profile.adapter_id,
            "explicitOverride": explicit_override,
            "producer": metadata.get("Producer", ""),
            "producerPolicy": list(profile.allowed_producers),
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "profile predicate and producer metadata were validated before topology resolution"
        ],
    )


def _validate_context(
    profile: TopologyProfileContract,
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    allowed = set(profile.required_context) | set(profile.optional_context) | {
        "nodeExecutable"
    }
    undeclared = sorted(key for key in context if key not in allowed)
    if undeclared:
        block(
            ledger,
            "HIDDEN_DEFAULT_PROHIBITED",
            f"Undeclared Root topology context keys are prohibited: {undeclared}.",
            "compiler-context",
        )
    for key in profile.required_context:
        if key not in context or context[key] in (None, "", []):
            block(
                ledger,
                "HIDDEN_DEFAULT_PROHIBITED",
                f"{profile.profile_id} requires explicit context authority for {key}.",
                f"compiler-context@{key}",
            )
    if not str(context.get("version") or "").strip() or not str(
        context.get("jobName") or ""
    ).strip():
        block(
            ledger,
            "HIDDEN_DEFAULT_PROHIBITED",
            "Version and jobName must be nonblank lexical values.",
            "compiler-context",
        )
    north = context.get("north")
    if not isinstance(north, (list, tuple)) or len(north) != 3:
        block(
            ledger,
            "COORDINATE_FRAME_UNRESOLVED",
            "north must be an explicit three-value vector.",
            "compiler-context@north",
        )
    try:
        values = [Decimal(str(value)) for value in north]
    except (InvalidOperation, ValueError):
        block(
            ledger,
            "COORDINATE_FRAME_UNRESOLVED",
            "north contains a non-decimal value.",
            "compiler-context@north",
        )
    if not all(value.is_finite() for value in values):
        block(
            ledger,
            "COORDINATE_FRAME_UNRESOLVED",
            "north contains a non-finite value.",
            "compiler-context@north",
        )
    magnitude = sum(value * value for value in values)
    if not Decimal("0.9") < magnitude < Decimal("1.1"):
        block(
            ledger,
            "COORDINATE_FRAME_UNRESOLVED",
            f"north vector magnitude squared must be approximately one, got {magnitude}.",
            "compiler-context@north",
        )
    for key in ("rigidWeightScale", "fluidDensityScale"):
        if key not in context:
            continue
        try:
            value = Decimal(str(context[key]))
        except InvalidOperation:
            block(
                ledger,
                "HIDDEN_DEFAULT_PROHIBITED",
                f"{key} must be a finite positive decimal.",
                f"compiler-context@{key}",
            )
        if not value.is_finite() or value <= 0:
            block(
                ledger,
                "HIDDEN_DEFAULT_PROHIBITED",
                f"{key} must be a finite positive decimal.",
                f"compiler-context@{key}",
            )


def _validate_root_shape(root: ET._Element, ledger: DecisionLedger) -> None:
    if root.attrib:
        block(
            ledger,
            "ROOT_STRUCTURE_INVALID",
            "Root attributes are not declared by the strict topology profile.",
            "/Root[1]",
            attributes=sorted(root.attrib),
        )
    counts: dict[str, int] = {}
    branches: list[ET._Element] = []
    for child in root:
        name = _local(child.tag)
        counts[name] = counts.get(name, 0) + 1
        if _namespace(child.tag) != "" or name not in _ROOT_CHILDREN:
            block(
                ledger,
                "ROOT_STRUCTURE_INVALID",
                f"Undeclared direct Root child {name!r} is prohibited.",
                f"/Root[1]/{name}[{counts[name]}]",
            )
        if name in _ROOT_METADATA and counts[name] > 1:
            block(
                ledger,
                "ROOT_STRUCTURE_INVALID",
                f"Duplicate Root metadata field {name!r} is prohibited.",
                f"/Root[1]/{name}[{counts[name]}]",
            )
        if name == "Branch":
            branches.append(child)
    if not branches or len(branches) > _MAX_BRANCHES:
        block(
            ledger,
            "ROOT_STRUCTURE_INVALID",
            f"Root branch count must be 1..{_MAX_BRANCHES}.",
            "/Root[1]",
        )
    node_count = 0
    auxiliary_count = 0
    for branch_index, branch in enumerate(branches, 1):
        branch_path = f"/Root[1]/Branch[{branch_index}]"
        if branch.attrib:
            block(
                ledger,
                "ROOT_STRUCTURE_INVALID",
                "Branch attributes are not declared by the strict topology profile.",
                branch_path,
                attributes=sorted(branch.attrib),
            )
        nodes = [
            child
            for child in branch
            if _namespace(child.tag) == "" and _local(child.tag) == "Node"
        ]
        if not nodes:
            block(
                ledger,
                "ROOT_STRUCTURE_INVALID",
                "Branch contains no direct Node occurrences.",
                branch_path,
            )
        node_count += len(nodes)
        for descendant in branch.iterdescendants():
            name = _local(descendant.tag)
            if _namespace(descendant.tag) != "":
                block(
                    ledger,
                    "ROOT_STRUCTURE_INVALID",
                    "Namespace-qualified topology evidence is prohibited.",
                    branch_path,
                )
            if name == "Branch":
                block(
                    ledger,
                    "ROOT_STRUCTURE_INVALID",
                    "Branch occurrences must be direct children of Root.",
                    branch_path,
                )
            if name == "Node" and descendant.getparent() is not branch:
                block(
                    ledger,
                    "ROOT_STRUCTURE_INVALID",
                    "Node occurrences must be direct children of their Branch.",
                    branch_path,
                )
            if name in _AUXILIARY_NAMES:
                auxiliary_count += 1
        for node_index, node in enumerate(nodes, 1):
            if node.attrib:
                block(
                    ledger,
                    "ROOT_STRUCTURE_INVALID",
                    "Node attributes are not declared by the strict topology profile.",
                    f"{branch_path}/Node[{node_index}]",
                    attributes=sorted(node.attrib),
                )
    if node_count > _MAX_NODES or auxiliary_count > _MAX_AUXILIARIES:
        block(
            ledger,
            "ROOT_STRUCTURE_INVALID",
            "Root topology occurrence limits are exceeded.",
            "/Root[1]",
            nodeCount=node_count,
            auxiliaryCount=auxiliary_count,
        )


def _validate_profile_metadata(
    root: ET._Element,
    profile: TopologyProfileContract,
    ledger: DecisionLedger,
) -> dict[str, str]:
    values = {
        _local(child.tag): (child.text or "").strip()
        for child in root
        if _local(child.tag) in _ROOT_METADATA
    }
    profile_value = values.get("Profile", "")
    if profile_value and profile_value != profile.profile_id:
        block(
            ledger,
            "ROOT_PROFILE_MISMATCH",
            f"Root Profile={profile_value!r} contradicts selected {profile.profile_id!r}.",
            "/Root[1]/Profile[1]",
        )
    producer = values.get("Producer", "")
    if profile.allowed_producers and producer not in (
        "",
        *profile.allowed_producers,
    ):
        block(
            ledger,
            "ROOT_PROFILE_MISMATCH",
            f"Root Producer={producer!r} is not registered for {profile.profile_id!r}.",
            "/Root[1]/Producer[1]",
            allowedProducers=list(profile.allowed_producers),
        )
    selectionjson_evidence = bool(values.get("SelectionJsonSourceIds")) or (
        producer in _SELECTIONJSON_PRODUCERS
    )
    if profile.profile_id == "xml-builder-root-branch-node" and selectionjson_evidence:
        block(
            ledger,
            "ROOT_PROFILE_MISMATCH",
            "SelectionJSON producer metadata contradicts XML Builder profile selection.",
            (
                "/Root[1]/Producer[1]"
                if producer in _SELECTIONJSON_PRODUCERS
                else "/Root[1]/SelectionJsonSourceIds[1]"
            ),
        )
    return values


__all__ = [
    "TOPOLOGY_PROFILE_CONTRACTS",
    "TopologyProfileContract",
    "get_topology_profile",
    "validate_topology_profile_intake",
]
