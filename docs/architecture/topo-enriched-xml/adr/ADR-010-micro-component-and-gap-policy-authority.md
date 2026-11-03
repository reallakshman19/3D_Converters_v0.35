# ADR-010 — Micro-component and micro-gap policy authority

**Status:** Accepted for TE-002 contract freeze  
**Date:** 2026-07-19

## Context

Distance-only collapse can merge unrelated parallel lines, junctions, anchors or historically distinct nodes.

## Decision

Micro-component consumption and micro-gap snapping are topology-normalization actions under an explicit component policy and hard-conflict gates. Distance is eligibility evidence only. Historical conflict blocks collapse.

## Rejected alternatives

Blanket <=6 mm collapse; history matcher performs topology changes.

## Consequences

Every collapse has authority, aliases and audit evidence, and changes the logical topology hash before sequence/history/allocation stages.

## Affected contracts

TopoNodeTopologyNormalization.v1, TopoLogicalGraph.v1, TopoPreprocessAudit.v1

## Mandatory tests

Distance-only candidate blocks; different historical identities block; approved synthetic component action is auditable.
