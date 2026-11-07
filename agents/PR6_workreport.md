# PR6 — Run-pinned master reference suggestions and Final CII Error % basis

## Owner authorization · 7 Nov 2026
Owner accepted the proposed next engineering improvement: populate final RIGID review **Reference (same units)** from verified physical-component-to-final-RIGID mappings, using suggestions like Weight Match and showing the explicit basis of Error %. Earlier symptom: 144 final RIGID rows all had Error% = dash because no reference weight was supplied. No fabricated expected weights, no auto approvals.

## Repository / integration
- Repository `reallakshman19/3D_Converters_v0.4b`.
- Branch `feat/xml-cii-final-rigid-master-reference-20261107`.
- Parent PR #5: `fix/xml-cii-final-review-smartfill-scope-20261107` at `0fbe6b4d9b38246a91f018ac90ad402913501753` (OPEN/DRAFT at task start).
- This is a **STACKED draft** atop PR #5; do not merge #6 before parent integration. No overlapping active PR beyond inherited PR5 files. No owner merge authorization.

## New grounding (read-only)
1. `tabs/xml-cii-2019-standalone/xml-cii-workflow-service.js` now attaches an in-memory, run-specific **finalRigidReviewEvidence** only after a successful XML run with converter input parity equal: exact `parity.xmlText` handed to CII engine, run's effective support config/master rows, staged context, explicit weight scale **×1 or ×10**, and parity input digest. Suppress for TopoFix-based output (different input) and InputXML. This is NOT an output artifact and does not modify emitted CII, engine or writer.
2. `xml-cii-final-rigid-inventory.js` reads the real final CII ELEMENTS' line 11 A100 length-prefixed **branch label**, alongside existing 1-based pointer, FROM/TO and final vector length; old synthetic rows with no real label remain blank (no guess).
3. New `xml-cii-final-rigid-master-references.js`: strict unique (branch, FROM, TO) source-edge crosswalk, must match final CII length to 0.03 mm and be a true converter-defined RIGID owner (`to.Rigid=2` or RIGID→FLAN). Source owner `ComponentRefNo` and nearest Weight Match catalog candidates come from existing `collectXmlCiiWeightMatchRows` authority, not a new master ranking. Candidate needs positive selected weight, qualified length, exact rating, bore <1mm, no zero/fallback; unit conversion from captured run ×1/×10. Unique auto-preselection additionally requires physical ComponentRefNo, exactly one qualified catalog candidate, exact/direct master method, positive explicit semantic tier, and no other output RIGID pointer tied to same (branch,ComponentRefNo). Ambiguous/split/unsupported cases are **manual candidate selection only**, or not assessed.
4. `xml-cii-adapted-final-rigid-review.js`: popup shows catalog alternatives as a drop-down, numeric reference (automatically filled for strictly qualified unique source), and an openable **Evidence / calculation basis** column with source pair/component ref, measured source and final lengths, master descriptor/row/bore/rating/length, kg scale and formula. Changing reference (catalog or manual) recalculates **Error % live** and updates assessment counts/selected limit; changing a reference does NOT mutate source/CII or weights. Manual reference is visibly distinguished from exact catalog and automatic reference.

## Non-authoritative / safety boundary
- A CII pointer plus matching geometry does **not independently prove approved physical mass**. Catalog references are **review comparisons**, never automatic engineering corrections.
- Do not repeat one physical component catalog mass on two or more final rigid pointers: auto reference is disallowed when same branch/ComponentRefNo appears for >1 final pointer.
- Missing branch label, missing engine input, changed options without pinned run data, multiple source matches, geometry disagreement, no catalog, ambiguous candidates, no qualified semantic evidence → No automatic reference, no fake Error%.
- Weight deviations use existing `100 * (CII weight - reference) / reference`, threshold is existing weight-validator limit (not length extrapolation ratio).
- Source text and master rows are in-memory only, not exported, and are tied to exact successful run; no converter output data changed.

## Test record
- New `tests/xml-cii-final-rigid-master-reference.test.mjs`: 26 assertions PASS in isolated V8 with exact GitHub modules, XML DOM test helper and explicitly stubbed Weight Match candidate authority: full CII branch label, positive unique 40 kg ×10→400, source Ref trace, multiple candidate refusal, geometry failure, no run evidence/scale, physically shared Ref auto-refusal and UI wiring.
- Actual popup code with stubbed DOM: 11 interaction checks PASS: auto catalog 400 vs CII 430 = **+7.5%**, basis details visible; manually changed 350 = **+22.9%**, suggestion clears; selecting catalog again restores 400 and +7.5%. No output mutation.
- Existing Final RIGID pointer suite: 256 isolated V8 assertions PASS.
- Existing Final RIGID length/error suite: 35 isolated V8 assertions PASS.
- Native Node full checkout: **NOT_RUN**. Real authentic GLRD 144-pointer artifact: **NOT_RUN** (only screenshot, file bytes not in this session). Browser Chromium: **NOT_RUN**. Independent engineering review: **NOT_RUN**.
- No claims about how many of actual GLRD's 144 pointers have trustworthy unique catalog matches; inspect after rerun on exact PR head.

## Exact acceptance gate
1. Integrate PR #5 first, then test PR #6 in a checked-out repo with `node tests/xml-cii-final-rigid-master-reference.test.mjs`, `node tests/xml-cii-final-rigid-review.test.mjs`, and `node tests/xml-cii-final-rigid-length-error.test.mjs`.
2. Rerun real GLRD conversion at exact PR head to capture new internal run-pinned engine input and actual scale, open final review, audit every auto-suggested reference and its source/candidate basis against raw GLRD XML/CII, including RIGID pointer with 19.1mm 150 N/109mm 150 N distinct FLAN/PCOM mass ownership.
3. Verify no auto preselection on shared ComponentRefNo, ambiguous component mapping, source mismatch, or unknown weight scale. Verify UI alternative selection and no CII output change.
4. Independent exact-head engineering reviewer. **DRAFT HOLD** pending real acceptance and Owner-approved merge.
