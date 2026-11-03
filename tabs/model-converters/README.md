# Model Converters — Developer README

This document describes the modular architecture of `viewer/tabs/model-converters/`.

---

## Module Map

```
viewer/tabs/
├── model-converters-tab.js          ← compatibility shim (10 lines), do not add logic here
└── model-converters/
    ├── index.js                     ← canonical public entry point
    ├── ModelConvertersTab.js        ← tab orchestration shell (installer registry)
    ├── ConverterSelector.js         ← converter selection helpers
    ├── ConverterRunner.js           ← converter execution facade
    ├── WorkflowShell.js             ← XML→CII workflow phase registry (single source of truth)
    ├── xml-cii-domain.js            ← barrel re-export for all xml-cii2019-core/ modules
    ├── converter-registry.js        ← converter metadata + run function registry
    ├── converters/                  ← one file per converter runner
    ├── workflow/                    ← SharedEnrichmentWorkflowShell + adapter contracts
    ├── shared/                      ← reusable UI components (WorkflowModal, FileInputCard, …)
    ├── core/                        ← converter-types, config-store, output-utils
    └── legacy-adapter.js            ← 7500-line monolith (Phase 7 ongoing shrinkdown)
```

---

## How the Converter Registry Works

Each converter is defined once in `converter-registry.js` as an entry in `CONVERTER_DEFS`
and listed once in `CONVERTER_ORDER`.  At import time, `CONVERTERS` is built by zipping
`CONVERTER_ORDER` over `CONVERTER_DEFS` and attaching the matching runner from `RUNNERS`.

A startup guard runs immediately (`_assertRegistryIntegrity`) and throws if:
- Any ID in `CONVERTER_ORDER` is duplicated.
- Any ID in `CONVERTER_ORDER` is not present in `CONVERTER_DEFS`.

If either throws, the page load fails fast — no silent mis-registration.

---

## How to Add a New Converter

1. **Add the metadata** to `CONVERTER_DEFS` in `converter-registry.js`:
   ```js
   my_converter: {
     id: 'my_converter',
     label: 'My Format -> Other',
     primaryAccept: '.myformat',
     primaryLabel: 'My Format Input',
     description: 'One-line description.',
     defaults: { someOption: true },
     fields: [
       { key: 'someOption', label: 'Some Option', type: 'checkbox' },
     ],
   },
   ```

2. **Add the ID** to `CONVERTER_ORDER` (after the metadata, in one place):
   ```js
   const CONVERTER_ORDER = [
     // ... existing ids ...
     'my_converter',
   ];
   ```

3. **Create the runner** in `converters/my-converter.js`:
   ```js
   /**
    * @param {import('../core/converter-types.js').ConverterContext} context
    * @returns {Promise<import('../core/converter-types.js').ConverterResult>}
    */
   export async function run(context) {
     const { inputFiles, options, logger } = context;
     // ... conversion logic ...
     return { ok: true, outputs: [{ name: 'result.txt', text: '...' }] };
   }
   ```

4. **Wire the runner** into `RUNNERS` in `converter-registry.js`:
   ```js
   import { run as myConverterRun } from './converters/my-converter.js';
   const RUNNERS = {
     // ...existing...
     my_converter: myConverterRun,
   };
   ```

The startup guard will catch any mismatch at import time.

---

## How to Add Converter Options

Options are declared in the `fields` array of the converter definition.  Supported types:

| `type`            | Rendered as                                     |
|-------------------|-------------------------------------------------|
| `text`            | `<input type="text">`                           |
| `number`          | `<input type="number">` — add `step` property  |
| `checkbox`        | `<input type="checkbox">`                       |
| `select`          | `<select>` — add `options: [...]` property      |
| `json-popup`      | Textarea with a JSON popup editor button        |
| `column-picker`   | Column ordering/visibility picker               |
| `support-type-rules` | Rule-based support-type table editor         |

Values are persisted in `localStorage` keyed by converter ID via `config-store.js`.

---

## How to Add a Workflow Phase

The canonical XML→CII workflow phases live in `WorkflowShell.js`.  A startup assertion
in that file enforces:

- No duplicate phase IDs.
- `4A Weight Match` (id: `weight-match`) always before `5 Run` (id: `run`).
- No `9 CII Support Mapping` phase.

To add a phase:

1. Add an entry to `XML_CII_WORKFLOW_PHASES` in `WorkflowShell.js` in the correct position.
2. Add a `render*Phase()` function inside `legacy-adapter.js` (until Phase 7 shrinkdown moves
   it to a dedicated module).
3. Add a `bind*Phase()` function inside `legacy-adapter.js`.
4. Wire both into `xmlCiiRenderWorkflowRoot()` in `legacy-adapter.js`.

---

## How the XML→CII Workflow Is Reused Outside Model Converters

The domain modules are fully decoupled from UI and live in:

