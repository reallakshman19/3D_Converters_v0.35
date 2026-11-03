#!/usr/bin/env python3
"""Strict runtime contract for deterministic InputXML serialization."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

POLICY_SCHEMA = "InputXmlDeterministicSerializationPolicy.v1"
POLICY_ID = "inputxml-deterministic-serialization-v1"
COADE_NS = "COADE"
EXT_NS = "urn:reallaksh19:inputxml:extension:v1"

_REQUIRED_ATTRIBUTE_COVERAGE = {
    "{COADE}CAESARII": {"XML_TYPE", "VERSION"},
    "PIPINGMODEL": {
        "JOBNAME", "TIME", "ISSUE_NO", "NUMELT", "NUMNOZ", "NOHGRS",
        "NUMBEND", "NUMRIGID", "NUMEXPJNT", "NUMREST", "NUMFORCMNT",
        "NUMUNFLOAD", "NUMWIND", "NUMELEOFF", "NUMALLOW", "NUMISECT",
        "NORTH_X", "NORTH_Y", "NORTH_Z",
    },
    "PIPINGELEMENT": {
        "ID", "FROM_NODE", "TO_NODE", "DELTA_X", "DELTA_Y", "DELTA_Z",
        "DIAMETER", "WALL_THICK", "INSUL_THICK", "CORR_ALLOW",
        "HYDRO_PRESSURE", "INSUL_DENSITY", "FLUID_DENSITY", "MATERIAL_NUM",
        "FROM_NAME", "TO_NAME", "LINE", "FROM_X", "FROM_Y", "FROM_Z",
        "TO_X", "TO_Y", "TO_Z",
        *(f"TEMP_EXP_C{i}" for i in range(1, 10)),
        *(f"PRESSURE_C{i}" for i in range(1, 10)),
    },
}
_REQUIRED_ELEMENTS = {
    "{COADE}CAESARII", "PIPINGMODEL", "PIPINGELEMENT", "BEND", "RIGID",
    "RESTRAINT", "SIF", "HANGER", "WRC_297_NOZZLE", "API650_NOZZLE",
    "PD5500_NOZZLE", "CUSTOM_NOZZLE",
}


class SerializationPolicyError(ValueError):
    """Raised when policy or runtime representation cannot be accepted."""


def _reject_duplicate_keys(pairs: Iterable[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise SerializationPolicyError(f"Duplicate JSON key: {key}.")
        result[key] = value
    return result


def load_serialization_policy(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise SerializationPolicyError(
            f"Serialization policy could not be read: {path.name}."
        ) from exc
    try:
        payload = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_keys,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SerializationPolicyError(
            "Serialization policy is not strict UTF-8 JSON."
        ) from exc
    return validate_serialization_policy(payload)


def validate_serialization_policy(policy: Any) -> dict[str, Any]:
    if not isinstance(policy, dict):
        raise SerializationPolicyError("Serialization policy root must be an object.")
    if policy.get("schema") != POLICY_SCHEMA or policy.get("policyId") != POLICY_ID:
        raise SerializationPolicyError("Unknown serialization policy schema or identity.")
    if policy.get("runtimeCapabilities") != {
        "serializer": "python-lxml",
        "policyVersion": 1,
    }:
        raise SerializationPolicyError("Serialization runtime capability mismatch.")
    _validate_xml_policy(policy.get("xml"))
    _validate_json_policy(policy.get("json"))
    ledger = policy.get("ledger")
    expected_order = [
        "stageSequence", "severityRank", "code",
        "sourceEntityId", "context", "message",
    ]
    if not isinstance(ledger, dict) or ledger.get("diagnosticOrder") != expected_order:
        raise SerializationPolicyError("Unsupported ledger diagnostic-order policy.")
    if policy.get("hashScopes") != {
        "source": "RAW_SOURCE_BYTES_SHA256",
        "canonical": "DETERMINISTIC_CANONICAL_XML_BYTES_SHA256",
        "ledger": "DETERMINISTIC_LEDGER_JSON_BYTES_SHA256",
        "validation": "SELF_HASH_EXCLUDED",
        "serializationPolicy": "NORMALIZED_POLICY_JSON_SHA256",
    }:
        raise SerializationPolicyError("Unsupported serialization hash scopes.")
    return policy


def _validate_xml_policy(xml_policy: Any) -> None:
    if not isinstance(xml_policy, dict):
        raise SerializationPolicyError("XML serialization policy is missing.")
    expected = {
        "encoding": "UTF-8",
        "declaration": True,
        "lineEnding": "LF",
        "trailingNewline": True,
        "prettyPrint": True,
        "comments": "REJECT",
        "processingInstructions": "REJECT",
        "childOrder": "PRESERVE_ENGINEERING_ORDER",
        "unlistedCanonicalAttribute": "REJECT_POLICY_DRIFT",
        "unlistedExtensionAttribute": "LEXICAL_QNAME_ORDER",
    }
    for key, value in expected.items():
        if xml_policy.get(key) != value:
            raise SerializationPolicyError(
                f"Unsupported XML policy capability: {key}."
            )
    if xml_policy.get("namespacePolicy") != {
        "defaultNamespace": COADE_NS,
        "extensionNamespace": EXT_NS,
        "extensionPrefix": "ext",
        "foreignAttributeNamespace": "REJECT",
    }:
        raise SerializationPolicyError("Unsupported XML namespace policy.")
    if xml_policy.get("numericLexicalPolicy") != {
        "rejectNonFinite": True,
        "normalizeNegativeZero": True,
        "rejectCommas": True,
        "exponentNotation": "PROHIBITED",
        "trailingZeros": "REMOVE",
    }:
        raise SerializationPolicyError("Unsupported numeric lexical policy.")
    order = xml_policy.get("attributeOrder")
    if not isinstance(order, dict) or not _REQUIRED_ELEMENTS <= set(order):
        raise SerializationPolicyError("Attribute-order policy is incomplete.")
    for element_name, names in order.items():
        _validate_name_list(names, f"attributeOrder.{element_name}")
    for element_name, required in _REQUIRED_ATTRIBUTE_COVERAGE.items():
        missing = required - set(order[element_name])
        if missing:
            raise SerializationPolicyError(
                f"Attribute-order policy omits fields for {element_name}: "
                f"{sorted(missing)}."
            )
    numeric = xml_policy.get("numericAttributes")
    if not isinstance(numeric, dict):
        raise SerializationPolicyError("Numeric attribute policy is missing.")
    for kind in ("decimal", "integer"):
        mapping = numeric.get(kind)
        if not isinstance(mapping, dict):
            raise SerializationPolicyError(f"Numeric {kind} policy is missing.")
        for element_name, names in mapping.items():
            _validate_name_list(names, f"numericAttributes.{kind}.{element_name}")
            if element_name not in order or not set(names) <= set(order[element_name]):
                raise SerializationPolicyError(
                    f"Numeric {kind} policy references unlisted attributes "
                    f"on {element_name}."
                )


def _validate_json_policy(json_policy: Any) -> None:
    expected = {
        "encoding": "UTF-8",
        "indentation": 2,
        "sortKeys": True,
        "ensureAscii": False,
        "allowNan": False,
        "itemSeparator": ",",
        "keySeparator": ": ",
        "lineEnding": "LF",
        "trailingNewline": False,
    }
    if not isinstance(json_policy, dict):
        raise SerializationPolicyError("JSON serialization policy is missing.")
    for key, value in expected.items():
        if json_policy.get(key) != value:
            raise SerializationPolicyError(
                f"Unsupported JSON policy capability: {key}."
            )


def _validate_name_list(value: Any, label: str) -> None:
    invalid = (
        not isinstance(value, list)
        or any(not isinstance(item, str) or not item for item in value)
    )
    if invalid:
        raise SerializationPolicyError(
            f"{label} must be an array of non-empty strings."
        )
    if len(value) != len(set(value)):
        raise SerializationPolicyError(f"{label} contains duplicates.")


def normalized_policy_bytes(policy: dict[str, Any]) -> bytes:
    validate_serialization_policy(policy)
    return json.dumps(
        policy,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def serialization_policy_metadata(policy: dict[str, Any]) -> dict[str, str]:
    digest = hashlib.sha256(normalized_policy_bytes(policy)).hexdigest()
    return {
        "policyId": POLICY_ID,
        "policySchema": POLICY_SCHEMA,
        "policySha256": digest,
    }


__all__ = [
    "COADE_NS",
    "EXT_NS",
    "POLICY_ID",
    "POLICY_SCHEMA",
    "SerializationPolicyError",
    "load_serialization_policy",
    "normalized_policy_bytes",
    "serialization_policy_metadata",
    "validate_serialization_policy",
]
