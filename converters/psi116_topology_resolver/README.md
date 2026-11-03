# PSI116 Topology Resolver

This package provides two explicit stages.

## Stage 1 — non-mutating analysis

The resolver analyzes PSI116 XML and emits deterministic dry-run sidecars:

```text
<stem>.topology-findings.json
<stem>.topology-fix-plan.json
```

It does not rewrite PSI116 XML and does not alter the XML→CII engine.

PSI116 is treated as a component-port record stream, not as a flat list of positive nodes:

```text
lossless Branch/Node inventory
→ contiguous component occurrences
→ component-internal spans and inter-occurrence connections
→ coincident connection clusters
→ pipe-carrier projections
→ overlap checks on finite component spans only
→ dry-run action planning
```

This prevents support, olet, elbow and inline-component rows inside a finite pipe envelope from being misread as backtracking pipe elements.

### Findings and dispositions

The resolver reports coincidence, zero/short spans, rigid conflicts, incomplete fitting-port evidence, carrier relationships and finite-span overlap evidence.

Dry-run dispositions are:

```text
ALIAS_COINCIDENT_NODE
CONTRACT_PRESERVE_OWNER
SAFE_DROP_PIPE_GEOMETRY
REMOVE_FALSE_RIGID
MERGE_CARRIER_WITH_COMPONENT
KEEP
BLOCK_AMBIGUOUS
```

A length below 6 mm never authorizes deletion by itself. Finite gasket and inline-component spans are retained. Collinear overlap remains blocking until ownership is proven.

When a zero-length route span and coincidence finding identify the same plain PIPE and special-component owner, they are coalesced into one `SAFE_DROP_PIPE_GEOMETRY` proposal. The transactional stage must still prove that the absorbed record has no restraint, rigid, weight, name, geometry or dimensional evidence that prevents removal.

### Analysis usage

```bash
python -m converters.psi116_topology_resolver \
  Benchmarks/1885Sjson/FirstpassXML \
  --output-dir out/psi116-topology
```

Use `--fail-on-blocking` only in gates that intentionally treat unresolved findings as a failing exit status.

## Stage 2 — explicit atomic TopoFix transaction

The transaction applies only explicitly selected action IDs, or actions selected through the explicit `--apply-all-safe` option, to an in-memory XML clone.

```text
original PSI116 XML
→ selected reviewed actions
→ confidence/conflict preflight
→ clone-only mutation
→ topology rebuild
→ before/after engineering gates
→ commit or reject atomically
```

Committed outputs are:

```text
<stem>.topofix.xml
<stem>.topofix-transaction.json
<stem>.topofix-validation.json
```

When any blocking gate fails, the transaction and validation reports are written but `*.topofix.xml` is not emitted.

### Transaction usage

```bash
python -m converters.psi116_topology_resolver.apply_topofix \
  Benchmarks/1885Sjson/FirstpassXML \
  --output-dir out/psi116-topofix \
  --action-id ACT-000184 \
  --action-id ACT-000185
```

### Applied operations

- Cross-branch coincidence with a retained component owner rewrites the absorbed record's `NodeNumber` to the canonical node identity.
- A coalesced plain-PIPE/special-owner zero-length span removes only the disposable PIPE record after all safety checks pass.
- False rigid classification changes only the selected `Rigid` value to `0`.
- `KEEP` and `MERGE_CARRIER_WITH_COMPONENT` remain evidence-only operations.

### Atomic gates

The transaction requires:

- branch count preservation;
- preservation of every non-pipe component occurrence reference;
- restraint and total-weight preservation;
- explicit accounting for every removed record;
- no new blocking topology findings;
- no increase in blocking-finding count;
- resolution of every selected finding;
- no new duplicate span, collinear overlap or ambiguous coincidence.

The source text and SHA-256 remain unchanged. A committed TopoFix XML must also pass the unchanged XML→CII converter and downstream parity gates before production use.
