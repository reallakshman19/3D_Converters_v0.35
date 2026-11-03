# Engineering Calculation Core — PR #435 Work Report

## 0. PR Mission Control

| Field | Current state |
|---|---|
| Mission | Implement the centralized Engineering Calculation Platform core against `engineering-calculation-contract/v1`, with real B31.3 and empirical-weight integrations and explicit fail-closed placeholders for unqualified planned methods. |
| Source task / issue | Owner request 2026-08-11; `docs/APIEngineeringCalcContracts.md`; `docs/APIEngineeringCalcRoadmap.md`; qualification issues #428–#434. |
| PR number | #435 |
| Branch | `agent/engineering-calc-core` |
| Base commit | `7a05c78413592dade410595775a9b0f7dd104bf0` |
| Final production-code HEAD before this closure-report commit | `17392548abdac895edb82cc103583668ee0af70b` |
| PR status | OPEN / DRAFT / mergeable |
| Current stage | Stage 9 — COMPLETE: reconciliation / handover |
| Last completed stage | Stage 9 — Final reconciliation / closure state |
| Engineering status | IMPLEMENTED — core production capability complete; no authority promotion |
| Validation status | PARTIAL — executed focused core/adapter suites PASS; committed live-domain suite NOT_RUN in current runtime |
| Current blocker | No coding blocker. Review/merge should account for the explicitly unexecuted repository integration suite. |
| Exact next action | In a real checkout, run `node --test tests/engineering-calculation-core.test.mjs`; if green, review #435 for readiness/merge. |

### Handover in 60 Seconds

**What is now true:** the central v1 Engineering Calculation API is implemented. The default catalogue contains **22 definitions: 3 executable + 19 qualification-blocked**. Executable definitions are `PIPE.B313.THICKNESS`, `PIPE.B313.MATERIAL_DESIGN`, and `ESTIMATION.WEIGHT.EMPIRICAL`. All issues #428–#434 are represented by explicit blocked future-method entries. Single, validate, resolve, Sandbox and batch routes share the same registry/engine.

**What is currently being worked on:** no further coding in this PR. Closure/reporting is complete.

**What remains unfinished:** the committed repository-level live-domain test has not executed in this container because no repository checkout/GitHub DNS path is available. The full repository regression suite is also not run.

**What must not be assumed:** blocked FIV/AIV/trunnion/etc. definitions contain formulas; they do not. B31.3 execution is not design-authorized by this PR. Empirical results are not design authority. No family method qualification has been promoted.

**Highest-risk remaining item:** `RISK-004` — final repository-level execution evidence remains unavailable in this runtime.

**Exact next recommended action:** execute the focused test in a normal checkout, then mark the draft PR ready only if the result is acceptable.

---

## 1. Mission and Engineering Intent

### Mission
Deliver a real centralized engineering API—not a metadata-only framework—while preserving domain formula authority and qualification boundaries.

### Engineering/user consequence
A caller can now discover calculators, validate/resolve declared inputs, normalize units, execute single/Sandbox/batch requests, inspect provenance/qualification/evidence, and retain immutable results through one public API. Existing B31.3 and empirical-weight APIs remain directly callable and are reused rather than duplicated.

### Completed scope
- contract/result/batch version constants and stable error helpers;
- deterministic calculation registry;
- quantity-aware canonical unit conversion including affine temperature and gauge/absolute pressure protection;
- input resolution, range/type validation, engineering-default provenance, custom resolver/validator hooks;
- method/data/effective qualification composition;
- immutable central result/failure envelopes;
- single execution and batch execution through one engine;
- B31.3 direct-factor thickness/provided-wall adapter;
- B31.3 governed material-factor + optional wall-selection adapter;
- empirical FINAL/EXACT/A1/A2 adapter with Sandbox-only candidate model/master injection;
- default registry and frozen public v1 entrypoints;
- qualification-gated planned-method catalogue for #428–#434;
- focused repository integration test.

### Explicit non-goals retained
No new external-pressure, branch-reinforcement, shell-indentation, FIV, AIV, SBC, cavitation, surge, slug, relief, trunnion, shoe, API/NEMA, flange, GRE, or blast numerical methods; no B31.3/empirical formula changes; no authority promotion; no full Engineering Calculation Console; no CI workflow additions.

