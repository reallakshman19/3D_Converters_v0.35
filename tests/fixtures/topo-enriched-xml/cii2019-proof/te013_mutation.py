"""Test-only exact TE-013 hash rebinding for adversarial selected-bundle mutations."""
from __future__ import annotations

from copy import deepcopy
from typing import Any

from scripts.inputxml_compiler.psi116_te013_evidence import (
    BUNDLE_KEYS,
    semantic_hash,
)
from scripts.inputxml_compiler.psi116_common import prefixed_sha256


def rebind_selected_bundle(
    source: dict[str, Any],
    *,
    xml_text: str | None = None,
    trace: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    result = deepcopy(source)
    side_name = "canonicalBundle" if result["requestedWriter"] == "CANONICAL" else "sequentialBundle"
    parity_side = "canonical" if side_name == "canonicalBundle" else "sequential"
    bundle = result[side_name]
    if xml_text is not None:
        bundle["xmlText"] = xml_text
    if trace is not None:
        bundle["trace"] = deepcopy(trace)
    bundle["xmlHash"] = prefixed_sha256(bundle["xmlText"].encode("utf-8"))
    bundle["traceHash"] = semantic_hash(bundle["trace"])
    bundle["bundleHash"] = semantic_hash({key: bundle.get(key) for key in BUNDLE_KEYS})
    summary = bundle["summary"]
    summary["traceCount"] = len(bundle["trace"])
    summary["xmlNodeCount"] = len(bundle["trace"])
    summary["emittedOccurrenceCount"] = len(bundle["trace"])

    result["productionBundle"] = deepcopy(bundle)
    result["xmlText"] = bundle["xmlText"]
    result["trace"] = deepcopy(bundle["trace"])

    parity = result["parityReport"]
    parity[parity_side]["bundleHash"] = bundle["bundleHash"]
    parity[parity_side]["xmlHash"] = bundle["xmlHash"]
    parity[parity_side]["traceHash"] = bundle["traceHash"]
    parity[parity_side]["emittedOccurrenceCount"] = len(bundle["trace"])
    parity["parityReportHash"] = semantic_hash({
        key: value for key, value in parity.items() if key != "parityReportHash"
    })

    audit = result["preprocessAudit"]
    audit[f"{parity_side}BundleHash"] = bundle["bundleHash"]
    audit_semantic = {
        key: value for key, value in audit.items()
        if key not in {"preprocessAuditHash", "evaluatedAt"}
    }
    audit["preprocessAuditHash"] = semantic_hash(audit_semantic)

    selection = result["selection"]
    audit_ref = selection["preprocessAuditRef"]
    audit_ref["preprocessAuditHash"] = audit["preprocessAuditHash"]
    audit_ref["artifactHash"] = semantic_hash({
        key: value for key, value in audit_ref.items() if key != "artifactHash"
    })
    selection["selectedBundleHash"] = bundle["bundleHash"]
    selection["productionBundle"] = deepcopy(bundle)
    selection["parityReport"] = deepcopy(parity)
    selection["parityReportHash"] = parity["parityReportHash"]
    selection["selectionHash"] = semantic_hash(_selection_semantic(selection))

    result["productionResultHash"] = semantic_hash(_result_semantic(result))
    return result


def _selection_semantic(value: dict[str, Any]) -> dict[str, Any]:
    def ref_hash(row):
        return str((row or {}).get("artifactHash") or (row or {}).get("hash") or "")
    return {
        "schema": value.get("schema"),
        "operatingMode": value.get("operatingMode"),
        "requestedWriter": value.get("requestedWriter"),
        "authority": value.get("authority"),
        "selectedBundleHash": value.get("selectedBundleHash"),
        "proposedBundleHash": value.get("proposedBundleHash"),
        "strictDiagnosticStatus": value.get("strictDiagnosticStatus"),
        "parityReportHash": value.get("parityReportHash"),
        "parityError": value.get("parityError"),
        "preprocessAuditHash": ref_hash(value.get("preprocessAuditRef")),
        "registryEvidenceHash": ref_hash(value.get("registryEvidenceRef")),
        "fallbackApplied": value.get("fallbackApplied"),
        "validation": value.get("validation"),
    }


def _result_semantic(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": value.get("schema"), "operatingMode": value.get("operatingMode"),
        "requestedWriter": value.get("requestedWriter"), "projectId": value.get("projectId"),
        "zoneId": value.get("zoneId"),
        "selectedLogicalTopologyHash": value.get("selectedLogicalTopologyHash"),
        "topologyNormalizationHash": value.get("topologyNormalizationHash"),
        "approvedActionHash": value.get("approvedActionHash"),
        "normalizationApprovalHash": value.get("normalizationApprovalHash"),
        "occurrencePlanHash": value.get("occurrencePlanHash"),
        "historyMatchResultHash": value.get("historyMatchResultHash"),
        "allocationResultHash": value.get("allocationResultHash"),
        "bootstrapResultHash": value.get("bootstrapResultHash"),
        "currentRegistrySnapshotHash": value.get("currentRegistrySnapshotHash"),
        "registryPatchHash": value.get("registryPatchHash"), "configHash": value.get("configHash"),
        "nodePlanHash": (value.get("nodePlan") or {}).get("nodePlanHash", ""),
        "canonicalBundleHash": (value.get("canonicalBundle") or {}).get("bundleHash", ""),
        "sequentialBundleHash": (value.get("sequentialBundle") or {}).get("bundleHash", ""),
        "topologyIndexHash": (value.get("topologyIndex") or {}).get("topologyIndexHash", ""),
        "canonicalTraceLedgerHash": (value.get("canonicalTraceLedger") or {}).get("traceLedgerHash", ""),
        "sequentialTraceLedgerHash": (value.get("sequentialTraceLedger") or {}).get("traceLedgerHash", ""),
        "preprocessAuditHash": (value.get("preprocessAudit") or {}).get("preprocessAuditHash", ""),
        "parityReportHash": (value.get("parityReport") or {}).get("parityReportHash", ""),
        "selectionHash": (value.get("selection") or {}).get("selectionHash", ""),
        "productionBundleHash": (value.get("productionBundle") or {}).get("bundleHash", ""),
        "proposedBundleHash": (value.get("proposedBundle") or {}).get("bundleHash", ""),
        "validation": value.get("validation"), "ciiConversion": value.get("ciiConversion"),
    }
