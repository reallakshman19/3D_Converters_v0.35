# ADR-008 — Canonical versus source-sequential branch projection

**Status:** Accepted for TE-002 contract freeze  
**Date:** 2026-07-19

## Context

TE-001 records different branch ordering and legacy numbering for equivalent semantic occurrences.

## Decision

Canonical main-line and source-sequential branch projections are presentation views over the same occurrence plan and node plan. Occurrence IDs and numbers are identical; only approved branch membership/order presentation may differ.

## Rejected alternatives

Independent occurrence identities per writer; accept numbering mismatch as warning.

## Consequences

PsiWriterParityReport.v2 treats numbering mismatch as blocking and requires exact occurrence coverage.

## Affected contracts

TopoSequencePlan.v1, PsiWriterOccurrencePlan.v1, PsiSerializationPlan.v1, PsiWriterParityReport.v2

## Mandatory tests

Interleaved /B# fixture preserves exact IDs/numbers across both projections.
