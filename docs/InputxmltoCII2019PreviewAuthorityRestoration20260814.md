# InputXML / PSI116 XML → CII 2019 — Mode A Preview / Weight / Run Restoration Addendum

**Date:** 2026-08-14  
**Scope:** Phase 4 Preview, Phase 6 Weight Match, consolidated rigid-weight review, and Mode A Finalize/Run orchestration; plus the core service-process fallback numeric guard.  
**Baseline:** `56f5a639edbfc629b5977abff7475ecada4a6d37`  
**Governing document:** `docs/InputxmltoCII2019Fixplan.md`

This addendum records the authority and orchestration delta implemented by the accompanying PR. It does **not** change Mode A separate-model architecture, duplicate-name policy, support/restraint authority, solver/conversion mechanics, or the rule that one XML produces one independent CII model.

## 1. Smart Map Select All

`✨ Smart Map — Unmapped Lines` now exposes **Select All**.

- It selects every currently visible workbench row.
- It does not invent or auto-fill a missing `Map To` value.
- Existing Apply validation still blocks submission while any selected row lacks a target.
- `Accept All Exact` remains the separate safe bulk-exact action.

## 2. Process authority correction

A service-derived process fallback is review/suggestion authority, not a permanent manual override.

Historical behavior could persist fallback values under `overrides.processData[lineKey]`. After a later exact/explicit Smart Map line mapping, Preview would still see the stale value as a generic `override`, allowing a value such as `T1=260` to outrank the now-authoritative mapped Line List row.

The corrected precedence is:

```text
explicit Process From / explicit manual Preview value
  > exact/explicit mapped Line List process fact
  > service-process fallback suggestion
  > configured default
```

When an exact/mapped line is present, fallback-owned fields are removed. Explicit Process From fields and Preview fields marked manual are protected.

## 3. Numeric-only service-process fallback

P1, Hydro/Test Pressure, T1, T2, T3 and Density are numerically consumed process fields. Service fallback now accepts only a numeric value (with optional trailing units).

Examples:

```text
260 °C       -> 260
4,140 kPa(g) -> 4140
Water        -> rejected
Steam        -> rejected
```

This prevents labels such as `Water` from becoming a pressure override.

## 4. DTXR actions restored in Consolidated Preview

Overall / Consolidated Preview exposes the two existing DTXR engineering actions:

1. **Update Wall thickness based on DTXR**
2. **Fetch Rating as per DTXR**

They execute as Mode A fan-out: each enabled XML is evaluated and updated independently through its own source-local configuration. No DTXR evidence or override crosses source boundaries.

The existing Consolidated Preview undo snapshot is used for these bulk actions.

## 5. Individual Preview tool visibility

Individual `Preview / Review` sections are lazy-rendered. Previously the native DTXR and B31.3 controls were not visible until a manual `Build Preview` click.

When an engineer explicitly expands an Individual Mode A Preview, it auto-builds that source once. This restores visibility of:

- **Update Wall thickness based on DTXR**
- **Fetch Rating as per DTXR**
- **Update wall thickness as per B31.3 Sec II**
- JSON Trace staged-source control and normal rebuilt Preview controls remain native.

The B31.3 action is intentionally not duplicated into consolidated batch authority because its design basis remains source-specific.

## 6. Consolidated Weight Match control restoration

The native single-source Weight Match exposes Build, DTXR Rating, preferred-candidate and inch-to-mm controls. Multi-file consolidated Weight Match now exposes equivalent workflow access:

- **Build Weight Data — All XML**
- **Use Rating as per DTXR**
- **Use all ★ preferred (exact)**
- **⇄ in→mm: ON/OFF**

Authority boundaries:

