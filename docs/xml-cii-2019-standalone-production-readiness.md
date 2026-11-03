# XML→CII 2019 Standalone Production Readiness

## Current architecture

The standalone workflow is a separate callable API and app-level tab path:

```text
Programmatic caller / adapted standalone UI
→ runXmlCii2019Workflow(job, runtime)
→ source detection + job normalization
→ workflow service
→ PSI116 XML branch or direct InputXML enrichment branch
→ enrichedXML / enrichedInputXML
→ optional CII compatibility route
→ normalized diagnostics, logs, and artifacts
```

The existing Model Converters XML→CII production route remains separate and is not replaced by this workflow.

## Adapted workflow UI

The standalone workflow has both:

1. an API callable by other apps, and
2. an adapted/configurable workflow UI for manual setup and proof.

The UI adapts the existing XML→CII 2019 workflow phase model. It is not a literal copy of the old popup implementation and does not import or execute the old Model Converters workflow runtime.

The old Model Converters workflow popup is unchanged. The standalone workflow can be called by other apps; it does not call other app workflows.

## InputXML UI coverage

The standalone-only InputXML controls are available in the adapted phase UI:

```text
sourceKind: auto | xml | inputxml
InputXML file/text
elementSideLoadText
inputXmlOutputMode
pointPropertiesBasis
inputXmlRestraintPolicy
fillSentinelFromLineContext
normalizePressureCaseNames
```

These controls map into the public `runXmlCii2019Workflow(job, runtime)` job shape.

## Programmatic call pattern

```js
import { runXmlCii2019Workflow } from './tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js';

const result = await runXmlCii2019Workflow(job, runtime);
```

`runtime.engineRunner` is optional. Tests can pass an explicit fake engine runner to avoid Pyodide. Browser use can omit it and allow the standalone compatibility engine to load.

## Diagnostics contract

Every normalized workflow result should expose:

```text
schema
sourceKind
outputKind
branch
elementCount
enrichedElementCount
restraintCount
sideLoadMatched
sideLoadUnmatched
inheritedFieldCount
sentinelFieldCount
engineDiagnostics
warnings
```

## Reference parity proof

Mission 03 adds a controlled reference parity harness:

```bash
node tests/xml-cii-standalone-parity.test.js
```

The harness intentionally does not click the old popup or invoke the production route. See `docs/xml-cii-2019-standalone-parity.md`.

## Live proof and switch-readiness decision

Mission 04 added automated smoke and a repeatable manual live checklist:

```bash
node tests/xml-cii-standalone-live-smoke.test.js
```

Mission 05 attempted evidence capture against the merged state, tied to commit:

```text
5e2dd766775dd71bc0ee2404a56f2d0c9c56bb39
```

Real browser/Pyodide evidence was not captured in the agent environment. The readiness decision therefore remains:

```text
needs-more-proof
```

This is not a production switch, not a switch proposal, and not switch approval. See `docs/xml-cii-2019-standalone-live-proof.md` for the exact missing evidence fields.

## Production-readiness report

The readiness report is created by:

```js
import { createXmlCiiProductionReadinessReport } from './tabs/xml-cii-2019-standalone/xml-cii-production-readiness.js';
```

A successful report returns:

```js
{
  schema: 'xml-cii-2019-production-readiness/v1',
  ok: true,
  status: 'ready-for-shadow-production-proof',
  blockers: []
}
```

## Known limitations

- This phase does not switch the existing Model Converters XML→CII route.
- Mission 04 automated smoke is not a real browser/Pyodide run.
- Mission 05 did not capture real browser/Pyodide evidence in the agent environment.
- Optional CII still uses the standalone compatibility Pyodide engine when no explicit `runtime.engineRunner` is supplied.
- Mission 03 parity is reference-fixture parity, not live production-route invocation.
- Worker isolation is not complete; the browser runtime still imports the standalone compatibility engine directly.
- The existing production Pyodide worker and legacy route remain intentionally unchanged.

## Blocked items before production switch

1. Complete manual browser proof for XML and InputXML fixtures.
2. Complete real browser/Pyodide compatibility proof.
3. Add live old-route parity proof if owner approves a safe harness outside the old popup/worker mutation path.
4. Decide whether the standalone compatibility engine must move behind a dedicated worker boundary.
5. Define rollback criteria and feature flag / controlled switch policy.

## Recommended next phase

Proceed with owner/operator browser evidence capture:

```text
open app
→ run standalone XML fixture
→ run standalone InputXML fixture + side-load
→ capture output/log/diagnostics evidence
→ update decision evidence
→ switch/no-switch recommendation
```

Only after live proof should a separate runtime switch PR be proposed.
