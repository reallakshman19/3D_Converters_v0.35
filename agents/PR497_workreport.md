# PR497 — AIV Missing-Data Assumptions CSS Improvement

## Recovery header

| Field | Current state |
|---|---|
| Mission | Improve readability and responsive layout of the AIV Missing-data assumptions panel. |
| Work intent | UI / CSS IMPROVEMENT |
| Criticality | STANDARD — presentation only. |
| PR | `#497` — DRAFT / OPEN / NOT MERGED |
| Branch | `agent/aiv-assumption-panel-css` |
| Grounded base | `main@ffbbecdadf83a16ef4e48e62946cea05d1a4e8c6` |
| Validated implementation head | `d3e30283203e59b9ed59167ac1e70f830d755955` |
| Authority impact | NONE |
| Merge authority | NOT AUTHORIZED |
| EXACT_NEXT_ACTION | Obtain real-browser desktop/narrow-screen visual acceptance; merge only after explicit owner authorization. |

## Problem

The AIV assumption renderer already emits semantic classes for the panel and fields, including `.aivq-assumption-card`, `.aivq-assumption-grid`, and `.aivq-assumption-field`, but the active AIV CSS had effectively no dedicated rules for those structures. Browser-default inline/layout behavior therefore caused labels, controls and long enum choices to visually concatenate and made the section difficult to scan.

The renderer itself is not changed by this PR.

## Implemented presentation

- Dedicated `tabs/vibration-aiv-assumptions.css` layer.
- Responsive field grid using auto-fit cards.
- Each label/input/select is vertically separated with full-width controls.
- Long enum values use compact monospace select text.
- Source, Assessment, Relationship + identity and Benchmark groups receive consistent disclosure styling.
- Reset action is separated from explanatory copy.
- No-human-evidence statement is styled as a bounded callout.
- Latest assumed cells / Human evidence required / Design authority are three distinct status tiles.
- Trace table receives a bounded scroll container, sticky header and readable cell spacing.
- Narrow screens collapse fields/statuses/header actions to one column.
- AIV qualification stylesheet cache key is bumped to `aiv-qualification-14`.

## Changed-file ledger

| Path | Change | Purpose | Authority impact |
|---|---|---|---|
| `tabs/vibration-aiv-assumptions.css` | added | Dedicated assumption-panel presentation | None |
| `tabs/vibration-aiv-qualification.css` | modified | Import assumption CSS | None |
| `tabs/vibration-aiv-workspace-browser.js` | modified | Cache-bust qualification CSS | None |
| `tests/vibration-aiv-assumption-layout.test.mjs` | added | Pin layout/import/cache contract | Test only |
| `package.json` | modified | Include layout regression in AIV release suite | Test wiring only |
| `agents/PR497_workreport.md` | added | Living handoff | None |

## Negative assurance / authority boundary

Unchanged:

- `tabs/vibration-aiv-assumption-view.js` renderer and data attributes;
- `AIV_DEFAULT_ASSUMPTION_PROFILE` and all profile values;
- user-entered-table-value precedence over assumptions;
- enum choices and field paths;
- assumption acceptance/fingerprinting;
- readiness and execution gates;
- AIV numerical kernel and result contracts;
- benchmark qualification behavior;
- `Human evidence required = false` semantics;
- `Design authority = false` semantics;
- topology / physical-distance authority;
- exports and persistence.

## Validation ledger

| Check | Status | Observation | Oracle |
|---|---|---|---|
| Current-main grounding | PASS | Branch created from `main@ffbbecdadf83a16ef4e48e62946cea05d1a4e8c6` | GitHub |
| Main drift at implementation validation | PASS | `main` remained `ffbbecdadf83a16ef4e48e62946cea05d1a4e8c6`; branch had no behind commits | GitHub |
| Changed-file scope | PASS | Presentation/import/cache/test wiring only | GitHub compare |
| Assumption renderer unchanged | PASS | No diff to `vibration-aiv-assumption-view.js` | GitHub compare |
| Dedicated CSS import | PASS | Qualification CSS imports `vibration-aiv-assumptions.css?v=1` | Source inspection |
| Cache visibility | PASS | Browser loader requests `aiv-qualification-14` | Source inspection |
| Regression release wiring | PASS | New test is part of `verify:aiv-eit-export` and therefore `verify:aiv-canvas-release` | Source inspection |
| Hosted AIV run `31824083785` / job `94843958586` | NOT_RUN / INFRASTRUCTURE_BLOCKED | Exact implementation head; `steps=[]`, `runner_id=0` | GitHub Actions metadata |
| Hosted topology run `31824083780` / job `94843958621` | NOT_RUN / INFRASTRUCTURE_BLOCKED | Exact implementation head; `steps=[]`, `runner_id=0` | GitHub Actions metadata |
| Native focused Node test | NOT_RUN | No native checkout/runtime in connector-only path | NONE |
| Native AIV release suite | NOT_RUN | No native checkout/runtime in connector-only path | NONE |
| Real-browser desktop visual acceptance | NOT_RUN | Browser interaction unavailable in connector-only path | NONE |
| Real-browser narrow-screen acceptance | NOT_RUN | Browser interaction unavailable in connector-only path | NONE |

## Active items

- `IMP-001` IMPLEMENTED — missing-data assumptions now have a dedicated responsive presentation layer.
- `IMP-002` IMPLEMENTED — trace table and status summary have explicit readable layouts.
- `IMP-003` IMPLEMENTED — cache-bust and regression wiring added.
- `RISK-001` OPEN — real-browser visual verification remains required before claiming UI PASS.
- `RISK-002` OPEN — hosted Actions are infrastructure-blocked and must remain NOT_RUN, not PASS.

## Appendix A

NOT_REQUIRED — presentation-only STANDARD UI work; no engineering-method implementation authority is involved.
