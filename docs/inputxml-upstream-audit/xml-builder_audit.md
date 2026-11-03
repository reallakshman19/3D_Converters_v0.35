# XML Builder → InputXML upstream audit

Baseline: `fc43c4df40793f7437aca7ab06dcf50b5edacb99`

## Scope and live call path

The standalone XML Builder uses this live path:

```text
tabs/xml-builder-tab.js
→ collectCustomState()
→ converters/xml-cii2019-core/custom-input-api.js
→ custom-input-table-parser.js
→ custom-input-model.js
→ custom-input-xml-builder.js
→ tabs/model-converters/xml-cii-node-to-inputxml-core.js
→ XML Builder output storage / downloads / topology preview
```

The XML Builder calls `buildInputXmlFromNodeXml()` with:

- `applyEnrichment: false`
- `buildProfile: "xml-builder"`
- `jobName: "XML_BUILDER"`

It does not call the Python InputXML→CII converter while building the artifact.

## Evidence hierarchy

1. `3D_Viewer/Benchmarks/XML to CII 2019/PSI116.xsd` for the source node XML field names and optionality.
2. Explicit table values entered by the user.
3. Existing real node XML sample `Benchmarks/LAUNCHERTOPO.XML` for regression and topology integration only.
4. Existing generated InputXML benchmark for regression only; it is not independent vendor authority.
5. Existing code defaults are compatibility behavior unless independently justified.

The CAESAR neutral-file reference is not used to invent InputXML field semantics in this Work Pack.

## Findings

### F1 — Custom restraints are silently dropped

`custom-input-xml-builder.js` emits `<CustomRestraint>`, but `xml-cii-node-to-inputxml-core.js` reads only `<Restraint>`. A support row can therefore appear in generated node XML and disappear entirely from generated InputXML.

The sample row also uses `RestraintType=REST` with `Direction=+Y`. `REST` is not a concrete entry in the existing restraint map, while `+Y` is. Direction is currently ignored.

**Approved correction:** emit schema-shaped `<Restraint>` records. Prefer a recognized/numeric explicit type; otherwise use an explicit recognized/numeric direction. Preserve backward compatibility by continuing to read historical `<CustomRestraint>` records and diagnose the compatibility path.

### F2 — Explicit line ID is ignored

The model supports `lineKey` and the node XML writer emits `<LineNo>`, but the parser does not expose a reliable `LineNo` alias and the InputXML core always emits the branch name as `LINE_ID`.

**Approved correction:** add an explicit `LineNo`/`LineKey` table field and use it as `LINE_ID` authority when present; retain branch name only as a diagnosed fallback.

### F3 — Insulation density is parsed but never emitted

The InputXML core parses branch `<InsulationDensity>`, but writes `INSUL_DENSITY=-1.0101` unconditionally.

**Approved correction:** emit the explicit numeric insulation density on the full-context element; retain the sentinel only when source data is absent or invalid and report it.

### F4 — Missing positions are fabricated

The custom node XML writer substitutes `0 0 0` when a position is missing. This converts unknown geometry into apparently valid geometry and can create false zero-length or origin-based routes.

**Approved correction:** omit `<Position>` when it is unknown. The topology/InputXML core will exclude the node and issue a row-level diagnostic.

### F5 — Outside diameter has no source field

The table collects `BoreMm`, while the node XML and InputXML require `OutsideDiameter`/`DIAMETER`. The writer currently emits an empty `<OutsideDiameter>` and the InputXML core emits a sentinel.

Nominal bore is not authoritative outside diameter. Mapping `BoreMm` directly to OD is rejected.

**Approved correction:** add an explicit `OutsideDiameter` column/alias. When absent, preserve the sentinel and report the missing field.

### F6 — Pressure and temperature cases can be silently ignored

The XSD supports nine pressure and nine temperature values. The table/model/writer currently preserve only `P1` and `T1..T3`; user-provided `P2..P9` and `T4..T9` are parsed as unknown keys and then discarded.

**Approved correction:** preserve explicit `P1..P9` and `T1..T9` values end-to-end.

### F7 — Fixed-position child arrays can discard source rows

InputXML emission has two SIF slots and six restraint slots. More than six source restraints are currently truncated without evidence.

**Approved correction:** preserve the existing fixed slot count for compatibility and issue a diagnostic identifying the node and dropped row count. Do not expand the array without format authority.

### F8 — Short-node deletion has no row evidence

