from __future__ import annotations

import re
from typing import Any, Callable

from converters.scripts import pdf_to_inputxml as pdf_parser

from .base import CompileBlocked, DecisionLedger, ET
from .extension import _ensure_extension_last
from .pdf_input_echo_accounting import verify_pdf_input_echo_accounting
from .pdf_input_echo_auxiliary import (
    preserve_report_record,
    preserve_unparsed_tail,
    preserve_unsupported_sections,
)
from .pdf_input_echo_elements import build_pdf_element, set_pdf_counts
from .pdf_input_echo_provenance import extract_input_echo_text
from .pdf_input_echo_scopes import validate_line_scopes
from .pdf_input_echo_state import line_state_policy, resolve_line_scoped_blocks
from .xml import _decimal_text


def compile_pdf_input_echo_source(
    source: bytes,
    *,
    source_name: str,
    ledger: DecisionLedger,
    context: dict[str, Any],
    root_factory: Callable[[str], tuple[ET._Element, ET._Element]],
) -> ET._Element:
    version, north = _validated_context(context)
    text, provenance = extract_input_echo_text(
        source,
        source_name=source_name,
        context=context,
    )
    if not pdf_parser._is_input_echo_text(text):
        raise CompileBlocked(
            "Input does not contain the CAESAR Input Echo/Input Listing and PIPE DATA signatures."
        )
    job_name, date_text, time_text = _strict_report_header(text)
    report_header = {"jobName": job_name, "date": date_text, "time": time_text}
    blocks = _input_echo_blocks(text)
    if not blocks:
        raise CompileBlocked("Input Echo PIPE DATA section contains no source element blocks.")
    scopes, by_block, scope_set = validate_line_scopes(
        context,
        block_count=len(blocks),
    )
    resolved = resolve_line_scoped_blocks(blocks, by_block, ledger)

    root, model = root_factory(version)
    _set_model_header(model, report_header, north, context)
    _record_document(model, text, provenance, ledger)
    _record_header(model, report_header, ledger)
    _record_line_scopes(model, scopes, scope_set, ledger)
    unsupported_ids = preserve_unsupported_sections(text, model, ledger)
    unparsed_ids = _unparsed_evidence_ids(text)
    preserve_unparsed_tail(text, model, ledger)
    for row in resolved:
        model.append(build_pdf_element(row, ledger))
    set_pdf_counts(model, resolved)

    _, proof = verify_pdf_input_echo_accounting(
        model,
        ledger=ledger,
        provenance=provenance,
        report_header=report_header,
        scopes=scopes,
        blocks=blocks,
        resolved=resolved,
        unsupported_section_ids=unsupported_ids,
        unparsed_evidence_ids=unparsed_ids,
    )
    preserve_report_record(
        model,
        name="PdfInputEchoSourceAccountingProof",
        value=proof,
        ledger=ledger,
        entity_id="pdf-input-echo-source-accounting",
    )
    _ensure_extension_last(model)
    return root


def _validated_context(context: dict[str, Any]) -> tuple[str, list[Any]]:
    version = str(context.get("version") or "").strip()
    if not version:
        raise CompileBlocked(
            "PDF Input Echo adapter requires explicit context version; report-version guessing is forbidden."
        )
    north = context.get("north")
    if not isinstance(north, list) or len(north) != 3:
        raise CompileBlocked("PDF Input Echo adapter requires explicit context north=[x,y,z].")
    for index, value in enumerate(north):
        _decimal_text(value, f"context north[{index}]")
    return version, north


def _strict_report_header(text: str) -> tuple[str, str, str]:
    job_match = re.search(r"(?im)^\s*Job Name:\s*([^\r\n]+)", text)
    if job_match is None or not job_match.group(1).strip():
        raise CompileBlocked("Input Echo report is missing an explicit non-empty Job Name header.")
    datetime_match = re.search(
        r"Date:\s*([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})\s+"
        r"Time:\s*(\d{1,2}):(\d{2})(?::(\d{2}))?",
        text,
        flags=re.IGNORECASE,
    )
    if datetime_match is None:
        raise CompileBlocked(
            "Input Echo report is missing an explicit Date/Time header; "
            "current-clock substitution is forbidden."
        )
    job_name, date_text, time_text = pdf_parser._parse_job_header(text)
    seconds = datetime_match.group(6)
    if seconds is not None:
        time_text = (
            f"{int(datetime_match.group(4)):02d}:"
            f"{int(datetime_match.group(5)):02d}:"
            f"{int(seconds):02d}"
        )
    return job_name, date_text, time_text


