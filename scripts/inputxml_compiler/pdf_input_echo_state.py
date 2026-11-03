from __future__ import annotations

from typing import Any

from converters.scripts import pdf_to_inputxml as pdf_parser

from .base import CompileBlocked, DecisionLedger
from .pdf_input_echo_state_fields import (
    ALL_STATE_FIELDS,
    LINE_STATE_POLICY_ID,
    OPTIONAL_STATE_FIELDS,
    REQUIRED_STATE_FIELDS,
    canonical_state_value,
    explicit_fields,
    field_value,
    line_state_policy,
    state_value_missing,
)


def resolve_line_scoped_blocks(
    blocks: list[dict[str, Any]],
    by_block: dict[int, dict[str, Any]],
    ledger: DecisionLedger,
) -> list[dict[str, Any]]:
    state_by_scope: dict[str, dict[str, dict[str, Any]]] = {}
    resolved: list[dict[str, Any]] = []
    for block_index, block in enumerate(blocks, 1):
        scope = by_block[block_index]
        scope_id = str(scope["lineScopeId"])
        entity_id = f"PDF-PE-{block_index:06d}"
        element = _parse_isolated_block(block)
        explicit = explicit_fields(block, element)
        scope_state = state_by_scope.setdefault(scope_id, {})
        values: dict[str, str | None] = {}
        for field in ALL_STATE_FIELDS:
            value = _resolve_field(
                field=field,
                parsed_value=field_value(field, element),
                explicit=field in explicit,
                scope_state=scope_state,
                scope=scope,
                block_index=block_index,
                entity_id=entity_id,
                ledger=ledger,
            )
            values[field] = value
        resolved.append({
            "blockIndex": block_index,
            "blockId": _block_id(block_index),
            "block": block,
            "entityId": entity_id,
            "lineScope": scope,
            "element": element,
            "explicitFields": sorted(explicit),
            "stateDecisionFields": list(ALL_STATE_FIELDS),
            "stateValues": {
                field: str(values[field]) for field in REQUIRED_STATE_FIELDS
            },
            "mechanicalValues": {
                field: values[field]
                for field in OPTIONAL_STATE_FIELDS
                if values[field] is not None
            },
        })
    return resolved


def _resolve_field(
    *,
    field: str,
    parsed_value: Any,
    explicit: bool,
    scope_state: dict[str, dict[str, Any]],
    scope: dict[str, Any],
    block_index: int,
    entity_id: str,
    ledger: DecisionLedger,
) -> str | None:
    if explicit:
        if state_value_missing(field, parsed_value):
            raise CompileBlocked(
                f"PDF line scope {scope['lineScopeId']} block {block_index} "
                f"explicitly supplies unresolved or sentinel state for {field}."
            )
        value = canonical_state_value(field, parsed_value)
        scope_state[field] = _state_entry(value, block_index, entity_id)
        _record_decision(
            ledger,
            entity_id=entity_id,
            block_index=block_index,
            scope=scope,
            field=field,
            value=value,
            source_type="PDF_INPUT_ECHO_EXPLICIT_FIELD",
            disposition="EMIT_EXPLICIT_SOURCE_VALUE",
            evidence="explicit field marker in the exact source PIPE DATA block",
        )
        return value
    prior = scope_state.get(field)
    if prior is None:
        if field in REQUIRED_STATE_FIELDS:
            raise CompileBlocked(
                f"First element of PDF line scope {scope['lineScopeId']} must "
                f"explicitly establish {field} under {LINE_STATE_POLICY_ID}."
            )
        scope_state[field] = _state_entry(None, block_index, entity_id)
        _record_decision(
            ledger,
            entity_id=entity_id,
            block_index=block_index,
            scope=scope,
            field=field,
            value=None,
            source_type="PDF_INPUT_ECHO_EXPLICIT_ABSENCE",
            disposition="RETAIN_EXPLICIT_ABSENCE_EVIDENCE",
            evidence="optional line-state field is absent on the line-start source block",
        )
        return None
    value = prior["value"]
    _record_inheritance(
        ledger,
        entity_id=entity_id,
        block_index=block_index,
        scope=scope,
        field=field,
        value=value,
        prior=prior,
    )
    prior["lastBlockId"] = _block_id(block_index)
    prior["lastElementId"] = entity_id
    return value


