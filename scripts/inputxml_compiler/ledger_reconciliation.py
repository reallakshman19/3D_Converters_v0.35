from __future__ import annotations

from .base import *
from .xml import *

# These records prove parser/topology decisions but do not themselves own an
# InputXML/CII field. Their downstream elements carry the actual projection.
_SOURCE_ONLY_DISPOSITIONS = {
    ("PDF_INPUT_ECHO", "PARSE_AUTHORITATIVE_INPUT_ECHO_GRAMMAR"),
    ("UXML_ACCEPTED_CONNECTION", "ACCEPT_TOPOLOGY_CONNECTION"),
}
_SOURCE_ONLY_TYPES = {
    "SOURCE_ACCOUNTING_INDEX",
    "SOURCE_ACCOUNTING_PROOF",
    "CONTEXT_FIELD",
    "COORDINATE_DELTA_RECONCILIATION",
    "LINE_SCOPE_BOUNDARY",
    "CATEGORIZED_LINE",
    "CATEGORIZED_ENRICHMENT_EVIDENCE",
    "CATEGORIZED_IDENTITY_EVIDENCE",
    "CATEGORIZED_NORMALIZED_FIELD",
    "CATEGORIZED_ORIGINAL_ELEMENT",
    "CATEGORIZED_TRANSFER_DOCUMENT",
    "CATEGORIZED_TRANSFER_ELEMENT",
    "CATEGORIZED_TRANSFER_BLOCK",
}
_EVIDENCE_IDENTITY_TYPES = {
    "SOURCE_ACCOUNTING_INDEX",
    "CATEGORIZED_NORMALIZED_FIELD",
}
_BRIDGE_DOCUMENT_TYPES = {"ROOT_BRANCH_NODE", "SELECTIONJSON_CUSTOM_ROOT"}
_PR5_SOURCE_AUTHORITATIVE_PROFILES = {
    "canonical-inputxml-v1",
    "caesar-inputxml-pressure1",
    "caesar-inputxml-pressure-c",
    "enriched-inputxml-app",
    "inputxml-fragment",
    "categorized-inputxml-v3",
    "cii14-inputxml",
    "xml-to-cii-diagnostic-sidecar",
}


def _canonical_elements(canonical: ET._Element) -> list[ET._Element]:
    model = next(
        child for child in canonical
        if _namespace(child.tag) == "" and _local(child.tag) == "PIPINGMODEL"
    )
    return [
        child for child in model
        if _namespace(child.tag) == "" and _local(child.tag) == "PIPINGELEMENT"
    ]


def _explicit_node_evidence(
    elements: list[ET._Element],
    ledger: DecisionLedger,
    context: dict[str, Any],
) -> None:
    evidence_map = context.get("assuredNodeEvidence") or {}
    if not isinstance(evidence_map, dict):
        raise CompileBlocked("assuredNodeEvidence must be an object keyed by canonical node number.")
    field_map = {
        "name": ("NAME", "NODENAME"),
        "x": ("X", "COORDS"),
        "y": ("Y", "COORDS"),
        "z": ("Z", "COORDS"),
    }
    for ordinal, element in enumerate(elements, 1):
        element_id = str(element.get("ID") or "")
        canonical_path = f"/CAESARII/PIPINGMODEL[1]/PIPINGELEMENT[{ordinal}]"
        for endpoint, node_attr in (("FROM", "FROM_NODE"), ("TO", "TO_NODE")):
            node = str(int(Decimal(element.get(node_attr)))) if element.get(node_attr) else ""
            node_evidence = evidence_map.get(node)
            if node_evidence is None:
                continue
            if not isinstance(node_evidence, dict):
                raise CompileBlocked(f"assuredNodeEvidence[{node!r}] must be an object.")
            for source_field, (suffix, section) in field_map.items():
                canonical_field = f"{endpoint}_{suffix}"
                if element.get(canonical_field) not in (None, ""):
                    continue
                value = node_evidence.get(source_field)
                if value in (None, ""):
                    continue
                if suffix == "NAME":
                    canonical_value = str(value).strip()
                    if not canonical_value:
                        continue
                else:
                    canonical_value = _decimal_text(
                        value,
                        f"assuredNodeEvidence[{node}]/{source_field}",
                    )
                element.set(canonical_field, canonical_value)
                ledger.add(
                    source_entity_id=f"{canonical_path}@{canonical_field}",
                    source_type="EXPLICIT_ASSURED_NODE_EVIDENCE",
                    source_fields={
                        canonical_field: canonical_value,
                        "node": node,
                        "evidenceField": source_field,
                        "evidenceValue": value,
                    },
                    canonical_element_ids=[element_id],
                    canonical_node_ids=[node],
                    inputxml_element_ids=[element_id],
                    cii_section=section,
                    projection_cardinality="1_TO_1",
                    disposition="EMIT_1_TO_1",
                    evidence=[
                        "explicit caller-supplied assuredNodeEvidence",
                        "canonical element path and owner identity resolved after normalization",
                        "no node name or coordinate inference",
                    ],
                    confidence={
                        "identity": 1.0,
                        "topology": 1.0,
                        "geometry": 1.0,
                        "dimensions": 1.0,
                        "attributes": 1.0,
                        "ciiProjection": 1.0,
                    },
                )


