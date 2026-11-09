# Independent review packet — XML-CII2019-ROUNDTRIP-FOUNDATION-R1

**Review target:** [DRAFT PR #18](https://github.com/reallakshman19/3D_Converters_v0.35/pull/18) against `main@3394c022f9400f05a736948033d26eb46274446c`. Review the exact current PR head shown by GitHub; do not assume an earlier producer head is still current.

**Scope:** Read-only effective-input snapshot, exact CII no-edit replay using the existing Python runtime-custody converter, source-node/Python-transformed-node/final ELEMENT/auxiliary ledger and private archive intake. No weight edits, no UI redesign, no direct final CII mutation. Do not merge or deploy as part of review.

**PR #18 review-fix closeout:** See [REVIEW_FIX_RECEIPT.md](./REVIEW_FIX_RECEIPT.md) for F1–F3 counterexamples, full 15-field auxiliary validation, independent ledger cross-checks and CI execution. Reviewer approval must be based on the corrected exact head, not the producer's receipt.

## Reviewer procedure

1. Source-first: inspect `converters/scripts/xml_to_cii2019_runtime_custody.py`, `xml_to_cii2019_patched.py`, `xml_to_cii2019.py`, `cii2019_reparse_proof.py`, `cii2019_section_rules.py` and `converters/xml-cii-2019-standalone/invocation-builder.js`. Independently determine the real Python input boundary, transformation ordering, short-node/drop behavior, actual ELEMENT pointer positions, and weight-source selection.
2. Audit `roundtrip_foundation/snapshot_replay.py` for custody of **exact effective** options, archived source/config/staged/template bytes, transitive local Python module hashes and runtime identity. Missing inputs or an invocation mismatch must fail closed. No implicit `{}` or split/weight-scale default.
3. Execute the real converter and validate exact SHA-256, byte length, zero differing bytes, CONTROL counts and auxiliary pointers. Explicitly distinguish **current-writer-created synthetic baseline** from an **independently archived historical CII**; only the latter can qualify the Owner's past 433/144 run.
4. Audit `roundtrip_foundation/lineage.py`: source-node identity `digest:branchOrdinal:nodeOrdinal` must remain distinct from NodeNumber, final ELEMENT index, auxiliary pointer and physical ComponentRefNo. Negative-node renumbering, short-element deletion and nonpositive-node omissions require observed production-parser evidence. For any nonadjacent output edge, **every** skipped source node must have qualified transformation evidence. Shared ComponentRefNo may resolve structural nodes but not physical mass ownership.
5. Audit `roundtrip_foundation/owner_bundle_replay.py`: private input/output paths, original CII archive attestation, every actual upstream dependency role (not four hardcoded roles), exact hashes and lengths, stale input refusal, converter identity, support JSON redaction, no stale ledger surviving a HOLD. A boolean attestation alone is not independent historical provenance.
6. Recheck no changes to production converter source, writer, engineering mass-selection policies, UI or original benchmark input bytes. Review the full diff and all changed filenames.

## Commands to reproduce

```bash
python3 -m unittest discover -s tests -p 'test_roundtrip*.py' -v
node --test tests/xml-cii-final-property-transactions.test.mjs
node --test tests/xml-cii-final-rigid-source-context.test.mjs
node --test tests/xml-cii-standalone-output-run.test.js
python3 -m roundtrip_foundation.generate_evidence --out roundtrip-evidence
```

The first command uses Python 3.11 in CI. Compare counts and digests to `roundtrip-evidence/no-edit-replay-report.json` and `roundtrip-evidence/lineage-coverage-report.json`.

## Evidence classes — never conflate

| Evidence | What qualifies | Not proven |
|---|---|---|
| Synthetic 4-branch | 11 ELEMENT/6 RIGID exact current-writer replay, 8 exact + 3 transformed ELEMENT, 1 ambiguous physical RIGID owner | Independent old-run parity |
| Synthetic 433/144 | Scale/structure and no-edit exact replay under explicitly synthetic inputs | Owner GLRD run or source mass correctness |
| Repository-native public GLRD | 308 ELEMENT/65 RIGID real-converter replay; 42 exact + 266 transformed ELEMENT; 349 final nodes with observed original identities | Actual Owner 433/144, 65 physically approved RIGID owners |
| Actual Owner historical GLRD | **NOT_RUN** until the original frozen bundle is available | Cannot conclude historical parity from any fixture above |

The 65 repository-native RIGIDs remain **AMBIGUOUS physical owners**, even though emitted ELEMENT and node **structural** lineage is complete. A shared ComponentRefNo is not a mass-allocation authority. F1 requires every incident ELEMENT to be resolved before a final node can claim `EXACT_UNIQUE`.

## Focused F1–F3 review gate

- **F1:** Reproduce a node with a verified and unresolved incident ELEMENT. Its known source candidate remains visible, but it cannot be `EXACT_UNIQUE`. Check the same FROM=TO node case with different source IDs.
- **F2:** Confirm the new independent 15-slot validator checks EXPJT, DISPLMNT, FORCMNT, UNIFORM, WIND, OFFSETS, ALLOWBLS, FLANGES and EQUIPMNT, as well as the prior six. Verify physical records *and* CONTROL counts, including blank FLANGES payload rows.
- **F3:** Run `tests/test_roundtrip_review_fixes.py`; inspect `ledger_integrity.py` and verify fabricated source IDs, broken reverse indexes, changed counts, missing auxiliary records and invalid relationships fail closed. The validator must derive completeness from incident edges and source events, not claims within the node or status fields.

## Key negative-case expectations

- Stale XML, original CII or archived master/config file: HOLD (no publishable result).
- Converter source/runtime changed: HOLD_CONVERTER_IDENTITY, if the manifest itself is intact.
- Changed split setting or weight scale: no falsely qualified no-edit result.
- Invalid out-of-range ELEMENT pointer: HOLD_CII_INVALID.
- Repeated NodeNumber across branches: no cross-branch ownership.
- Nonpositive omitted source nodes and short-node deletion: transformation events must be explicit, never fabricated from matching geometry alone.
- Second run fails after an earlier PASS in the same private report directory: the stale `owner-private-lineage.json` must not remain.
- Unapproved physical mass or duplicate ComponentRefNo: **never** upgraded to authority.

## Reviewer disposition

Return one of:

- **CODE_PASS / AUTHENTIC_NOT_RUN** — bounded implementation and tests pass, archived Owner replay unavailable. The draft is code-reviewable but does not qualify lossless historical engineering.
- **CODE_HOLD** — a reproducible defect in read-only replay, custody, source association, pointers or tests; cite file/line and counterexample.
- **CODE_NO_GO** — incorrect source ownership or non-identical no-edit CII accepted as `PASS_EXACT_REPLAY`.

For a code PASS, provide exact reviewed head SHA, executed test commands and counts (LOCAL vs CI vs NOT_RUN), input evidence class, residual unresolved owners and the reviewer's concrete next action. Do not certify physical mass authority based on RIGID pointer validity.

## Historical Owner replay missing custody

The prior 433 ELEMENT / 144 RIGID run requires original emitted CII captured independently, exact run-pinned enriched/engine-input XML, uploaded XML, staged JSON, all original masters/overrides, effective converter arguments/support JSON, and converter/runtime identity. The private intake contract and command are in `roundtrip_foundation/OWNER_BUNDLE_README.md`. Until those bytes are supplied, the honest conclusion is `AUTHENTIC_NOT_RUN`—not `PASS` and not a reason to prevent a draft **code review**.
