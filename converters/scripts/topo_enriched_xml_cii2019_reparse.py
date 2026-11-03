#!/usr/bin/env python3
"""Persist/read CII bytes before invoking the accepted independent reparser."""
from __future__ import annotations

import hashlib
import importlib.util
import sys
import tempfile
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPARSE_PATH = SCRIPT_DIR / "cii2019_reparse_proof.py"


class ReparseBoundaryError(RuntimeError):
    pass


def _load_reparser():
    spec = importlib.util.spec_from_file_location("te014_accepted_cii2019_reparse", REPARSE_PATH)
    if spec is None or spec.loader is None:
        raise ReparseBoundaryError(f"Unable to load accepted CII reparser at {REPARSE_PATH}.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def reparse_saved_cii_bytes(
    *,
    cii_bytes: bytes,
    assured_projection_ledger: dict[str, Any],
) -> dict[str, Any]:
    if not cii_bytes:
        raise ReparseBoundaryError("Independent CII reparse requires non-empty bytes.")
    with tempfile.TemporaryDirectory(prefix="te014-cii-reparse-") as tmp:
        path = Path(tmp) / "selected.cii"
        path.write_bytes(cii_bytes)
        reparsed_bytes = path.read_bytes()
    if reparsed_bytes != cii_bytes:
        raise ReparseBoundaryError("Saved/read CII byte boundary changed the generated artifact.")
    try:
        cii_text = reparsed_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ReparseBoundaryError("Generated CII bytes are not strict UTF-8.") from exc
    module = _load_reparser()
    proof = module.build_reparse_proof(
        cii_text=cii_text,
        projection_ledger=assured_projection_ledger,
    )
    errors = module.validate_reparse_proof(proof)
    if errors:
        raise ReparseBoundaryError(f"Accepted CII reparse proof is structurally invalid: {errors}.")
    return {
        "schema": "TopoEnrichedXmlCiiReparseEvidence.v1",
        "status": proof.get("status"),
        "savedReadBoundary": "PASS",
        "ciiHashSha256": hashlib.sha256(reparsed_bytes).hexdigest(),
        "reparseProofHashSha256": proof.get("reparseProofHashSha256"),
        "reparsedModelHashSha256": (proof.get("chain") or {}).get("reparsedModelHashSha256"),
        "summary": proof.get("summary"),
        "reparsed": proof.get("reparsed"),
        "diagnostics": proof.get("diagnostics") or [],
        "acceptedProof": proof,
    }


__all__ = ["ReparseBoundaryError", "reparse_saved_cii_bytes"]
