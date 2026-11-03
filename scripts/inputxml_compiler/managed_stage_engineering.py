#!/usr/bin/env python3
"""Engineering projection reconciliation against exact managed-stage components."""
from __future__ import annotations

import math
from typing import Any

from .base import DecisionLedger
from .managed_stage_diagnostics import block
from .managed_stage_policy import component_policy


def verify_engineering_projection(
    result: dict[str, Any],
    source: dict[str, Any],
    topology: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, Any]:
    artifact = result["engineeringProjection"]
    records = _object_array(artifact.get("records"), "engineeringProjection.records", ledger)
    ids = [str(row.get("sourceEntityId") or "") for row in records]
    if not all(ids) or len(ids) != len(set(ids)):
        _engineering_block(ledger, "Engineering records contain duplicate or empty source identities.")
    components = {
        entity_id: row
        for entity_id, row in source["entityById"].items()
        if row["sourceType"] != "BRANCH"
    }
    missing = sorted(set(components) - set(ids))
    extra = sorted(set(ids) - set(components))
    if missing or extra:
        block(
            ledger,
            "MANAGED_STAGE_ENGINEERING_RECORD_MISSING",
            "Engineering projection does not close over source components.",
            "engineeringProjection.records",
            missing=missing,
            extra=extra,
        )
    by_id = {str(row["sourceEntityId"]): row for row in records}
    for entity_id, component in components.items():
        _verify_record(component, by_id[entity_id], ledger)
    _verify_supports(artifact, topology, source, ledger)
    _verify_rigids(artifact, topology, source, ledger)
    ledger.add(
        source_entity_id="managed-stage-engineering-closure",
        source_type="MANAGED_STAGE_ENGINEERING_CLOSURE",
        source_fields={
            "recordCount": len(records),
            "supportCount": len(artifact.get("supports") or []),
            "deferredSupportCount": len(artifact.get("deferredSupports") or []),
            "rigidCount": len(artifact.get("rigids") or []),
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "every source component has one exact engineering projection record",
            "support and rigid engineering records reconcile to canonical ownership",
            "missing rigid weight remains structured absence and cannot become numeric zero",
        ],
    )
    return {"recordsByEntity": by_id}