def _evidence_only_identity(record: dict[str, Any]) -> None:
    source_entity_id = str(record.get("sourceEntityId") or "")
    if "@" not in source_entity_id:
        return
    owner, field = source_entity_id.rsplit("@", 1)
    source_fields = record.get("sourceFields")
    if isinstance(source_fields, dict):
        retained_fields = dict(source_fields)
    else:
        retained_fields = {"source": source_fields}
    retained_fields.setdefault("sourceEntityId", source_entity_id)
    record["sourceFields"] = retained_fields
    record["sourceEntityId"] = f"{owner}/evidence::{field}"


def _mark_source_only(record: dict[str, Any], reason: str) -> None:
    record["projectionCardinality"] = "1_TO_0"
    record["disposition"] = "PRESERVE_EXTENSION"
    record["canonicalElementIds"] = []
    record["canonicalNodeIds"] = []
    record["InputXMLElementIds"] = []
    record["CIISection"] = None
    evidence = list(record.get("evidence") or [])
    evidence.append(reason)
    record["evidence"] = evidence
    diagnostics = list(record.get("diagnostics") or [])
    diagnostics.append("retained as evidence only; no direct CII index is claimed")
    record["diagnostics"] = diagnostics


def reconcile_decision_ledger(
    canonical: ET._Element,
    ledger: DecisionLedger,
    *,
    context: dict[str, Any] | None = None,
) -> None:
    """Finalize producer ledger semantics after canonical normalization.

    No engineering value is inferred. Source-only decisions become evidence,
    exact canonical IDs gain InputXML ownership, bridge documents are rebound to
    emitted IDs, and optional node evidence is accepted only by profiles whose
    contracts explicitly predate PR-5 and permit that context.
    """
    elements = _canonical_elements(canonical)
    element_ids = [str(element.get("ID") or "") for element in elements]
    known_element_ids = set(element_ids)
    element_order = {value: index for index, value in enumerate(element_ids)}
    node_ids = sorted({
        str(int(Decimal(element.get(field))))
        for element in elements for field in ("FROM_NODE", "TO_NODE")
        if element.get(field)
    })

    for record in ledger.records:
        source_type = str(record.get("sourceType") or "")
        key = (source_type, str(record.get("disposition") or ""))
        if key in _SOURCE_ONLY_DISPOSITIONS:
            _mark_source_only(
                record,
                "source-only parser/topology decision; emitted element records own InputXML/CII projection",
            )
            continue
        if source_type in _SOURCE_ONLY_TYPES:
            if source_type in _EVIDENCE_IDENTITY_TYPES:
                _evidence_only_identity(record)
            _mark_source_only(
                record,
                "PR-5 source accounting/reconciliation evidence; canonical root, model, and element records own projection",
            )
            continue

        exact_ids = [
            str(value) for value in record.get("canonicalElementIds") or []
            if str(value) in known_element_ids
        ]
        if exact_ids:
            bound = sorted(set(exact_ids), key=element_order.get)
            record["InputXMLElementIds"] = bound
            evidence = list(record.get("evidence") or [])
            evidence.append(
                "InputXML ownership bound only after exact canonical element-ID membership verification"
            )
            record["evidence"] = evidence

        if source_type in _BRIDGE_DOCUMENT_TYPES:
            record["canonicalElementIds"] = element_ids
            record["canonicalNodeIds"] = node_ids
            record["InputXMLElementIds"] = element_ids
            record["CIISection"] = "ELEMENTS"
            evidence = list(record.get("evidence") or [])
            evidence.append(
                "post-normalization canonical IDs resolved by ledger reconciliation"
            )
            record["evidence"] = evidence

    if ledger.dialect not in _PR5_SOURCE_AUTHORITATIVE_PROFILES:
        _explicit_node_evidence(elements, ledger, context or {})


__all__ = [name for name in globals() if not name.startswith("__")]
