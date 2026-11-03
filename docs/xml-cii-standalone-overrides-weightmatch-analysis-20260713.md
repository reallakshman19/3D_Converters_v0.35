# XML→CII Standalone override and weight-match analysis — 2026-07-13

## Reported symptoms

1. Preview says `Saved data in local storage`, but edited data appears lost after navigating between tabs, especially `Wall Thk`, `Corrosion`, and `Material Code`.
2. Override popup labels are confusing:
   - Material Code override currently shows a material-name-style key.
   - Rating override should show the effective rating key and context clearly.
3. Piping Class override suggestions show only a small sample of known classes. It should suggest intelligently from the full loaded master but still allow manual text entry.
4. Corrosion / Wall Thickness / Material Code should resolve against the effective Piping Class override, not stale derived class context.
5. Branch Name needs an override option that can select a loaded Line List key from a dropdown/type-ahead.
6. Weight Match and Rigid Weights Need Review should populate/validate rating from DTXR text such as `150#` / `300#`.
7. Overridden rating must propagate into Weight Match ranking.
8. `Refresh Suggestions` must not make the rigid-review list disappear just because suggestions become available.

## Root-cause findings

### A. Apparent data loss after tab navigation

The most likely failure mode is stale preview/weight cache reuse, not necessarily missing LocalStorage persistence. Preview and weight caches can restore old rows after overrides are saved unless their fingerprints include the full relevant override state.

Required follow-up:

- Invalidate preview and weight caches whenever preview overrides are saved.
- Include `overrides.rating`, `overrides.processData`, `overrides.wallThickness`, `overrides.corrosion`, `overrides.materialCode`, `overrides.pipingClass`, and `overrides.branchLineKey` in cache fingerprints.

### B. Override key scope

Effective override scopes should be:

| Field | Preferred key scope |
|---|---|
| Piping Class | requested/derived class key |
| Rating | line key + branch + requested/resolved class |
| Material Code | resolved piping class, then class+bore where useful |
| Wall Thickness | resolved piping class + bore |
| Corrosion | resolved piping class |
| Branch Line Key | branch name → selected line-list key |

### C. DTXR rating source

DTXR often carries rating as text:

```text
WELDING NECK FLANGE SCH 80 300#
BRANCH FITTING FLANGE SCH XXS 150#
```

The rating detector should extract numeric rating immediately before `#`, and also tolerate `CL150` / `CLASS 300`.

Priority:

1. Manual override rating.
2. Line-list rating.
3. Piping-class-derived rating.
4. DTXR rating if no resolved rating exists.
5. DTXR validation warning if it differs from the resolved rating.

### D. Refresh Suggestions list loss

The rigid-review popup was filtering refreshed rows down to unresolved rows with no usable suggestion. Once a rating edit produced usable candidates, the row could vanish before the user applied a manual weight. The correct behavior is:

- Keep all unmapped zero-weight review rows visible after refresh.
- Update candidate chips and rating validation in-place.
- Remove a row only after a positive weight is applied or the review is skipped/cancelled.

## Code included in this PR

This PR fixes the highest-risk conversion blocker in `Rigid Weights Need Review`:

- Extracts rating from DTXR text such as `150#` / `300#`.
- Uses DTXR rating for suggestions when no rating override/line/class rating is available.
- Shows a highlighted rating input when DTXR rating conflicts with the resolved rating.
- Persists refreshed rating overrides back into the standalone config/master context.
- Keeps refreshed rigid-review rows visible until weights are applied or review is skipped.

## Remaining implementation work

Recommended next PR:

1. Add cache invalidation and full override-aware preview fingerprint.
2. Improve override popup labels and full-master type-ahead for piping class.
3. Add Branch Name → Line List key override using a datalist built from the loaded Line List.
4. Apply the same DTXR rating validation color/tooltip in the Weight Match tab, not only the run-blocking rigid review popup.
