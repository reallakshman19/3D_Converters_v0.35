from __future__ import annotations

from io import BytesIO
import hashlib
import json
import re
from typing import Any

import pypdf
from pypdf import PdfReader

from .base import CompileBlocked

_PROVENANCE_SCHEMA = "PdfInputEchoExtractionProvenance.v1"
_MAX_SOURCE_BYTES = 64 * 1024 * 1024
_MAX_TEXT_BYTES = 32 * 1024 * 1024
_MAX_PAGES = 10000
_HASH_RE = re.compile(r"^[a-f0-9]{64}$")
_PROVENANCE_FIELDS = {
    "schema", "sourceDocumentHashSha256", "sourceDocumentByteLength",
    "sourceDocumentKind", "textLayerSourceKind", "pageCount", "pages",
    "extractedTextHashSha256", "extractedTextByteLength",
    "extractorIdentity", "extractorVersion", "provenanceHashSha256",
}
_PAGE_FIELDS = {
    "pageIndex", "pageIdentity", "text", "textHashSha256", "textByteLength",
}
_FORBIDDEN_AUTHORITIES = {"", "unknown", "caller-supplied", "default", "filename"}


def extract_input_echo_text(
    source: bytes,
    *,
    source_name: str,
    context: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    _check_source_bound(source)
    if source.lstrip().startswith(b"%PDF"):
        text, provenance = _extract_pdf_text_layer(source, source_name)
    else:
        text, provenance = _validate_supplied_extraction(source, context)
    if len(text.encode("utf-8")) > _MAX_TEXT_BYTES:
        raise CompileBlocked("PDF Input Echo extracted text exceeds the bounded intake limit.")
    return text, provenance


def _extract_pdf_text_layer(source: bytes, source_name: str) -> tuple[str, dict[str, Any]]:
    try:
        reader = PdfReader(BytesIO(source))
        if not 0 < len(reader.pages) <= _MAX_PAGES:
            raise CompileBlocked("PDF Input Echo page count is outside the bounded contract.")
        page_texts = [_normalize_text(page.extract_text() or "") for page in reader.pages]
    except CompileBlocked:
        raise
    except Exception as exc:
        raise CompileBlocked(f"PDF Input Echo extraction failed for {source_name}: {exc}") from exc
    if not any(value.strip() for value in page_texts):
        raise CompileBlocked(
            "PDF Input Echo has no authoritative text layer; scanned/image-only input requires an approved extracted-text manifest."
        )
    extractor_version = str(getattr(pypdf, "__version__", "")).strip()
    if not extractor_version:
        raise CompileBlocked("PDF text-layer extractor version is unavailable.")
    text = "\n".join(page_texts)
    provenance = _make_provenance(
        source_hash=_hash(source),
        source_length=len(source),
        source_kind="PDF",
        text_layer_kind="PDF_TEXT_LAYER",
        page_texts=page_texts,
        extractor_identity="pypdf.PdfReader.extract_text",
        extractor_version=extractor_version,
    )
    return text, provenance


def _validate_supplied_extraction(
    source: bytes,
    context: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    source_kind = str(context.get("sourceKind") or "").strip().lower()
    if source_kind not in {"extracted-text", "pdf-extracted-text"}:
        raise CompileBlocked(
            "pdf-input-echo non-PDF input requires explicit sourceKind='extracted-text' and immutable extractionProvenance."
        )
    try:
        received_text = _normalize_text(source.decode("utf-8", errors="strict"))
    except UnicodeDecodeError as exc:
        raise CompileBlocked("Extracted Input Echo text must be strict UTF-8.") from exc
    raw = context.get("extractionProvenance")
    if not isinstance(raw, dict):
        raise CompileBlocked("Extracted Input Echo text requires extractionProvenance object evidence.")
    missing = sorted(_PROVENANCE_FIELDS - set(raw))
    extra = sorted(set(raw) - _PROVENANCE_FIELDS)
    if missing or extra:
        raise CompileBlocked(f"Extraction provenance fields mismatch: missing={missing}, extra={extra}.")
    if raw.get("schema") != _PROVENANCE_SCHEMA:
        raise CompileBlocked(f"Extraction provenance schema must be {_PROVENANCE_SCHEMA}.")
    source_hash = _required_hash(raw.get("sourceDocumentHashSha256"), "sourceDocumentHashSha256")
    source_length = _positive_int(raw.get("sourceDocumentByteLength"), "sourceDocumentByteLength")
    source_document_kind = _authority_text(raw.get("sourceDocumentKind"), "sourceDocumentKind")
    text_layer_kind = str(raw.get("textLayerSourceKind") or "").strip()
    if text_layer_kind != "APPROVED_EXTRACTED_TEXT_MANIFEST":
        raise CompileBlocked("Supplied extraction textLayerSourceKind must be APPROVED_EXTRACTED_TEXT_MANIFEST.")
    extractor_identity = _authority_text(raw.get("extractorIdentity"), "extractorIdentity")
    extractor_version = _authority_text(raw.get("extractorVersion"), "extractorVersion")
    pages = _validate_pages(raw.get("pages"))
    page_count = _positive_int(raw.get("pageCount"), "pageCount")
    if page_count != len(pages):
        raise CompileBlocked("Extraction provenance pageCount disagrees with the ordered page manifest.")
    manifest_text = "\n".join(row["text"] for row in pages)
    if manifest_text != received_text:
        raise CompileBlocked("Received extracted text differs from the ordered page-text manifest.")
    expected = _make_provenance(
        source_hash=source_hash,
        source_length=source_length,
        source_kind=source_document_kind,
        text_layer_kind=text_layer_kind,
        page_texts=[row["text"] for row in pages],
        extractor_identity=extractor_identity,
        extractor_version=extractor_version,
        page_identities=[row["pageIdentity"] for row in pages],
    )
    for field in _PROVENANCE_FIELDS:
        if raw.get(field) != expected.get(field):
            raise CompileBlocked(f"Extraction provenance {field} contradicts the received text or manifest.")
    return received_text, expected


def _validate_pages(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value or len(value) > _MAX_PAGES:
        raise CompileBlocked("Extraction provenance pages must be a non-empty bounded array.")
    rows: list[dict[str, Any]] = []
    identities: set[str] = set()
    for expected_index, raw in enumerate(value, 1):
        if not isinstance(raw, dict) or set(raw) != _PAGE_FIELDS:
            raise CompileBlocked(f"Extraction page #{expected_index} has an invalid field contract.")
        index = _positive_int(raw.get("pageIndex"), f"pages[{expected_index}].pageIndex")
        if index != expected_index:
            raise CompileBlocked("Extraction page manifest is reordered or has a page-index gap.")
        identity = _authority_text(raw.get("pageIdentity"), f"pages[{expected_index}].pageIdentity")
        if identity in identities:
            raise CompileBlocked("Extraction page manifest contains a duplicate page identity.")
        identities.add(identity)
        text = _normalize_text(str(raw.get("text") or ""))
        encoded = text.encode("utf-8")
        if raw.get("textHashSha256") != _hash(encoded):
            raise CompileBlocked(f"Extraction page #{expected_index} text hash mismatch.")
        if raw.get("textByteLength") != len(encoded):
            raise CompileBlocked(f"Extraction page #{expected_index} text length mismatch.")
        rows.append({
            "pageIndex": index,
            "pageIdentity": identity,
            "text": text,
            "textHashSha256": _hash(encoded),
            "textByteLength": len(encoded),
        })
    return rows


def _make_provenance(
    *,
    source_hash: str,
    source_length: int,
    source_kind: str,
    text_layer_kind: str,
    page_texts: list[str],
    extractor_identity: str,
    extractor_version: str,
    page_identities: list[str] | None = None,
) -> dict[str, Any]:
    pages = []
    for index, text in enumerate(page_texts, 1):
        encoded = text.encode("utf-8")
        pages.append({
            "pageIndex": index,
            "pageIdentity": page_identities[index - 1] if page_identities else f"page-{index:06d}",
            "text": text,
            "textHashSha256": _hash(encoded),
            "textByteLength": len(encoded),
        })
    complete_text = "\n".join(page_texts)
    complete_bytes = complete_text.encode("utf-8")
    result: dict[str, Any] = {
        "schema": _PROVENANCE_SCHEMA,
        "sourceDocumentHashSha256": source_hash,
        "sourceDocumentByteLength": source_length,
        "sourceDocumentKind": source_kind,
        "textLayerSourceKind": text_layer_kind,
        "pageCount": len(pages),
        "pages": pages,
        "extractedTextHashSha256": _hash(complete_bytes),
        "extractedTextByteLength": len(complete_bytes),
        "extractorIdentity": extractor_identity,
        "extractorVersion": extractor_version,
    }
    result["provenanceHashSha256"] = _hash(_canonical_bytes(result))
    return result


def _normalize_text(value: str) -> str:
    normalized = value.replace("\r\n", "\n").replace("\r", "\n")
    try:
        normalized.encode("utf-8", errors="strict")
    except UnicodeEncodeError as exc:
        raise CompileBlocked("Extracted Input Echo text contains an invalid Unicode surrogate.") from exc
    return normalized


def _check_source_bound(source: bytes) -> None:
    if not source:
        raise CompileBlocked("PDF Input Echo source is empty.")
    if len(source) > _MAX_SOURCE_BYTES:
        raise CompileBlocked("PDF Input Echo source exceeds the bounded intake limit.")


def _required_hash(value: Any, field: str) -> str:
    text = str(value or "").strip().lower()
    if not _HASH_RE.fullmatch(text):
        raise CompileBlocked(f"Extraction provenance {field} must be a lowercase SHA-256 hex digest.")
    return text


def _positive_int(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise CompileBlocked(f"Extraction provenance {field} must be a positive integer.")
    return value


def _authority_text(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if text.lower() in _FORBIDDEN_AUTHORITIES:
        raise CompileBlocked(f"Extraction provenance {field} lacks explicit immutable authority.")
    return text


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def _hash(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


__all__ = ["extract_input_echo_text"]
