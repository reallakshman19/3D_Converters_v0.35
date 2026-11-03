#!/usr/bin/env python3
"""TE-014 atomic proof: selected TE-013 PSI116 -> canonical InputXML -> CII(2019)."""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import tempfile
from copy import deepcopy
from pathlib import Path
from typing import Any

from lxml import etree as LET

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from scripts.inputxml_assurance_ledger import build_assurance_ledger, validate_assurance_ledger  # noqa: E402
from scripts.inputxml_compiler.base import COADE_NS, DecisionLedger  # noqa: E402
from scripts.inputxml_compiler.compiler import compile_document  # noqa: E402
from scripts.inputxml_compiler.psi116_common import (  # noqa: E402
    POLICY_PATH,
    json_hash,
    load_projection_policy,
    stable_json_bytes,
)
from scripts.inputxml_compiler.psi116_intake import validate_psi116_profile_intake  # noqa: E402
from scripts.inputxml_compiler.serialization import serialize_canonical_xml  # noqa: E402
from scripts.inputxml_compiler.serialization_policy import load_serialization_policy  # noqa: E402
from scripts.inputxml_compiler.xml import _parse_xml  # noqa: E402
from topo_enriched_xml_cii2019_ledger import (  # noqa: E402
    LedgerBuildBlocked,
    build_te014_projection_ledger,
    loss_accounting,
    summary_value,
    validate_projection_ledger,
)
from topo_enriched_xml_cii2019_projection import (  # noqa: E402
    ProjectionBoundaryError,
    validate_te013_production_result,
)
from topo_enriched_xml_cii2019_reparse import (  # noqa: E402
    ReparseBoundaryError,
    reparse_saved_cii_bytes,
)

CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
ASSURED_PATH = SCRIPT_DIR / "inputxml_to_cii2019_assured_projection.py"


class TopoCiiProofBlocked(RuntimeError):
    pass


