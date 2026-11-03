# ADR-009 — Partial-run coverage and retirement prohibition

**Status:** Accepted for TE-002 contract freeze  
**Date:** 2026-07-19

## Context

An absent node in a partial source extract is not evidence that the historical node has been removed.

## Decision

Retirement is permitted only when coverage is FULL_LINE or FULL_ZONE and authoritativeForRetirement is true. Partial runs may propose matches and additions but cannot retire unseen history.

## Rejected alternatives

Retire every registry node absent from current input; infer coverage from filename.

## Consequences

Registry patches carry explicit coverage evidence and validators reject unauthorized retirement operations.

## Affected contracts

TopoNodeRegistryPatch.v1, TopoNodeHistoryMatchResult.v1, TopoPreprocessAudit.v1

## Mandatory tests

PARTIAL_LINE + RETIRE_NODE blocks; FULL_LINE authoritative retirement can validate.
