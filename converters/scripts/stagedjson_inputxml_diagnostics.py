#!/usr/bin/env python3
"""Structured diagnostics for StagedJSON -> CAESAR II InputXML conversion."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

SCHEMA = "stagedjson-inputxml-diagnostics/v1"
SEVERITIES = {"ERROR", "WARNING", "INFO", "OK"}


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


@dataclass
class Diagnostics:
    source_name: str = ""
    build_profile: str = "stagedjson-to-inputxml"
    records: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def add(
        self,
        severity: str,
        code: str,
        message: str,
        *,
        stage: str = "",
        action: str = "",
        source_path: str = "",
        source_branch: str = "",
        source_index: int | None = None,
        source_type: str = "",
        source_field: str = "",
        output_field: str = "",
        element_index: int | None = None,
        node: int | str | None = None,
        count: int | None = None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        level = _text(severity).upper()
        if level not in SEVERITIES:
            level = "INFO"
        record = {
            "severity": level,
            "code": _text(code) or "STAGED_INPUTXML_DIAGNOSTIC",
            "message": _text(message),
            "module": "stagedjson-to-inputxml",
            "stage": _text(stage),
            "action": _text(action),
            "sourcePath": _text(source_path),
            "sourceBranch": _text(source_branch),
            "sourceIndex": source_index if isinstance(source_index, int) else None,
            "sourceType": _text(source_type),
            "sourceField": _text(source_field),
            "outputField": _text(output_field),
            "elementIndex": element_index if isinstance(element_index, int) else None,
            "node": node if node is not None else None,
            "count": count if isinstance(count, int) else None,
            "context": dict(context) if isinstance(context, dict) else None,
        }
        self.records.append(record)
        return record

    def document(self, *, output_ready: bool, output_name: str = "") -> dict[str, Any]:
        counts = Counter(record["severity"].lower() for record in self.records)
        summary = {
            "total": len(self.records),
            "error": counts.get("error", 0),
            "warning": counts.get("warning", 0),
            "info": counts.get("info", 0),
            "ok": counts.get("ok", 0),
        }
        return {
            "schema": SCHEMA,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sourceName": _text(self.source_name),
            "buildProfile": _text(self.build_profile) or "stagedjson-to-inputxml",
            "outputName": _text(output_name),
            "outputReady": bool(output_ready),
            "summary": summary,
            "metadata": dict(self.metadata),
            "records": list(self.records),
        }

    def write(self, path: Path, *, output_ready: bool, output_name: str = "") -> dict[str, Any]:
        document = self.document(output_ready=output_ready, output_name=output_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(document, indent=2, sort_keys=False) + "\n", encoding="utf-8")
        return document


def diagnostics_path_for(output_path: Path) -> Path:
    return output_path.with_name(
        f"{output_path.stem}_stagedjson_to_inputxml_diagnostics.json"
    )
