# ADR-002 — Logical topology node as connectivity authority

**Status:** Accepted for TE-002 contract freeze  
**Date:** 2026-07-19

## Context

Writer occurrences, source ports and historical identities describe different concerns and can disagree in cardinality.

## Decision

TopoLogicalGraph.v1 logical nodes and edges are the sole connectivity authority. History and serialization consume this graph and cannot create connectivity.

## Rejected alternatives

Writer occurrence graph as topology; coordinate-only connectivity.

## Consequences

No matcher, allocator or writer may merge, split or infer logical nodes. Topology normalization must produce a new logical topology hash before downstream plans.

## Affected contracts

TopoLogicalGraph.v1, TopoNodeTopologyNormalization.v1, TopoNodePlan.v1

## Mandatory tests

Unknown edge endpoint blocks; writer occurrence changes cannot alter graph degree.
