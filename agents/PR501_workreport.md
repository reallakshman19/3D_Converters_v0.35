# PR501 — Type-3 SBC evaluation from explicit User Engineering Data

## Recovery header

- PR: #501
- Branch: `agent/vibration-sbc-user-data-calc`
- Work intent: IMPLEMENT / MERGE AUTHORIZED
- Criticality: ENGINEERING_CRITICAL
- Owner merge authorization: RECEIVED 2026-08-15
- Current base after stack repair: `main@b174caffa15b494dfc8bdb422a216875c5c3cd0f`
- Parent PR #500: MERGED as `b174caffa15b494dfc8bdb422a216875c5c3cd0f`
- Old stacked head preserved for recovery: `d3d67d87547c333b88f1d99fa6409ea79baa4935`
- Authority remains non-authorizing: engineering `NONE`, screening `NOT_AUTHORIZED`, design `false`, master `false`.

## Stack repair before merge

PR #500 was originally the base of #501. After #500 was squash-merged, simply retargeting #501 to `main` caused GitHub's ancestry-based PR diff to expand from the intended seven files to twelve files, re-showing five already-merged parent files.

This inflated review surface was not merged.

Repair performed in-place:

1. preserve all seven intended #501 file contents from old head `d3d67d87547c333b88f1d99fa6409ea79baa4935`;
2. force-reset branch `agent/vibration-sbc-user-data-calc` to merged `main@b174caffa15b494dfc8bdb422a216875c5c3cd0f`;
3. replay only the seven intended SBC-specific files;
4. require final PR diff to be seven files before merge.

The two parent files modified by #501 were replayed with their previously reviewed exact blobs:

```text
tabs/vibration-integrity-user-data-model.js
73d5c18f1cc6979e207c5353af73dc5be81cff68

tabs/vibration-integrity-user-data-shell.js
004a760d71b134d9ff5d24bf706547167acf24e6
```

## Mission / capability

Provide a bounded EI T3 Type-3 SBC evaluator using explicit User Engineering Data when governed master values are unavailable.

User workflow:

1. enter SBC scope/assessment ID;
2. choose first span WITH mass or WITHOUT mass;
3. complete the generated project-input rows and Source / basis fields;
4. evaluate Type-3 SBC;
5. inspect first/subsequent geometry modifiers, overall modifier, adjusted main-line LOF and final SBC LOF.

No numerical engineering value is silently seeded by the template. Only the user's explicit first-span mass configuration is prefilled.

## Engineering custody

```text
firstGeometry = max(C, D, E)
firstModifier = min(firstGeometry, firstLocationLof)

D = T3-1 evaluated LOF when first span has unsupported mass
  = T3-2 evaluated LOF otherwise

subsequentGeometry = max(F, G)
F = T3-3 evaluated LOF
G = T3-4 evaluated LOF
subsequentModifier = min(subsequentGeometry, 1)

overallModifier = max(firstModifier, subsequentModifier)
mainlineAdjustedLof = mainlineLof * mainlineMultiplier
SBC LOF = min(mainlineAdjustedLof, overallModifier)
```

The evaluator does not digitize, interpolate, extrapolate or reconstruct T3 curves.

## Fail-closed rules

- governed value outranks conflicting user input;
- missing exact term -> `NOT_READY`;
- duplicate exact term -> `AMBIGUOUS`;
- negative/non-finite numeric term -> blocked;
- malformed mass flag -> blocked;
- Type-3 rows receive stronger numeric/boolean validation before evaluation;
- no nearest-row fallback;
- no automatic unit conversion;
- no user entry becomes governed master data.

## Independent regression constraints

Focused regressions retain:

```text
worked-example pattern:
first modifier       0.7
subsequent modifier  0.6
overall modifier     0.7
main-line adjusted   1.42
final SBC LOF        0.7

independent no-mass case:
T3-2 route
first geometry       0.4
subsequent geometry  0.3
overall modifier     0.4
adjusted mainline    0.284
final SBC LOF        0.284
```

Separate table validation checks nonnumeric Type-3 input is `INCOMPLETE` before calculation.

## Intended changed-file ledger

```text
agents/PR501_workreport.md
converters/vibration/sbc/type3-user-data.js
tabs/vibration-integrity-sbc-type3-view.js
tabs/vibration-integrity-user-data-model.js
tabs/vibration-integrity-user-data-shell.js
tests/vibration-sbc-type3-user-data.test.mjs
tests/vibration-sbc-type3-user-data-table-validation.test.mjs
```

No FIT/AIV equations, master/source-register files, workflows or dependencies are part of this PR.

## Validation truth

- Source / architecture / authority inspection: PASS.
- Parent #500 merge and in-place stack repair: PASS by GitHub state/diff inspection.
- Repository-native focused tests: NOT_RUN in this connector-only environment.
- Coordinated vibration release suite: NOT_RUN.
- Real-browser template/edit/evaluate acceptance: NOT_RUN.
- Exact controlled EI PDF reconciliation: NOT_RUN / BLOCKED_ENVIRONMENT.
- Owner has explicitly elected to merge now and validate later; this does not change the above validation classifications or engineering authority.

## Merge gate

Merge is authorized by Owner provided final live reconciliation proves:

```text
base = current main containing #500
changed files = exactly the seven-file ledger above
PR = mergeable
head = exact guarded SHA used in merge call
```

After merge, verify `main` points to the returned merge SHA and PR #501 reports merged/closed.
