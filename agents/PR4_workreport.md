# PR4 — Review Final weight: length (mm) and Error %

## Requirement and scope (7 November 2026)
Owner request: within XML→CII 2019 Standalone → 10 Output / Run → **Review Final weight**, add **Element length (mm)** next to FROM / TO node; add **Error %**, reusing existing weight-validation percent logic and a 50/60% configurable limit when selected.

Repository `reallakshman19/3D_Converters_v0.4b`, branch `feat/xml-cii-final-weight-length-error-20261107`, base main `d53d946e141cfdc94746e1533a96aa80dc25511b` (PR #3 previously merged). No other open PRs at task start. Classified ENGINEERING_CRITICAL read-only UI & parser enhancement.

## Engineering design
- Final ELEMENTS row 1 is `FROM TO DX DY DZ OD`, written by `converters/scripts/xml_to_cii2019.py` with first field 15 characters, then 13-column fields. `_map_position_to_cii` reorders axes without scaling. The writer emits SI (mm) units. Compute **lengthMm = Math.hypot(DX,DY,DZ)** from the final emitted file for every final ELEMENTS record, including split and shared-pointer records. Display per-linked-element lengths in the existing one-row-per-RIGID table; separate comma-aligned values for shared pointer associations. Retain 180-row fixed-width negative field regression and all existing 1-based RIGID pointer checks.
- The final CII file has no independently authoritative *expected* weight per pointer. A deviation cannot be inferred safely from just the exported actual CII weight. Therefore add a **Reference (same units)** optional input per pointer, and compute signed **Error % = 100 × (exported - reference) / reference** only when the positive, finite reference is explicitly entered. Missing/zero/invalid reference → `—`, never fabricated 0%. This mirrors the absolute deviation magnitude check in `converters/xml-cii2019-core/weight-subset-validator.js`.
- **Error limit ±n%** is loaded from existing `config.weight.validatorDeviationPct` (default **20%**, not an invented 50 or 60); users can set ±50 or ±60 (and other values) in the popup for *review* without saving any engineering policy. Error beyond limit is marked and filterable; editing reference/limit never touches CII bytes, source XML, config or output weight.
- Existing `extrapolationMinRatio=0.65` / `extrapolationMaxRatio=1.6` is a **length-based extrapolation policy** (−35/+60% ratio), not a weight-error tolerance. It is **not silently reused** to judge weight error. This is disclosed in popup copy.

## Files
1. `tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js`: geometry-first-row decoder; computed `lengthMm` on every final ELEMENTS linkage.
2. `tabs/xml-cii-2019-standalone/xml-cii-final-rigid-weight-error.js`: pure % calculator, configurable weight-validator threshold and formatter.
3. `tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js`: length and error columns, reference inputs, live recomputation, outside-error filter and threshold control.
4. `tests/xml-cii-final-rigid-length-error.test.mjs`: new regression including 180 fixed-width RIGID records, length 13mm from (3,4,12), element 78 fused negative field, 50/60% thresholds, null-reference and configuration fallback.
5. Pre-edit parser/popup backups under `.backups/final-weight-length-error-20261107/`.

No CII writer, converter engine, mass assignment, output data, source review, or engineering policy modifications.

## Verification
- Actual latest GitHub module content parsed/compiled in isolated V8: PASS.
- New regression suite *source* executed under V8 with Node imports/assert/file read emulated: **35 assertions PASS**.
- Existing `tests/xml-cii-final-rigid-review.test.mjs` *source* executed against updated parser under same V8 harness: **256 assertions PASS**.
- Dynamic popup simulation with actual new module, 1 RIGID and isolated DOM event stubs: **PASS** (initial reference missing → —; +60% calculation; ±50 out-of-limit, ±60 within-limit; beyond-limit filtering; 13 mm length).
- Real GLRD 1,063,145-byte CII / actual >150 pointers: **NOT_RUN**, artifact not available in this chat.
- Native Node test execution: **NOT_RUN** (connector-only repository read/write, no local checkout).
- Real Chromium UI and independent engineering review: **NOT_RUN**.
- Do not claim this Error% is an authoritative mass-traceability assessment without a trusted reference tied to the emitted RIGID pointer.

## Acceptance
Run `node tests/xml-cii-final-rigid-review.test.mjs` and `node tests/xml-cii-final-rigid-length-error.test.mjs` in full checkout. Verify CII length against independent DX/DY/DZ geometry at pointer 78 and other GLRD rows, all RIGID records remain listed, and comparison percentages at boundary ±50/60 with independently supplied same-unit reference values. Confirm changing reference/threshold does not affect run output bytes. Independent engineering reviewer then evaluate for merge. Keep draft unless Owner approves.
