"""Reduced managed-stage fixtures and verification helpers for PR-7 tests."""
from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from scripts.inputxml_compiler.base import DecisionLedger
from scripts.inputxml_compiler.managed_stage_bridge_io import run_bridge
from scripts.inputxml_compiler.managed_stage_component_closure import (
    attach_verified_trace_elements,
    verify_component_topology_closure,
)
from scripts.inputxml_compiler.managed_stage_engineering import verify_engineering_projection
from scripts.inputxml_compiler.managed_stage_entities import verify_source_entities_and_ports
from scripts.inputxml_compiler.managed_stage_identity import verify_result_identity
from scripts.inputxml_compiler.managed_stage_inputxml import build_managed_stage_candidate
from scripts.inputxml_compiler.managed_stage_intake import (
    ManagedStageIntake,
    strict_json_loads,
    validate_managed_stage_intake,
)
from scripts.inputxml_compiler.managed_stage_parity import verify_parity_and_metrics
from scripts.inputxml_compiler.managed_stage_port_coverage import bind_source_port_element_coverage
from scripts.inputxml_compiler.managed_stage_source_decisions import (
    record_managed_stage_source_decisions,
)
from scripts.inputxml_compiler.managed_stage_topology import verify_topology_and_trace

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
CONTEXT = {
    "version": "11.00",
    "jobName": "PR7_TEST",
    "north": [0, 1, 0],
    "sourceRevision": 1,
}


def point(x: float, y: float, z: float) -> dict[str, float]:
    return {"x": x, "y": y, "z": z}


def engineering(line: str = "PR7-L-100") -> dict[str, Any]:
    return {
        "nominalBoreMm": 100,
        "pipeOdMm": 114.3,
        "wallThicknessMm": 6.02,
        "insulationThicknessMm": 0,
        "corrosionAllowanceMm": 0,
        "designTemperatureC": 100,
        "designPressureMpa": 1,
        "hydroPressure": 1.5,
        "materialCode": 106,
        "material": "A106 Grade B",
        "materialDensityKgM3": 7833,
        "insulationDensityKgM3": 0,
        "fluidDensityOpeKgM3": 965,
        "lineNo": line,
    }


def pipe(
    *,
    name: str = "=PR7/PIPE/1",
    start: tuple[float, float, float] = (0, 0, 0),
    end: tuple[float, float, float] = (1000, 0, 0),
    line: str = "PR7-L-100",
) -> dict[str, Any]:
    return {
        "name": f"PIPE {name}",
        "type": "PIPE",
        "attributes": {
            "TYPE": "PIPE",
            "NAME": name,
            "REF": name,
            "OWNER": "/PR7/B1",
            "APOS": point(*start),
            "LPOS": point(*end),
            "ABORE": "100mm",
            "LBORE": "100mm",
            "DTXR": "PIPE",
        },
        "enrichedAttributes": engineering(line),
    }


def bend() -> dict[str, Any]:
    return {
        "name": "ELBO =PR7/ELBO/1",
        "type": "ELBO",
        "attributes": {
            "TYPE": "ELBO",
            "NAME": "=PR7/ELBO/1",
            "REF": "=PR7/ELBO/1",
            "OWNER": "/PR7/B1",
            "APOS": point(0, 0, 0),
            "POS": point(500, 500, 0),
            "LPOS": point(1000, 0, 0),
            "ABORE": "100mm",
            "LBORE": "100mm",
            "DTXR": "ELBO",
        },
        "enrichedAttributes": engineering(),
    }


def valve() -> dict[str, Any]:
    value = pipe(name="=PR7/VALVE/1")
    value["name"] = "VALV =PR7/VALVE/1"
    value["type"] = "VALV"
    value["attributes"].update({
        "TYPE": "VALV",
        "NAME": "=PR7/VALVE/1",
        "REF": "=PR7/VALVE/1",
        "DTXR": "VALV",
    })
    return value


def safe_attachment() -> dict[str, Any]:
    return {
        "name": "SUPPORT =PR7/OPENING/1",
        "type": "SUPPORT",
        "attributes": {
            "TYPE": "ATTA",
            "NAME": "=PR7/OPENING/1",
            "REF": "=PR7/OPENING/1",
            "OWNER": "/PR7/B1",
            "POS": point(500, 0, 0),
            "APOS": point(500, 0, 0),
            "LPOS": point(500, 0, 0),
            "DTXR": "ATTA FOR FLOOR OPENING",
            "ISONOTE": "FENCE PENETRATION",
        },
    }


