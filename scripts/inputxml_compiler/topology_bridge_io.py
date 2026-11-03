#!/usr/bin/env python3
"""Bounded subprocess and strict JSON I/O for the PR-6 topology bridge."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .base import CompileBlocked, DecisionLedger
from .topology_diagnostics import block

BRIDGE_SCRIPT = Path(__file__).with_name("node_xml_builder_bridge.cjs")
REQUEST_SCHEMA = "InputXmlTopologyBridgeRequest.v1"
MAX_REQUEST_BYTES = 8 * 1024 * 1024
MAX_STDOUT_BYTES = 8 * 1024 * 1024
MAX_STDERR_BYTES = 64 * 1024
TIMEOUT_SECONDS = 10


def request_bytes(request: dict[str, Any]) -> bytes:
    if request.get("schema") != REQUEST_SCHEMA:
        raise CompileBlocked("Internal topology request schema mismatch.")
    payload = json.dumps(
        request,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    if len(payload) > MAX_REQUEST_BYTES:
        raise CompileBlocked(
            f"Topology bridge request exceeds {MAX_REQUEST_BYTES} bytes."
        )
    return payload


def node_executable(
    context: dict[str, Any],
    ledger: DecisionLedger,
) -> str:
    configured = str(context.get("nodeExecutable") or "node").strip()
    path = shutil.which(configured)
    if path is None:
        block(
            ledger,
            "BRIDGE_CONTRACT_INVALID",
            f"Strict topology bridge requires Node.js executable {configured!r}.",
            "topology-bridge",
        )
    if not BRIDGE_SCRIPT.is_file():
        block(
            ledger,
            "BRIDGE_CONTRACT_INVALID",
            f"Strict topology bridge script is missing: {BRIDGE_SCRIPT}.",
            "topology-bridge",
        )
    return str(Path(path).resolve())


def run_bridge(
    node: str,
    payload: bytes,
    ledger: DecisionLedger,
) -> subprocess.CompletedProcess[bytes]:
    allowed_env = {
        key: os.environ[key]
        for key in ("SystemRoot", "WINDIR")
        if key in os.environ
    }
    process = subprocess.Popen(
        [node, str(BRIDGE_SCRIPT)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=allowed_env,
        shell=False,
    )
    try:
        stdout, stderr = process.communicate(payload, timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired as exc:
        process.kill()
        process.communicate()
        block(
            ledger,
            "BRIDGE_CONTRACT_INVALID",
            f"Strict topology bridge exceeded {TIMEOUT_SECONDS} seconds.",
            "topology-bridge",
        )
        raise CompileBlocked("Topology bridge timeout.") from exc
    _verify_stream_bounds(stdout, stderr, ledger)
    if process.returncode != 0:
        detail = stderr.decode("utf-8", errors="replace").strip()
        block(
            ledger,
            "BRIDGE_CONTRACT_INVALID",
            f"Strict topology bridge internal failure {process.returncode}: {detail}",
            "topology-bridge",
        )
    return subprocess.CompletedProcess(
        [node, str(BRIDGE_SCRIPT)],
        process.returncode,
        stdout,
        stderr,
    )


def strict_json_object(raw: bytes, ledger: DecisionLedger) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8", errors="strict")
        decoder = json.JSONDecoder(object_pairs_hook=_reject_duplicate_pairs)
        value, end = decoder.raw_decode(text)
        if text[end:].strip():
            raise ValueError("extra trailing bridge output")
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        block(
            ledger,
            "BRIDGE_CONTRACT_INVALID",
            f"Strict topology bridge returned invalid JSON: {exc}",
            "topology-bridge",
        )
    if not isinstance(value, dict):
        block(
            ledger,
            "BRIDGE_CONTRACT_INVALID",
            "Strict topology bridge result must be one JSON object.",
            "topology-bridge",
        )
    return value


def _verify_stream_bounds(
    stdout: bytes,
    stderr: bytes,
    ledger: DecisionLedger,
) -> None:
    if len(stdout) > MAX_STDOUT_BYTES:
        block(
            ledger,
            "BRIDGE_CONTRACT_INVALID",
            f"Strict topology bridge stdout exceeds {MAX_STDOUT_BYTES} bytes.",
            "topology-bridge",
        )
    if len(stderr) > MAX_STDERR_BYTES:
        block(
            ledger,
            "BRIDGE_CONTRACT_INVALID",
            f"Strict topology bridge stderr exceeds {MAX_STDERR_BYTES} bytes.",
            "topology-bridge",
        )


def _reject_duplicate_pairs(
    pairs: list[tuple[str, Any]],
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


__all__ = [
    "BRIDGE_SCRIPT",
    "node_executable",
    "request_bytes",
    "run_bridge",
    "strict_json_object",
]
