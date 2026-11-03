from __future__ import annotations

from typing import Any

from .base import DecisionLedger, ET
from .pdf_input_echo_accounting_state import verify_state_decision_closure

_ACCOUNTING_SCHEMA = "PdfInputEchoSourceAccountingProof.v1"


def verify_pdf_input_echo_accounting(
    model: ET._Element,
    *,
    ledger: DecisionLedger,
    provenance: dict[str, Any],
    report_header: dict[str, str],
    scopes: list[dict[str, Any]],
    blocks: list[dict[str, Any]],
    resolved: list[dict[str, Any]],
    unsupported_section_ids: list[str],
    unparsed_evidence_ids: list[str],
) -> tuple[str, dict[str, Any]]:
    elements = list(model.findall("PIPINGELEMENT"))
    element_by_id = {str(row.get("ID") or ""): row for row in elements}
    expected_block_ids = {
        f"PDF-BLOCK-{index:06d}" for index in range(1, len(blocks) + 1)
    }
    expected_element_ids = {str(row["entityId"]) for row in resolved}
    expected_scope_ids = {str(row["lineScopeId"]) for row in scopes}
    expected_omitted_axes = {
        f"{row['entityId']}@DELTA_{axis}"
        for row in resolved
        for axis in "XYZ"
        if f"DELTA_{axis}" not in row["explicitFields"]
    }
    state = verify_state_decision_closure(resolved, ledger.records, element_by_id)
    line_mismatches = _element_line_mismatches(resolved, element_by_id)
    page_mismatches = _page_mismatches(
        _records(ledger, {"PDF_INPUT_ECHO_PAGE"}),
        provenance,
    )
    scope_mismatches = _scope_mismatches(
        _records(ledger, {"PDF_LINE_SCOPE"}),
        scopes,
    )
    block_mismatches = _block_mismatches(
        _records(ledger, {"PDF_PIPE_DATA_BLOCK"}),
        blocks,
        resolved,
    )
    auxiliary_expected = _auxiliary_expected(resolved)
    auxiliary_actual = _auxiliary_actual(ledger)
    invariants = {
        "documentRecordMismatchCount": _document_mismatch(ledger, provenance),
        "reportHeaderMismatchCount": _single_record_mismatch(
            ledger,
            "PDF_INPUT_ECHO_REPORT_HEADER",
            report_header,
        ),
        "provenanceMismatchCount": _single_record_mismatch(
            ledger,
            "PDF_INPUT_ECHO_PROVENANCE",
            provenance,
        ),
        "pageManifestMismatchCount": len(page_mismatches),
        "blockRecordMismatchCount": len(block_mismatches),
        "blockElementCardinalityMismatchCount": abs(len(blocks) - len(elements)),
        "missingElementRecordCount": len(
            expected_element_ids - _record_ids(ledger, "PDF_PIPE_DATA_ELEMENT")
        ),
        "extraElementRecordCount": len(
            _record_ids(ledger, "PDF_PIPE_DATA_ELEMENT") - expected_element_ids
        ),
        "lineScopeRecordMismatchCount": len(scope_mismatches),
        "missingLineScopeRecordCount": len(
            expected_scope_ids - _record_ids(ledger, "PDF_LINE_SCOPE")
        ),
        "extraLineScopeRecordCount": len(
            _record_ids(ledger, "PDF_LINE_SCOPE") - expected_scope_ids
        ),
        "missingOmittedAxisDecisionCount": len(
            expected_omitted_axes - _record_ids(ledger, "PDF_OMITTED_DELTA_AXIS")
        ),
        "extraOmittedAxisDecisionCount": len(
            _record_ids(ledger, "PDF_OMITTED_DELTA_AXIS") - expected_omitted_axes
        ),
        "elementLineMismatchCount": len(line_mismatches),
        "ledgerLineMismatchCount": len(state["lineOwnershipMismatches"]),
        "crossLineInheritanceCount": sum(
            row["reason"] == "predecessor-cross-scope"
            for row in state["predecessorOwnershipMismatches"]
        ),
        "unsupportedSectionAccountingMismatchCount": _identity_mismatch_count(
            unsupported_section_ids,
            _blocking_ids(ledger, "PDF_UNSUPPORTED_REPORT_SECTION"),
        ),
        "unparsedEvidenceAccountingMismatchCount": _identity_mismatch_count(
            unparsed_evidence_ids,
            _blocking_ids(ledger, "PDF_UNPARSED_REPORT_EVIDENCE"),
        ),
        "auxiliaryAccountingMismatchCount": sum(
            abs(auxiliary_expected.get(name, 0) - auxiliary_actual.get(name, 0))
            for name in sorted(set(auxiliary_expected) | set(auxiliary_actual))
        ),
        **state["invariants"],
    }
    complete = all(value == 0 for value in invariants.values())
    proof = {
        "schema": _ACCOUNTING_SCHEMA,
        "status": "COMPLETE" if complete else "BLOCKED",
        "sourceDocumentHashSha256": provenance["sourceDocumentHashSha256"],
        "extractedTextHashSha256": provenance["extractedTextHashSha256"],
        "provenanceHashSha256": provenance["provenanceHashSha256"],
        "lineScopeHashes": [row["lineScopeHashSha256"] for row in scopes],
        "sourceBlockIds": sorted(expected_block_ids),
        "canonicalElementIds": [str(row.get("ID") or "") for row in elements],
        "invariants": invariants,
        "lineMismatches": line_mismatches,
        "ledgerLineMismatchRecordIds": [
            row["sourceEntityId"] for row in state["lineOwnershipMismatches"]
        ],
        "crossLineInheritanceRecordIds": [
            row["sourceEntityId"]
            for row in state["predecessorOwnershipMismatches"]
            if row["reason"] == "predecessor-cross-scope"
        ],
        "pageManifestMismatches": page_mismatches,
        "scopeMismatches": scope_mismatches,
        "blockMismatches": block_mismatches,
        "stateDecisionExpectedCount": state["expectedCount"],
        "stateDecisionActualCount": state["actualCount"],
        "stateDecisionSemanticTupleFields": state["semanticTupleFields"],
        "expectedStateDecisionHashSha256": state["expectedHashSha256"],
        "actualStateDecisionHashSha256": state["actualHashSha256"],
        "stateDecisionCardinalityMismatches": state["cardinalityMismatches"],
        "stateDecisionSemanticMismatches": state["semanticMismatches"],
        "stateDecisionSourceXmlMismatches": state["sourceXmlMismatches"],
        "stateDecisionLedgerXmlMismatches": state["ledgerXmlMismatches"],
        "stateDecisionPredecessorOwnershipMismatches": (
            state["predecessorOwnershipMismatches"]
        ),
        "stateDecisionOriginOwnershipMismatches": state["originOwnershipMismatches"],
        "stateDecisionLineOwnershipMismatches": state["lineOwnershipMismatches"],
        "auxiliaryExpected": auxiliary_expected,
        "auxiliaryActual": auxiliary_actual,
    }
    ledger.add(
        source_entity_id="pdf-input-echo-source-accounting",
        source_type="PDF_INPUT_ECHO_SOURCE_ACCOUNTING",
        source_fields=proof,
        canonical_element_ids=proof["canonicalElementIds"],
        inputxml_element_ids=proof["canonicalElementIds"],
        projection_cardinality="MANY_TO_MANY",
        disposition="PRESERVE_EXTENSION" if complete else "UNSUPPORTED_BLOCKING",
        evidence=[
            "independent source-block x field reconstruction and exact ledger/XML semantic closure"
        ],
        diagnostics=(
            [] if complete
            else ["PDF Input Echo source accounting is incomplete or contradictory"]
        ),
    )
    return proof["status"], proof


