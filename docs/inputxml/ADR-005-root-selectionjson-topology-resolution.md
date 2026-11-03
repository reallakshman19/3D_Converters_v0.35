# ADR-005 — Root and SelectionJSON Topology Resolution

## Status

Accepted for PR-6 implementation and amended by the PR #225 changes-required review.

## Scope

This decision governs only:

- `xml-builder-root-branch-node` / `xml-cii-node-to-canonical`;
- `seljson-custom-root` / `seljson-custom-model-to-canonical`.

Managed-stage JSON, PDF, UXML/RVM, NodeSet, all ADR-004 InputXML-family
profiles, migration, production activation, and PR-7 are outside scope.
The production writer remains unchanged.

## Binding statements

> Coordinates are comparison evidence, not connection authority.

> Document order is not topology authority unless the source contract explicitly declares ordered adjacency.

> A disabled filler switch is not proof that synthetic topology is impossible.

> SelectionJSON identity is explicit and is never inferred from a filename.

> Every canonical edge must cite authoritative source connection evidence.

## Profile identity

A valid unqualified `Root` with direct `Branch` children resolves once as
`xml-builder-root-branch-node` unless the caller explicitly selects
`seljson-custom-root`.

SelectionJSON identity is never inferred from a filename, path, `SEL-` prefix,
branch name, or component reference. An explicit override selects the resolver
but does not legalize incompatible evidence.

SelectionJSON producer metadata is optional because explicit dialect selection
is the minimum identity. When `Producer` is present it must be a registered
producer for the profile. PR-6 registers:

```text
selectionjson-transfer-v1
```

A different producer blocks with `ROOT_PROFILE_MISMATCH`. SelectionJSON
producer evidence on an XML Builder selection also blocks. `Profile` and
`Producer` contradictions are tested independently.

## Secure parser boundary

The only XML parser in the compiler path is secure Python/lxml:

```text
UTF-8 source bytes
→ lxml parse with no recovery, DTD loading, entity resolution, or network
→ deterministic source-occurrence model
→ InputXmlTopologyBridgeRequest.v1 JSON
→ strict JavaScript topology engine
→ InputXmlTopologyBridgeResult.v1 JSON
→ independent Python relation verification
```

Malformed markup, DTDs, entities, unsupported namespaces, and non-UTF-8 Root
documents block before Node execution. The Node bridge contains no XML
tokenizer, browser DOM emulation, permissive stack pop, or temporary ESM tree.

Bridge execution is bounded by request, stdout, stderr, diagnostic, branch,
node, auxiliary, and duration limits. JSON duplicate keys and trailing output
are rejected.

## Source topology model

The model separates source occurrence identity from engineering identity:

```text
TopologySourceDocument
BranchOccurrence
NodeOccurrence
RestraintOccurrence
source field occurrence
logical node
source-authoritative edge
component ownership
auxiliary ownership
```

Deterministic occurrence identities include:

```text
/Root[1]
/Root[1]/Branch[1]
/Root[1]/Branch[1]/Node[1]
/Root[1]/Branch[1]/Node[1]/Position[1]
```

No source occurrence is identified solely by `Branchname`, `LineNo`, or
`NodeNumber`.

## Branch occurrence and line identity

The authorities are separate:

```text
branch occurrence identity = exact source occurrence path
branch display/path evidence = Branchname
line identity               = LineNo or compatible LINE_ID
```

`Branchname` may be a full producer path such as:

```text
/ASIM-1836-4"-P8810031-31441C4-PP/B4
```

while `LineNo` is:

```text
P8810031
```

They are not required to match. If both `LineNo` and `LINE_ID` are populated,
they must match each other. Missing line identity blocks.

Multiple branch occurrences may legally share one line identity. They remain
separate source occurrences and their pressure, temperature, material,
density, diameter, wall, insulation, and corrosion state remains scoped to the
exact branch occurrence. Repeated line identity never merges state and does not
itself block.

## Node identity and scope

Every route node requires a finite, integer-like, positive `NodeNumber`; its
lexical source value is retained. Source node occurrence identity remains its
source path.

The canonical writer uses a model-wide numeric node namespace. No approved
branch-local disambiguator exists, so duplicate node numbers anywhere in the
document block. Coordinates never merge node identities. Equal positions with
different node numbers remain separate evidence and produce a zero-length-edge
block only when source adjacency asserts an edge between them.

