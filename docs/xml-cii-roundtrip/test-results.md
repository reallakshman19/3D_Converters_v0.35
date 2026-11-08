# EnrichedXML ↔ CII Round-trip R1 — CI evidence receipt

Task ID: `XML-CII2019-ENRICHEDXML-ROUNDTRIP-LOSSLESS-R1`  
Repository: `reallakshman19/3D_Converters_v0.35`  
Baseline main: `3394c022f9400f05a736948033d26eb46274446c`  
Draft PR: https://github.com/reallakshman19/3D_Converters_v0.35/pull/15  
Verdict: **PARTIAL — HOLD**

## Executed at commit `d0da7e33f2882343fd0f064edcafc27544fe4ed3`

CI run: https://github.com/reallakshman19/3D_Converters_v0.35/actions/runs/42495937762

| CI execution | Cases | PASS | FAIL | Scope |
|---|---:|---:|---:|---|
| `node --test tests/xml-cii-roundtrip-foundation.test.mjs` | 6 | 6 | 0 | Snapshot custody, refusal cases, read-only lineage, injected runner labelled TEST_ONLY |
| `node --test tests/xml-cii-roundtrip-xml-patcher.test.mjs` | 6 | 6 | 0 | Lexical XML preservation, zero confirmation, stale/ambiguous refusal and atomic batch |
| `node --test tests/xml-cii-final-property-transactions.test.mjs` | 12 | 12 | 0 | Legacy direct-CII transaction regression (not source-editor qualification) |
| `node --test tests/xml-cii-final-rigid-source-context.test.mjs` | 1 | 1 | 0 | Existing source-context regression (not physical mass ownership proof) |
| `node --test tests/xml-cii-roundtrip-native-vertical-slice.test.mjs` | 1 | 1 | 0 | REAL existing Python converter, synthetic XML one-RIGID edit |

CI foundation and native-Python jobs completed **successfully** on the recorded commit. The suite uses GitHub Actions ubuntu-latest with Node 22 and system Python 3. It is not evidence of running the browser/Pyodide workflow against the Owner's configured 433/144 GLRD case.

## Real Python source edit witness — synthetic only

- Input: synthetic 2-node `PipeStressExport`, 1 ELEMENT / 1 RIGID.
- Real writer: `converters/scripts/xml_to_cii2019_runtime_custody.py`.
- Weight scale: 10, fixed in explicit invocation.
- Source original `<Weight>15</Weight>`; CII original `RIGID.weight=150`.
- Approved source edit `<Weight>2.984</Weight>`; CII regenerated `RIGID.weight=29.84`.
- No-edit replay: SHA-256 and bytes identical; zero byte differences.
- Edited output non-RIGID sections: unchanged.
- Original CII SHA-256: `a21b19e09b50030087243644f14de9977c19638ca276e0e20ac411d45fe024df`.
- Edited CII SHA-256: `73ef3cd7fe2384315f3115360d5d21c6c97537bfd6fbdfea5b5339998cbee550`.
- Direct CII patcher: **NOT used**.
- This is test-only; the patch primitive returns `engineeringQualified=false`, `publishable=false`.

## Repository GLRD smoke — real Python, not Owner configured case

Same original repository XML invoked twice through the actual Python converter with same options:
`--coords-mode first --weight-scale 10 --split-condensed-valve-flange`.

- 308 emitted ELEMENTS, 65 final RIGIDs, 49 restraints.
- 1166 source nodes in smoke XML.
- Zero byte differences (GNU `cmp`), identical SHA-256:
  `e1cd0edf8e8f6864ad1160b3a172f348518b770c6455cb1936fd9086ae54bde7`.
- Conservative one-to-one source/TO-RIGID/weight candidate probe: **0** qualifying source owners.
- The probe is not a complete original→post-Python provenance engine. It provides **no authority to edit source weights**.

## Tests NOT_RUN / gates not met

- Exact authentic Owner GLRD 433 ELEMENT / 144 RIGID no-edit replay with hydrated masters and full conversion snapshot: **NOT_RUN**.
- Original uploaded EnrichedXML → JavaScript parity → Python intermediate → CII identity trace across renumbered, split and deleted nodes: **NOT_IMPLEMENTED**.
- Mass owner allocation reconciliation per physical ComponentRefNo and complete expected output dependency set: **NOT_IMPLEMENTED**.
- Source-backed property editor UI and final XML/CII/audit downloads: **NOT_IMPLEMENTED**.
- Browser Playwright/Pyodide roundtrip for revised source XML: **NOT_RUN**.
- Mutation tests for *new* source-backed transaction code: **NOT_RUN**.
- Performance at 1k/10k/50k ELEMENTS for the *new* lineage: **NOT_RUN**.

No evidence above should be used to classify the draft as engineering GO or to merge/deploy it.
