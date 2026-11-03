# XML→CII(2019) generated InputXML sidecar audit

Date: 2026-07-13
Repository baseline: `704705dec8a52832d58b95b87ca5171e9a5cb2b4`

## Classification verdict

The file named `<source>_xml_to_cii2019_enriched.input.xml` is a **post-run diagnostic reconstruction**. It is not the object used by `xml_to_cii2019_contracted_direction.py` to generate the primary CII.

Live path:

```text
converters/py-worker.js
  → buildInvocation("xml_to_cii")
  → xml_to_cii2019_contracted_direction.py
  → primary .cii
  → _runXmlCiiEnrichedInputXmlExport()
  → xml_to_inputxml_debug.py
  → diagnostic reconstructed InputXML sidecar
```

The worker invokes the sidecar exporter only after the primary converter, syntax and contract stages. A plausible sidecar therefore does not by itself prove parity with the CII.

## Authority boundaries

| Concern | Authoritative source | Sidecar responsibility |
|---|---|---|
| CII bytes and section pointers | generated primary `.cii` | compare, never replace |
| Source topology and metadata | final enriched PSI116 XML used by the route | reconstruct with declared provenance |
| Staged-json/process enrichment | same options passed to the CII route | use the same option values |
| Restraint slot capacity | CII 2019 fixed six-slot restraint block | retain first six, diagnose every drop |
| Sidecar role | this audit and explicit artifact metadata | identify as diagnostic reconstruction |
| Parity verdict | observable `.cii` versus sidecar | emit structured sidecar diagnostics |

## Findings

### F1 — Sidecar role is ambiguous

The root currently says `SOURCE="XML->CII enriched InputXML debug export"`, but neither the UI nor a machine-readable artifact states that it is a parallel reconstruction. Users can reasonably mistake it for the exact model consumed by the CII writer.

**Approved fix:** add explicit reconstruction metadata and a parity status. Preserve the existing filename for compatibility.

### F2 — Split-condensed option is not forwarded

The primary `xml_to_cii` invocation resolves `splitCondensedValveFlange` and passes an explicit positive or negative CLI flag. `_runXmlCiiEnrichedInputXmlExport()` does not forward either flag even though `xml_to_inputxml_debug.py` supports them. The primary CII and sidecar can therefore use different topology rules.

**Approved fix:** resolve and forward the same split option to both routes.

### F3 — Restraint overflow is unbounded

The sidecar enumerates every merged restraint spec. CII 2019 supports six restraint slots per element. More than six children can make the reconstructed InputXML unusable downstream or suggest data that the CII cannot carry.

**Approved fix:** retain six per `PIPINGELEMENT`, record retained and dropped source evidence, and never silently discard overflow.

### F4 — Restraint provenance is mislabelled

Every emitted restraint receives `TAG="ANCI/DTXR-derived"`, including explicit XML restraints. This is false provenance.

**Approved fix:** tag each emitted row using the matching authority set (`XML-explicit`, `ComponentType-derived`, `DTXR-derived`, or merged/unknown) and include the decision in diagnostics.

### F5 — Computed support evidence is dropped

`node_number_kind_map` is returned from keyword-restraint resolution but is unused. It is useful source evidence for restraint decisions.

**Approved fix:** include it in the diagnostic context; do not alter type-code semantics.

### F6 — No artifact-level parity check exists

The sidecar is not compared to the CII for element count, node-pair sequence, deltas, bend blocks, rigid blocks, restraint blocks or SIF/tee blocks.

**Approved fix:** compare observable artifacts after both files exist. Use CII `CONTROL` plus fixed-width `ELEMENTS` rows. Compare restraint **block count** to the number of sidecar elements containing restraints; keep individual sidecar slot count as a separate metric.

### F7 — Existing test proves presence, not parity

`test_xml_to_inputxml_debug.py` verifies selected InputXML fields but does not consume a generated CII and cannot detect parallel-route divergence.

**Approved fix:** add real end-to-end parity tests and worker/UI contract tests. Existing regression assertions remain.

## Diagnostics contract

Schema: `xml-to-cii-inputxml-sidecar-diagnostics/v1`

Each record uses:

```text
severity, code, message, module, stage,
sourceField, outputField, sourceRow, element, action, context
```

Required codes include:

- `SIDECAR_DIAGNOSTIC_RECONSTRUCTION`
- `SIDECAR_OPTION_FORWARDED`
- `SIDECAR_RESTRAINT_SOURCE`
- `SIDECAR_RESTRAINT_TRUNCATED`
- `SIDECAR_ELEMENT_COUNT_MATCH` / `SIDECAR_ELEMENT_COUNT_MISMATCH`
- `SIDECAR_NODE_PAIR_MATCH` / `SIDECAR_NODE_PAIR_MISMATCH`
- `SIDECAR_DELTA_MATCH` / `SIDECAR_DELTA_MISMATCH`
- `SIDECAR_BLOCK_COUNT_MATCH` / `SIDECAR_BLOCK_COUNT_MISMATCH`
- `SIDECAR_PARITY_UNAVAILABLE`

Artifact name:

```text
<source>_xml_to_cii2019_inputxml_sidecar_diagnostics.json
```

## Scope exclusions

- No runtime/writer/canvas switch.
- No rewrite of neutral-file formatting.
- No changes to CII section layouts or frozen benchmark bytes.
- No DOM or broad converter refactor.
- No claim of internal-model identity; parity is artifact-observable only.