def _records(ledger: DecisionLedger, source_types: set[str]) -> list[dict[str, Any]]:
    return [
        row for row in ledger.records
        if str(row.get("sourceType") or "") in source_types
    ]


def _record_ids(ledger: DecisionLedger, source_type: str) -> set[str]:
    return {
        str(row.get("sourceEntityId") or "")
        for row in ledger.records
        if row.get("sourceType") == source_type
    }


def _single_record_mismatch(
    ledger: DecisionLedger,
    source_type: str,
    expected: dict[str, Any],
) -> int:
    rows = _records(ledger, {source_type})
    return int(len(rows) != 1 or rows[0].get("sourceFields") != expected)


def _document_mismatch(ledger: DecisionLedger, provenance: dict[str, Any]) -> int:
    expected = {
        "sourceDocumentHashSha256": provenance["sourceDocumentHashSha256"],
        "sourceDocumentByteLength": provenance["sourceDocumentByteLength"],
        "extractedTextHashSha256": provenance["extractedTextHashSha256"],
        "extractedTextByteLength": provenance["extractedTextByteLength"],
        "provenanceHashSha256": provenance["provenanceHashSha256"],
    }
    return _single_record_mismatch(ledger, "PDF_INPUT_ECHO_DOCUMENT", expected)


def _page_mismatches(
    records: list[dict[str, Any]],
    provenance: dict[str, Any],
) -> list[str]:
    expected = provenance.get("pages") or []
    if len(records) != len(expected):
        return ["page-count"]
    by_index = {
        (row.get("sourceFields") or {}).get("pageIndex"): row.get("sourceFields")
        for row in records
        if isinstance(row.get("sourceFields"), dict)
    }
    return [
        str(page["pageIdentity"])
        for page in expected
        if by_index.get(page["pageIndex"]) != page
    ]


