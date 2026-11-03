#!/usr/bin/env python3
"""Versioned deterministic byte serialization for canonical InputXML."""
from __future__ import annotations

import copy
import hashlib
import json
from decimal import Decimal, InvalidOperation
from typing import Any

from lxml import etree as ET

from .serialization_policy import (
    COADE_NS,
    EXT_NS,
    SerializationPolicyError,
    validate_serialization_policy,
)


def canonical_decimal_text(value: object) -> str:
    text = str(value).strip()
    if "," in text:
        raise SerializationPolicyError(
            "Locale-formatted numeric value is prohibited."
        )
    try:
        number = Decimal(text)
    except InvalidOperation as exc:
        raise SerializationPolicyError(
            f"Invalid decimal value: {value!r}."
        ) from exc
    if not number.is_finite():
        raise SerializationPolicyError("Non-finite numeric value is prohibited.")
    if number == 0:
        return "0"
    rendered = format(number, "f")
    return rendered.rstrip("0").rstrip(".") if "." in rendered else rendered


def canonical_integer_text(value: object) -> str:
    text = canonical_decimal_text(value)
    number = Decimal(text)
    if number != number.to_integral_value():
        raise SerializationPolicyError(
            f"Integer attribute has fractional value: {value!r}."
        )
    return str(int(number))


def _element_key(element: ET._Element) -> tuple[str, bool]:
    if not isinstance(element.tag, str):
        raise SerializationPolicyError(
            "Comments and processing instructions are prohibited."
        )
    qname = ET.QName(element.tag)
    if qname.namespace == COADE_NS and qname.localname == "CAESARII":
        return "{COADE}CAESARII", False
    if qname.namespace == EXT_NS:
        return qname.localname, True
    if qname.namespace:
        raise SerializationPolicyError(
            f"Unsupported element namespace: {qname.namespace}."
        )
    return qname.localname, False


def _normalize_attribute(
    key: str,
    name: str,
    value: str,
    xml_policy: dict[str, Any],
) -> str:
    numeric = xml_policy["numericAttributes"]
    if name in set(numeric["decimal"].get(key, [])):
        return canonical_decimal_text(value)
    if name in set(numeric["integer"].get(key, [])):
        return canonical_integer_text(value)
    return value


def _extension_sort_key(name: str) -> tuple[str, str]:
    qname = ET.QName(name)
    return qname.namespace or "", qname.localname


def _normalize_and_sort(
    element: ET._Element,
    xml_policy: dict[str, Any],
) -> None:
    key, extension_element = _element_key(element)
    order = (xml_policy.get("attributeOrder") or {}).get(key, [])
    attrs = dict(element.attrib)
    ordered: list[str] = []
    for name in order:
        if name in attrs:
            attrs[name] = _normalize_attribute(
                key, name, attrs[name], xml_policy
            )
            ordered.append(name)
    extensions: list[str] = []
    for name in attrs:
        if name in ordered:
            continue
        qname = ET.QName(name)
        allowed_extension = (
            extension_element and qname.namespace is None
        ) or qname.namespace == EXT_NS
        if allowed_extension:
            extensions.append(name)
        elif qname.namespace:
            raise SerializationPolicyError(
                f"Unsupported attribute namespace "
                f"{qname.namespace!r} on {key}."
            )
        else:
            raise SerializationPolicyError(
                f"Policy drift: unlisted canonical attribute "
                f"{name} on {key}."
            )
    extensions.sort(key=_extension_sort_key)
    element.attrib.clear()
    for name in [*ordered, *extensions]:
        element.set(name, attrs[name])
    for child in element:
        _normalize_and_sort(child, xml_policy)


def _clone_with_canonical_namespaces(
    element: ET._Element,
    *,
    parent_namespace: str | None = None,
    is_root: bool = False,
) -> ET._Element:
    qname = ET.QName(element.tag)
    nsmap = {None: COADE_NS, "ext": EXT_NS} if is_root else None
    clone = ET.Element(element.tag, nsmap=nsmap)
    if parent_namespace == COADE_NS and qname.namespace is None:
        clone.set("xmlns", "")
    for name, value in element.attrib.items():
        clone.set(name, value)
    clone.text = element.text
    clone.tail = element.tail
    for child in element:
        clone.append(
            _clone_with_canonical_namespaces(
                child,
                parent_namespace=qname.namespace,
            )
        )
    return clone


def serialize_canonical_xml(
    root: ET._Element,
    policy: dict[str, Any],
) -> bytes:
    validate_serialization_policy(policy)
    if root.tag != f"{{{COADE_NS}}}CAESARII":
        raise SerializationPolicyError(
            "Canonical XML serializer requires a {COADE}CAESARII root."
        )
    tree_copy = copy.deepcopy(root)
    _normalize_and_sort(tree_copy, policy["xml"])
    normalized_root = _clone_with_canonical_namespaces(
        tree_copy,
        is_root=True,
    )
    data = ET.tostring(
        normalized_root,
        xml_declaration=True,
        encoding="UTF-8",
        pretty_print=True,
    ).replace(b"\r\n", b"\n")
    return data if data.endswith(b"\n") else data + b"\n"


def _serialize_json(
    payload: dict[str, Any],
    policy: dict[str, Any],
) -> bytes:
    validate_serialization_policy(policy)
    json_policy = policy["json"]
    text = json.dumps(
        payload,
        indent=json_policy["indentation"],
        sort_keys=json_policy["sortKeys"],
        ensure_ascii=json_policy["ensureAscii"],
        allow_nan=json_policy["allowNan"],
        separators=(
            json_policy["itemSeparator"],
            json_policy["keySeparator"],
        ),
    ).replace("\r\n", "\n")
    return text.encode("UTF-8")


def serialize_decision_ledger(
    payload: dict[str, Any],
    policy: dict[str, Any],
) -> bytes:
    return _serialize_json(payload, policy)


def serialize_validation_report(
    payload: dict[str, Any],
    policy: dict[str, Any],
) -> bytes:
    return _serialize_json(payload, policy)


def hash_source_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hash_canonical_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hash_ledger_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


__all__ = [
    "SerializationPolicyError",
    "canonical_decimal_text",
    "canonical_integer_text",
    "hash_canonical_bytes",
    "hash_ledger_bytes",
    "hash_source_bytes",
    "serialize_canonical_xml",
    "serialize_decision_ledger",
    "serialize_validation_report",
]
