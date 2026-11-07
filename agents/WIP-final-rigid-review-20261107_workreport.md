# WIP-FINAL-RIGID-REVIEW-20261107 — handover

## Task and authoritative interpretation
Owner (7 Nov 2026): Add a new **Review Final weight** button to XML→CII 2019 Standalone → 10 Output / Run, opening a consolidated-style searchable popup listing **every RIGID record in the FINAL generated CII** with its **RIGID pointer**, exported weight and corresponding final ELEMENTS FROM/TO node pairs. This is distinct from PR #1's SOURCE XML rigid/node review.

Classification: ENGINEERING_CRITICAL, because displayed weights/pointers are engineering results. UI+read-only output reparse ONLY; no source XML, override, engine, writer, converter output, or approval modification.

## Re-grounding
- Repository `reallakshman19/3D_Converters_v0.4b`.
- Base main `25001734e00070ccdb05ab52711496398d375143` (fetched 7 Nov); former PR #1 is MERGED.
- Branch `feat/xml-cii-review-final-rigid-weight-20261107`.
- Open PR list returned empty at task start; no simultaneous PR overlap found.
- Grounded CII file layout: `converters/scripts/xml_to_cii2019.py` (RIGID section: one line per emitted rigid, first real = exported weight); `converters/scripts/xml_to_cii2019_patched.py` (ELEMENTS 15-line records, line 13 second integer = rigid pointer); independent `converters/scripts/cii2019_reparse_proof.py` (RIGID pointer offset [12,1], RIGID section width 1); `converters/scripts/cii2019_section_rules.py` (CONTROL counts).

## Changes
- `tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js`: new pure read-only CII reparser: CONTROL declared RIGID/ELEMENT counts, full RIGID records (including orphan pointers), element reference linkage, final FROM/TO, exact exported token, numeric value, zero/negative, shared/orphan flags; refuse missing/duplicate sections, count mismatch, invalid pointer/number, malformed element length.
- `tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js`: new consolidated-style popup, search/filter, first column **Rigid pointer**, per-element index/FROM/TO, weight token **as exported**, closing is read-only. Button enabled only for successful completed `result.ciiText`.
- `tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-output-run.js`: minimal import/action addition: new button appended after Finalise and Run Conversion in Run Conversion card; existing Run/Source review untouched.
- `tests/xml-cii-final-rigid-review.test.mjs`: synthetic CII parser tests with shared pointers/orphans/negative/zero/mismatches/invalid values and static UI binding checks.
- `.backups/final-rigid-review-20261107/xml-cii-adapted-output-run.js.bak`: preserved pre-edit source.

## Invariants
- Pointer is 1-based row number of final `#$ RIGID` section; read pointer from final `#$ ELEMENTS`, never infer it from original XML or geometry.
- Each final RIGID auxiliary record appears once even if no ELEMENTS pointer references it; shared pointer links every referencing element without summing mass.
- Weight displayed is **exact output CII first-field token**, not source kg and not silently reversed kg→N. User-facing label indicates exported units depend on conversion setting.
- This view does **not prove physical-source component mass parity** nor exact CII semantic weight correctness. It proves what was serialized in current successful CII output. Do not claim source mapping without independent evidence.
- View is read-only; no mutation to output or config.
- Without a successful current CII result, review button is disabled rather than showing guessed data.

## Validation
- V8 syntax compilation for both new modules and edited Output/Run panel: PASS (isolated).
- Isolated V8 execution of actual parser source with synthetic 15-line CII ELEMENTS: **13 assertions PASS** (3 pointer rows, exact weights, linked node pairs, shared/unreferenced/zero/negative counts, invalid pointer/CONTROL count/section/numeric/record-length/duplicate refusal, UI enable/disable conditions).
- Node repository test runner (`node tests/xml-cii-final-rigid-review.test.mjs`): NOT_RUN (no repository runtime checkout).
- Browser validation on true final GLRD CII: NOT_RUN.
- Independent engineering review: NOT_RUN.
- Current CI workflow: NOT_RUN until a PR run is observed.

## EXACT_NEXT_ACTION
Publish DRAFT PR, record exact head and tests/CI. In repository checkout run `node tests/xml-cii-final-rigid-review.test.mjs` and `node tests/xml-cii-all-rigid-inventory.test.mjs`, browser-test Run → Review Final weight against an authentic emitted GLRD CII file, verify 1-based pointer-to-element and weight against the raw text and run with kgToNewton ON/OFF. Ensure source review, Mode A and output byte parity unchanged. Obtain independent engineering review before merge. HOLD merge authority for Owner.
