# Configurable Engineering Libraries

Production entry point:

`engineering/hp-class-standardization/engineering-library.html`

The workspace dynamically loads reusable engineering data from repository files under:

`docs/Masters/HP_Piping_Class/`

It then wraps the controlled authority-package calculator. Library data never changes calculator equations and reaches the calculator only through explicit **Apply** actions.

## Runtime catalog

The fixed discovery entry point is:

`docs/Masters/HP_Piping_Class/library-catalog.csv`

Current catalog entries point to:

- `material-properties.csv`
- `pipe-product-overrides.csv`
- dependency: `../NPS_OD_BORE_SCHEDULE_MASTER.tsv`

The browser resolves these paths relative to the catalog and fetches them through the same-origin static site. **Reload docs CSVs** re-fetches the current repository files without rebuilding JavaScript.

## Material CSV

Path:

`docs/Masters/HP_Piping_Class/material-properties.csv`

The repository intentionally ships this file **header-only**:

```csv
material_spec,grade,condition,temperature_c,allowable_stress_mpa,yield_strength_mpa,source_ref
```

No Chapter IX `S` or `Syt` value is inferred from another project master or from a generic material family. Populate this CSV only with controlled values applicable to the selected B31.3/VIII-3 project basis.

### Applying material data

1. Reload the docs CSVs or edit rows in the UI.
2. Select one material/grade/condition group.
3. Enter the design temperature used for `S`.
4. Click **Apply material to calculator**.

The workspace evaluates:

- `S` at the entered design temperature;
- `Syt` at the average temperature of every pressure-cycle block.

An exact table point is used directly. Otherwise the workspace performs linear interpolation only between two bracketing controlled points for the same material/grade/condition.

**Extrapolation is prohibited.** If the design temperature or any cycle-average temperature falls outside the controlled range, no material values are applied.

Use **Download material CSV** to export the current material table in the same governed format for review/publication back under `docs/Masters/HP_Piping_Class/`.

## Pipe geometry + product overlay

Canonical project pipe geometry/wall source:

`docs/Masters/NPS_OD_BORE_SCHEDULE_MASTER.tsv`

Governed blob at Stage 8 implementation:

`7e83f7283b4ca9f35a86a45c008ca0b52a053fcc`

The workspace expands its NPS/schedule cells at runtime into reference product rows. It uses the same project convention already used by the existing Pipe Wall Master: `5S`, `10S`, `40S`, and `80S` are identified with the B36.19M schedule namespace; other schedule names use B36.10M.

The canonical TSV provides **reference OD and nominal wall geometry only** for this workflow. It does not establish the K304.1.1 maximum permitted purchase OD, a pipe purchase specification, or negative wall tolerance.

### Product overlay CSV

Path:

`docs/Masters/HP_Piping_Class/pipe-product-overrides.csv`

The repository ships it header-only:

```csv
nps,schedule,product_spec,design_d_max_mm,minus_tolerance_pct,source_ref
```

The overlay is merged by exact `NPS + schedule` key with the canonical pipe-master rows.

A fetched product row remains **non-applicable** until all purchase-specific fields are supplied:

- `product_spec`
- `design_d_max_mm` — project/purchase-spec maximum permitted `D` used for the Chapter IX calculation
- `minus_tolerance_pct`
- `source_ref` — purchase/tolerance source evidence

This prevents nominal/reference OD from being silently promoted to the Chapter IX maximum permitted OD.

Use **Download product overlay CSV** to export only rows that contain purchase-specific overlay data. Canonical NPS/OD/schedule/wall values are not duplicated into that CSV.

## Working-copy JSON

The existing reusable working-copy schema remains:

`hp-piping-engineering-libraries/v1`

JSON import/export is retained for session/reviewer handover. The docs CSVs are the repository-editable data format; JSON is a portable working copy.

When the docs-backed product table contains hundreds of canonical rows, working-copy JSON export includes only product rows whose purchase-specific fields are complete.

## Authority Boundary

- No proprietary ASME material table is embedded in JavaScript.
- The material CSV starts blank/header-only.
- The pipe geometry master is referenced, not copied into a competing CSV.
- Reference/nominal OD is not treated as maximum permitted purchase OD.
- No universal `-12.5%` wall tolerance is introduced.
- No material extrapolation is performed.
- A fetched row is not engineering approval.
- Values reach the calculator only after explicit Apply.
- Normal calculator validation/recalculation still governs the class result.

## Deployment

Use same-origin static HTTP hosting such as GitHub Pages. The workspace dynamically fetches relative `docs/...` files and embeds the authority-package/calculator frames; direct `file://` operation is not the supported production path.
