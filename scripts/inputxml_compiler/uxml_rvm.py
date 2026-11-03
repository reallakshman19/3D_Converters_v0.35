from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .base import *
from .counts import _new_root
from .extension import *
from .xml import *

SUPPORTED_COMPILER_DIALECTS.add("uxml-rvm-intake")

_BRIDGE_SCRIPT = Path(__file__).with_name("node_uxml_rvm_bridge.mjs")
_SUPPORTED_COMPONENT_TYPES = {"PIPE"}
_EXACT_TOLERANCE_MM = Decimal("0.001")


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _json_hash(value: Any) -> str:
    return _sha256(_stable_json(value).encode("utf-8"))


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _upper(value: Any) -> str:
    return _clean(value).upper()


def _safe_xml_id(value: Any, fallback: str) -> str:
    raw = re.sub(r"[^A-Za-z0-9_.-]+", "-", _clean(value)) or fallback
    return raw if re.match(r"[A-Za-z_]", raw) else f"UXML-{raw}"


def _run_bridge(source: bytes, *, source_name: str, source_path: str, context: dict[str, Any]) -> dict[str, Any]:
    node = str(context.get("nodeExecutable") or os.environ.get("NODE") or "node")
    if shutil.which(node) is None:
        raise CompileBlocked(f"UXML/RVM adapter requires Node.js executable {node!r}.")
    if not _BRIDGE_SCRIPT.is_file():
        raise CompileBlocked(f"UXML/RVM bridge script is missing: {_BRIDGE_SCRIPT}.")
    bridge_context = {
        "sourceName": source_name,
        "sourcePath": source_path,
        "sourceHash": _sha256(source),
        "inputKind": context.get("inputKind"),
        "connectToleranceMm": context.get("connectToleranceMm", 6),
        "maxRayLengthMm": context.get("maxRayLengthMm", 500),
        "tubeToleranceMm": context.get("tubeToleranceMm", 12),
    }
    env = dict(os.environ)
    env["INPUTXML_COMPILER_UXML_RVM_CONTEXT"] = json.dumps(bridge_context)
    completed = subprocess.run(
        [node, str(_BRIDGE_SCRIPT)],
        input=source,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        check=False,
    )
    try:
        payload = json.loads(completed.stdout.decode("utf-8"))
    except json.JSONDecodeError as exc:
        diagnostic = completed.stderr.decode("utf-8", errors="replace").strip()
        raise CompileBlocked(f"UXML/RVM topology bridge returned invalid JSON: {diagnostic}") from exc
    if completed.returncode != 0 or not payload.get("ok"):
        raise CompileBlocked(
            "UXML/RVM topology bridge failed: "
            + str(payload.get("error") or completed.stderr.decode("utf-8", errors="replace").strip() or "unknown error")
        )
    return payload


def _lookup(mapping: Any, aliases: tuple[str, ...]) -> Any:
    if not isinstance(mapping, dict):
        return None
    normalized = {_upper(key).replace("_", "").replace("-", ""): value for key, value in mapping.items()}
    for alias in aliases:
        key = _upper(alias).replace("_", "").replace("-", "")
        if key in normalized and normalized[key] not in (None, ""):
            return normalized[key]
    return None


def _component_sources(component: dict[str, Any], context: dict[str, Any]) -> list[dict[str, Any]]:
    context_map = context.get("componentEngineering") or {}
    explicit = context_map.get(component.get("id")) if isinstance(context_map, dict) else None
    return [
        explicit if isinstance(explicit, dict) else {},
        component.get("normalized") or {},
        component.get("derived") or {},
        component.get("rawAttributes") or {},
        component,
    ]


def _component_value(component: dict[str, Any], context: dict[str, Any], aliases: tuple[str, ...]) -> Any:
    for source in _component_sources(component, context):
        value = _lookup(source, aliases)
        if value not in (None, ""):
            return value
    return None


def _decimal_optional(value: Any, field: str) -> str | None:
    if value in (None, ""):
        return None
    return _decimal_text(value, field)


def _pipeline_line(component: dict[str, Any], uxml: dict[str, Any], context: dict[str, Any]) -> str:
    direct = _clean(component.get("lineKey") or component.get("pipelineRef"))
    if direct:
        return direct
    ref = _clean(component.get("pipelineRef"))
    for pipeline in uxml.get("pipelines") or []:
        if ref and ref in {_clean(pipeline.get("id")), _clean(pipeline.get("pipelineRef"))}:
            value = _clean(pipeline.get("lineKey") or pipeline.get("lineNo") or pipeline.get("pipelineRef"))
            if value:
                return value
    return _clean(context.get("defaultLine") or context.get("lineId"))


