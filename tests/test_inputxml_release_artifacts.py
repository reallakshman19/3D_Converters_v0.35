#!/usr/bin/env python3
"""Validate generated InputXML v2 schemas, exact files, and mutation rejection."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
from typing import Any

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.inputxml_selected_output_manifest import (  # noqa: E402
    SelectedOutputManifestError,
    verify_selected_output_files,
)

SCHEMA_ARTIFACTS = {
    "inputxml-compatibility-request.schema.json": "compatibility-request.json",
    "inputxml-compatibility-policy.schema.json": "compatibility-policy.json",
    "inputxml-normalization-plan.schema.json": "normalization-plan.json",
    "canonical-source-model.schema.json": "canonical-source-model.json",
    "canonical-topology.schema.json": "canonical-topology-v2.json",
    "numbered-topology-projection.schema.json": "numbered-topology-projection.json",
    "parsed-inputxml-topology.schema.json": "parsed-inputxml-topology.json",
    "topology-parity-report.schema.json": "topology-parity-report-v2.json",
    "inputxml-cii-assurance-ledger.schema.json": "assurance-ledger-v2.json",
    "inputxml-diagnostic.schema.json": "diagnostic-report.json",
    "inputxml-resolver-trace.schema.json": "resolver-trace.json",
    "selected-output-manifest.schema.json": "selected-output-manifest.json",
}


def load_json(path: Path) -> Any:
    """Read exact UTF-8 JSON from one required test artifact."""
    return json.loads(path.read_text(encoding="utf-8"))


def validate_instance(schema_path: Path, artifact_path: Path) -> None:
    """Validate one release artifact and report all schema paths on failure."""
    validator = Draft202012Validator(load_json(schema_path))
    errors = sorted(validator.iter_errors(load_json(artifact_path)), key=lambda error: list(error.path))
    if errors:
        details = "; ".join(f"{list(error.path)}: {error.message}" for error in errors[:10])
        raise AssertionError(f"{artifact_path.name} violates {schema_path.name}: {details}")


def validate_relationships(schema_dir: Path, release_dir: Path) -> None:
    """Validate every individually versioned resolved relationship."""
    schema = load_json(schema_dir / "resolved-relationship.schema.json")
    validator = Draft202012Validator(schema)
    for index, relationship in enumerate(load_json(release_dir / "resolved-relationships.json")):
        errors = list(validator.iter_errors(relationship))
        if errors:
            raise AssertionError(f"Resolved relationship {index} is invalid: {errors[0].message}")


def verify_mutation_is_blocked(release_dir: Path) -> None:
    """[SIMULATED] Mutate selected CII bytes and require exact-manifest rejection."""
    manifest = load_json(release_dir / "selected-output-manifest.json")
    with TemporaryDirectory(prefix="inputxml-evidence-mutation-") as temporary:
        target = Path(temporary)
        shutil.copy2(release_dir / "selected-output-manifest.json", target)
        for descriptor in manifest["artifacts"].values():
            shutil.copy2(release_dir / descriptor["fileName"], target)
        (target / manifest["artifacts"]["cii"]["fileName"]).write_bytes(b"mutated evidence\n")
        try:
            verify_selected_output_files(manifest, target)
        except SelectedOutputManifestError:
            return
    raise AssertionError("[SIMULATED] Mutated selected evidence was not rejected.")


def main() -> None:
    """Validate the complete generated v2 reference release."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-dir", type=Path, required=True)
    release_dir = parser.parse_args().release_dir.resolve()
    schema_dir = ROOT / "contracts/inputxml/v2"
    for schema_name, artifact_name in SCHEMA_ARTIFACTS.items():
        validate_instance(schema_dir / schema_name, release_dir / artifact_name)
    validate_relationships(schema_dir, release_dir)
    manifest = load_json(release_dir / "selected-output-manifest.json")
    verify_selected_output_files(manifest, release_dir)
    verify_mutation_is_blocked(release_dir)
    print("[inputxml-release-artifacts] PASS: v2 schemas and exact selected files verified.")
    print("[SIMULATED] Mutated evidence bundle rejected.")


if __name__ == "__main__":
    main()
