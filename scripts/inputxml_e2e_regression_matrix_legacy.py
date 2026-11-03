#!/usr/bin/env python3
"""Run the PR-G all-dialect InputXML assurance regression matrix.

The matrix covers every registered compiler outcome. Implemented adapters must
produce canonical InputXML, PR-E assurance, actual production-writer CII, and an
independent CII reparse proof. Diagnostic/excluded profiles must block exactly
at canonical intake.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import importlib.util
import json
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
WRITER_SCRIPTS = ROOT / "converters" / "scripts"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(WRITER_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(WRITER_SCRIPTS))


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path}.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


compiler = _load_module("inputxml_canonical_compiler_prg", ROOT / "scripts" / "inputxml_canonical_compiler.py")
assurance_builder = _load_module("inputxml_assurance_ledger_prg", ROOT / "scripts" / "inputxml_assurance_ledger.py")
projection = _load_module(
    "inputxml_to_cii2019_assured_projection_prg",
    WRITER_SCRIPTS / "inputxml_to_cii2019_assured_projection.py",
)
reparse = _load_module("cii2019_reparse_proof_prg", WRITER_SCRIPTS / "cii2019_reparse_proof.py")


@dataclass(frozen=True)
class MatrixCase:
    case_id: str
    dialect: str
    source_name: str
    source: bytes
    context: dict[str, Any]
    expected: str


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _json_hash(value: Any) -> str:
    return _sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def _canonical_inputxml(*, pressure_alias: bool = False, version: str = "11.00", enrichment: bool = False) -> bytes:
    pressure_name = "PRESSURE1" if pressure_alias else "PRESSURE_C1"
    line_name = "LINE_ID" if pressure_alias else "LINE"
    child = "<PipingClass>CL150</PipingClass>" if enrichment else ""
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<CAESARII xmlns="COADE" VERSION="{version}" XML_TYPE="Input">
  <PIPINGMODEL xmlns="" JOBNAME="PRG_CANONICAL" TIME="2026/07/15 12:00:00" ISSUE_NO="1" NUMELT="1" NUMNOZ="0" NOHGRS="0" NUMBEND="0" NUMRIGID="0" NUMEXPJNT="0" NUMREST="0" NUMFORCMNT="0" NUMUNFLOAD="0" NUMWIND="0" NUMELEOFF="0" NUMALLOW="0" NUMISECT="0" NORTH_X="0" NORTH_Y="1" NORTH_Z="0">
    <PIPINGELEMENT ID="E1" FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="114.3" WALL_THICK="6.02" INSUL_THICK="0" CORR_ALLOW="0" TEMP_EXP_C1="100" {pressure_name}="1000" HYDRO_PRESSURE="1500" INSUL_DENSITY="0" FLUID_DENSITY="965" MATERIAL_NUM="106" FROM_NAME="N10" TO_NAME="N20" {line_name}="PRG-L-100" FROM_X="0" FROM_Y="0" FROM_Z="0" TO_X="1000" TO_Y="0" TO_Z="0">{child}</PIPINGELEMENT>
  </PIPINGMODEL>
</CAESARII>
'''.encode("utf-8")


def _fragment() -> bytes:
    return b'''<PIPINGELEMENT ID="E1" FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="114.3" WALL_THICK="6.02" INSUL_THICK="0" CORR_ALLOW="0" TEMP_EXP_C1="100" PRESSURE_C1="1000" HYDRO_PRESSURE="1500" INSUL_DENSITY="0" FLUID_DENSITY="965" MATERIAL_NUM="106" FROM_NAME="N10" TO_NAME="N20" LINE="PRG-L-100" FROM_X="0" FROM_Y="0" FROM_Z="0" TO_X="1000" TO_Y="0" TO_Z="0"/>'''


def _categorized() -> bytes:
    original = _fragment().decode("utf-8")
    return f'''<CategorizedInputXML schema="categorized-inputxml/v3" sourceName="prg-categorized.xml"><Line id="PRG-L-100"><LineBlock><Branchname>PRG-L-100</Branchname><LineNo>PRG-L-100</LineNo></LineBlock><Element fromNode="10" toNode="20" elementKey="E1"><RouteGeometryBlock><DELTA_X>1000</DELTA_X><DELTA_Y>0</DELTA_Y><DELTA_Z>0</DELTA_Z></RouteGeometryBlock><SectionDimensionBlock><DIAMETER>114.3</DIAMETER><WALL_THICK>6.02</WALL_THICK><INSUL_THICK>0</INSUL_THICK></SectionDimensionBlock><OriginalElement>{html.escape(original)}</OriginalElement></Element></Line></CategorizedInputXML>'''.encode("utf-8")


def _root_branch_node() -> bytes:
    def node(number: int, x: int) -> str:
        return f'''<Node><NodeNumber>{number}</NodeNumber><NodeName>N{number}</NodeName><Endpoint>1</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType><Weight>0</Weight><ComponentRefNo>C-{number}</ComponentRefNo><ConnectionType/><OutsideDiameter>114.3</OutsideDiameter><WallThickness>6.02</WallThickness><CorrosionAllowance>0</CorrosionAllowance><InsulationThickness>0</InsulationThickness><Position>{x} 0 0</Position><BendRadius>0</BendRadius><SIF>0</SIF></Node>'''
    return f'''<Root><Branch><Branchname>PRG-L-100</Branchname><LineNo>PRG-L-100</LineNo><Pressure><Pressure1>1000</Pressure1><HydroPressure>1500</HydroPressure></Pressure><Temperature><Temperature1>100</Temperature1></Temperature><MaterialNumber>106</MaterialNumber><InsulationDensity>0</InsulationDensity><FluidDensity>965</FluidDensity>{node(10, 0)}{node(20, 1000)}</Branch></Root>'''.encode("utf-8")


def _managed_stage() -> bytes:
    engineering = {
        "nominalBoreMm": 100,
        "pipeOdMm": 114.3,
        "wallThicknessMm": 6.02,
        "insulationThicknessMm": 0,
        "corrosionAllowanceMm": 0,
        "designTemperatureC": 100,
        "designPressureMpa": 1.0,
        "hydroPressure": 1.5,
        "materialCode": 106,
        "material": "A106 Grade B",
        "materialDensityKgM3": 7833,
        "insulationDensityKgM3": 0,
        "fluidDensityOpeKgM3": 965,
        "lineNo": "PRG-L-100",
    }
    payload = [{
        "name": "/PRG/B1",
        "type": "BRANCH",
        "attributes": {
            "TYPE": "BRANCH", "NAME": "/PRG/B1", "OWNER": "/PRG",
            "HPOS": {"x": 0, "y": 0, "z": 0},
            "TPOS": {"x": 1000, "y": 0, "z": 0},
            "HBOR": "100mm", "TBOR": "100mm",
        },
        "children": [{
            "name": "PIPE =PRG/PIPE/1",
            "type": "PIPE",
            "attributes": {
                "TYPE": "PIPE", "NAME": "=PRG/PIPE/1", "REF": "=PRG/PIPE/1", "OWNER": "/PRG/B1",
                "APOS": {"x": 0, "y": 0, "z": 0},
                "LPOS": {"x": 1000, "y": 0, "z": 0},
                "ABORE": "100mm", "LBORE": "100mm", "DTXR": "PIPE",
            },
            "enrichedAttributes": engineering,
        }],
    }]
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def _pdf_echo() -> bytes:
    return b'''CAESAR II Input Echo
Job Name: PRG-PDF
Date: JUL 15, 2026 Time: 12:00
Input Listing
PIPE DATA
From 10 To 20 DX= 1000 mm.
Element Name= PRG-E1
Dia= 114.3 mm.
Wall= 6.02 mm.
Cor= 0 mm.
Insul Thk= 0 mm.
T1= 100 C
P1= 10 bars
PHyd= 15 bars
Mat= (106) A106 Grade B E= 200000 N./sq.mm.
Pipe Den= 7833 kg/cu.m.
Insul Den= 0 kg/cu.m.
Fluid Den= 965 kg/cu.m.
NODENAMES
'''


def _uxml_rows() -> bytes:
    points = [(0, 0, 0), (1000, 0, 0), (500, 866, 0)]
    spans = [(points[0], points[1]), (points[1], points[2]), (points[2], points[0])]
    rows = []
    for index, (start, end) in enumerate(spans, 1):
        rows.append({
            "componentId": f"C{index}", "rowNo": index, "type": "PIPE", "componentType": "PIPE",
            "pipelineRef": "PRG-L-100", "lineNo": "PRG-L-100", "convertedBore": 100,
            "ep1": {"x": start[0], "y": start[1], "z": start[2]},
            "ep2": {"x": end[0], "y": end[1], "z": end[2]},
            "wallThicknessMm": 6.02, "materialNumber": 106, "outsideDiameterMm": 114.3,
        })
    return json.dumps({"inputKind": "RVM_ROWS", "rows": rows}, separators=(",", ":")).encode("utf-8")


def matrix_cases() -> list[MatrixCase]:
    common_context = {"jobName": "PRG", "time": "2026/07/15 12:00:00", "issueNo": "1", "north": [0, 1, 0], "version": "11.00"}
    return [
        MatrixCase("canonical", "canonical-inputxml-v1", "canonical.input.xml", _canonical_inputxml(), {}, "FULL_CHAIN_PASS"),
        MatrixCase("pressure1", "caesar-inputxml-pressure1", "pressure1.input.xml", _canonical_inputxml(pressure_alias=True), {}, "FULL_CHAIN_PASS"),
        MatrixCase("pressure-c", "caesar-inputxml-pressure-c", "pressure-c.input.xml", _canonical_inputxml(), {}, "FULL_CHAIN_PASS"),
        MatrixCase("enriched", "enriched-inputxml-app", "enriched.input.xml", _canonical_inputxml(enrichment=True), {}, "FULL_CHAIN_PASS"),
        MatrixCase("fragment", "inputxml-fragment", "fragment.input.xml", _fragment(), common_context, "FULL_CHAIN_PASS"),
        MatrixCase("categorized", "categorized-inputxml-v3", "categorized.xml", _categorized(), common_context, "FULL_CHAIN_PASS"),
        MatrixCase("cii14", "cii14-inputxml", "cii14.input.xml", _canonical_inputxml(version="14.00"), {}, "FULL_CHAIN_PASS"),
        MatrixCase("xml-builder", "xml-builder-root-branch-node", "xml-builder.xml", _root_branch_node(), common_context, "FULL_CHAIN_PASS"),
        MatrixCase("seljson", "seljson-custom-root", "seljson.xml", _root_branch_node(), common_context, "FULL_CHAIN_PASS"),
        MatrixCase("managed-stage", "managed-stage-json", "managed-stage.json", _managed_stage(), common_context, "FULL_CHAIN_PASS"),
        MatrixCase(
            "pdf-input-echo", "pdf-input-echo", "input-echo.txt", _pdf_echo(),
            {**common_context, "lineId": "PRG-L-100", "sourceKind": "extracted-text", "extractor": "pr-g-matrix"},
            "FULL_CHAIN_PASS",
        ),
        MatrixCase(
            "uxml-rvm", "uxml-rvm-intake", "uxml-rvm.json", _uxml_rows(),
            {**common_context, "coordinateBasis": "CAESAR", "connectToleranceMm": 6},
            "FULL_CHAIN_PASS",
        ),
        MatrixCase("diagnostic-sidecar", "xml-to-cii-diagnostic-sidecar", "diagnostic.input.xml", _canonical_inputxml(), {}, "CANONICAL_BLOCKED"),
        MatrixCase("nodeset", "nodeset-v1", "nodeset.xml", b"<NodeSet/>", {}, "CANONICAL_BLOCKED"),
    ]


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"{path} must contain a JSON object.")
    return value


def _registered_outcomes() -> dict[str, str]:
    registry = _load_json(CONTRACTS / "compiler" / "inputxml-compiler-adapters.json")
    return {str(row["dialectId"]): str(row["status"]) for row in registry.get("adapters") or []}


def run_matrix(output_dir: Path | None = None) -> dict[str, Any]:
    cases = matrix_cases()
    registered = _registered_outcomes()
    case_dialects = {case.dialect for case in cases}
    missing = sorted(set(registered) - case_dialects)
    extra = sorted(case_dialects - set(registered))
    if missing or extra:
        raise RuntimeError(f"Matrix/adapter registry mismatch: missing={missing}, extra={extra}")

    field_catalog = _load_json(CONTRACTS / "catalogs" / "inputxml-field-catalog.json")
    projection_contract = _load_json(CONTRACTS / "catalogs" / "inputxml-cii-projection-contract.json")
    rows: list[dict[str, Any]] = []
    matrix_diagnostics: list[dict[str, Any]] = []
    target_root = output_dir or Path(tempfile.mkdtemp(prefix="inputxml-prg-matrix-"))
    target_root.mkdir(parents=True, exist_ok=True)

    for case in cases:
        case_dir = target_root / case.case_id
        case_dir.mkdir(parents=True, exist_ok=True)
        source_path = case_dir / case.source_name
        source_path.write_bytes(case.source)
        canonical_root, canonicalization, validation = compiler.compile_document(
            case.source,
            source_name=case.source_name,
            source_repository="reallaksh19/3D_Converters",
            source_path=f"pr-g://{case.case_id}/{case.source_name}",
            producer="pr-g-regression-matrix",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            dialect_override=case.dialect,
            context=case.context,
        )
        row: dict[str, Any] = {
            "caseId": case.case_id,
            "dialect": case.dialect,
            "adapterStatus": registered[case.dialect],
            "expected": case.expected,
            "sourceHashSha256": _sha256(case.source),
            "canonicalStatus": validation.get("status"),
            "canonicalizationRecordCount": len(canonicalization.get("records") or []),
            "canonicalHashSha256": canonicalization.get("canonicalHashSha256"),
            "assuranceStatus": "NOT_RUN",
            "projectionStatus": "NOT_RUN",
            "reparseStatus": "NOT_RUN",
            "diagnostics": [],
        }
        if case.expected == "CANONICAL_BLOCKED":
            if validation.get("status") != "BLOCKED" or canonical_root is not None:
                row["diagnostics"].append("Expected canonical intake to block without canonical output.")
            row["status"] = "PASS" if not row["diagnostics"] else "FAIL"
            rows.append(row)
            continue

        if validation.get("status") != "PASS" or canonical_root is None:
            row["diagnostics"].append(f"Canonical compiler did not PASS: {validation.get('diagnostics')}")
            row["status"] = "FAIL"
            rows.append(row)
            continue

        canonical_bytes = compiler._compiler._xml_bytes(canonical_root)
        canonical_path = case_dir / "canonical.input.xml"
        canonical_path.write_bytes(canonical_bytes)
        assurance = assurance_builder.build_assurance_ledger(
            canonical_xml=canonical_bytes,
            canonicalization_ledger=canonicalization,
            canonical_validation=validation,
            field_catalog=field_catalog,
            projection_contract=projection_contract,
        )
        row["assuranceStatus"] = assurance.get("status")
        row["assuranceHashSha256"] = assurance.get("assuranceHashSha256")
        if assurance.get("status") != "PASS":
            row["diagnostics"].append(f"PR-E assurance did not PASS: {assurance.get('diagnostics')}")
            row["status"] = "FAIL"
            rows.append(row)
            continue

        cii_text, projection_ledger = projection.build_assured_projection(
            canonical_xml=canonical_bytes,
            assurance=assurance,
            projection_contract=projection_contract,
            canonical_path=canonical_path,
            field_catalog=field_catalog,
        )
        row["projectionStatus"] = projection_ledger.get("status")
        row["projectionHashSha256"] = projection_ledger.get("projectionHashSha256")
        row["ciiHashSha256"] = (projection_ledger.get("chain") or {}).get("ciiHashSha256")
        if projection_ledger.get("status") != "PASS" or cii_text is None:
            row["diagnostics"].append(f"PR-F projection did not PASS: {projection_ledger.get('diagnostics')}")
            row["status"] = "FAIL"
            rows.append(row)
            continue

        reparse_proof = reparse.build_reparse_proof(
            cii_text=cii_text,
            projection_ledger=projection_ledger,
        )
        row["reparseStatus"] = reparse_proof.get("status")
        row["reparseProofHashSha256"] = reparse_proof.get("reparseProofHashSha256")
        row["reparsedModelHashSha256"] = (reparse_proof.get("chain") or {}).get("reparsedModelHashSha256")
        if reparse_proof.get("status") != "PASS":
            row["diagnostics"].append(f"Independent reparse did not PASS: {reparse_proof.get('diagnostics')}")
        row["status"] = "PASS" if not row["diagnostics"] else "FAIL"

        (case_dir / "canonicalization-ledger.json").write_text(json.dumps(canonicalization, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        (case_dir / "canonical-validation.json").write_text(json.dumps(validation, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        (case_dir / "assurance-ledger.json").write_text(json.dumps(assurance, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        (case_dir / "projection-ledger.json").write_text(json.dumps(projection_ledger, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        (case_dir / "output.cii").write_text(cii_text, encoding="utf-8")
        (case_dir / "reparse-proof.json").write_text(json.dumps(reparse_proof, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        rows.append(row)

    failed = [row for row in rows if row.get("status") != "PASS"]
    for row in failed:
        matrix_diagnostics.append({
            "severity": "BLOCKING",
            "code": "MATRIX_CASE_FAILED",
            "message": f"PR-G matrix case {row['caseId']} failed.",
            "context": {"dialect": row["dialect"], "diagnostics": row["diagnostics"]},
        })
    result: dict[str, Any] = {
        "schema": "InputXmlEndToEndRegressionMatrix.v1",
        "status": "PASS" if not failed else "BLOCKED",
        "authority": {
            "repository": "reallaksh19/3D_Converters",
            "runner": "scripts/inputxml_e2e_regression_matrix.py",
            "rule": "Every registered dialect has one explicit outcome; every accepted case proves source to canonical to CII to independent reparse.",
        },
        "summary": {
            "registeredDialectCount": len(registered),
            "caseCount": len(rows),
            "fullChainExpectedCount": sum(1 for case in cases if case.expected == "FULL_CHAIN_PASS"),
            "fullChainPassCount": sum(1 for row in rows if row.get("reparseStatus") == "PASS"),
            "canonicalBlockedExpectedCount": sum(1 for case in cases if case.expected == "CANONICAL_BLOCKED"),
            "passCount": len(rows) - len(failed),
            "failCount": len(failed),
        },
        "cases": rows,
        "diagnostics": matrix_diagnostics,
    }
    result["matrixHashSha256"] = _json_hash(result)
    (target_root / "inputxml-e2e-regression-matrix.json").write_text(
        json.dumps(result, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    result = run_matrix(args.output_dir)
    print(json.dumps({"status": result["status"], "summary": result["summary"], "matrixHashSha256": result["matrixHashSha256"]}, indent=2))
    return 0 if result["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
