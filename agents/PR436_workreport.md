# Engineering Calculation Console — PR #436 Work Report

## 0. PR Mission Control

| Field | Current state |
|---|---|
| Mission | Deliver the production Engineering Calculation Console as a pure UI consumer of the centralized Engineering Calculation API. |
| Source task / issue | Owner request 2026-08-11; frozen contracts/roadmap; stacked on PR #435. |
| PR number | #436 |
| Branch | `agent/engineering-calculation-console` |
| Base commit | `88782cf95b91b7be8bb5ab1d9464bce3fc60048a` (#435 head) |
| Current HEAD | `8fd5db26e06627f8dfef2dd8420fd1b9541566ab` before this report update |
| PR status | OPEN / DRAFT / mergeable / stacked on #435 |
| Current stage | Stage 7 — COMPLETE: validation + reconciliation |
| Last completed stage | Stage 7 — Focused validation + reconciliation |
| Engineering status | IMPLEMENTED — Console vertical capability complete; no engineering authority moved into UI |
| Validation status | Local authored-module checks PASS; exact-checkout/browser run NOT_RUN |
| Current blocker | Parent #435 validation/merge gate must close before this PR can be retargeted to `main`. |
| Exact next action | Validate #435 in a normal checkout; merge #435 if green; retarget #436 to `main`; run committed Console tests and browser smoke. |

### Handover in 60 Seconds

**What is now true:** the Engineering navigation contains `Engineering Calculations`. The Console discovers all registry entries, renders definition-declared inputs and units, exposes single/Sandbox modes, calls central Validate/Resolve/Calculate/Batch APIs, renders Results/Checks/Basis/Evidence, and keeps blocked calculators visible but non-executable with their qualification issue.

**What is currently being worked on:** no further coding in #436.

**What remains unfinished:** exact repository checkout execution of the committed Console tests and browser visual/runtime smoke; both depend on a normal checkout. Parent #435 is still draft/unmerged.

**What must not be assumed:** blocked calculators have formulas; UI owns accepted units or limits; prior results remain valid after input changes; #435 has passed its live-domain integration test.

**Highest-risk remaining item:** parent API integration evidence (#435) and browser execution evidence for this stacked UI.

**Exact next recommended action:** close #435’s validation gate first, then retarget and validate #436 on `main`.

## 1. Mission and Engineering Intent

The Console is a presenter/orchestrator only. Engineering equations, applicability, qualification and result semantics stay in registered central/domain APIs.

### Completed capability
- `Engineering Calculations` navigation entry via existing Engineering extension.
- Family/calculator catalogue driven by `listEngineeringCalculations()` / `listEngineeringCalculationFamilies()`.
- Generic form rendering for number/integer/boolean/string/enum/object/table/vector3 fields.
- Quantity unit editor initialized only from each definition’s `canonicalUnit`; no UI-owned accepted-unit table.
- Definition-declared `engineeringDefault` values shown explicitly.
- Validate / Resolve / Calculate calls through the central API.
- Single and Sandbox execution modes using the same calculation ID/kernel.
- Results, Checks, Basis, Qualification, Provenance and Evidence views.
- Batch JSON editor using `calculateEngineeringBatch()` and current-request append.
- Blocked calculations remain visible, show qualification issue/state, and disable direct execution.
- Stale single-calculation evidence is invalidated whenever input, unit, execution mode or qualification mode changes.

### Explicit non-goals
No equations, allowables, hidden engineering defaults, family activation, authority promotion, B31.3/empirical kernel changes, calculator-specific diagrams or CI workflows.

## 2. Mission Status

| Work Item | Priority | Status | Stage | Evidence |
|---|---:|---|---|---|
| Report / PR / baseline | P0 | DONE | 1–3 | clean report-only baseline |
| Console state/request model | P0 | VALIDATED | 4 | local tests |
| Production Console + navigation | P0 | IMPLEMENTED | 5 | 5 production UI files + extension |
| Sandbox / batch / results / evidence | P0 | IMPLEMENTED | 6 | same central API path |
| Focused validation / reconciliation | P0 | DONE | 7 | 9-file GitHub reconciliation |
| Exact checkout Console tests | P0 | NOT_RUN | 7 | environment limitation |
| Browser smoke / visual QA | P1 | NOT_RUN | 7 | no runnable checkout/browser session |

## 3. Engineering Item Register

| ID | Type | Priority | Status | Summary | Closure evidence |
|---|---|---|---|---|---|
| ISS-001 | Defect | P0 | DONE | Blank optional object/table draft became JSON string `""`. | Draft helper now preserves blank/omits optional field; regression test. |
| ISS-002 | Defect | P0 | DONE | Editing inputs/mode could leave stale prior result visible. | `invalidateEngineeringConsoleExecution()` clears validation/resolution/result on mutations; regression test. |
| DEC-001 | Decision | P0 | ACCEPTED | UI imports calculation behavior only from central Engineering Calculation API. | Static source guard. |
| DEC-002 | Decision | P0 | ACCEPTED | Work remains stacked on #435 until parent validation/merge. | PR base is `agent/engineering-calc-core`. |
| DEC-003 | Decision | P0 | ACCEPTED | Unit editor uses declared `canonicalUnit`; no UI accepted-unit authority. | Model/view source. |
| DEC-004 | Decision | P0 | ACCEPTED | Existing Engineering lazy-tab extension remains integration point. | `core/engineering-tabs-extension.js`. |
| RISK-001 | Risk | High | MITIGATED | UI could become second engineering kernel. | No direct B31.3/empirical imports; central-only static guard. |
| RISK-002 | Risk | Medium | MITIGATED | Blocked methods could look executable. | Disabled actions + blocked banner + issue number. |
| RISK-003 | Risk | Medium | MITIGATED | Malformed JSON could silently coerce. | Parser fails visibly; test coverage. |
| IMP-001 | Improvement | P1 | DEFERRED | Calculator-specific geometry/diagrams. | Future vertical calculator PRs. |

## 4. Stage Roadmap

| Stage | Status | Purpose | Primary output |
|---|---|---|---|
| 1 | COMPLETE | Report initialization | living report |
| 2 | COMPLETE | PR allocation / rename | #436 |
| 3 | COMPLETE | Baseline verification | report-only diff |
| 4 | COMPLETE | Pure Console model | model + tests |
| 5 | COMPLETE | Production Console / navigation | usable single-calc UI |
| 6 | COMPLETE | Sandbox / batch / evidence | complete generic Console |
| 7 | COMPLETE | Validation / reconciliation | handover state |

## Stage Execution Log

### Stages 1–3
Report-before-code protocol followed. #436 allocated, temporary report removed, GitHub confirmed report-only baseline. Existing Engineering extension selected instead of modifying frozen standalone runtime registry. **COMPLETE.**

### Stage 4 — Console request/form model
Added `engineering-calculation-console-model.js` plus focused test. Covers definition-derived drafts, typed parsing, Sandbox request construction, batch parsing, executable-state detection and result labels. Initial test found ISS-001 and it was fixed. Local pure suite initially 5/5 PASS and later 6/6 after ISS-002 regression was added. **COMPLETE.**

### Stage 5 — Production Console
Added controller, renderer sections/view, stylesheet and Engineering navigation entry. Console imports central registry/validate/resolve/calculate/batch APIs only. Required enums have explicit `Select…` state. Blocked deep links open on Basis and direct actions are disabled. **COMPLETE.**

### Stage 6 — Sandbox / batch / evidence
Single/Sandbox modes share request builder and calculation ID. Batch appends only executable current requests but permits pasted batch content to be evaluated by the central batch API. Results display API outputs/checks only; Evidence displays returned qualification/provenance/evidence. **COMPLETE.**

### Stage 7 — Validation / reconciliation
Controller review found ISS-002; added explicit execution-state invalidation for field/unit/mode/qualification changes. Local authored-file checks:

- `node --check` Console model: PASS
- `node --check` Console sections: PASS
- `node --check` Console view: PASS
- `node --check` Console controller: PASS
- combined local model/static presentation tests: **10/10 PASS**
- module sizes: model 150 lines; sections 55; view 38; controller 217 — all below 300 lines.

The local static run used exact authored Console files and an equivalent minimal fixture for the Engineering extension registration; GitHub source inspection separately confirms the real extension contains the same `engineering-calculations` lazy registration. The committed repository tests have **not** been executed in an exact checkout due the same network/checkout limitation as #435. Browser runtime/visual QA is also NOT_RUN. **COMPLETE with explicit evidence limitation.**

## 5. Changed-File Ledger

| File | Purpose | Engineering-sensitive? | Validation |
|---|---|---|---|
| `agents/PR436_workreport.md` | living report | No | current |
| `core/engineering-tabs-extension.js` | Engineering Console nav/lazy load | No | source/static inspection |
| `tabs/engineering-calculation-console-model.js` | pure draft/request/state helpers | Yes | local tests PASS |
| `tabs/engineering-calculation-console-sections.js` | definition/result presenter sections | Yes | syntax/static PASS |
| `tabs/engineering-calculation-console-view.js` | page composition | No | syntax/static PASS |
| `tabs/engineering-calculations-tab.js` | central API UI controller | Yes | syntax/static PASS |
| `tabs/engineering-calculations.css` | responsive Console styles | No | source inspection |
| `tests/engineering-calculation-console-model.test.mjs` | model/invalidation regression | No | local equivalent PASS |
| `tests/engineering-calculation-console-static.test.mjs` | central-only/blocking presentation guard | No | local equivalent PASS |

**GitHub changed-file reconciliation:** PASS — exactly 9 files, no unexplained file, no workflow changes, no domain formula/master changes.

## 6. Engineering Decisions and Invariants

- UI never computes engineering outputs, utilization, checks or pass/fail.
- UI never imports B31.3 or empirical domain kernels directly.
- Engineering defaults come only from definition metadata and are displayed.
- Blocked calculations cannot execute through current-request actions.
- Sandbox is a caller mode, not another formula path.
- Batch uses central batch API.
- Qualification/provenance/evidence are rendered from API responses.
- Any input/unit/mode/qualification mutation invalidates stale single-result state.
- Malformed object/table JSON remains a visible editor error.

## 7. Validation and Evidence Ledger

### Software validation
| Check | Status | Evidence |
|---|---|---|
| Authored Console JS syntax | PASS | local `node --check` |
| Pure request/model tests | PASS | local 6 cases |
| Static/presentation guards | PASS | local 4 cases; actual extension registration confirmed via GitHub source |
| Combined local Console tests | PASS | 10/10 |
| Exact checkout committed tests | NOT_RUN | checkout unavailable |
| Browser runtime / visual smoke | NOT_RUN | no local runnable app |

### Engineering validation
| Property | Status | Evidence |
|---|---|---|
| No UI engineering equations | PASS | central-only import/static inspection |
| Blocked items fail closed in UI | PASS | disabled direct actions + blocked view test |
| Definition defaults/units remain visible | PASS | model/view tests |
| Stale result invalidation | PASS | ISS-002 regression |
| Real central B31.3/empirical browser execution | NOT_RUN | depends on parent #435 exact-checkout evidence/browser |

## 8. Known / Deferred Work + Forward Sequence

1. Run #435 exact integration test in a normal checkout.
2. If green, mark #435 ready/review/merge.
3. Retarget #436 from `agent/engineering-calc-core` to `main`.
4. Reconcile #436 diff again; it should remain exactly the 9 Console files above.
5. Run in exact checkout:
   - `node --test tests/engineering-calculation-console-model.test.mjs`
   - `node --test tests/engineering-calculation-console-static.test.mjs`
6. Browser smoke: open Engineering → Engineering Calculations; exercise B31.3 Material Design, B31.3 Thickness, Empirical Weight, blocked FIV, Sandbox and mixed Batch.
7. Only then mark #436 ready/merge.

## Next-Agent Handover

- **Current stopping point:** Console source complete; validation/retarget waits on #435.
- **PR / branch / HEAD:** #436 / `agent/engineering-calculation-console` / source head `8fd5db26e06627f8dfef2dd8420fd1b9541566ab` before this report update.
- **Last completed stage:** Stage 7.
- **Start here:** parent PR #435 validation gate; do not redesign Console first.
- **Do not redo:** central-only UI architecture, generic form model, blocked UX or stale-result invalidation unless exact tests expose a defect.
- **Do not assume:** parent core is merged, browser smoke passed, or blocked calculations contain formulas.
- **Known failing checks:** none known; exact-checkout/browser checks are NOT_RUN.
- **Highest-risk remaining item:** parent #435 live integration evidence.
- **Exact next action:** execute `node --test tests/engineering-calculation-core.test.mjs` on #435 in a normal checkout.

## PR Closure Record

| Closure Criterion | Result |
|---|---|
| Mission coding completed | YES |
| Engineering items dispositioned | YES |
| Changed files reconciled | YES — 9/9 |
| Local focused validation | PASS |
| Exact checkout validation | NOT_RUN |
| Browser validation | NOT_RUN |
| Unexplained changes | NONE |
| Deferred improvements recorded | YES |
| Handover current | YES |
| New CI workflows added | NO |
