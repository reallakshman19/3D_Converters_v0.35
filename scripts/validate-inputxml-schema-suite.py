#!/usr/bin/env python3
"""Validate InputXML XSD/Schematron suite and its positive/negative golden corpus."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from lxml import etree, isoschematron

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_DIR = ROOT / "contracts" / "inputxml" / "v1"
GOLDEN_DIR = CONTRACT_DIR / "golden"
CANONICAL_XSD = CONTRACT_DIR / "inputxml-canonical-v1.xsd"
EXTENSION_XSD = CONTRACT_DIR / "inputxml-extension-v1.xsd"
CATEGORIZED_XSD = CONTRACT_DIR / "categorized-inputxml-v3.xsd"
SCHEMATRON_FILE = CONTRACT_DIR / "inputxml-semantic-rules-v1.sch"
MANIFEST_FILE = GOLDEN_DIR / "manifest.json"
DIALECT_REGISTRY = CONTRACT_DIR / "inputxml-dialect-registry.json"


def compile_xsd(path: Path) -> etree.XMLSchema:
    try:
        return etree.XMLSchema(etree.parse(str(path)))
    except (OSError, etree.XMLSyntaxError, etree.XMLSchemaParseError) as exc:
        raise AssertionError(f"{path}: XSD compilation failed: {exc}") from exc


def compile_schematron(path: Path) -> isoschematron.Schematron:
    try:
        return isoschematron.Schematron(etree.parse(str(path)), store_report=True)
    except (OSError, etree.XMLSyntaxError, etree.SchematronParseError) as exc:
        raise AssertionError(f"{path}: Schematron compilation failed: {exc}") from exc


def parse_xml(path: Path) -> etree._ElementTree:
    parser = etree.XMLParser(resolve_entities=False, no_network=True, remove_blank_text=False)
    try:
        return etree.parse(str(path), parser)
    except (OSError, etree.XMLSyntaxError) as exc:
        raise AssertionError(f"{path}: XML parsing failed: {exc}") from exc


def first_error(log: etree._ListErrorLog) -> str:
    return str(log.last_error) if log.last_error is not None else "no diagnostic"


def semantic_failures(schematron: isoschematron.Schematron) -> list[str]:
    report = schematron.validation_report
    if report is None:
        return []
    ns = {"svrl": "http://purl.oclc.org/dsdl/svrl"}
    return [
        " ".join(node.xpath("string(svrl:text)", namespaces=ns).split())
        for node in report.xpath("//svrl:failed-assert", namespaces=ns)
    ]


def validate_case(
    case: dict[str, str],
    canonical_schema: etree.XMLSchema,
    categorized_schema: etree.XMLSchema,
    schematron: isoschematron.Schematron,
) -> tuple[str, str]:
    path = GOLDEN_DIR / case["path"]
    document = parse_xml(path)
    profile = case["profile"]
    expected = case["expected"]
    schema = canonical_schema if profile == "canonical" else categorized_schema
    xsd_ok = schema.validate(document)

    if expected == "XSD_FAIL":
        assert not xsd_ok, f"{case['id']}: expected XSD failure but passed"
        return case["id"], f"XSD_FAIL ({first_error(schema.error_log)})"

    assert xsd_ok, f"{case['id']}: XSD failed unexpectedly: {first_error(schema.error_log)}"
    if profile == "categorized":
        assert expected == "PASS", f"{case['id']}: categorized profile supports PASS or XSD_FAIL only"
        return case["id"], "PASS"

    semantic_ok = schematron.validate(document)
    failures = semantic_failures(schematron)
    if expected == "SEMANTIC_FAIL":
        assert not semantic_ok, f"{case['id']}: expected semantic failure but passed"
        assert failures, f"{case['id']}: semantic failure produced no failed-assert evidence"
        return case["id"], f"SEMANTIC_FAIL ({'; '.join(failures)})"

    assert expected == "PASS", f"{case['id']}: unsupported expected result {expected}"
    assert semantic_ok, f"{case['id']}: semantic validation failed: {'; '.join(failures)}"
    return case["id"], "PASS"


def static_contract_checks() -> None:
    canonical_text = CANONICAL_XSD.read_text(encoding="utf-8")
    extension_text = EXTENSION_XSD.read_text(encoding="utf-8")
    categorized_text = CATEGORIZED_XSD.read_text(encoding="utf-8")
    schematron_text = SCHEMATRON_FILE.read_text(encoding="utf-8")
    dialect_registry = json.loads(DIALECT_REGISTRY.read_text(encoding="utf-8"))

    assert 'targetNamespace="COADE"' in canonical_text
    assert 'name="XML_TYPE"' in canonical_text
    assert 'name="PIPINGMODEL"' in canonical_text
    assert 'name="PIPINGELEMENT"' in canonical_text
    assert 'name="PRESSURE_C1"' in canonical_text and 'name="PRESSURE1"' not in canonical_text
    assert 'name="LINE"' in canonical_text and 'name="LINE_ID"' not in canonical_text
    assert 'maxOccurs="6"' in canonical_text
    assert 'urn:reallaksh19:inputxml:extension:v1' in canonical_text
    assert 'UNSUPPORTED_BLOCKING' in extension_text
    assert 'categorized-inputxml/v3' in categorized_text
    assert "UNSUPPORTED_BLOCKING extension evidence blocks production validation" in schematron_text
    dialects = dialect_registry.get("dialects", [])
    assert len(dialects) == 15, "dialect registry must retain all 15 registered profiles"
    ids = [entry.get("dialectId") for entry in dialects]
    assert len(ids) == len(set(ids)), "dialect IDs must be unique"
    direct = [entry for entry in dialects if entry.get("canonicalAcceptance") == "DIRECT"]
    assert [entry.get("dialectId") for entry in direct] == ["canonical-inputxml-v1"]
    categorized = next(entry for entry in dialects if entry.get("dialectId") == "categorized-inputxml-v3")
    assert categorized.get("canonicalAcceptance") == "RECONCILIATION_REQUIRED"


def main() -> None:
    static_contract_checks()
    extension_schema = compile_xsd(EXTENSION_XSD)
    assert extension_schema is not None
    canonical_schema = compile_xsd(CANONICAL_XSD)
    categorized_schema = compile_xsd(CATEGORIZED_XSD)
    schematron = compile_schematron(SCHEMATRON_FILE)

    manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    cases = manifest.get("cases", [])
    assert cases, "golden corpus manifest contains no cases"
    ids = [case["id"] for case in cases]
    assert len(ids) == len(set(ids)), "golden corpus case IDs are not unique"

    results = [
        validate_case(case, canonical_schema, categorized_schema, schematron)
        for case in cases
    ]
    for case_id, result in results:
        print(f"{case_id}: {result}")
    print(f"InputXML schema suite PASS: {len(results)} golden cases validated.")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"InputXML schema suite FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
