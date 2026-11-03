from .base import *
from .xml import *
from .extension import *
from .counts import *
from .children import *
from .elements import *
from .family import *
from .model import *
from .categorized import *
from .validation import *
from .xml_builder import *
from .seljson import *
from .managed_stage import *
from .pdf_input_echo import *
from .pdf_input_echo_bindings import *
from .uxml_rvm import *
from .ledger_reconciliation import *
from .contract_bundle import *
from .state_machine import CompilerState, CompilerStage
from .dispatcher import resolve_registered_profile
from .family_profiles import PROFILE_CONTRACTS, validate_profile_intake
from .managed_stage_intake import (
    ManagedStageIntake,
    managed_stage_root_predicate,
    strict_json_loads,
    validate_managed_stage_intake,
)
from .resolver_contract import OutcomeKind
from .psi116_intake import Psi116Intake, validate_psi116_profile_intake
from .topology_profiles import (
    TOPOLOGY_PROFILE_CONTRACTS,
    validate_topology_profile_intake,
)


_BLOCK_GATE_BY_STAGE = {
    CompilerStage.INITIALIZED: "CONTRACT_BUNDLE_GATE",
    CompilerStage.CONTRACT_BUNDLE_VERIFIED: "SOURCE_ENVELOPE_GATE",
    CompilerStage.SOURCE_ENVELOPE_CREATED: "MEDIA_INSPECTION_GATE",
    CompilerStage.MEDIA_INSPECTED: "DIALECT_GATE",
    CompilerStage.DIALECT_RESOLVED: "PROFILE_INTAKE_GATE",
    CompilerStage.PROFILE_INTAKE_VALIDATED: "PROFILE_RESOLVER_GATE",
    CompilerStage.PROFILE_RESOLVED: "SOURCE_ACCOUNTING_GATE",
    CompilerStage.SOURCE_ACCOUNTED: "LEDGER_GATE",
    CompilerStage.CANONICAL_CANDIDATE_BUILT: "XSD_GATE",
    CompilerStage.XSD_VALIDATED: "SCHEMATRON_GATE",
    CompilerStage.SCHEMATRON_VALIDATED: "LEDGER_GATE",
    CompilerStage.LEDGER_VALIDATED: "PRODUCTION_ACCEPTANCE_GATE",
}


def _json_dialect_from_payload(
    payload: Any,
    dialect_override: str | None,
) -> str:
    if dialect_override:
        return dialect_override
    candidate = (
        payload.get("uxml")
        if isinstance(payload, dict) and isinstance(payload.get("uxml"), dict)
        else payload
    )
    if isinstance(candidate, dict) and candidate.get("schemaVersion") == "uxml-topology-v1":
        return "uxml-rvm-intake"
    if isinstance(payload, dict) and any(
        key in payload for key in ("rvmRows", "rows", "inputKind")
    ):
        return "uxml-rvm-intake"
    if managed_stage_root_predicate(payload):
        return "managed-stage-json"
    raise CompileBlocked("No registered JSON dialect matches the strict root predicate.")


def _blocked_return_candidate(
    dialect: str,
    canonical: ET._Element,
) -> ET._Element | None:
    if dialect == "canonical-inputxml-v1":
        return None
    return canonical


def _result(
    candidate: ET._Element | None,
    ledger: DecisionLedger,
    source_hash: str,
    validation: dict[str, Any],
    policy: dict[str, Any] | None = None,
) -> tuple[ET._Element | None, dict[str, Any], dict[str, Any]]:
    if candidate is None:
        return None, ledger.as_dict(source_hash, None), validation
    if policy:
        from .serialization import serialize_canonical_xml, hash_canonical_bytes
        output = serialize_canonical_xml(candidate, policy)
        return candidate, ledger.as_dict(source_hash, hash_canonical_bytes(output)), validation
    output = _xml_bytes(candidate)
    return candidate, ledger.as_dict(source_hash, _sha256(output)), validation


