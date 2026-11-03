#!/usr/bin/env python3
"""Normalize distributed InputXML findings into the governed diagnostic taxonomy."""
from __future__ import annotations

import json
from typing import Any

from inputxml_release_policy import hash_without

DIAGNOSTIC_CODES = frozenset({
    "INPUTXML_RESTRAINT_OVERFLOW",
    "INPUTXML_DIALECT_AMBIGUOUS",
    "INPUTXML_DIALECT_UNSUPPORTED",
    "INPUTXML_ALIAS_CONFLICT",
    "INPUTXML_NAMESPACE_INVALID",
    "INPUTXML_LINE_ID_UNRESOLVED",
    "INPUTXML_NODE_PLAN_MISSING",
    "INPUTXML_DUPLICATE_ACTIVE_NODE",
    "INPUTXML_UNSUPPORTED_BLOCKING_EVIDENCE",
    "INPUTXML_XSD_FAILED",
    "INPUTXML_SCHEMATRON_FAILED",
    "INPUTXML_TOPOLOGY_PARITY_FAILED",
    "INPUTXML_DOWNSTREAM_PROOF_FAILED",
    "INPUTXML_SCHEMA_COPY_DRIFT",
})

_MATCHERS = (
    (("RESTRAINT", "OVERFLOW"), "INPUTXML_RESTRAINT_OVERFLOW"),
    (("RESTRAINT", "NOT EXPECTED"), "INPUTXML_RESTRAINT_OVERFLOW"),
    (("DIALECT", "AMBIG"), "INPUTXML_DIALECT_AMBIGUOUS"),
    (("DIALECT",), "INPUTXML_DIALECT_UNSUPPORTED"),
    (("ALIAS",), "INPUTXML_ALIAS_CONFLICT"),
    (("NAMESPACE",), "INPUTXML_NAMESPACE_INVALID"),
    (("XML_PARSE",), "INPUTXML_NAMESPACE_INVALID"),
    (("LINE",), "INPUTXML_LINE_ID_UNRESOLVED"),
    (("NODE_PLAN",), "INPUTXML_NODE_PLAN_MISSING"),
    (("DUPLICATE", "NODE"), "INPUTXML_DUPLICATE_ACTIVE_NODE"),
    (("EXTENSION",), "INPUTXML_UNSUPPORTED_BLOCKING_EVIDENCE"),
    (("UNSUPPORTED",), "INPUTXML_UNSUPPORTED_BLOCKING_EVIDENCE"),
    (("XSD",), "INPUTXML_XSD_FAILED"),
    (("SCHEMATRON",), "INPUTXML_SCHEMATRON_FAILED"),
    (("SEMANTIC",), "INPUTXML_SCHEMATRON_FAILED"),
    (("PARITY",), "INPUTXML_TOPOLOGY_PARITY_FAILED"),
    (("TOPOLOGY",), "INPUTXML_TOPOLOGY_PARITY_FAILED"),
    (("CONTRACT_BUNDLE",), "INPUTXML_SCHEMA_COPY_DRIFT"),
    (("SCHEMA_COPY",), "INPUTXML_SCHEMA_COPY_DRIFT"),
)


def taxonomy_code(original_code: str, message: str) -> str:
    """Map one local finding code to a stable cross-route diagnostic code."""
    code_only = original_code.strip().upper()
    if code_only in DIAGNOSTIC_CODES:
        return code_only
    normalized = f"{original_code} {message}".strip().upper()
    for tokens, code in _MATCHERS:
        if all(token in normalized for token in tokens):
            return code
    return "INPUTXML_DOWNSTREAM_PROOF_FAILED"


def normalized_diagnostic(value: Any) -> dict[str, Any]:
    """Return one bounded diagnostic while retaining its original local code."""
    row = value if isinstance(value, dict) else {"message": str(value)}
    original = str(row.get("code") or "").strip() or None
    severity = str(row.get("severity") or "BLOCKING").upper()
    if severity not in {"INFO", "WARNING", "REVIEW", "BLOCKING"}:
        severity = "BLOCKING"
    context = row.get("context") if isinstance(row.get("context"), dict) else {}
    message = str(row.get("message") or original or "InputXML compatibility evidence blocked.")
    return {
        "severity": severity,
        "code": taxonomy_code(
            original or "DOWNSTREAM_PROOF_FAILED",
            f"{message} {json.dumps(context, sort_keys=True, ensure_ascii=False)}",
        ),
        "message": message,
        "originalCode": original,
        "context": context,
    }


def build_diagnostic_report(
    source_hash: str,
    requested_status: str,
    sources: list[list[Any]],
) -> dict[str, Any]:
    """Build one deterministic report from all distributed diagnostic arrays."""
    normalized = [normalized_diagnostic(row) for rows in sources for row in rows]
    diagnostics = list({
        json.dumps(row, sort_keys=True, ensure_ascii=False): row
        for row in normalized
    }.values())
    diagnostics.sort(key=lambda row: (
        row["severity"], row["code"], row["originalCode"] or "", row["message"],
    ))
    blocked = any(row["severity"] == "BLOCKING" for row in diagnostics)
    status = "DIAGNOSTIC" if requested_status == "DIAGNOSTIC" else ("BLOCKED" if blocked else "PASS")
    base = {
        "schema": "InputXmlDiagnosticReport.v1",
        "status": status,
        "sourceHashSha256": source_hash,
        "diagnostics": diagnostics,
    }
    return {**base, "diagnosticReportHashSha256": hash_without(base, "diagnosticReportHashSha256")}
