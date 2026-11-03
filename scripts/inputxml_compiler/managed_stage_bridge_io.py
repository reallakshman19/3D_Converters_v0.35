#!/usr/bin/env python3
"""Bounded subprocess and strict JSON I/O for managed-stage artifacts."""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

from .base import CompileBlocked, DecisionLedger
from .managed_stage_diagnostics import block
from .managed_stage_hashes import reject_unpaired_surrogates
from .managed_stage_process import (
    ProcessStreamLimitError,
    ProcessTimeoutError,
    run_bounded_process,
)

BRIDGE_SCRIPT = Path(__file__).with_name("node_managed_stage_bridge.mjs")
REQUEST_SCHEMA = "InputXmlManagedStageBridgeRequest.v1"
RESULT_SCHEMA = "InputXmlManagedStageBridgeResult.v1"
MAX_REQUEST_BYTES = 12 * 1024 * 1024
MAX_STDOUT_BYTES = 64 * 1024 * 1024
MAX_STDERR_BYTES = 64 * 1024
TIMEOUT_SECONDS = 45


def request_bytes(request: dict[str, Any]) -> bytes:
    if request.get("schema") != REQUEST_SCHEMA:
        raise CompileBlocked("Internal managed-stage request schema mismatch.")
    try:
        reject_unpaired_surrogates(request, path="bridge-request")
        payload = json.dumps(
            request,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError, UnicodeEncodeError) as exc:
        raise CompileBlocked(f"Managed-stage bridge request is not strict UTF-8 JSON: {exc}.") from exc
    if len(payload) > MAX_REQUEST_BYTES:
        raise CompileBlocked(
            f"Managed-stage bridge request exceeds {MAX_REQUEST_BYTES} bytes."
        )
    return payload


def resolved_node(context: dict[str, Any], ledger: DecisionLedger) -> str:
    configured = str(context.get("nodeExecutable") or "node").strip()
    path = shutil.which(configured)
    if path is None:
        block(
            ledger,
            "MANAGED_STAGE_BRIDGE_CONTRACT_INVALID",
            f"Managed-stage requires Node.js executable {configured!r}.",
            "managed-stage-bridge",
        )
    if not BRIDGE_SCRIPT.is_file():
        block(
            ledger,
            "MANAGED_STAGE_BRIDGE_CONTRACT_INVALID",
            f"Managed-stage bridge script is missing: {BRIDGE_SCRIPT}.",
            "managed-stage-bridge",
        )
    return str(Path(path).resolve())


def run_bridge(
    request: dict[str, Any],
    *,
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, Any]:
    payload = request_bytes(request)
    env = {
        key: os.environ[key]
        for key in ("SystemRoot", "WINDIR")
        if key in os.environ
    }
    try:
        result = run_bounded_process(
            [resolved_node(context, ledger), str(BRIDGE_SCRIPT)],
            input_bytes=payload,
            timeout_seconds=TIMEOUT_SECONDS,
            stdout_limit=MAX_STDOUT_BYTES,
            stderr_limit=MAX_STDERR_BYTES,
            env=env,
        )
    except ProcessTimeoutError as exc:
        block(
            ledger,
            "MANAGED_STAGE_BRIDGE_CONTRACT_INVALID",
            f"Managed-stage bridge exceeded {TIMEOUT_SECONDS} seconds.",
            "managed-stage-bridge",
        )
        raise CompileBlocked("Managed-stage bridge timeout.") from exc
    except ProcessStreamLimitError as exc:
        block(
            ledger,
            "MANAGED_STAGE_BRIDGE_CONTRACT_INVALID",
            f"Managed-stage {exc.stream_name} exceeded {exc.limit} bytes during execution.",
            "managed-stage-bridge",
            stream=exc.stream_name,
            byteLimit=exc.limit,
        )
    if result.returncode != 0:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        block(
            ledger,
            "MANAGED_STAGE_BRIDGE_CONTRACT_INVALID",
            f"Managed-stage bridge internal failure {result.returncode}: {message}",
            "managed-stage-bridge",
        )
    return strict_json_object(result.stdout, ledger)


def strict_json_object(raw: bytes, ledger: DecisionLedger) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8", errors="strict")
        decoder = json.JSONDecoder(
            object_pairs_hook=_reject_duplicate_pairs,
            parse_constant=_reject_nonfinite,
        )
        value, end = decoder.raw_decode(text)
        if text[end:].strip():
            raise ValueError("extra trailing bridge output")
        reject_unpaired_surrogates(value, path="bridge-result")
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        block(
            ledger,
            "MANAGED_STAGE_BRIDGE_CONTRACT_INVALID",
            f"Managed-stage bridge returned invalid JSON: {exc}.",
            "managed-stage-bridge",
        )
    if not isinstance(value, dict):
        block(
            ledger,
            "MANAGED_STAGE_BRIDGE_CONTRACT_INVALID",
            "Managed-stage bridge result must be one JSON object.",
            "managed-stage-bridge",
        )
    return value


def _reject_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def _reject_nonfinite(value: str) -> Any:
    raise ValueError(f"non-finite JSON value {value!r}")


__all__ = [
    "BRIDGE_SCRIPT",
    "REQUEST_SCHEMA",
    "RESULT_SCHEMA",
    "request_bytes",
    "resolved_node",
    "run_bridge",
    "strict_json_object",
]
