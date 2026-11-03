# Agent Work Report — PR 426

## 0. PR Mission Control

| Field | Current state |
|---|---|
| Mission | Add Empirical Weight Sandbox and complete B31.3 factor coverage as screened, provenance-qualified data. |
| Source task | User requests 2026-08-11 |
| PR number | 426 |
| Branch | `agent/empirical-sandbox-material-db` |
| Base commit | `bd58aa701f25bd3ddc100d19b38c94406e72f4e7` |
| Final implementation HEAD | `853f224cfae672e51e47ed0c9cb87c649ce7e5e3` |
| PR status | OPEN / DRAFT / MERGEABLE |
| Current stage | Stage 8 — final review / handover |
| Last completed stage | Stage 7 — screening factor ingestion + resolver authority fixes |
| Engineering status | IMPLEMENTED; screening basis complete, strict authority intentionally unchanged |
| Validation status | PARTIAL: focused reconstruction checks PASS; full checkout tests NOT_RUN in this runtime |
| Current blocker | No software blocker. Engineering promotion to strict authority still requires controlled B31.3-2024 edition-of-record review. |
| Exact next action | Review PR #426; if accepted, merge only when explicitly instructed. |

### Handover in 60 seconds
- **Now true:** Empirical Weight Tuning has a Sandbox for Exact/A1/A2/final weights. B31.3 screening S/E/W/Y data covers CS/LTCS/SS/DSS/SDSS at the supplied temperatures and E routes.
- **Currently being worked on:** No production implementation remains; final review only.
- **Remains unfinished:** Controlled 2024 code review/promotion of screened factor rows to `PROJECT_APPROVED` or `VERIFIED`.
- **Must not be assumed:** `SCREENING` means design authority. The supplied S basis was stated as 2016/2018 and may differ from 2024.
- **Highest-risk remaining:** `RISK-001` — improper promotion/use of screened data as strict authority.
- **Exact next action:** Review the 11-file PR diff and qualification boundary.

## 1. Mission and Engineering Intent

**Mission:** Make empirical-weight estimation inspectable and make the supplied B31.3 factor basis usable without obscuring provenance or qualification.

**Engineering consequence:** Operators can see how each empirical approach arrives at weight. Engineers can run screened B31.3 calculations for the supplied materials/temperatures/routes while strict calculations continue to fail closed until controlled approval.

**In scope:** Sandbox API/UI/tests; compact screened factor basis; deterministic runtime expansion; route-specific E; strict qualification controls; duplex 420 °C exclusion.

**Non-goals:** Refit empirical models; interpolate S; claim B31.3-2024 verification; promote screened rows to design authority.

## 2. Mission Status

| Work Item | Priority | Status | Stage | Evidence |
|---|---|---|---|---|
| Empirical Sandbox API | P0 | DONE | 4 | production API |
| Empirical Sandbox UI | P0 | DONE | 4 | Engineering tab |
| Sandbox static regression | P0 | VALIDATED | 4 | 1/1 static check |
| Owner screening S/E/W/Y basis | P0 | DONE | 7 | canonical master + generated runtime |
| Route-specific E authority | P0 | VALIDATED | 7 | `ISS-001` fix + focused checks |
| Duplex 420 °C exclusion | P0 | VALIDATED | 7 | no generated S record |
| Strict qualification boundary | P0 | VALIDATED | 7 | screening rows rejected in strict mode |
| Controlled 2024 promotion | P1 | DEFERRED | future | `RISK-001`, `QST-001` |

## 3. Engineering Item Register

| ID | Type | Severity/Priority | Status | Summary | Current PR? |
|---|---|---|---|---|---|
| IMP-001 | Improvement | P0 | DONE | Multi-approach empirical-weight Sandbox. | Yes |
| ISS-001 | Defect | Critical | RESOLVED | Missing manufacturing route previously acted as wildcard for route-qualified E rows. | Yes |
| ISS-002 | Defect | High | RESOLVED | `Number(null)` could materialize unavailable duplex 420 °C S slot as zero-valued record. | Yes |
| RISK-001 | Risk | Critical | DEFERRED/OPEN | Screened basis must not be treated as controlled B31.3-2024 design authority. | Future review |
| RISK-002 | Risk | High | RESOLVED | E construction specificity is explicit and route-matched. | Yes |
| RISK-003 | Risk | High | RESOLVED | Duplex 420 °C S remains absent. | Yes |
| QST-001 | Question | P0 | RESOLVED_PARTIAL | Numeric basis supplied; exact 2024 edition equivalence remains unverified. | Future review |
| DEC-001 | Decision | P0 | VALIDATED | Sandbox candidate estimator remains isolated from active model. | Yes |
| DEC-002 | Decision | P0 | VALIDATED | Strict mode accepts only `VERIFIED` / `PROJECT_APPROVED`. | Yes |
| DEC-003 | Decision | P0 | VALIDATED | Supplied rows are stored as `SCREENING`. | Yes |
| DEC-004 | Decision | P0 | VALIDATED | Route-qualified records require an explicit matching route; absent route only matches route-agnostic records. | Yes |

