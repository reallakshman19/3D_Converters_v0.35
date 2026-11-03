# ADR-001 — Zone-wide engineering node-number uniqueness

**Status:** Accepted for TE-002 contract freeze  
**Date:** 2026-07-19

## Context

Engineering node numbers can be leased to canonical main lines, but duplicate active numbers inside one project/zone create ambiguous downstream identity.

## Decision

Engineering number uniqueness is keyed by projectId + zoneId + engineeringNodeNumber. mainLineKey owns leases but does not weaken zone-wide uniqueness.

## Rejected alternatives

Per-line uniqueness; global project uniqueness without zones.

## Consequences

Allocators and registry patches must reject cross-line collisions in a zone. Repeated writer occurrences may share a number only when they map to the same logical node.

## Affected contracts

TopoNodeAllocationResult.v1, TopoNodePlan.v1, TopoNodeRegistryPatch.v1

## Mandatory tests

Duplicate numbers across two main lines block; repeated occurrences for one logical node pass.
