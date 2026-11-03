# PR454 — AIV SVG Canvas Definition-of-Done Completion

## Mission

Close the concrete #449 acceptance and product gaps identified after PR #451 merged, tracked in #453, without changing AIV numerical authority or creating a second engineering data store.

## Permanent invariants

```text
TABLES = engineering source of truth
SVG CANVAS = visual navigation / relationship editing / result explanation
screeningResultScope = ASSESSMENT
designAuthority = false
```

- SVG coordinates are presentation only.
- Physical source→assessment distance remains table/assumption evidence.
- Canvas/UI code contains no AIV equations or local dB recombination.
- Registered `calculateEngineering('VIB.AIV.ACOUSTIC', ...)` remains the execution path.
- Line/Case summary remains non-authoritative for screening.

## Base / branch

```text
base main     007842eedb4498b8328cc3e864112a398c9d1fe4
branch        agent/aiv-canvas-dod-completion
issue         #453
PR            #454
```

## Implemented

### P0 parity / integration

- Added controlled EI D.2.3 registered Engineering API → batch API → canvas projection parity test.
- Added true two-applicable-source kernel/canvas fixtures:
  - `160 + 160 dB -> 163.0102999566398 dB`
  - `160 + 150 dB -> 160.41392685158226 dB`
- Both simultaneous-source tests require both Source Canonical IDs to survive in the returned Assessment contribution list and canvas projection.
- Added `verify:aiv-canvas-release` as the complete AIV input/release + canvas command.

### P1 UI / integration

- Added engineering-specific Source icons:
  - relief valve / PSV
  - control valve
  - restriction orifice
  - pressure-reducing device
  - unknown source fallback
- Added engineering-specific Assessment icons:
  - weldolet
  - welded tee
  - welded support
  - other welded discontinuity
  - unknown assessment fallback
- Added path/infrastructure distinctions for pipe path, junction, connection node, off-page and boundary.
- Added visible status glyph vocabulary for active/closed, sonic/non-sonic, trimmed, applicability, assumptions, warning/input-incomplete, result available and provenance.
- Added explicit `RESULTS` canvas mode.
- Added selected-item tabs for Summary, Inputs, Calculation/Contributions, Assumptions and Provenance; Assessment adds T2-6.
- Selected Source/Assessment/Relationship detail is emitted even before readiness/results.
- Case/Line filters now apply to synchronized editable Source/Assessment/Relationship table rows using canonical topology line identity and Operating Case relationships.
- Split detail-tab interaction into a separate canvas presentation module so the controller remains below the repository 300-line guard.

## Validation status

### Performed in this agent runtime

- exact source/blob inspection of all touched files
- repository module-size guard checked for controller/view/projection; all remain below 300 physical lines
- controlled benchmark canonical IDs rechecked against `tabs/vibration-aiv-benchmarks.js`
- static authority review: new canvas modules do not import AIV numerical kernel/equation helpers

### NOT_RUN in this runtime

The current runtime has no repository checkout and outbound GitHub DNS is unavailable. GitHub connector archive fetch returns no mounted local file, therefore literal native commands cannot honestly be reported as executed here.

Required on the final PR head:

```bash
npm run verify:aiv-canvas
npm run verify:aiv-canvas-release
```

Real-browser acceptance also remains required under #453 for pointer pan, wheel zoom, drag, keyboard/focus, canvas↔table sync, relationship create/delete, assumption focus, filters, result tabs, downloads and 100/300/500 relationship rendering.

## CI classification

The PR #451 AIV and topology hosted jobs were zero-step no-starts with `runner_id=0` and the Actions-budget annotation. They are `NOT_RUN / INFRASTRUCTURE_BLOCKED`, not product test failures.

## Optional / out of scope

- PNG canvas screenshot remains optional and is not a DoD blocker.
- Existing broad module-boundary debt and pre-existing oversized qualification controller remain separate unless directly reproduced by this PR.

## Merge rule

Do not merge #454 until native `verify:aiv-canvas`, `verify:aiv-canvas-release`, and the real-browser acceptance checklist have been executed on the final candidate and any reproduced defects are fixed.
