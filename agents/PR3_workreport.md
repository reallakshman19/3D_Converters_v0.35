# PR3 — Final rigid review fixed-width CII decode

**Owner report (7 November 2026):** On authentic final GLRD CII generated in XML→CII 2019 Standalone → 10 Output / Run → Review Final weight, popup failed with `Final CII rigid review: ELEMENTS 78 to-node is not finite: 730.000-1.000000E-02.` Owner expects >150 final rigid records.

## Root cause / authority

The prior read-only popup reparser used `line.trim().split(/\\s+/)` for the first two numeric fields in each final `ELEMENTS` block. Final CII is **fixed-width FORTRAN** output: `converters/scripts/xml_to_cii2019.py` emits first column width **15** and successive columns width **13**. `730.000-1.000000E-02` is two consecutive valid fields (TO node `730.000`, followed by negative DX), not a malformed TO node or invalid final CII. The independent repository checker `converters/scripts/cii_syntax_check_2019.py::_fixed_fortran_fields` also reads by 13-column positions after the first two-character pad. A valid file was falsely labeled invalid and the popup was suppressed.

## Exact changes

- `tabs/xml-cii-2019-standalone/xml-cii-final-rigid-inventory.js`: add `firstTwoCiiNumbers`, extracting the first two numeric fields by known 15+13 columns where both columns are numeric; fallback to the previous whitespace reader only for non-fixed-layout synthetic/legacy inputs. Apply this to both ELEMENTS node fields and RIGID weight fields. Preserve existing CONTROL declarations, pointer bounds, nonfinite rejection and source text nonmutation.
- `tests/xml-cii-final-rigid-review.test.mjs`: add actual writer-width 180-RIGID/180-ELEMENT fixture, including the exact concatenation around element 78; verify all 180 pointers and exported weights, matched CONTROL counts, final pointer 180, no orphan, zero mass, safe handling of adjacent negative RIGID fields, and unchanged CII bytes.
- `tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-final-rigid-review.js`: change misleading popup error title from `invalid CII output` to `could not parse final CII`. A display-parser error is not proof the actual generated CII is invalid.
- Three pre-edit backups stored in `.backups/final-rigid-fixed-width-20261107/`, per repository instructions.

**Scope:** read-only review parser, popup error title, test. No converter, writer, weight assignment, pointer mapping, engine, UI workflow switching, or output artifact edits.

## Verification performed

- Live connector-fetched implementation source compiled with JavaScript V8: PASS.
- 180-RIGID / 180-ELEMENT realistic fixed-width fixture including `730.000-1.000000E-02`: **180/180 RIGID rows and exact pointer/weight mapping PASS**, no exceptions.
- Adjacent negative RIGID auxiliary fields parsed: PASS.
- Malformed pointer/count/mass fail-closed cases: PASS.
- Exact checked-in updated `tests/xml-cii-final-rigid-review.test.mjs` executed in isolated V8 with Node imports/assert/readFileSync emulated: **256 assertions PASS**, including old tests and new 180-row regression.
- Actual `node tests/xml-cii-final-rigid-review.test.mjs` in repository checkout: NOT_RUN (no git network or full repository checkout).
- Real 1,063,145-byte GLRD CII from screenshot: NOT_AVAILABLE in this session; authentic browser test and actual >150 count NOT_RUN.
- CI and independent engineering review: NOT_RUN / to check on PR.

## Acceptance gate

Run the Node test command and manually open authentic GLRD CII with the new popup; verify the count equals `CONTROL` RIGID count and includes every `RIGID` pointer through the last record, including corresponding final FROM/TO nodes. Confirm no CII byte changes and no silent row truncation. Keep DRAFT until verified. PR branch head at handoff before report: `03cd06eb9aa30a7fa9817cc337ff1574a02455f8`.
