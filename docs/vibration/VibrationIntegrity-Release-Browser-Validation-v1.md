# Vibration Integrity — Release + Browser Validation v1

## Validation identity

```text
Repository   reallaksh19/3D_Converters
PR           #448
Tested head  15ae220f1e3211f4449bfbc80f3caa624e23a0ec
Base         e37a9e3a3991c5cbc839dd37a5bd7c6f84c8392f
Executed     2026-08-13T02:15:23Z
```

Machine-readable record:

```text
ValidationRecords/VibrationIntegrity/vibration-fit-release-browser-validation-v1.json
```

This record does **not** grant engineering, screening, or design authority.

## Final gate decision

```text
npm run verify:vibration-fit-release     FAIL
browser product gate                     FAIL_WITH_RUNTIME_ENVIRONMENT_BLOCKER
engineeringAuthority                     NONE
screeningAuthority                       NOT_AUTHORIZED
designAuthority                          false
```

The PR must not claim these gates are complete from this execution.

## 1. Full 43-file release gate

The exact release command was executed:

```bash
npm run verify:vibration-fit-release
```

The real command started the **43-file** controlled manifest and stopped at the first failing group because the release script is intentionally fail-fast.

To characterize the entire manifest, all five groups were then executed independently against the same tested-head reconstruction.

### Diagnostic totals

```text
Total test executions    258
PASS                     233
Genuine FAIL              16
Environment blocked        9
```

The environment-blocked checks are reported separately and are not counted as code PASS or code FAIL.

### Group results

| Group | Tests | Pass | Genuine fail | Env blocked | Decision |
|---|---:|---:|---:|---:|---|
| engineering-core-console | 27 | 19 | 8 | 0 | FAIL |
| fit-engineering-evidence | 62 | 61 | 0 | 1 | PARTIAL / ENV BLOCKED |
| vibration-facility-tabular | 77 | 67 | 2 | 8 | FAIL + ENV BLOCKED |
| vibration-workspace-ui | 77 | 71 | 6 | 0 | FAIL |
| vibration-multimechanism-validation | 15 | 15 | 0 | 0 | PASS |

### Engineering-core failures

Eight exact-head failures were reproduced:

1. VIB family landing registered-authority-state count;
2. blocked vibration calculator execution presentation;
3. canonical registry grammar / missing `domainModel` state;
4. B31.3 direct-factor benchmark mismatch;
5. empirical documented-sample mismatch;
6. non-implemented qualification-state fail-close contract;
7. validation/resolution pressure-conversion contract;
8. batch result isolation/immutability count.

The failing tests and their underlying engineering-core/console/registry/adapters were SHA-compared with the exact GitHub `15ae220f…` blobs before classification. Those paths are outside PR #448's changed-file list, so they appear to pre-exist this PR, but they still block the requested exact-head release gate.

### FIT evidence group

**61/62 executable checks passed.** The only unexecuted check is the retained workbook extractor because this runner cannot install the exact project dependency `xlsx@0.18.5`: direct git/npm/CDN access is blocked.

This is recorded as `ENVIRONMENT_BLOCKED`, not PASS and not a source-code failure.

### Facility/tabular group

Two genuine deterministic-equivalence regressions remain:

```text
parsed exchange + CSV tables matches direct parsed-data facility workflow
one-call workflow equals the direct lower-level composition
```

In both cases, equivalent engineering executions differ in execution metadata (`executionId` / timestamp), so strict deep equality fails.

Eight additional five-sheet XLSX checks are environment-blocked by the unavailable `xlsx` dependency.

### Workspace/UI group

Six exact-head failures remain.

The most important failure for the requested browser gate is:

```text
UI makes Engineering basis primary while Source Data stays the backing editor contract
```

This is a **PR #448 regression**. Exact-head `tabs/vibration-integrity-input-view.js` no longer imports or renders:

```text
renderVibrationEngineeringBasis(inputState)
```