def _verify_record(
    component: dict[str, Any],
    record: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    source_path = component["sourcePath"]
    expected_path = _record_path(source_path)
    if record.get("sourcePath") != expected_path:
        _engineering_block(ledger, f"Engineering record path differs for {source_path}.")
    record_type = str(record.get("componentType") or "").strip().upper()
    source_type = str(component["sourceType"] or "").strip().upper()
    policy = component_policy(source_type)
    if component_policy(record_type).category != policy.category:
        _engineering_block(ledger, f"Engineering component type differs for {source_path}.")
    if not isinstance(record.get("attrs"), dict) or not isinstance(record.get("resolved"), dict):
        _engineering_block(ledger, f"Engineering record {source_path} lacks attrs/resolved objects.")
    unresolved = (
        record.get("needsReview") is True
        or str(record.get("status") or "").lower() in {"unresolved", "error", "blocked"}
    )
    if unresolved and policy.candidate_policy != "BLOCKED_WITH_CANDIDATE":
        block(
            ledger,
            "MANAGED_STAGE_ENGINEERING_RECORD_MISSING",
            f"Engineering record {source_path} remains unresolved or under review.",
            source_path,
        )
    enriched = component.get("enrichedAttributes") or {}
    if enriched and not _compatible_enriched(enriched, record):
        block(
            ledger,
            "MANAGED_STAGE_ENGINEERING_CONFLICT",
            f"Source enriched evidence conflicts with the producer engineering record for {source_path}.",
            source_path,
        )


def _verify_supports(
    artifact: dict[str, Any],
    topology: dict[str, Any],
    source: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    supports = _object_array(artifact.get("supports"), "engineeringProjection.supports", ledger)
    deferred = _object_array(
        artifact.get("deferredSupports"),
        "engineeringProjection.deferredSupports",
        ledger,
    )
    canonical_sources = {
        str(source_id)
        for support in topology["collections"]["supports"]
        for source_id in support.get("sourceEntityIds") or []
    }
    projected_sources = {
        str(source_id)
        for support in supports
        for source_id in support.get("sourceEntityIds") or []
    }
    if projected_sources != canonical_sources:
        block(
            ledger,
            "MANAGED_STAGE_SUPPORT_OWNERSHIP_UNRESOLVED",
            "Engineering and canonical support source populations differ.",
            "engineeringProjection.supports",
        )
    deferred_ids = [str(row.get("sourceEntityId") or "") for row in deferred]
    if not all(deferred_ids) or len(deferred_ids) != len(set(deferred_ids)):
        block(
            ledger,
            "MANAGED_STAGE_SUPPORT_OWNERSHIP_UNRESOLVED",
            "Deferred support records contain duplicate or empty source IDs.",
            "engineeringProjection.deferredSupports",
        )
    for row in deferred:
        entity_id = str(row["sourceEntityId"])
        entity = source["entityById"].get(entity_id)
        policy = row.get("policy") or {}
        if not entity or component_policy(entity["sourceType"]).category != "SUPPORT":
            block(
                ledger,
                "MANAGED_STAGE_SAFE_NONPROJECTION_UNPROVEN",
                "Deferred support does not reference a source support entity.",
                str(row.get("sourcePath") or entity_id),
            )
        if policy.get("disposition") != "DEFER_SUPPORT" or not str(policy.get("authority") or ""):
            block(
                ledger,
                "MANAGED_STAGE_SAFE_NONPROJECTION_UNPROVEN",
                "Deferred support lacks explicit non-restraint policy authority.",
                entity["sourcePath"],
            )
        if _has_stress_evidence(entity.get("attributes") or {}, entity.get("enrichedAttributes") or {}):
            block(
                ledger,
                "MANAGED_STAGE_SAFE_NONPROJECTION_UNPROVEN",
                "Deferred support contains hidden stress/restraint evidence.",
                entity["sourcePath"],
            )


def _verify_rigids(
    artifact: dict[str, Any],
    topology: dict[str, Any],
    source: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    rigids = _object_array(artifact.get("rigids"), "engineeringProjection.rigids", ledger)
    canonical = topology["collections"]["rigids"]
    source_ids = [str(row.get("sourceEntityId") or "") for row in rigids]
    canonical_ids = [str(row.get("sourceEntityId") or "") for row in canonical]
    if source_ids != canonical_ids:
        block(
            ledger,
            "MANAGED_STAGE_RIGID_OWNERSHIP_UNRESOLVED",
            "Engineering and canonical rigid populations differ.",
            "engineeringProjection.rigids",
        )
    canonical_by_source = {str(row.get("sourceEntityId") or ""): row for row in canonical}
    for row in rigids:
        entity_id = str(row.get("sourceEntityId") or "")
        if entity_id not in source["entityById"]:
            block(
                ledger,
                "MANAGED_STAGE_RIGID_OWNERSHIP_UNRESOLVED",
                "Engineering rigid references a missing source entity.",
                entity_id,
            )
        authority = str(row.get("weightAuthority") or "")
        weight = row.get("weightKg")
        if authority in {"", "MISSING"} or not isinstance(weight, (int, float)) or not math.isfinite(weight) or weight <= 0:
            block(
                ledger,
                "MANAGED_STAGE_RIGID_OWNERSHIP_UNRESOLVED",
                "Engineering rigid lacks an explicit positive weight and authority.",
                source["entityById"][entity_id]["sourcePath"],
            )
        canonical_row = canonical_by_source.get(entity_id) or {}
        if canonical_row.get("weightKg") != weight or canonical_row.get("weightAuthority") != authority:
            block(
                ledger,
                "MANAGED_STAGE_RIGID_OWNERSHIP_UNRESOLVED",
                "Engineering and canonical rigid weight evidence differ.",
                source["entityById"][entity_id]["sourcePath"],
            )


def _compatible_enriched(enriched: dict[str, Any], record: dict[str, Any]) -> bool:
    attrs = record.get("attrs") or {}
    resolved = record.get("resolved") or {}
    checks = (
        ("lineNo", (record.get("branchName"), attrs.get("LINE"), attrs.get("LINE_ID"))),
        ("pipeOdMm", (resolved.get("odMm"), attrs.get("OD"), attrs.get("DIAMETER"))),
        ("wallThicknessMm", (resolved.get("wallMm"), attrs.get("WTHK"), attrs.get("WTXX"))),
        ("materialCode", (resolved.get("materialCode"), attrs.get("MESC"))),
    )
    for key, candidates in checks:
        if key not in enriched or enriched[key] in (None, ""):
            continue
        present = [value for value in candidates if value not in (None, "")]
        if present and not any(_same_value(enriched[key], value) for value in present):
            return False
    return True


def _same_value(left: Any, right: Any) -> bool:
    try:
        return float(left) == float(right)
    except (TypeError, ValueError):
        return str(left).strip() == str(right).strip()


def _record_path(source_path: str) -> list[Any]:
    branch_text, child_text = source_path.split(".children[", 1)
    branch_index = int(branch_text.rsplit("[", 1)[1].rstrip("]"))
    child_index = int(child_text.rstrip("]"))
    return [branch_index, "children", child_index]


def _has_stress_evidence(attributes: dict[str, Any], enriched: dict[str, Any]) -> bool:
    keys = {
        "SUPPORT_KIND", "SUPPORT_TYPE", "CMPSUPTYPE", "MDSSUPPTYPE",
        "NODETYPE", "NODESTIFF", "RESTRAINT", "RESTRAINTS",
    }
    for source in (attributes, enriched):
        for key in keys:
            value = source.get(key)
            if value not in (None, "", 0, "0", [], {}):
                return True
    return False


def _object_array(value: Any, name: str, ledger: DecisionLedger) -> list[dict[str, Any]]:
    if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
        block(
            ledger,
            "MANAGED_STAGE_ARTIFACT_SCHEMA_INVALID",
            f"{name} must be an object array.",
            name,
        )
    return value


def _engineering_block(ledger: DecisionLedger, message: str) -> None:
    block(
        ledger,
        "MANAGED_STAGE_ENGINEERING_CONFLICT",
        message,
        "engineeringProjection",
    )


__all__ = ["verify_engineering_projection"]