def _parse_isolated_block(block: dict[str, Any]) -> Any:
    text = "\n".join([
        "CAESAR II Input Echo",
        "Input Listing",
        "PIPE DATA",
        str(block["header"]),
        *(str(line) for line in block.get("lines") or []),
        "NODENAMES",
    ])
    try:
        elements = pdf_parser._parse_input_echo_elements(text)
    except Exception as exc:
        raise CompileBlocked(
            f"PDF Input Echo isolated source-block parsing failed: {exc}"
        ) from exc
    if len(elements) != 1:
        raise CompileBlocked(
            "PDF Input Echo isolated source block did not produce exactly one parsed element."
        )
    return elements[0]


def _state_entry(
    value: str | None,
    block_index: int,
    entity_id: str,
) -> dict[str, Any]:
    return {
        "value": value,
        "originBlockId": _block_id(block_index),
        "originElementId": entity_id,
        "lastBlockId": _block_id(block_index),
        "lastElementId": entity_id,
    }


def _record_decision(
    ledger: DecisionLedger,
    *,
    entity_id: str,
    block_index: int,
    scope: dict[str, Any],
    field: str,
    value: str | None,
    source_type: str,
    disposition: str,
    evidence: str,
) -> None:
    ledger.add(
        source_entity_id=f"{entity_id}@{field}",
        source_type=source_type,
        source_fields={
            "field": field,
            "value": value,
            "sourceBlockId": _block_id(block_index),
            "lineScopeId": scope["lineScopeId"],
            "lineId": scope["lineId"],
            "lineStatePolicyId": LINE_STATE_POLICY_ID,
        },
        canonical_element_ids=[entity_id],
        inputxml_element_ids=[entity_id],
        cii_section="ELEMENTS" if field in REQUIRED_STATE_FIELDS else None,
        projection_cardinality="1_TO_1" if value is not None else "1_TO_0",
        disposition=disposition,
        evidence=[evidence],
    )


def _record_inheritance(
    ledger: DecisionLedger,
    *,
    entity_id: str,
    block_index: int,
    scope: dict[str, Any],
    field: str,
    value: str | None,
    prior: dict[str, Any],
) -> None:
    absent = value is None
    ledger.add(
        source_entity_id=f"{entity_id}@{field}",
        source_type=(
            "PDF_INPUT_ECHO_INHERITED_ABSENCE"
            if absent else "PDF_INPUT_ECHO_INHERITANCE"
        ),
        source_fields={
            "field": field,
            "value": value,
            "sourceBlockId": _block_id(block_index),
            "lineScopeId": scope["lineScopeId"],
            "lineId": scope["lineId"],
            "predecessorBlockId": prior["lastBlockId"],
            "predecessorElementId": prior["lastElementId"],
            "predecessorLineScopeId": scope["lineScopeId"],
            "originBlockId": prior["originBlockId"],
            "originElementId": prior["originElementId"],
            "lineStatePolicyId": LINE_STATE_POLICY_ID,
        },
        canonical_element_ids=[entity_id],
        inputxml_element_ids=[entity_id],
        cii_section="ELEMENTS" if field in REQUIRED_STATE_FIELDS else None,
        projection_cardinality="1_TO_0" if absent else "1_TO_1",
        disposition=(
            "INHERIT_SAME_LINE_SCOPE_ABSENCE"
            if absent else "INHERIT_SAME_LINE_SCOPE"
        ),
        evidence=[
            "exact predecessor and explicit origin are in the same proven line scope"
        ],
    )


def _block_id(index: int) -> str:
    return f"PDF-BLOCK-{index:06d}"


__all__ = ["line_state_policy", "resolve_line_scoped_blocks"]
