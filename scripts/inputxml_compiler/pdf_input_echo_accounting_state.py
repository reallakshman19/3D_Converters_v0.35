from __future__ import annotations

from collections import defaultdict
import hashlib
import json
from typing import Any

from .base import ET
from .pdf_input_echo_state_fields import (
    ALL_STATE_FIELDS,
    LINE_STATE_POLICY_ID,
    REQUIRED_STATE_FIELDS,
    canonical_state_value,
    explicit_fields,
    field_value,
    state_value_missing,
)

STATE_RECORD_TYPES = {
    "PDF_INPUT_ECHO_EXPLICIT_FIELD",
    "PDF_INPUT_ECHO_INHERITANCE",
    "PDF_INPUT_ECHO_EXPLICIT_ABSENCE",
    "PDF_INPUT_ECHO_INHERITED_ABSENCE",
}
SEMANTIC_TUPLE_FIELDS = (
    "sourceEntityId",
    "sourceType",
    "sourceFields",
    "canonicalElementIds",
    "InputXMLElementIds",
    "CIISection",
    "projectionCardinality",
    "disposition",
)


def verify_state_decision_closure(
    resolved: list[dict[str, Any]],
    records: list[dict[str, Any]],
    elements: dict[str, ET._Element],
) -> dict[str, Any]:
    expected = reconstruct_expected_state_decisions(resolved)
    actual = [row for row in records if row.get("sourceType") in STATE_RECORD_TYPES]
    expected_by_id = {row["sourceEntityId"]: row for row in expected}
    actual_by_id = _group_by_identity(actual)
    cardinality = _cardinality(expected_by_id, actual_by_id, len(actual))
    semantic = _semantic_mismatches(expected_by_id, actual_by_id)
    source_indexes = _source_indexes(resolved, expected)
    predecessor, origin = _ownership_mismatches(actual, expected_by_id, source_indexes)
    source_xml = _source_xml_mismatches(expected, elements)
    ledger_xml = _ledger_xml_mismatches(actual, elements)
    line = _line_ownership_mismatches(actual, expected_by_id, elements)
    invariants = {
        **cardinality["invariants"],
        "stateDecisionSemanticMismatchCount": len(semantic),
        "stateDecisionSourceXmlMismatchCount": len(source_xml),
        "stateDecisionLedgerXmlMismatchCount": len(ledger_xml),
        "stateDecisionPredecessorOwnershipMismatchCount": len(predecessor),
        "stateDecisionOriginOwnershipMismatchCount": len(origin),
        "stateDecisionLineOwnershipMismatchCount": len(line),
    }
    return {
        "invariants": invariants,
        "expectedCount": len(expected),
        "actualCount": len(actual),
        "semanticTupleFields": list(SEMANTIC_TUPLE_FIELDS),
        "expectedHashSha256": _stable_hash([_semantic_tuple(row) for row in expected]),
        "actualHashSha256": _stable_hash([_semantic_tuple(row) for row in actual]),
        "cardinalityMismatches": cardinality["mismatches"],
        "semanticMismatches": semantic,
        "sourceXmlMismatches": source_xml,
        "ledgerXmlMismatches": ledger_xml,
        "predecessorOwnershipMismatches": predecessor,
        "originOwnershipMismatches": origin,
        "lineOwnershipMismatches": line,
    }