```
viewer/converters/xml-cii2019-core/
├── regex-line-key.js
├── linelist-mapping.js
├── dtxr-resolver.js
├── element-length.js          ← computeElementLengthFromCiiVector (SRSS)
├── output-normalizer.js
├── master-context.js
├── weight-match-model.js
├── support-mapping.js
└── config.js
```

They can be imported via the barrel at `viewer/tabs/model-converters/xml-cii-domain.js`.
No DOM, no `document`, no `window` — pure data transforms.

The UI workflow adapter contract is in `workflow/WorkflowAdapterContract.js` and
`workflow/adapters/xml-cii2019-workflow-adapter.js`.  Implement `getPhaseModel()`,
`loadSource()`, `buildPreviewModel()`, and `runFinal()` to plug into
`SharedEnrichmentWorkflowShell.js` outside the Model Converters tab.

---

## How to Run Tests

```sh
# Phase 0/1/2: scaffold + registry integrity (26 tests)
node --experimental-vm-modules scripts/test-model-converters-scaffold.mjs

# Phase 3: domain unit tests (18 tests)
node --experimental-vm-modules scripts/test-model-converters-domain.mjs

# Registry contract
node --experimental-vm-modules scripts/test-model-converters-registry.mjs

# XML→CII logic
node --experimental-vm-modules scripts/test-xml-cii-logic.mjs

# XML→CII all benchmark variants
node --experimental-vm-modules scripts/test-xml-cii-all.mjs
```

---

## Browser UI vs Python Worker Boundaries

| Layer                | Location                                 | Can use DOM? |
|----------------------|------------------------------------------|--------------|
| Domain transforms    | `viewer/converters/xml-cii2019-core/`    | No           |
| Converter runners    | `model-converters/converters/*.js`       | No           |
| Python worker bridge | `converters/python-worker-base.js`       | No           |
| UI renderers         | `legacy-adapter.js` (pending extraction) | Yes          |
| Popup components     | `bm-cii-support-annotation-popup.js` etc | Yes          |
| Shared UI components | `model-converters/shared/`               | Yes          |

Python workers are launched via `ConverterRunner.js` → `converter-registry.js` →
`converters/python-worker-base.js`.  Never call `document` or `window` from converters.

---

## Migration Notes

### Files Changed in This Refactor (2026-06-18)

| File | Change |
|------|--------|
| `viewer/tabs/model-converters-tab.js` | Reduced to 10-line compatibility shim |
| `viewer/tabs/model-converters/index.js` | **New** — canonical public entry point |
| `viewer/tabs/model-converters/ModelConvertersTab.js` | **New** — installer orchestration |
| `viewer/tabs/model-converters/ConverterSelector.js` | **New** — selection helpers |
| `viewer/tabs/model-converters/ConverterRunner.js` | **New** — execution facade |
| `viewer/tabs/model-converters/WorkflowShell.js` | **New** — canonical phase registry |
| `viewer/tabs/model-converters/xml-cii-domain.js` | **New** — domain barrel export |
| `viewer/tabs/model-converters/converter-registry.js` | Added startup integrity guard |
| `viewer/tabs/model-converters/legacy-adapter.js` | Imports `XML_CII_WORKFLOW_PHASES` from `WorkflowShell.js` instead of re-defining it |
| `viewer/tabs/model-converters/xml-cii-workflow-ui-fixes.js` | Marked `@deprecated` — no active callers |
| `viewer/tabs/model-converters/xml-cii-conversion-workflow-process-nesting.js` | Marked `@deprecated` — no active callers |

### Files Retained (Pending Phase 7 Extraction)

- `legacy-adapter.js` — contains CONVERTER_DEFS, XML_CII_MASTER_DEFS, all workflow renderers.
  Target: extract to `ModelConvertersTab.js`, `ConverterSelector.js`, and phase-specific modules.

### Files NOT Changed

- All `viewer/converters/xml-cii2019-core/` — domain modules unchanged.
- All `viewer/tabs/model-converters/converters/` — converter runners unchanged.
- All `viewer/tabs/model-converters/shared/` — UI components unchanged.
- All `viewer/tabs/model-converters/workflow/` — adapter contracts unchanged.

---

## Acceptance Checklist

- [x] `model-converters-tab.js` ≤ 300 lines (currently 10)
- [x] Converter IDs registered exactly once (enforced at startup)
- [x] No duplicate workflow phases (enforced at startup by `WorkflowShell.js`)
- [x] `4A Weight Match` before `5 Run` (enforced by `WorkflowShell.js` assertion)
- [x] No `9 CII Support Mapping` phase
- [x] MutationObserver patch modules have no active callers (deprecated)
- [x] Hydro dropdown contained within field mapping area only
- [x] XML→CII domain modules usable outside Model Converters tab
- [x] All new scaffold + domain tests green (44 tests)
- [ ] `legacy-adapter.js` ≤ 500 lines — **pending Phase 7 full extraction**