def prove_topo_enriched_xml_to_cii2019(
    production_result: dict[str, Any],
) -> dict[str, Any]:
    diagnostics: list[dict[str, Any]] = []
    evidence: dict[str, Any] = {}
    cii_bytes: bytes | None = None
    projection_ledger: dict[str, Any] | None = None
    reparse_evidence: dict[str, Any] | None = None
    canonical_bytes: bytes | None = None
    assured_ledger: dict[str, Any] | None = None
    try:
        boundary = validate_te013_production_result(production_result)
        evidence["te013Boundary"] = _without_bytes(boundary)
        source_bytes = boundary["xmlBytes"]
        canonical, compiler_ledger, compiler_validation, canonical_bytes = _compile_psi116(
            source_bytes, production_result
        )
        evidence["compilerValidation"] = compiler_validation
        evidence["canonicalizationLedgerHashSha256"] = json_hash(compiler_ledger)
        assured_ledger = _build_assurance(canonical_bytes, compiler_ledger, compiler_validation)
        evidence["assuranceHashSha256"] = assured_ledger["assuranceHashSha256"]
        cii_text, assured_projection = _run_assured_projection(canonical_bytes, assured_ledger)
        if cii_text is None or assured_projection.get("status") != "PASS":
            raise TopoCiiProofBlocked(
                f"Accepted assured InputXML/CII boundary blocked: {assured_projection.get('diagnostics')}."
            )
        cii_bytes = cii_text.encode("utf-8")
        reparse_evidence = reparse_saved_cii_bytes(
            cii_bytes=cii_bytes,
            assured_projection_ledger=assured_projection,
        )
        if reparse_evidence.get("status") != "PASS":
            raise TopoCiiProofBlocked("Independent saved/read CII reparse did not PASS.")
        intake = _rebuild_intake(source_bytes, production_result)
        projection_ledger = build_te014_projection_ledger(
            production_result=production_result,
            boundary=boundary,
            intake=intake,
            canonical=canonical,
            canonical_bytes=canonical_bytes,
            compiler_ledger=compiler_ledger,
            compiler_validation=compiler_validation,
            assured_ledger=assured_ledger,
            assured_projection=assured_projection,
            reparse_evidence=reparse_evidence,
        )
        ledger_errors = validate_projection_ledger(projection_ledger)
        if projection_ledger["status"] != "PASS" or ledger_errors:
            raise TopoCiiProofBlocked(
                "TE-014 semantic projection ledger blocked: "
                f"diagnostics={projection_ledger['diagnostics']}, errors={ledger_errors}."
            )
    except (
        OSError,
        ValueError,
        ProjectionBoundaryError,
        ReparseBoundaryError,
        TopoCiiProofBlocked,
        LedgerBuildBlocked,
    ) as exc:
        diagnostics.append({
            "severity": "BLOCKING",
            "code": "TE014_CII_PROOF_BLOCKED",
            "message": str(exc),
        })
        cii_bytes = None

    status = "PASS" if cii_bytes and projection_ledger and reparse_evidence else "BLOCKED"
    result: dict[str, Any] = {
        "schema": "TopoEnrichedXmlCiiProofResult.v1",
        "status": status,
        "acceptedCiiArtifact": None,
        "acceptedCiiBytes": None,
        "canonicalInputXml": None if canonical_bytes is None else canonical_bytes.decode("utf-8"),
        "canonicalHashSha256": None if canonical_bytes is None else _sha(canonical_bytes),
        "assuranceLedger": assured_ledger,
        "projectionLedger": projection_ledger,
        "reparseEvidence": reparse_evidence,
        "lossAccounting": loss_accounting(projection_ledger),
        "nodeNumberMismatches": summary_value(projection_ledger, "nodeNumberMismatchCount"),
        "unaccountedOccurrences": summary_value(projection_ledger, "unaccountedOccurrenceCount"),
        "evidence": evidence,
        "diagnostics": diagnostics,
    }
    if status == "PASS" and cii_bytes is not None:
        result["acceptedCiiBytes"] = cii_bytes.decode("utf-8")
        result["acceptedCiiArtifact"] = {
            "schema": "AcceptedCii2019Artifact.v1",
            "ciiHashSha256": _sha(cii_bytes),
            "byteLength": len(cii_bytes),
            "projectionLedgerHashSha256": projection_ledger["projectionLedgerHashSha256"],
            "reparseProofHashSha256": reparse_evidence["reparseProofHashSha256"],
        }
    result["proofResultHashSha256"] = json_hash(result)
    return result


def _compile_psi116(
    source_bytes: bytes,
    production_result: dict[str, Any],
) -> tuple[LET._Element, dict[str, Any], dict[str, Any], bytes]:
    context = {"te013ProductionResult": production_result}
    canonical, ledger, validation = compile_document(
        source_bytes,
        source_name="te013-selected.psi.xml",
        source_repository="reallaksh19/3D_Converters",
        source_path="TE-013:selected-productionBundle.xmlText",
        producer="TE-014 strict PSI116 canonical intake",
        registry_path=CONTRACTS / "inputxml-dialect-registry.json",
        adapter_registry_path=CONTRACTS / "compiler" / "inputxml-compiler-adapters.json",
        serialization_policy_path=(
            CONTRACTS / "compiler" / "inputxml-deterministic-serialization.json"
        ),
        alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
        canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
        categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
        semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
        dialect_override=None,
        context=context,
    )
    if validation.get("status") != "PASS" or canonical is None or ledger.get("status") != "PASS":
        raise TopoCiiProofBlocked(
            f"Registered PSI116 canonical compilation did not PASS: validation={validation}, ledger={ledger.get('diagnostics')}."
        )
    if validation.get("dialect") != "pipesstressexport-psi116-xml":
        raise TopoCiiProofBlocked("Canonical compiler did not select the registered PSI116 profile.")
    policy = load_serialization_policy(
        CONTRACTS / "compiler" / "inputxml-deterministic-serialization.json"
    )
    canonical_bytes = serialize_canonical_xml(canonical, policy)
    if ledger.get("canonicalHashSha256") != _sha(canonical_bytes):
        raise TopoCiiProofBlocked("Canonical compiler ledger hash differs from serialized canonical bytes.")
    if ledger.get("sourceHashSha256") != _sha(source_bytes):
        raise TopoCiiProofBlocked("Canonical compiler source hash differs from exact TE-013 PSI bytes.")
    return canonical, ledger, validation, canonical_bytes


