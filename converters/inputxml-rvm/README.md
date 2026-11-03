# InputXML → RVM (+GLB) converter

Converts a CAESAR II **Input XML** file into a binary **AVEVA RVM** model
(exact parametric primitives) plus an optional `.att` attribute dump, and an
optional **GLB** companion for the in-browser viewer.

```
Input XML → UXML document → parametric component model ┬→ binary RVM (+ .att)   [Navisworks]
                                                       └→ GLB (optional)         [web viewer / GitHub Pages]
```

## Two outputs, two targets

| Output | Target | Notes |
| --- | --- | --- |
| `.rvm` (+ `.att`) | **Navisworks / AVEVA Review** (desktop) | Standard AVEVA binary RVM; rvmparser-validated. |
| `.glb` (optional) | The repo's **in-browser viewer** on GitHub Pages | The static viewer renders GLB, not raw binary RVM. |

Everything runs **client-side**, so the converter works on GitHub Pages (static
hosting) with no backend. The RVM path needs nothing external; the optional GLB
uses three.js from the page's importmap (the same CDN the rest of the viewer
already uses) and performs no network fetches of its own.

The RVM is serialised from the **parametric component model** (cylinders, snouts,
tori, boxes), never from tessellated geometry, so the output is exact and compact.
Units are millimetres. The binary framing (big-endian, 24-byte chunk headers with a
cumulative `next_chunk_offset`, word-counted strings) mirrors rvmparser's
`ParserRVM.cpp`, so the file loads in Navisworks / AVEVA Review. ASCII/REV is *not*
emitted because Navisworks will not load it.

## Why everything here is prefixed with `Rvmx`

This converter must **not depend on any shared viewer module**. The shared
Universal-XML / GLB pipeline (`viewer/uxml/*`, `viewer/converters/inputxml-glb/*`,
`viewer/utils/*`) is continually patched by other workflows and has repeatedly
regressed. To insulate RVM export from that churn, every dependency it needs has
been **copied into this folder and prefixed with `Rvmx`**. Each copy imports only
its sibling copies — nothing escapes this directory.

| Vendored file | Copied from |
| --- | --- |
| `RvmxUxmlConstants.js` | `viewer/uxml/UxmlConstants.js` |
| `RvmxUxmlTypes.js` | `viewer/uxml/UxmlTypes.js` |
| `RvmxLineNoMetadata.js` | `viewer/utils/line-no-metadata.js` |
| `RvmxUxmlInputXmlSchemaMapper.js` | `viewer/uxml/UxmlInputXmlSchemaMapper.js` |
| `RvmxInputXmlBendMetadata.js` | `viewer/converters/inputxml-glb/InputXmlBendMetadata.js` |
| `RvmxCaesarRestraintClassifier.js` | `viewer/converters/inputxml-glb/CaesarRestraintClassifier.js` |
| `RvmxInputXmlCaesarSupportMetadata.js` | `viewer/converters/inputxml-glb/InputXmlCaesarSupportMetadata.js` |
| `RvmxUxmlToGlbModelAdapter.js` | `viewer/converters/inputxml-glb/UxmlToGlbModelAdapter.js` |
| `RvmxInputXmlBranchExtractor.js` | `viewer/converters/inputxml-glb/InputXmlBranchExtractor.js` |
| `RvmxComponentModelToRvm.js` | the `ComponentModelToRvm.js` serialiser (the task's source file) |
| `inputxml-to-rvm-runner.js` | new — the self-contained `run(ctx)` entry point |

The self-containment is enforced by a test
(`viewer/tests/inputxml-to-rvm-self-contained.test.js`): if any file here imports a
non-sibling specifier the test fails.

## Entry point

`inputxml-to-rvm-runner.js` exports `run(ctx)`:

- `ctx.inputFiles` — array; the entry with `role: 'primary'` (or the first) is the
  Input XML. Text is read from `.text` (string), `.bytes` (Uint8Array/ArrayBuffer)
  or `.text()` / `.file.text()`.
- `ctx.options`:
  - `rvmPrecision` (default `3`) — coordinate rounding (decimals).
  - `includeAtt` (default `true`) — also emit the `.att` attribute dump.
  - `includeGlb` (default `true`) — also emit a `.glb` companion for the web viewer.
  - `includeSidecarJson` (default `false`) — also emit a diagnostics sidecar JSON.
- `ctx.setStatus(message, state)` — optional progress callback.

Returns
`{ ok, outputs: [{ name, base64|text, mime }], logs: { stdout, stderr }, model, stem }`.
The `.rvm` output is binary (base64-encoded). `model`/`stem` are returned so an
outer layer can build the GLB companion without this runner importing three.js.

## Where the GLB comes from (the one shared dependency)

The self-contained runner here only ever produces the RVM. The optional GLB is
added by the registry wrapper
`viewer/tabs/model-converters/converters/inputxml-to-rvm.js`, which lives
**outside** this folder and is therefore allowed to reach for shared code. It
dynamically imports the shared three.js exporter
(`viewer/js/pcf2glb/glb/{buildExportScene,exportSceneToGLB}.js`) inside a
try/catch: if three.js is unavailable (e.g. Node tests) the GLB is skipped with a
log line and the RVM is unaffected. This keeps the strict "no shared modules"
guarantee on the RVM/parsing core while still serving the web viewer.

## Registration

Registered as converter id `inputxml_to_rvm` ("InputXML -> RVM", group `3D Models`)
in `viewer/tabs/model-converters/converter-registry.js`, with the runner re-exported
from `viewer/tabs/model-converters/converters/inputxml-to-rvm.js`. The legacy tab
adapter carries a matching dropdown definition.

## Maintenance

If the shared sources change and you *want* the update here, re-copy the file, add
the `Rvmx` prefix, and re-point its imports to the sibling copies. Otherwise these
copies are intentionally frozen and independent of the shared tree.
