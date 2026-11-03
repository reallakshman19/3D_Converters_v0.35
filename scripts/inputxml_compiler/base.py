#!/usr/bin/env python3
"""Shared contracts and ledger primitives for the InputXML compiler."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import sys
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable

from lxml import etree as ET
from lxml import isoschematron

COADE_NS = "COADE"
EXT_NS = "urn:reallaksh19:inputxml:extension:v1"
SCH_NS = "http://purl.oclc.org/dsdl/schematron"
NSMAP = {None: COADE_NS, "ext": EXT_NS}
SENTINEL = Decimal("-1.0101")
SUPPORTED_COMPILER_DIALECTS = {
    "canonical-inputxml-v1",
    "caesar-inputxml-pressure1",
    "caesar-inputxml-pressure-c",
    "enriched-inputxml-app",
    "inputxml-fragment",
    "categorized-inputxml-v3",
    "cii14-inputxml",
    "xml-to-cii-diagnostic-sidecar",
}
COUNT_FIELDS = (
    "NUMELT", "NUMNOZ", "NOHGRS", "NUMBEND", "NUMRIGID", "NUMEXPJNT",
    "NUMREST", "NUMFORCMNT", "NUMUNFLOAD", "NUMWIND", "NUMELEOFF",
    "NUMALLOW", "NUMISECT",
)
ROOT_ATTRS = {"VERSION", "XML_TYPE"}
MODEL_ATTRS = {
    "JOBNAME", "TIME", "ISSUE_NO", *COUNT_FIELDS,
    "NORTH_X", "NORTH_Y", "NORTH_Z",
}
ELEMENT_CORE_ATTRS = {
    "ID", "FROM_NODE", "TO_NODE", "DELTA_X", "DELTA_Y", "DELTA_Z",
    "DIAMETER", "WALL_THICK", "INSUL_THICK", "CORR_ALLOW",
    *{f"TEMP_EXP_C{i}" for i in range(1, 10)},
    *{f"PRESSURE_C{i}" for i in range(1, 10)},
    "HYDRO_PRESSURE", "INSUL_DENSITY", "FLUID_DENSITY", "MATERIAL_NUM",
    "FROM_NAME", "TO_NAME", "LINE", "FROM_X", "FROM_Y", "FROM_Z",
    "TO_X", "TO_Y", "TO_Z",
}
PRESERVE_ELEMENT_ATTRS = {
    "MATERIAL_NAME", "MODULUS", "POISSONS", "PIPE_DENSITY",
    *{f"HOT_MOD{i}" for i in range(1, 10)},
    "REFRACTORY_DENSITY", "REFRACTORY_THK", "CLADDING_DEN",
    "CLADDING_THK", "INSUL_CLAD_UNIT_WEIGHT", "MILL_TOL_PLUS",
    "MILL_TOL_MINUS", "SEAM_WELD", "NAME",
}
INHERITED_DECIMAL_FIELDS = (
    "DIAMETER", "WALL_THICK", "INSUL_THICK", "CORR_ALLOW",
    *tuple(f"TEMP_EXP_C{i}" for i in range(1, 10)),
    *tuple(f"PRESSURE_C{i}" for i in range(1, 10)),
    "HYDRO_PRESSURE", "INSUL_DENSITY", "FLUID_DENSITY",
)
INHERITED_INTEGER_FIELDS = ("MATERIAL_NUM",)
ELEMENT_CHILD_ORDER = {
    "BEND": 0,
    "RIGID": 1,
    "SIF": 2,
    "RESTRAINT": 3,
    "HANGER": 4,
}
KNOWN_ENRICHMENT_CHILDREN = {
    "DTXR_POS", "PipingClass", "Point_properties_basis",
    "PipingClassBasis", "SelectionJsonSourceIds", "ComponentRefNo",
    "SourceIdentity", "TopologyEvidence",
}
UNSUPPORTED_ENGINEERING_CHILDREN = {
    "ALLOWABLESTRESS", "DISPLACEMENTS", "FORCESMOMENTS", "UNIFORM",
    "WIND", "OFFSETS", "EXPANSION_JOINT", "EXPANSIONJOINT",
    "REDUCER", "FLANGES",
}
NOZZLE_NAMES = {
    "WRC_297_NOZZLE",
    "API650_NOZZLE",
    "PD5500_NOZZLE",
    "CUSTOM_NOZZLE",
}
_SEVERITY_RANK = {
    "BLOCKING": 0,
    "ERROR": 1,
    "WARNING": 2,
    "INFO": 3,
}


class CompileBlocked(RuntimeError):
    pass


def _diagnostic_key(item: dict[str, Any]) -> tuple[Any, ...]:
    return (
        item.get("stageSequence", 0),
        _SEVERITY_RANK.get(item.get("severity", "INFO"), 4),
        item.get("code", ""),
        item.get("sourceEntityId", ""),
        json.dumps(
            item.get("context", {}),
            sort_keys=True,
            ensure_ascii=False,
            allow_nan=False,
        ),
        item.get("message", ""),
    )


@dataclass
class DecisionLedger:
    source_repository: str
    source_path: str
    producer: str
    dialect: str
    records: list[dict[str, Any]] = field(default_factory=list)
    diagnostics: list[dict[str, Any]] = field(default_factory=list)
    blocked: bool = False
    contract_bundle: dict[str, Any] | None = None
    current_stage_sequence: int = 0

    def add(
        self,
        *,
        source_entity_id: str,
        source_type: str,
        source_fields: dict[str, Any] | list[str] | str,
        canonical_element_ids: list[str] | None = None,
        canonical_node_ids: list[str] | None = None,
        inputxml_element_ids: list[str] | None = None,
        cii_section: str | None = None,
        projection_cardinality: str = "1_TO_1",
        disposition: str = "EMIT_1_TO_1",
        evidence: list[str] | None = None,
        confidence: dict[str, float] | None = None,
        diagnostics: list[str] | None = None,
    ) -> None:
        if disposition in {"DROP", "SKIP"}:
            raise ValueError("Generic DROP/SKIP dispositions are forbidden.")
        self.records.append({
            "recordId": f"IXCC-{len(self.records)+1:07d}",
            "sourceRepository": self.source_repository,
            "sourcePath": self.source_path,
            "producer": self.producer,
            "dialect": self.dialect,
            "sourceEntityId": source_entity_id,
            "sourceType": source_type,
            "sourceFields": source_fields,
            "canonicalComponentIds": [],
            "canonicalNodeIds": canonical_node_ids or [],
            "canonicalElementIds": canonical_element_ids or [],
            "InputXMLElementIds": inputxml_element_ids or [],
            "CIISection": cii_section,
            "CIIIndex": None,
            "projectionCardinality": projection_cardinality,
            "disposition": disposition,
            "evidence": evidence or [],
            "confidence": confidence or {
                "identity": 1.0,
                "topology": 1.0,
                "geometry": 1.0,
                "dimensions": 1.0,
                "attributes": 1.0,
                "ciiProjection": 1.0,
            },
            "diagnostics": diagnostics or [],
        })
        if disposition in {
            "DEFER_EXPLICITLY",
            "UNSUPPORTED_BLOCKING",
            "REJECT_INVALID",
        }:
            self.blocked = True

    def diagnostic(
        self,
        severity: str,
        code: str,
        message: str,
        source_entity_id: str = "",
        **context: Any,
    ) -> None:
        self.diagnostics.append({
            "stageSequence": self.current_stage_sequence,
            "severity": severity,
            "code": code,
            "sourceEntityId": source_entity_id,
            "message": message,
            "context": context,
        })
        self.diagnostics.sort(key=_diagnostic_key)
        if severity in {"ERROR", "BLOCKING"}:
            self.blocked = True

    def as_dict(
        self,
        source_hash: str,
        output_hash: str | None,
    ) -> dict[str, Any]:
        result = {
            "schema": "InputXmlCanonicalizationDecisionLedger.v1",
            "sourceHashSha256": source_hash,
            "canonicalHashSha256": output_hash,
            "sourceRepository": self.source_repository,
            "sourcePath": self.source_path,
            "producer": self.producer,
            "dialect": self.dialect,
            "status": "BLOCKED" if self.blocked else "PASS",
            "recordCount": len(self.records),
            "records": self.records,
            "diagnostics": list(self.diagnostics),
        }
        if self.contract_bundle is not None:
            result["contractBundle"] = self.contract_bundle
        return result


__all__ = [name for name in globals() if not name.startswith("__")]
