#!/usr/bin/env python3
"""Project distributed compiler evidence into the twelve governed resolver responsibilities."""
from __future__ import annotations

import json
from typing import Any

from inputxml_release_policy import hash_without

RESOLVERS = (
    ("InputXmlDialectResolver", ("dialect", "profile")),
    ("NamespaceResolver", ("xml", "namespace")),
    ("FieldAliasResolver", ("alias", "field")),
    ("SentinelInheritanceResolver", ("sentinel", "inherit")),
    ("UnitResolver", ("unit", "measure")),
    ("LineIdentityResolver", ("line", "scope")),
    ("NodeReferenceResolver", ("node", "reference")),
    ("ElementIdentityResolver", ("element", "identity")),
    ("RestraintSlotResolver", ("restraint", "slot")),
    ("CountResolver", ("count", "control")),
    ("ExtensionDispositionResolver", ("extension", "unsupported")),
    ("TopologyParityResolver", ("topology", "parity")),
)


def related_codes(diagnostics: list[dict[str, Any]], tokens: tuple[str, ...]) -> list[str]:
    """Return blocking local codes related to one resolver responsibility."""
    matches = []
    for row in diagnostics:
        if str(row.get("severity") or "BLOCKING").upper() not in {"BLOCKING", "ERROR"}:
            continue
        code = str(row.get("code") or "").upper()
        message = str(row.get("message") or "").upper()
        context = json.dumps(row.get("context") or {}, sort_keys=True).upper()
        if any(token.upper() in code or token.upper() in message or token.upper() in context for token in tokens):
            matches.append(code or "UNSPECIFIED")
    return sorted(set(matches))


def resolver_row(
    name: str,
    tokens: tuple[str, ...],
    status: str,
    diagnostics: list[dict[str, Any]],
    evidence_refs: list[str],
) -> dict[str, Any]:
    """Build one resolver trace row without reimplementing resolver logic."""
    codes = related_codes(diagnostics, tokens)
    row_status = "DIAGNOSTIC" if status == "DIAGNOSTIC" else ("BLOCKED" if codes else status)
    return {
        "resolver": name,
        "status": row_status,
        "evidenceRefs": evidence_refs,
        "diagnosticCodes": codes,
    }


def build_resolver_trace(
    source_hash: str,
    requested_status: str,
    ledger: dict[str, Any],
    validation: dict[str, Any],
    topology_parity: dict[str, Any] | None,
) -> dict[str, Any]:
    """Bind each named resolver to existing compiler/parity evidence."""
    diagnostics = [
        *(ledger.get("diagnostics") or []),
        *(validation.get("diagnostics") or []),
        *((topology_parity or {}).get("diagnostics") or []),
    ]
    base_status = "DIAGNOSTIC" if requested_status == "DIAGNOSTIC" else (
        "PASS" if validation.get("status") == "PASS" else "BLOCKED"
    )
    parity_ref = "topology-parity-report-v2.json" if topology_parity is not None else "canonical-validation.json"
    rows = []
    for name, tokens in RESOLVERS:
        refs = ["canonicalization-ledger.json", "canonical-validation.json"]
        if name == "TopologyParityResolver":
            refs = [parity_ref]
        rows.append(resolver_row(name, tokens, base_status, diagnostics, refs))
    status = "DIAGNOSTIC" if base_status == "DIAGNOSTIC" else (
        "PASS" if all(row["status"] == "PASS" for row in rows) else "BLOCKED"
    )
    base = {
        "schema": "InputXmlResolverTrace.v1",
        "status": status,
        "sourceHashSha256": source_hash,
        "resolvers": rows,
    }
    return {**base, "resolverTraceHashSha256": hash_without(base, "resolverTraceHashSha256")}