---

## 2. Mission Status

| Work Item | Priority | Status | Stage | Evidence |
|---|---:|---|---|---|
| Work report / PR / baseline | P0 | DONE | 1–3 | #435 |
| Contract primitives / units / qualification / registry | P0 | VALIDATED | 4 | executed 5/5 focused suite |
| Input resolution / engine | P0 | VALIDATED | 5 | executed 5/5 focused suite |
| B31.3 adapters | P0 | VALIDATED | 6 | executed focused mapping tests |
| Empirical adapter / Sandbox guard | P0 | VALIDATED | 6 | executed focused mapping tests |
| Default registry / public API | P0 | IMPLEMENTED | 7 | source reconciliation |
| Blocked qualification catalogue | P1 | DONE | 7–8 | 19 blocked entries covering #428–#434 |
| Repository integration test authored | P0 | DONE | 8 | `tests/engineering-calculation-core.test.mjs` |
| Repository integration test executed | P0 | NOT_RUN | 8 | environment limitation RISK-004 |
| Changed-file reconciliation | P0 | DONE | 9 | 13 actual files = 13 ledger files |
| Final handover | P0 | DONE | 9 | this report |

---

## 3. Engineering Item Register

| ID | Type | Severity/Priority | Status | Summary | Closure evidence |
|---|---|---|---|---|---|
| ISS-001 | Defect | Medium/P0 | DONE | #428 PIPE candidates were initially omitted from blocked catalogue. | Added `PIPE.EXTERNAL_PRESSURE.CHECK`, `PIPE.BRANCH.REINFORCEMENT`, `PIPE.SHELL_INDENTATION`; identifiers reconciled to contract/roadmap. |
| DEC-001 | Decision | P0 | ACCEPTED | Central engine owns orchestration only; domain APIs own formulas. | No domain formula file appears in PR diff. |
| DEC-002 | Decision | P0 | ACCEPTED | Existing B31.3/empirical APIs remain direct and are reused. | Thin adapters import current APIs. |
| DEC-003 | Decision | P0 | ACCEPTED | Placeholder means BLOCKED/unavailable, never numerical. | 19 blocked definitions have empty input/output contracts and engine rejects before kernel. |
| DEC-004 | Decision | P0 | ACCEPTED | Separate `PIPE.B313.THICKNESS` and `PIPE.B313.MATERIAL_DESIGN`. | Both registered independently. |
| DEC-005 | Decision | P0 | ACCEPTED | Candidate empirical model/master data is Sandbox-only. | Adapter returns `INPUT_INVALID` outside Sandbox. |
| RISK-001 | Risk | High | ACCEPTED | Live-domain central/direct parity cannot be executed locally. | Repository test authored; prior stubbed adapter mapping tests PASS. |
| RISK-002 | Risk | High | MITIGATED | Gauge/absolute/native-unit semantics can be corrupted centrally. | Explicit pressure-reference guard and canonical adapter boundaries. |
| RISK-003 | Risk | Medium | MITIGATED | Hidden registry mutation/order could change authority. | Explicit deterministic registry/default construction. |
| RISK-004 | Risk | Medium | ACCEPTED | Runtime cannot clone/materialize repository; `gh` absent and GitHub DNS clone path unavailable. | Final live-domain/full-repo runs recorded NOT_RUN; no unsupported PASS claim. |
| IMP-001 | Improvement | P1 | DEFERRED | Engineering Calculation Console. | Follow-up roadmap item. |

---

## 4. Stage Roadmap

| Stage | Status | Purpose | Primary output |
|---|---|---|---|
| 1 | COMPLETE | Report initialization / findings | living work report |
| 2 | COMPLETE | PR allocation / report synchronization | PR #435 |
| 3 | COMPLETE | Baseline + domain API verification | clean pre-code state |
| 4 | COMPLETE | Contract primitives + deterministic registry | 4 core modules |
| 5 | COMPLETE | Input resolution + central engine | 2 core modules |
| 6 | COMPLETE | Real production adapters | B31.3 x2 + empirical |
| 7 | COMPLETE | Default public API + blocked catalogue | v1 public surface |
| 8 | PARTIAL | Consolidated validation / corrections | committed integration suite; ISS-001 fixed; live run NOT_RUN |
| 9 | COMPLETE | Changed-file reconciliation / handover | final report |

