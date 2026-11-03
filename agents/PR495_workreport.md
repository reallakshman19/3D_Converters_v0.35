# PR495 — Mode A Preview / Weight / Fast Run Work Report

See PR #495 body and `docs/InputxmltoCII2019PreviewAuthorityRestoration20260814.md` for the complete implementation/authority record.

## Current recovery header

| Field | State |
|---|---|
| Mission | Restore Mode A Preview/Weight controls, process authority, and multi-file responsiveness. |
| Branch | `agent/mode-a-preview-dtxr-process-fix` |
| Grounded main | `56f5a639edbfc629b5977abff7475ecada4a6d37` |
| Merge authority | NOT GRANTED. |
| Model isolation | One XML → one independent CII model; unchanged. |
| Batch execution | Sequential and source-isolated; no parallel engineering execution. |
| Native tests | NOT_RUN / INFRASTRUCTURE_BLOCKED — runtime cannot resolve `github.com`. |
| Browser acceptance | NOT_RUN. |

## Implemented in this PR

- Smart Map Select All.
- Stale service-process fallback cleanup after exact/explicit line mapping.
- Numeric-only P1/Hydro/T1/T2/T3/Density service fallback.
- Consolidated Preview DTXR Wall + Rating actions.
- Individual Preview lazy auto-build for native DTXR/B31.3 controls.
- Consolidated Weight Match controls: Build All XML, DTXR Rating rerank, exact preferred bulk use, inch→mm toggle.
- In-place source-local Weight Match accepts instead of full batch recompute.
- Consolidated rigid review helpers: DTXR Ratings & Refresh, Use All Suggestions; no Skip Review.
- `Finalize, Run & Download ZIP`.
- Fast sequential batch orchestration with no full workspace render inside the per-source conversion loop.
- Compact multi-file Preview/Weight individual selector and collapsed Run detail tables.

## Required acceptance before merge

- representative 15-file browser responsiveness check;
- `S8810371` project-master/Steam process-authority check;
- consolidated Weight Match parity versus equivalent single-source runs;
- rigid review DTXR/refill check;
- one-click Finalize/Run/ZIP check;
- batch CII/ZIP parity versus the same sources run individually.

Do not merge without fresh owner authorization.
