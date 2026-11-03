#!/usr/bin/env python3
"""Central dispatcher for InputXML registered profiles."""
from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

from lxml import etree as ET

from .base import CompileBlocked, DecisionLedger
from .extension import _ensure_extension_last, _extension_record
from .family import _compile_inputxml_family
from .family_accounting import account_profile_source
from .family_profiles import PROFILE_CONTRACTS, get_family_profile
from .family_resolver import compile_family_profile_candidate
from .managed_stage import _compile_managed_stage_source
from .managed_stage_accounting import account_managed_stage_source
from .managed_stage_intake import ManagedStageIntake
from .model import _ledger_direct_canonical
from .pdf_input_echo import _compile_pdf_input_echo_source
from .psi116_accounting import account_psi116_source
from .psi116_adapter import compile_psi116_source
from .psi116_intake import Psi116Intake
from .resolver_contract import OutcomeKind, ResolverOutcome
from .seljson import _compile_seljson_custom_root
from .topology_accounting import account_topology_profile_source
from .uxml_rvm import _compile_uxml_rvm_source
from .xml_builder import _compile_xml_builder_source

_NON_XML_DIALECTS = {
    "managed-stage-json",
    "pdf-input-echo",
    "uxml-rvm-intake",
}
_PR5_FAMILY_DIALECTS = frozenset(PROFILE_CONTRACTS)
_PR6_TOPOLOGY_DIALECTS = frozenset(
    {"xml-builder-root-branch-node", "seljson-custom-root"}
)


def _require_xml(dialect: str, root: ET._Element | None) -> ET._Element:
    if root is None:
        raise CompileBlocked(f"Dialect {dialect} requires XML input.")
    return root


def _mark_diagnostic_sidecar(
    canonical: ET._Element,
    ledger: DecisionLedger,
) -> None:
    _extension_record(
        canonical,
        producer=ledger.producer,
        dialect=ledger.dialect,
        name="DiagnosticSidecarReconciliation",
        source_path=ledger.source_path,
        source_entity_id="document",
        source_field="dialect",
        value=(
            "Diagnostic reconstruction requires independent source "
            "reconciliation before production use."
        ),
        disposition="DEFER_EXPLICITLY",
        criticality="HIGH",
        confidence=0.80,
    )
    _ensure_extension_last(canonical)
    ledger.add(
        source_entity_id="document",
        source_type="DIAGNOSTIC_RECONSTRUCTION",
        source_fields={"dialect": ledger.dialect},
        disposition="DEFER_EXPLICITLY",
        evidence=[
            "diagnostic sidecar is not assumed to be the exact writer-consumed model"
        ],
        confidence={
            "identity": 0.80,
            "topology": 0.80,
            "geometry": 0.80,
            "dimensions": 0.80,
            "attributes": 0.80,
            "ciiProjection": 0.80,
        },
    )
    ledger.diagnostic(
        "BLOCKING",
        "DIAGNOSTIC_RECONCILIATION_REQUIRED",
        "Diagnostic InputXML sidecar requires independent source reconciliation.",
    )


def _compile_profile_candidate(
    *,
    dialect: str,
    source: bytes,
    root: ET._Element | None,
    ledger: DecisionLedger,
    aliases: dict[str, dict[str, str]],
    context: dict[str, Any],
    source_name: str,
    source_path: str,
    categorized_xsd_path: Path,
    managed_stage_intake: ManagedStageIntake | None,
    psi116_intake: Psi116Intake | None,
) -> tuple[ET._Element, dict[str, Any] | None]:
    del categorized_xsd_path
    if dialect == "managed-stage-json":
        if managed_stage_intake is None:
            raise CompileBlocked("Managed-stage resolver requires verified profile intake.")
        return _compile_managed_stage_source(
            source,
            source_name=source_name,
            ledger=ledger,
            context=context,
            intake=managed_stage_intake,
        )
    if dialect == "pipesstressexport-psi116-xml":
        if psi116_intake is None:
            raise CompileBlocked("PSI116 resolver requires verified profile intake.")
        return (
            compile_psi116_source(source, intake=psi116_intake, ledger=ledger),
            None,
        )
    if dialect == "uxml-rvm-intake":
        wrapped = _compile_uxml_rvm_source(
            source,
            source_name=source_name,
            source_path=source_path,
            ledger=ledger,
            context=context,
        )
    elif dialect == "pdf-input-echo":
        wrapped = _compile_pdf_input_echo_source(
            source,
            source_name=source_name,
            ledger=ledger,
            context=context,
        )
    else:
        return (
            _compile_xml_profile(
                dialect=dialect,
                source=source,
                root=_require_xml(dialect, root),
                ledger=ledger,
                aliases=aliases,
                context=context,
            ),
            None,
        )
    return (
        _compile_inputxml_family(
            wrapped,
            dialect=dialect,
            ledger=ledger,
            aliases=aliases,
            context=context,
        ),
        None,
    )


