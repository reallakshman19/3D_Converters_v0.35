# TE-001 — Current PSI Writer Occurrence and Allocation Characterization

Parent programme: #202  
Work pack: #203

## Purpose

This document records the current StagedJSON → PSI XML writer behaviour without changing or correcting production output. It is evidence for the subsequent contract-freeze work pack.

The authoritative executable evidence is:

- `tools/capture-current-psi-occurrences.mjs`;
- `tests/topo-enriched-xml-current-allocation.test.mjs`;
- `tests/fixtures/topo-enriched-xml/current-allocation/characterization-input.json`.

## Current allocation authority

The existing writer currently:

1. starts allocation from writer-owned node number `10`;
2. increments branch allocation by component `numberingSpan × 10`;
3. assigns a primary number into mutable `record.xmlNodeNum`;
4. delegates selected boundary projection offsets to `sj-node-contract.js`;
5. reads the wall clock internally for `<DateTime>`;
6. independently reallocates when canonical and source-sequential branch ordering differs.

TE-001 intentionally preserves all of this behaviour.

## Characterized occurrence matrix

| Source type | Mapped type | Emitted occurrences | Reserved slots | Span | Current projection |
|---|---:|---:|---:|---:|---|
| `PIPE` | `PIPE` | 2 | 0 | 2 | arrive endpoint 1, leave endpoint 2 |
| `ELBO` | `ELBO` | 1 | 1 | 2 | arrive position, endpoint 0 |
| `BEND` | `ELBO` | 1 | 1 | 2 | normalized to ELBO, arrive position, endpoint 0 |
| `TEE` | `TEE` input / `BRAN` output | 1 | 1 | 2 | emitted at the second reserved slot, leave position, endpoint 1 |
| `OLET` | `OLET` | 2 | 0 | 2 | generic arrive/leave boundary pair |
| `REDU` | `REDU` | 1 | 1 | 2 | emitted at the second reserved slot, leave position, endpoint 2 |
| `REDUCER` | `REDUCER` input / `REDU` output | 1 | 1 | 2 | normalized boundary occurrence emitted at the second reserved slot, leave position, endpoint 2 |
| `VALV` | `VALV` | 1 | 0 | 1 | generic rigid node at best/arrive position |
| `FLAN` | `FLAN` | 1 | 0 | 1 | generic rigid node at best/arrive position |
| `ATTA` | `ATTA` | 1 | 0 | 1 | support occurrence with restraint-capable node content |

The `REDUCER` row confirms that raw source type and emitted PSI component type are distinct evidence fields: the parsed component remains `REDUCER`, while the boundary projection emits `REDU` with one reserved predecessor slot.

## Fixture allocation baseline

For the first canonical line `/LINE-A`, the fixture records allocate as follows:

```text
P1   PIPE       10, 20
E1   ELBO       30          (40 reserved)
B1   BEND       50          (60 reserved)
T1   TEE        80          (70 reserved)
O1   OLET       90, 100
R1   REDU       120         (110 reserved)
R2   REDUCER    140         (130 reserved; emits REDU)
V1   VALV       150
F1   FLAN       160
S1   ATTA       170
P2   PIPE       180, 190
```

The second canonical line `/LINE-B` receives:

```text
Q1   PIPE       200, 210
```

## Canonical versus source-sequential drift

The fixture source order is:

```text
/LINE-A/B1
/LINE-B/B1
/LINE-A/B2
```

Canonical grouping writes:

```text
/LINE-A
/LINE-B
```

Therefore:

| Occurrence | Canonical | Sequential |
|---|---:|---:|
| `P2 PIPE endpoint 1` | 180 | 200 |
| `P2 PIPE endpoint 2` | 190 | 210 |
| `Q1 PIPE endpoint 1` | 200 | 180 |
| `Q1 PIPE endpoint 2` | 210 | 190 |

Current selection logic still permits the sequential output even though numbering equivalence is false. This is recorded as legacy behaviour for TE-002 and later strict parity work; TE-001 does not alter the gate.

## Mutation behaviour

Every fixture component record receives a writer mutation:

```text
record.xmlNodeNum: undefined/null → primary emitted node number
```

For single-emission components that reserve two slots, the stored primary value is the emitted number, not the start of the reserved span. Examples:

```text
TEE: allocation start 70, xmlNodeNum 80
REDU: allocation start 110, xmlNodeNum 120
REDUCER: allocation start 130, xmlNodeNum 140
```

## Nondeterministic metadata

The writer creates `<DateTime>` from an internal `new Date()` call. Characterization hashes replace only that field with:

```xml
<DateTime>[WRITER_CLOCK]</DateTime>
```

No production timestamp behaviour is changed. The normalization exists only so repeated TE-001 captures are byte-stable.

## Contract questions for TE-002

1. Should `BEND` remain a source alias of `ELBO` in writer-occurrence identity, or should raw and normalized types both be retained?
2. Should `REDUCER` retain raw source identity while its emitted PSI occurrence is explicitly typed `REDU`?
3. How are reserved but non-emitted PSI slots represented without relative-number arithmetic?
4. Does a TEE's emitted branch occurrence own the logical junction node or only a PSI serialization occurrence?
5. Is a support attachment a route logical node, a separate attachment occurrence, or both through distinct identities?
6. Which fields form stable occurrence identity when the same component reference emits more than one occurrence?
7. Must canonical and source-sequential projections share identical occurrence IDs even when branch presentation differs?
8. Is `<DateTime>` audit metadata excluded from all semantic hashes?
9. Which legacy fields may remain in `LEGACY` mode after strict serializer migration?
10. How should current `record.xmlNodeNum` consumers migrate without treating the mutable field as authority?

## TE-001 non-decisions

This work pack does not decide:

- the final `TopoNodePlan.v1` schema;
- engineering number allocation policy;
- historical identity matching;
- range leases;
- topology normalization;
- micro-component or micro-gap rules;
- production writer selection changes;
- PSI/CII semantic corrections.