def _coordinate_transform(context: dict[str, Any]):
    basis = _upper(context.get("coordinateBasis"))
    if basis in {"CAESAR", "CAESAR_MM", "IDENTITY_MM"}:
        return lambda point: {"x": Decimal(str(point["x"])), "y": Decimal(str(point["y"])), "z": Decimal(str(point["z"]))}
    transform = context.get("coordinateTransform")
    if not isinstance(transform, dict):
        raise CompileBlocked(
            "UXML/RVM adapter requires coordinateBasis='CAESAR' or an explicit coordinateTransform matrix and offset."
        )
    matrix = transform.get("matrix")
    offset = transform.get("offset", [0, 0, 0])
    if not (
        isinstance(matrix, list) and len(matrix) == 3 and all(isinstance(row, list) and len(row) == 3 for row in matrix)
        and isinstance(offset, list) and len(offset) == 3
    ):
        raise CompileBlocked("coordinateTransform requires a 3x3 matrix and three-value offset.")
    m = [[Decimal(str(value)) for value in row] for row in matrix]
    o = [Decimal(str(value)) for value in offset]
    def apply(point):
        vector = [Decimal(str(point[key])) for key in ("x", "y", "z")]
        values = [sum(m[row][column] * vector[column] for column in range(3)) + o[row] for row in range(3)]
        return {"x": values[0], "y": values[1], "z": values[2]}
    return apply


def _artifact_diagnostics(payload: dict[str, Any], ledger: DecisionLedger) -> None:
    for index, diagnostic in enumerate(payload.get("diagnostics") or [], 1):
        severity = _upper(diagnostic.get("severity") or "INFO")
        blocking = severity in {"ERROR", "FATAL", "BLOCKING"}
        ledger.add(
            source_entity_id=f"uxml-diagnostic-{index}",
            source_type="UXML_TOPOLOGY_DIAGNOSTIC",
            source_fields=diagnostic,
            projection_cardinality="1_TO_0",
            disposition="UNSUPPORTED_BLOCKING" if blocking else "PRESERVE_EXTENSION",
            diagnostics=[_clean(diagnostic.get("message") or diagnostic.get("code") or "UXML diagnostic")],
        )


def _ledger_source_artifacts(payload: dict[str, Any], ledger: DecisionLedger) -> None:
    uxml = payload.get("uxml") or {}
    mode = payload.get("mode") or "UNKNOWN"
    collections = {
        "UXML_SOURCE": uxml.get("sources") or [],
        "UXML_MAPPING": uxml.get("mappings") or [],
        "UXML_PIPELINE": uxml.get("pipelines") or [],
        "UXML_COMPONENT": uxml.get("components") or [],
        "UXML_ANCHOR": uxml.get("anchors") or [],
        "UXML_PORT": uxml.get("ports") or [],
        "UXML_SEGMENT": uxml.get("segments") or [],
        "UXML_SUPPORT": uxml.get("supports") or [],
        "UXML_TOPOLOGY_HINT": uxml.get("topologyHints") or [],
        "UXML_RAY_EVIDENCE": uxml.get("rayEvidence") or [],
        "UXML_LOSS_CONTRACT": uxml.get("lossContract") or [],
    }
    for source_type, rows in collections.items():
        for index, row in enumerate(rows, 1):
            blocking = source_type == "UXML_LOSS_CONTRACT"
            ledger.add(
                source_entity_id=_clean(row.get("id")) or f"{source_type.lower()}-{index}",
                source_type=source_type,
                source_fields=row,
                projection_cardinality="1_TO_0" if source_type not in {"UXML_COMPONENT", "UXML_PORT", "UXML_ANCHOR", "UXML_SEGMENT"} else "EVIDENCE_ONLY",
                disposition="UNSUPPORTED_BLOCKING" if blocking else "PRESERVE_EXTENSION",
                diagnostics=["UXML loss contract must be explicitly resolved before CII projection"] if blocking else [],
            )
    if mode == "RVM_ROWS":
        for index, row in enumerate(payload.get("rows") or [], 1):
            ledger.add(
                source_entity_id=f"rvm-row-{index}",
                source_type="RVM_EXTRACT_ROW",
                source_fields=row,
                projection_cardinality="1_TO_MANY",
                disposition="PRESERVE_EXTENSION",
                evidence=["rvm-pcf-extract/RvmRowsToUxmlAdapter.js"],
            )
    for node in (payload.get("universalGraph") or {}).get("nodes") or []:
        ledger.add(
            source_entity_id=_clean(node.get("id")) or "uxml-node",
            source_type="UXML_UNIVERSAL_NODE",
            source_fields=node,
            canonical_node_ids=[],
            projection_cardinality="1_TO_1",
            disposition="PRESERVE_EXTENSION",
        )
    for connection in (payload.get("topologyDecision") or {}).get("acceptedConnections") or []:
        ledger.add(
            source_entity_id=_clean(connection.get("id")) or "uxml-accepted-connection",
            source_type="UXML_ACCEPTED_CONNECTION",
            source_fields=connection,
            projection_cardinality="1_TO_1",
            disposition="ACCEPT_TOPOLOGY_CONNECTION" if connection.get("universalEdge") else "UNSUPPORTED_BLOCKING",
            evidence=["uxml-topology-decision-gate/v1"],
            diagnostics=["Ray/proximity connection has no coordinate-mutating canonical projection"] if not connection.get("universalEdge") else [],
        )
    _artifact_diagnostics(payload, ledger)


