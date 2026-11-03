#!/usr/bin/env python3
"""Validate and bind an accepted TE-013 ENFORCED result for strict PSI116 intake."""
from __future__ import annotations

from copy import deepcopy
from typing import Any

from .psi116_common import exact_dict_equal, prefixed_sha256, stable_json_bytes

BUNDLE_KEYS = (
    "schema", "operatingMode", "profile", "evaluatedAt", "projectId", "zoneId",
    "nodePlanHash", "occurrencePlanHash", "serializationPlanHash",
    "branchProjectionId", "projectionKind", "xmlHash", "traceHash",
)
NODE_PLAN_KEYS = (
    "schema", "projectId", "zoneId", "sourceInventoryHash", "logicalTopologyHash",
    "sequencePlanHash", "baseRegistrySnapshotHash", "configHash", "logicalNodes",
    "emittedOccurrences", "reservedOccurrences", "rawPortMappings", "componentProjection",
)
TOPOLOGY_INDEX_KEYS = (
    "schema", "projectId", "zoneId", "sourceInventoryHash", "logicalTopologyHash",
    "occurrencePlanHash", "nodePlanHash", "historyMatchResultHash", "sourceEntities",
    "sourcePorts", "logicalNodes", "logicalEdges", "occurrences", "histories",
    "engineeringNumbers", "sourceBranches", "canonicalLines", "aliases",
    "sourceToLogical", "logicalToSource", "logicalToOccurrences", "occurrenceToLogical",
    "emittedTraceOccurrences", "unresolvedReferences", "conflicts", "coverage",
)
RESULT_KEYS = (
    "schema", "operatingMode", "requestedWriter", "projectId", "zoneId",
    "selectedLogicalTopologyHash", "topologyNormalizationHash", "approvedActionHash",
    "normalizationApprovalHash", "occurrencePlanHash", "historyMatchResultHash",
    "allocationResultHash", "bootstrapResultHash", "currentRegistrySnapshotHash",
    "registryPatchHash", "configHash", "nodePlanHash", "canonicalBundleHash",
    "sequentialBundleHash", "topologyIndexHash", "canonicalTraceLedgerHash",
    "sequentialTraceLedgerHash", "preprocessAuditHash", "parityReportHash",
    "selectionHash", "productionBundleHash", "proposedBundleHash", "validation",
    "ciiConversion",
)


class ProjectionBoundaryError(RuntimeError):
    """Raised when the supplied TE-013 result cannot cross the proof boundary."""


AUDIT_METADATA_KEYS = {
    "evaluatedAt", "generatedAt", "createdAt", "updatedAt", "runtimeMs",
    "durationMs", "displayUrl", "runUrl", "workflowRunId", "workflowRunAttempt",
}


def semantic_hash(value: Any) -> str:
    return prefixed_sha256(stable_json_bytes(_strip_audit_metadata(value)))


def _strip_audit_metadata(value: Any) -> Any:
    if isinstance(value, list):
        return [_strip_audit_metadata(item) for item in value]
    if isinstance(value, dict):
        return {
            key: _strip_audit_metadata(item)
            for key, item in value.items() if key not in AUDIT_METADATA_KEYS
        }
    return value