def _build_assurance(
    canonical_bytes: bytes,
    compiler_ledger: dict[str, Any],
    compiler_validation: dict[str, Any],
) -> dict[str, Any]:
    field_catalog = _load_json(CONTRACTS / "catalogs" / "inputxml-field-catalog.json")
    projection_contract = _load_json(
        CONTRACTS / "catalogs" / "inputxml-cii-projection-contract.json"
    )
    assurance = build_assurance_ledger(
        canonical_xml=canonical_bytes,
        canonicalization_ledger=compiler_ledger,
        canonical_validation=compiler_validation,
        field_catalog=field_catalog,
        projection_contract=projection_contract,
    )
    errors = validate_assurance_ledger(assurance)
    if errors or assurance.get("status") != "PASS":
        raise TopoCiiProofBlocked(
            f"Accepted InputXML assurance ledger did not PASS: errors={errors}, diagnostics={assurance.get('diagnostics')}."
        )
    return assurance


def _run_assured_projection(
    canonical_bytes: bytes,
    assurance: dict[str, Any],
) -> tuple[str | None, dict[str, Any]]:
    module = _load_module("te014_assured_inputxml_cii_projection", ASSURED_PATH)
    contract = _load_json(CONTRACTS / "catalogs" / "inputxml-cii-projection-contract.json")
    with tempfile.TemporaryDirectory(prefix="te014-canonical-") as tmp:
        path = Path(tmp) / "selected.canonical.input.xml"
        path.write_bytes(canonical_bytes)
        cii_text, ledger = module.build_assured_projection(
            canonical_xml=canonical_bytes,
            assurance=assurance,
            projection_contract=contract,
            canonical_path=path,
        )
    errors = module.validate_projection_ledger(ledger)
    if errors:
        raise TopoCiiProofBlocked(f"Assured projection ledger is invalid: {errors}.")
    return cii_text, ledger


def _rebuild_intake(source: bytes, production_result: dict[str, Any]):
    root = _parse_xml(source, "te013-selected.psi.xml")
    ledger = DecisionLedger(
        "reallaksh19/3D_Converters",
        "TE-013:selected-productionBundle.xmlText",
        "TE-014 proof reparse",
        "pipesstressexport-psi116-xml",
    )
    return validate_psi116_profile_intake(
        source,
        root=root,
        context={"te013ProductionResult": production_result},
        explicit_override=False,
        ledger=ledger,
    )


def _without_bytes(value: dict[str, Any]) -> dict[str, Any]:
    return {key: deepcopy(item) for key, item in value.items() if key != "xmlBytes"}


def _sha(data: bytes) -> str:
    import hashlib
    return hashlib.sha256(data).hexdigest()


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TopoCiiProofBlocked(f"{path} must contain a JSON object.")
    return value


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise TopoCiiProofBlocked(f"Unable to load accepted module {path}.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module



def serialize_proof_result(value: dict[str, Any]) -> bytes:
    return stable_json_bytes(value) + b"\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--production-result", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    result = json.loads(args.production_result.read_text(encoding="utf-8"))
    proof = prove_topo_enriched_xml_to_cii2019(result)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(serialize_proof_result(proof))
    print(json.dumps({
        "status": proof["status"],
        "proofResultHashSha256": proof["proofResultHashSha256"],
        "ciiHashSha256": (proof.get("acceptedCiiArtifact") or {}).get("ciiHashSha256"),
    }, indent=2))
    return 0 if proof["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "TopoCiiProofBlocked", "prove_topo_enriched_xml_to_cii2019", "serialize_proof_result",
    "validate_projection_ledger",
]