#!/usr/bin/env python3
"""Resolver outcome contract for compiler profiles."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from lxml import etree as ET


class OutcomeKind(Enum):
    CANONICAL_CANDIDATE = "CANONICAL_CANDIDATE"
    BLOCKED_WITH_CANDIDATE = "BLOCKED_WITH_CANDIDATE"
    BLOCKED_NO_CANDIDATE = "BLOCKED_NO_CANDIDATE"


@dataclass(frozen=True)
class ResolverOutcome:
    profile_id: str
    adapter_id: str
    outcome_kind: OutcomeKind
    canonical_candidate: ET._Element | None = None
    source_accounting_status: str = "PENDING"
    profile_diagnostics: tuple[dict[str, Any], ...] = ()
    profile_metrics: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.profile_id:
            raise ValueError("Resolver outcome requires profile_id.")
        if not self.adapter_id:
            raise ValueError("Resolver outcome requires adapter_id.")
        has_candidate = self.canonical_candidate is not None
        requires_candidate = self.outcome_kind in {
            OutcomeKind.CANONICAL_CANDIDATE,
            OutcomeKind.BLOCKED_WITH_CANDIDATE,
        }
        if requires_candidate != has_candidate:
            raise ValueError(
                f"Outcome {self.outcome_kind.value} candidate presence is inconsistent."
            )
        if self.source_accounting_status not in {
            "PENDING",
            "COMPLETE",
            "BLOCKED",
            "NOT_APPLICABLE",
        }:
            raise ValueError(
                f"Unsupported source accounting status: "
                f"{self.source_accounting_status!r}."
            )


__all__ = ["OutcomeKind", "ResolverOutcome"]