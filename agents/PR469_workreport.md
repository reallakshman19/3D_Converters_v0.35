# PR #469 Work Report — AIV EI `.eit` import, round-trip, and workbench UI

## Status

- PR: #469
- Branch: `agent/aiv-eit-import-ui`
- Base: `main` at `994f43521b5aa6e4dd397efd9300ce21943d056d`
- State: DRAFT
- Merge: NOT REQUESTED / NOT PERFORMED
- Numerical kernel changes: NONE
- Screening/design authority changes: NONE
- Focused automated execution in this runtime: NOT_RUN
- Exact-head GitHub Actions: ENVIRONMENT_BLOCKED / zero workflow steps
- Real-browser acceptance: NOT_RUN

## User outcome

Continue the EI `.eit` compatibility stage, wire import to the AIV UI, and correct a presentation that had become visually indistinguishable from an internal debug console.

The primary workbench is now:

```text
Import / Author
      ↓
Readiness
      ↓
registered VIB.AIV.ACOUSTIC screening
      ↓
Assessment results
      ↓
Export screening JSON / Export EI .eit
```

Secondary engineering and qualification material is retained but moved into progressive disclosures.

## Why the prior UI looked broken

The previous page placed all of these at equal visual weight in one continuous column:

- flare-network authoring;
- graph/canvas;
- controlled benchmark;
- assumptions;
- XLSX/CSV imports;
- three raw editable tables;
- readiness;
- result scopes;
- promotion readiness;
- controlled-source evidence;
- benchmark vectors;
- method trace;
- permanent policy notes.

In addition, qualified status used red/maroon error-like styling, and the flare-network renderer injected its own style block.

This PR fixes the information architecture rather than hiding engineering evidence.

## Import authority invariant

```text
historical / prior .eit line.aiv        imported evidence only
imported result authority               REVIEW_REQUIRED
current screening authority             false until rerun
registered rerun                         VIB.AIV.ACOUSTIC
current authoritative result scope       ASSESSMENT
configured Line/Case LOF                 non-authoritative trace
designAuthority                          false
```

No imported historical `1.48` value can become a current screening decision by loading the file.

## Controlled `.eit` source

```text
repository  reallaksh19/Common
commit      3c8ddb89044061dd26f593604d4b547438c006f0
path        Energy-Institute-AVIFF---Worked-Examples.eit
Git blob    aaf3afe262b19f927fe05e0c44f07f08167fbfa0
size        10414 bytes
version     5
shape       12 lines / 7 pipes / 15 streams / 3 AIV lines
```

Historical AIV anchors are `0.29`, `0.29`, and `1.48`. They are compatibility evidence only.

## New import modules

- `converters/vibration/aiv/aiv-eit-import-authority.js`
- `converters/vibration/aiv/aiv-eit-import-records.js`
- `converters/vibration/aiv/aiv-eit-import-topology.js`
- `converters/vibration/aiv/aiv-eit-import.js`

`AivEitImportPackage.v1` contains:

- editable Source working rows;
- editable Assessment working rows;
- editable Source→Assessment rows;
- compatibility-only connectivity projection;
- imported result traces;
- full preserved source `.eit` document/evidence.

The UI then routes those rows through the existing `createAivInputTable(...)` working-state model. There is no second editable AIV store.

## Import correctness and anti-drift

### Legacy numeric parsing

Blank/null/undefined legacy numerical fields are treated as missing. They are never converted by JavaScript coercion into a false engineering zero.

### Multi-source stream identity

Modern additive Source+Case stream identity has precedence over a line-level legacy `si` pointer. This prevents a multi-source assessment from silently applying the first source stream to every `aiv_data` item.

### Geometry

Modern additive Assessment type/branch geometry is consumed when present. Legacy main inside diameter may be reconstructed only as:

```text
ID = OD - 2 × WT
```

and its provenance is explicitly marked `REVIEW_REQUIRED`.

### Distance

Physical distance is imported only from explicit `.eit aiv_data.distance`. No SVG or presentation geometry supplies metres.

The synthetic import topology is declared:

```text
syntheticDirectPathProjection = true
svgPixelsAuthoritativeForDistance = false
designAuthority = false
```

### Round-trip identity lock

Imported Source / Assessment / Case identity must remain compatible at re-export. Identity drift fails closed with:

```text
AIV_EIT_ROUND_TRIP_IDENTITY_CHANGED
```

This prevents duplicate/stale AIV records after identity edits.

## Re-export preservation

The original v5 document is retained and merged with current AIV output after rerun.

Preserved by default:

- unknown option fields;
- imported project/id/debug/ignore settings;
- unknown line fields;
- unknown pipe fields;
- unknown stream fields;
- materials;
- non-AIV modules;
- legacy identifiers.

For a mixed-module line, historical `maxLof` is preserved because another mechanism may govern. Current Assessment AIV is emitted separately as `aivMaxAuthoritativeAssessmentLof` while `line.aiv` is updated from current Assessment authority.

## UI implementation

New/updated workbench behavior:

- primary **Import EI .eit** entry point;
- controlled EI D.2.3 entry beside import;
- advanced XLSX/CSV imports behind disclosure;
- imported `.eit` summary explicitly marked `REVIEW_REQUIRED`;
- flare network + canvas behind disclosure;
- benchmark + assumptions behind disclosure;
- raw working tables behind disclosure;
- qualification evidence/method trace behind disclosure;
- qualified state rendered with qualified visual semantics rather than red error styling;
- flare-network renderer no longer injects a local `<style>` block.

