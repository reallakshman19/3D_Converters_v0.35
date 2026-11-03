#!/usr/bin/env python3
"""Candidate construction for the eight PR-5 InputXML-family profiles."""
from __future__ import annotations

from typing import Any

from lxml import etree as ET

from .base import (
    EXT_NS,
    MODEL_ATTRS,
    NOZZLE_NAMES,
    ROOT_ATTRS,
    CompileBlocked,
    DecisionLedger,
)
from .counts import _new_root
from .extension import (
    _copy_existing_extension,
    _ensure_extension_last,
    _preserve_attr,
    _preserve_child,
)
from .family_auxiliary import preserve_unresolved_nozzle
from .family_categorized import compile_categorized_candidate
from .family_counts import apply_canonical_counts, verify_family_source_counts
from .family_element import normalize_family_element
from .family_profiles import FamilyProfileContract
from .family_resolution import IdentityRegistry, LineScopeState, resolve_document_context
from .xml import _local, _namespace


def compile_family_profile_candidate(
    *,
    root: ET._Element,
    profile: FamilyProfileContract,
    ledger: DecisionLedger,
    aliases: dict[str, dict[str, str]],
    context: dict[str, Any],
) -> ET._Element:
    if profile.profile_id == "categorized-inputxml-v3":
        return compile_categorized_candidate(
            root,
            profile=profile,
            ledger=ledger,
            aliases=aliases,
            context=context,
        )
    if profile.profile_id == "inputxml-fragment":
        return _compile_fragment(
            root,
            profile=profile,
            ledger=ledger,
            aliases=aliases,
            context=context,
        )
    return _compile_full_inputxml(
        root,
        profile=profile,
        ledger=ledger,
        aliases=aliases,
        context=context,
    )


def _compile_full_inputxml(
    source_root: ET._Element,
    *,
    profile: FamilyProfileContract,
    ledger: DecisionLedger,
    aliases: dict[str, dict[str, str]],
    context: dict[str, Any],
) -> ET._Element:
    source_model = _direct_model(source_root)
    verify_family_source_counts(
        source_model,
        ledger=ledger,
        required=profile.count_assertions_required,
    )
    resolved = resolve_document_context(
        profile=profile,
        source_version=source_root.get("VERSION"),
        source_job_name=source_model.get("JOBNAME"),
        source_time=source_model.get("TIME"),
        source_issue_no=source_model.get("ISSUE_NO"),
        source_north=tuple(
            source_model.get(field)
            for field in ("NORTH_X", "NORTH_Y", "NORTH_Z")
        ),
        context=context,
        ledger=ledger,
    )
    canonical, model = _new_root(resolved["version"])
    _apply_model_identity(model, resolved)
    _preserve_document_attributes(
        source_root,
        source_model,
        canonical,
        model,
        ledger,
    )
    _normalize_model_children(
        source_root=source_root,
        source_model=source_model,
        canonical=canonical,
        model=model,
        profile=profile,
        aliases=aliases,
        context=context,
        ledger=ledger,
    )
    apply_canonical_counts(model, ledger)
    _ensure_extension_last(model)
    _ensure_extension_last(canonical)
    _ledger_document(source_root, source_model, profile, ledger)
    return canonical


def _compile_fragment(
    source_root: ET._Element,
    *,
    profile: FamilyProfileContract,
    ledger: DecisionLedger,
    aliases: dict[str, dict[str, str]],
    context: dict[str, Any],
) -> ET._Element:
    resolved = resolve_document_context(
        profile=profile,
        source_version=None,
        source_job_name=None,
        source_time=None,
        source_issue_no=None,
        source_north=(None, None, None),
        context=context,
        ledger=ledger,
    )
    canonical, model = _new_root(resolved["version"])
    _apply_model_identity(model, resolved)
    elements = (
        [source_root]
        if _local(source_root.tag) == "PIPINGELEMENT"
        else list(source_root)
    )
    line_scope = LineScopeState()
    identities = IdentityRegistry()
    for index, element in enumerate(elements, 1):
        source_id = (
            "/PIPINGELEMENT[1]"
            if source_root is element
            else f"/Fragment[1]/PIPINGELEMENT[{index}]"
        )
        model.append(
            normalize_family_element(
                element,
                index=index,
                source_entity_id=source_id,
                model=model,
                ledger=ledger,
                aliases=aliases,
                profile=profile,
                context=context,
                line_scope=line_scope,
                identities=identities,
            )
        )
    apply_canonical_counts(model, ledger)
    ledger.add(
        source_entity_id="generated:CAESARII",
        source_type="SYNTHETIC_CANONICAL_WRAPPER",
        source_fields={
            "profileId": profile.profile_id,
            "sourceRoot": _local(source_root.tag),
            "elementCount": len(elements),
        },
        disposition="EMIT_1_TO_1",
        evidence=["fragment profile requires an explicit synthetic canonical wrapper"],
        cii_section="VERSION",
    )
    ledger.add(
        source_entity_id="generated:PIPINGMODEL",
        source_type="SYNTHETIC_CANONICAL_MODEL",
        source_fields={"elementCount": len(elements)},
        disposition="EMIT_1_TO_1",
        evidence=["canonical CONTROL assertions generated from emitted records"],
        cii_section="CONTROL",
    )
    _ensure_extension_last(model)
    _ensure_extension_last(canonical)
    return canonical


