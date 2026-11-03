#!/usr/bin/env python3
"""Strict media, root, context, and occurrence intake for managed-stage JSON."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from .base import CompileBlocked, DecisionLedger
from .managed_stage_diagnostics import block
from .managed_stage_hashes import reject_unpaired_surrogates

MAX_SOURCE_BYTES = 8 * 1024 * 1024
MAX_BRANCHES = 5000
MAX_COMPONENTS = 100000
MAX_SOURCE_PORTS = 300000
_PROFILE_ID = "managed-stage-json"
_ADAPTER_ID = "managed-stage-to-canonical"
_COLLECTIONS = ("objects", "hierarchy", "branches")
_REQUIRED_CONTEXT = ("version", "jobName", "north", "sourceRevision")
_OPTIONAL_CONTEXT = ("time", "issueNo", "enrichmentConfig", "nodeExecutable")


@dataclass(frozen=True)
class ManagedStageInventory:
    entries: tuple[dict[str, Any], ...]
    duplicate_identity_count: int

    @property
    def identities(self) -> tuple[str, ...]:
        return tuple(str(row["identity"]) for row in self.entries)


@dataclass(frozen=True)
class ManagedStageIntake:
    source_bytes: bytes
    source_text: str
    parsed: Any
    raw_source_hash_sha256: str
    root_form: str
    root_path: str
    branch_collection_path: str
    branches: tuple[dict[str, Any], ...]
    inventory: ManagedStageInventory
    source_name: str
    source_context: dict[str, Any]

    def bridge_request(self) -> dict[str, Any]:
        return {
            "schema": "InputXmlManagedStageBridgeRequest.v1",
            "profileId": _PROFILE_ID,
            "adapterId": _ADAPTER_ID,
            "sourceHashSha256": self.raw_source_hash_sha256,
            "sourceText": self.source_text,
            "sourceName": self.source_name,
            "sourceContext": self.source_context,
            "sourceIntake": {
                "rootForm": self.root_form,
                "rootPath": self.root_path,
                "branchCollectionPath": self.branch_collection_path,
                "branchCount": len(self.branches),
                "sourceOccurrenceCount": len(self.inventory.entries),
            },
            "producerPolicy": {
                "engineIdentity": "component-topology-artifact-producer",
                "engineVersion": "1.0.0",
                "hashAlgorithm": "fnv1a64-canonical-json-v1",
                "sourceIdentitySchema": "SourceEnvelope.v1",
                "entityIdentitySchema": "UniversalSourceGraph.v1",
            },
            "requestedArtifacts": [
                "ComponentTopologySourceModel.v1",
                "TopologyEngineeringProjection.v1",
                "CanonicalTopology.v1",
                "TopologyTraceLedger.v1",
                "topologyInputXml",
                "ParsedInputXmlTopology.v1",
                "TopologySvgScene.v1",
                "TopologyParityReport.v1",
                "metrics",
            ],
        }


def strict_json_loads(source: bytes) -> tuple[str, Any]:
    if len(source) > MAX_SOURCE_BYTES:
        raise CompileBlocked(f"Managed-stage source exceeds {MAX_SOURCE_BYTES} bytes.")
    try:
        text = source.decode("utf-8", errors="strict")
        decoder = json.JSONDecoder(
            object_pairs_hook=_reject_duplicate_pairs,
            parse_constant=_reject_nonfinite,
        )
        value, end = decoder.raw_decode(text)
        if text[end:].strip():
            raise ValueError("trailing data after the root JSON value")
        reject_unpaired_surrogates(value, path="managed-stage-source")
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise CompileBlocked(f"Managed-stage JSON is invalid: {exc}.") from exc
    return text, value


def managed_stage_root_predicate(value: Any) -> bool:
    try:
        _classify_root(value)
    except ValueError:
        return False
    return True


def validate_managed_stage_intake(
    source: bytes,
    *,
    parsed: Any,
    source_text: str,
    source_name: str,
    context: dict[str, Any],
    explicit_override: bool,
    ledger: DecisionLedger,
) -> ManagedStageIntake:
    del explicit_override
    try:
        reject_unpaired_surrogates(source_name, path="source-name")
        root_form, root_path, collection_path, branches = _classify_root(parsed)
    except ValueError as exc:
        code = (
            "MANAGED_STAGE_ROOT_AMBIGUOUS"
            if "competing" in str(exc)
            else "MANAGED_STAGE_PROFILE_MISMATCH"
        )
        block(ledger, code, str(exc), "$")
    source_context = _validate_context(context, ledger)
    inventory = build_managed_stage_inventory(parsed)
    component_count = sum(
        len(row.get("children") or [])
        for row in branches
        if isinstance(row, dict) and isinstance(row.get("children"), list)
    )
    if len(branches) > MAX_BRANCHES or component_count > MAX_COMPONENTS:
        block(
            ledger,
            "MANAGED_STAGE_PROFILE_MISMATCH",
            "Managed-stage branch/component limits are exceeded.",
            collection_path,
            branchCount=len(branches),
            componentCount=component_count,
        )
    ledger.add(
        source_entity_id="$",
        source_type="MANAGED_STAGE_PROFILE_INTAKE",
        source_fields={
            "profileId": _PROFILE_ID,
            "adapterId": _ADAPTER_ID,
            "rootForm": root_form,
            "rootPath": root_path,
            "branchCollectionPath": collection_path,
            "sourceHashSha256": hashlib.sha256(source).hexdigest(),
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "strict UTF-8 and JSON media accepted before Node execution",
            "unpaired UTF-16 surrogate code units are rejected before profile resolution",
            "managed-stage root predicate was positively established",
        ],
    )
    return ManagedStageIntake(
        source,
        source_text,
        parsed,
        hashlib.sha256(source).hexdigest(),
        root_form,
        root_path,
        collection_path,
        tuple(branches),
        inventory,
        source_name,
        source_context,
    )


def build_managed_stage_inventory(value: Any) -> ManagedStageInventory:
    entries: list[dict[str, Any]] = []

    def visit(current: Any, path: str, parent: str | None) -> None:
        kind = _value_kind(current)
        entries.append({
            "identity": path,
            "parentIdentity": parent,
            "kind": kind,
            "name": _path_name(path),
            "value": current if kind in {"NULL", "BOOLEAN", "NUMBER", "STRING"} else None,
        })
        if isinstance(current, dict):
            for key, child in current.items():
                visit(child, _member_path(path, key), path)
        elif isinstance(current, list):
            for index, child in enumerate(current):
                visit(child, f"{path}[{index}]", path)

    visit(value, "$", None)
    identities = [str(row["identity"]) for row in entries]
    return ManagedStageInventory(
        tuple(entries),
        len(identities) - len(set(identities)),
    )


def _classify_root(value: Any) -> tuple[str, str, str, list[dict[str, Any]]]:
    if isinstance(value, list):
        branches = _branch_array(value, "$")
        return "TOP_LEVEL_ARRAY", "$", "$", branches
    if not isinstance(value, dict):
        raise ValueError("Managed-stage root must be an array or an approved wrapper object.")
    present = [key for key in _COLLECTIONS if key in value]
    if len(present) > 1:
        raise ValueError(f"Managed-stage root contains competing branch collections: {present}.")
    if len(present) != 1:
        raise ValueError("Managed-stage root has no approved branch collection.")
    key = present[0]
    branches = _branch_array(value[key], f"$.{key}")
    form = {
        "objects": "OBJECTS_WRAPPER",
        "hierarchy": "HIERARCHY_WRAPPER",
        "branches": "BRANCHES_WRAPPER",
    }[key]
    return form, "$", f"$.{key}", branches


def _branch_array(value: Any, path: str) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"Managed-stage branch collection {path} must be a non-empty array.")
    if any(not isinstance(row, dict) for row in value):
        raise ValueError(f"Managed-stage branch collection {path} contains a non-object occurrence.")
    return value


def _validate_context(
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, Any]:
    try:
        reject_unpaired_surrogates(context, path="compiler-context")
    except ValueError as exc:
        block(
            ledger,
            "MANAGED_STAGE_CONTEXT_MISSING",
            str(exc),
            "compiler-context",
        )
    allowed = set(_REQUIRED_CONTEXT) | set(_OPTIONAL_CONTEXT)
    extra = sorted(set(context) - allowed)
    if extra:
        block(
            ledger,
            "MANAGED_STAGE_CONTEXT_MISSING",
            f"Undeclared managed-stage context keys are prohibited: {extra}.",
            "compiler-context",
        )
    for key in _REQUIRED_CONTEXT:
        if key not in context or context[key] in (None, "", []):
            block(
                ledger,
                "MANAGED_STAGE_CONTEXT_MISSING",
                f"Managed-stage requires explicit context authority for {key}.",
                f"compiler-context@{key}",
            )
    version = str(context["version"]).strip()
    job_name = str(context["jobName"]).strip()
    if not version or not job_name:
        block(
            ledger,
            "MANAGED_STAGE_CONTEXT_MISSING",
            "Managed-stage version and jobName must be nonblank.",
            "compiler-context",
        )
    revision = context["sourceRevision"]
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
        block(
            ledger,
            "MANAGED_STAGE_CONTEXT_MISSING",
            "sourceRevision must be an explicit positive integer.",
            "compiler-context@sourceRevision",
        )
    north = context["north"]
    if not isinstance(north, (list, tuple)) or len(north) != 3:
        block(
            ledger,
            "MANAGED_STAGE_CONTEXT_MISSING",
            "north must be an explicit three-value vector.",
            "compiler-context@north",
        )
    try:
        vector = [Decimal(str(item)) for item in north]
    except (InvalidOperation, ValueError) as exc:
        block(
            ledger,
            "MANAGED_STAGE_CONTEXT_MISSING",
            f"north contains an invalid decimal: {exc}.",
            "compiler-context@north",
        )
    if not all(item.is_finite() for item in vector):
        block(
            ledger,
            "MANAGED_STAGE_CONTEXT_MISSING",
            "north contains a non-finite value.",
            "compiler-context@north",
        )
    magnitude = sum(item * item for item in vector)
    if not Decimal("0.9") < magnitude < Decimal("1.1"):
        block(
            ledger,
            "MANAGED_STAGE_CONTEXT_MISSING",
            f"north magnitude squared must be approximately one, got {magnitude}.",
            "compiler-context@north",
        )
    result = {
        "version": version,
        "jobName": job_name,
        "north": [str(item) for item in vector],
        "sourceRevision": revision,
    }
    for key in ("time", "issueNo", "enrichmentConfig"):
        if key in context:
            result[key] = context[key]
    return result


def _reject_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def _reject_nonfinite(value: str) -> Any:
    raise ValueError(f"non-finite JSON value {value!r}")


def _value_kind(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "BOOLEAN"
    if isinstance(value, (int, float)):
        return "NUMBER"
    if isinstance(value, str):
        return "STRING"
    if isinstance(value, list):
        return "ARRAY"
    return "OBJECT"


def _member_path(parent: str, key: str) -> str:
    if key.replace("_", "a").isalnum() and not key[:1].isdigit():
        return f"{parent}.{key}"
    return f"{parent}[{json.dumps(key, ensure_ascii=False)}]"


def _path_name(path: str) -> str:
    if "." in path:
        return path.rsplit(".", 1)[-1]
    return path.rsplit("[", 1)[-1].rstrip("]") if "[" in path else "$"


__all__ = [
    "MAX_BRANCHES",
    "MAX_COMPONENTS",
    "MAX_SOURCE_BYTES",
    "MAX_SOURCE_PORTS",
    "ManagedStageIntake",
    "ManagedStageInventory",
    "build_managed_stage_inventory",
    "managed_stage_root_predicate",
    "strict_json_loads",
    "validate_managed_stage_intake",
]
