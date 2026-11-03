#!/usr/bin/env python3
"""Explicit contracts and intake predicates for InputXML-family profiles."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from lxml import etree as ET

from .base import (
    COADE_NS,
    KNOWN_ENRICHMENT_CHILDREN,
    CompileBlocked,
    DecisionLedger,
)
from .validation import _validate_xsd
from .xml import _local, _namespace

ENGINEERING_CONTEXT_KEYS = frozenset(
    {"version", "jobName", "time", "issueNo", "north", "defaultLine"}
)


@dataclass(frozen=True)
class FamilyProfileContract:
    profile_id: str
    adapter_id: str
    required_context: frozenset[str]
    optional_context: frozenset[str]
    permitted_aliases: bool
    count_assertions_required: bool
    allow_enrichment_evidence: bool
    diagnostic_only: bool
    candidate_policy: str

    @property
    def permitted_context(self) -> frozenset[str]:
        return self.required_context | self.optional_context


PROFILE_CONTRACTS = {
    "canonical-inputxml-v1": FamilyProfileContract(
        "canonical-inputxml-v1",
        "direct-canonical-validation",
        frozenset(),
        frozenset(),
        False,
        True,
        False,
        False,
        "DIRECT_VALIDATION_NO_REPAIR",
    ),
    "caesar-inputxml-pressure1": FamilyProfileContract(
        "caesar-inputxml-pressure1",
        "pressure1-lineid-to-canonical",
        frozenset(),
        frozenset(),
        True,
        True,
        False,
        False,
        "ADAPTED_CANDIDATE",
    ),
    "caesar-inputxml-pressure-c": FamilyProfileContract(
        "caesar-inputxml-pressure-c",
        "canonical-name-and-provenance-adapter",
        frozenset(),
        frozenset(),
        True,
        True,
        False,
        False,
        "ADAPTED_CANDIDATE",
    ),
    "enriched-inputxml-app": FamilyProfileContract(
        "enriched-inputxml-app",
        "enriched-inputxml-to-canonical",
        frozenset(),
        frozenset(),
        True,
        True,
        True,
        False,
        "ADAPTED_CANDIDATE",
    ),
    "inputxml-fragment": FamilyProfileContract(
        "inputxml-fragment",
        "fragment-wrapper-and-context-resolver",
        frozenset({"version", "jobName", "north"}),
        frozenset({"time", "issueNo", "defaultLine"}),
        True,
        False,
        False,
        False,
        "SYNTHETIC_WRAPPER_CANDIDATE",
    ),
    "categorized-inputxml-v3": FamilyProfileContract(
        "categorized-inputxml-v3",
        "categorized-reconciliation-compiler",
        frozenset({"version", "jobName", "north"}),
        frozenset({"time", "issueNo"}),
        True,
        False,
        True,
        False,
        "RECONCILED_CANDIDATE",
    ),
    "cii14-inputxml": FamilyProfileContract(
        "cii14-inputxml",
        "cii14-to-canonical-v1",
        frozenset(),
        frozenset(),
        True,
        True,
        False,
        False,
        "VERSIONED_CANDIDATE",
    ),
    "xml-to-cii-diagnostic-sidecar": FamilyProfileContract(
        "xml-to-cii-diagnostic-sidecar",
        "diagnostic-sidecar-reconciliation",
        frozenset(),
        frozenset(),
        True,
        True,
        False,
        True,
        "BLOCKED_INSPECTION_CANDIDATE",
    ),
}


def get_family_profile(profile_id: str) -> FamilyProfileContract:
    try:
        return PROFILE_CONTRACTS[profile_id]
    except KeyError as exc:
        raise CompileBlocked(f"No PR-5 family profile contract for {profile_id!r}.") from exc


def validate_profile_intake(
    *,
    profile_id: str,
    root: ET._Element | None,
    context: dict[str, Any],
    explicit_override: bool,
    categorized_xsd_path: Path,
    ledger: DecisionLedger,
) -> FamilyProfileContract:
    contract = get_family_profile(profile_id)
    _validate_context(contract, context, ledger)
    if profile_id == "inputxml-fragment":
        _validate_fragment(root, ledger)
    elif profile_id == "categorized-inputxml-v3":
        _validate_categorized(root, categorized_xsd_path, ledger)
    else:
        model = _require_inputxml_root(root, ledger)
        _validate_inputxml_markers(
            contract,
            root,
            model,
            explicit_override=explicit_override,
            ledger=ledger,
        )
    return contract


def _validate_context(
    contract: FamilyProfileContract,
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    supplied = ENGINEERING_CONTEXT_KEYS.intersection(context)
    forbidden = sorted(supplied - contract.permitted_context)
    if forbidden:
        _block(
            ledger,
            "PROFILE_SOURCE_MISMATCH",
            f"Profile {contract.profile_id} does not permit engineering context keys {forbidden}.",
            "compiler-context",
        )
    missing = sorted(
        key for key in contract.required_context if not _context_value_present(key, context.get(key))
    )
    if missing:
        _block(
            ledger,
            "CONTEXT_AUTHORITY_MISSING",
            f"Profile {contract.profile_id} requires explicit context keys {missing}.",
            "compiler-context",
        )
    for key in sorted(supplied):
        _validate_context_value(key, context[key], ledger)


def _context_value_present(key: str, value: Any) -> bool:
    if key == "north":
        return isinstance(value, (list, tuple)) and len(value) == 3
    if key == "issueNo":
        return value is not None
    return str(value or "").strip() != ""


def _validate_context_value(key: str, value: Any, ledger: DecisionLedger) -> None:
    if key == "north":
        if not isinstance(value, (list, tuple)) or len(value) != 3:
            _block(ledger, "CONTEXT_AUTHORITY_MISSING", "Context north must contain three finite values.", "compiler-context")
        for index, item in enumerate(value):
            _finite_decimal(item, f"context.north[{index}]", ledger)
        return
    if key in {"version", "jobName", "time", "defaultLine"} and not str(value or "").strip():
        _block(ledger, "CONTEXT_AUTHORITY_MISSING", f"Context {key} cannot be blank.", "compiler-context")
    if key == "issueNo" and value is None:
        _block(ledger, "CONTEXT_AUTHORITY_MISSING", "Context issueNo cannot be null when supplied.", "compiler-context")


def _require_inputxml_root(
    root: ET._Element | None,
    ledger: DecisionLedger,
) -> ET._Element:
    if root is None or _local(root.tag) != "CAESARII" or _namespace(root.tag) != COADE_NS:
        _block(ledger, "PROFILE_SOURCE_MISMATCH", "Selected profile requires the {COADE}CAESARII root.", "document")
    if root.get("XML_TYPE") != "Input":
        _block(ledger, "PROFILE_SOURCE_MISMATCH", "CAESARII XML_TYPE must be exactly 'Input'.", "document")
    direct = [child for child in root if _local(child.tag) == "PIPINGMODEL" and _namespace(child.tag) == ""]
    all_models = [element for element in root.iter() if _local(element.tag) == "PIPINGMODEL"]
    if len(direct) != 1 or len(all_models) != 1:
        _block(ledger, "PROFILE_SOURCE_MISMATCH", "Exactly one direct unqualified PIPINGMODEL is required.", "document")
    return direct[0]


def _validate_inputxml_markers(
    contract: FamilyProfileContract,
    root: ET._Element,
    model: ET._Element,
    *,
    explicit_override: bool,
    ledger: DecisionLedger,
) -> None:
    elements = [child for child in model if _local(child.tag) == "PIPINGELEMENT" and _namespace(child.tag) == ""]
    attributes = {name for element in elements for name in element.attrib}
    child_names = {
        _local(child.tag)
        for element in elements
        for child in element
        if _namespace(child.tag) == ""
    }
    has_pressure1 = any(name.startswith("PRESSURE") and name[8:].isdigit() and "_C" not in name for name in attributes)
    has_pressure_c = any(name.startswith("PRESSURE_C") and name[10:].isdigit() for name in attributes)
    has_enrichment = bool(child_names.intersection(KNOWN_ENRICHMENT_CHILDREN))
    version = (root.get("VERSION") or "").strip()

    profile_id = contract.profile_id
    mismatch = None
    if profile_id == "canonical-inputxml-v1":
        if has_pressure1 or "LINE_ID" in attributes or has_enrichment or version.startswith("14"):
            mismatch = "Direct canonical intake contains an adapter-profile marker."
    elif profile_id == "caesar-inputxml-pressure1":
        if not (has_pressure1 or "LINE_ID" in attributes):
            mismatch = "Pressure1 profile requires PRESSURE1..9 or LINE_ID source evidence."
    elif profile_id == "caesar-inputxml-pressure-c":
        if not has_pressure_c or version.startswith("14") or has_enrichment:
            mismatch = "Pressure-C profile requires PRESSURE_C1..9 without CII14 or enrichment profile markers."
    elif profile_id == "enriched-inputxml-app":
        if not has_enrichment:
            mismatch = "Enriched InputXML profile requires a registered enrichment child."
    elif profile_id == "cii14-inputxml":
        if not _version_is_cii14(version):
            mismatch = "CII14 profile requires a complete source VERSION beginning with segment 14."
    elif profile_id == "xml-to-cii-diagnostic-sidecar" and not explicit_override:
        mismatch = "Diagnostic-sidecar profile requires explicit selection."
    if mismatch:
        _block(ledger, "PROFILE_SOURCE_MISMATCH", mismatch, "document")


def _version_is_cii14(version: str) -> bool:
    first = version.strip().split(".", 1)[0]
    return first == "14"


def _validate_fragment(root: ET._Element | None, ledger: DecisionLedger) -> None:
    if root is None or _namespace(root.tag) != "":
        _block(ledger, "PROFILE_SOURCE_MISMATCH", "Fragment profile requires an unqualified XML root.", "document")
    local = _local(root.tag)
    if local == "PIPINGELEMENT":
        return
    if local != "Fragment":
        _block(ledger, "PROFILE_SOURCE_MISMATCH", "Fragment root must be PIPINGELEMENT or Fragment.", "document")
    children = list(root)
    if not children or any(_namespace(child.tag) != "" or _local(child.tag) != "PIPINGELEMENT" for child in children):
        _block(ledger, "PROFILE_SOURCE_MISMATCH", "Fragment wrapper must contain only direct PIPINGELEMENT children.", "document")
    if any(_local(desc.tag) == "PIPINGELEMENT" for child in children for desc in child.iterdescendants()):
        _block(ledger, "PROFILE_SOURCE_MISMATCH", "Nested PIPINGELEMENT records are forbidden in Fragment.", "document")


def _validate_categorized(
    root: ET._Element | None,
    categorized_xsd_path: Path,
    ledger: DecisionLedger,
) -> None:
    if root is None or _namespace(root.tag) != "" or _local(root.tag) != "CategorizedInputXML":
        _block(ledger, "PROFILE_SOURCE_MISMATCH", "Categorized profile requires the unqualified CategorizedInputXML root.", "document")
    if root.get("schema") != "categorized-inputxml/v3":
        _block(ledger, "PROFILE_SOURCE_MISMATCH", "CategorizedInputXML schema must be categorized-inputxml/v3.", "document")
    errors = _validate_xsd(root, categorized_xsd_path)
    if errors:
        ledger.diagnostic(
            "BLOCKING",
            "CATEGORIZED_XSD_FAILED",
            "CategorizedInputXML failed categorized-inputxml-v3.xsd.",
            "document",
            errors=errors,
        )
        raise CompileBlocked("CategorizedInputXML failed categorized-inputxml-v3.xsd: " + "; ".join(errors))


def _finite_decimal(value: Any, field: str, ledger: DecisionLedger) -> Decimal:
    try:
        number = Decimal(str(value).strip())
    except (InvalidOperation, ValueError) as exc:
        _block(ledger, "CONTEXT_AUTHORITY_MISSING", f"{field} is not numeric.", "compiler-context")
        raise AssertionError("unreachable") from exc
    if not number.is_finite():
        _block(ledger, "CONTEXT_AUTHORITY_MISSING", f"{field} must be finite.", "compiler-context")
    return number


def _block(
    ledger: DecisionLedger,
    code: str,
    message: str,
    source_entity_id: str,
) -> None:
    ledger.diagnostic("BLOCKING", code, message, source_entity_id)
    raise CompileBlocked(message)


__all__ = [
    "ENGINEERING_CONTEXT_KEYS",
    "FamilyProfileContract",
    "PROFILE_CONTRACTS",
    "get_family_profile",
    "validate_profile_intake",
]
