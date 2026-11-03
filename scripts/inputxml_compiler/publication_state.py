#!/usr/bin/env python3
"""Publication transaction state and errors."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class PublicationError(RuntimeError):
    """Base class for operational publication failures."""


class PublicationInvariantError(PublicationError):
    """Raised when compiler output cannot form a coherent publication."""


class PublicationLockError(PublicationError):
    """Raised when a same-stem publication lock cannot be acquired."""


class PublicationIntegrityError(PublicationError):
    """Raised when commit or rollback integrity cannot be proven."""


class PublicationStage(Enum):
    PLANNED = "PLANNED"
    LOCK_ACQUIRED = "LOCK_ACQUIRED"
    STAGED = "STAGED"
    OLD_COMMIT_INVALIDATED = "OLD_COMMIT_INVALIDATED"
    CONTENT_REPLACED = "CONTENT_REPLACED"
    COMMITTED = "COMMITTED"
    ROLLED_BACK = "ROLLED_BACK"


@dataclass
class PublicationState:
    """Independent transaction state; compiler orchestration stays terminal."""

    current_stage: PublicationStage = PublicationStage.PLANNED
    transitions: list[str] = field(default_factory=lambda: ["PLANNED"])

    def transition(self, stage: PublicationStage) -> None:
        if self.current_stage in {
            PublicationStage.COMMITTED,
            PublicationStage.ROLLED_BACK,
        }:
            raise PublicationInvariantError(
                f"Publication is already terminal at {self.current_stage.value}."
            )
        stages = list(PublicationStage)
        expected = stages[stages.index(self.current_stage) + 1]
        if stage != expected:
            raise PublicationInvariantError(
                f"Illegal publication transition: "
                f"{self.current_stage.value} -> {stage.value}."
            )
        self.current_stage = stage
        self.transitions.append(stage.value)

    def rollback(self) -> None:
        if self.current_stage == PublicationStage.COMMITTED:
            raise PublicationInvariantError("A committed publication cannot roll back.")
        if self.current_stage == PublicationStage.ROLLED_BACK:
            raise PublicationInvariantError("Publication is already rolled back.")
        self.current_stage = PublicationStage.ROLLED_BACK
        self.transitions.append(PublicationStage.ROLLED_BACK.value)


@dataclass(frozen=True)
class PublicationResult:
    terminal_status: str
    bundle_kind: str
    canonical_path: Path | None
    ledger_path: Path
    validation_path: Path
    cleanup_pending: bool = False

    @property
    def outputs(self) -> dict[str, str]:
        result = {
            "ledger": str(self.ledger_path),
            "validation": str(self.validation_path),
        }
        if self.canonical_path is not None:
            result["canonical"] = str(self.canonical_path)
        return result


__all__ = [
    "PublicationError",
    "PublicationIntegrityError",
    "PublicationInvariantError",
    "PublicationLockError",
    "PublicationResult",
    "PublicationStage",
    "PublicationState",
]