---

## Stage Execution Log

### Stages 1–3 — setup and source truth
Report created before production edits; PR #435 allocated; temporary pending report removed; frozen contract/Common CodingRules/current B31.3/current empirical APIs inspected. B31.3 direct-factor and material-resolved paths intentionally split. **COMPLETE.**

### Stage 4 — common contract/registry
Added `contracts.js`, `units.js`, `qualification.js`, `registry.js`. Includes immutable snapshots, unit conversions, pressure-reference protection, conservative effective qualification, validated deterministic definitions. Executed focused suite: **5/5 PASS**. **COMPLETE.**

### Stage 5 — input resolution/engine
Added `input-resolution.js`, `engine.js`. Structural/range/unit validation happens before kernel; blocked methods do not invoke kernel; engine does not synthesize domain assessment; batch reuses single path; results immutable. Executed focused suite: **5/5 PASS**. **COMPLETE.**

### Stage 6 — real adapters
Added `adapters/b313.js`, `adapters/empirical-weight.js`. Domain modules untouched. B31.3 central paths preserve non-design-authority status. Empirical FINAL/EXACT/A1/A2 maps existing estimator outputs; candidate data requires Sandbox. Executed mapping suite: **4/4 PASS**. **COMPLETE.**

### Stage 7 — public surface/catalogue
Added `pending-definitions.js`, `default-registry.js`, `index.js`. Public functions match frozen v1: family/list/definition/qualification, validate/resolve, single/batch, registry/engine factories. Initially 16 blocked entries (#429–#434). **COMPLETE with Stage-8 correction.**

### Stage 8 — consolidated validation / correction
Added `tests/engineering-calculation-core.test.mjs`. Test cases cover catalogue, retained B31.3 A106 benchmark, B31 provided-wall semantics, empirical direct-vs-central parity, Sandbox-only candidates, blocked FIV/PIPE entries, independent validate/resolve unit normalization, and mixed batch.

Final issue reconciliation found `ISS-001`; fixed catalogue by adding #428 PIPE entries. Governing ID reconciliation confirmed:
- contract: `PIPE.EXTERNAL_PRESSURE.CHECK`;
- contract: `PIPE.BRANCH.REINFORCEMENT`;
- roadmap: `PIPE.SHELL_INDENTATION`.

The repository integration test **could not be executed in this runtime**. GitHub combined-status lists are empty at the inspected implementation head; no CI result is available. **Stage decision: PARTIAL solely due missing execution evidence; coding/corrections complete.**

### Stage 9 — final reconciliation
GitHub actual changed-file list reconciled exactly to the ledger: **13 files**, no unexplained file, no `.github/workflows/*`, no domain formula/master file, and no temporary `PR_PENDING` report. PR is open, draft, mergeable. **COMPLETE.**

---

## 5. Changed-File Ledger

| File | First Stage | Latest Stage | Purpose | Engineering-sensitive? | Validation |
|---|---:|---:|---|---|---|
| `agents/PR435_workreport.md` | 1 | 9 | living work state/handover | No | reconciled |
| `converters/engineering-calculations/contracts.js` | 4 | 4 | versions/errors/immutable snapshot primitives | Yes | focused PASS |
| `converters/engineering-calculations/units.js` | 4 | 4 | canonical unit conversion/reference semantics | Yes | focused PASS |
| `converters/engineering-calculations/qualification.js` | 4 | 4 | method/data/effective authority composition | Yes | focused PASS |
| `converters/engineering-calculations/registry.js` | 4 | 4 | deterministic validated registry | Yes | focused PASS |
| `converters/engineering-calculations/input-resolution.js` | 5 | 5 | input canonicalization/provenance/validation | Yes | focused PASS |
| `converters/engineering-calculations/engine.js` | 5 | 5 | orchestration/result/batch | Yes | focused PASS |
| `converters/engineering-calculations/adapters/b313.js` | 6 | 6 | real B31.3 definitions | Yes | mapping PASS; live test NOT_RUN |
| `converters/engineering-calculations/adapters/empirical-weight.js` | 6 | 6 | real empirical definition | Yes | mapping PASS; live test NOT_RUN |
| `converters/engineering-calculations/pending-definitions.js` | 7 | 8 | blocked planned-method catalogue | Yes | source/ID reconciliation PASS |
| `converters/engineering-calculations/default-registry.js` | 7 | 7 | default 22-definition registry | Yes | source reconciliation |
| `converters/engineering-calculations/index.js` | 7 | 7 | central v1 public API | Yes | contract-source reconciliation |
| `tests/engineering-calculation-core.test.mjs` | 8 | 8 | retained integration/parity/fail-closed tests | No | authored; execution NOT_RUN |

**GitHub changed-file reconciliation:** PASS — exactly the 13 files above.  
**Unexplained changed files:** none.  
**Temporary report:** absent.  
**Workflow changes:** none.

---

## 6. Engineering Decisions and Invariants

1. **Central orchestration is not engineering authority.** Enforced by adapter/domain separation; validated by PR diff.
2. **Direct APIs remain valid.** Central adapters call them; no duplicate B31.3/empirical formulas exist in this PR.
3. **No silent defaults.** Declared `engineeringDefault` values are represented as `ENGINEERING_DEFAULT` in resolved provenance.
4. **Blocked means unavailable.** Planned methods have no numeric output contract and are stopped by method gate.
5. **Pressure reference is not a scale conversion.** Gauge/absolute mismatch is rejected.
6. **Sandbox does not create a second empirical algorithm.** Same definition/estimator is used with explicitly injected candidate model/master.
7. **Batch uses single execution.** Each batch request calls the same `calculate()` path.
8. **Results are immutable snapshots.** Later state/master changes do not mutate retained results.
9. **Numerical success does not imply design authority.** Qualification object is explicit/conservative.

---

## 7. Validation and Evidence Ledger

### Software validation

| Validation | Status | Last relevant state | Evidence |
|---|---|---|---|
| Stage 4 common-core focused suite | PASS | Stage 4 exact files | 5/5 |
| Stage 5 engine focused suite | PASS | Stage 5 exact files | 5/5 |
| Stage 6 adapter mapping suite | PASS | Stage 6 exact adapters | 4/4 |
| Final focused repository integration suite authored | PASS | implementation head | test file committed |
| `node --test tests/engineering-calculation-core.test.mjs` | NOT_RUN | final branch | no local repo checkout/runtime path |
| Full repository regression suite | NOT_RUN | final branch | RISK-004 |
| GitHub status checks | NOT_RUN / none | implementation head `17392548...` | status list empty |

### Engineering validation

| Property | Status | Evidence |
|---|---|---|
| No new domain equations | PASS | changed-file reconciliation |
| Existing domain APIs have real central consumers | PASS | adapter imports/default registry |
| B31.3 retained benchmark assertion exists | PASS | focused repository test |
| B31.3 retained benchmark executed through central API | NOT_RUN | runtime limitation |
| Empirical direct-vs-central parity assertion exists | PASS | focused repository test |
| Empirical live parity executed | NOT_RUN | runtime limitation |
| Blocked families produce no numerical authority | PASS | engine method gate + definition source; generic blocked test executed in Stage 5 |
| Method/data authority promotion | NOT_APPLICABLE | none performed |

### Explicitly not validated
Numerical methods for all blocked placeholders; full Engineering Calculation Console; project/code design authorization; full repository regression compatibility.

---

## 8. Known Issues, Improvements, and Deferred Scope

### Open defects
None known in the implemented source after ISS-001 closure.

### Deferred improvements
- IMP-001: Engineering Calculation Console driven by registry metadata.
- Family method implementations after expert qualification issues #428–#434 are answered.

### Open/accepted risks
- RISK-004 / RISK-001 evidence limitation: live repository-level parity/regression must still run in a normal checkout.

### Recommended Forward Sequence
1. Run the focused test in a normal repo checkout. This is the immediate prerequisite to PR readiness.
2. Review/merge #435 only after acceptable execution evidence.
3. Build the Engineering Calculation Console against this API; do not add formulas to UI.
4. Resolve #428–#434 qualification questions.
5. Implement one vertical qualified calculator at a time, using blocked catalogue IDs as the activation targets.

---

## 9. Current State vs History
Mission Control, status, item register, roadmap, file/validation ledgers, known work and handover reflect current truth. Stage Execution Log preserves history.

## 10. Process Notes / Lessons Learned
- Contract IDs and roadmap UI IDs must be reconciled before creating catalogue entries.
- Wrapper parity evidence and engineering-method qualification are distinct.
- An explicit blocked catalogue is useful only when it never masquerades as calculation output.
- Environment-limited validation is recorded as `NOT_RUN`, not inferred PASS.
- Separate B31.3 central IDs preserve distinct data/authority paths.

## 11. Commit and PR Rules
All assignment work is on #435. No CI workflow was added. PR must not be merged without Owner instruction.

## 12. Unexpected Findings / Stop Conditions
ISS-001 was corrected without broadening into numerical PIPE methods. No finding justified changing domain formulas or unqualified methods.

## 13. Coding Rules Applied
Named exports; new JS modules remain under 300 physical lines; focused modules/functions; no hidden default mocks; no silent engineering fallback; no unused speculative framework; no broad refactor; no workflow change; no numerical placeholders.

## 14. Action-First Delivery Gate

```text
central public API
→ deterministic registry/input/unit/qualification engine
→ real B31.3 + empirical production consumers
→ single + Sandbox + batch routes
→ fail-closed future catalogue
→ focused retained tests
```

The production capability is present. Final live integration execution remains an explicit evidence step, not a missing coding layer.

---

## Next-Agent Handover

- **Current stopping point:** source implementation and PR reconciliation complete.
- **PR / branch:** #435 / `agent/engineering-calc-core`.
- **Final production-code HEAD before closure report:** `17392548abdac895edb82cc103583668ee0af70b`.
- **Last completed stage:** Stage 9.
- **Current active stage:** none; review/validation handoff.
- **Start here:** run `node --test tests/engineering-calculation-core.test.mjs` in a normal checkout of the current PR head.
- **Do not redo:** registry/engine/adapters/catalogue architecture unless the test exposes a demonstrated defect.
- **Do not assume:** B31.3 is design-authorized; empirical model is design authority; blocked calculators have formulas; live test passed.
- **Files currently involved:** exactly the 13-file ledger above.
- **Known failing checks:** none known; required live integration/full-repo checks are NOT_RUN.
- **Validation still required:** focused live repository test; any broader regression expected by reviewer/release process.
- **Open engineering questions:** none for core architecture.
- **Deferred improvements:** IMP-001 Console; qualification-driven family implementations.
- **Highest-risk remaining item:** RISK-004 execution-evidence limitation.
- **Exact next recommended action:** execute focused test, record exact HEAD/output, then decide draft→ready/merge.
- **Required reading:** this report, `docs/APIEngineeringCalcContracts.md`, `docs/APIEngineeringCalcRoadmap.md`, and the focused test.

---

## PR Closure Record

| Closure Criterion | Result |
|---|---|
| Mission completed | YES — coding scope complete |
| In-scope items dispositioned | YES |
| Engineering Item Register synchronized | YES |
| Changed files reconciled | YES — 13/13 |
| Validation rerun at final HEAD | PARTIAL — live repo suite NOT_RUN |
| Unexplained changes | NONE |
| Deferred improvements recorded | YES |
| Known limitations recorded | YES |
| Handover current | YES |
| New CI workflows added | NO |
| Final production-code HEAD | `17392548abdac895edb82cc103583668ee0af70b` |

### Final outcome
A centralized, deterministic, API-first Engineering Calculation core now exists with real B31.3 and empirical consumers plus a fail-closed 19-item future-method catalogue.

### Remaining known limitations
Live repository integration/regression execution evidence is still required; blocked calculators remain intentionally unimplemented until their qualification issues are resolved.

### Recommended next PR
Engineering Calculation Console consuming only the central registry/API, after #435 obtains live execution evidence and is merged.
