#!/usr/bin/env python3
"""Deterministic occurrence inventory for strict Root topology intake."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from lxml import etree as ET

from .xml import _local, _namespace


@dataclass(frozen=True)
class SourceInventory:
    entries: tuple[dict[str, Any], ...]
    duplicate_identity_count: int

    @property
    def identities(self) -> tuple[str, ...]:
        return tuple(str(row["identity"]) for row in self.entries)

    def summary(self) -> dict[str, int]:
        kinds: dict[str, int] = {}
        for row in self.entries:
            kind = str(row["kind"])
            kinds[kind] = kinds.get(kind, 0) + 1
        return {
            "inventoryCount": len(self.entries),
            "elementCount": kinds.get("ELEMENT", 0),
            "attributeCount": kinds.get("ATTRIBUTE", 0),
            "duplicateInventoryIdentityCount": self.duplicate_identity_count,
        }


def build_source_inventory(root: ET._Element) -> SourceInventory:
    entries: list[dict[str, Any]] = []

    def visit(element: ET._Element, path: str, parent: str | None) -> None:
        entries.append(
            {
                "identity": path,
                "parentIdentity": parent,
                "kind": "ELEMENT",
                "name": _local(element.tag),
                "namespace": _namespace(element.tag),
                "value": (element.text or "").strip() if len(element) == 0 else "",
            }
        )
        for name, value in element.attrib.items():
            entries.append(
                {
                    "identity": f"{path}/attribute::{name}",
                    "parentIdentity": path,
                    "kind": "ATTRIBUTE",
                    "name": name,
                    "namespace": "",
                    "value": value,
                }
            )
        counts: dict[str, int] = {}
        for child in element:
            name = _local(child.tag)
            counts[name] = counts.get(name, 0) + 1
            visit(child, f"{path}/{name}[{counts[name]}]", path)

    visit(root, f"/{_local(root.tag)}[1]", None)
    identities = [str(row["identity"]) for row in entries]
    duplicate_count = len(identities) - len(set(identities))
    return SourceInventory(tuple(entries), duplicate_count)


__all__ = ["SourceInventory", "build_source_inventory"]
