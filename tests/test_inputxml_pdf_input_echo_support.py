from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "inputxml_canonical_compiler.py"
spec = importlib.util.spec_from_file_location(
    "inputxml_canonical_compiler_pdf_pr8_test",
    MODULE_PATH,
)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"


def state_lines(
    *,
    diameter: str = "114.3",
    wall: str = "6.02",
    corrosion: str = "0",
    insulation: str = "0",
    temperature: str = "100",
    pressure: str = "10",
    hydro: str = "15",
    material: int = 106,
    insul_density: str = "0",
    fluid_density: str = "965",
) -> list[str]:
    return [
        f"Dia= {diameter} mm.",
        f"Wall= {wall} mm.",
        f"Cor= {corrosion} mm.",
        f"Insul Thk= {insulation} mm.",
        f"T1= {temperature} C",
        f"P1= {pressure} bars",
        f"PHyd= {hydro} bars",
        f"Mat= ({material}) A106 Grade B E= 200000 N./sq.mm.",
        "Pipe Den= 7833 kg/cu.m.",
        f"Insul Den= {insul_density} kg/cu.m.",
        f"Fluid Den= {fluid_density} kg/cu.m.",
    ]


def pipe_block(
    from_node: int,
    to_node: int,
    *,
    axis: str = "DX",
    length: str = "1000",
    name: str = "ELEMENT",
    state: list[str] | None = None,
    extra: list[str] | None = None,
) -> str:
    lines = [
        f"From {from_node} To {to_node} {axis}= {length} mm.",
        f"Element Name= {name}",
        *(state or []),
        *(extra or []),
    ]
    return "\n".join(lines)


def report(
    blocks: list[str],
    *,
    job_name: str = "PDF-STRICT-TEST",
    timestamp: str | None = "Date: JUL 15, 2026 Time: 10:30",
    tail: str = "",
) -> str:
    header = [
        "CAESAR II Input Echo",
        f"Job Name: {job_name}",
    ]
    if timestamp is not None:
        header.append(timestamp)
    return "\n".join([
        *header,
        "Input Listing",
        "PIPE DATA",
        *blocks,
        "NODENAMES",
        tail,
    ])


def one_line_report(*, second_block: bool = True, extra_first: list[str] | None = None) -> str:
    blocks = [
        pipe_block(
            10,
            20,
            name="FIRST",
            state=state_lines(),
            extra=extra_first,
        )
    ]
    if second_block:
        blocks.append(pipe_block(20, 30, axis="DY", length="500", name="SECOND"))
    return report(blocks)


def extraction_provenance(
    text: str,
    *,
    page_texts: list[str] | None = None,
    source_document: bytes = b"approved-source-document",
    extractor_identity: str = "approved-unit-test-extractor",
    extractor_version: str = "1.0.0",
) -> dict[str, Any]:
    normalized = normalize_text(text)
    pages = [normalize_text(value) for value in (page_texts or [normalized])]
    if "\n".join(pages) != normalized:
        raise ValueError("page_texts must join exactly to the received normalized text")
    rows = []
    for index, page_text in enumerate(pages, 1):
        encoded = page_text.encode("utf-8")
        rows.append({
            "pageIndex": index,
            "pageIdentity": f"approved-page-{index:06d}",
            "text": page_text,
            "textHashSha256": sha256(encoded),
            "textByteLength": len(encoded),
        })
    encoded_text = normalized.encode("utf-8")
    result: dict[str, Any] = {
        "schema": "PdfInputEchoExtractionProvenance.v1",
        "sourceDocumentHashSha256": sha256(source_document),
        "sourceDocumentByteLength": len(source_document),
        "sourceDocumentKind": "PDF",
        "textLayerSourceKind": "APPROVED_EXTRACTED_TEXT_MANIFEST",
        "pageCount": len(rows),
        "pages": rows,
        "extractedTextHashSha256": sha256(encoded_text),
        "extractedTextByteLength": len(encoded_text),
        "extractorIdentity": extractor_identity,
        "extractorVersion": extractor_version,
    }
    result["provenanceHashSha256"] = sha256(canonical_bytes(result))
    return result


def line_scope(
    scope_id: str,
    line_id: str,
    membership: list[int],
    *,
    authority: str = "CALLER_SUPPLIED_SCOPE_MAP",
) -> dict[str, Any]:
    return {
        "lineScopeId": scope_id,
        "lineId": line_id,
        "sourceAuthority": authority,
        "blockMembership": membership,
        "firstBlock": membership[0],
        "lastBlock": membership[-1],
        "sourceEvidenceReferences": [f"approved-scope-map:{scope_id}"],
    }


def context_for(
    text: str,
    scopes: list[dict[str, Any]],
    *,
    extracted: bool = True,
    page_texts: list[str] | None = None,
) -> dict[str, Any]:
    context: dict[str, Any] = {
        "version": "11.00",
        "north": [0, 1, 0],
        "lineScopes": scopes,
    }
    if extracted:
        context.update({
            "sourceKind": "extracted-text",
            "extractionProvenance": extraction_provenance(
                text,
                page_texts=page_texts,
            ),
        })
    return context


def compile_document(
    source: str | bytes,
    *,
    context: dict[str, Any],
    source_name: str = "input-echo.txt",
):
    payload = source if isinstance(source, bytes) else source.encode("utf-8")
    return compiler.compile_document(
        payload,
        source_name=source_name,
        source_repository="reallaksh19/3D_Converters",
        source_path="test://input-echo",
        producer="pdf-input-echo-adapter-pr8-test",
        registry_path=CONTRACTS / "inputxml-dialect-registry.json",
        alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
        canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
        categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
        semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
        dialect_override="pdf-input-echo",
        context=context,
    )


def make_text_pdf(text: str) -> bytes:
    commands = ["BT", "/F1 8 Tf", "40 760 Td"]
    for index, line in enumerate(text.splitlines()):
        if index:
            commands.append("0 -10 Td")
        commands.append(f"({escape_pdf_text(line)}) Tj")
    commands.append("ET")
    stream = ("\n".join(commands) + "\n").encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"endstream",
    ]
    data = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, body in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{index} 0 obj\n".encode())
        data.extend(body)
        data.extend(b"\nendobj\n")
    xref = len(data)
    data.extend(f"xref\n0 {len(objects)+1}\n".encode())
    data.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(
        f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(data)


def normalize_text(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


__all__ = [name for name in globals() if not name.startswith("_")]