- DTXR Rating in consolidated Weight Match is an **ephemeral rerank mode**. It does not silently write DTXR Rating into Preview or source configuration.
- Leaving DTXR mode restores the original Preview-Rating candidate display and clears the transient DTXR best-candidate object; subsequent bulk acceptance cannot accidentally use a stale DTXR-reranked candidate.
- Bulk preferred acceptance is deliberately stricter than the legacy single-source label: only preferred **100% direct** candidates are eligible. Interpolated, extrapolated, inferred, factor and fallback candidates remain Review.
- The inch-to-mm option remains shared Weight Match configuration and therefore triggers a real consolidated rebuild.
- A simple `Use` or exact fill only writes the source-local `overrides.rigidWeight` value and updates the visible consolidated row in place; it no longer recomputes every XML just to display the persisted weight.

## 7. Consolidated `Rigid Weights Need Review` controls

The multi-file rigid-weight popup retains its fail-closed batch behavior and now adds two review aids:

- **Use DTXR Ratings & Refresh** — fills available Rating inputs from DTXR evidence and refreshes suggestions.
- **Use All Suggestions** — fills each visible row with its first available suggestion for engineer review.

Neither action commits a weight or Rating by itself. Source-local updates are committed only through **Apply Weights and Run All Models**.

`Skip Review` remains intentionally absent in consolidated Mode A. The batch path does not bypass unresolved rigid-weight review.

## 8. `Finalize, Run & Download ZIP`

The Finalize/Run phase now provides a one-click multi-file action:

**Finalize, Run & Download ZIP**

Its semantics are:

```text
Mode A preflight
  → consolidated rigid-weight review when required
  → sequential isolated conversion of each enabled XML
  → one final UI render
  → ZIP of successful CII files
```

“Finalize” does not imply automatic acceptance of unresolved engineering data. Existing readiness and rigid-weight gates remain authoritative.

The ZIP contains successful CII outputs only. Failed, blocked or cancelled models are excluded using the existing Mode A ZIP collector.

## 9. Multi-file responsiveness / execution policy

The previous batch loop performed a full application render before every source conversion. For a batch of N XML files this repeatedly reconstructed Preview/Weight/Run DOM and rebound controls while conversion work was also occurring.

The optimized policy is:

- conversion remains **sequential**, not `Promise.all` parallel;
- `clearModeASourceCaches()` remains a mandatory source-isolation boundary;
- lightweight progress text is updated between files;
- the browser event loop is yielded between heavy source operations;
- no full workspace render occurs inside the per-source conversion loop;
- one normal render occurs after the batch result is complete.

This is a presentation/orchestration optimization, not a solver or engineering-algorithm change. Parallel conversion is intentionally not introduced because shared browser/runtime resources and caches are not qualified for concurrent engineering execution.

## 10. Compact multi-file presentation

When two or more XML files are enabled:

- Preview and Weight Match default to **Consolidated only (fastest)**.
- A source selector opens only one individual workbench when required.
- Individual workbench bodies remain lazy-loaded.
- Run keeps the summary, manifest and ZIP actions visible while per-file readiness/results tables are collapsed by default.

This reduces DOM volume and unnecessary individual-workbench rendering without hiding engineering state; detailed per-file views remain explicitly available.

## 11. Qualification status

This PR repairs workflow authority/accessibility and reduces avoidable UI orchestration overhead. It does not, by itself, establish full CII numerical parity or production authorization.

Required evidence remains:

- exact-head browser proof;
- project-master check for a representative steam line such as `S8810371`;
- Preview → exact engine-input parity for P1/Hydro/T1/T2/T3/Density;
- final CII process-property parity where those quantities are emitted/consumed;
- Weight Match consolidated/single-source parity for representative exact and review candidates;
- rigid-review source-isolation proof;
- batch result/ZIP parity against the same models run one-by-one;
- existing geometry, OD/property and weight-conservation qualification gates.

Native Node/browser execution is **NOT_RUN** in the current connector runtime because `github.com` cannot be resolved from the native environment. Source/diff review and permanent regressions are included; unexecuted tests are not classified as PASS.
