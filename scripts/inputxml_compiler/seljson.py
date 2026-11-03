#!/usr/bin/env python3
"""Strict SelectionJSON custom Root compiler adapter."""
from __future__ import annotations

from typing import Any

from lxml import etree as ET

from .base import DecisionLedger, SUPPORTED_COMPILER_DIALECTS
from .topology_resolver import compile_strict_topology_candidate


SUPPORTED_COMPILER_DIALECTS.add("seljson-custom-root")


def _compile_seljson_custom_root(
    source: bytes,
    *,
    source_root: ET._Element,
    ledger: DecisionLedger,
    context: dict[str, Any],
) -> ET._Element:
    return compile_strict_topology_candidate(
        source,
        source_root=source_root,
        profile_id="seljson-custom-root",
        ledger=ledger,
        context=context,
    )


__all__ = ["_compile_seljson_custom_root"]
