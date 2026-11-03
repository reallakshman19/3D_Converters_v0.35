# XML→CII 2019 Standalone Phase 2 Proof

## Purpose

This document records the Phase 2 shadow/API proof for the merged `XML→CII 2019 Standalone` workflow. The standalone path remains a separate app-level tab and public API path. It does not replace the existing production Model Converters XML→CII route.

## Open the standalone tab

1. Open the FormatConverters app.
2. Confirm the existing `3D Model Converters` tab is still visible.
3. Select `XML→CII 2019 Standalone` from the app-level tab rail.
4. Confirm the tab renders the `Source type` selector.

## Run PSI116 XML → enrichedXML

1. In `Source type`, choose `Auto detect` or `PSI116 XML`.
2. Load a PSI116-style XML file with a `PipeStressExport` root.
3. Keep `Output` as `Enriched XML only` unless CII output is required.
4. Press `Run workflow`.
5. Verify diagnostics report the resolved source kind as `xml` and output kind as `enrichedXML`.

Phase 2 fixture coverage:

```text
tests/fixtures/xml-cii-standalone/psi116-basic-input.xml
tests/fixtures/xml-cii-standalone/psi116-basic-expected-enriched.xml
```

The automated Phase 2 public API test uses a fake engine runner for the PSI116 branch so the proof does not require Pyodide.

## Run InputXML + side-load → enrichedInputXML

1. In `Source type`, choose `Element-based InputXML` or keep `Auto detect` for a `CAESARII XML_TYPE="Input"` document / `PIPINGELEMENT` fragment.
2. Load an InputXML document or `PIPINGELEMENT` fragment.
3. Paste element side-load text using an element key such as `ELEMENT 30-40`.
4. Use `InputXML output mode: full CAESARII/PIPINGMODEL document`.
5. Use `Point properties basis: TO` or `auto`; `auto` resolves to `TO`.
6. Use `Restraint policy: Replace with DTXR-derived restraints` when DTXR text should replace existing restraints.
7. Press `Run workflow`.
8. Download or inspect the enriched InputXML output.

Phase 2 fixture coverage:

```text
tests/fixtures/xml-cii-standalone/inputxml-side-load-input.xml
tests/fixtures/xml-cii-standalone/inputxml-side-load.txt
tests/fixtures/xml-cii-standalone/inputxml-side-load-expected-enriched.input.xml
```

## Verify the 30→40 restraint case

For the Phase 2 fixture, element `30→40` must prove these semantics:

```text
LINE_ID="/ASIM-1836-6&quot;-S8810010-91261M7-HC/B1"
<PipingClass>91261</PipingClass>
<Rating>900</Rating>
<DTXR_POS>...</DTXR_POS>
<DTXR_PS>...</DTXR_PS>
<Point_properties_basis>TO</Point_properties_basis>
```

The existing `TYPE=17` restraint on node `40` must be replaced by exactly three DTXR-derived restraints:

```text
TYPE="14" with FRIC_COEF="0.3"
TYPE="9" with FRIC_COEF="-1.0101"
TYPE="8" with FRIC_COEF="-1.0101"
```

The same fixture also proves sentinel inheritance from the previous `20→30` element into the `30→40` element, including key line-context fields such as diameter, wall thickness, pressure case, and density values.

## Run optional CII output

1. Use the same standalone tab.
2. Select `Output: Both` or `Output: CII only`.
3. Run the workflow.
4. For InputXML, the standalone workflow first enriches InputXML and then hands the enriched InputXML to the optional CII compatibility route.
5. Verify CII output is present and diagnostics include engine diagnostics.

The automated Phase 2 public API test uses `runtime.engineRunner` to prove that `outputMode: 'both'` calls the compatibility engine after InputXML enrichment, without requiring a live Pyodide runtime.

## Automated proof commands

Run the narrow proof set:

```bash
node tests/xml-cii-standalone-static.test.js
node tests/xml-cii-inputxml-enrichment-behavior.test.js
node tests/xml-cii-standalone-workflow-api.test.js
```

Expected result:

```text
XML CII standalone workflow static checks passed.
XML CII InputXML enrichment behavior checks passed.
XML CII standalone workflow API Phase 2 checks passed.
```

## Known limitations

- Optional CII still uses the standalone compatibility Pyodide engine.
- No production switch has been made.
- No golden parity against the old production XML→CII route is included in this phase.
- Worker isolation is deferred.
- Browser smoke proof is static in this phase because the repository does not currently include a narrow browser test framework such as Playwright or Puppeteer.

## Rollback and preservation note

The existing production Model Converters XML→CII path remains untouched. Rollback of this phase only requires removing the Phase 2 fixtures, proof test, and this document. The standalone tab/API can remain isolated without affecting the production `xml_to_cii` route.
