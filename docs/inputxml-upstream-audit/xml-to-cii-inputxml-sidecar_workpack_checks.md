# XML→CII generated InputXML sidecar Work Pack checks

Date: 2026-07-13

## Scope and classification

The XML→CII worker continues to produce the authoritative CII first. The additional InputXML is explicitly classified as a post-run diagnostic reconstruction.

```text
PSI116 XML
→ XML→CII converter
→ authoritative .cii
→ diagnostic InputXML reconstruction
→ artifact-level parity ledger
```

No CII writer/layout, runtime, canvas, neutral-file formatting or frozen benchmark data was switched.

## Delivered behavior

- The sidecar root declares `ARTIFACT_ROLE="diagnostic-reconstruction"` and `PARITY_AUTHORITY="generated CII"`.
- The worker forwards the resolved split-condensed, staged-json, restraint-source, weight and coordinate options to the sidecar route.
- The worker returns both the reconstructed InputXML and `<source>_xml_to_cii2019_inputxml_sidecar_diagnostics.json`.
- Restraints are limited to six per `PIPINGELEMENT`; overflow is retained as structured drop evidence.
- Restraint tags identify XML, component-type and DTXR evidence instead of using the false blanket `ANCI/DTXR-derived` label.
- The CII and sidecar are compared for element count, bend/rigid/restraint/SIF block counts, node-pair sequence and deltas.
- A dedicated collapsible Model Converters panel exposes the parity verdict and downloads the complete JSON ledger.

## Work Pack guardrails

- Audit committed before production edits.
- Immutable original blobs are recorded in `.backups/20260713_xml_to_cii_inputxml_sidecar_workpack_backup.json`.
- Temporary patch script and workflow are absent from the final tree.
- New JavaScript modules remain below 300 lines.
- New JavaScript and Python functions are checked at 40 lines or fewer.
- New JavaScript uses named exports only.
- No mock CII or hidden browser mock is used for the real round-trip gate.
- No unrelated refactor or snapshot/data churn was introduced.

## Focused verification

Permanent workflow: `XML CII InputXML Sidecar`

Validated run `29269388044` passed:

- temporary-file absence and diff hygiene;
- module-size, named-export and function-size checks;
- JavaScript and Python syntax;
- worker argument and artifact contracts;
- protected standalone source-mode integration;
- synthetic matching and mismatch parity cases;
- six-slot restraint/provenance behavior;
- checked-in `Benchmarks/LAUNCHERTOPO.XML` reconstruction;
- real `LAUNCHERTOPO.XML → CII + InputXML + parity JSON` command-line round trip.

The shared `StagedJSON InputXML` workflow run `29269387876` also passed both its focused gate and named regression ledger after the shared worker update.

The broad Mission 01 workflow remains red at its pre-existing `standalone workflow API checks` step. It stops before its source-mode integration step; the Work Pack focused gate and named ledger execute that protected test independently and pass it.

## Named base-versus-head ledger

Equal-depth worktrees were used so path-sensitive repository tests received equivalent filesystem layouts.

### JavaScript

- Base test files: 37
- Head test files: 38
- Base failures: 18
- Head failures: 18
- Regressions: 0
- Removed tests: 0
- Improvements: 0

### Python

- Base test cases: 92
- Head test cases: 96
- Base failures: 10
- Head failures: 9
- Regressions: 0
- Removed tests: 0
- Improvements: 1

The improved case is the existing `test_xml_to_cii_enriched_inputxml_debug_export_contains_explicit_fields`, which previously referenced an absent external 1885 fixture and now uses the checked-in LAUNCHERTOPO benchmark without changing its test identity.

## Protected hash update

`tests/xml-cii-standalone-source-mode-integration.test.js` deliberately updates only the frozen `converters/py-worker.js` blob hash. The dated comment records that the change is confined to the `xml_to_cii` post-process sidecar handoff. The Mission J public source-mode API proof remains unchanged and passes.
