# ADR-007 — Support attachment versus route-node ownership

**Status:** Accepted for TE-002 contract freeze  
**Date:** 2026-07-19

## Context

Supports are engineering attachments and restraints; treating them as route edges creates false continuity.

## Decision

A support maps to an existing logical attachment node and may have a distinct writer occurrence. It does not create route continuity or own a route edge unless a separate approved component contract says so.

## Rejected alternatives

Support as an ordinary route component; nearest-coordinate attachment without authority.

## Consequences

Topology index must expose support-to-logical-node and occurrence-to-logical-node joins separately.

## Affected contracts

TopoLogicalGraph.v1, TopoTopologyIndex.v1, PsiWriterOccurrence.v1

## Mandatory tests

Support attachment references an existing node; support-only records do not alter edge incidence.
