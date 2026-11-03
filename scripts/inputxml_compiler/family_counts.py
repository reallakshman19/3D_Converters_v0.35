#!/usr/bin/env python3
"""Count assertions and canonical recomputation for PR-5 family profiles."""
from __future__ import annotations

from lxml import etree as ET

from .base import COUNT_FIELDS, NOZZLE_NAMES, CompileBlocked, DecisionLedger
from .xml import _integer_text, _local, _namespace


def verify_family_source_counts(
    model: ET._Element,
    *,
    ledger: DecisionLedger,
    required: bool,
) -> dict[str, int]:
    actual = family_counts(model)
    for field in COUNT_FIELDS:
        raw = model.get(field)
        if raw is None:
            if required:
                _block(
                    ledger,
                    "SOURCE_COUNT_MISMATCH",
                    f"Full InputXML-family source requires the {field} assertion.",
                    f"PIPINGMODEL@{field}",
                )
            ledger.add(
                source_entity_id=f"PIPINGMODEL@{field}",
                source_type="CONTROL_ASSERTION_OMITTED",
                source_fields={"field": field, "actual": actual[field]},
                disposition="PRESERVE_EXTENSION",
                evidence=["profile permits omitted source assertion; canonical count is recomputed"],
                cii_section="CONTROL",
            )
            continue
        asserted = int(
            _integer_text(raw, f"PIPINGMODEL@{field}", nonnegative=True)
        )
        ledger.add(
            source_entity_id=f"PIPINGMODEL@{field}",
            source_type="CONTROL_ASSERTION",
            source_fields={"field": field, "asserted": asserted, "actual": actual[field]},
            disposition="EMIT_1_TO_1" if asserted == actual[field] else "REJECT_INVALID",
            evidence=["verified against profile count-authority table"],
            diagnostics=[] if asserted == actual[field] else ["source CONTROL count mismatch"],
            cii_section="CONTROL",
        )
        if asserted != actual[field]:
            _block(
                ledger,
                "SOURCE_COUNT_MISMATCH",
                f"Source {field}={asserted} does not match authority count {actual[field]}.",
                f"PIPINGMODEL@{field}",
            )
    return actual


def apply_canonical_counts(model: ET._Element, ledger: DecisionLedger) -> dict[str, int]:
    counts = family_counts(model)
    for field in COUNT_FIELDS:
        model.set(field, str(counts[field]))
        ledger.add(
            source_entity_id=f"canonical:PIPINGMODEL@{field}",
            source_type="CANONICAL_COUNT_RECOMPUTATION",
            source_fields={"field": field, "canonicalCount": counts[field]},
            disposition="EMIT_1_TO_1",
            evidence=["recomputed from emitted canonical records"],
            cii_section="CONTROL",
        )
    return counts


def family_counts(model: ET._Element) -> dict[str, int]:
    elements = [
        child
        for child in model
        if _namespace(child.tag) == "" and _local(child.tag) == "PIPINGELEMENT"
    ]
    return {
        "NUMELT": len(elements),
        "NUMNOZ": sum(
            1
            for child in model
            if _namespace(child.tag) == "" and _local(child.tag) in NOZZLE_NAMES
        ),
        "NOHGRS": _record_count(elements, "HANGER"),
        "NUMBEND": _record_count(elements, "BEND"),
        "NUMRIGID": _record_count(elements, "RIGID"),
        "NUMEXPJNT": _record_count(elements, "EXPANSION_JOINT", "EXPANSIONJOINT"),
        "NUMREST": _owner_count(elements, "RESTRAINT"),
        "NUMFORCMNT": _record_count(elements, "FORCESMOMENTS"),
        "NUMUNFLOAD": _record_count(elements, "UNIFORM"),
        "NUMWIND": _record_count(elements, "WIND"),
        "NUMELEOFF": _record_count(elements, "OFFSETS"),
        "NUMALLOW": _record_count(elements, "ALLOWABLESTRESS"),
        "NUMISECT": _owner_count(elements, "SIF"),
    }


def _record_count(elements: list[ET._Element], *names: str) -> int:
    accepted = set(names)
    return sum(
        1
        for element in elements
        for child in element
        if _namespace(child.tag) == "" and _local(child.tag) in accepted
    )


def _owner_count(elements: list[ET._Element], name: str) -> int:
    return sum(
        1
        for element in elements
        if any(
            _namespace(child.tag) == "" and _local(child.tag) == name
            for child in element
        )
    )


def _block(
    ledger: DecisionLedger,
    code: str,
    message: str,
    source_entity_id: str,
) -> None:
    ledger.diagnostic("BLOCKING", code, message, source_entity_id)
    raise CompileBlocked(message)


__all__ = [
    "apply_canonical_counts",
    "family_counts",
    "verify_family_source_counts",
]
