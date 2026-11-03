from .base import *
from .xml import *

_PR5_FAMILY_DIALECTS = {
    "canonical-inputxml-v1",
    "caesar-inputxml-pressure1",
    "caesar-inputxml-pressure-c",
    "enriched-inputxml-app",
    "inputxml-fragment",
    "categorized-inputxml-v3",
    "cii14-inputxml",
    "xml-to-cii-diagnostic-sidecar",
}


def _extension(scope: ET._Element, producer: str, dialect: str) -> ET._Element:
    existing = scope.find(f"{{{EXT_NS}}}Extension")
    if existing is not None:
        return existing
    return ET.SubElement(
        scope,
        ET.QName(EXT_NS, "Extension"),
        schema="inputxml-extension/v1",
        producer=producer,
        dialect=dialect,
    )


def _ensure_extension_last(scope: ET._Element) -> None:
    ext = scope.find(f"{{{EXT_NS}}}Extension")
    if ext is not None and len(scope) and scope[-1] is not ext:
        scope.remove(ext)
        scope.append(ext)


def _extension_record(
    scope: ET._Element,
    *,
    producer: str,
    dialect: str,
    name: str,
    source_path: str,
    source_entity_id: str,
    source_field: str,
    value: str,
    disposition: str,
    criticality: str,
    confidence: float,
) -> None:
    ext = _extension(scope, producer, dialect)
    record = ET.SubElement(
        ext,
        ET.QName(EXT_NS, "Record"),
        name=_safe_ncname(name, "FIELD"),
        sourcePath=source_path,
        sourceEntityId=source_entity_id,
        sourceField=source_field,
        disposition=disposition,
        criticality=criticality,
        confidence=f"{confidence:.2f}",
    )
    record.text = value


def _copy_existing_extension(
    source: ET._Element,
    target: ET._Element,
    ledger: DecisionLedger,
    entity_id: str,
) -> None:
    ext = source.find(f"{{{EXT_NS}}}Extension")
    if ext is None:
        return
    target_ext = _extension(target, ledger.producer, ledger.dialect)
    wrapper_id = f"{entity_id}/Extension[1]"
    wrapper_attributes = dict(ext.attrib)
    ledger.add(
        source_entity_id=wrapper_id,
        source_type="EXTENSION_WRAPPER",
        source_fields={"attributes": wrapper_attributes},
        projection_cardinality="1_TO_0",
        disposition="PRESERVE_EXTENSION",
        evidence=[
            "source extension-wrapper identity and metadata are retained separately from compiler-owned wrapper metadata"
        ],
    )
    _preserve_extension_wrapper_metadata(
        target,
        target_ext,
        wrapper_id,
        wrapper_attributes,
        ledger,
    )
    for index, record in enumerate(
        ext.findall(f"{{{EXT_NS}}}Record"),
        1,
    ):
        target_ext.append(copy.deepcopy(record))
        disposition = record.get("disposition") or "UNSUPPORTED_BLOCKING"
        ledger.add(
            source_entity_id=f"{wrapper_id}/Record[{index}]",
            source_type="EXTENSION_RECORD",
            source_fields={
                "attributes": dict(record.attrib),
                "text": record.text or "",
            },
            projection_cardinality="1_TO_0",
            disposition=disposition,
            evidence=["existing extension record preserved verbatim"],
        )
    _ensure_extension_last(target)


def _preserve_extension_wrapper_metadata(
    target: ET._Element,
    target_ext: ET._Element,
    wrapper_id: str,
    source_attributes: dict[str, str],
    ledger: DecisionLedger,
) -> None:
    for name in ("schema", "producer", "dialect"):
        value = source_attributes.get(name)
        if value is None or target_ext.get(name) == value:
            continue
        _extension_record(
            target,
            producer=ledger.producer,
            dialect=ledger.dialect,
            name=f"SourceExtension{name.title()}",
            source_path=ledger.source_path,
            source_entity_id=wrapper_id,
            source_field=name,
            value=value,
            disposition="PRESERVE_EXTENSION",
            criticality="MEDIUM",
            confidence=1.0,
        )


def _preserve_attr(
    target_scope: ET._Element,
    source_path: str,
    entity_id: str,
    name: str,
    value: str,
    ledger: DecisionLedger,
    *,
    blocking: bool,
) -> None:
    disposition = "UNSUPPORTED_BLOCKING" if blocking else "PRESERVE_EXTENSION"
    criticality = "BLOCKING" if blocking else "MEDIUM"
    _extension_record(
        target_scope,
        producer=ledger.producer,
        dialect=ledger.dialect,
        name=name,
        source_path=source_path,
        source_entity_id=entity_id,
        source_field=name,
        value=value,
        disposition=disposition,
        criticality=criticality,
        confidence=1.0,
    )
    ledger.add(
        source_entity_id=f"{entity_id}@{name}",
        source_type="ATTRIBUTE",
        source_fields={name: value},
        disposition=disposition,
        evidence=["preserved in explicit extension namespace"],
    )
    _diagnose_family_blocking_evidence(
        ledger,
        blocking=blocking,
        source_entity_id=f"{entity_id}@{name}",
        evidence_kind="attribute",
        evidence_name=name,
    )


def _preserve_child(
    target_scope: ET._Element,
    child: ET._Element,
    source_path: str,
    entity_id: str,
    ledger: DecisionLedger,
    *,
    blocking: bool,
) -> None:
    name = _local(child.tag)
    value = ET.tostring(child, encoding="unicode")
    disposition = "UNSUPPORTED_BLOCKING" if blocking else "PRESERVE_EXTENSION"
    _extension_record(
        target_scope,
        producer=ledger.producer,
        dialect=ledger.dialect,
        name=name,
        source_path=source_path,
        source_entity_id=entity_id,
        source_field=name,
        value=value,
        disposition=disposition,
        criticality="BLOCKING" if blocking else "MEDIUM",
        confidence=1.0,
    )
    ledger.add(
        source_entity_id=f"{entity_id}/{name}",
        source_type="CHILD_ELEMENT",
        source_fields={"xml": value},
        disposition=disposition,
        evidence=["preserved in explicit extension namespace"],
    )
    _diagnose_family_blocking_evidence(
        ledger,
        blocking=blocking,
        source_entity_id=f"{entity_id}/{name}",
        evidence_kind="child",
        evidence_name=name,
    )


def _diagnose_family_blocking_evidence(
    ledger: DecisionLedger,
    *,
    blocking: bool,
    source_entity_id: str,
    evidence_kind: str,
    evidence_name: str,
) -> None:
    if not blocking or ledger.dialect not in _PR5_FAMILY_DIALECTS:
        return
    ledger.diagnostic(
        "BLOCKING",
        "UNSUPPORTED_ENGINEERING_FIELD",
        f"Unmapped {evidence_kind} {evidence_name!r} is retained and blocks production.",
        source_entity_id,
        evidenceKind=evidence_kind,
        evidenceName=evidence_name,
    )


__all__ = [name for name in globals() if not name.startswith("__")]