def _scope_mismatches(
    records: list[dict[str, Any]],
    scopes: list[dict[str, Any]],
) -> list[str]:
    by_id = {
        str(row.get("sourceEntityId") or ""): row.get("sourceFields")
        for row in records
    }
    return [
        str(scope["lineScopeId"])
        for scope in scopes
        if by_id.get(str(scope["lineScopeId"])) != scope
    ]


def _block_mismatches(
    records: list[dict[str, Any]],
    blocks: list[dict[str, Any]],
    resolved: list[dict[str, Any]],
) -> list[str]:
    by_id = {
        str(row.get("sourceEntityId") or ""): row.get("sourceFields")
        for row in records
    }
    mismatches = []
    for block, row in zip(blocks, resolved):
        expected = {
            "blockIndex": row["blockIndex"],
            "blockId": row["blockId"],
            "header": block["header"],
            "lines": list(block.get("lines") or []),
            "lineScopeId": row["lineScope"]["lineScopeId"],
            "lineId": row["lineScope"]["lineId"],
        }
        if by_id.get(str(row["blockId"])) != expected:
            mismatches.append(str(row["blockId"]))
    return mismatches


def _element_line_mismatches(
    resolved: list[dict[str, Any]],
    elements: dict[str, ET._Element],
) -> list[dict[str, str]]:
    mismatches = []
    for row in resolved:
        entity_id = str(row["entityId"])
        expected = str(row["lineScope"]["lineId"])
        element = elements.get(entity_id)
        actual = str(element.get("LINE") or "") if element is not None else ""
        if actual != expected:
            mismatches.append({"entityId": entity_id, "expected": expected, "actual": actual})
    return mismatches


def _blocking_ids(ledger: DecisionLedger, source_type: str) -> list[str]:
    return [
        str(row.get("sourceEntityId") or "")
        for row in ledger.records
        if row.get("sourceType") == source_type
        and row.get("disposition") == "UNSUPPORTED_BLOCKING"
    ]


def _identity_mismatch_count(expected: list[str], actual: list[str]) -> int:
    return len(set(expected) ^ set(actual)) + abs(len(actual) - len(set(actual)))


def _auxiliary_expected(resolved: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "PDF_BEND": sum(1 for row in resolved if row["element"].bend is not None),
        "PDF_RIGID": sum(
            1 for row in resolved if row["element"].rigid_weight_kg is not None
        ),
        "PDF_RESTRAINT_BLOCK": sum(1 for row in resolved if row["element"].restraints),
        "PDF_SIF_TEE_BLOCK": sum(1 for row in resolved if row["element"].sifs),
    }


def _auxiliary_actual(ledger: DecisionLedger) -> dict[str, int]:
    names = {"PDF_BEND", "PDF_RIGID", "PDF_RESTRAINT_BLOCK", "PDF_SIF_TEE_BLOCK"}
    return {
        name: sum(1 for row in ledger.records if row.get("sourceType") == name)
        for name in names
    }


__all__ = ["verify_pdf_input_echo_accounting"]
