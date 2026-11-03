from __future__ import annotations

import json
import re
from typing import Any

from .base import DecisionLedger, ET
from .extension import _extension_record
from .xml import _decimal_text

_SPECIAL_RIGID_TOKENS = (
    "VALVE", "FLANGE", "FLAN", "GASK", "BLIND", "INSTRUMENT", "REDUCER",
)
_UNSUPPORTED_REPORT_MARKERS = {
    "HANGERS": re.compile(r"(?im)^\s*HANGERS?\s*$"),
    "DISPLACEMENTS": re.compile(r"(?im)^\s*DISPLACEMENTS?\s*$"),
    "FORCESMOMENTS": re.compile(
        r"(?im)^\s*(?:FORCES?\s*(?:AND|/)?\s*MOMENTS?|FORCE/MOMENT)\s*$"
    ),
    "UNIFORM": re.compile(r"(?im)^\s*UNIFORM(?:\s+LOADS?)?\s*$"),
    "WIND": re.compile(r"(?im)^\s*WIND(?:\s+LOADS?)?\s*$"),
    "OFFSETS": re.compile(r"(?im)^\s*OFFSETS?\s*$"),
    "ALLOWABLESTRESS": re.compile(r"(?im)^\s*ALLOWABLE\s+STRESS(?:ES)?\s*$"),
}


def preserve_report_record(
    scope: ET._Element,
    *,
    name: str,
    value: Any,
    ledger: DecisionLedger,
    entity_id: str,
    disposition: str = "PRESERVE_EXTENSION",
    criticality: str = "MEDIUM",
) -> None:
    text = value if isinstance(value, str) else json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )
    _extension_record(
        scope,
        producer=ledger.producer,
        dialect=ledger.dialect,
        name=name,
        source_path=ledger.source_path,
        source_entity_id=entity_id,
        source_field=name,
        value=text,
        disposition=disposition,
        criticality=criticality,
        confidence=1.0,
    )
    ledger.add(
        source_entity_id=f"{entity_id}@{name}",
        source_type="PDF_INPUT_ECHO_EVIDENCE",
        source_fields={name: value},
        projection_cardinality="1_TO_0",
        disposition=disposition,
        evidence=["validated CAESAR Input Echo source evidence"],
    )


def append_pdf_bend(
    target: ET._Element,
    bend: Any,
    ledger: DecisionLedger,
    entity_id: str,
) -> None:
    if bend.radius_mm <= 0:
        ledger.add(
            source_entity_id=f"{entity_id}/BEND",
            source_type="PDF_BEND",
            source_fields=vars(bend),
            projection_cardinality="1_TO_0",
            disposition="UNSUPPORTED_BLOCKING",
            diagnostics=["Input Echo bend has no positive radius"],
        )
        return
    child = ET.SubElement(
        target,
        "BEND",
        RADIUS=_decimal_text(bend.radius_mm, "BEND@RADIUS"),
    )
    for suffix, angle, node in (
        ("1", bend.angle1, bend.node1),
        ("2", bend.angle2, bend.node2),
        ("3", bend.angle3, bend.node3),
    ):
        if node and node > 0:
            child.set(f"ANGLE{suffix}", _decimal_text(angle, f"BEND@ANGLE{suffix}"))
            child.set(f"NODE{suffix}", str(int(node)))
        elif angle and abs(angle) > 1e-12:
            ledger.add(
                source_entity_id=f"{entity_id}/BEND@ANGLE{suffix}",
                source_type="PDF_BEND_ANGLE",
                source_fields={"angle": angle, "node": node},
                projection_cardinality="1_TO_0",
                disposition="UNSUPPORTED_BLOCKING",
                diagnostics=["Bend angle has no owning node"],
            )
    ledger.add(
        source_entity_id=f"{entity_id}/BEND",
        source_type="PDF_BEND",
        source_fields=vars(bend),
        canonical_element_ids=[entity_id],
        cii_section="BEND",
        projection_cardinality="1_TO_1",
        disposition="ATTACH_AUXILIARY",
    )


def append_pdf_rigid(
    target: ET._Element,
    element: Any,
    ledger: DecisionLedger,
    entity_id: str,
) -> None:
    if element.rigid_weight_kg is None:
        return
    rigid_type = str(element.rigid_type or "").strip()
    ET.SubElement(
        target,
        "RIGID",
        WEIGHT=_decimal_text(element.rigid_weight_kg, "RIGID@WEIGHT"),
    )
    special_identity = any(token in rigid_type.upper() for token in _SPECIAL_RIGID_TOKENS)
    preserve_report_record(
        target,
        name="PdfRigidType",
        value=rigid_type or "UNSPECIFIED",
        ledger=ledger,
        entity_id=entity_id,
        disposition="UNSUPPORTED_BLOCKING" if special_identity else "PRESERVE_EXTENSION",
        criticality="BLOCKING" if special_identity else "MEDIUM",
    )
    ledger.add(
        source_entity_id=f"{entity_id}/RIGID",
        source_type="PDF_RIGID",
        source_fields={"weightKg": element.rigid_weight_kg, "type": rigid_type},
        canonical_element_ids=[entity_id],
        cii_section="RIGID",
        projection_cardinality="1_TO_1",
        disposition="UNSUPPORTED_BLOCKING" if special_identity else "ATTACH_AUXILIARY",
        diagnostics=(
            ["special rigid component identity requires an approved component projection"]
            if special_identity else []
        ),
    )


