# TE-002 — TopoEnrichedXML v1 Contract Freeze

Parent epic: #202  
Work pack: #204  
Dependency evidence: TE-001 / PR #211 / `de694e4a715e7827f4805db2773980d1def8c7d7`

## Scope

This freeze defines executable contracts and architecture decisions only. It does not implement writer migration, allocation, historical matching, topology normalization, registry bootstrap, or CII changes.

## Semantic identities

The following identities are separate and may not be substituted for each other:

1. raw source entity (`sourceEntityId`);
2. raw source port (`sourcePortId`);
3. logical topology node (`logicalNodeId`);
4. logical topology edge (`logicalEdgeId`);
5. PSI writer occurrence (`occurrenceId`);
6. emitted occurrence (`disposition: EMITTED`);
7. reserved occurrence (`disposition: RESERVED`);
8. historical node identity (`historyNodeId`);
9. engineering node number (`engineeringNodeNumber`);
10. component projection (`componentProjectionId`);
11. source branch (`sourceBranch`);
12. canonical main line (`canonicalMainLine`);
13. registry range lease (`leaseId`).

## Status model

- `PASS`: blockers and review items are empty. Automatic continuation is permitted only when the operating mode also permits it.
- `REVIEW_REQUIRED`: blockers are empty and at least one review item is present. This status is never equivalent to PASS.
- `BLOCKED`: at least one blocker is present. Production continuation is prohibited.

Runtime validators and Draft 2020-12 schemas enforce these conditions. A status contradiction is structurally invalid; it is not merely a downstream warning.

## Operating modes

| Mode | Authoritative output | New artifacts | Fallback |
|---|---|---|---|
| `LEGACY` | Current writer output | Optional evidence only | Current writer behavior remains available |
| `SHADOW` | Current writer output | New plans/reports generated and compared | New artifacts cannot control XML |
| `REVIEW` | No automatic authoritative output when review items exist | Proposed node plan and registry patch require disposition | No silent conversion to PASS |
| `ENFORCED` | Immutable approved node/serialization plan | Exact plan, parity, registry and audit bundle | Writer-owned allocation fallback is prohibited |

## Writer occurrence contract

Every nested occurrence in `PsiWriterOccurrencePlan.v1` carries the complete frozen serialization identity:

```text
occurrenceId
sourceEntityId
sourceBranch
canonicalMainLine
componentProjectionId
projectionRole
endpoint
psiComponentType
coordinateRole
disposition
```

The same nested rules apply to standalone `PsiWriterOccurrence.v1`. Allocated number fields are prohibited in both forms. Unknown occurrence fields are rejected unless they are explicitly listed as approved evidence fields by the frozen contract.

## Explicit numbering rule

Every emitted or reserved occurrence in `TopoNodePlan.v1` and `PsiSerializationPlan.v1` carries its explicit engineering node number. The following representations are prohibited anywhere in those artifacts:

```text
startNodeNumber
nodeCounter
numberingSpan
baseNodeNumber + offset
node + 10
numberOffset
derivedFromOccurrenceId
```

`PsiWriterOccurrence.v1` and `PsiWriterOccurrencePlan.v1` contain no engineering allocation.

## Component-projection ownership

`TopoNodePlan.v1` freezes exact one-owner coverage:

- every emitted occurrence is referenced by exactly one component projection;
- every reserved occurrence is referenced by exactly one component projection;
- emitted occurrence IDs may appear only in `emittedOccurrenceIds`;
- reserved occurrence IDs may appear only in `reservedOccurrenceIds`;
- referenced occurrences must exist;
- an occurrence's declared `componentProjectionId` must equal its owning projection;
- orphan, multiply owned, unknown and wrong-kind occurrence references are invalid;
- a component projection must own at least one occurrence.

`PsiWriterOccurrencePlan.v1` applies the equivalent one-owner rule to its occurrence list and component-projection list.

## Allocation ownership

`TopoNodeAllocationResult.v1` freezes a bijective allocation relationship inside one project zone:

```text
engineering node number → at most one logical/historical owner
logical node identity    → exactly one allocated number when allocated
historical node identity → exactly one allocated number when allocated
```

The same logical node or historical node cannot receive multiple different numbers. Different owners cannot share one number. Repeated PSI occurrences may share a number only when they resolve to the same logical topology node.

