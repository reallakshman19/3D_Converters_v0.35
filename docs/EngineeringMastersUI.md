# Engineering Masters UI

## Navigation

The standalone FormatConverters shell exposes one top-level Engineering entry:

- `Engineering Calculations`

Inside that main tab, the Engineering workspace provides these subtabs:

- `Calculations`
- `B31.3 Material Factors`
- `Empirical Weight Tuning`
- `HP Piping Class`

This keeps engineering tools grouped under one primary navigation item while preserving separate working surfaces and authority boundaries.

The extension is installed by `core/app.js` after the normal standalone runtime initializes. It deliberately avoids changing the frozen core tab registry.

## Calculations

The `Calculations` subtab hosts the centralized Engineering Calculation Console. It uses the central Engineering Calculation API and includes executable and qualification-blocked catalogue entries.

Published/roadmap calculation IDs are preserved. In particular, `PIPE.SHELL_INDENTATION` remains the stable blocked ID; the registry accepts two-or-more dot-separated identifier segments.

## B31.3 Material Factors

The subtab is a governed working-copy editor for the material identity and `S`, `E`, `W`, and `Y` master exposed by `converters/b313-material-factors`.

Features:

- family/material coverage dashboard;
- material identity viewer;
- editable S/E/W/Y candidate records;
- candidate validation;
- local draft save, JSON import, and JSON export;
- API-backed candidate calculation preview using explicit factor overrides.

Candidate edits never replace the active resolver. Publishing controlled engineering factors remains a reviewed repository/master-generation action.

## Empirical Weight Tuning

The subtab exposes the existing empirical model as a candidate working copy:

- Approach 1 size-band coefficients;
- Approach 2 constants;
- per-target/per-family stack weights `[A1 prior, collaborative ratio, cross-ratio matrix]`;
- structural validation;
- local draft save and JSON import/export;
- side-by-side active/candidate Approach 2 preview.

`createEmpiricalWeightEstimator({ model: candidate })` is used for previews, so candidate edits do not mutate the default exported estimator.

## HP Piping Class

The subtab embeds:

`engineering/hp-class-standardization/engineering-library.html`

This workspace contains the B31.3 Chapter IX straight-pipe class-standardization workflow, controlled KD evidence package, authority-package transport, and docs-backed material/product engineering libraries.

The embedded library dynamically fetches its same-origin docs catalog from:

`docs/Masters/HP_Piping_Class/library-catalog.csv`

Material/property values and purchase-specific product data remain explicit controlled inputs. Blank governed fields remain blockers.

## Deep Links

The main tab can be opened directly:

```js
window.dispatchEvent(new CustomEvent('app:switch-tab', {
  detail: {
    tabId: 'engineering-calculations',
    context: { subtabId: 'hp-piping-class' }
  }
}));
```

Legacy/existing engineering deep links remain supported. Requests such as:

```js
window.dispatchEvent(new CustomEvent('app:switch-tab', {
  detail: {
    tabId: 'b313-material-factors',
    context: { materialId: 'LTCS-A333-6', temperatureC: -46 }
  }
}));
```

or:

```js
window.dispatchEvent(new CustomEvent('app:switch-tab', {
  detail: {
    tabId: 'empirical-weight-tuning',
    context: { typeDesc: 'Flanged Gate Valve', target: 'RF/RTJ KG', rating: 300, ns: 4 }
  }
}));
```

are redirected into the `Engineering Calculations` main tab with the requested subtab active.

The active Engineering subtab is persisted separately from the application top-level tab ID.

## Governance

The UI separates four states conceptually:

1. active/published model, factor master, or controlled docs data;
2. editable candidate working copy;
3. locally saved/imported draft;
4. repository publication after validation/review.

A cell edit, local draft, fetched docs row, or UI selection never activates engineering authority by itself.
