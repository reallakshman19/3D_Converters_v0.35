#!/usr/bin/env python3
"""CLI compatibility wrapper for the InputXML canonical compiler package."""

from pathlib import Path
import sys

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from scripts.inputxml_compiler.base import (
    COADE_NS,
    CompileBlocked,
    EXT_NS,
    SUPPORTED_COMPILER_DIALECTS,
)
from scripts.inputxml_compiler import compiler as _compiler
from scripts.inputxml_compiler import cli as _cli
from scripts.inputxml_compiler.serialization import serialize_canonical_xml
from scripts.inputxml_compiler.serialization_policy import load_serialization_policy
from scripts.inputxml_compiler.xml import detect_dialect

_POLICY_PATH = (
    REPOSITORY_ROOT
    / "contracts"
    / "inputxml"
    / "v1"
    / "compiler"
    / "inputxml-deterministic-serialization.json"
)
_LEGACY_XML_BYTES = _compiler._xml_bytes


def _authoritative_xml_bytes(root):
    if root.tag != f"{{{COADE_NS}}}CAESARII":
        return _LEGACY_XML_BYTES(root)
    return serialize_canonical_xml(
        root,
        load_serialization_policy(_POLICY_PATH),
    )


_compiler._xml_bytes = _authoritative_xml_bytes
compile_document = _compiler.compile_document
main = _cli.main

if __name__ == "__main__":
    raise SystemExit(main())
