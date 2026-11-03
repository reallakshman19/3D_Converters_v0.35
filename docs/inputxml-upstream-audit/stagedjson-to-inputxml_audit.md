# StagedJSON → InputXML upstream audit

Baseline: `8cfcc3717bdad85c545509937b70615ea49f135b`

## Scope and live call path

The active direct InputXML path is:

```text
tabs/model-converters/converter-registry.js
→ generic Model Converters runner
→ converters/py-worker.js
→ converters/invocation-builder.js
→ converters/scripts/stagedjson_to_inputxml.py
→ converters/scripts/inputxml_bookmark.py
→ converters/scripts/support_restraint.py
→ CAESAR II InputXML + worker outputs
```

Two adjacent paths must not be conflated with this converter:

```text
StagedJSON → PSI116 XML (browser JS)
  tabs/model-converters/converters/stagedjson-to-xml.js

StagedJSON → PSI116 XML (Python worker)
  converters/scripts/stagedjson_to_xml.py
  → converters/scripts/psi116_upstream_common.py
```

`psi116_upstream_common.py` is therefore not the live implementation of `stagedjson_to_inputxml`. It remains in this audit only as duplicate/adjacent conversion evidence.

## Evidence hierarchy

1. Explicit values and geometry carried by the staged hierarchy.
2. The live upstream staged producer, especially `converters/rmss-attribute-parser.js`.
3. The live InputXML consumer and downstream `inputxml_to_cii2019.py` integration behavior.
4. Existing project tests for regression only.
5. B7410250 bookmark defaults for compatibility only, not independent format authority.
6. Undocumented heuristics must remain visible as diagnostics or be disabled; they must not masquerade as source data.

The existing benchmark-derived defaults and generated repository outputs are not used as authority for staged field semantics.

## Findings

### F1 — The original module description points to the wrong converter

`stagedjson_to_xml.py` and `psi116_upstream_common.py` create PSI116 source XML. The direct `StagedJSON -> InputXML` registry entry invokes `stagedjson_to_inputxml.py` instead.

**Decision:** harden `stagedjson_to_inputxml.py` and its real dependencies. Audit the PSI116 XML paths as adjacent implementations only; do not merge their defaults or topology rules into InputXML.

### F2 — Missing coordinate axes are fabricated as zero

`pt()` accepts a coordinate dictionary when only one or two axes exist because missing keys default to `0`. Unknown geometry can therefore become apparently valid origin/plane geometry.

**Approved correction:** require all three finite coordinate axes for dictionary coordinates. Reject incomplete/invalid coordinates and record the source path, component and field. Do not complete coordinates silently.

### F3 — Nominal bore is guessed as outside diameter

`_bore_od()` reads nominal-bore aliases and `od_from_bore()` applies a four-entry lookup; unmatched values are returned unchanged as OD. The upstream staged producer explicitly preserves nominal bore values and does not convert them.

**Approved correction:** read explicit OD aliases first. Do not map nominal bore to OD by default. When only bore is available, emit the InputXML sentinel and a provenance diagnostic. Preserve an explicitly named opt-in compatibility switch for legacy bore-to-OD inference; every inferred value must identify the rule used.

### F4 — Bookmark configuration is exposed as a browser path that cannot exist

The registry exposes `inputxmlBookmark` as a text field. The invocation builder passes it to `--bookmark`, whose Python type is `Path`. A browser user cannot create an arbitrary Pyodide file merely by entering JSON text in this field.

**Approved correction:** retain `--bookmark` for CLI compatibility and add an inline bookmark JSON contract. Expose it as a JSON editor and pass it through an explicit `--bookmark-json` argument.

### F5 — Bookmark fields are accepted but ignored during serialization

`InputXmlDefaults` supports `temperature2`, `temperature3`, `poissons`, `pipe_density`, `material_num` and `material_name`. The serializer emits sentinels or hard-coded constants instead.

**Approved correction:** use the resolved defaults on the full-context element and diagnose whether each value came from CLI, inline bookmark, bookmark file or compatibility default. Add the missing material-number browser option.

### F6 — Branch order and node numbering are changed silently