### ISS-001 closure
**Root cause:** Existing `exact()` treated an absent discriminator as wildcard.

**Fix:** Candidate records are filtered so a supplied route prefers an exact route match, otherwise a route-agnostic record; an absent route may only match route-agnostic rows.

**Closure evidence:** Focused checks prove SS with no route or unknown route returns `missing: ['E']`; explicit routes resolve expected E.

### ISS-002 closure
**Root cause:** `Number(null) === 0` made a finite-number test insufficient for unavailable S slots.

**Fix:** Runtime expansion explicitly rejects `null`, `undefined`, and blank S slots before numeric conversion.

**Closure evidence:** Focused checks prove no S record exists for S31803/S32760 at 420 °C and resolver returns `missing: ['S']`.

## 4. Stage Roadmap

| Stage | Status | Purpose | Primary output |
|---|---|---|---|
| 1 | COMPLETE | Report initialization | living report |
| 2 | COMPLETE | PR allocation/report sync | PR #426 report |
| 3 | COMPLETE | Source/repo investigation | factor authority gate |
| 4 | COMPLETE | Empirical Sandbox | API/UI/tests |
| 5 | COMPLETE_AS_BLOCKED | Initial DB decision before basis supplied | fail-closed state |
| 6 | COMPLETE | Sandbox reconciliation | clean Sandbox implementation |
| 7 | COMPLETE | Screened factor basis + resolver authority fixes | data/generator/runtime/tests |
| 8 | COMPLETE | Final reconciliation/handover | report + PR metadata |

## Stage Execution Log

### Stages 1–6 — summary
Established report/PR, investigated B31.3 authority, implemented the Empirical Weight Sandbox, added tests, and preserved fail-closed B31.3 behavior while no numeric basis was available.

### Stage 7 — COMPLETE
**Before:** Owner supplied S/E/W/Y values with a stated 2016/2018 basis and edition-drift caveat.

**Implementation performed:**
- Added compact `screeningBases.OWNER-B313-SEWY-2026-08-11` to the canonical master.
- Added S arrays for A106-B, A333-6, A312 TP304/TP316, A790 S31803/S32760 at 20/80/120/300/420 °C where supplied.
- Kept duplex 420 °C S as `null`/not permitted and omitted it from runtime records.
- Added route-specific E values: `SEAMLESS`, `EFW_DOUBLE_BUTT`, `EFW_SINGLE_BUTT`, `EFW_100_PERCENT_RT` as applicable.
- Added W=1.0 and Y=0.4 screened records at supplied temperatures.
- Updated the generator to expand the compact basis into the existing runtime record schema.
- Fixed route matching (`ISS-001`) and null stress expansion (`ISS-002`).
- Extended B31.3 factor tests for screened values, strict rejection, route controls, duplex 420 °C exclusion, and coverage.

**Deviations from plan:** Compact basis + deterministic expansion was used instead of hundreds of repeated canonical rows. This retains the runtime/API record shape while keeping the editable master maintainable.

**Validation performed:**
| Check | Result | Evidence / Notes |
|---|---|---|
| Compact master → runtime `--write` / `--check` | PASS | local reconstruction of authored files |
| Generated runtime syntax | PASS | `node --check` local reconstruction |
| Resolver syntax | PASS | `node --check` local reconstruction |
| LTCS/SS/DSS/SDSS screening factor cases | PASS | focused reconstruction |
| Strict rejection of screened LTCS row | PASS | focused reconstruction |
| Missing/unknown SS route returns missing E | PASS | focused reconstruction |
| Duplex 420 °C returns missing S | PASS | focused reconstruction |
| No duplex 420 °C S record generated | PASS | focused reconstruction |
| Full branch `tests/b313-material-factors.test.mjs` | NOT_RUN | full repository checkout unavailable via runtime DNS path |
| GitHub workflow runs on final implementation HEAD | NOT_RUN / NONE | no workflow runs associated with head |

**Stage decision:** COMPLETE.

## 5. Changed-File Ledger

| File | First Stage | Latest Stage | Purpose | Engineering-sensitive? | Validation |
|---|---|---|---|---|---|
| `agents/PR426_workreport.md` | 2 | 8 | Living work report | No | reconciled |
| `converters/b313-material-factors/default-b313-material-factor-data.js` | 7 | 7 | Generated expanded screened factor registry | Yes | drift/syntax PASS reconstruction |
| `converters/b313-material-factors/index.js` | 7 | 7 | route-authority resolver fix | Yes | focused PASS |
| `converters/empirical-weight/empirical-weight-sandbox.js` | 4 | 4 | Sandbox production API | Yes | authored checks |
| `converters/empirical-weight/index.js` | 4 | 4 | Sandbox exports | Yes | source review |
| `docs/Masters/b313-material-factor-master.json` | 7 | 7 | compact screened S/E/W/Y basis | Yes | generator PASS reconstruction |
| `scripts/generate-b313-material-factors.mjs` | 7 | 7 | deterministic basis expansion | Yes | write/check PASS reconstruction |
| `tabs/empirical-weight-tuning-tab.js` | 4 | 4 | Sandbox UI | Yes | syntax/static PASS |
| `tests/b313-material-factors.test.mjs` | 7 | 7 | screened/strict/route regressions | No | focused equivalent PASS; full file NOT_RUN |
| `tests/empirical-weight-sandbox-ui-static.test.mjs` | 4 | 4 | Sandbox UI regression | No | PASS |
| `tests/empirical-weight-sandbox.test.mjs` | 4 | 4 | Sandbox API regression | No | exact repo NOT_RUN |