def preserve_incomplete_auxiliaries(
    target: ET._Element,
    element: Any,
    ledger: DecisionLedger,
    entity_id: str,
) -> None:
    if element.restraints:
        rows = [vars(row) for row in element.restraints]
        diagnostic = (
            "Input Echo contains more than six restraints on one owner element"
            if len(rows) > 6
            else "Input Echo restraint grammar does not recover stiffness, gap, friction, or connecting-node semantics"
        )
        preserve_report_record(
            target,
            name="PdfRestraints",
            value=rows,
            ledger=ledger,
            entity_id=entity_id,
            disposition="UNSUPPORTED_BLOCKING",
            criticality="BLOCKING",
        )
        ledger.add(
            source_entity_id=f"{entity_id}/RESTRAINTS",
            source_type="PDF_RESTRAINT_BLOCK",
            source_fields=rows,
            canonical_element_ids=[entity_id],
            cii_section="RESTRANT",
            projection_cardinality="MANY_TO_ZERO",
            disposition="UNSUPPORTED_BLOCKING",
            diagnostics=[diagnostic],
        )
    if element.sifs:
        rows = [vars(row) for row in element.sifs]
        preserve_report_record(
            target,
            name="PdfSifTeeRecords",
            value=rows,
            ledger=ledger,
            entity_id=entity_id,
            disposition="UNSUPPORTED_BLOCKING",
            criticality="BLOCKING",
        )
        ledger.add(
            source_entity_id=f"{entity_id}/SIF",
            source_type="PDF_SIF_TEE_BLOCK",
            source_fields=rows,
            canonical_element_ids=[entity_id],
            cii_section="SIF&TEES",
            projection_cardinality="MANY_TO_ZERO",
            disposition="UNSUPPORTED_BLOCKING",
            diagnostics=[
                "Input Echo SIF labels/types are meaningful but the verified canonical SIF field contract is incomplete"
            ],
        )


def preserve_unsupported_sections(
    text: str,
    model: ET._Element,
    ledger: DecisionLedger,
) -> list[str]:
    identities: list[str] = []
    for marker, pattern in _UNSUPPORTED_REPORT_MARKERS.items():
        if not pattern.search(text):
            continue
        entity_id = f"document/section/{marker}"
        identities.append(entity_id)
        preserve_report_record(
            model,
            name=f"PdfUnsupportedSection_{marker}",
            value=marker,
            ledger=ledger,
            entity_id=entity_id,
            disposition="UNSUPPORTED_BLOCKING",
            criticality="BLOCKING",
        )
        ledger.add(
            source_entity_id=entity_id,
            source_type="PDF_UNSUPPORTED_REPORT_SECTION",
            source_fields={"section": marker},
            projection_cardinality="1_TO_0",
            disposition="UNSUPPORTED_BLOCKING",
            diagnostics=[f"PDF Input Echo section {marker} has no authorized engineering projection"],
        )
    return identities


def preserve_unparsed_tail(
    text: str,
    model: ET._Element,
    ledger: DecisionLedger,
) -> None:
    parts = re.split(r"(?im)^\s*NODENAMES\s*$", text, maxsplit=1)
    if len(parts) != 2 or not parts[1].strip():
        return
    value = parts[1].strip()
    preserve_report_record(
        model,
        name="PdfUnparsedReportEvidence",
        value=value,
        ledger=ledger,
        entity_id="document/unparsed-tail",
        disposition="UNSUPPORTED_BLOCKING",
        criticality="BLOCKING",
    )
    ledger.add(
        source_entity_id="document/unparsed-tail",
        source_type="PDF_UNPARSED_REPORT_EVIDENCE",
        source_fields={"text": value},
        projection_cardinality="1_TO_0",
        disposition="UNSUPPORTED_BLOCKING",
        diagnostics=["Report evidence after NODENAMES is unparsed and cannot be silently ignored"],
    )


__all__ = [
    "append_pdf_bend",
    "append_pdf_rigid",
    "preserve_incomplete_auxiliaries",
    "preserve_report_record",
    "preserve_unparsed_tail",
    "preserve_unsupported_sections",
]
