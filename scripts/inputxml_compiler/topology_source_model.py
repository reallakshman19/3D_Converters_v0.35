#!/usr/bin/env python3
"""Immutable source-occurrence models for PR-6 Root topology profiles."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .topology_inventory import SourceInventory


@dataclass(frozen=True)
class RestraintOccurrence:
    path: str
    source_name: str
    fields: dict[str, str]
    field_paths: dict[str, str]

    def as_bridge_value(self) -> dict[str, Any]:
        return {
            "sourcePath": self.path,
            "sourceName": self.source_name,
            "fields": self.fields,
            "fieldPaths": self.field_paths,
        }


@dataclass(frozen=True)
class NodeOccurrence:
    path: str
    sequence: int
    node_number: int
    node_number_lexical: str
    position: tuple[str, str, str]
    fields: dict[str, str]
    field_paths: dict[str, str]
    restraints: tuple[RestraintOccurrence, ...]

    def as_bridge_value(self) -> dict[str, Any]:
        return {
            "sourcePath": self.path,
            "sequence": self.sequence,
            "nodeNumber": self.node_number,
            "nodeNumberLexical": self.node_number_lexical,
            "position": list(self.position),
            "fields": self.fields,
            "fieldPaths": self.field_paths,
            "restraints": [row.as_bridge_value() for row in self.restraints],
        }


@dataclass(frozen=True)
class BranchOccurrence:
    path: str
    sequence: int
    branch_name: str
    line_identity: str
    fields: dict[str, str]
    field_paths: dict[str, str]
    nodes: tuple[NodeOccurrence, ...]

    def as_bridge_value(self) -> dict[str, Any]:
        return {
            "sourcePath": self.path,
            "sequence": self.sequence,
            "branchName": self.branch_name,
            "lineIdentity": self.line_identity,
            "fields": self.fields,
            "fieldPaths": self.field_paths,
            "nodes": [row.as_bridge_value() for row in self.nodes],
        }


@dataclass(frozen=True)
class TopologySourceDocument:
    profile_id: str
    adapter_id: str
    source_hash_sha256: str
    inventory: SourceInventory
    metadata: dict[str, str]
    branches: tuple[BranchOccurrence, ...]

    def bridge_request(self, context: dict[str, Any]) -> dict[str, Any]:
        context_value = {
            key: context[key]
            for key in (
                "version",
                "jobName",
                "time",
                "issueNo",
                "north",
                "rigidWeightScale",
                "fluidDensityScale",
            )
            if key in context
        }
        return {
            "schema": "InputXmlTopologyBridgeRequest.v1",
            "profileId": self.profile_id,
            "adapterId": self.adapter_id,
            "sourceHashSha256": self.source_hash_sha256,
            "sourceDocumentIdentity": {
                "rootPath": "/Root[1]",
                "profileId": self.profile_id,
                "producer": self.metadata.get("Producer", ""),
                "sourceIdentity": self.metadata.get("SourceIdentity", ""),
            },
            "context": context_value,
            "branches": [row.as_bridge_value() for row in self.branches],
            "sourceInventorySummary": self.inventory.summary(),
            "engineOptions": {
                "adjacencyAuthority": "DIRECT_NODE_CHILD_ORDER_REGISTERED_PRODUCER_V1",
                "coordinateCoalescing": False,
                "shortFillers": False,
                "rayFillers": False,
                "secondPassFillers": False,
                "midspanSplits": False,
                "syntheticNodes": False,
            },
        }


__all__ = [
    "BranchOccurrence",
    "NodeOccurrence",
    "RestraintOccurrence",
    "TopologySourceDocument",
]
