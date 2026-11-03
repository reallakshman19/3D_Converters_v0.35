# PR #456 Work Report — AIV flare-network authoring and generated calculation tables

## Status

- PR: #456
- Branch: `agent/aiv-flare-network-authoring`
- Base: `main` at `23d06cf52ba362a3895651f631b79429c493fef8`
- Issue: #455
- State: DRAFT / implementation complete; native and real-browser acceptance pending
- Merge: NOT REQUESTED / NOT PERFORMED

## User outcome

The AIV workspace can now represent a drawn flare network and use that engineering graph to generate all three AIV calculation working tables automatically.

```text
flare-network SVG/editor
→ AivFlareNetwork.v1
→ AivGeneratedInputSet.v1
   ├─ AivSourceCsv.v2
   ├─ AivAssessmentCsv.v1
   └─ AivSourceAssessmentCsv.v1
→ visible AivAssumptionProfile.v1 fills blank engineering cells
→ FLARE_NETWORK readiness
→ registered VIB.AIV.ACOUSTIC screening calculation
→ Source / Assessment / non-authoritative Line trace results
```

## Engineering distance authority

```text
SVG x/y / visual line length         = presentation only
segment.physicalLength               = explicit engineering property
Source→Assessment Physical Distance  = sum(explicit segment lengths on one unique directed graph path)
```

Rules:

- dragging a node changes only `presentation.x/y`;
- engineering segment lengths are unchanged by drag/stretch;
- one unique path + every segment length known => generated APPLICABLE relationship and distance;
- multiple routes => `AMBIGUOUS_PATH`, relationship remains unresolved;
- missing length => `UNRESOLVED_LENGTH`, distance stays blank;
- disconnected Source/Assessment => no generated applicable relationship;
- no visual/shortest-route guess is allowed.

## Core contracts

### `AivFlareNetwork.v1`

`converters/vibration/aiv/aiv-flare-network.js`

- network/revision/provenance;
- Source / Assessment / Junction / Connection / Boundary / Off-page nodes;
- Source and Assessment engineering property bags;
- directed pipe segments;
- explicit m/mm engineering length;
- presentation coordinates stored separately;
- duplicate/dangling/self-edge/invalid-length validation;
- deterministic directed-path resolution.

### Authoring mutations

`converters/vibration/aiv/aiv-flare-network-mutations.js`

- add/update/delete node;
- add/update/delete segment;
- set/clear explicit segment length;
- node deletion protects referential integrity.

### `AivGeneratedInputSet.v1`

`converters/vibration/aiv/aiv-flare-network-table-generator.js`

Produces existing exact working-table contracts:

- `AivSourceCsv.v2`;
- `AivAssessmentCsv.v1`;
- `AivSourceAssessmentCsv.v1`.

Generated path evidence retains exact contributing segment IDs and records `EXPLICIT_SEGMENT_ENGINEERING_LENGTH_SUM` as distance authority.

### Authored topology

- `converters/vibration/aiv/aiv-flare-network-topology.js`
- `converters/vibration/aiv/aiv-readiness-tables.js`
- `converters/vibration/aiv/aiv-topology-view-model.js`

Adds `FLARE_NETWORK` as a first-class AIV topology input. It is not disguised as the certified five-sheet 3D EDIT exchange; imported topology retains its complete-exchange requirement.

### Public AIV facade

`converters/vibration/aiv/index.js` now exposes the graph, mutation, table-generation and flare-topology functions as stable AIV APIs.

## Live SVG/UI

- `tabs/vibration-aiv-flare-network-svg.js`
- `tabs/vibration-aiv-flare-network-view.js`
- `tabs/vibration-aiv-flare-network-controller.js`
- `tabs/vibration-aiv-flare-network-state.js`
- `tabs/vibration-aiv-input-view.js`
- `tabs/vibration-aiv-qualification-tab.js`

Implemented:

- add Source / Assessment / Junction / Connection / Boundary / Off-page nodes;
- choose Source device type: PSV/relief, control valve, restriction orifice, pressure-reducing device;
- choose Assessment type: weldolet, welded tee, welded support, other welded discontinuity;
- reuse the established AIV engineering SVG glyph library;
- connect directed pipe segments;
- enter/edit/clear explicit segment length in m/mm;
- unresolved-length visual state;
- drag nodes for presentation layout with live connected-segment redraw;
- segment/node deletion;
- graph edit transaction regenerates AIV tables/topology and clears stale readiness/results;
- manual table/import edits intentionally switch to TABLE/IMPORT mode;
- next graph edit intentionally regenerates the tables;
- UI clearly identifies `AUTO-GENERATED TABLE MODE` versus `TABLE/IMPORT MODE`.