**Changed-file reconciliation:** GitHub compare at implementation HEAD reports exactly these 11 files; no unexplained file is present.

## 6. Engineering Decisions and Invariants

### DEC-001 — Candidate isolation
Candidate empirical tuning never mutates the active model/estimator.

### DEC-002 — Strict fail closed
`strict` accepts only `VERIFIED` / `PROJECT_APPROVED`. Screened rows remain non-authoritative.

### DEC-003 — Screening ingestion
Owner-supplied values carry `SCREENING`, `sourceAuthority`, `basisId`, and an explicit edition caveat.

### DEC-004 — Route custody
Route-qualified E cannot be selected without a matching route. Generic W/Y may remain route-agnostic.

## 7. Validation and Evidence Ledger

### Software validation
| Validation | Status | Last HEAD | Evidence |
|---|---|---|---|
| Sandbox static UI | PASS | pre-Stage-7 | 1/1 |
| Generator drift | PASS | implementation HEAD | local reconstruction |
| Runtime/index syntax | PASS | implementation HEAD | local reconstruction |
| Focused screened resolver checks | PASS | implementation HEAD | local reconstruction |
| Full B31.3 factor test file | NOT_RUN | implementation HEAD | no full checkout |
| Sandbox API test file | NOT_RUN | implementation HEAD | no full checkout |

### Engineering validation
| Property | Status | Evidence |
|---|---|---|
| Project target edition = B31.3-2024 | PASS | official ASME product page |
| Owner factor basis captured | PASS | user message 2026-08-11 |
| Supplied basis usable in `screening` | PASS | focused resolver checks |
| Screened basis rejected in `strict` | PASS | focused resolver checks |
| Supplied values independently verified against controlled 2024 edition | NOT_RUN | explicit future engineering review |

### Explicitly not validated
No claim is made that the supplied 2016/2018-based S values are unchanged in B31.3-2024. No interpolation behavior was added.

## 8. Known / Deferred Work and Forward Sequence

**Open engineering risk:** `RISK-001` only.

Recommended continuation:
1. Review the compact screened basis against the controlled B31.3-2024 edition of record.
2. If accepted, promote exact reviewed records to `PROJECT_APPROVED` or `VERIFIED` with controlled source reference.
3. Re-run B31.3 factor + Preview integration tests against that promotion HEAD.

## 9. Current State vs History
Living sections reflect current truth. Stage history above preserves the implementation sequence.

## 10. Process Notes / Lessons Learned
- Route-specific factor data exposed a pre-existing wildcard authority issue; data expansion can reveal latent resolver assumptions.
- `null` must be rejected before numeric coercion because `Number(null) === 0`.
- User-supplied values with edition caveats should remain useful at a qualification level that preserves the caveat.

## 11. Commit and PR Rules
All work remains on PR #426. No merge has been performed. No new CI workflow was added.

## 12. Unexpected Findings and Stop Conditions
`ISS-001` and `ISS-002` were recorded and resolved within Stage 7 rather than forcing ambiguous behavior.

## 13. Coding Rules
No hidden engineering defaults, no silent factor fallback, no unrelated refactor, and all new production APIs have real UI/runtime consumers.

## 14. Action-First Delivery Gate
**Visible capability:** Engineering → Empirical Weight Tuning → Sandbox → select target/type/rating/NS → inspect Exact/A1/A2/final results and A2 contributors.

**Activated engineering capability:** B31.3 `qualificationMode: 'screening'` resolves supplied S/E/W/Y for supported material/temperature/route combinations; `strict` remains fail-closed.

## Next-Agent Handover
- **PR / branch:** #426 / `agent/empirical-sandbox-material-db`.
- **Final implementation HEAD:** `853f224cfae672e51e47ed0c9cb87c649ce7e5e3`.
- **Last completed stage:** Stage 8 final reconciliation/handover.
- **Start here:** Review `docs/Masters/b313-material-factor-master.json` screening basis and `tests/b313-material-factors.test.mjs` qualification controls.
- **Do not redo:** Sandbox implementation, route fix, null-S fix, or initial source investigation.
- **Do not assume:** screened values are B31.3-2024 design authority.
- **Known failing checks:** None known; exact full-repo tests are NOT_RUN, not PASS/FAIL.
- **Validation still required:** full repo Node tests when checkout is available; controlled 2024 engineering review before factor promotion.
- **Highest-risk remaining:** `RISK-001`.
- **Exact next action:** code review PR #426; merge only on explicit Owner instruction.
