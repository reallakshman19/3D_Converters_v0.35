#!/usr/bin/env python3
"""Managed-stage parity gate including exact InputXML child ownership."""
from __future__ import annotations

from typing import Any

from .base import DecisionLedger
from .managed_stage_inputxml_relations import verify_inputxml_child_relations
from .managed_stage_parity import verify_parity_and_metrics as _verify_base


def verify_parity_and_metrics(
    result: dict[str, Any],
    source: dict[str, Any],
    topology: dict[str, Any],
    engineering: dict[str, Any],
    ledger: DecisionLedger,
) -> dict[str, Any]:
    verify_inputxml_child_relations(
        result["parsedInputXmlTopology"],
        topology,
        ledger,
    )
    return _verify_base(result, source, topology, engineering, ledger)


__all__ = ["verify_parity_and_metrics"]
