# ADR-004 — PSI repeated/shared-node and reserved-occurrence semantics

**Status:** Accepted for TE-002 contract freeze  
**Date:** 2026-07-19

## Context

TE-001 proves one component can reserve two positions while emitting one node, and multiple serialization occurrences may refer to one logical node.

## Decision

EMITTED and RESERVED are explicit PsiWriterOccurrence identities. Every serialized occurrence maps to one logicalNodeId. Shared numbers are permitted only for occurrences mapped to the same logical node. Reserved numbers are explicit, never derived.

## Rejected alternatives

Represent reserved slots as numeric offsets; treat every occurrence as a topology node.

## Consequences

Occurrence planning contains no allocations. Node and serialization plans carry explicit numbers. No +10 or start-number representation is valid.

## Affected contracts

PsiWriterOccurrence.v1, PsiWriterOccurrencePlan.v1, TopoNodePlan.v1, PsiSerializationPlan.v1

## Mandatory tests

TEE/REDU fixture emitted/reserved matrix; offset fields rejected; duplicate occurrence IDs rejected.
