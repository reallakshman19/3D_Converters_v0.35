# PR494 — AIV Vertical Scroll Work Report

## Recovery header

| Field | Current state |
|---|---|
| Mission | Add vertical scrolling to the AIV workspace without changing engineering state, calculation authority, topology, persistence, or exports. |
| Work intent | IMPLEMENT |
| Criticality | STANDARD — presentation/layout only. |
| PR | `#494` — OPEN / OWNER-AUTHORIZED FOR MERGE |
| Branch | `agent/aiv-vertical-scroll` |
| Current grounded main | `102640e247fb97f854627866ed5ce1703a340d96` |
| Reconciliation checkpoint | `7c853fba6a5800e0a065a94d6cf4ac07bc8f46b4` |
| Base drift after reconciliation | `ahead_by=10`, `behind_by=0` |
| Coordination | SAFE — the newer main commit is PR493 FIT UI work and does not overlap the six PR494 paths. |
| REPORT_BASIS_HEAD | `7c853fba6a5800e0a065a94d6cf4ac07bc8f46b4` |
| Merge authority | GRANTED by Owner on 2026-08-14 (`merge`). |
| EXACT_NEXT_ACTION | Re-read live PR head/main and merge only the unchanged exact head using `expected_head_sha`; preserve validation truth as NOT_RUN where execution never occurred. |

## Handover in 60 Seconds

The app shell intentionally sets `#tab-content`, persistent tab panels, `.app-shell`, and `.app-content` to `overflow:hidden`. AIV previously had no vertical overflow owner, so long workbench content could be clipped. PR494 fixes only the AIV presentation layer: `tabs/vibration-aiv-scroll.css` makes `.aivq-root` a flex-filling scroll container using `min-height:0` and `overflow-y:auto`. Global `styles/tabs.css` is intentionally unchanged.

The AIV stylesheet aggregator imports the new scroll layer after existing AIV styles, and `vibration-aiv-workspace-browser.js` bumps the qualification stylesheet cache key to `aiv-qualification-13`. A focused static regression pins the shell/AIV overflow ownership and cache-bust path, and is included in `verify:aiv-canvas-release` through `verify:aiv-eit-export`.

While PR494 was awaiting merge authorization, `main` advanced by one commit to `102640e...` through PR493. That commit is FIT UI/report/test work; no PR494 path overlaps it. PR494 was reconciled with a two-parent merge checkpoint `7c853fba...`, preserving both histories and producing `ahead_by=10`, `behind_by=0` against current main.

Hosted workflows on the pre-reconciliation implementation/handoff heads were created but did not execute any steps:

```text
Vibration AIV Controlled Source Qualification
run 31813339002 / job 94808971803 / steps=null
later run 31813415021 / zero-step failure

Topology Edit Support Reprojection
run 31813338928 / job 94808971517 / steps=null
later run 31813414997 / zero-step failure
```

Classification: `NOT_RUN / INFRASTRUCTURE_BLOCKED`; none of these are product-test FAIL or PASS.

## Authority / negative assurance

Unchanged:

- AIV numerical kernel and equations;
- screening/readiness/assumption gates;
- `screeningResultScope = ASSESSMENT`;
- `designAuthority=false`;
- topology and physical-distance authority;
- working-table authority;
- persistence and engineering exports;
- SVG presentation/engineering boundary.

No global tab-shell CSS was modified.

## Changed-file ledger

| Path | Change | Purpose |
|---|---|---|
| `tabs/vibration-aiv-scroll.css` | added | AIV-local vertical scroll ownership. |
| `tabs/vibration-aiv-qualification.css` | modified | Import scroll layer after current AIV styles. |
| `tabs/vibration-aiv-workspace-browser.js` | modified | Bump stylesheet URL cache key so browsers load the new import. |
| `tests/vibration-aiv-scroll-layout.test.mjs` | added | Pin scroll ownership and cache-bust contract. |
| `package.json` | modified | Include scroll regression in existing AIV release suite. |
| `agents/PR494_workreport.md` | added | Recovery-first handoff. |

Pre-edit recovery blobs for existing files:

```text
tabs/vibration-aiv-qualification.css    d10a69d1b3c61e2754f314c43513a246f5d0366e
tabs/vibration-aiv-workspace-browser.js d622e4d3b79c02535e37053b11b372fc4cb8535e
package.json                             d8e22212022b73f72525122c6cc380077c7f20b6
```

The repository backup CLI could not be executed because this connector workflow has no native checkout; exact immutable Git blobs above are the recovery anchors.

## Validation ledger

| Check | Status | Observation | Oracle |
|---|---|---|---|
| Ground current main | PASS | `main@102640e...` | NONE |
| Main-drift reconciliation | PASS | two-parent checkpoint; `ahead=10`, `behind=0`; no exact-file overlap with PR493 | NONE |
| Root-cause isolation | PASS | Global shell clips panels; AIV root lacked vertical overflow | IMPLEMENTATION_COUPLED |
| Scope/changed-file reconciliation | PASS | exactly six AIV presentation/test/report paths | NONE |
| Focused regression present and release-wired | PASS | GitHub source inspection | IMPLEMENTATION_COUPLED |
| Hosted AIV workflow | NOT_RUN / INFRASTRUCTURE_BLOCKED | zero-step jobs | IMPLEMENTATION_COUPLED |
| Hosted topology workflow | NOT_RUN / INFRASTRUCTURE_BLOCKED | zero-step jobs | IMPLEMENTATION_COUPLED |
| Native `npm run verify:aiv-canvas-release` | NOT_RUN | No native checkout in this connector runtime | IMPLEMENTATION_COUPLED |
| Real-browser vertical scroll | NOT_RUN | Browser acceptance unavailable here | NONE |

## Active items

- `IMP-001` CLOSED — AIV root now owns vertical scroll.
- `RISK-001` CONTROLLED — global tab shell unchanged.
- `RISK-002` OPEN — native/browser execution remains pending and is not reclassified by merge authorization.

## Appendix A

NOT_REQUIRED — STANDARD presentation-only change; no engineering-critical implementation takeover is involved.
