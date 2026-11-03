#!/usr/bin/env python3
"""Strict XML Builder Root/Branch/Node compiler adapter."""
from __future__ import annotations

from typing import Any

from lxml import etree as ET

from .base import DecisionLedger, SUPPORTED_COMPILER_DIALECTS
from .topology_resolver import compile_strict_topology_candidate


SUPPORTED_COMPILER_DIALECTS.add("xml-builder-root-branch-node")


def _compile_xml_builder_source(
    source: bytes,
    *,
    source_root: ET._Element,
    ledger: DecisionLedger,
    context: dict[str, Any],
) -> ET._Element:
    return compile_strict_topology_candidate(
        source,
        source_root=source_root,
        profile_id="xml-builder-root-branch-node",
        ledger=ledger,
        context=context,
    )


__all__ = ["_compile_xml_builder_source"]
