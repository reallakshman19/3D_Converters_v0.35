#!/usr/bin/env python3
"""Fail-closed structural validation for InputXML contract catalogs."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG_DIR = ROOT / "contracts" / "inputxml" / "v1" / "catalogs"
FILES = {
    "field": CATALOG_DIR / "inputxml-field-catalog.json",
    "alias": CATALOG_DIR / "inputxml-alias-registry.json",
    "projection": CATALOG_DIR / "inputxml-cii-projection-contract.json",
    "component": CATALOG_DIR / "inputxml-component-contract-catalog.json",
}
ALLOWED_FIELD_STATUS = {
    "PROJECTED",
    "VALIDATION_ONLY",
    "PRESERVE_EXTENSION",
    "UNSUPPORTED_BLOCKING",
}
REQUIRED_COMPONENT_KEYS = {
    "componentId",
    "canonicalFamily",
    "sourceIdentity",
    "requiredPorts",
    "requiredNodes",
    "requiredGeometry",
    "allowedProjectionCardinalities",
    "allowedCiiOwnerElement",
    "requiredAuxiliarySection",
    "fieldAuthority",
    "failureConditions",
    "contractStatus",
}
REQUIRED_COMPONENT_FAMILIES = {
    "PIPE",
    "ELBOW_BEND",
    "TEE",
    "OLET",
    "REDUCER",
    "RIGID",
    "VALVE",
    "FLANGE",
    "GASKET",
    "SUPPORT_RESTRAINT",
    "HANGER",
    "NOZZLE_FAMILIES",
    "ALLOWABLESTRESS",
    "DISPLACEMENTS",
    "FORCESMOMENTS",
    "UNIFORM",
    "WIND",
    "OFFSETS",
    "EXPANSION_JOINT",
}
REQUIRED_SECTIONS = {
    "VERSION",
    "CONTROL",
    "ELEMENTS",
    "AUX_DATA",
    "NODENAME",
    "BEND",
    "RIGID",
    "EXPJT",
    "RESTRANT",
    "DISPLMNT",
    "FORCMNT",
    "UNIFORM",
    "WIND",
    "OFFSETS",
    "ALLOWBLS",
    "SIF&TEES",
    "REDUCERS",
    "FLANGES",
    "EQUIPMNT",
    "MISCEL_1",
    "UNITS",
    "COORDS",
}


def load(name: str) -> dict[str, Any]:
    path = FILES[name]
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AssertionError(f"{path}: invalid or unreadable JSON: {exc}") from exc
    assert isinstance(value, dict), f"{path}: root must be an object"
    return value


def unique(values: list[str], label: str) -> None:
    duplicates = sorted({value for value in values if values.count(value) > 1})
    assert not duplicates, f"duplicate {label}: {duplicates}"


def validate_fields(doc: dict[str, Any]) -> tuple[int, int]:
    columns = doc.get("recordEncoding", {}).get("columns", [])
    records = doc.get("records", [])
    assert isinstance(columns, list) and columns, "field catalog columns are missing"
    assert isinstance(records, list), "field catalog records must be an array"
    assert doc.get("recordCount") == len(records), "field recordCount does not match records"
    indexes = {name: index for index, name in enumerate(columns)}
    required_columns = {
        "id",
        "canonicalName",
        "aliases",
        "parentElement",
        "type",
        "units",
        "cardinality",
        "requiredCondition",
        "sentinelPolicy",
        "inheritancePolicy",
        "defaultPolicy",
        "ciiTargetSection",
        "ciiTargetSlot",
        "criticality",
        "producerCoverage",
        "consumerCoverage",
        "projectionStatus",
        "expandsTo",
    }
    assert required_columns <= indexes.keys(), "field catalog is missing required columns"
    for number, record in enumerate(records, start=1):
        assert isinstance(record, list), f"field record {number} must be an array"
        assert len(record) == len(columns), f"field record {number} has {len(record)} values; expected {len(columns)}"
        assert record[indexes["id"]], f"field record {number} has no id"
        assert record[indexes["canonicalName"]], f"field record {number} has no canonical name"
        assert record[indexes["projectionStatus"]] in ALLOWED_FIELD_STATUS, (
            f"field {record[indexes['id']]} has invalid projectionStatus"
        )
        assert isinstance(record[indexes["aliases"]], list), f"field {record[indexes['id']]} aliases must be an array"
        assert isinstance(record[indexes["expandsTo"]], list), f"field {record[indexes['id']]} expandsTo must be an array"
    ids = [record[indexes["id"]] for record in records]
    unique(ids, "field ids")
    expanded = sum(len(record[indexes["expandsTo"]]) or 1 for record in records)
    assert doc.get("expandedFieldCount") == expanded, (
        f"expandedFieldCount={doc.get('expandedFieldCount')} but records expand to {expanded}"
    )
    return len(records), expanded


def validate_aliases(doc: dict[str, Any]) -> int:
    aliases = doc.get("aliases", [])
    patterns = doc.get("patternAliases", [])
    assert doc.get("rule"), "alias registry rule is missing"
    keys: list[str] = []
    for entry in aliases:
        assert entry.get("parentElement") and entry.get("alias") and entry.get("canonicalName"), (
            f"invalid alias entry: {entry}"
        )
        keys.append(f"{entry['parentElement']}::{entry['alias'].upper()}")
    for entry in patterns:
        assert entry.get("parentElement") and entry.get("aliasPattern") and entry.get("canonicalPattern"), (
            f"invalid alias pattern: {entry}"
        )
        indexes = entry.get("indexes")
        assert isinstance(indexes, list) and indexes, f"alias pattern has no indexes: {entry}"
        keys.append(f"{entry['parentElement']}::{entry['aliasPattern'].upper()}")
    unique(keys, "alias keys")
    assert doc.get("collisionPolicy") == "BLOCK_IF_BOTH_PRESENT_WITH_DIFFERENT_VALUES"
    return len(aliases) + sum(len(entry["indexes"]) for entry in patterns)


def validate_projection(doc: dict[str, Any]) -> int:
    order = doc.get("sectionOrder", [])
    assert set(order) == REQUIRED_SECTIONS, "projection sectionOrder is incomplete or contains unknown sections"
    assert len(order) == len(set(order)), "projection sectionOrder contains duplicates"
    equations = doc.get("controlEquations", {})
    assert equations.get("elements") == "count(PIPINGELEMENT)"
    groups = doc.get("projectionGroups", [])
    group_ids = [group.get("groupId", "") for group in groups]
    assert all(group_ids), "projection group without groupId"
    unique(group_ids, "projection group ids")
    serialized = json.dumps(doc, sort_keys=True)
    assert '"DROP"' not in serialized and '"SKIP"' not in serialized, "generic DROP/SKIP disposition is forbidden"
    assert doc.get("gatePolicy", {}).get("unsupportedEngineeringData") == "BLOCK"
    return len(groups)


def validate_components(doc: dict[str, Any]) -> int:
    components = doc.get("components", [])
    assert isinstance(components, list) and components, "component catalog is empty"
    ids: list[str] = []
    families: set[str] = set()
    for component in components:
        missing = REQUIRED_COMPONENT_KEYS - component.keys()
        assert not missing, f"component {component.get('componentId')} missing {sorted(missing)}"
        assert component["failureConditions"], f"component {component['componentId']} has no failure conditions"
        ids.append(component["componentId"])
        families.add(component["canonicalFamily"])
    unique(ids, "component ids")
    missing_families = REQUIRED_COMPONENT_FAMILIES - families
    assert not missing_families, f"component catalog missing families: {sorted(missing_families)}"
    serialized = json.dumps(doc, sort_keys=True)
    assert '"DROP"' not in serialized and '"SKIP"' not in serialized, "generic DROP/SKIP disposition is forbidden"
    return len(components)


def main() -> None:
    documents = {name: load(name) for name in FILES}
    field_records, expanded_fields = validate_fields(documents["field"])
    alias_count = validate_aliases(documents["alias"])
    projection_groups = validate_projection(documents["projection"])
    component_count = validate_components(documents["component"])
    print(
        "InputXML catalogs PASS: "
        f"{field_records} field records / {expanded_fields} expanded fields; "
        f"{alias_count} alias instances; {component_count} component contracts; "
        f"{projection_groups} projection groups."
    )


if __name__ == "__main__":
    main()