def reconstruct_expected_state_decisions(
    resolved: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    state: dict[tuple[str, str], dict[str, Any]] = {}
    decisions: list[dict[str, Any]] = []
    for row in resolved:
        scope_id = str(row["lineScope"]["lineScopeId"])
        explicit = explicit_fields(row["block"], row["element"])
        for field in ALL_STATE_FIELDS:
            key = (scope_id, field)
            decision = _expected_decision(row, field, field in explicit, state.get(key))
            decisions.append(decision)
            state[key] = _next_state(decision)
    return decisions


def _expected_decision(
    row: dict[str, Any],
    field: str,
    is_explicit: bool,
    prior: dict[str, Any] | None,
) -> dict[str, Any]:
    parsed = field_value(field, row["element"])
    missing = state_value_missing(field, parsed)
    if is_explicit:
        value = None if missing else canonical_state_value(field, parsed)
        kind = "explicit-absence" if missing else "explicit"
    elif prior is None:
        value = None
        kind = "explicit-absence"
    else:
        value = prior["value"]
        kind = "inherited-absence" if value is None else "inherited"
    return _decision_tuple(row, field, value, kind, prior)


def _decision_tuple(
    row: dict[str, Any],
    field: str,
    value: str | None,
    kind: str,
    prior: dict[str, Any] | None,
) -> dict[str, Any]:
    entity_id = str(row["entityId"])
    block_id = str(row["blockId"])
    scope = row["lineScope"]
    inherited = kind.startswith("inherited")
    source_fields: dict[str, Any] = {
        "field": field,
        "value": value,
        "sourceBlockId": block_id,
        "lineScopeId": scope["lineScopeId"],
        "lineId": scope["lineId"],
    }
    if inherited and prior is not None:
        source_fields.update({
            "predecessorBlockId": prior["latestBlockId"],
            "predecessorElementId": prior["latestElementId"],
            "predecessorLineScopeId": scope["lineScopeId"],
            "originBlockId": prior["originBlockId"],
            "originElementId": prior["originElementId"],
        })
    source_fields["lineStatePolicyId"] = LINE_STATE_POLICY_ID
    source_type, disposition = _classification(kind)
    required = field in REQUIRED_STATE_FIELDS
    return {
        "sourceEntityId": f"{entity_id}@{field}",
        "sourceType": source_type,
        "sourceFields": source_fields,
        "canonicalElementIds": [entity_id],
        "InputXMLElementIds": [entity_id],
        "CIISection": "ELEMENTS" if required else None,
        "projectionCardinality": "1_TO_1" if value is not None else "1_TO_0",
        "disposition": disposition,
        "field": field,
        "value": value,
        "blockId": block_id,
        "blockIndex": int(row["blockIndex"]),
        "entityId": entity_id,
        "lineScopeId": str(scope["lineScopeId"]),
        "lineId": str(scope["lineId"]),
        "expectedXmlAttribute": field if required else None,
        "expectedXmlValue": value if required else None,
    }


def _classification(kind: str) -> tuple[str, str]:
    values = {
        "explicit": ("PDF_INPUT_ECHO_EXPLICIT_FIELD", "EMIT_EXPLICIT_SOURCE_VALUE"),
        "inherited": ("PDF_INPUT_ECHO_INHERITANCE", "INHERIT_SAME_LINE_SCOPE"),
        "explicit-absence": (
            "PDF_INPUT_ECHO_EXPLICIT_ABSENCE",
            "RETAIN_EXPLICIT_ABSENCE_EVIDENCE",
        ),
        "inherited-absence": (
            "PDF_INPUT_ECHO_INHERITED_ABSENCE",
            "INHERIT_SAME_LINE_SCOPE_ABSENCE",
        ),
    }
    return values[kind]


def _next_state(decision: dict[str, Any]) -> dict[str, Any]:
    fields = decision["sourceFields"]
    inherited = decision["sourceType"] in {
        "PDF_INPUT_ECHO_INHERITANCE",
        "PDF_INPUT_ECHO_INHERITED_ABSENCE",
    }
    return {
        "value": decision["value"],
        "originBlockId": fields["originBlockId"] if inherited else decision["blockId"],
        "originElementId": fields["originElementId"] if inherited else decision["entityId"],
        "latestBlockId": decision["blockId"],
        "latestElementId": decision["entityId"],
    }


def _group_by_identity(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in records:
        grouped[str(row.get("sourceEntityId") or "")].append(row)
    return grouped


def _cardinality(
    expected: dict[str, dict[str, Any]],
    actual: dict[str, list[dict[str, Any]]],
    actual_count: int,
) -> dict[str, Any]:
    expected_ids = set(expected)
    actual_ids = set(actual)
    duplicate_ids = sorted(key for key, rows in actual.items() if len(rows) != 1)
    missing = sorted(expected_ids - actual_ids)
    extra = sorted(actual_ids - expected_ids)
    mismatches = [
        {"reason": "missing", "sourceEntityId": value} for value in missing
    ] + [
        {"reason": "extra", "sourceEntityId": value} for value in extra
    ] + [
        {"reason": "duplicate", "sourceEntityId": value, "count": len(actual[value])}
        for value in duplicate_ids
    ]
    return {
        "invariants": {
            "stateDecisionCountMismatchCount": abs(len(expected) - actual_count),
            "stateDecisionUniqueIdentityMismatchCount": abs(len(expected) - len(actual_ids)),
            "missingStateDecisionCount": len(missing),
            "extraStateDecisionCount": len(extra),
            "duplicateStateDecisionCount": sum(len(actual[value]) - 1 for value in duplicate_ids),
        },
        "mismatches": mismatches,
    }


def _semantic_mismatches(
    expected: dict[str, dict[str, Any]],
    actual: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    mismatches = []
    for source_id, expected_row in expected.items():
        rows = actual.get(source_id, [])
        if len(rows) != 1:
            continue
        actual_tuple = _semantic_tuple(rows[0])
        expected_tuple = {key: expected_row[key] for key in SEMANTIC_TUPLE_FIELDS}
        differences = _difference_paths(expected_tuple, actual_tuple)
        if differences:
            mismatches.append({"sourceEntityId": source_id, "differences": differences})
    return mismatches


def _semantic_tuple(record: dict[str, Any]) -> dict[str, Any]:
    return {key: record.get(key) for key in SEMANTIC_TUPLE_FIELDS}


def _difference_paths(expected: Any, actual: Any, prefix: str = "") -> list[str]:
    if isinstance(expected, dict) and isinstance(actual, dict):
        result: list[str] = []
        for key in sorted(set(expected) | set(actual)):
            path = f"{prefix}.{key}" if prefix else key
            if key not in expected or key not in actual:
                result.append(path)
            else:
                result.extend(_difference_paths(expected[key], actual[key], path))
        return result
    return [] if expected == actual else [prefix]


def _source_indexes(
    resolved: list[dict[str, Any]],
    expected: list[dict[str, Any]],
) -> dict[str, Any]:
    block = {}
    entity = {}
    for row in resolved:
        value = {
            "blockId": str(row["blockId"]),
            "blockIndex": int(row["blockIndex"]),
            "entityId": str(row["entityId"]),
            "lineScopeId": str(row["lineScope"]["lineScopeId"]),
            "lineId": str(row["lineScope"]["lineId"]),
        }
        block[value["blockId"]] = value
        entity[value["entityId"]] = value
    return {
        "block": block,
        "entity": entity,
        "decision": {row["sourceEntityId"]: row for row in expected},
    }


def _ownership_mismatches(
    actual: list[dict[str, Any]],
    expected: dict[str, dict[str, Any]],
    indexes: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    predecessor: list[dict[str, Any]] = []
    origin: list[dict[str, Any]] = []
    for record in actual:
        if record.get("sourceType") not in {
            "PDF_INPUT_ECHO_INHERITANCE",
            "PDF_INPUT_ECHO_INHERITED_ABSENCE",
        }:
            continue
        source_id = str(record.get("sourceEntityId") or "")
        expected_row = expected.get(source_id)
        fields = record.get("sourceFields") if isinstance(record.get("sourceFields"), dict) else {}
        predecessor.extend(_predecessor_issues(source_id, fields, expected_row, indexes))
        origin.extend(_origin_issues(source_id, fields, expected_row, indexes))
    return predecessor, origin


def _predecessor_issues(
    source_id: str,
    fields: dict[str, Any],
    expected: dict[str, Any] | None,
    indexes: dict[str, Any],
) -> list[dict[str, Any]]:
    if expected is None:
        return [{"sourceEntityId": source_id, "reason": "current-decision-unknown"}]
    block = indexes["block"].get(str(fields.get("predecessorBlockId") or ""))
    entity = indexes["entity"].get(str(fields.get("predecessorElementId") or ""))
    issues = []
    if block is None or entity is None:
        return [{"sourceEntityId": source_id, "reason": "predecessor-missing"}]
    if block is not entity:
        issues.append({"sourceEntityId": source_id, "reason": "predecessor-owner-disagrees"})
    if block["lineScopeId"] != expected["lineScopeId"]:
        issues.append({"sourceEntityId": source_id, "reason": "predecessor-cross-scope"})
    if block["blockIndex"] >= expected["blockIndex"]:
        issues.append({"sourceEntityId": source_id, "reason": "predecessor-not-earlier"})
    expected_fields = expected["sourceFields"]
    if (
        block["blockId"] != expected_fields.get("predecessorBlockId")
        or entity["entityId"] != expected_fields.get("predecessorElementId")
    ):
        issues.append({"sourceEntityId": source_id, "reason": "predecessor-not-latest"})
    return issues


def _origin_issues(
    source_id: str,
    fields: dict[str, Any],
    expected: dict[str, Any] | None,
    indexes: dict[str, Any],
) -> list[dict[str, Any]]:
    if expected is None:
        return [{"sourceEntityId": source_id, "reason": "current-decision-unknown"}]
    block = indexes["block"].get(str(fields.get("originBlockId") or ""))
    entity = indexes["entity"].get(str(fields.get("originElementId") or ""))
    if block is None or entity is None:
        return [{"sourceEntityId": source_id, "reason": "origin-missing"}]
    issues = []
    if block is not entity:
        issues.append({"sourceEntityId": source_id, "reason": "origin-owner-disagrees"})
    if block["lineScopeId"] != expected["lineScopeId"]:
        issues.append({"sourceEntityId": source_id, "reason": "origin-cross-scope"})
    expected_fields = expected["sourceFields"]
    if (
        block["blockId"] != expected_fields.get("originBlockId")
        or entity["entityId"] != expected_fields.get("originElementId")
    ):
        issues.append({"sourceEntityId": source_id, "reason": "origin-not-authoritative"})
    origin_id = f"{entity['entityId']}@{expected['field']}"
    origin_decision = indexes["decision"].get(origin_id)
    if origin_decision is None or origin_decision["sourceType"] not in {
        "PDF_INPUT_ECHO_EXPLICIT_FIELD",
        "PDF_INPUT_ECHO_EXPLICIT_ABSENCE",
    }:
        issues.append({"sourceEntityId": source_id, "reason": "origin-not-explicit"})
    elif origin_decision["value"] != fields.get("value"):
        issues.append({"sourceEntityId": source_id, "reason": "origin-value-mismatch"})
    return issues


def _source_xml_mismatches(
    expected: list[dict[str, Any]],
    elements: dict[str, ET._Element],
) -> list[dict[str, Any]]:
    mismatches = []
    for row in expected:
        attribute = row["expectedXmlAttribute"]
        if attribute is None:
            continue
        element = elements.get(row["entityId"])
        actual = None if element is None else element.get(attribute)
        if actual != row["expectedXmlValue"]:
            mismatches.append({
                "sourceEntityId": row["sourceEntityId"],
                "canonicalElementId": row["entityId"],
                "attribute": attribute,
                "expected": row["expectedXmlValue"],
                "actual": actual,
            })
    return mismatches


def _ledger_xml_mismatches(
    records: list[dict[str, Any]],
    elements: dict[str, ET._Element],
) -> list[dict[str, Any]]:
    mismatches = []
    for row in records:
        fields = row.get("sourceFields") if isinstance(row.get("sourceFields"), dict) else {}
        field = str(fields.get("field") or "")
        if field not in REQUIRED_STATE_FIELDS:
            continue
        owners = row.get("canonicalElementIds") or []
        if len(owners) != 1 or str(owners[0]) not in elements:
            continue
        actual = elements[str(owners[0])].get(field)
        if actual != fields.get("value"):
            mismatches.append({
                "sourceEntityId": row.get("sourceEntityId"),
                "canonicalElementId": str(owners[0]),
                "field": field,
                "ledgerValue": fields.get("value"),
                "xmlValue": actual,
            })
    return mismatches


def _line_ownership_mismatches(
    records: list[dict[str, Any]],
    expected: dict[str, dict[str, Any]],
    elements: dict[str, ET._Element],
) -> list[dict[str, Any]]:
    mismatches = []
    for row in records:
        source_id = str(row.get("sourceEntityId") or "")
        expected_row = expected.get(source_id)
        if expected_row is None:
            continue
        fields = row.get("sourceFields") if isinstance(row.get("sourceFields"), dict) else {}
        element = elements.get(expected_row["entityId"])
        xml_line = None if element is None else element.get("LINE")
        if (
            fields.get("lineScopeId") != expected_row["lineScopeId"]
            or fields.get("lineId") != expected_row["lineId"]
            or xml_line != expected_row["lineId"]
        ):
            mismatches.append({
                "sourceEntityId": source_id,
                "expectedLineScopeId": expected_row["lineScopeId"],
                "actualLineScopeId": fields.get("lineScopeId"),
                "expectedLineId": expected_row["lineId"],
                "ledgerLineId": fields.get("lineId"),
                "xmlLineId": xml_line,
            })
    return mismatches


def _stable_hash(value: Any) -> str:
    payload = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


__all__ = [
    "SEMANTIC_TUPLE_FIELDS",
    "STATE_RECORD_TYPES",
    "reconstruct_expected_state_decisions",
    "verify_state_decision_closure",
]