def compile_document(
    source: bytes,
    *,
    source_name: str,
    source_repository: str,
    source_path: str,
    producer: str,
    registry_path: Path,
    alias_registry_path: Path,
    canonical_xsd_path: Path,
    categorized_xsd_path: Path,
    semantic_rules_path: Path,
    adapter_registry_path: Path | None = None,
    serialization_policy_path: Path | None = None,
    dialect_override: str | None = None,
    context: dict[str, Any] | None = None,
) -> tuple[ET._Element | None, dict[str, Any], dict[str, Any]]:
    context = context or {}
    if source:
        from .serialization import hash_source_bytes
        source_hash = hash_source_bytes(source)
    else:
        source_hash = _sha256(source)
    ledger = DecisionLedger(
        source_repository,
        source_path,
        producer,
        dialect_override or "unresolved",
    )
    state = CompilerState()
    validation: dict[str, Any] = {
        "schema": "InputXmlCanonicalValidation.v1",
        "dialect": dialect_override or "unresolved",
        "status": "FAILED",
        "blockedAt": None,
        "completedStages": [],
        "contractBundle": None,
        "resolverOutcome": None,
        "xsdErrors": [],
        "semanticErrors": [],
        "diagnostics": [],
        "orchestration": state.as_orchestration_dict(),
    }

    def update_validation() -> None:
        validation["completedStages"] = state.completed_stages
        validation["blockedAt"] = state.blocked_at
        validation["status"] = state.terminal_status or "FAILED"
        validation["orchestration"] = state.as_orchestration_dict()
        validation["diagnostics"] = ledger.diagnostics

    try:
        try:
            bundle = verify_contract_bundle(
                registry_path,
                adapter_registry_path,
                serialization_policy_path,
                runtime_supported_dialects=SUPPORTED_COMPILER_DIALECTS,
            )
            policy = bundle.serialization_policy
        except ContractBundleError as exc:
            ledger.add(
                source_entity_id="contract-bundle",
                source_type="CONTRACT_BUNDLE",
                source_fields={
                    "dialectRegistry": str(registry_path),
                    "adapterRegistry": str(
                        adapter_registry_path
                        or registry_path.parent
                        / "compiler"
                        / "inputxml-compiler-adapters.json"
                    ),
                },
                disposition="REJECT_INVALID",
                diagnostics=[str(exc)],
            )
            ledger.diagnostic("BLOCKING", "CONTRACT_BUNDLE_INVALID", str(exc))
            state.block("CONTRACT_BUNDLE_GATE")
            validation["contractBundle"] = {"status": "BLOCKED", "error": str(exc)}
            update_validation()
            return _result(None, ledger, source_hash, validation)

        state.transition(CompilerStage.CONTRACT_BUNDLE_VERIFIED)
        ledger.current_stage_sequence = len(state.completed_stages)
        ledger.contract_bundle = bundle.metadata
        validation["contractBundle"] = bundle.metadata
        state.transition(CompilerStage.SOURCE_ENVELOPE_CREATED)
        ledger.current_stage_sequence = len(state.completed_stages)

        dialects = bundle.dialects
        stripped = source.lstrip()
        json_source = (
            dialect_override in {"managed-stage-json", "uxml-rvm-intake"}
            or stripped[:1] in {b"{", b"["}
        )
        pdf_source = dialect_override == "pdf-input-echo" or stripped.startswith(b"%PDF")
        state.transition(CompilerStage.MEDIA_INSPECTED)
        ledger.current_stage_sequence = len(state.completed_stages)

        root: ET._Element | None
        json_text: str | None = None
        json_payload: Any = None
        managed_stage_intake: ManagedStageIntake | None = None
        psi116_intake: Psi116Intake | None = None
        if pdf_source:
            root = None
            dialect = dialect_override or "pdf-input-echo"
        elif json_source:
            root = None
            try:
                json_text, json_payload = strict_json_loads(source)
            except CompileBlocked as exc:
                ledger.diagnostic(
                    "BLOCKING",
                    "MANAGED_STAGE_JSON_INVALID",
                    str(exc),
                    "$",
                    diagnosticStage="MEDIA_INSPECTION_GATE",
                )
                state.block("MEDIA_INSPECTION_GATE")
                update_validation()
                return _result(None, ledger, source_hash, validation, policy)
            dialect = _json_dialect_from_payload(json_payload, dialect_override)
        else:
            try:
                root = _parse_xml(source, source_name)
            except CompileBlocked as exc:
                ledger.diagnostic(
                    "BLOCKING",
                    "XML_MEDIA_PARSE_FAILED",
                    str(exc),
                    "source-document",
                )
                state.block("MEDIA_INSPECTION_GATE")
                update_validation()
                return _result(None, ledger, source_hash, validation, policy)
            dialect = dialect_override or detect_dialect(root, bundle.registry)
        if dialect not in dialects:
            raise CompileBlocked(f"Dialect {dialect!r} is not registered.")
        state.transition(CompilerStage.DIALECT_RESOLVED)
        ledger.current_stage_sequence = len(state.completed_stages)

        ledger.dialect = dialect
        validation["dialect"] = dialect
        if dialect not in SUPPORTED_COMPILER_DIALECTS:
            acceptance = dialects[dialect].get("canonicalAcceptance")
            disposition = (
                "REJECT_INVALID"
                if acceptance == "EXCLUDED"
                else "DEFER_EXPLICITLY" if acceptance == "DIAGNOSTIC_ONLY" else "UNSUPPORTED_BLOCKING"
            )
            ledger.add(
                source_entity_id="document",
                source_type="DIALECT",
                source_fields={"dialect": dialect, "canonicalAcceptance": acceptance},
                disposition=disposition,
                diagnostics=["registered dialect has no runtime adapter implementation"],
            )
            ledger.diagnostic(
                "BLOCKING",
                "DIALECT_ADAPTER_NOT_IMPLEMENTED",
                "Registered dialect has no runtime adapter implementation.",
            )
            state.block("PROFILE_INTAKE_GATE")
            update_validation()
            return _result(None, ledger, source_hash, validation, policy)

        if dialect in PROFILE_CONTRACTS:
            validate_profile_intake(
                profile_id=dialect,
                root=root,
                context=context,
                explicit_override=dialect_override is not None,
                categorized_xsd_path=categorized_xsd_path,
                ledger=ledger,
            )
        elif dialect in TOPOLOGY_PROFILE_CONTRACTS:
            validate_topology_profile_intake(
                profile_id=dialect,
                root=root,
                context=context,
                explicit_override=dialect_override is not None,
                ledger=ledger,
            )
        elif dialect == "managed-stage-json":
            if json_text is None:
                raise CompileBlocked("Managed-stage strict JSON media evidence is missing.")
            managed_stage_intake = validate_managed_stage_intake(
                source,
                parsed=json_payload,
                source_text=json_text,
                source_name=source_name,
                context=context,
                explicit_override=dialect_override is not None,
                ledger=ledger,
            )
        elif dialect == "pipesstressexport-psi116-xml":
            psi116_intake = validate_psi116_profile_intake(
                source,
                root=root,
                context=context,
                explicit_override=dialect_override is not None,
                ledger=ledger,
            )
        state.transition(CompilerStage.PROFILE_INTAKE_VALIDATED)
        ledger.current_stage_sequence = len(state.completed_stages)
        aliases = _resolve_aliases(_load_json(alias_registry_path))
        registered_adapter_id = bundle.adapters[dialect]["adapterId"]
        outcome = resolve_registered_profile(
            dialect=dialect,
            adapter_id=registered_adapter_id,
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
        if outcome.profile_id != dialect:
            raise RuntimeError("Resolver returned a mismatched profile identity.")
        if outcome.adapter_id != registered_adapter_id:
            raise RuntimeError("Resolver returned a mismatched adapter identity.")
        validation["resolverOutcome"] = {
            "profileId": outcome.profile_id,
            "adapterId": outcome.adapter_id,
            "outcomeKind": outcome.outcome_kind.value,
            "sourceAccountingStatus": outcome.source_accounting_status,
            "profileMetrics": outcome.profile_metrics,
        }
        state.transition(CompilerStage.PROFILE_RESOLVED)
        ledger.current_stage_sequence = len(state.completed_stages)

        canonical = outcome.canonical_candidate
        if canonical is None:
            state.block("PROFILE_RESOLVER_GATE")
            update_validation()
            return _result(None, ledger, source_hash, validation, policy)
        if outcome.source_accounting_status != "COMPLETE":
            known_codes = {
                "SOURCE_ACCOUNTING_INCOMPLETE",
                "TOPOLOGY_SOURCE_ACCOUNTING_INCOMPLETE",
                "MANAGED_STAGE_SOURCE_ACCOUNTING_INCOMPLETE",
                "PSI116_SOURCE_ACCOUNTING_INCOMPLETE",
            }
            if not any(item.get("code") in known_codes for item in ledger.diagnostics):
                ledger.diagnostic(
                    "BLOCKING",
                    "SOURCE_ACCOUNTING_INCOMPLETE",
                    "Resolver did not prove complete source accounting.",
                    "source-accounting-proof",
                )
            state.block("SOURCE_ACCOUNTING_GATE")
            update_validation()
            return _result(canonical, ledger, source_hash, validation, policy)

        state.transition(CompilerStage.SOURCE_ACCOUNTED)
        ledger.current_stage_sequence = len(state.completed_stages)
        try:
            reconcile_decision_ledger(canonical, ledger, context=context)
        except CompileBlocked as exc:
            ledger.diagnostic("BLOCKING", "CANONICALIZATION_BLOCKED", str(exc))
            state.block("LEDGER_GATE")
            update_validation()
            return _result(None, ledger, source_hash, validation, policy)
        state.transition(CompilerStage.CANONICAL_CANDIDATE_BUILT)
        ledger.current_stage_sequence = len(state.completed_stages)

        xsd_errors = _validate_xsd(canonical, canonical_xsd_path)
        validation["xsdErrors"] = xsd_errors
        if xsd_errors:
            ledger.diagnostic(
                "ERROR",
                "CANONICAL_XSD_FAILED",
                "Canonical output failed XSD.",
                errors=xsd_errors,
            )
            state.block("XSD_GATE")
            update_validation()
            return _result(_blocked_return_candidate(dialect, canonical), ledger, source_hash, validation, policy)
        state.transition(CompilerStage.XSD_VALIDATED)
        ledger.current_stage_sequence = len(state.completed_stages)

        semantic_errors = _validate_schematron(canonical, semantic_rules_path)
        validation["semanticErrors"] = semantic_errors
        if semantic_errors:
            ledger.diagnostic(
                "BLOCKING",
                "CANONICAL_SEMANTIC_FAILED",
                "Canonical output failed Schematron.",
                errors=semantic_errors,
            )
            state.block("SCHEMATRON_GATE")
            update_validation()
            return _result(_blocked_return_candidate(dialect, canonical), ledger, source_hash, validation, policy)
        state.transition(CompilerStage.SCHEMATRON_VALIDATED)
        ledger.current_stage_sequence = len(state.completed_stages)

        if outcome.outcome_kind != OutcomeKind.CANONICAL_CANDIDATE or ledger.blocked:
            state.block("LEDGER_GATE")
            update_validation()
            return _result(canonical, ledger, source_hash, validation, policy)
        state.transition(CompilerStage.LEDGER_VALIDATED)
        ledger.current_stage_sequence = len(state.completed_stages)

        state.transition(CompilerStage.PRODUCTION_ACCEPTED)
        ledger.current_stage_sequence = len(state.completed_stages)
        state.accept()
        update_validation()
        return _result(canonical, ledger, source_hash, validation, policy)

    except CompileBlocked as exc:
        if not any(item.get("severity") in {"ERROR", "BLOCKING"} for item in ledger.diagnostics):
            ledger.diagnostic("BLOCKING", "CANONICALIZATION_BLOCKED", str(exc))
        state.block(_BLOCK_GATE_BY_STAGE[state.current_stage])
        update_validation()
        return _result(
            None,
            ledger,
            source_hash,
            validation,
            policy if "policy" in locals() else None,
        )


__all__ = [name for name in globals() if not name.startswith("__")]
