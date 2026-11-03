# BM_CII component metadata resolution policy

Branch: `SupportandAnnotationstablev1b`

## Rule

InputXML component/process properties are resolved before GLB metadata stamping.

Applicable component fields:

- `DIAMETER` -> `bore`, `diameterMm`
- `WALL_THICK` -> `wallThickness`, `materialThickness`
- `MATERIAL_NAME` -> `materialName`, `Material`
- `PRESSURE1` -> `pressure`
- `HYDRO_PRESSURE` -> `hydroPressure`
- `TEMP_EXP_C1` -> `temp1`
- `TEMP_EXP_C2` -> `temp2`
- `TEMP_EXP_C3` -> `temp3`

If a component/process field is explicit, use it. If it is blank/sentinel, carry forward the previous valid component/process value. If no previous value exists, show `N/A` in the panel.

## Non-rule for supports/restraints

Carry-forward is not applicable to support/restraint records. Each support/restraint record is independent and owns its own type, node, gap, friction, stiffness, and axis/cosine.

## Line No.

BM_CII InputXML has no line number in the tested file. Line No. is resolved from node-wise sideload data:

```csv
NODE,LINE_NO
10,LINE XYZ
```

For the mock benchmark, `Node 10 -> LINE XYZ` propagates through connected component topology only. It must not propagate into supports/restraints.

## Provenance

Generation trace text such as:

```text
InputXML -> ISONOTE sideload -> BM_CII_Enriched_v8_lite.XML -> GLB support source variants
```

is provenance/debug metadata. It must be stored as `provenanceTrace`, not as `lineNo`.