## Adjacency authority

The registered Root producers serialize direct `Node` children in route order.
PR-6 records this authority as:

```text
DIRECT_NODE_CHILD_ORDER_REGISTERED_PRODUCER_V1
```

Every edge records exact branch, from-node, and to-node occurrence paths,
logical endpoints, canonical endpoints, topology rule, sequence, and canonical
element ID. Invalid nodes block the branch; the resolver never connects around
invalid evidence.

Branch order is evidence only and never connects branches.

## Cross-branch and junction authority

No cross-branch connection may be inferred from equal coordinates, tolerance,
nearest points, ray shooting, perpendicular projection, diameter search,
first-match behavior, or branch display order.

TEE, OLET, and BRAN classification does not prove run/branch ports or junction
ownership. Such evidence blocks until explicit source-port authority exists.
Disconnected authoritative branches remain disconnected; cycles are not
fabricated from repeated nodes.

## Bridge contracts and independent completeness

The bridge request and result are versioned:

```text
InputXmlTopologyBridgeRequest.v1
InputXmlTopologyBridgeResult.v1
InputXmlStrictTopologyProof.v1
```

The bridge does not claim compiler `PASS`. Expected topology failures are
structured zero-exit results; nonzero exit is internal failure.

Python does not trust bridge completeness or the bridge's self-hash. It
reconstructs expected source adjacency and owner edges from the request, then
requires:

- exactly one node mapping per source node;
- exact relational equality between every edge and element mapping;
- exactly one component mapping per source node;
- exactly one auxiliary mapping per source restraint;
- component and auxiliary owner IDs equal the reconstructed incident edge;
- source paths, logical IDs, canonical IDs, component fields, and ownership
  rules equal source authority;
- metrics equal both source counts and returned arrays;
- proof counts equal independently expected counts;
- all prohibited-operation metrics equal zero;
- the topology hash equal independently serialized structured arrays.

A bridge omission with recomputed metrics, proof, and hash still blocks.

## Coordinate frame and units

Source positions are finite millimetre decimals in `ROOT_XYZ_MM`. The target
CAESAR frame is:

```text
(x, y, z) → (x, z, -y)
```

with matrix:

```text
[ 1  0  0 ]
[ 0  0  1 ]
[ 0 -1  0 ]
```

Raw source coordinates and transformed points/deltas are retained. The compiler
independently verifies `TO - FROM == DELTA`. True zero is `0`; missing is absent;
unresolved evidence blocks. No missing sentinel or coordinate tolerance is used.
Nonzero sub-0.5 mm geometry remains nonzero.

Fluid-density and rigid-weight conversion scales require explicit, finite,
positive compiler context.

## Engineering context and hidden defaults

Required explicit context:

- `version`;
- `jobName`;
- `north`.

Optional explicit context:

- `time`;
- `issueNo`;
- `fluidDensityScale`;
- `rigidWeightScale`;
- operational `nodeExecutable`.

The strict path supplies no project name, version 11, north, material 1,
modulus, hot modulus, Poisson ratio, density, Tee SIF type, current time, or
branch-name-as-line fallback.

## Components and auxiliaries

- PIPE participates in route projection.
- RIGID requires explicit positive weight and explicit unit scale.
- BEND/ELBO requires explicit positive radius.
- VALVE, FLANGE, REDUCER, and GASK evidence is retained in a meaningful blocked
  candidate; it is never converted to generic PIPE.
- TEE/OLET/BRAN blocks without port and SIF authority.
- SUPPORT/ATTA never becomes route geometry without ownership authority.
- Restraint and CustomRestraint ownership derives from the containing source
  node and independently verified incident edge.
- Restraint type and direction cosines must resolve explicitly.
- More than six active restraints blocks before emission.
- No inactive SIF or restraint padding is emitted.

## Prohibited topology operations

The compiler-specific engine contains no implementation of:

- duplicate-coordinate coalescing;
- nearest-coordinate joining;
- short fillers;
- ray fillers;
- second-pass fillers;
- synthetic node allocation;
- midspan ray splitting;
- automatic branch-to-run shooting;
- route repair around invalid nodes.