## Writer parity PASS contract

`PsiWriterParityReport.v2` requires root `nodePlanHash` and `occurrencePlanHash`. Both canonical and source-sequential sides carry:

```text
nodePlanHash
occurrencePlanHash
xmlHash
traceHash
bundleHash
emittedOccurrenceCount
reservedOccurrenceCount
```

Both side hashes must equal the report's authoritative hashes. `PASS` requires an empty differences list and all of these hard gates:

```text
nodePlanHashEquivalent                    = true
occurrencePlanHashEquivalent              = true
occurrenceIdentityEquivalent              = true
componentProjectionEquivalent             = true
endpointSemanticsEquivalent               = true
engineeringContentEquivalent              = true
sourceBoundaryEquivalent                  = true
branchConditionsEquivalent                = true
traceIdentityEquivalent                   = true
traceCardinalityEquivalent                = true
reservedOccurrenceTreatmentEquivalent     = true
numberingEquivalent                       = true
atomicBundleCoherent                       = true
occurrenceCoverage                         = 100
reservedOccurrenceCoverage                 = 100
writerSideAllocations                      = 0
unplannedOccurrences                       = 0
```

A failure in any dimension prevents parity `PASS`.

## Runtime and JSON Schema agreement

The schema directory contains one readable Draft 2020-12 schema per frozen contract plus a catalog. Array item structures are explicit for identity-bearing records. Prohibited number fields and status contradictions are represented in schema, not only in JavaScript.

The contract test suite runs both validators against:

- a valid artifact for every contract;
- nested occurrence identity omissions;
- allocated numbers in occurrence contracts;
- relative-number fields in node plans;
- contradictory `PASS` status evidence.

Cross-array semantic relations that JSON Schema cannot express reliably—such as exact occurrence ownership, one-to-one allocation ownership and side-hash equality—remain mandatory runtime checks and have focused negative tests.

## Hash policy

Canonical semantic serialization recursively sorts object keys, preserves array order, uses UTF-8 JSON, and excludes audit-only metadata including `evaluatedAt`, generated timestamps, runtime durations and workflow display metadata.

| Hash | Semantic inputs |
|---|---|
| `sourceInventoryHash` | source identity, project/zone/frame, branches, entities, ports |
| `logicalTopologyHash` | logical nodes/edges/junctions/boundaries/supports and frame |
| `sequencePlanHash` | source/logical hashes plus ordered branches/components |
| `baseRegistrySnapshotHash` | policy, pool, sorted line histories, schema versions |
| `configHash` | complete normalized configuration |
| `coordinateRegistrationHash` | transform, frames, anchors and residual evidence |
| `historyMatchResultHash` | matches, new, ambiguous, conflict, reactivation and retirement candidates |
| `allocationResultHash` | leases, explicit allocations, retirements and reactivations |
| `nodePlanHash` | chain hashes plus logical nodes, explicit occurrences, port mappings and component projection |
| `proposedRegistryHash` | base snapshot/commit, preconditions and ordered operations |

`evaluatedAt` is audit evidence and is excluded from every semantic hash.

## TE-001 traceability

- TEE and REDU/REDUCER reserve two slots and emit one occurrence from the characterized second-slot role; reserved and emitted occurrences are therefore distinct contract records.
- PIPE and OLET have characterized paired occurrences.
- ELBO/BEND retain raw type evidence while projecting the characterized PSI occurrence type.
- canonical and source-sequential presentations must share occurrence identity and explicit numbering; legacy numbering drift is not accepted by `PsiWriterParityReport.v2` PASS.
- writer clock metadata is excluded from semantic hashes.
- mutable `record.xmlNodeNum` is legacy evidence only and is not an authority in frozen contracts.

## CI gate

`.github/workflows/topo-enriched-xml-contracts.yml` runs when contract, schema, ADR, freeze-document or contract-test paths change. It executes:

- runtime and Draft 2020-12 instance tests;
- JavaScript syntax checks;
- schema-document checks for every standalone schema;
- accepted TE-001 characterization regression;
- current PSI writer-selection regression;
- current enriched-XML topology regression.

## Downstream readiness

TE-003 may implement a pure `PsiWriterOccurrencePlan.v1` only after independent review and orchestrator acceptance of this corrected freeze. TE-003 must not allocate node numbers or edit the production serializer.