The PR also removes the backing-table source-cell `id` anchors and removes the joined Source Data navigation surface. The pure Engineering-basis projection tests still pass, but its required visible production consumer is no longer present.

Other workspace failures are:

- explicit `EI_PUBLISHED_EXAMPLE` provenance token is not rendered;
- a non-calculated/zero FIT state can render as a synthetic calculated zero;
- required five-sheet XLSX visible contract wording is absent;
- `converters/vibration/exchange/parse-workbook.js` hits the permanent 300-line module boundary;
- AIV UI static authority test detects forbidden numerical/math syntax.

### New Stage 6–11 validation

The new multi-mechanism group is clean:

```text
15 / 15 PASS
```

It covers EI T2.3 Mechanical, standard T2.6 Deadleg, T2.8 dry-gas opening, and the consolidated worked-example validation-record semantics.

## 2. Real-browser acceptance

### Browser runner

```text
Chromium      144.0.7559.96
CDP control   PASS
smoke         Runtime.evaluate(1+1) = 2
```

Chromium itself launches and is controllable.

### Application navigation blocker

The managed browser policy blocks the application **before application code executes**.

Attempted navigation:

```text
http://127.0.0.1:8765/index.html     net::ERR_BLOCKED_BY_ADMINISTRATOR
http://app.test:8765/index.html      net::ERR_BLOCKED_BY_ADMINISTRATOR
file:///tmp/site/index.html          net::ERR_BLOCKED_BY_ADMINISTRATOR
```

The second attempt used a Chromium host-resolver mapping from `app.test` to `127.0.0.1`. The third used `--allow-file-access-from-files`. Both were still blocked by policy.

Therefore the interactive browser actions below are **NOT_RUN_ENVIRONMENT_BLOCKED**:

- complete XLSX load/edit/revert;
- CSV load/edit/revert;
- joined Engineering-basis editing;
- source navigation;
- current-result → stale-result after edit;
- rerun → current result.

### Browser gate is still a FAIL

The managed-policy blocker does not turn this into an indeterminate pass. Exact-head static/product tests already establish that two prerequisites for the requested browser flow are missing:

```text
joined Engineering-basis primary view   FAIL
source-cell/source-navigation anchors   FAIL
```

So even in an unrestricted browser the current tested head cannot satisfy the requested joined-edit/source-navigation acceptance contract without code changes.

## 3. Exact-head evidence

Key exact GitHub blobs used in the gate:

```text
tabs/vibration-integrity-input-view.js
  0a1103534b27048b36c08153c502c725ce1d7a36

tabs/vibration-integrity-mechanisms.js
  fd2143883a3c769896374d2c357b482ad62751c5

tabs/vibration-integrity-view.js
  2dcde61a6f1b9382c4b5ecfe09db29577c8555a8

tabs/vibration-integrity-detail-view.js
  4d7ec99f5d95e70199ba0eb0b69a59325c1c95d6

scripts/verify-vibration-fit-release.mjs
  efa3f032379bffc7269b53fd90d11065a89571eb

tests/vibration-fit-release-gate.test.mjs
  129a0ce7ca4c2032ac5f7a5702a2b999f85184c2
```

## 4. Required closure work

Before these gates can be marked complete:

1. restore the joined Engineering-basis primary UI and exact source-anchor/source-navigation contract removed by PR #448;
2. resolve or separately repair the **16 genuine exact-head release-test failures**;
3. rerun the **9 XLSX-dependent checks** in an environment with the exact project dependencies available;
4. rerun real-browser XLSX/CSV/edit/revert/source-navigation/stale-result acceptance in an environment that permits application navigation;
5. preserve `engineeringAuthority=NONE`, `screeningAuthority=NOT_AUTHORIZED`, and `designAuthority=false` until separate governance explicitly changes them.

## Validation conclusion

The requested validation has now been **executed and recorded**. It is not a passing release record: it is a failure/blocked record that identifies the exact remaining seams rather than converting missing execution or regressions into success.
