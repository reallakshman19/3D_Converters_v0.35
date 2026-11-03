#!/usr/bin/env python3
"""Build and validate route-bound InputXmlCompatibilityRequest.v1 evidence."""
from __future__ import annotations

from typing import Any

from inputxml_release_policy import hash_without, sha256

ROUTE_DIRECTIONS = {
    "stagedjson_to_inputxml": "INPUTXML_PRODUCER",
    "seljson_to_inputxml": "INPUTXML_PRODUCER",
    "pdf_to_inputxml": "INPUTXML_PRODUCER",
    "pdf_to_inputxml_cii14": "INPUTXML_PRODUCER",
    "inputxml_to_xml": "INPUTXML_CONSUMER",
    "inputxml_to_cii": "INPUTXML_CONSUMER",
    "inputxml14_to_cii": "INPUTXML_CONSUMER",
    "inputxml_to_cii2019": "INPUTXML_CONSUMER",
    "component_topology_inputxml_writer": "TOPOLOGY_WRITER",
}
VALID_MODES = {"CANONICAL_STRICT", "ADAPTED_CANONICAL", "DIAGNOSTIC_ONLY"}


class InputXmlCompatibilityRequestError(RuntimeError):
    """Raised when compatibility intent is missing, contradictory, or stale."""


def build_compatibility_request(
    converter_id: str,
    mode: str,
    source_name: str,
    source: bytes,
    approval_id: str | None,
) -> dict[str, Any]:
    """Build one exact-source compatibility request for a governed route."""
    direction = ROUTE_DIRECTIONS.get(converter_id)
    if direction is None:
        raise InputXmlCompatibilityRequestError(
            f"Unsupported InputXML compatibility route: {converter_id}."
        )
    if mode not in VALID_MODES:
        raise InputXmlCompatibilityRequestError(
            f"Unsupported InputXML compatibility mode: {mode}."
        )
    if not source_name.strip():
        raise InputXmlCompatibilityRequestError("InputXML source name is required.")
    if approval_id is not None and mode != "ADAPTED_CANONICAL":
        raise InputXmlCompatibilityRequestError(
            "Approved semantic split requires ADAPTED_CANONICAL mode."
        )
    base = {
        "schema": "InputXmlCompatibilityRequest.v1",
        "converterId": converter_id,
        "direction": direction,
        "mode": mode,
        "sourceName": source_name,
        "sourceHashSha256": sha256(source),
        "approvedSemanticSplitId": approval_id,
    }
    return {
        **base,
        "requestHashSha256": hash_without(base, "requestHashSha256"),
    }


def validate_compatibility_request(
    value: dict[str, Any],
    source_name: str,
    source: bytes,
    mode: str,
    approval_id: str | None,
) -> dict[str, Any]:
    """Require request metadata and hashes to match the exact current operation."""
    if value.get("schema") != "InputXmlCompatibilityRequest.v1":
        raise InputXmlCompatibilityRequestError(
            "InputXML compatibility request schema is invalid."
        )
    expected = build_compatibility_request(
        str(value.get("converterId") or ""),
        mode,
        source_name,
        source,
        approval_id,
    )
    for field in (
        "direction",
        "mode",
        "sourceName",
        "sourceHashSha256",
        "approvedSemanticSplitId",
        "requestHashSha256",
    ):
        if value.get(field) != expected[field]:
            raise InputXmlCompatibilityRequestError(
                f"InputXML compatibility request {field} does not match the exact operation."
            )
    return expected