def branch(
    children: list[dict[str, Any]],
    *,
    name: str = "/PR7/B1",
    start: tuple[float, float, float] = (0, 0, 0),
    end: tuple[float, float, float] = (1000, 0, 0),
) -> dict[str, Any]:
    return {
        "name": name,
        "type": "BRANCH",
        "attributes": {
            "TYPE": "BRANCH",
            "NAME": name,
            "OWNER": "/PR7",
            "HPOS": point(*start),
            "TPOS": point(*end),
            "HBOR": "100mm",
            "TBOR": "100mm",
        },
        "children": children,
    }


def source_value(*, wrapper: str | None = None, children=None) -> Any:
    branches = [branch(children or [pipe()])]
    return branches if wrapper is None else {wrapper: branches}


def source_bytes(value: Any | None = None) -> bytes:
    return json.dumps(
        source_value() if value is None else value,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def ledger(name: str = "fixture.json") -> DecisionLedger:
    return DecisionLedger(
        "reallaksh19/3D_Converters",
        f"test://{name}",
        "managed-stage-test",
        "managed-stage-json",
    )


def build_intake(
    value: Any | None = None,
    *,
    context: dict[str, Any] | None = None,
    name: str = "fixture.json",
    decision_ledger: DecisionLedger | None = None,
) -> tuple[ManagedStageIntake, DecisionLedger]:
    source = source_bytes(value)
    text, parsed = strict_json_loads(source)
    used_ledger = decision_ledger or ledger(name)
    intake = validate_managed_stage_intake(
        source,
        parsed=parsed,
        source_text=text,
        source_name=name,
        context=copy.deepcopy(context or CONTEXT),
        explicit_override=False,
        ledger=used_ledger,
    )
    return intake, used_ledger


def raw_bridge_result(
    value: Any | None = None,
    *,
    context: dict[str, Any] | None = None,
) -> tuple[ManagedStageIntake, DecisionLedger, dict[str, Any]]:
    intake, used_ledger = build_intake(value, context=context)
    result = run_bridge(
        intake.bridge_request(),
        context=copy.deepcopy(context or CONTEXT),
        ledger=used_ledger,
    )
    return intake, used_ledger, result


def verified_evidence(
    value: Any | None = None,
    *,
    context: dict[str, Any] | None = None,
) -> tuple[Any, DecisionLedger, dict[str, Any]]:
    intake, used_ledger, result = raw_bridge_result(value, context=context)
    identity = verify_result_identity(intake, result, used_ledger)
    source = verify_source_entities_and_ports(intake, result, used_ledger)
    topology = verify_topology_and_trace(result, source, used_ledger)
    mappings = verify_component_topology_closure(
        result["canonicalTopology"],
        topology["collections"],
        source,
        used_ledger,
    )
    attach_verified_trace_elements(mappings, topology["traceByEntity"], used_ledger)
    topology["componentMappings"] = mappings
    topology["branchCollectionPath"] = intake.branch_collection_path
    projection = verify_engineering_projection(
        result,
        source,
        topology,
        used_ledger,
    )
    metrics = verify_parity_and_metrics(
        result,
        source,
        topology,
        projection,
        used_ledger,
    )
    candidate = build_managed_stage_candidate(
        result,
        intake,
        topology,
        used_ledger,
    )
    record_managed_stage_source_decisions(
        intake,
        source,
        topology,
        projection,
        used_ledger,
    )
    bind_source_port_element_coverage(topology, used_ledger)
    evidence = {
        "intake": intake,
        "identity": identity,
        "source": source,
        "topology": topology,
        "engineering": projection,
        "metrics": metrics,
        "result": result,
    }
    return candidate, used_ledger, evidence


__all__ = [
    "CONTEXT",
    "CONTRACTS",
    "ROOT",
    "bend",
    "branch",
    "build_intake",
    "engineering",
    "ledger",
    "pipe",
    "point",
    "raw_bridge_result",
    "safe_attachment",
    "source_bytes",
    "source_value",
    "valve",
    "verified_evidence",
]