def _strict_topology_checks(payload: dict[str, Any], ledger: DecisionLedger) -> None:
    validation = payload.get("validation") or {}
    decision = payload.get("topologyDecision") or {}
    universal = payload.get("universalGraph") or {}
    if validation.get("exportAllowed") is not True:
        ledger.add(
            source_entity_id="uxml-validation-gate",
            source_type="UXML_VALIDATION_GATE",
            source_fields=validation,
            projection_cardinality="BLOCKED",
            disposition="UNSUPPORTED_BLOCKING",
            diagnostics=["UXML validation gate did not allow export"],
        )
    if decision.get("exportAllowed") is not True:
        ledger.add(
            source_entity_id="uxml-topology-decision-gate",
            source_type="UXML_TOPOLOGY_DECISION",
            source_fields=decision,
            projection_cardinality="BLOCKED",
            disposition="UNSUPPORTED_BLOCKING",
            diagnostics=["UXML topology decision gate did not allow export"],
        )
    edge_by_id = {_clean(edge.get("id")): edge for edge in universal.get("edges") or []}
    for connection in decision.get("acceptedConnections") or []:
        edge = connection.get("universalEdge") or {}
        edge_id = _clean(edge.get("id"))
        resolved = edge_by_id.get(edge_id, edge)
        distance = Decimal(str(resolved.get("distanceMm") or 0))
        if not edge_id or distance > _EXACT_TOLERANCE_MM or _upper(resolved.get("edgeClass")) != "EXACT_CONNECTION":
            ledger.add(
                source_entity_id=_clean(connection.get("id")) or "uxml-nonexact-connection",
                source_type="UXML_NONEXACT_CONNECTION",
                source_fields=connection,
                projection_cardinality="1_TO_0",
                disposition="UNSUPPORTED_BLOCKING",
                diagnostics=["Canonical InputXML requires exact shared-node coordinates; tolerance/ray promotion is evidence only"],
            )


def _graph_node_numbers(payload: dict[str, Any]) -> dict[str, int]:
    nodes = sorted(
        (payload.get("universalGraph") or {}).get("nodes") or [],
        key=lambda item: (_clean(item.get("id")), _stable_json(item.get("point") or {})),
    )
    return {_clean(node.get("id")): (index + 1) * 10 for index, node in enumerate(nodes)}


def _port_graph_nodes(payload: dict[str, Any]) -> dict[str, str]:
    return {
        _clean(port.get("sourcePortId")): _clean(port.get("nodeId"))
        for port in (payload.get("universalGraph") or {}).get("ports") or []
        if _clean(port.get("sourcePortId")) and _clean(port.get("nodeId"))
    }


def _port_for_role(uxml: dict[str, Any], component_id: str, role: str) -> dict[str, Any] | None:
    wanted = _upper(role)
    return next(
        (
            port for port in uxml.get("ports") or []
            if _clean(port.get("componentId")) == component_id and _upper(port.get("role")) == wanted
        ),
        None,
    )


