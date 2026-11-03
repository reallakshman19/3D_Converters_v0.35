# ADR-003 — Shared PSI serializer

**Status:** Accepted for TE-002 contract freeze  
**Date:** 2026-07-19

## Context

Canonical and source-sequential paths currently call the same serializer but independently trigger writer-owned allocation through different branch orderings.

## Decision

Both branch projections must consume one PsiSerializationPlan.v1 and one shared serializer. The serializer reads explicit numbers and performs no allocation.

## Rejected alternatives

Two independently allocating writers; sequential writer as a second serializer.

## Consequences

Branch presentation may differ, but occurrence identity, engineering content and numbering must be exact. ENFORCED mode has no legacy allocation fallback.

## Affected contracts

PsiSerializationPlan.v1, PsiWriterParityReport.v2, TopoEnrichedXmlValidationReport.v1

## Mandatory tests

Canonical/sequential numbering mismatch blocks; writer-side allocation count must be zero.
