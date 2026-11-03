# ADR-005 — Strict PSI versus audit-extended XML profile

**Status:** Accepted for TE-002 contract freeze  
**Date:** 2026-07-19

## Context

Topology, history, hash and registry evidence exceeds the vendor PSI XML schema and must not silently alter strict downstream intake.

## Decision

`STRICT_PSI` serialization emits only approved PSI content. Extended trace, plan, registry and audit evidence remains in immutable sidecars. An explicit audit-extended profile may be used only where a consumer contract approves it.

## Rejected alternatives

Embed all evidence into production PSI XML; discard audit evidence.

## Consequences

Profile is explicit in PsiSerializationPlan.v1. CII behavior is unchanged by TE-002.

## Affected contracts

PsiSerializationPlan.v1, TopoPreprocessAudit.v1, TopoEnrichedXmlValidationReport.v1

## Mandatory tests

Strict profile rejects unapproved extension fields; sidecar hashes remain linked.