The bridge and Python verifier require these metrics to remain zero:

```text
duplicateNodeDroppedCount
fillerCount
shortFillerCount
rayFillerCount
raySplitNodeCount
syntheticNodeCount
droppedRouteNodeCount
```

## Source-accounting authority

Inventory is data, not a decision. Building the occurrence inventory creates no
ledger coverage records.

After bridge verification and candidate construction, PR-6 freezes exactly one
`TOPOLOGY_SOURCE_DECISION` for every inventory identity. Each decision states
the actual transformation, preservation, attachment, rejection, or explicit
nonprojection rule and links canonical/source ownership where applicable.

The accounting proof accepts coverage only from
`TOPOLOGY_SOURCE_DECISION`. Generic `TOPOLOGY_SOURCE_ELEMENT`,
`TOPOLOGY_SOURCE_ATTRIBUTE`, accounting index, document projection, or full
source-extension records cannot certify coverage.

The proof requires zero for:

```text
unaccountedSourceOccurrenceCount
duplicateSourceDecisionIdentityCount
unexpectedSourceDecisionIdentityCount
blanketInventoryAuthorityCount
duplicateInventoryIdentityCount
unmappedCanonicalNodeCount
unmappedCanonicalElementCount
unmappedSourceNodeCount
unmappedSourceComponentCount
unmappedSourceAuxiliaryCount
duplicateSourceNodeMappingCount
duplicateSourceComponentMappingCount
duplicateSourceAuxiliaryMappingCount
bridgeComponentMappingCountMismatch
bridgeAuxiliaryMappingCountMismatch
unresolvedEdgeCount
unresolvedOwnershipCount
syntheticTopologyCount
duplicateCanonicalNodeMappingCount
duplicateCanonicalElementMappingCount
accountingIndexSelfCertificationCount
```

Accounting indices are created only after semantic decisions are frozen and use:

```text
coverageRule = PRIOR_TRANSFORMATION_DECISION_REQUIRED
accountingAuthoritySourceType = TOPOLOGY_SOURCE_DECISION
```

A deliberate generic inventory record under a missing decision identity remains
unaccounted and blocks at `SOURCE_ACCOUNTING_GATE`.

## Diagnostics and candidate behavior

Blocking is selected by exact registered diagnostic code, not token matching.

- malformed media → `MEDIA_INSPECTION_GATE`;
- profile or producer mismatch → `PROFILE_INTAKE_GATE`;
- source model, bridge, topology, geometry, or ownership → `PROFILE_RESOLVER_GATE`;
- semantic source-accounting failure → `SOURCE_ACCOUNTING_GATE`;
- XSD/Schematron failures → their existing gates;
- retained unsupported component evidence → `LEDGER_GATE`;
- production ineligibility → existing production gate.

Outcome kinds remain:

```text
CANONICAL_CANDIDATE
BLOCKED_WITH_CANDIDATE
BLOCKED_NO_CANDIDATE
```

No blocked candidate reaches the writer.

## Determinism

Source occurrence order determines evidence order. Edge sequence is justified
by the registered direct-child route contract. Canonical IDs are deterministic.
No current clock, random ID, PID, hostname, temporary path, locale formatting,
or unordered set determines artifacts.

Repeated Python and Node processes, multiple `PYTHONHASHSEED` values, Ubuntu,
and Windows compare topology proof, canonical, ledger, validation, hashes,
diagnostic order, and blocked stage.

## Compatibility, browser, serialization, publication, and writer

The browser converter and shared browser topology core are unchanged. Its
preview compatibility behavior is not compiler authority.

ADR-002 crash-consistent publication and ADR-003 deterministic serialization
are unchanged. The production CII writer is unchanged and is loaded only after
all compiler and assurance gates pass.

## Deferred questions

- Generic Root evidence still lacks authoritative Tee/Olet/BRAN port relations.
- A safe document-global disambiguator for duplicate branch-local node numbers
  is not authorized.
- Multiple active SIF projection remains unresolved.
- Full valve/flange/reducer/gasket projection remains outside PR-6.
- Non-explicit unit inference and coordinate tolerance are not authorized.
- Cycles require explicit source connection identities.

All deferred questions remain fail-closed. Migration is not authorized. PR-7
is not started.
