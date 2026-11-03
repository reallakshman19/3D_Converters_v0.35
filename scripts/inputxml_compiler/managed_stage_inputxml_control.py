#!/usr/bin/env python3
"""Managed-stage topology InputXML control counts and document context."""
from __future__ import annotations

from typing import Any

from lxml import etree as ET

from .base import COUNT_FIELDS, DecisionLedger
from .managed_stage_diagnostics import block, retain_blocker
from .managed_stage_inputxml_elements import decimal_lexical, integer_lexical, same_decimal
from .managed_stage_intake import ManagedStageIntake

_MODEL_TRACE = {
    "CANONICAL_TOPOLOGY_HASH", "TOPOLOGY_TRACE_LEDGER_HASH",
    "TOPOLOGY_EDIT_DRAFT_HASH", "TOPOLOGY_EDIT_LEDGER_HASH",
}
_MODEL_CANONICAL = {
    "JOBNAME", "TIME", "ISSUE_NO", *COUNT_FIELDS, "NORTH_X", "NORTH_Y", "NORTH_Z",
}


def reconcile_counts(
    model: ET._Element,
    elements: list[ET._Element],
    topology: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    actual = {field: 0 for field in COUNT_FIELDS}
    actual.update({
        "NUMELT": len(elements),
        "NUMBEND": sum(len(element.findall("BEND")) for element in elements),
        "NUMRIGID": sum(1 for element in elements if element.find("RIGID") is not None),
        "NUMREST": sum(1 for element in elements if element.find("RESTRAINT") is not None),
    })
    has_bend_topology = any(
        str(row.get("segmentRole") or "").startswith("ELBO/BEND")
        for row in topology["collections"]["edges"]
    )
    for field, value in actual.items():
        asserted = int(integer_lexical(
            model.get(field, ""),
            f"PIPINGMODEL@{field}",
            ledger,
            positive=False,
        ))
        disposition = "EMIT_1_TO_1"
        if asserted != value:
            if field == "NUMBEND" and value == 0 and has_bend_topology:
                disposition = "DEFER_EXPLICITLY"
                retain_blocker(
                    ledger,
                    "MANAGED_STAGE_BEND_PROJECTION_GAP",
                    "Bend topology exists but no canonical BEND child was emitted.",
                    "PIPINGMODEL@NUMBEND",
                    asserted=asserted,
                    canonical=value,
                )
            else:
                block(
                    ledger,
                    "MANAGED_STAGE_COUNT_MISMATCH",
                    f"Producer count {field}={asserted} differs from canonical value {value}.",
                    f"PIPINGMODEL@{field}",
                )
        ledger.add(
            source_entity_id=f"topologyInputXml/PIPINGMODEL@{field}",
            source_type="MANAGED_STAGE_COUNT_ASSERTION",
            source_fields={
                "field": field,
                "asserted": asserted,
                "canonical": value,
                "countAuthority": "PR5_CANONICAL_OWNER_DEFINITION",
            },
            cii_section="CONTROL",
            projection_cardinality="1_TO_1",
            disposition=disposition,
            evidence=[
                "producer NUM* assertion reconciled to canonical count authority",
                "NUMREST counts owner elements containing active restraints",
            ],
        )
        model.set(field, str(value))


def apply_document_context(
    root: ET._Element,
    model: ET._Element,
    intake: ManagedStageIntake,
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    context = intake.source_context
    asserted = {
        "version": root.get("VERSION") or "",
        "jobName": model.get("JOBNAME") or "",
        "north": [model.get(field) or "" for field in ("NORTH_X", "NORTH_Y", "NORTH_Z")],
    }
    if asserted["jobName"] != context["jobName"]:
        block(
            ledger,
            "MANAGED_STAGE_INPUTXML_RELATION_MISMATCH",
            "Compatibility topology InputXML JOBNAME differs from explicit request context.",
            "topologyInputXml/PIPINGMODEL@JOBNAME",
            asserted=asserted["jobName"],
            expected=context["jobName"],
        )
    ledger.add(
        source_entity_id="topologyInputXml/compatibility-document-context",
        source_type="MANAGED_STAGE_COMPATIBILITY_CONTEXT_ASSERTION",
        source_fields={
            "asserted": asserted,
            "authoritative": {
                "version": context["version"],
                "jobName": context["jobName"],
                "north": context["north"],
            },
            "authorityRule": "PROFILE_CONTEXT_OVERRIDES_COMPATIBILITY_WRAPPER_ONLY",
        },
        cii_section="VERSION",
        projection_cardinality="1_TO_1",
        disposition="EMIT_1_TO_1",
        evidence=[
            "compatibility writer topology and trace evidence were verified before wrapper replacement",
            "compatibility InputXML cannot redefine explicit managed-stage document context",
        ],
    )
    root.set("VERSION", context["version"])
    model.set("JOBNAME", context["jobName"])
    for field, value in zip(("NORTH_X", "NORTH_Y", "NORTH_Z"), context["north"]):
        model.set(field, decimal_lexical(value, f"compiler-context@{field}", ledger))
    for key, field in (("time", "TIME"), ("issueNo", "ISSUE_NO")):
        value = str(context.get(key) or "").strip()
        if value:
            model.set(field, value)
        else:
            model.attrib.pop(field, None)
    for key in ("version", "jobName", "north", "time", "issueNo"):
        if key not in context:
            continue
        ledger.add(
            source_entity_id=f"compiler-context@{key}",
            source_type="MANAGED_STAGE_CONTEXT_FIELD",
            source_fields={"key": key, "value": context[key]},
            cii_section="VERSION",
            projection_cardinality="1_TO_1",
            disposition="EMIT_1_TO_1",
            evidence=["explicit managed-stage context authority"],
        )
    _strip_model_evidence(model, result, ledger)


def _strip_model_evidence(
    model: ET._Element,
    result: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    expected_hashes = {
        "CANONICAL_TOPOLOGY_HASH": result["canonicalTopology"]["canonicalTopologyHash"],
        "TOPOLOGY_TRACE_LEDGER_HASH": result["traceLedger"]["topologyTraceLedgerHash"],
    }
    for name in list(model.attrib):
        if name in _MODEL_TRACE:
            value = model.get(name) or ""
            if name in expected_hashes and value != expected_hashes[name]:
                block(
                    ledger,
                    "MANAGED_STAGE_ARTIFACT_HASH_MISMATCH",
                    f"Topology InputXML model hash {name} is stale.",
                    f"topologyInputXml/PIPINGMODEL@{name}",
                )
            ledger.add(
                source_entity_id=f"topologyInputXml/PIPINGMODEL@{name}",
                source_type="MANAGED_STAGE_INPUTXML_ARTIFACT_ANCHOR",
                source_fields={"field": name, "value": value},
                projection_cardinality="1_TO_0",
                disposition="PRESERVE_EXTENSION",
                evidence=["producer artifact hash anchor independently verified before removal"],
            )
            del model.attrib[name]
        elif name not in _MODEL_CANONICAL:
            block(
                ledger,
                "MANAGED_STAGE_INPUTXML_RELATION_MISMATCH",
                f"PIPINGMODEL has unknown attribute {name}.",
                f"topologyInputXml/PIPINGMODEL@{name}",
            )


__all__ = ["apply_document_context", "reconcile_counts"]