def _engineering_attributes(component: dict[str, Any], context: dict[str, Any], entity_id: str) -> dict[str, str]:
    aliases = {
        "DIAMETER": ("diameterMm", "outsideDiameterMm", "pipeOdMm", "outsideDiameter", "odMm", "od"),
        "WALL_THICK": ("wallThicknessMm", "wallThickness", "wallThkMm", "wallThk", "wtMm", "wt"),
        "INSUL_THICK": ("insulationThicknessMm", "insulationThickness", "insulThickMm"),
        "CORR_ALLOW": ("corrosionAllowanceMm", "corrosionAllowance", "corrAllowMm"),
        "TEMP_EXP_C1": ("temperatureC", "designTemperatureC", "tempC1"),
        "PRESSURE_C1": ("pressureKpa", "designPressureKpa", "pressureC1Kpa"),
        "HYDRO_PRESSURE": ("hydroPressureKpa", "hydrotestPressureKpa"),
        "INSUL_DENSITY": ("insulationDensityKgCuCm", "insulDensityKgCuCm"),
        "FLUID_DENSITY": ("fluidDensityKgCuCm",),
        "MATERIAL_NUM": ("materialNumber", "materialNum", "materialCode"),
    }
    result: dict[str, str] = {}
    for field, names in aliases.items():
        value = _component_value(component, context, names)
        if value in (None, ""):
            continue
        if field == "MATERIAL_NUM":
            result[field] = _integer_text(value, f"{entity_id}@{field}", nonnegative=True)
        else:
            result[field] = _decimal_text(value, f"{entity_id}@{field}")
    if "DIAMETER" not in result or Decimal(result["DIAMETER"]) <= 0:
        raise CompileBlocked(f"UXML PIPE {component.get('id')} requires explicit outside diameter; bore is not treated as OD.")
    if "WALL_THICK" not in result or Decimal(result["WALL_THICK"]) < 0:
        raise CompileBlocked(f"UXML PIPE {component.get('id')} requires explicit nonnegative wall thickness.")
    return result


def _preserve_model_artifacts(model: ET._Element, payload: dict[str, Any], ledger: DecisionLedger) -> None:
    artifacts = {
        "UxmlInputMode": payload.get("mode") or "UNKNOWN",
        "UxmlDocumentDigest": _json_hash(payload.get("uxml") or {}),
        "UxmlValidationDigest": _json_hash(payload.get("validation") or {}),
        "UxmlUniversalGraphDigest": _json_hash(payload.get("universalGraph") or {}),
        "UxmlRayGraphDigest": _json_hash(payload.get("rayGraph") or {}),
        "UxmlComparisonDigest": _json_hash(payload.get("comparison") or {}),
        "UxmlTopologyDecisionDigest": _json_hash(payload.get("topologyDecision") or {}),
    }
    for name, value in artifacts.items():
        _extension_record(
            model,
            producer=ledger.producer,
            dialect=ledger.dialect,
            name=name,
            source_path=ledger.source_path,
            source_entity_id="document",
            source_field=name,
            value=str(value),
            disposition="PRESERVE_EXTENSION",
            criticality="MEDIUM",
            confidence=1.0,
        )
    _ensure_extension_last(model)