Styles are composed from:

- `tabs/vibration-aiv-qualification-base.css`
- `tabs/vibration-aiv-workbench.css`
- `tabs/vibration-aiv-qualification.css` as the two-layer entrypoint.

## Permanent tests added

- `tests/vibration-aiv-eit-import.test.mjs`
- `tests/vibration-aiv-workbench-ui.test.mjs`

The import/round-trip test seam pins:

1. prior imported result stays `REVIEW_REQUIRED`;
2. current screening authority remains false before rerun;
3. modern two-source import yields 2 Sources / 1 Assessment / 2 Relationships;
4. additive multi-source stream identity wins over legacy line `si`;
5. legacy missing ID reconstruction is explicit;
6. import topology never derives SVG distance;
7. invalid v5 contract fails closed;
8. mixed-module unknown/non-AIV content survives re-export;
9. AIV-only unknown options/line/pipe/stream/material fields survive re-export;
10. round-trip identity drift fails closed.

The UI seam pins:

- `Import EI .eit` exists;
- qualified visual class exists;
- primary Start → Results → Evidence ordering;
- secondary tools are disclosures;
- old `TABLE/IMPORT MODE ACTIVE` copy is removed;
- flare authoring contains no injected `<style>` block.

`package.json` includes these under `npm run verify:aiv-eit-export`, which remains part of `verify:aiv-canvas-release`.

## Validation records

- `ValidationRecords/VibrationIntegrity/aiv-eit-v5-reference-roundtrip-v1.json`
- `ValidationRecords/VibrationIntegrity/aiv-small-flare-eit-roundtrip-v1.json`

The records deliberately distinguish source inspection PASS from automated/browser NOT_RUN states.

The controlled historical source cannot yet be claimed as a current AIV screening rerun because legacy v5 does not provide all current engineering evidence, particularly explicit distance and sonic-state evidence. The UI/readiness path must expose those gaps rather than inventing them.

The small-flare record preserves the pre-existing qualification finding:

```text
configured FLM1            1.2133
geometry FLM1              1.327921644354955
variance                    0.11462164435495505
tolerance                   0.0024
status                      MISMATCH
```

EIT compatibility does not upgrade arbitrary-geometry AIV qualification.

## Execution evidence

### PASS

- exact controlled Common `.eit` commit/path was fetched through the GitHub connector;
- PR branch was created directly from the then-current `main` base;
- changed-file scope was reconciled before PR creation;
- user-facing UI and importer paths are production-consumed rather than orphan abstractions.

### ENVIRONMENT_BLOCKED / NOT_RUN

PR #469 triggered `Vibration AIV Controlled Source Qualification`, but GitHub created the job with:

```text
steps: []
runner_id: 0
runner_name: ""
```

No checkout or test step executed. Therefore the workflow conclusion `failure` is classified as environment-blocked / NOT_RUN, not a code-test failure and not PASS.

### NOT_RUN

- `npm run verify:aiv-eit-export` as an actual package execution;
- full `npm run verify:aiv-canvas-release`;
- real-browser import/edit/readiness/rerun/download acceptance;
- external EI consumer import of the emitted `.eit`.

These remain explicit evidence gaps.

## Scope ledger — expected 25 changed files

1. `ValidationRecords/VibrationIntegrity/aiv-eit-v5-reference-roundtrip-v1.json`
2. `ValidationRecords/VibrationIntegrity/aiv-small-flare-eit-roundtrip-v1.json`
3. `agents/PR469_workreport.md`
4. `converters/vibration/aiv/aiv-eit-document.js`
5. `converters/vibration/aiv/aiv-eit-geometry.js`
6. `converters/vibration/aiv/aiv-eit-import-authority.js`
7. `converters/vibration/aiv/aiv-eit-import-records.js`
8. `converters/vibration/aiv/aiv-eit-import-topology.js`
9. `converters/vibration/aiv/aiv-eit-import.js`
10. `converters/vibration/aiv/aiv-eit-source-detail.js`
11. `converters/vibration/aiv/aiv-screening-export.js`
12. `docs/vibration/AIV-EIT-Import-RoundTrip-v1.md`
13. `package.json`
14. `tabs/vibration-aiv-eit-import-controller.js`
15. `tabs/vibration-aiv-execution.js`
16. `tabs/vibration-aiv-flare-network-view.js`
17. `tabs/vibration-aiv-input-view.js`
18. `tabs/vibration-aiv-qualification-base.css`
19. `tabs/vibration-aiv-qualification-tab.js`
20. `tabs/vibration-aiv-qualification-view.js`
21. `tabs/vibration-aiv-qualification.css`
22. `tabs/vibration-aiv-state.js`
23. `tabs/vibration-aiv-workbench.css`
24. `tests/vibration-aiv-eit-import.test.mjs`
25. `tests/vibration-aiv-workbench-ui.test.mjs`

## Explicit scope exclusions

No changes to:

- AIV numerical kernel / `aiv-calculator.js`;
- source PWL equations;
- attenuation equations;
- simultaneous-source equations;
- FLM equations;
- flare-network path solver;
- current Assessment screening authority definition;
- `designAuthority=false`;
- non-AIV product modules.

## Next gate

Before merge/readiness:

1. verify exact changed-file ledger remains 25/25;
2. inspect exact-head workflow evidence;
3. execute focused package tests when a runnable environment is available;
4. perform real-browser `.eit` import → edit/readiness → rerun → `.eit` download acceptance;
5. keep historical reference rerun blocked until required modern engineering evidence is supplied.
