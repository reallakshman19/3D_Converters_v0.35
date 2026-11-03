from __future__ import annotations

import hashlib
import json
from typing import Any

from .base import CompileBlocked

_SCOPE_SCHEMA = "PdfInputEchoLineScopeSet.v1"
_SCOPE_FIELDS = {
    "lineScopeId", "lineId", "sourceAuthority", "blockMembership",
    "firstBlock", "lastBlock", "sourceEvidenceReferences",
}
_ALLOWED_AUTHORITIES = {
    "CALLER_SUPPLIED_SCOPE_MAP",
    "REPORT_LINE_IDENTITY",
}
_FORBIDDEN_TEXT = {"", "unknown", "default", "filename", "job name", "jobname"}


def validate_line_scopes(
    context: dict[str, Any],
    *,
    block_count: int,
) -> tuple[list[dict[str, Any]], dict[int, dict[str, Any]], dict[str, Any]]:
    raw_scopes = context.get("lineScopes")
    if not isinstance(raw_scopes, list) or not raw_scopes:
        raise CompileBlocked(
            "PDF Input Echo requires explicit lineScopes; lineId/defaultLine alone cannot establish line cardinality."
        )
    scopes: list[dict[str, Any]] = []
    scope_ids: set[str] = set()
    line_ids: set[str] = set()
    by_block: dict[int, dict[str, Any]] = {}
    previous_last = 0
    for position, raw in enumerate(raw_scopes, 1):
        if not isinstance(raw, dict) or set(raw) != _SCOPE_FIELDS:
            raise CompileBlocked(f"PDF line scope #{position} has an invalid field contract.")
        scope_id = _authority_text(raw.get("lineScopeId"), f"lineScopes[{position}].lineScopeId")
        line_id = _authority_text(raw.get("lineId"), f"lineScopes[{position}].lineId")
        authority = str(raw.get("sourceAuthority") or "").strip()
        if authority not in _ALLOWED_AUTHORITIES:
            raise CompileBlocked(
                f"PDF line scope {scope_id} sourceAuthority must be one of {sorted(_ALLOWED_AUTHORITIES)}."
            )
        if scope_id in scope_ids:
            raise CompileBlocked(f"PDF line scope ID {scope_id!r} is duplicated.")
        if line_id in line_ids:
            raise CompileBlocked(f"PDF line ID {line_id!r} is assigned to more than one scope.")
        membership = _membership(raw.get("blockMembership"), scope_id, block_count)
        first_block = _positive_int(raw.get("firstBlock"), f"{scope_id}.firstBlock")
        last_block = _positive_int(raw.get("lastBlock"), f"{scope_id}.lastBlock")
        if first_block != membership[0] or last_block != membership[-1]:
            raise CompileBlocked(f"PDF line scope {scope_id} first/last block contradicts membership.")
        if first_block != previous_last + 1:
            raise CompileBlocked("PDF line scopes are reordered, overlapping, or contain an inter-scope gap.")
        references = _references(raw.get("sourceEvidenceReferences"), scope_id)
        scope = {
            "lineScopeId": scope_id,
            "lineId": line_id,
            "sourceAuthority": authority,
            "blockMembership": membership,
            "firstBlock": first_block,
            "lastBlock": last_block,
            "sourceEvidenceReferences": references,
        }
        scope["lineScopeHashSha256"] = _hash(_canonical_bytes(scope))
        for block_index in membership:
            if block_index in by_block:
                raise CompileBlocked(f"PDF source block {block_index} is assigned to two line scopes.")
            by_block[block_index] = scope
        scopes.append(scope)
        scope_ids.add(scope_id)
        line_ids.add(line_id)
        previous_last = last_block
    expected = set(range(1, block_count + 1))
    actual = set(by_block)
    if actual != expected:
        raise CompileBlocked(
            f"PDF line-scope membership does not exactly cover source blocks: missing={sorted(expected-actual)}, extra={sorted(actual-expected)}."
        )
    scope_set = {
        "schema": _SCOPE_SCHEMA,
        "scopeCount": len(scopes),
        "blockCount": block_count,
        "scopes": scopes,
    }
    scope_set["lineScopeSetHashSha256"] = _hash(_canonical_bytes(scope_set))
    return scopes, by_block, scope_set


def _membership(value: Any, scope_id: str, block_count: int) -> list[int]:
    if not isinstance(value, list) or not value:
        raise CompileBlocked(f"PDF line scope {scope_id} blockMembership must be a non-empty array.")
    membership: list[int] = []
    for raw in value:
        block = _positive_int(raw, f"{scope_id}.blockMembership")
        if block > block_count:
            raise CompileBlocked(f"PDF line scope {scope_id} references nonexistent source block {block}.")
        membership.append(block)
    if membership != sorted(membership) or len(membership) != len(set(membership)):
        raise CompileBlocked(f"PDF line scope {scope_id} membership is reordered or duplicated.")
    expected = list(range(membership[0], membership[-1] + 1))
    if membership != expected:
        raise CompileBlocked(f"PDF line scope {scope_id} contains an internal source-block gap.")
    return membership


def _references(value: Any, scope_id: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise CompileBlocked(f"PDF line scope {scope_id} requires sourceEvidenceReferences.")
    rows = [_authority_text(item, f"{scope_id}.sourceEvidenceReferences") for item in value]
    if len(rows) != len(set(rows)):
        raise CompileBlocked(f"PDF line scope {scope_id} has duplicate source evidence references.")
    return rows


def _positive_int(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise CompileBlocked(f"PDF line scope field {field} must be a positive integer.")
    return value


def _authority_text(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if text.lower() in _FORBIDDEN_TEXT:
        raise CompileBlocked(f"PDF line scope field {field} lacks explicit source authority.")
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


__all__ = ["validate_line_scopes"]