## Execution boundary cleanup

Created `tabs/vibration-aiv-execution.js` as the only UI-side bridge for:

- readiness;
- registered `calculateEngineering('VIB.AIV.ACOUSTIC', ...)` screening execution;
- benchmark export;
- screening export.

Created `tabs/vibration-aiv-state.js` for initial workspace state.

`vibration-aiv-qualification-tab.js` no longer contains the numerical API call and has been split below the repository's normal 300-line module guard.

`tests/vibration-module-boundaries.test.mjs` was aligned with the actual SCREENING architecture:

- graph/generator/readiness/presentation modules cannot execute AIV equations;
- only `vibration-aiv-execution.js` may call the registered Engineering Calculation API;
- SVG/presentation cannot become implicit distance authority.

This addresses the previously identified ISS-001/ISS-002 boundary/module-size debt rather than weakening the guards.

## Screening export provenance

`AivScreeningExportPackage.v1` now has additive `flareNetworkEvidence` when execution comes from authored network mode:

- network ID/revision/source;
- exact Source→Assessment path segment IDs;
- unresolved segment IDs where applicable;
- generated physical distance;
- distance authority;
- `svgPixelsAuthoritativeForDistance=false`.

Non-network projects retain `flareNetworkEvidence=null`.

## D.2.3 generated-network regression

```text
AIV-D23-RELIEF-SOURCE
    │
    │ D23-PATH-001 = explicit 0.8 m
    ▼
AIV-D23-WELDOLET-01
```

Regression path:

```text
AivFlareNetwork.v1
→ generated tables
→ existing CSV parsers
→ existing AIV calculator
```

Pinned expectations:

- generated distance `0.8 m`;
- relief raw PWL `164.6851759525391 dB`;
- attenuation `0.3116883116883117 dB`;
- first-point PWL `164.3734876408508 dB`;
- Assessment LOF `0.29`;
- Line/Case LOF `1.48`, non-authoritative.

## Readiness regression

A minimal drawn Source → 0.8 m segment → Assessment network is projected as `FLARE_NETWORK`; the existing visible assumption profile resolves missing process/geometry cells and the expected relationship reaches `READY_FOR_QUALIFICATION`.

## True simultaneous-source regressions

Graph → generated tables → existing calculator tests pin:

- `160 + 160 → 163.0102999566398 dB`;
- `160 + 150 → 160.41392685158226 dB`;
- both contributing Source Canonical IDs remain in the calculation result.

## Focused tests added

- `tests/vibration-aiv-flare-network.test.mjs`
- `tests/vibration-aiv-flare-network-authoring.test.mjs`
- `tests/vibration-aiv-flare-network-canvas-mode.test.mjs`
- `tests/vibration-aiv-flare-network-svg.test.mjs`
- `tests/vibration-aiv-flare-network-readiness.test.mjs`
- `tests/vibration-aiv-flare-network-multisource.test.mjs`
- `tests/vibration-aiv-flare-network-export.test.mjs`

Existing `tests/vibration-aiv-screening-release.test.mjs` and `tests/vibration-module-boundaries.test.mjs` were updated for the split execution architecture.

Commands:

```bash
npm run verify:aiv-flare-network
npm run verify:aiv-canvas-release
```

## Validation status

Repository-native package execution: **NOT_RUN** in this agent runtime because there is no mounted repository checkout.

Real-browser authoring acceptance: **NOT_RUN** in this agent runtime.

Focused isolated executable smoke performed on the graph/generator rules:

- `0.5 m + 300 mm → 0.8 m` PASS;
- moving the SVG junction to extreme coordinates leaves `0.8 m` unchanged PASS;
- two directed routes return `AMBIGUOUS_PATH` PASS;
- generated resolved relationship is APPLICABLE and pixel authority remains false PASS.

The selected two-source process vectors were also independently checked to reproduce the required 160/160 and 160/150 point-contribution combinations.

Hosted Actions on prior #456 heads have remained zero-step/no-run due repository Actions budget. Exact latest-head status must be checked separately; never classify those budget blocks as product test failure.

## Remaining before closing #455

- native `npm run verify:aiv-flare-network`;
- native `npm run verify:aiv-canvas-release`;
- real-browser add/connect/drag/edit/delete acceptance;
- browser confirmation that graph edits regenerate the visible tables immediately;
- browser D.2.3 Run AIV acceptance from the drawn network;
- browser export/download acceptance with network/path provenance.

## Permanent authority boundary

```text
AIV screening result scope = ASSESSMENT
designAuthority = false
SVG pixels = never engineering physical distance
```