def _input_echo_blocks(text: str) -> list[dict[str, Any]]:
    try:
        primary = pdf_parser._slice_primary_section(text)
    except Exception as exc:
        raise CompileBlocked(f"Input Echo PIPE DATA section parsing failed: {exc}") from exc
    pattern = re.compile(
        r"^\s*From\s+(\d+)(?:\s+\S+)?\s+To\s+(\d+)(?:\s+\S+)?(.*)$",
        re.I,
    )
    blocks: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for raw_line in primary.splitlines():
        match = pattern.match(raw_line)
        if match:
            if current is not None:
                blocks.append(current)
            current = {
                "blockId": f"PDF-BLOCK-{len(blocks) + 1:06d}",
                "fromNode": int(match.group(1)),
                "toNode": int(match.group(2)),
                "header": raw_line,
                "lines": [],
            }
        elif current is not None:
            current["lines"].append(raw_line)
        elif raw_line.strip():
            raise CompileBlocked(
                "Input Echo PIPE DATA contains unassigned evidence before the first source block."
            )
    if current is not None:
        blocks.append(current)
    return blocks


def _set_model_header(
    model: ET._Element,
    header: dict[str, str],
    north: list[Any],
    context: dict[str, Any],
) -> None:
    model.set("JOBNAME", header["jobName"])
    model.set("TIME", f"{header['date']} {header['time']}")
    model.set("ISSUE_NO", str(context.get("issueNo") or ""))
    for field, value in zip(("NORTH_X", "NORTH_Y", "NORTH_Z"), north):
        model.set(field, _decimal_text(value, f"context {field}"))


def _record_document(
    model: ET._Element,
    text: str,
    provenance: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    preserve_report_record(
        model,
        name="PdfExtractionProvenance",
        value=provenance,
        ledger=ledger,
        entity_id="document/provenance",
    )
    preserve_report_record(
        model,
        name="PdfExtractedInputEchoText",
        value=text,
        ledger=ledger,
        entity_id="document",
    )
    ledger.add(
        source_entity_id="document",
        source_type="PDF_INPUT_ECHO_DOCUMENT",
        source_fields={
            "sourceDocumentHashSha256": provenance["sourceDocumentHashSha256"],
            "sourceDocumentByteLength": provenance["sourceDocumentByteLength"],
            "extractedTextHashSha256": provenance["extractedTextHashSha256"],
            "extractedTextByteLength": provenance["extractedTextByteLength"],
            "provenanceHashSha256": provenance["provenanceHashSha256"],
        },
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "validated immutable extraction provenance",
            "current-clock, filename and generated line defaults are disabled",
        ],
    )
    ledger.add(
        source_entity_id="document/provenance",
        source_type="PDF_INPUT_ECHO_PROVENANCE",
        source_fields=provenance,
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=["independently validated immutable extraction provenance"],
    )
    for page in provenance["pages"]:
        ledger.add(
            source_entity_id=f"document/{page['pageIdentity']}",
            source_type="PDF_INPUT_ECHO_PAGE",
            source_fields=page,
            projection_cardinality="1_TO_0",
            disposition="PRESERVE_EXTENSION",
            evidence=["ordered page-text manifest entry"],
        )


def _record_header(
    model: ET._Element,
    header: dict[str, str],
    ledger: DecisionLedger,
) -> None:
    preserve_report_record(
        model,
        name="PdfReportHeader",
        value=header,
        ledger=ledger,
        entity_id="document/header",
    )
    ledger.add(
        source_entity_id="document/header",
        source_type="PDF_INPUT_ECHO_REPORT_HEADER",
        source_fields=header,
        cii_section="VERSION",
        projection_cardinality="1_TO_1",
        disposition="EMIT_REPORT_METADATA",
        evidence=["explicit report Job Name and Date/Time; no current-clock fallback"],
    )


def _record_line_scopes(
    model: ET._Element,
    scopes: list[dict[str, Any]],
    scope_set: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    preserve_report_record(
        model,
        name="PdfLineScopeSet",
        value=scope_set,
        ledger=ledger,
        entity_id="document/line-scopes",
    )
    preserve_report_record(
        model,
        name="PdfLineStatePolicy",
        value=line_state_policy(),
        ledger=ledger,
        entity_id="document/line-state-policy",
    )
    for scope in scopes:
        ledger.add(
            source_entity_id=str(scope["lineScopeId"]),
            source_type="PDF_LINE_SCOPE",
            source_fields=scope,
            projection_cardinality="1_TO_0",
            disposition="PRESERVE_EXTENSION",
            evidence=list(scope["sourceEvidenceReferences"]),
        )


def _unparsed_evidence_ids(text: str) -> list[str]:
    parts = re.split(r"(?im)^\s*NODENAMES\s*$", text, maxsplit=1)
    return ["document/unparsed-tail"] if len(parts) == 2 and parts[1].strip() else []


__all__ = ["compile_pdf_input_echo_source"]
