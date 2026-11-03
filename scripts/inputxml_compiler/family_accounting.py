#!/usr/bin/env python3
"""Deterministic source inventory and transformation-accounting proof."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from lxml import etree as ET

from .base import DecisionLedger
from .xml import _local, _namespace

_ACCOUNTING_TYPES = {"SOURCE_ACCOUNTING_INDEX", "SOURCE_ACCOUNTING_PROOF"}


@dataclass(frozen=True)
class SourceInventoryItem:
    source_entity_id: str
    parent_source_entity_id: str | None
    source_type: str
    source_fields: dict[str, Any]
    attribute_name: str | None = None


@dataclass(frozen=True)
class SourceCoverage:
    item: SourceInventoryItem
    record_ids: tuple[str, ...]
    dispositions: tuple[str, ...]

    @property
    def covered(self) -> bool:
        return bool(self.record_ids)


def account_profile_source(
    root: ET._Element,
    *,
    profile_id: str,
    ledger: DecisionLedger,
) -> tuple[str, dict[str, Any]]:
    """Prove that every source entity is covered by a prior resolver decision.

    Accounting-index records are emitted only after coverage is evaluated and
    therefore cannot certify themselves. A parent decision may cover an
    attribute only when that exact attribute is present in its recorded source
    fields. A preservation decision containing the complete XML subtree may
    cover its descendants, but the proof still indexes each descendant.
    """
    inventory = build_source_inventory(root)
    decisions = tuple(
        record
        for record in ledger.records
        if str(record.get("sourceType") or "") not in _ACCOUNTING_TYPES
    )
    coverage = tuple(
        _cover_item(item, decisions, profile_id=profile_id)
        for item in inventory
    )
    missing = [entry.item.source_entity_id for entry in coverage if not entry.covered]
    duplicate_inventory = len(inventory) - len(
        {item.source_entity_id for item in inventory}
    )
    covered_count = sum(entry.covered for entry in coverage)
    unique_covered = len({
        entry.item.source_entity_id for entry in coverage if entry.covered
    })
    for entry in coverage:
        _ledger_coverage(entry, profile_id=profile_id, ledger=ledger)
    status = "COMPLETE" if not missing and duplicate_inventory == 0 else "BLOCKED"
    proof = {
        "schema": "InputXmlSourceAccountingProof.v1",
        "profileId": profile_id,
        "inventoryCount": len(inventory),
        "uniqueInventoryCount": len({item.source_entity_id for item in inventory}),
        "coveredCount": covered_count,
        "uniqueCoveredCount": unique_covered,
        # Retained aliases preserve the v1 consumer surface while tightening
        # their meaning from index-row count to prior-decision coverage count.
        "accountedCount": covered_count,
        "uniqueAccountedCount": unique_covered,
        "missingSourceEntityIds": sorted(missing),
        "duplicateInventoryIdentityCount": duplicate_inventory,
        "coverageRule": "PRIOR_TRANSFORMATION_DECISION_REQUIRED",
        "status": status,
    }
    ledger.add(
        source_entity_id="source-accounting-proof",
        source_type="SOURCE_ACCOUNTING_PROOF",
        source_fields=proof,
        projection_cardinality="ACCOUNTING_SUMMARY",
        disposition="EMIT_1_TO_1" if status == "COMPLETE" else "REJECT_INVALID",
        evidence=[
            "source inventory reconciled only against resolver decisions that existed before accounting-index records"
        ],
        diagnostics=[] if status == "COMPLETE" else ["source accounting is incomplete"],
    )
    if status != "COMPLETE":
        ledger.diagnostic(
            "BLOCKING",
            "SOURCE_ACCOUNTING_INCOMPLETE",
            "Source inventory contains entities without a prior transformation or preservation decision.",
            "source-accounting-proof",
            proof=proof,
        )
    return status, proof


def _ledger_coverage(
    coverage: SourceCoverage,
    *,
    profile_id: str,
    ledger: DecisionLedger,
) -> None:
    item = coverage.item
    ledger.add(
        source_entity_id=f"accounting::{item.source_entity_id}",
        source_type="SOURCE_ACCOUNTING_INDEX",
        source_fields={
            "profileId": profile_id,
            "sourceEntityId": item.source_entity_id,
            "entityType": item.source_type,
            "parentSourceEntityId": item.parent_source_entity_id,
            "source": item.source_fields,
            "coverageRecordIds": list(coverage.record_ids),
            "coverageDispositions": list(coverage.dispositions),
            "coverageStatus": "COVERED" if coverage.covered else "MISSING",
            "relation": "SOURCE_ENTITY_TO_PRIOR_TRANSFORMATION_DECISION",
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION" if coverage.covered else "REJECT_INVALID",
        evidence=[
            "deterministic source identity retained with explicit links to prior resolver decisions"
        ],
        diagnostics=[] if coverage.covered else ["no prior resolver decision covers this source entity"],
    )


def _cover_item(
    item: SourceInventoryItem,
    records: tuple[dict[str, Any], ...],
    *,
    profile_id: str,
) -> SourceCoverage:
    matching = [
        record
        for record in records
        if _record_covers(item, record, profile_id=profile_id)
    ]
    return SourceCoverage(
        item,
        tuple(str(record.get("recordId") or "") for record in matching),
        tuple(sorted({str(record.get("disposition") or "") for record in matching})),
    )


def _record_covers(
    item: SourceInventoryItem,
    record: dict[str, Any],
    *,
    profile_id: str,
) -> bool:
    record_id = _normalize_identity(str(record.get("sourceEntityId") or ""))
    item_id = _normalize_identity(item.source_entity_id)
    if not record_id:
        return False
    if _synthetic_wrapper_covers(item, record, profile_id=profile_id):
        return True
    if item.attribute_name is not None:
        parent_id = _normalize_identity(item.parent_source_entity_id or "")
        if _identity_equal(record_id, item_id):
            return True
        if _identity_equal(record_id, parent_id):
            return _source_fields_contain(
                record.get("sourceFields"),
                item.attribute_name,
                item.source_fields.get(item.attribute_name),
            )
        if _short_attribute_identity_matches(record_id, item_id):
            return True
        return _preserved_subtree_covers(item_id, record_id, record)
    if _identity_equal(record_id, item_id):
        return True
    if _preserved_subtree_covers(item_id, record_id, record):
        return True
    parent_id = _normalize_identity(item.parent_source_entity_id or "")
    if _identity_equal(record_id, parent_id):
        return _source_fields_contain(
            record.get("sourceFields"),
            _local_name_from_identity(item_id),
            item.source_fields.get("text"),
        )
    if _is_extension_wrapper(item_id):
        return record_id.startswith(f"{item_id}/Record")
    return False


def _synthetic_wrapper_covers(
    item: SourceInventoryItem,
    record: dict[str, Any],
    *,
    profile_id: str,
) -> bool:
    if item.parent_source_entity_id is not None:
        return False
    if record.get("sourceType") != "SYNTHETIC_CANONICAL_WRAPPER":
        return False
    fields = record.get("sourceFields") or {}
    source_root = str(fields.get("sourceRoot") or "")
    declared_profile = str(fields.get("profileId") or "")
    local = _local_name_from_identity(_normalize_identity(item.source_entity_id))
    if profile_id == "inputxml-fragment":
        return source_root == local
    if profile_id == "categorized-inputxml-v3":
        return declared_profile == profile_id and local == "CategorizedInputXML"
    return False


def _preserved_subtree_covers(
    item_id: str,
    record_id: str,
    record: dict[str, Any],
) -> bool:
    source_fields = record.get("sourceFields")
    has_xml = isinstance(source_fields, dict) and isinstance(source_fields.get("xml"), str)
    if not has_xml:
        return False
    return item_id.startswith(f"{record_id}/") or record_id.startswith(f"{item_id}/")


def _source_fields_contain(value: Any, name: str, expected: Any) -> bool:
    target = _field_key(name)
    if isinstance(value, dict):
        for key, item in value.items():
            if _field_key(str(key)) == target:
                if expected is None or _equivalent_text(item, expected):
                    return True
            if _source_fields_contain(item, name, expected):
                return True
    elif isinstance(value, (list, tuple)):
        return any(_source_fields_contain(item, name, expected) for item in value)
    return False


def _equivalent_text(left: Any, right: Any) -> bool:
    return str(left if left is not None else "").strip() == str(
        right if right is not None else ""
    ).strip()


def _field_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _short_attribute_identity_matches(record_id: str, item_id: str) -> bool:
    if "@" not in item_id or "@" not in record_id:
        return False
    item_parent, item_attr = item_id.rsplit("@", 1)
    record_parent, record_attr = record_id.rsplit("@", 1)
    if item_attr != record_attr:
        return False
    return item_parent.endswith(f"/{record_parent.lstrip('/')}")


def _identity_equal(left: str, right: str) -> bool:
    return bool(left and right and left == right)


def _normalize_identity(value: str) -> str:
    text = value.strip()
    if not text:
        return ""
    text = re.sub(r"\{[^}]*\}", "", text)
    if not text.startswith("/") and not text.startswith(("generated:", "canonical:")):
        text = f"/{text}"
    text = re.sub(r"/([^/@]+)\[1\](?=/|@|$)", r"/\1", text)
    text = text.replace("/attribute::", "@")
    return text.rstrip("/")


def _local_name_from_identity(identity: str) -> str:
    leaf = identity.rsplit("/", 1)[-1]
    return leaf.split("@", 1)[0].split("[", 1)[0]


def _is_extension_wrapper(identity: str) -> bool:
    return identity.endswith("/Extension")


def build_source_inventory(root: ET._Element) -> tuple[SourceInventoryItem, ...]:
    items: list[SourceInventoryItem] = []

    def visit(
        element: ET._Element,
        path: str,
        parent_path: str | None,
    ) -> None:
        items.append(
            SourceInventoryItem(
                source_entity_id=path,
                parent_source_entity_id=parent_path,
                source_type=f"ELEMENT:{{{_namespace(element.tag)}}}{_local(element.tag)}",
                source_fields={
                    "attributes": dict(element.attrib),
                    "text": (element.text or "").strip(),
                    "childCount": len(element),
                },
            )
        )
        for attribute_name in element.attrib:
            items.append(
                SourceInventoryItem(
                    source_entity_id=f"{path}@{attribute_name}",
                    parent_source_entity_id=path,
                    source_type="ATTRIBUTE",
                    source_fields={attribute_name: element.get(attribute_name)},
                    attribute_name=attribute_name,
                )
            )
        occurrences: dict[tuple[str, str], int] = {}
        for child in element:
            key = (_namespace(child.tag), _local(child.tag))
            occurrences[key] = occurrences.get(key, 0) + 1
            visit(
                child,
                f"{path}/{key[1]}[{occurrences[key]}]",
                path,
            )

    visit(root, f"/{_local(root.tag)}[1]", None)
    return tuple(items)


__all__ = [
    "SourceCoverage",
    "SourceInventoryItem",
    "account_profile_source",
    "build_source_inventory",
]