def _compile_uxml_rvm_source(
    source: bytes,
    *,
    source_name: str,
    source_path: str,
    ledger: DecisionLedger,
    context: dict[str, Any],
) -> ET._Element:
    version = _clean(context.get("version"))
    north = context.get("north")
    if not version:
        raise CompileBlocked("UXML/RVM adapter requires explicit CAESAR version context.")
    if not isinstance(north, list) or len(north) != 3:
        raise CompileBlocked("UXML/RVM adapter requires explicit north=[x,y,z] context.")
    transform = _coordinate_transform(context)
    payload = _run_bridge(source, source_name=source_name, source_path=source_path, context=context)
    uxml = payload.get("uxml") or {}
    units = uxml.get("units") or {}
    if _upper(units.get("coordinates")) != "MM" or _upper(units.get("length")) != "MM":
        raise CompileBlocked("UXML/RVM canonical projection currently requires coordinate and length units MM.")
    _ledger_source_artifacts(payload, ledger)
    _strict_topology_checks(payload, ledger)

    root, model = _new_root(version)
    model.set("JOBNAME", _clean(context.get("jobName") or (uxml.get("header") or {}).get("modelId") or Path(source_name).stem or "UXML_RVM_CANONICAL"))
    model.set("TIME", _clean(context.get("time") or (uxml.get("header") or {}).get("createdAt")))
    model.set("ISSUE_NO", _clean(context.get("issueNo")))
    for field, value in zip(("NORTH_X", "NORTH_Y", "NORTH_Z"), north):
        model.set(field, _decimal_text(value, field))

    node_numbers = _graph_node_numbers(payload)
    port_nodes = _port_graph_nodes(payload)
    graph_nodes = {_clean(node.get("id")): node for node in (payload.get("universalGraph") or {}).get("nodes") or []}
    components = sorted(uxml.get("components") or [], key=lambda item: (_clean(item.get("lineKey") or item.get("pipelineRef")), _clean(item.get("id"))))
    emitted = 0
    pair_seen: set[tuple[int, int]] = set()
    for component in components:
        component_id = _clean(component.get("id"))
        component_type = _upper(component.get("normalizedType") or component.get("type"))
        if component_type not in _SUPPORTED_COMPONENT_TYPES:
            ledger.add(
                source_entity_id=component_id or "uxml-component",
                source_type=component_type or "UNKNOWN",
                source_fields=component,
                projection_cardinality="1_TO_0",
                disposition="UNSUPPORTED_BLOCKING",
                diagnostics=["Only explicit PIPE spans have an approved UXML/RVM canonical CII projection in PR-D5"],
            )
            continue
        port1 = _port_for_role(uxml, component_id, "PIPE_END_1")
        port2 = _port_for_role(uxml, component_id, "PIPE_END_2")
        if not port1 or not port2:
            ledger.add(
                source_entity_id=component_id,
                source_type="PIPE",
                source_fields=component,
                projection_cardinality="1_TO_0",
                disposition="UNSUPPORTED_BLOCKING",
                diagnostics=["PIPE requires exactly two endpoint ports PIPE_END_1 and PIPE_END_2"],
            )
            continue
        graph_node1 = port_nodes.get(_clean(port1.get("id")))
        graph_node2 = port_nodes.get(_clean(port2.get("id")))
        if not graph_node1 or not graph_node2 or graph_node1 not in node_numbers or graph_node2 not in node_numbers:
            ledger.add(
                source_entity_id=component_id,
                source_type="PIPE",
                source_fields={"component": component, "port1": port1, "port2": port2},
                projection_cardinality="1_TO_0",
                disposition="UNSUPPORTED_BLOCKING",
                diagnostics=["PIPE endpoint port is not resolved to UniversalTopoGraph node"],
            )
            continue
        from_node, to_node = node_numbers[graph_node1], node_numbers[graph_node2]
        if from_node == to_node:
            ledger.add(
                source_entity_id=component_id,
                source_type="PIPE",
                source_fields=component,
                projection_cardinality="1_TO_0",
                disposition="UNSUPPORTED_BLOCKING",
                diagnostics=["PIPE endpoints collapse to the same topology node"],
            )
            continue
        pair = (from_node, to_node)
        if pair in pair_seen:
            ledger.add(
                source_entity_id=component_id,
                source_type="PIPE",
                source_fields=component,
                projection_cardinality="1_TO_0",
                disposition="UNSUPPORTED_BLOCKING",
                diagnostics=["duplicate directed topology pair would violate canonical InputXML"],
            )
            continue
        pair_seen.add(pair)
        point1 = transform(port1.get("point") or {})
        point2 = transform(port2.get("point") or {})
        delta = {axis: point2[axis] - point1[axis] for axis in ("x", "y", "z")}
        if all(abs(value) <= _EXACT_TOLERANCE_MM for value in delta.values()):
            ledger.add(
                source_entity_id=component_id,
                source_type="PIPE",
                source_fields=component,
                projection_cardinality="1_TO_0",
                disposition="UNSUPPORTED_BLOCKING",
                diagnostics=["PIPE span is zero length after coordinate transformation"],
            )
            continue
        line = _pipeline_line(component, uxml, context)
        if not line:
            ledger.add(
                source_entity_id=component_id,
                source_type="PIPE",
                source_fields=component,
                projection_cardinality="1_TO_0",
                disposition="UNSUPPORTED_BLOCKING",
                diagnostics=["PIPE has no explicit lineKey/pipelineRef/defaultLine"],
            )
            continue
        entity_id = _safe_xml_id(component_id, f"UXML-PE-{emitted + 1:06d}")
        try:
            engineering = _engineering_attributes(component, context, entity_id)
        except CompileBlocked as exc:
            ledger.add(
                source_entity_id=component_id,
                source_type="PIPE",
                source_fields=component,
                projection_cardinality="1_TO_0",
                disposition="UNSUPPORTED_BLOCKING",
                diagnostics=[str(exc)],
            )
            continue
        element = ET.Element(
            "PIPINGELEMENT",
            ID=entity_id,
            FROM_NODE=str(from_node),
            TO_NODE=str(to_node),
            DELTA_X=_decimal_text(delta["x"], f"{entity_id}@DELTA_X"),
            DELTA_Y=_decimal_text(delta["y"], f"{entity_id}@DELTA_Y"),
            DELTA_Z=_decimal_text(delta["z"], f"{entity_id}@DELTA_Z"),
            LINE=line,
            FROM_X=_decimal_text(point1["x"], f"{entity_id}@FROM_X"),
            FROM_Y=_decimal_text(point1["y"], f"{entity_id}@FROM_Y"),
            FROM_Z=_decimal_text(point1["z"], f"{entity_id}@FROM_Z"),
            TO_X=_decimal_text(point2["x"], f"{entity_id}@TO_X"),
            TO_Y=_decimal_text(point2["y"], f"{entity_id}@TO_Y"),
            TO_Z=_decimal_text(point2["z"], f"{entity_id}@TO_Z"),
            **engineering,
        )
        _extension_record(
            element,
            producer=ledger.producer,
            dialect=ledger.dialect,
            name="UxmlComponentDigest",
            source_path=ledger.source_path,
            source_entity_id=component_id,
            source_field="component",
            value=_json_hash(component),
            disposition="PRESERVE_EXTENSION",
            criticality="MEDIUM",
            confidence=1.0,
        )
        _ensure_extension_last(element)
        model.append(element)
        emitted += 1
        ledger.add(
            source_entity_id=component_id,
            source_type="PIPE",
            source_fields={"component": component, "port1": port1, "port2": port2, "graphNodes": [graph_node1, graph_node2]},
            canonical_element_ids=[entity_id],
            canonical_node_ids=[str(from_node), str(to_node)],
            inputxml_element_ids=[entity_id],
            cii_section="ELEMENTS",
            projection_cardinality="1_TO_1",
            disposition="EMIT_1_TO_1",
            evidence=["UXML component identity", "UniversalTopoGraph exact endpoint nodes", "explicit engineering context"],
        )

    counts = {
        "NUMELT": emitted,
        "NUMNOZ": 0,
        "NOHGRS": 0,
        "NUMBEND": 0,
        "NUMRIGID": 0,
        "NUMEXPJNT": 0,
        "NUMREST": 0,
        "NUMFORCMNT": 0,
        "NUMUNFLOAD": 0,
        "NUMWIND": 0,
        "NUMELEOFF": 0,
        "NUMALLOW": 0,
        "NUMISECT": 0,
    }
    for field, value in counts.items():
        model.set(field, str(value))
    if emitted == 0:
        ledger.add(
            source_entity_id="document",
            source_type="UXML_RVM_PROJECTION",
            source_fields={"componentCount": len(components)},
            projection_cardinality="MANY_TO_ZERO",
            disposition="UNSUPPORTED_BLOCKING",
            diagnostics=["No canonical PIPE element could be emitted"],
        )
    _preserve_model_artifacts(model, payload, ledger)
    ledger.add(
        source_entity_id="document",
        source_type="UXML_RVM_INTAKE",
        source_fields={
            "mode": payload.get("mode"),
            "componentCount": len(components),
            "emittedPipeCount": emitted,
            "validationExportAllowed": (payload.get("validation") or {}).get("exportAllowed"),
            "topologyExportAllowed": (payload.get("topologyDecision") or {}).get("exportAllowed"),
        },
        canonical_element_ids=[element.get("ID") for element in model.findall("PIPINGELEMENT")],
        canonical_node_ids=sorted({value for element in model.findall("PIPINGELEMENT") for value in (element.get("FROM_NODE"), element.get("TO_NODE")) if value}),
        projection_cardinality="1_TO_MANY",
        disposition="PROJECT_WITH_UXML_TOPOLOGY_DECISION_GATE",
        evidence=[
            "UxmlValidationGate",
            "UxmlFaceModelBuilder",
            "UxmlUniversalTopoGraphBuilder",
            "UxmlRayTopoGraphBuilder",
            "UxmlTopologyDecisionGate",
        ],
    )
    return root


__all__ = [name for name in globals() if not name.startswith("__")]