def _compile_xml_profile(
    *,
    dialect: str,
    source: bytes,
    root: ET._Element,
    ledger: DecisionLedger,
    aliases: dict[str, dict[str, str]],
    context: dict[str, Any],
) -> ET._Element:
    if dialect == "canonical-inputxml-v1":
        canonical = copy.deepcopy(root)
        _ledger_direct_canonical(canonical, ledger)
        return canonical
    if dialect in _PR5_FAMILY_DIALECTS:
        canonical = compile_family_profile_candidate(
            root=root,
            profile=get_family_profile(dialect),
            ledger=ledger,
            aliases=aliases,
            context=context,
        )
        if dialect == "xml-to-cii-diagnostic-sidecar":
            _mark_diagnostic_sidecar(canonical, ledger)
        return canonical
    if dialect == "xml-builder-root-branch-node":
        return _compile_xml_builder_source(
            source,
            source_root=root,
            ledger=ledger,
            context=context,
        )
    if dialect == "seljson-custom-root":
        return _compile_seljson_custom_root(
            source,
            source_root=root,
            ledger=ledger,
            context=context,
        )
    raise CompileBlocked(f"No registered runtime resolver for {dialect!r}.")


def resolve_registered_profile(
    *,
    dialect: str,
    adapter_id: str,
    source: bytes,
    root: ET._Element | None,
    ledger: DecisionLedger,
    aliases: dict[str, dict[str, str]],
    context: dict[str, Any],
    source_name: str,
    source_path: str,
    categorized_xsd_path: Path,
    managed_stage_intake: ManagedStageIntake | None = None,
    psi116_intake: Psi116Intake | None = None,
) -> ResolverOutcome:
    """Invoke one closed registered resolver and standardize its outcome."""
    if dialect not in _NON_XML_DIALECTS and root is None:
        raise CompileBlocked(f"Dialect {dialect} requires XML input.")
    canonical, managed_evidence = _compile_profile_candidate(
        dialect=dialect,
        source=source,
        root=root,
        ledger=ledger,
        aliases=aliases,
        context=context,
        source_name=source_name,
        source_path=source_path,
        categorized_xsd_path=categorized_xsd_path,
        managed_stage_intake=managed_stage_intake,
        psi116_intake=psi116_intake,
    )
    accounting_status = "COMPLETE"
    metrics: dict[str, Any] = {}
    if dialect in _PR5_FAMILY_DIALECTS:
        accounting_status, proof = account_profile_source(
            _require_xml(dialect, root),
            profile_id=dialect,
            ledger=ledger,
        )
        metrics["sourceAccounting"] = proof
    elif dialect in _PR6_TOPOLOGY_DIALECTS:
        accounting_status, proof = account_topology_profile_source(
            _require_xml(dialect, root),
            canonical,
            profile_id=dialect,
            ledger=ledger,
        )
        metrics["sourceAccounting"] = proof
    elif dialect == "managed-stage-json":
        if managed_stage_intake is None or managed_evidence is None:
            raise CompileBlocked("Managed-stage accounting evidence is missing.")
        accounting_status, proof = account_managed_stage_source(
            managed_stage_intake,
            canonical,
            evidence=managed_evidence,
            ledger=ledger,
        )
        metrics.update({
            "sourceAccounting": proof,
            "artifactHashes": managed_evidence["identity"]["artifactHashes"],
            "managedStageMetrics": managed_evidence["metrics"],
        })
    elif dialect == "pipesstressexport-psi116-xml":
        if psi116_intake is None:
            raise CompileBlocked("PSI116 source accounting intake is missing.")
        accounting_status, proof = account_psi116_source(
            psi116_intake, canonical, ledger=ledger,
        )
        metrics["sourceAccounting"] = proof
    outcome_kind = (
        OutcomeKind.BLOCKED_WITH_CANDIDATE
        if ledger.blocked
        else OutcomeKind.CANONICAL_CANDIDATE
    )
    return ResolverOutcome(
        profile_id=dialect,
        adapter_id=adapter_id,
        outcome_kind=outcome_kind,
        canonical_candidate=canonical,
        source_accounting_status=accounting_status,
        profile_metrics=metrics,
    )


__all__ = ["resolve_registered_profile"]