`order_branches()` sorts branches by descending PIPE-child count. This can change source order, node allocation, first-element context and the branch selected for automatic anchoring.

**Approved correction:** retain the compatibility order for this Work Pack, but emit an ordered before/after decision record whenever the order changes. Do not present the sorted order as source order.

### F7 — The first generated model node is always anchored

`detect_anchors()` anchors the first element of the first sorted branch. It also adds anchors for zero-delta BEND starts and external `TREF` endings. These are inferred engineering restraints, not explicit staged rows.

**Approved correction:** retain the current compatibility default, expose a bookmark/CLI switch to disable automatic anchors, and report every inferred anchor with its rule and node. Explicit supports remain separate evidence.

### F8 — Node coalescing and bend-node allocation are implicit

`NodeAllocator.get_or_alloc()` coalesces points by integer rounding. `alloc_mid()` uses `to_node - 1`, which can collide when node spacing is small or a node is already allocated.

**Approved correction:** record coordinate coalescing decisions and make midpoint allocation collision-safe while preserving the legacy preferred number when it is available. Validate positive node start/step values.

### F9 — Components can disappear without row-level evidence

Missing APOS/LPOS/center geometry, unsupported types, zero/short runs, absorbed GASKs, dropped OLET rows and merged TEE/OLET sequences can remove or combine staged records. Current stdout exposes only aggregate counts.

**Approved correction:** create one structured record for every read, emit, merge, absorb, skip, default and drop decision. Preserve existing topology rules unless a focused test proves a defect.

### F10 — Pending OLET/SIF state can be lost

OLET rows are held as pending state and applied to a later element. End-of-branch, missing-geometry and alternate merge paths can clear or strand this state without a diagnostic.

**Approved correction:** diagnose the source OLET, target element and any unresolved pending SIF at branch completion.

### F11 — Support collection drops unresolved supports

`_collect_supports()` only returns SUPPORT rows with a resolvable position. Missing-position and unclassified supports are absent from the current statistics.

**Approved correction:** include them in the diagnostic ledger as skipped source rows. Preserve the classifier result, exclusion rule and source attributes used.

### F12 — Support snapping chooses the first segment, not the closest

`apply_support_restraints()` stops at the first eligible straight segment within tolerance. With multiple nearby runs, traversal order can select a more distant segment.

**Approved correction:** evaluate all eligible straight segments and choose the lowest perpendicular distance, then stable element index. Record candidate count, distance and selected element.

### F13 — Fixed six-restraint slots truncate source rows silently

`_restraint_rows_for_element()` returns `rows[:6]`. An inferred anchor plus multi-DOF supports can exceed six rows.

**Approved correction:** retain the six-slot compatibility boundary and issue a warning identifying the element, retained rows and dropped rows. Do not expand the fixed array without format authority.

### F14 — Zero-element output is reported as success

The converter can write a valid-looking `PIPINGMODEL NUMELT="0"` and exit successfully after all components were skipped.

**Approved correction:** treat zero generated elements as a failed conversion. Preserve diagnostics explaining every skipped source row and the zero-output decision.

### F15 — No dedicated diagnostics artifact or panel exists

The Python converter prints aggregate text only. The worker returns one XML output and the generic UI has no staged-specific structured view.

**Approved correction:** add `stagedjson-inputxml-diagnostics/v1`, write `<output>.diagnostics.json`, surface it through `py-worker.js`, and render a collapsed diagnostics panel for the selected converter. Auto-open the panel for warnings/errors. The JSON remains a normal downloadable output.

### F16 — Stale documentation contradicts the runtime

The converter docstring says SUPPORT rows are dropped and no restraints are emitted, while the later support pass inserts restraint rows.

**Approved correction:** update documentation and tests to reflect the live support pipeline.

## Field/source authority matrix

