# PR496 — Generic Module Vertical Scroll Repair

## Recovery header

| Field | Current state |
|---|---|
| Mission | Replace the failed AIV-local vertical-scroll fix with one generic app-shell scroll contract covering all modules, explicitly including AIV and FIT. |
| Work intent | IMPLEMENT / DEFECT REPAIR |
| Criticality | STANDARD — presentation/layout only. |
| PR | `#496` — OPEN / OWNER-AUTHORIZED / NOT MERGED at this checkpoint |
| Branch | `agent/generic-module-vertical-scroll` |
| Grounded base | `main@fd573ad8033c13bcd646eacaa807b4e45700de35` |
| User-observed result | Merged PR494 vertical scroll fix FAILED in actual UI. |
| FIT requirement | Include `Flow-Induced Vibration Screening — FIT Workbook Reference`. |
| Generic requirement | Apply scrolling through the shared app shell rather than per-product CSS. |
| Authority impact | NONE — layout only. |
| Merge authority | **AUTHORIZED** by Owner at 2026-08-14T16:51:16Z (`merge`). |
| Exact-head hosted workflows | AIV, Topology, and FBX Live UI all completed with `steps=[]`, `runner_id=0`; classified `NOT_RUN / INFRASTRUCTURE_BLOCKED`. |
| EXACT_NEXT_ACTION | Re-read live `main`, verify exact PR head remains unchanged and mergeable, then squash merge with `expected_head_sha`; do not relabel blocked runtime/browser gates as PASS. |

## Failure analysis — PR494

PR494 assigned `overflow-y:auto` to `.aivq-root`. Source trace shows the AIV root is nested below auto-height engineering containers, while `.app-content` is the first bounded viewport container and deliberately used `overflow:hidden` in the base shell. The nested AIV root therefore never had to become shorter than its content; it expanded with the content and the bounded outer shell clipped it first.

The original PR494 regression was declaration-based: it proved that `.aivq-root` contained `overflow-y:auto`, but did not prove that `.aivq-root` was a bounded scroll box. The user’s real UI validation correctly exposed this false positive.

## Generic architecture correction

The repair moves vertical overflow ownership to the shared application shell:

`app-shell`
`-> app-content  [bounded generic vertical scroll owner]`
`-> any standalone module renderer`

Engineering modules use the same `.app-content` container through `engineering-tabs-extension.js`, so nested product surfaces automatically inherit the shell scroll contract:

`app-content`
`-> engineering-workspace`
`-> engineering calculations console`
`-> FIT host OR AIV host`

No product-specific vertical viewport owner is required.

### Generic behavior and CSS cascade

The base shell intentionally contains two clipping declarations:

- `styles/tabs.css`: `.app-content { overflow:hidden; }`
- `styles/app-shell-header-fix.css`: `body .app-content { overflow:hidden; }`

The second selector is more specific than the first repair draft. Therefore `styles/app-content-scroll.css` now deliberately uses the equal-specificity selector `body .app-content` and is loaded **after all existing global/tab styles** from `index.html` (`?v=2`). This ensures the intended vertical override actually wins the cascade instead of being silently defeated.

Final generic scroll contract:

- `min-height:0`;
- `overflow-x:hidden`;
- `overflow-y:auto`;
- `overscroll-behavior-y:contain`;
- `scrollbar-gutter:stable`.

Legacy persistent `[data-tab-panel]` surfaces receive the same default rule.

### FIT and AIV coverage

The generic regression pins:

- both base clipping declarations, including the later/higher-specificity `body .app-content` rule;
- generic stylesheet load order after `app-shell-header-fix.css`;
- equal-specificity `body .app-content` override;
- all standard standalone renderers receive the same `content` (`.app-content`) container;
- Engineering extension resolves `.app-content` as its content host;
- `data-fit-workspace-host` exists below the Engineering Console;
- `data-aiv-qualification-host` exists below the same console;
- the FIT registry name exactly matches `Flow-Induced Vibration Screening — FIT Workbook Reference`;
- AIV product-local CSS no longer declares competing `overflow-y:auto` viewport ownership.

## Changed-file ledger