The XML Builder defaults to dropping nodes with calculated `ElementLengthMm <= 6 mm`. The summary only reports resulting model counts and does not identify removed nodes.

**Approved correction:** retain the option and threshold, but record every removed node, branch, calculated length, threshold and action.

### F9 — Defaults and transforms are not traceable

The following behavior is retained but must be diagnosed rather than presented as source data:

- default component type `PIPE`, endpoint `1`, rigid flag `0`;
- zero defaults for weight, wall thickness, corrosion and insulation thickness in generated node XML;
- CAESAR coordinate transform `(x, z, -y)` and delta transform `(dx, dz, -dy)`;
- values below 0.5 mm replaced by sentinel `-1.0101`;
- fluid-density division by `1,000,000`;
- rigid weight multiplication by `10`;
- material-number fallback `1`;
- default tee SIF type `5`;
- full branch context only on the first element unless explicitly repeated;
- constant modulus, hot-modulus, Poisson and pipe-density values.

No numerical default or transform is changed in this Work Pack without independent authority.

### F10 — Zero-route builds can appear successful and stale outputs survive failures

`buildInputXmlFromNodeXml()` returns `ok: true` even when no route element is generated. The XML Builder can also retain previous downloadable output after a new build fails.

**Approved correction:** keep the core API compatible, but mark zero-route output as an error diagnostic and make the XML Builder disable/clear downloadable InputXML on zero-route or failed builds.

### F11 — No dedicated diagnostics artifact

The UI exposes only JSON summaries. There is no stable row-level schema, collapsible panel or dedicated sidecar.

**Approved correction:** add `xml-builder-inputxml-diagnostics/v1`, a collapsible diagnostics panel and downloadable `xml_builder_diagnostics.json`.

## Field/source authority matrix

| Output field | Primary source | Fallback/default | Decision |
|---|---|---|---|
| `LINE_ID` | explicit `LineNo` / `lineKey` | branch name | explicit value wins; fallback diagnosed |
| `DIAMETER` | explicit `OutsideDiameter` | sentinel | never infer from `BoreMm` |
| `WALL_THICK` | node/branch wall thickness | existing zero/sentinel behavior | retain and diagnose |
| `CORR_ALLOW` | node/branch corrosion allowance | existing zero/sentinel behavior | retain and diagnose |
| `INSUL_THICK` | node/branch insulation thickness | existing zero/sentinel behavior | retain and diagnose |
| `INSUL_DENSITY` | branch insulation density | sentinel | fix explicit propagation |
| `FLUID_DENSITY` | branch fluid density | sentinel | retain existing scale transform and diagnose |
| `PRESSURE1..9` | branch `P1..P9` | sentinel | preserve all explicit cases |
| `TEMP_EXP_C1..9` | branch `T1..T9` | sentinel | preserve all explicit cases |
| `MATERIAL_NUM` | node material code, then branch material number | `1` | retain fallback and diagnose |
| `LINE/FROM/TO names` | explicit branch/node names | blank | preserve |
| restraint `TYPE` | recognized/numeric type, then recognized/numeric direction | sentinel | diagnose resolution or failure |
| restraint slots | first six source restraints | remaining rows dropped | preserve fixed array; diagnose drops |
| coordinates/deltas | explicit three-value position | node excluded | never fabricate origin position |

## Duplicate definitions and shared-code classification

- `tabs/xml-builder-tab.js` is the standalone launcher and output UI.
- `custom-input-*` modules are the XML Builder’s synthetic-source pipeline.
- `xml-cii-node-to-inputxml-core.js` is shared with the 5C XML→InputXML panel. Changes must preserve 5C public exports and existing topology behavior.
- `xml-cii-topology-5c-panel.js` is a separate caller, not a duplicate implementation.
- Existing generated benchmarks are regression fixtures only.

## Approved implementation boundary

1. Add a pure diagnostics record/document serializer and UI view.
2. Preserve explicit line ID, OD, insulation density and all nine pressure/temperature cases.
3. Correct restraint serialization/parsing and direction fallback.
4. Remove fabricated position defaults.
5. Add diagnostics for source reads, omissions, defaults, transforms, fixed-array truncation and short-node deletion.
6. Add zero-route/stale-output UI safeguards.
7. Add real-sample and synthetic explicit-field regression tests plus downstream Python-converter smoke validation.
8. Do not alter topology ray/short filler algorithms, neutral-file formatting, enrichment behavior, writer/runtime/canvas selection or frozen benchmark bytes unless a test proves an intended semantic change.
