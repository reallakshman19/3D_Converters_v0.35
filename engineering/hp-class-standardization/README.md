# High Pressure Piping Class Standardization Tool

Dependency-free static web application for the **piping-class standardization** portion of ASME B31.3-2024 Chapter IX.

## Entry points

Recommended application route:

**Engineering → Engineering Calculations → HP Piping Class**

The main Engineering navigation now exposes one top-level **Engineering Calculations** tab with internal subtabs for:

- Calculations
- B31.3 Material Factors
- Empirical Weight Tuning
- HP Piping Class

Direct technical entry points remain available:

- `engineering-library.html` — full HP class workspace with docs-backed engineering libraries and authority-package wrapper.
- `authority-package.html` — controlled class-record JSON transport around the calculator.
- `index.html` — calculator-only view with no persistence/data-library wrapper.

Serve the repository through GitHub Pages or another same-origin static HTTP host. The HP workspace dynamically fetches governed files under `docs/Masters/HP_Piping_Class/` and embeds same-origin frames; direct `file://` behavior is not the supported production path.

## Workflow

1. **Design Basis** — Code/material/product identity, dimensions, allowances and pressure-design inputs.
2. **Static Wall** — K304.1.1/K304.1.2 pressure wall, Eq. (35a) rating QA and candidate-wall pass/fail.
3. **Pressure Cycles** — editable `Pmin`, `Pmax`, `Tmin`, `Tmax`, cycle-average `Syt` and lifetime count `n`.
4. **KD Qualification** — controlled KD-2 pressure stress-state package, source-gated KD-312 `Seq`, approved fatigue-curve `Ni`, cumulative usage and fracture/KD-4 disposition.
5. **Class Envelope** — bounded piping-class release review. The application stops here.

## Controlled sources

- B31.3-2024: `reallaksh19/Common` commit `00f47512e96780ebab10416dcc9354f719346457`, blob `3395ececce7731053dd0f6317008b4cd77446b78`.
- BPVC VIII-3 Article KD-2: commit `4dd651abbc86310077eaace6caa8b6788c1a6697`, blob `8f20cd0dab683d28359e02207f6f65b834144ec9`.
- BPVC VIII-3 Article KD-3: commit `f4d49f2a47d970ae0abf913b537193e324556177`, path `kd-3.pdf`, blob `e6abaddb7833eb0a61c9460ae39201e2252dc596`, size `1179548` bytes.

The exact KD-3 binary is source-locked, but the application does not infer its edition or project applicability. Source edition, project VIII-3 edition and compatibility remain explicit reviewer gates.

## Docs-backed engineering libraries

The reusable data discovery file is:

`docs/Masters/HP_Piping_Class/library-catalog.csv`

Current governed files include:

- `material-properties.csv` — intentionally header-only until controlled Chapter IX `S/Syt` values are published;
- `pipe-product-overrides.csv` — purchase-specific product specification, maximum permitted/design `D`, negative wall tolerance and source evidence;
- dependency `docs/Masters/NPS_OD_BORE_SCHEDULE_MASTER.tsv` — existing project NPS/OD/schedule/wall geometry master.

Reference OD from the geometry master is not treated as K304.1.1 maximum permitted purchase `D`. The product overlay must explicitly supply `design_d_max_mm` before a product row can apply.

No material extrapolation is permitted. No universal `-12.5%` wall tolerance is assumed.

## Controlled authority package

`authority-package.html` adds a transport layer around the unchanged calculator. The package schema is:

`hp-piping-class-authority-package/v1`

A package contains:

- package ID, revision, project/class reference, preparer/checker and lifecycle;
- exact B31.3/KD source manifest;
- design/material/product inputs;
- pressure-cycle spectrum;
- KD-2/KD-3 route/evidence controls;
- fatigue-curve points and approvals;
- row-level Seq/Ni/evidence values;
- recalculated audit snapshot.

Import validates the source/schema package before mutating the calculator, recalculates after input restore, restores row evidence only against exact recalculated keys, and recalculates again. Snapshot values are audit-only and never solver authority.

## Authority boundary

The application supports a bounded straight-pipe pressure-fatigue class-standardization route. It does not claim universal fatigue qualification for all components or actual routed piping systems.

Controlled engineering data, Code source applicability and reviewer evidence remain explicit release gates.