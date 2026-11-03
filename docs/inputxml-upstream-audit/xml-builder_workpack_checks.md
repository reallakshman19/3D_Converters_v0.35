# XML Builder → InputXML Work Pack checks

Baseline: `fc43c4df40793f7437aca7ab06dcf50b5edacb99`

## Capability delivered

- Explicit `LineNo` is preserved and becomes InputXML `LINE_ID`; branch name remains a diagnosed fallback.
- Explicit `OutsideDiameter` is preserved; nominal `BoreMm` is never guessed as OD.
- Explicit `InsulationDensity`, `Pressure1..9`, and `Temperature1..9` survive table → node XML → InputXML.
- New support rows serialize as `<Restraint>`; historical `<CustomRestraint>` remains compatibility-readable.
- Restraint Type is resolved first, then Direction fallback, through the Python-synchronized `restraintTypeToCaesarCode()` authority.
- Signed `+Y` emits CAESAR II type `14`; the stale private core map was removed.
- Missing coordinates remain absent and are diagnosed; `0 0 0` is not fabricated.
- `Rigid=0` does not create a `<RIGID>` child; explicit positive rigid evidence still does.
- More than six restraint rows retain the existing six fixed slots and report the dropped count.
- Short-node deletion, defaults, coordinate/value transforms, missing fields, and zero-route output are reported.
- XML Builder downloads require a positive-element InputXML result; failed rebuilds clear stale downloadable output.
- `xml-builder-inputxml-diagnostics/v1`, a collapsible diagnostics panel, and `xml_builder_diagnostics.json` are available.

## Authority decisions

- `converters/scripts/xml_to_cii2019.py::_restraint_type_to_code()` is the numeric restraint-code source of truth.
- `converters/xml-cii2019-core/restraint-type-codes.js` is its intentional JavaScript mirror.
- Generated repository benchmarks are regression fixtures only, not format authority.
- No neutral-file formatting, topology ray/filler algorithm, runtime, writer, canvas, or enrichment switch was changed.

## Focused evidence

The permanent `XML Builder InputXML` workflow passed:

- Work Pack structure and temporary-tool absence.
- JavaScript and Python syntax checks.
- Real `Benchmarks/LAUNCHERTOPO.XML` core regression.
- Existing generated benchmark comparison.
- Existing short/ray filler regression.
- XML Builder UI/diagnostics contract guards.
- Explicit table → node XML → InputXML assertions for LineNo, OD, density, P9/T9, supports, missing position, fixed restraint slots, and rigid evidence.
- Generated InputXML → `converters/scripts/inputxml_to_cii2019.py` smoke conversion with a non-empty CII `ELEMENTS` section.

## Named base-versus-head regression ledger

Result: **PASS — no new failing or removed test names.**

### JavaScript

- Base test files: 36
- Head test files: 38
- Base failing names: 20
- Head failing names: 17
- New regressions: 0
- Removed tests: 0
- Improved to passing:
  - `tests/xml-cii-node-to-inputxml-benchmark.test.js`
  - `tests/xml-cii-node-to-inputxml-core.test.js`
  - `tests/xml-cii-node-to-inputxml-fillers.test.js`

Retained baseline failures:

- `tests/standalone-static.test.js`
- `tests/xml-cii-master-context-default-rows.test.js`
- `tests/xml-cii-standalone-benchmark-validation.test.js`
- `tests/xml-cii-standalone-defaults-regression.test.js`
- `tests/xml-cii-standalone-import-masters.test.js`
- `tests/xml-cii-standalone-live-smoke.test.js`
- `tests/xml-cii-standalone-manual-element-sideload.test.js`
- `tests/xml-cii-standalone-output-run.test.js`
- `tests/xml-cii-standalone-parity.test.js`
- `tests/xml-cii-standalone-preview-diagnostics-audit.test.js`
- `tests/xml-cii-standalone-production-readiness.test.js`
- `tests/xml-cii-standalone-regex-tester.test.js`
- `tests/xml-cii-standalone-resolver-json-trace.test.js`
- `tests/xml-cii-standalone-support-type-mapper.test.js`
- `tests/xml-cii-standalone-weight-match.test.js`
- `tests/xml-cii-standalone-workflow-api.test.js`
- `tests/xml-cii-standalone-workflow-ui-adapted.test.js`

### Python pytest

- Base test cases: 88
- Head test cases: 88
- Base failing names: 10
- Head failing names: 10
- New regressions: 0
- Removed tests: 0

Retained baseline failures:

- `converters.scripts.test_nps_bore_master::test_fraction_and_mixed_fraction_inputs`
- `converters.scripts.test_nps_bore_master::test_master_table_contains_project_nominal_mapping_not_25_4_approximation`
- `converters.scripts.test_xml_to_cii2019_actual_bm8::test_actual_bm8_pipeline_outputs_insulation_density_hydro_pressure_and_cii_positions`
- `converters.scripts.test_xml_to_cii2019_actual_bm8::test_actual_repo_files_and_masters_are_present_with_expected_counts`
- `converters.scripts.test_xml_to_cii2019_master_addon.TestAddon::test_branch_without_linelist`
- `converters.scripts.test_xml_to_cii2019_master_addon.TestAddon::test_ca_sidecar`
- `converters.scripts.test_xml_to_cii2019_master_addon.TestAddon::test_class_from_linelist`
- `converters.scripts.test_xml_to_cii2019_master_addon.TestAddon::test_material_name_to_code_fuzzy`
- `converters.scripts.test_xml_to_cii2019_master_addon.TestAddon::test_material_override_wins`
- `converters.scripts.test_xml_to_inputxml_debug::test_xml_to_cii_enriched_inputxml_debug_export_contains_explicit_fields`

## Guardrails

- New diagnostics/audit/view/baseline modules are below 300 lines.
- New JavaScript modules use named exports only.
- Existing edited files have immutable pre-edit blob references in `.backups/`.
- Temporary exact-patch and correction workflows/scripts are absent from the final tree.
- Frozen benchmark bytes were not updated.
