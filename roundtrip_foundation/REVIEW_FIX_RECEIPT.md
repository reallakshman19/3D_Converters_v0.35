# PR #18 — F1–F3 bounded reviewer corrections and verification receipt

Task: `XML-CII2019-ROUNDTRIP-FOUNDATION-R1-REVIEW-FIX`  
Reviewer source: Owner review of PR #18 at `35010cb08da2fcbc2a552efee414db1375f79898`.  
Original baseline: `main@3394c022f9400f05a736948033d26eb46274446c`.  
Last executable code test head: `1e50a2cd34c3f6abfeb788a99ee5bcf5d344bd7e`.  
[PASS PR CI run #42563367356](https://github.com/reallakshman19/3D_Converters_v0.35/actions/runs/42563367356) · [PASS push CI run #42563361620](https://github.com/reallakshman19/3D_Converters_v0.35/actions/runs/42563361620).

**Disposition:** `F1–F3 IMPLEMENTED / REVIEW-READY / AWAITING INDEPENDENT CODE REVIEW`. This is a producer receipt, **not** a cold independent review or an authentic historical GLRD qualification. No merge or deployment.

## Focused corrections

### F1 — Mixed incident-edge final-node identity

`roundtrip_foundation/lineage.py::reconcile_final_node_identities`

- Every final-node incident ELEMENT contributes either its qualified endpoint source ID or an unresolved incident marker.
- `EXACT_UNIQUE` or `TRANSFORMED_WITH_LINEAGE` requires every incident edge to be resolved and every source ID to agree.
- Conflicting qualified IDs give `AMBIGUOUS`. One known ID plus an unverified incident edge is `UNMATCHED` with `sourceNodeCandidates` and `unverifiedIncidentElements` retained, but no `sourceNodeIdentity`.
- A same-number self-loop is evaluated once for each **FROM and TO side** rather than collapsing both into one source identity. ComponentRefNo remains distinct from a final node/source identity.
- Tests cover the reviewer’s EXACT+UNMATCHED node-20 counterexample, a claimed EXACT for an unresolved edge, and two divergent endpoint identities in one self-loop.

### F2 — All 15 CII auxiliary pointer slots

`roundtrip_foundation/full_pointer_validation.py` and `snapshot_replay.py::validate_serialized_cii`, consumed by `lineage.py::parse_elements_and_auxiliaries`.

Actual 15 IEL fields (0-based ELEMENT row/slot):
- Row 12: BEND, RIGID, EXPJT, RESTRANT, DISPLMNT, FORCMNT.
- Row 13: UNIFORM, WIND, OFFSETS, ALLOWBLS, SIF&TEES, NODENAME.
- Row 14: REDUCERS, FLANGES, EQUIPMNT.

Validation checks every numeric pointer is finite/nonnegative/integer; `ptr <= physical auxiliary records`; physical auxiliary counts match actual CONTROL counts; auxiliary widths match the repository's neutral-file 2019 rules. In particular, FLANGES is **12 lines** and may contain a real blank payload row, not to be stripped. The legacy independent six-field reparser must agree with the matching fields. The emitted CII parser/writer is unchanged.

Tests cover valid unmodified CII, nonzero test-created section records plus pointers for **each of nine previously unvalidated slots**, invalid out-of-range pointers for **all fifteen**, control/physical count mismatches, invalid record widths, negative and fractional pointers. Dummy auxiliary payloads used for test-only count boundaries are **not** engineering mass authority or real output evidence.

### F3 — Independently reconstructed ledger consistency

`roundtrip_foundation/ledger_integrity.py` replaces permissive label-only validation; `validate_lineage_ledger()` calls it fail closed.

- Run/source/XML/CII/config digests agree with frozen snapshot; source/Python identity digest+branch+ordinal are exact.
- Source component membership, Python-original node bindings and qualified ELEMENT source IDs are branch-qualified and internally consistent.
- Every final node's complete incident edge set, qualified candidates, unresolved incidents and classification is rederived; classification `TRANSFORMED_WITH_LINEAGE` must agree with observed transformation source IDs.
- All 15 pointer references are checked against the actual ledger auxiliary set; auxiliary records are contiguous, referenced ELEMENTs agree, and shared/unreferenced flags are rederived.
- Original node→ELEMENT/final-node relations, full relationship multiset, transformation event endpoints, RIGID writer-source/ComponentRefNo candidates, reverse indexes and every major statistic are reconstructed. No physical mass approval can be silently promoted.

Executable negative tests modify **detached ledger copies** with fabricated source IDs, valid IDs from wrong branches, missing/duplicated/bogus relationships, missing aux records, inconsistent auxiliary links, out-of-range pointers and RIGID aliases, manipulated counts, forged Python source digest, false source-component membership/bindings, forged RIGID candidates and a false transformed-node status. All are refused with `HOLD_LINEAGE_INVALID`. Original CII/XML data are never changed.

## Actual CI evidence at code head

```bash
python3 -m unittest discover -s tests -p 'test_roundtrip*.py' -v
# 88 Python tests — PASS / 0 FAIL

node --test tests/xml-cii-final-property-transactions.test.mjs
# 12 JS tests — PASS

node --test tests/xml-cii-final-rigid-source-context.test.mjs
# 1 JS test — PASS

node --test tests/xml-cii-standalone-output-run.test.js
# 1 JS test — PASS

python3 -m roundtrip_foundation.generate_evidence --out roundtrip-evidence
# PASS: seven synthetic/public-smoke evidence artifacts
```

**Total: 102/102 PASS** (CI; not independently re-executed by a reviewer). Python tests increased from the reviewer’s original 56 to 88; original 70 tests retained without removing their cases.

The synthetic 4-branch no-edit parity remains 23,934 bytes, SHA-256 `de2308bf6b473c305203a65cbfd8d0ea8b2fc1113fea0d17291fa148be400f57`, zero differences. Public repository-native GLRD still has **308/308** structural ELEMENT lineage (42 EXACT + 266 TRANSFORMED), **349/349** mapped final-node identities and **65/65 RIGID physical owner cases AMBIGUOUS**; no physical approval.

Historical Owner **433 ELEMENT / 144 RIGID: NOT_RUN**. It needs independent archived original CII and complete exact pinned source/config/master/engine custody. Synthetic 433/144 scale does not qualify historical parity.

## Reviewer checkpoint

1. Freeze exact PR head and independently inspect `roundtrip_foundation/full_pointer_validation.py`, `ledger_integrity.py`, changed `lineage.py` and `snapshot_replay.py`.
2. Reproduce the tests, especially `tests/test_roundtrip_review_fixes.py`.
3. Confirm no production converter, writer, XML, benchmark, UI or mass-selection policy files changed.
4. Review F1–F3 closeout and decide `CODE_PASS / AUTHENTIC_NOT_RUN` or supply a reproducible `CODE_HOLD` finding.
5. Keep PR **DRAFT / NO MERGE / NO DEPLOY** until separate Owner approval. Do not treat this producer receipt as independent verification.
