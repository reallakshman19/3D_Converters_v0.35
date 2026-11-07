# PR5 — Final RIGID review: remove false Smart Fill BLOCKED status, report Error % coverage

## Owner evidence / task
The owner shared a live screenshot of `Review Final weight — Emitted CII RIGID` (GLRD-1000-PI-01-BM2) with **144 RIGID pointers, 433 ELEMENTS, zero unreferenced/shared and zero nonpositive weights**. Length and source CII weights were populated. Every Error % was `—` because no independent reference was supplied (first row had `0`, which is invalid as a positive denominator). The popup incorrectly showed a red bar: `BLOCKED: 0 safe, 0 review, 0 blocked.`

## RCA (exact source)
`tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-rigid-smart-fill-ui.js` installs a global MutationObserver. Its `scan()` reads *every* `.mc-rigid-review-dialog`, including read-only final-CII and source-inventory dialogs. `readRows()` returns [] for these unrelated popups, while `buildRigidSmartFillPreflight([])` returns `BLOCKED` with `NO_REVIEW_ROWS`. `buildToolbar()` then inserts `data-rigid-smart-status` into the unrelated read-only popup below its table. This created the red `BLOCKED 0/0/0` label even though all 144 actual CII records were successfully read.

## Surgical changes
1. Smart Fill gains named `isRigidSmartFillReviewDialog` predicate, requiring the existing single-source **editable Apply Weights button** plus the expected missing-weight and rating inputs. `renderDialog` returns without mutation if the dialog is not eligible. This preserves the legitimate Smart Fill popup, and excludes final CII inventory, read-only source inventory and Mode A consolidated batch review.
2. Final CII popup now shows an explicit neutral *reference coverage* status: `N reference-based comparisons · M not assessed · K outside selected ±X% limit. No output weights changed.` It refreshes with inputs and threshold. If zero references are present, 144 rigids are **not assessed**, not zero-error and not blocked. A user-entered 0 is invalid/unassessed; positive same-unit independent references enable comparison. Reference placeholder changed from `same units` to `ref required`, with min positive input.
3. Regression test `tests/xml-cii-final-review-smartfill-scope.test.mjs` checks genuine editable dialog admission and exclusion of final/source/Mode A, plus static coverage/guard presence.
4. Pre-edit backups for both modified files under `.backups/final-review-smartfill-scope-20261107/`.

## Protected invariants
- No CII writer, parser, conversion mass, rigid pointer, weight assignment, approval policy, output artifact, or weight-master change.
- No interpolation, approximate mass assertion, or expected weight invented. Final RIGID weights are **observed final CII values**; Error% needs an independent trusted reference in **identical output units** (CII may apply 10× kg→N scale).
- `144` is grounded to Owner screenshot and copied row inventory, not an independently re-parsed authentic CII artifact in this session.
- `0 nonpositive` in final CII is not a proof of correct physical mass. Some physical components may have multiple split RIGID elements and must be traced by source provenance.

## Validation / gates
- Live main at `8bee7b4359f6d61e62c6a064fa81e81d530918eb`, previously merged PRs #1–#4. No open PR found at task start.
- Actual connector-fetched current branch sources syntax-compiled in isolated V8: PASS.
- Isolated V8 production-popup execution against **synthetic** 144 RIGID + 433 ELEMENTS CII: PASS, initial 0 comparisons/144 unassessed; zero entered stays unassessed; one valid reference gives 1 compared/143 unassessed.
- Smart Fill predicate on fake dialogs: true only for genuine single-source application view, false for final read-only view. PASS.
- Full Node suite in a real git checkout: NOT_RUN; `git ls-remote` from available container failed due DNS unavailable. Browser real GLRD screenshot replay: NOT_RUN; original CII bytes not available.
- Independent engineering review: NOT_RUN. GitHub workflow status pending check.

## Next action
Run `node tests/xml-cii-final-review-smartfill-scope.test.mjs`, `node tests/xml-cii-final-rigid-review.test.mjs` and `node tests/xml-cii-final-rigid-length-error.test.mjs` against PR head. Browser-open the same GLRD result: 144/433 expected, no stray Smart Fill toolbar/false BLOCKED, reference coverage shows 0/144 not assessed without reference, 1/143 after entering one valid same-unit reference. Separately confirm genuine unresolved-weight popup still has its Smart Fill tools. Hold draft until complete.
