# 5B Topology Workbench

Standalone POS-only workbench for reviewing PSI XML topology before wiring anything into the production converter path.

## Open

Open:

```text
topology-5b/index.html
```

Use either:

1. `Load bundled Launcher_XML`, which fetches `../Benchmarks/Launcher_XML`, or
2. paste PSI XML and click `Build from paste`.

The default anchor node is `210`. Change it in the toolbar if required.

## Input panel

Branch-wise collapsible panels show:

- Node
- Component type / ConnectionType
- Bore / OD mm
- Transformed X/Y/Z
- Original POS
- Anchor line: `Anchor node chosen := XX`

## Calc panel

Branch-wise collapsible panels show:

- Component instance
- RefNo
- Type
- Positive node label
- Entry XYZ
- Exit XYZ
- Internal direction
- Branch graph edges touching the branch
- Open Tee/Olet candidate ports

## Branch graph canvas

The right panel draws the branch graph and supports:

- wheel zoom
- drag pan
- Shift-drag / middle-drag orbit-rotate projection
- branch name toggle
- node label toggle as `number | Component type`
- helper component label toggle
- recovered topology edge toggle

## Topology rules

- Do not use `<Endpoint>` to decide topology.
- Use POS-only unique point sequences.
- Split component instances by contiguous `ComponentRefNo` runs, not global RefNo alone.
- Tee/Olet-capable classification uses:
  - `ComponentType = TEE / OLET`, or
  - `ConnectionType = TEE / OLET`, or
  - `ComponentType = BRAN` with `ConnectionType = TEE / OLET`.
- Exact POS contact is resolved first.
- Unresolved Tee/Olet-capable ports shoot globally, not branch-local.
- A ray target is valid only when:
  - positive ray distance;
  - inside tube tolerance;
  - `SRSS <= 3 × max(source bore, target bore)`.
- If no target passes, the port remains open/orphan candidate.