def _direct_model(root: ET._Element) -> ET._Element:
    models = [
        child
        for child in root
        if _local(child.tag) == "PIPINGMODEL" and _namespace(child.tag) == ""
    ]
    if len(models) != 1:
        raise CompileBlocked("Exactly one direct unqualified PIPINGMODEL is required.")
    return models[0]


def _apply_model_identity(model: ET._Element, resolved: dict[str, Any]) -> None:
    model.set("JOBNAME", resolved["jobName"])
    if resolved["time"] is not None:
        model.set("TIME", resolved["time"])
    if resolved["issueNo"] is not None:
        model.set("ISSUE_NO", resolved["issueNo"])
    for field, value in zip(
        ("NORTH_X", "NORTH_Y", "NORTH_Z"),
        resolved["north"],
    ):
        model.set(field, value)


def _preserve_document_attributes(
    source_root: ET._Element,
    source_model: ET._Element,
    canonical: ET._Element,
    model: ET._Element,
    ledger: DecisionLedger,
) -> None:
    for attr, value in source_root.attrib.items():
        if attr not in ROOT_ATTRS:
            _preserve_attr(
                canonical,
                ledger.source_path,
                "CAESARII",
                attr,
                value,
                ledger,
                blocking=True,
            )
    for attr, value in source_model.attrib.items():
        if attr not in MODEL_ATTRS:
            _preserve_attr(
                model,
                ledger.source_path,
                "PIPINGMODEL",
                attr,
                value,
                ledger,
                blocking=True,
            )


def _normalize_model_children(
    *,
    source_root: ET._Element,
    source_model: ET._Element,
    canonical: ET._Element,
    model: ET._Element,
    profile: FamilyProfileContract,
    aliases: dict[str, dict[str, str]],
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> None:
    line_scope = LineScopeState()
    identities = IdentityRegistry()
    element_index = 0
    nozzle_index = 0
    extension_seen = False
    for ordinal, child in enumerate(source_model, 1):
        name = _local(child.tag)
        namespace = _namespace(child.tag)
        if namespace == "" and name == "PIPINGELEMENT":
            element_index += 1
            model.append(
                normalize_family_element(
                    child,
                    index=element_index,
                    source_entity_id=f"/CAESARII[1]/PIPINGMODEL[1]/PIPINGELEMENT[{element_index}]",
                    model=model,
                    ledger=ledger,
                    aliases=aliases,
                    profile=profile,
                    context=context,
                    line_scope=line_scope,
                    identities=identities,
                )
            )
            continue
        if namespace == "" and name in NOZZLE_NAMES:
            nozzle_index += 1
            preserve_unresolved_nozzle(
                child,
                model=model,
                source_entity_id=f"/CAESARII[1]/PIPINGMODEL[1]/{name}[{nozzle_index}]",
                ledger=ledger,
            )
            continue
        if namespace == EXT_NS and name == "Extension":
            if not extension_seen:
                _copy_existing_extension(
                    source_model,
                    model,
                    ledger,
                    "PIPINGMODEL",
                )
                extension_seen = True
            continue
        _preserve_child(
            model,
            child,
            ledger.source_path,
            "PIPINGMODEL",
            ledger,
            blocking=True,
        )
    if element_index == 0:
        _block(
            ledger,
            "UNSUPPORTED_ENGINEERING_FIELD",
            "PIPINGMODEL contains no direct PIPINGELEMENT records.",
            "PIPINGMODEL",
        )
    root_extension_seen = False
    for child in source_root:
        if child is source_model:
            continue
        name = _local(child.tag)
        namespace = _namespace(child.tag)
        if namespace == EXT_NS and name == "Extension":
            if not root_extension_seen:
                _copy_existing_extension(source_root, canonical, ledger, "CAESARII")
                root_extension_seen = True
            continue
        _preserve_child(
            canonical,
            child,
            ledger.source_path,
            "CAESARII",
            ledger,
            blocking=True,
        )


def _ledger_document(
    source_root: ET._Element,
    source_model: ET._Element,
    profile: FamilyProfileContract,
    ledger: DecisionLedger,
) -> None:
    ledger.add(
        source_entity_id="/CAESARII[1]",
        source_type="ROOT",
        source_fields={
            "profileId": profile.profile_id,
            "attributes": dict(source_root.attrib),
        },
        disposition="EMIT_1_TO_1",
        cii_section="VERSION",
    )
    ledger.add(
        source_entity_id="/CAESARII[1]/PIPINGMODEL[1]",
        source_type="MODEL",
        source_fields=dict(source_model.attrib),
        disposition="EMIT_1_TO_1",
        cii_section="CONTROL",
    )


def _block(
    ledger: DecisionLedger,
    code: str,
    message: str,
    source_entity_id: str,
) -> None:
    ledger.diagnostic("BLOCKING", code, message, source_entity_id)
    raise CompileBlocked(message)


__all__ = ["compile_family_profile_candidate"]