| Path | Change | Purpose | Authority impact |
|---|---|---|---|
| `styles/app-content-scroll.css` | added | Generic shell vertical-scroll contract with cascade-safe specificity | None |
| `index.html` | modified | Load generic scroll layer last and cache-bust with `v=2` | None |
| `tabs/vibration-aiv-scroll.css` | modified | Remove ineffective nested AIV vertical-scroll ownership | None |
| `tests/app-content-scroll-layout.test.mjs` | added | Generic scroll architecture/cascade regression including FIT + AIV | Test only |
| `tests/vibration-aiv-scroll-layout.test.mjs` | removed | Retire false-positive AIV-only regression | Test only |
| `package.json` | modified | Wire generic regression into AIV release suite | Test wiring only |
| `scripts/verify-vibration-fit-release.mjs` | modified | Wire generic regression into FIT release suite | Test wiring only |
| `agents/PR496_workreport.md` | added | Recovery / validation / handoff record | None |

## Authority / negative assurance

Unchanged:

- AIV equations/kernel;
- AIV readiness, applicability and assumption gates;
- AIV result/authority contracts;
- FIT equations/correlations;
- FIT benchmark-only authority state;
- topology and physical-distance authority;
- working input state;
- persistence and engineering exports.

This PR changes only viewport/layout overflow ownership and regression wiring.

## Validation ledger

| Check | Status | Observation | Oracle |
|---|---|---|---|
| User validation of PR494 | FAIL | Vertical scrolling did not work in real UI | USER_SUPPLIED |
| PR494 root-cause source trace | PASS | Nested `.aivq-root` was not a bounded scroll box | SOURCE_INSPECTION |
| Generic shell source architecture | PASS | `.app-content` is bounded and shared by normal standalone modules; Engineering extension uses same host | SOURCE_INSPECTION |
| CSS cascade reconciliation | PASS | Later `body .app-content { overflow:hidden }` found; generic rule now has equal specificity and later load order | SOURCE_INSPECTION |
| FIT path source trace | PASS | FIT product host and exact workbook-reference definition are pinned by generic regression | SOURCE_INSPECTION |
| AIV path source trace | PASS | AIV product host is pinned; local competing vertical owner removed | SOURCE_INSPECTION |
| Generic regression wired to AIV release suite | PASS | `package.json` includes `tests/app-content-scroll-layout.test.mjs` | SOURCE_INSPECTION |
| Generic regression wired to FIT release suite | PASS | `verify-vibration-fit-release.mjs` includes the same test | SOURCE_INSPECTION |
| Hosted AIV workflow | NOT_RUN / INFRASTRUCTURE_BLOCKED | run `31820765486`, job `94833174230`, `steps=[]`, `runner_id=0` | IMPLEMENTATION_COUPLED |
| Hosted topology workflow | NOT_RUN / INFRASTRUCTURE_BLOCKED | run `31820765604`, job `94833174654`, `steps=[]`, `runner_id=0` | IMPLEMENTATION_COUPLED |
| Hosted FBX Live UI workflow | NOT_RUN / INFRASTRUCTURE_BLOCKED | run `31820765570`, job `94833174554`, `steps=[]`, `runner_id=0` | IMPLEMENTATION_COUPLED |
| Native `node --test tests/app-content-scroll-layout.test.mjs` | NOT_RUN | No native authenticated checkout in connector-only runtime | IMPLEMENTATION_COUPLED |
| Native `npm run verify:aiv-canvas-release` | NOT_RUN | No native authenticated checkout in connector-only runtime | IMPLEMENTATION_COUPLED |
| Native `npm run verify:vibration-fit-release` | NOT_RUN | No native authenticated checkout in connector-only runtime | IMPLEMENTATION_COUPLED |
| Real-browser all-module vertical scrolling | NOT_RUN | Browser interaction acceptance unavailable in connector-only runtime | NONE |

## Active items

- `ISS-001` CLOSED IN SOURCE — failed nested AIV scroll ownership removed.
- `ISS-002` CLOSED IN SOURCE — later higher-specificity shell clipping override identified and defeated correctly.
- `IMP-001` IMPLEMENTED — generic `.app-content` vertical scroll owner added.
- `IMP-002` IMPLEMENTED — FIT and AIV both pinned to generic contract.
- `IMP-003` IMPLEMENTED — generic regression wired into AIV and FIT release suites.
- `RISK-001` OPEN — real browser acceptance is still required before claiming interaction PASS.
- `RISK-002` CONTROLLED — exact-head hosted Actions are infrastructure-blocked; zero-step jobs remain `NOT_RUN`, not product FAIL or PASS.

## Appendix A

NOT_REQUIRED — STANDARD presentation/layout defect repair; no engineering-critical implementation authority is involved.
