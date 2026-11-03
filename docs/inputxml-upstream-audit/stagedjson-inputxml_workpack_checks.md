# StagedJSON → InputXML Work Pack checks

Final evidence date: 2026-07-13

## Baseline and scope

- Original audit baseline: `8cfcc3717bdad85c545509937b70615ea49f135b`
- Synchronized `main` validation base: `78d9bd4f29e0297c33f53230e3cd8729a727d00d`
- Work Pack branch: `agent/stagedjson-inputxml-audit-fix`
- Pull request: `#133`
- Primary engine: `converters/scripts/stagedjson_to_inputxml.py`
- Adjacent StagedJSON → PSI116 XML engines were audited but not rewritten.

## Delivered authority corrections

1. Coordinate dictionaries require all three finite axes; missing axes are not replaced with zero.
2. Explicit outside-diameter fields are authoritative. Nominal bore no longer becomes OD unless the user enables the compatibility switch.
3. Inline bookmark JSON works in the browser and has explicit precedence over file bookmarks and compatibility defaults.
4. `temperature2`, `temperature3`, Poisson ratio, pipe density, material number and material name are emitted from resolved defaults instead of being silently ignored or hard-coded.
5. Node start/step values are validated and bend midpoint nodes are collision-safe.
6. Historical branch sorting and automatic anchors remain compatibility behavior, but every decision is disclosed; automatic anchors can be disabled.
7. Supports select the closest eligible straight segment, not the first traversed segment.
8. Source reads, skips, merges, GASK absorption, OLET/SIF pending state, support classification/attachment, defaults, OD decisions, coordinate transforms and node coalescing are recorded.
9. The six-restraint boundary is enforced per `PIPINGELEMENT`, with retained/dropped row evidence.
10. Zero-element conversions fail and write a structured diagnostics sidecar.
11. Successful and failed browser runs surface `stagedjson-inputxml-diagnostics/v1`; failed runs remain failed after the panel renders and offers a direct JSON download.

## Diagnostics artifact

```text
<output-stem>_stagedjson_to_inputxml_diagnostics.json
```

The document contains:

```text
severity, code, message, module, stage, action,
sourcePath, sourceBranch, sourceIndex, sourceType, sourceField,
outputField, elementIndex, node, count, context
```

The Pyodide worker adds successful sidecars to the normal output list. For staged-only failed conversions, it recovers the already-written sidecar into an internal failed result; the staged UI displays/downloads the document and then throws the preserved failure message so the generic runner still reports failure.

## Focused verification

Permanent workflow: `StagedJSON InputXML`

Final green pre-sync run: `29264740066`, head `14e5f381b25f0c97c987275faac9d317ce93561b`.

Guarded synchronization run: `29264901328`. It merged exact `main` head `78d9bd4f29e0297c33f53230e3cd8729a727d00d`, passed focused verification, recalculated the named ledger against that base and removed its temporary workflow before push.

Passed checks:

- temporary patch and synchronization scripts/workflows absent;
- Python syntax for bookmark, diagnostics, converter and authority tests;
- JavaScript syntax for invocation, worker, registry, tab, panel and browser-contract tests;
- incomplete coordinate rejection with `STAGED_COORDINATE_INCOMPLETE` and `STAGED_ZERO_ELEMENTS`;
- explicit OD plus inline T1/T2/T3, wall, modulus, hot modulus, Poisson, pipe density and material propagation;
- nominal-bore strict sentinel behavior and explicit compatibility inference;
- closest support segment selection with measured 2 mm distance;
- six-slot restraint truncation per element;
- generated InputXML → `inputxml_to_cii2019.py` with non-empty CII `ELEMENTS` output;
- existing `test_coord_transform.py`;
- existing `test_chain_g4_g5.py`;
- browser registry/invocation/worker/panel contract guard;
- successful-run and failed-run diagnostics handoff;
- protected Mission J source-mode integration test.

## Named base-versus-head ledger

Artifact: `stagedjson-inputxml-baseline`, final pre-sync artifact ID `8284852468`. The synchronization job independently repeated the same named comparison against `78d9bd4f29e0297c33f53230e3cd8729a727d00d` and passed.

### JavaScript

- Base test files: `38`
- Head test files: `39`
- Base failing names: `18`
- Head failing names: `18`
- New regressions: `0`
- Removed tests: `0`

The new `tests/stagedjson-inputxml-workpack.test.js` passes. All 18 failures are retained baseline failures with identical names.

### Python pytest

- Base test cases: `88`
- Head test cases: `92`
- Base failing names: `10`
- Head failing names: `10`
- New regressions: `0`
- Removed tests: `0`

The four new staged authority tests pass. All 10 failures are retained baseline failures with identical names.

## Separate Mission 01 workflow

The broad `XML CII Standalone Mission 01` workflow remains red at its existing `xml-cii-standalone-workflow-api.test.js` step and stops before later steps. The named ledger independently runs every JavaScript test and proves that `xml-cii-standalone-source-mode-integration.test.js` passes after the deliberate shared-worker hash update.

## Frozen-hash and backup discipline

Immutable recovery manifests:

- `.backups/20260713_stagedjson_inputxml_workpack_backup.json`
- `.backups/20260713_stagedjson_inputxml_test_guard_addendum.json`
- `.backups/20260713_stagedjson_failed_diagnostics_backup.json`

The protected `py-worker.js` hash was updated only after documenting that changes are conditional on `converterId === "stagedjson_to_inputxml"` and after the protected source-mode integration test remained green.

## Compatibility boundary

Not changed:

- `stagedjson_to_xml.py` / `psi116_upstream_common.py` PSI116 XML semantics;
- browser `stagedjson-to-xml.js` PSI116 XML semantics;
- support type-code meanings;
- staged coordinate axis convention;
- downstream CII neutral writer layout;
- topology component rules except closest-segment support selection and midpoint collision safety;
- frozen generated benchmark bytes.
