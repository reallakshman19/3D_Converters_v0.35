#!/usr/bin/env python3
"""Field-catalog reconciled assured InputXML -> CII(2019) projection.

The core module proves actual writer sections and indexes. This front controller
reconciles PR-E readiness against InputXmlFieldCatalog.v1 before the production
writer is allowed to run.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import inputxml_to_cii2019_assured as core  # noqa: E402

FIELD_CATALOG_PATH = (
    SCRIPT_DIR.parents[1]
    / "contracts"
    / "inputxml"
    / "v1"
    / "catalogs"
    / "inputxml-field-catalog.json"
)

# Node names are optional CAESAR metadata. Their absence must not block base
# geometry/material projection; when present, PR-F still proves NODENAME indexes.
core.STRICT_REQUIRED_ELEMENT_FIELDS = tuple(
    field for field in core.STRICT_REQUIRED_ELEMENT_FIELDS
    if field not in {"FROM_NAME", "TO_NAME"}
)

# These canonical attributes are contract metadata rather than CII engineering
# payload. They predate the PR-B field catalog and are intentionally retained as
# evidence only. Every other uncatalogued canonical attribute fails closed.
CANONICAL_NON_WRITER_METADATA = {
    ("PIPINGELEMENT", "ID"): {
        "fieldId": "CANONICAL-METADATA-ELEMENT-ID",
        "projectionStatus": "PRESERVE_EXTENSION",
        "sections": [],
    },
    ("PIPINGMODEL", "ISSUE_NO"): {
        "fieldId": "CANONICAL-METADATA-ISSUE-NO",
        "projectionStatus": "PRESERVE_EXTENSION",
        "sections": [],
    },
}

ProjectionBlocked = core.ProjectionBlocked
CanonicalElement = core.CanonicalElement
ELEMENT_BLOCK_LINES = core.ELEMENT_BLOCK_LINES
_extract_element_projection = core._extract_element_projection
validate_projection_ledger = core.validate_projection_ledger


def _path_parent_and_attr(source_entity_id: str) -> tuple[str | None, str | None]:
    if not source_entity_id.startswith("/CAESARII") or "@" not in source_entity_id:
        return None, None
    path, attr = source_entity_id.rsplit("@", 1)
    tail = path.rsplit("/", 1)[-1]
    parent = re.sub(r"\[\d+\]$", "", tail)
    return parent or None, attr or None


def _expand_catalog_names(record: dict[str, Any]) -> list[str]:
    canonical_name = str(record.get("canonicalName") or "")
    expansions = record.get("expandsTo") or []
    if expansions and all(isinstance(item, str) and "/" not in item for item in expansions):
        return [str(item) for item in expansions]
    if "{n}" in canonical_name and expansions:
        return [canonical_name.replace("{n}", str(item)) for item in expansions]
    if canonical_name and "*" not in canonical_name and "{" not in canonical_name:
        return [canonical_name]
    return []


def _field_policy_index(field_catalog: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    encoding = field_catalog.get("recordEncoding") or {}
    columns = encoding.get("columns") or []
    records = field_catalog.get("records") or []
    if field_catalog.get("schema") != "InputXmlFieldCatalog.v1" or not columns or not isinstance(records, list):
        raise ProjectionBlocked("Field catalog must be InputXmlFieldCatalog.v1 with record encoding.")
    index: dict[tuple[str, str], dict[str, Any]] = {}
    for row in records:
        if not isinstance(row, list) or len(row) != len(columns):
            raise ProjectionBlocked("Field catalog row shape mismatch.")
        record = dict(zip(columns, row))
        parents = [value for value in str(record.get("parentElement") or "").split("|") if value]
        sections = [
            value
            for value in re.split(r"[/|]", str(record.get("ciiTargetSection") or ""))
            if value and value not in {"EXTENSION", "VALIDATION"}
        ]
        policy = {
            "fieldId": record.get("id"),
            "projectionStatus": str(record.get("projectionStatus") or ""),
            "sections": sections,
        }
        for parent in parents:
            for name in _expand_catalog_names(record):
                index[(parent, name)] = policy
    return index


def _policy_for_record(
    record: dict[str, Any],
    index: dict[tuple[str, str], dict[str, Any]],
) -> dict[str, Any] | None:
    parent, attr = _path_parent_and_attr(str(record.get("sourceEntityId") or ""))
    if not parent or not attr:
        return None
    catalog_policy = index.get((parent, attr))
    if catalog_policy is not None:
        return catalog_policy
    metadata_policy = CANONICAL_NON_WRITER_METADATA.get((parent, attr))
    if metadata_policy is not None:
        return metadata_policy
    return {
        "fieldId": "UNREGISTERED-CANONICAL-ATTRIBUTE",
        "projectionStatus": "UNSUPPORTED_BLOCKING",
        "sections": [],
        "unregistered": True,
        "parent": parent,
        "attribute": attr,
    }


def reconcile_assurance_with_field_catalog(
    assurance: dict[str, Any],
    field_catalog: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    reconciled = deepcopy(assurance)
    policy_index = _field_policy_index(field_catalog)
    metadata: dict[str, dict[str, Any]] = {}
    diagnostics: list[dict[str, Any]] = []
    blocked = False

    for record in reconciled.get("records") or []:
        record_id = str(record.get("assuranceRecordId") or "")
        projection = record.setdefault("projection", {})
        original_sections = [str(value) for value in projection.get("sections") or []]
        policy = _policy_for_record(record, policy_index)
        catalog_status = str((policy or {}).get("projectionStatus") or "")
        effective_sections = list(original_sections)
        notes: list[str] = []

        if catalog_status in {"PRESERVE_EXTENSION", "VALIDATION_ONLY"}:
            effective_sections = []
            record["status"] = "EVIDENCE_ONLY"
            projection["sections"] = []
            projection["readiness"] = "EVIDENCE_ONLY"
            projection["ciiIndex"] = None
            projection["indexStatus"] = "NOT_APPLICABLE"
            notes.append(
                f"Field policy {catalog_status} overrides PR-E READY classification; no CII target is claimed."
            )
        elif catalog_status == "UNSUPPORTED_BLOCKING":
            effective_sections = []
            record["status"] = "BLOCKED"
            projection["sections"] = []
            projection["readiness"] = "BLOCKED"
            blocked = True
            if bool((policy or {}).get("unregistered")):
                notes.append(
                    "Canonical attribute "
                    f"{policy.get('parent')}@{policy.get('attribute')} is absent from the field catalog."
                )
            else:
                notes.append("Field catalog marks this field UNSUPPORTED_BLOCKING.")
        elif catalog_status == "PROJECTED":
            catalog_sections = [str(value) for value in (policy or {}).get("sections") or []]
            if sorted(set(original_sections)) != sorted(set(catalog_sections)):
                record["status"] = "BLOCKED"
                projection["readiness"] = "BLOCKED"
                blocked = True
                notes.append(
                    f"PR-E planned sections {sorted(set(original_sections))} "
                    f"differ from field catalog {sorted(set(catalog_sections))}."
                )

        metadata[record_id] = {
            "catalogProjectionStatus": catalog_status or None,
            "plannedSections": original_sections,
            "effectiveSections": effective_sections,
            "notes": notes,
        }

    if blocked:
        reconciled["status"] = "BLOCKED"
        gates = reconciled.setdefault("gates", {})
        gates["ciiProjectionReadiness"] = "BLOCKED"
        diagnostics.append(
            {
                "severity": "BLOCKING",
                "code": "FIELD_CATALOG_RECONCILIATION_BLOCKED",
                "message": "At least one PR-E assurance record conflicts with or is absent from the field catalog.",
            }
        )
    return reconciled, metadata, diagnostics


def _bind_exact_canonical_element_ids(
    assurance: dict[str, Any],
    canonical_xml: bytes,
) -> dict[str, list[str]]:
    """Bind writer ownership only for ledger IDs that equal real InputXML IDs.

    Some producer ledgers predate the dedicated InputXMLElementIds column but do
    carry canonicalElementIds. Those values are accepted here only when they are
    exact members of the canonical InputXML element-ID set; topology edge IDs or
    other source identities are ignored.
    """
    _, _, elements = core._parse_canonical(canonical_xml)
    order = {element.element_id: element.ordinal for element in elements}
    known = set(order)
    notes: dict[str, list[str]] = {}
    for record in assurance.get("records") or []:
        canonical = record.setdefault("canonical", {})
        existing = [str(value) for value in canonical.get("inputXmlElementIds") or [] if str(value) in known]
        if existing:
            canonical["inputXmlElementIds"] = sorted(set(existing), key=order.get)
            continue
        candidates = [str(value) for value in canonical.get("elementIds") or [] if str(value) in known]
        if not candidates:
            continue
        bound = sorted(set(candidates), key=order.get)
        canonical["inputXmlElementIds"] = bound
        record_id = str(record.get("assuranceRecordId") or "")
        notes[record_id] = [
            "Writer ownership bound from canonical.elementIds after exact membership verification against canonical InputXML IDs."
        ]
    return notes


def _enrich_projection_ledger(
    ledger: dict[str, Any],
    metadata: dict[str, dict[str, Any]],
    field_catalog: dict[str, Any],
    catalog_diagnostics: list[dict[str, Any]],
    ownership_notes: dict[str, list[str]],
) -> dict[str, Any]:
    ledger = deepcopy(ledger)
    ledger["chain"]["fieldCatalogHashSha256"] = core._json_hash(field_catalog)
    by_id = {str(row.get("assuranceRecordId") or ""): row for row in ledger.get("records") or []}
    for record_id, row_metadata in metadata.items():
        row = by_id.get(record_id)
        if row is None:
            continue
        row["plannedSections"] = row_metadata["plannedSections"]
        row["catalogProjectionStatus"] = row_metadata["catalogProjectionStatus"]
        row["effectiveSections"] = row_metadata["effectiveSections"]
        row["diagnostics"] = (
            list(row.get("diagnostics") or [])
            + list(row_metadata["notes"])
            + list(ownership_notes.get(record_id) or [])
        )
    if catalog_diagnostics:
        ledger["diagnostics"] = list(ledger.get("diagnostics") or []) + catalog_diagnostics
        ledger["status"] = "BLOCKED"
    summary = ledger.setdefault("summary", {})
    summary["blockedProjectionRecordCount"] = sum(
        1 for row in ledger.get("records") or [] if row.get("status") == "BLOCKED"
    )
    summary["diagnosticCount"] = len(ledger.get("diagnostics") or [])
    summary["blockingDiagnosticCount"] = sum(
        1
        for row in ledger.get("diagnostics") or []
        if row.get("severity") in {"ERROR", "BLOCKING"}
    )
    ledger.pop("projectionHashSha256", None)
    ledger["projectionHashSha256"] = core._json_hash(ledger)
    return ledger


def build_assured_projection(
    *,
    canonical_xml: bytes,
    assurance: dict[str, Any],
    projection_contract: dict[str, Any],
    canonical_path: Path,
    field_catalog: dict[str, Any] | None = None,
) -> tuple[str | None, dict[str, Any]]:
    if field_catalog is None:
        field_catalog = json.loads(FIELD_CATALOG_PATH.read_text(encoding="utf-8"))
    reconciled, metadata, catalog_diagnostics = reconcile_assurance_with_field_catalog(
        assurance,
        field_catalog,
    )
    ownership_notes = _bind_exact_canonical_element_ids(reconciled, canonical_xml)
    cii_text, ledger = core.build_assured_projection(
        canonical_xml=canonical_xml,
        assurance=reconciled,
        projection_contract=projection_contract,
        canonical_path=canonical_path,
    )
    ledger = _enrich_projection_ledger(
        ledger,
        metadata,
        field_catalog,
        catalog_diagnostics,
        ownership_notes,
    )
    if ledger["status"] != "PASS":
        cii_text = None
    return cii_text, ledger


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ProjectionBlocked(f"{path} must contain a JSON object.")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Canonical InputXML v1.")
    parser.add_argument("--assurance-ledger", type=Path, required=True)
    parser.add_argument("--projection-contract", type=Path, required=True)
    parser.add_argument("--field-catalog", type=Path, default=FIELD_CATALOG_PATH)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--projection-ledger", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        canonical_xml = args.input.read_bytes()
        cii_text, ledger = build_assured_projection(
            canonical_xml=canonical_xml,
            assurance=_load_json(args.assurance_ledger),
            projection_contract=_load_json(args.projection_contract),
            canonical_path=args.input,
            field_catalog=_load_json(args.field_catalog),
        )
        errors = validate_projection_ledger(ledger)
        if errors:
            ledger["status"] = "BLOCKED"
            ledger["diagnostics"].append(
                {
                    "severity": "BLOCKING",
                    "code": "PROJECTION_LEDGER_INVALID",
                    "message": "; ".join(errors),
                }
            )
            cii_text = None
        args.projection_ledger.parent.mkdir(parents=True, exist_ok=True)
        args.projection_ledger.write_text(
            json.dumps(ledger, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        if cii_text is None or ledger["status"] != "PASS":
            return 2
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(cii_text, encoding="utf-8")
        print(
            json.dumps(
                {
                    "status": "PASS",
                    "output": str(args.output),
                    "projectionLedger": str(args.projection_ledger),
                    "ciiHashSha256": ledger["chain"]["ciiHashSha256"],
                    "projectionHashSha256": ledger["projectionHashSha256"],
                },
                indent=2,
            )
        )
        return 0
    except (OSError, json.JSONDecodeError, ProjectionBlocked) as exc:
        print(f"ASSURED PROJECTION ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
