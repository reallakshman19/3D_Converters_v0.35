# ADR-006 — Historical stability versus monotonic sequence numbering

**Status:** Accepted for TE-002 contract freeze  
**Date:** 2026-07-19

## Context

Source-sequential order can change between revisions, while engineering node numbers must remain stable when historical identity is approved.

## Decision

Approved historical identity retains its engineering number. Monotonic source sequence does not renumber history. New numbers are allocated deterministically from valid leases.

## Rejected alternatives

Renumber all nodes to restore monotonic order; preserve sequence at the expense of history.

## Consequences

PSI presentation order and node-number order may differ. Any renumbering requires explicit reviewed registry action.

## Affected contracts

TopoNodeHistoryMatchResult.v1, TopoNodeAllocationResult.v1, TopoNodePlan.v1

## Mandatory tests

Reordered source retains matched numbers; ambiguous matches do not allocate as reuse.
