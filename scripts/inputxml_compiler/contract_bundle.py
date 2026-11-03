#!/usr/bin/env python3
"""Fail-closed runtime closure for InputXML dialect, adapter, and byte policy."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from .base import CompileBlocked, SUPPORTED_COMPILER_DIALECTS
from .serialization_policy import (
    SerializationPolicyError,
    load_serialization_policy,
    serialization_policy_metadata,
)

DIALECT_REGISTRY_SCHEMA = "InputXmlDialectRegistry.v1"
ADAPTER_REGISTRY_SCHEMA = "InputXmlCanonicalCompilerAdapterRegistry.v1"
CONTRACT_BUNDLE_SCHEMA = "InputXmlRuntimeContractBundle.v1"
EXPECTED_DIALECT_COUNT = 15


class ContractBundleError(CompileBlocked):
    """Raised when the executable compiler contract is not closed."""


@dataclass(frozen=True)
class VerifiedContractBundle:
    registry: dict[str, Any]
    adapter_registry: dict[str, Any]
    dialects: dict[str, dict[str, Any]]
    adapters: dict[str, dict[str, Any]]
    metadata: dict[str, Any]
    serialization_policy: dict[str, Any]


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _load_json_strict(path: Path) -> tuple[dict[str, Any], bytes]:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ContractBundleError(
            f"Contract registry could not be read: {path}: {exc}"
        ) from exc
    duplicates: list[str] = []

    def pairs_hook(pairs: Iterable[tuple[str, Any]]) -> dict[str, Any]:
        value: dict[str, Any] = {}
        for key, item in pairs:
            if key in value:
                duplicates.append(key)
            value[key] = item
        return value

    try:
        payload = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs_hook)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ContractBundleError(
            f"Contract registry is not strict UTF-8 JSON: {path}: {exc}"
        ) from exc
    if duplicates:
        names = ", ".join(sorted(set(duplicates)))
        raise ContractBundleError(
            f"Contract registry contains duplicate JSON keys: {path}: {names}"
        )
    if not isinstance(payload, dict):
        raise ContractBundleError(
            f"Contract registry root must be an object: {path}"
        )
    return payload, raw


def _index_unique_rows(
    rows: Any,
    *,
    collection_name: str,
    identity_field: str,
) -> dict[str, dict[str, Any]]:
    if not isinstance(rows, list):
        raise ContractBundleError(f"{collection_name} must be an array.")
    indexed: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ContractBundleError(
                f"{collection_name}[{index}] must be an object."
            )
        identity = row.get(identity_field)
        if not isinstance(identity, str) or not identity.strip():
            raise ContractBundleError(
                f"{collection_name}[{index}] requires non-empty "
                f"{identity_field}."
            )
        if identity in indexed:
            raise ContractBundleError(
                f"{collection_name} contains duplicate "
                f"{identity_field} {identity!r}."
            )
        indexed[identity] = row
    return indexed


def _verify_profile_contract(
    dialect_id: str,
    dialect: dict[str, Any],
    adapter: dict[str, Any],
) -> None:
    acceptance = dialect.get("canonicalAcceptance")
    registry_adapter = dialect.get("adapter")
    adapter_id = adapter.get("adapterId")
    status = adapter.get("status")
    result_policy = adapter.get("resultPolicy")
    allowed = {
        "DIRECT": {"IMPLEMENTED"},
        "ADAPTER_REQUIRED": {"IMPLEMENTED"},
        "RECONCILIATION_REQUIRED": {"IMPLEMENTED"},
        "DIAGNOSTIC_ONLY": {"IMPLEMENTED_BLOCKING"},
        "EXCLUDED": {"EXCLUDED"},
    }
    if acceptance not in allowed or status not in allowed[acceptance]:
        raise ContractBundleError(
            f"Dialect {dialect_id!r} has incompatible "
            f"acceptance/status {acceptance!r}/{status!r}."
        )
    if not isinstance(result_policy, str) or not result_policy:
        raise ContractBundleError(
            f"Dialect {dialect_id!r} requires a resultPolicy."
        )
    if result_policy in {"DROP", "SKIP"}:
        raise ContractBundleError(
            f"Dialect {dialect_id!r} uses forbidden "
            f"resultPolicy {result_policy!r}."
        )
    if acceptance == "DIRECT":
        valid = (
            registry_adapter == "none"
            and adapter_id == "direct-canonical-validation"
        )
    elif acceptance == "EXCLUDED":
        valid = registry_adapter == "none" and adapter_id == "none"
    else:
        valid = registry_adapter == adapter_id
    if not valid:
        raise ContractBundleError(
            f"Dialect {dialect_id!r} adapter mismatch: "
            f"registry={registry_adapter!r}, runtime={adapter_id!r}."
        )


def _verify_registry_closure(
    registry: dict[str, Any],
    adapter_registry: dict[str, Any],
    runtime_supported: set[str],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    if registry.get("schema") != DIALECT_REGISTRY_SCHEMA:
        raise ContractBundleError(
            f"Dialect registry schema must be {DIALECT_REGISTRY_SCHEMA!r}."
        )
    if adapter_registry.get("schema") != ADAPTER_REGISTRY_SCHEMA:
        raise ContractBundleError(
            f"Adapter registry schema must be {ADAPTER_REGISTRY_SCHEMA!r}."
        )
    dialects = _index_unique_rows(
        registry.get("dialects"),
        collection_name="dialects",
        identity_field="dialectId",
    )
    adapters = _index_unique_rows(
        adapter_registry.get("adapters"),
        collection_name="adapters",
        identity_field="dialectId",
    )
    if (
        len(dialects) != EXPECTED_DIALECT_COUNT
        or len(adapters) != EXPECTED_DIALECT_COUNT
    ):
        raise ContractBundleError(
            f"Runtime contract bundle requires exactly "
            f"{EXPECTED_DIALECT_COUNT} profiles: "
            f"dialects={len(dialects)}, adapters={len(adapters)}."
        )
    if set(dialects) != set(adapters):
        raise ContractBundleError(
            "Dialect/adapter registry closure failed: "
            f"missingAdapters={sorted(set(dialects) - set(adapters))}, "
            f"unknownAdapters={sorted(set(adapters) - set(dialects))}."
        )
    executable_ids = [
        row.get("adapterId")
        for row in adapters.values()
        if row.get("adapterId") != "none"
    ]
    if len(executable_ids) != len(set(executable_ids)):
        raise ContractBundleError("Executable adapterId values must be unique.")
    for dialect_id in sorted(dialects):
        _verify_profile_contract(
            dialect_id, dialects[dialect_id], adapters[dialect_id]
        )
    implemented = {
        dialect_id
        for dialect_id, adapter in adapters.items()
        if adapter.get("status") in {"IMPLEMENTED", "IMPLEMENTED_BLOCKING"}
    }
    if runtime_supported != implemented:
        raise ContractBundleError(
            "Runtime resolver closure failed: "
            f"missingRuntime={sorted(implemented - runtime_supported)}, "
            f"unregisteredRuntime={sorted(runtime_supported - implemented)}."
        )
    return dialects, adapters


def _bundle_metadata(
    registry_raw: bytes,
    adapter_raw: bytes,
    policy_meta: dict[str, str],
    implemented_count: int,
) -> dict[str, Any]:
    digest_contract = {
        "adapterRegistry": {
            "schema": ADAPTER_REGISTRY_SCHEMA,
            "sha256": _sha256_bytes(adapter_raw),
        },
        "dialectRegistry": {
            "schema": DIALECT_REGISTRY_SCHEMA,
            "sha256": _sha256_bytes(registry_raw),
        },
        "serializationPolicy": policy_meta,
    }
    digest = json.dumps(
        digest_contract,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return {
        "schema": CONTRACT_BUNDLE_SCHEMA,
        "status": "VERIFIED",
        "digestSha256": _sha256_bytes(digest),
        "dialectCount": EXPECTED_DIALECT_COUNT,
        "implementedDialectCount": implemented_count,
        "dialectRegistry": digest_contract["dialectRegistry"],
        "adapterRegistry": digest_contract["adapterRegistry"],
        "serializationPolicy": policy_meta,
    }


def verify_contract_bundle(
    registry_path: Path,
    adapter_registry_path: Path | None = None,
    serialization_policy_path: Path | None = None,
    *,
    runtime_supported_dialects: set[str] | None = None,
) -> VerifiedContractBundle:
    adapter_path = adapter_registry_path or (
        registry_path.parent / "compiler" / "inputxml-compiler-adapters.json"
    )
    policy_path = serialization_policy_path or (
        registry_path.parent
        / "compiler"
        / "inputxml-deterministic-serialization.json"
    )
    registry, registry_raw = _load_json_strict(registry_path)
    adapter_registry, adapter_raw = _load_json_strict(adapter_path)
    runtime_supported = set(
        SUPPORTED_COMPILER_DIALECTS
        if runtime_supported_dialects is None
        else runtime_supported_dialects
    )
    dialects, adapters = _verify_registry_closure(
        registry, adapter_registry, runtime_supported
    )
    try:
        policy = load_serialization_policy(policy_path)
    except SerializationPolicyError as exc:
        raise ContractBundleError(
            f"Serialization policy closure failed: {exc}"
        ) from exc
    policy_meta = serialization_policy_metadata(policy)
    implemented_count = sum(
        adapter.get("status") in {"IMPLEMENTED", "IMPLEMENTED_BLOCKING"}
        for adapter in adapters.values()
    )
    metadata = _bundle_metadata(
        registry_raw,
        adapter_raw,
        policy_meta,
        implemented_count,
    )
    return VerifiedContractBundle(
        registry=registry,
        adapter_registry=adapter_registry,
        dialects=dialects,
        adapters=adapters,
        metadata=metadata,
        serialization_policy=policy,
    )


__all__ = [
    "ADAPTER_REGISTRY_SCHEMA",
    "CONTRACT_BUNDLE_SCHEMA",
    "ContractBundleError",
    "DIALECT_REGISTRY_SCHEMA",
    "EXPECTED_DIALECT_COUNT",
    "VerifiedContractBundle",
    "verify_contract_bundle",
]