def validate_te013_production_result(result: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise ProjectionBoundaryError("TE-013 production result must be a JSON object.")
    _require_root(result)
    node_plan = _require_pass_object(result, "nodePlan", "TopoNodePlan.v1")
    topology = _require_pass_object(result, "topologyIndex", "TopoTopologyIndex.v1")
    canonical = _require_bundle(result.get("canonicalBundle"), "CANONICAL")
    sequential = _require_bundle(result.get("sequentialBundle"), "SOURCE_SEQUENTIAL")
    selected = _require_bundle(result.get("productionBundle"), _selected_kind(result))
    _verify_bundle_hashes(canonical)
    _verify_bundle_hashes(sequential)
    _verify_node_plan(node_plan)
    _verify_topology_index(topology, node_plan)
    _verify_parity(result, canonical, sequential, node_plan)
    _verify_registry_chain(result, node_plan, selected)
    _verify_selection(result, selected)
    _verify_occurrences(result, node_plan, topology, selected)
    _verify_result_hash(result)
    return {
        "schema": "Te013ProductionBoundaryEvidence.v1",
        "productionResultHash": result["productionResultHash"],
        "selectedBundleHash": selected["bundleHash"],
        "selectedXmlHash": selected["xmlHash"],
        "selectedTraceHash": selected["traceHash"],
        "nodePlanHash": node_plan["nodePlanHash"],
        "topologyIndexHash": topology["topologyIndexHash"],
        "registrySnapshotHash": result["currentRegistrySnapshotHash"],
        "registryPatchHash": result["registryPatchHash"],
        "requestedWriter": result["requestedWriter"],
        "projectionKind": selected["projectionKind"],
        "xmlBytes": selected["xmlText"].encode("utf-8"),
        "trace": deepcopy(selected["trace"]),
        "nodePlan": deepcopy(node_plan),
        "topologyIndex": deepcopy(topology),
    }


def _require_root(result: dict[str, Any]) -> None:
    checks = (
        (result.get("schema") == "TopoEnrichedXmlProductionResult.v1", "schema"),
        (result.get("operatingMode") == "ENFORCED", "operatingMode"),
        ((result.get("validation") or {}).get("status") == "PASS", "validation.status"),
        ((result.get("selection") or {}).get("authority") == "STRICT_ENFORCED", "selection.authority"),
        (result.get("proposedBundle") is None, "proposedBundle"),
        (isinstance(result.get("productionBundle"), dict), "productionBundle"),
        (result.get("xmlText") == (result.get("productionBundle") or {}).get("xmlText"), "xmlText alias"),
        (result.get("trace") == (result.get("productionBundle") or {}).get("trace"), "trace alias"),
        ((result.get("ciiConversion") or {}).get("status") == "NOT_EVALUATED", "ciiConversion.status"),
    )
    failed = [name for passed, name in checks if not passed]
    if failed:
        raise ProjectionBoundaryError(f"TE-013 production boundary root checks failed: {failed}.")


def _require_pass_object(result: dict[str, Any], field: str, schema: str) -> dict[str, Any]:
    value = result.get(field)
    if not isinstance(value, dict) or value.get("schema") != schema:
        raise ProjectionBoundaryError(f"TE-013 {field} must be {schema}.")
    if (value.get("validation") or {}).get("status") != "PASS":
        raise ProjectionBoundaryError(f"TE-013 {field} validation must be PASS.")
    return value


def _require_bundle(value: Any, projection_kind: str) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("schema") != "topo-enriched-xml-writer-bundle/v1":
        raise ProjectionBoundaryError("TE-013 selected writer bundle is missing or has wrong schema.")
    checks = (
        value.get("operatingMode") == "ENFORCED",
        value.get("profile") == "STRICT_PSI",
        value.get("projectionKind") == projection_kind,
        value.get("generated") is True,
        (value.get("validation") or {}).get("status") == "PASS",
        isinstance(value.get("trace"), list),
        isinstance(value.get("xmlText"), str) and bool(value.get("xmlText")),
        int((value.get("summary") or {}).get("writerSideAllocations", -1)) == 0,
    )
    if not all(checks):
        raise ProjectionBoundaryError(f"TE-013 {projection_kind} bundle is not a strict ENFORCED PASS bundle.")
    return value


def _selected_kind(result: dict[str, Any]) -> str:
    writer = result.get("requestedWriter")
    if writer == "CANONICAL":
        return "CANONICAL"
    if writer == "SEQUENTIAL":
        return "SOURCE_SEQUENTIAL"
    raise ProjectionBoundaryError(f"TE-013 requestedWriter {writer!r} is invalid.")


def _verify_bundle_hashes(bundle: dict[str, Any]) -> None:
    xml_hash = prefixed_sha256(bundle["xmlText"].encode("utf-8"))
    trace_hash = semantic_hash(bundle["trace"])
    bundle_hash = semantic_hash({key: bundle.get(key) for key in BUNDLE_KEYS})
    mismatches = _mismatches(bundle, {
        "xmlHash": xml_hash, "traceHash": trace_hash, "bundleHash": bundle_hash,
    })
    if mismatches:
        raise ProjectionBoundaryError(f"TE-013 bundle hash mismatch: {mismatches}.")
    summary = bundle.get("summary") or {}
    if summary.get("traceCount") != len(bundle["trace"]) or summary.get("xmlNodeCount") != len(bundle["trace"]):
        raise ProjectionBoundaryError("TE-013 bundle trace/XML summary cardinality is stale.")


def _verify_node_plan(node_plan: dict[str, Any]) -> None:
    actual = semantic_hash({key: node_plan.get(key) for key in NODE_PLAN_KEYS})
    if node_plan.get("nodePlanHash") != actual:
        raise ProjectionBoundaryError("TE-013 nodePlanHash does not match the immutable node plan.")
    emitted = node_plan.get("emittedOccurrences") or []
    reserved = node_plan.get("reservedOccurrences") or []
    ids = [str(row.get("occurrenceId") or "") for row in emitted + reserved]
    if not ids or any(not value for value in ids) or len(ids) != len(set(ids)):
        raise ProjectionBoundaryError("TE-013 node plan occurrence identities are blank or duplicated.")
    for row in emitted + reserved:
        if not isinstance(row.get("engineeringNodeNumber"), int) or row["engineeringNodeNumber"] <= 0:
            raise ProjectionBoundaryError("Every TE-013 emitted/reserved occurrence requires an explicit positive node number.")


def _verify_topology_index(topology: dict[str, Any], node_plan: dict[str, Any]) -> None:
    actual = semantic_hash({key: topology.get(key) for key in TOPOLOGY_INDEX_KEYS})
    if topology.get("topologyIndexHash") != actual:
        raise ProjectionBoundaryError("TE-013 topologyIndexHash does not match topology evidence.")
    if topology.get("nodePlanHash") != node_plan.get("nodePlanHash"):
        raise ProjectionBoundaryError("TE-013 topology index is stale against the node plan.")
    if topology.get("unresolvedReferences") or topology.get("conflicts"):
        raise ProjectionBoundaryError("TE-013 topology index contains unresolved references or conflicts.")


def _verify_parity(
    result: dict[str, Any],
    canonical: dict[str, Any],
    sequential: dict[str, Any],
    node_plan: dict[str, Any],
) -> None:
    parity = result.get("parityReport")
    if not isinstance(parity, dict) or parity.get("schema") != "PsiWriterParityReport.v2":
        raise ProjectionBoundaryError("TE-013 parity report is missing.")
    actual = semantic_hash({key: value for key, value in parity.items() if key != "parityReportHash"})
    if parity.get("parityReportHash") != actual:
        raise ProjectionBoundaryError("TE-013 parityReportHash is stale.")
    if (parity.get("validation") or {}).get("status") != "PASS" or parity.get("differences"):
        raise ProjectionBoundaryError("TE-013 writer parity is not exact.")
    if parity.get("nodePlanHash") != node_plan.get("nodePlanHash"):
        raise ProjectionBoundaryError("TE-013 parity report node-plan root is stale.")
    for name, bundle in (("canonical", canonical), ("sequential", sequential)):
        side = parity.get(name) or {}
        for field in ("bundleHash", "xmlHash", "traceHash"):
            if side.get(field) != bundle.get(field):
                raise ProjectionBoundaryError(f"TE-013 parity {name}.{field} is stale.")


def _verify_registry_chain(
    result: dict[str, Any],
    node_plan: dict[str, Any],
    selected: dict[str, Any],
) -> None:
    audit = result.get("preprocessAudit")
    selection = result.get("selection") or {}
    ref = selection.get("registryEvidenceRef")
    audit_ref = selection.get("preprocessAuditRef")
    if not all(isinstance(value, dict) for value in (audit, ref, audit_ref)):
        raise ProjectionBoundaryError("TE-013 preprocess audit and evidence references are required.")
    audit_semantic = {
        key: value for key, value in audit.items()
        if key not in {"preprocessAuditHash", "evaluatedAt"}
    }
    if audit.get("preprocessAuditHash") != semantic_hash(audit_semantic):
        raise ProjectionBoundaryError("TE-013 preprocessAuditHash is stale.")
    audit_ref_semantic = {key: value for key, value in audit_ref.items() if key != "artifactHash"}
    if audit_ref.get("artifactHash") != semantic_hash(audit_ref_semantic):
        raise ProjectionBoundaryError("TE-013 preprocess audit reference hash is stale.")
    if audit_ref.get("preprocessAuditHash") != audit.get("preprocessAuditHash"):
        raise ProjectionBoundaryError("TE-013 preprocess audit reference is stale.")
    ref_semantic = {key: value for key, value in ref.items() if key != "artifactHash"}
    if ref.get("artifactHash") != semantic_hash(ref_semantic):
        raise ProjectionBoundaryError("TE-013 registry evidence reference hash is stale.")
    bindings = {
        "nodePlanHash": node_plan.get("nodePlanHash"),
        "currentRegistrySnapshotHash": result.get("currentRegistrySnapshotHash"),
        "bootstrapResultHash": result.get("bootstrapResultHash"),
        "registryPatchHash": result.get("registryPatchHash"),
    }
    for field, expected in bindings.items():
        actual = audit.get(field) if field == "nodePlanHash" else ref.get(field)
        if actual != expected:
            raise ProjectionBoundaryError(f"TE-013 registry/audit root {field} is stale.")
    if audit.get("serializationPlanHash") != selected.get("serializationPlanHash"):
        raise ProjectionBoundaryError("TE-013 preprocess audit serialization root is stale.")


def _verify_selection(result: dict[str, Any], selected: dict[str, Any]) -> None:
    selection = result.get("selection") or {}
    if selection.get("productionBundle") != selected or selection.get("selectedBundleHash") != selected.get("bundleHash"):
        raise ProjectionBoundaryError("TE-013 selection contains a substituted production bundle.")
    semantic = {
        "schema": selection.get("schema"),
        "operatingMode": selection.get("operatingMode"),
        "requestedWriter": selection.get("requestedWriter"),
        "authority": selection.get("authority"),
        "selectedBundleHash": selection.get("selectedBundleHash"),
        "proposedBundleHash": selection.get("proposedBundleHash"),
        "strictDiagnosticStatus": selection.get("strictDiagnosticStatus"),
        "parityReportHash": selection.get("parityReportHash"),
        "parityError": selection.get("parityError"),
        "preprocessAuditHash": _reference_hash(selection.get("preprocessAuditRef")),
        "registryEvidenceHash": _reference_hash(selection.get("registryEvidenceRef")),
        "fallbackApplied": selection.get("fallbackApplied"),
        "validation": selection.get("validation"),
    }
    if selection.get("selectionHash") != semantic_hash(semantic):
        raise ProjectionBoundaryError("TE-013 selectionHash is stale.")
    if selection.get("fallbackApplied") is not False:
        raise ProjectionBoundaryError("TE-013 selection reports fallback application.")


def _verify_occurrences(
    result: dict[str, Any],
    node_plan: dict[str, Any],
    topology: dict[str, Any],
    selected: dict[str, Any],
) -> None:
    emitted = node_plan.get("emittedOccurrences") or []
    reserved = node_plan.get("reservedOccurrences") or []
    emitted_by_id = {str(row.get("occurrenceId") or ""): row for row in emitted}
    reserved_ids = {str(row.get("occurrenceId") or "") for row in reserved}
    trace = selected.get("trace") or []
    trace_ids = [str(row.get("occurrenceId") or "") for row in trace]
    if set(trace_ids) != set(emitted_by_id) or len(trace_ids) != len(set(trace_ids)):
        raise ProjectionBoundaryError("TE-013 selected trace does not exactly cover emitted occurrences.")
    if set(trace_ids) & reserved_ids:
        raise ProjectionBoundaryError("TE-013 reserved occurrence appears in selected trace.")
    for row in trace:
        planned = emitted_by_id[row["occurrenceId"]]
        for field in ("logicalNodeId", "componentProjectionId", "engineeringNodeNumber"):
            if row.get(field) != planned.get(field):
                raise ProjectionBoundaryError(f"TE-013 trace/node-plan {field} mismatch for {row['occurrenceId']}.")
    topology_occurrences = _topology_occurrence_index(topology)
    for row in trace:
        topo = topology_occurrences.get(row["occurrenceId"])
        if topo is None:
            raise ProjectionBoundaryError(f"TE-013 topology index omits occurrence {row['occurrenceId']}.")
        for field in ("logicalNodeId", "engineeringNodeNumber", "sourceEntityId"):
            if field in topo and topo.get(field) != row.get(field):
                raise ProjectionBoundaryError(f"TE-013 topology/trace {field} mismatch for {row['occurrenceId']}.")
    if selected.get("nodePlanHash") != node_plan.get("nodePlanHash"):
        raise ProjectionBoundaryError("Selected TE-013 bundle is stale against the node plan.")
    if selected.get("occurrencePlanHash") != result.get("occurrencePlanHash"):
        raise ProjectionBoundaryError("Selected TE-013 bundle occurrence-plan root is stale.")


def _verify_result_hash(result: dict[str, Any]) -> None:
    semantic = {
        "schema": result.get("schema"),
        "operatingMode": result.get("operatingMode"),
        "requestedWriter": result.get("requestedWriter"),
        "projectId": result.get("projectId"),
        "zoneId": result.get("zoneId"),
        "selectedLogicalTopologyHash": result.get("selectedLogicalTopologyHash"),
        "topologyNormalizationHash": result.get("topologyNormalizationHash"),
        "approvedActionHash": result.get("approvedActionHash"),
        "normalizationApprovalHash": result.get("normalizationApprovalHash"),
        "occurrencePlanHash": result.get("occurrencePlanHash"),
        "historyMatchResultHash": result.get("historyMatchResultHash"),
        "allocationResultHash": result.get("allocationResultHash"),
        "bootstrapResultHash": result.get("bootstrapResultHash"),
        "currentRegistrySnapshotHash": result.get("currentRegistrySnapshotHash"),
        "registryPatchHash": result.get("registryPatchHash"),
        "configHash": result.get("configHash"),
        "nodePlanHash": (result.get("nodePlan") or {}).get("nodePlanHash", ""),
        "canonicalBundleHash": (result.get("canonicalBundle") or {}).get("bundleHash", ""),
        "sequentialBundleHash": (result.get("sequentialBundle") or {}).get("bundleHash", ""),
        "topologyIndexHash": (result.get("topologyIndex") or {}).get("topologyIndexHash", ""),
        "canonicalTraceLedgerHash": (result.get("canonicalTraceLedger") or {}).get("traceLedgerHash", ""),
        "sequentialTraceLedgerHash": (result.get("sequentialTraceLedger") or {}).get("traceLedgerHash", ""),
        "preprocessAuditHash": (result.get("preprocessAudit") or {}).get("preprocessAuditHash", ""),
        "parityReportHash": (result.get("parityReport") or {}).get("parityReportHash", ""),
        "selectionHash": (result.get("selection") or {}).get("selectionHash", ""),
        "productionBundleHash": (result.get("productionBundle") or {}).get("bundleHash", ""),
        "proposedBundleHash": (result.get("proposedBundle") or {}).get("bundleHash", ""),
        "validation": result.get("validation"),
        "ciiConversion": result.get("ciiConversion"),
    }
    if result.get("productionResultHash") != semantic_hash(semantic):
        raise ProjectionBoundaryError("TE-013 productionResultHash is stale.")


def _topology_occurrence_index(topology: dict[str, Any]) -> dict[str, dict[str, Any]]:
    rows = topology.get("occurrences") or []
    if isinstance(rows, dict):
        return {str(key): value for key, value in rows.items() if isinstance(value, dict)}
    return {
        str(row.get("occurrenceId") or ""): row
        for row in rows if isinstance(row, dict) and row.get("occurrenceId")
    }


def _reference_hash(value: Any) -> str:
    return "" if not isinstance(value, dict) else str(
        value.get("artifactHash") or value.get("hash") or value.get("refHash") or ""
    ).strip()


def _mismatches(value: dict[str, Any], expected: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        field: {"expected": target, "actual": value.get(field)}
        for field, target in expected.items() if value.get(field) != target
    }


__all__ = [
    "ProjectionBoundaryError", "semantic_hash", "validate_te013_production_result",
]
