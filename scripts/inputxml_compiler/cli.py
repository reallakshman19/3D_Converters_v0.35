#!/usr/bin/env python3
"""Command-line entry point for the InputXML canonical compiler."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .compiler import compile_document
from .publication import (
    CompilationView,
    PublicationError,
    publish_result_bundle,
    verify_committed_bundle,
)
from .serialization import hash_source_bytes
from .serialization_policy import (
    SerializationPolicyError,
    load_serialization_policy,
)
from .xml import _load_json


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--dialect")
    parser.add_argument("--context", type=Path)
    parser.add_argument("--source-repository", default="unknown")
    parser.add_argument("--source-path")
    parser.add_argument("--producer", default="inputxml-canonical-compiler")
    parser.add_argument(
        "--contracts-dir",
        type=Path,
        default=(
            Path(__file__).resolve().parents[2]
            / "contracts"
            / "inputxml"
            / "v1"
        ),
    )
    return parser


def _policy_path(contracts: Path) -> Path:
    return (
        contracts
        / "compiler"
        / "inputxml-deterministic-serialization.json"
    )


def _compile(args, source: bytes, context: dict) -> tuple:
    contracts = args.contracts_dir
    return compile_document(
        source,
        source_name=args.input.name,
        source_repository=args.source_repository,
        source_path=args.source_path or str(args.input),
        producer=args.producer,
        registry_path=contracts / "inputxml-dialect-registry.json",
        adapter_registry_path=(
            contracts / "compiler" / "inputxml-compiler-adapters.json"
        ),
        serialization_policy_path=_policy_path(contracts),
        alias_registry_path=(
            contracts / "catalogs" / "inputxml-alias-registry.json"
        ),
        canonical_xsd_path=contracts / "inputxml-canonical-v1.xsd",
        categorized_xsd_path=contracts / "categorized-inputxml-v3.xsd",
        semantic_rules_path=contracts / "inputxml-semantic-rules-v1.sch",
        dialect_override=args.dialect,
        context=context,
    )


def _verified_policy(
    contracts: Path,
    validation: dict,
) -> dict | None:
    bundle = validation.get("contractBundle") or {}
    if bundle.get("status") != "VERIFIED":
        return None
    return load_serialization_policy(_policy_path(contracts))


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    context = _load_json(args.context) if args.context else {}
    source = args.input.read_bytes()
    canonical, ledger, validation = _compile(args, source, context)
    try:
        policy = _verified_policy(args.contracts_dir, validation)
        view = CompilationView.from_compiler_result(
            stem=args.input.stem,
            source_hash=hash_source_bytes(source),
            canonical=canonical,
            ledger=ledger,
            validation=validation,
            policy=policy,
        )
        result = publish_result_bundle(view, args.output_dir)
        verification = verify_committed_bundle(
            args.output_dir,
            args.input.stem,
        )
    except (PublicationError, SerializationPolicyError) as exc:
        print(f"PUBLICATION ERROR: {exc}", file=sys.stderr)
        return 1
    if result.cleanup_pending:
        print(
            "WARNING: committed bundle is valid, "
            "but transaction cleanup is pending.",
            file=sys.stderr,
        )
    print(json.dumps({
        "status": validation["status"],
        "outputs": result.outputs,
        "verification": verification,
    }, indent=2))
    return 0 if validation["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ["main"]