| Output field / decision | Primary source | Compatibility fallback | Required evidence |
|---|---|---|---|
| branch processing order | source list | PIPE-count sort | before/after order and rule |
| node number | allocator config | start 10 / step 10 | allocation/coalescing record |
| `DELTA_X/Y/Z` | complete APOS/LPOS geometry | near-zero sentinel | transform and threshold record |
| absolute geometry comment | complete transformed coordinates | omitted | source path and axis/datum transform |
| `DIAMETER` | explicit OD aliases | sentinel; optional legacy inference | source field or inference rule |
| `WALL_THICK` | resolved bookmark/CLI default | 0.01 compatibility default | origin and first-context decision |
| `TEMP_EXP_C1..3` | resolved bookmark/CLI defaults | benchmark-derived defaults | origin for each case |
| `MODULUS/HOT_MOD1` | resolved defaults | benchmark-derived defaults | origin and temperature choice |
| `POISSONS` | resolved defaults | 0.292 compatibility default | origin |
| `PIPE_DENSITY` | resolved defaults | 0.007833 compatibility default | origin |
| `MATERIAL_NUM/NAME` | resolved defaults | 1 / LOW CARBON compatibility | origin |
| BEND child | explicit/derived bend geometry | sentinel/no BEND | source component and radius method |
| RIGID child | FLAN/GASK rule | none | absorption/rigid rule |
| SIF slot | TEE/OLET rule | none | source component and target node |
| RESTRAINT rows | classified SUPPORT or auto-anchor | current config | classifier/anchor rule and truncation |
| node names | support stress-name attribute | NAME/blank | source attribute |

## Diagnostics contract

Each record will contain:

```text
severity, code, message, module, stage, action,
sourcePath, sourceBranch, sourceIndex, sourceType, sourceField,
outputField, elementIndex, node, count, context
```

Representative codes:

```text
STAGED_SOURCE_BRANCH_READ
STAGED_SOURCE_COMPONENT_READ
STAGED_BRANCH_ORDER_CHANGED
STAGED_COORDINATE_INCOMPLETE
STAGED_COORDINATE_TRANSFORMED
STAGED_COMPONENT_SKIPPED
STAGED_COMPONENT_MERGED
STAGED_GASK_ABSORBED
STAGED_OLET_SIF_APPLIED
STAGED_OLET_SIF_UNRESOLVED
STAGED_OD_EXPLICIT
STAGED_OD_MISSING
STAGED_OD_INFERRED_COMPAT
STAGED_DEFAULT_APPLIED
STAGED_NODE_COALESCED
STAGED_ANCHOR_INFERRED
STAGED_SUPPORT_CLASSIFIED
STAGED_SUPPORT_UNCLASSIFIED
STAGED_SUPPORT_UNSNAPPED
STAGED_SUPPORT_ATTACHED
STAGED_RESTRAINT_SLOT_TRUNCATED
STAGED_ZERO_ELEMENTS
```

## Duplicate and shared-code classification

- `stagedjson_to_inputxml.py`: live direct InputXML engine.
- `inputxml_bookmark.py`: shared defaults contract for the direct engine.
- `support_restraint.py`: shared support classification for the direct engine.
- `stagedjson_to_xml.py` + `psi116_upstream_common.py`: adjacent Python PSI116 XML path.
- `tabs/model-converters/converters/stagedjson-to-xml.js`: adjacent browser PSI116 XML path.
- `rmss-attribute-parser.js`: authoritative staged-hierarchy producer evidence, not an InputXML serializer.
- B7410250 and BM1 artifacts: regression/compatibility fixtures only.

## Approved implementation boundary

1. Add a pure Python diagnostics collector/serializer and browser diagnostics view.
2. Add inline bookmark JSON and propagate currently ignored defaults.
3. Reject incomplete coordinate dictionaries; never fabricate missing axes.
4. Add explicit OD authority and disable nominal-bore guessing by default.
5. Validate allocation inputs and make midpoint allocation collision-safe.
6. Diagnose retained branch ordering and automatic anchors; add an opt-out for auto anchors.
7. Select the closest eligible support segment.
8. Diagnose every skipped/merged component and fixed-slot truncation.
9. Fail zero-element conversions.
10. Surface the sidecar as a downloadable output and collapsible panel.
11. Add real staged-table fixtures, downstream InputXML→CII smoke validation, and named base-versus-head JavaScript/Python regression gates.
12. Do not rewrite the adjacent PSI116 XML engines, support code meanings, topology component rules, neutral-file writers or frozen benchmark bytes without separate authority.