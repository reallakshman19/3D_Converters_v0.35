# PR518 — AIV PF-03 Simultaneous-Source Semantics Work Report

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: HEALTHY
TAKEOVER_AUTHORITY: WRITE_ALLOWED_WITHIN_ISSUE_513_PF03
EXECUTION_MODE: LOCAL_EXACT_SOURCE_NON_BROWSER
SCOPE_AUTHORITY: ISSUE_513_PF03
MERGE_AUTHORITY: OWNER_ONLY
INITIAL_BASE: d659e670a2f8fe0a35fc8072382512f6493898cf
MAIN_HEAD_LAST_CHECKED: 5ad2288d41e031ef23df0cb3e600763081b4ac62
CANDIDATE_CODE_HEAD: 8cd30a464435658e833ddf297c5727e68e979d4d
CURRENT_STAGE: PF03_COMPLETE_UNDER_OWNER_CHROMIUM_WAIVER
FULL_BROWSER_PASS: NOT_CLAIMED
OWNER_CHROMIUM_WAIVER: issue #513 comment 5302589137
EXACT_NEXT_ACTION: Owner may review/authorize merge or direct progression to PF-04; do not merge without explicit Owner authorization.
```

## Outcome

PF-03 is complete under the explicit Owner instruction to skip Chromium and run locally end-to-end. The browser gate is recorded as `NOT_RUN_OWNER_WAIVED`; this report never calls the local execution `FULL_BROWSER_PASS`.

The current-main defect was reproduced through the real engineering registry/engine and registered AIV definition using exact production source blobs: two relationships under the same Assessment + Operating Case but in `SIM-GROUP-1` and `SIM-GROUP-2` were silently cross-combined. Pre-fix observed combined PWL was `163.0102999566398 dB`.

The minimal correction is confined to `converters/vibration/aiv/aiv-kernel-candidate.js`: the existing point combiner now requires all contributions in a combination to share the same normalized simultaneous-source-group token. A mismatch fails closed with `AIV_MULTIPLE_SIMULTANEOUS_GROUPS_UNSUPPORTED`. No governing-group/scenario algorithm, equation, tolerance, default, data migration, readiness change, export change, or UI redesign was introduced.

## Main Re-grounding

PF-03 began from `d659e670a2f8fe0a35fc8072382512f6493898cf`. During qualification, `main` advanced to `5ad2288d41e031ef23df0cb3e600763081b4ac62` through PR #512. Compare showed two commits and no overlap with the PF-03 calculator/kernel/oracle/test paths. The latest `main` was merged into the PF-03 branch as `8cd30a464435658e833ddf297c5727e68e979d4d`, and the PF-03 local pack was rerun. The exact PF-03 dependency blobs used by the executed paths were unchanged by the main advance.

## Backup and Blob Custody

Required backups were executed before production/test mutation:

```text
node utils/backup.js save converters/vibration/aiv/aiv-kernel-candidate.js "Issue #513 PF-03 pre-fix backup"
node utils/backup.js save tests/vibration-aiv-canvas-integration.test.mjs "Issue #513 PF-03 regression-test backup"
```

The pre-edit local Git blobs matched current production exactly. Candidate blobs now on PR #518:

- kernel: `b0967c4c2e9fb98c90b6a3e9028ce9851e9bbcbb`
- permanent regression: `36d983018d6e7ef3fc7cd7bda60bdab5bfe3097d`

## Frozen PF-03 Validation

| Benchmark | Result | Evidence |
|---|---|---|
| B1 EI D.2.3 registered path | PASS | raw `164.6851759525391`, point `164.37348764085078` vs frozen `164.3734876408508` within `1e-10`, LOF `0.29` |
| B2 160+160 | PASS | `163.0102999566398 dB`, `SIM-SRC-1`, `SIM-SRC-2`, `SIM-GROUP-1` |
| B3 160+150 | PASS | `160.41392685158226 dB`, both source IDs retained |
| B4 single/batch/canvas | PASS | single and batch outputs identical; canvas projection copies the registered Assessment result and identities |
| B5 2-RV flare | PASS | RV-101 path `38 m`, RV-102 path `41 m`; combined `149.56302572849327 dB`; LOF `0.29` |
| B6 presentation invariance | PASS | moving canvas/network presentation changes no engineering distance, generated table, or registered result; SVG pixels remain non-authoritative |
| B8 simultaneous grouping | PASS | same group allowed; mixed groups fail closed with `AIV_MULTIPLE_SIMULTANEOUS_GROUPS_UNSUPPORTED` |

B7 is PF-02 readiness/calculator parity and remains separately progression-waived by comment `5302118299`. B9-B13 are separate later custody/async/export/UI slices and are not changed by PF-03. B14 is browser-only performance evidence and is explicitly not run under Owner Chromium waiver comment `5302589137`. None of those are promoted to PASS by this PR.

## Local Execution Classification

The container has no native private checkout and shell DNS cannot resolve GitHub. Exact source files required by the PF-03 registered-engine, canvas projection/layout, CSV parsing, flare-network generation, and fixture paths were fetched through the connected GitHub source and written locally. `git hash-object` was used to prove exact blob custody for production dependencies before execution. This is classified `LOCAL_EXACT_SOURCE_REGISTERED_ENGINE_AND_PRODUCT_MODULE_EXECUTION`, not full-app/browser acceptance.

CI runs `31888612904` and `31888613032` both failed before any job steps (`steps=null`, no logs). They are `NOT_RUN_INFRASTRUCTURE_ZERO_STEP`, not benchmark failures and not passes.

## Authority Verification

```text
TABLES = engineering source of truth
SVG/pixel geometry = never engineering physical-distance authority
screeningResultScope = ASSESSMENT
line/case summary = non-authoritative
designAuthority = false
```

All remained true in local execution. Frozen expected values and tolerances were not changed.

## Changed Production/Test Scope

Only two behavior/regression files are changed:

- `converters/vibration/aiv/aiv-kernel-candidate.js`
- `tests/vibration-aiv-canvas-integration.test.mjs`

All other PR files are Production Freeze / recovery evidence. PR #506 was not cherry-picked; only its grouping idea informed the minimal current-main correction.

## Final Disposition

`PF03_COMPLETE_UNDER_OWNER_CHROMIUM_WAIVER`

- PF-03-applicable non-browser frozen benchmarks: PASS.
- Chromium: `NOT_RUN_OWNER_WAIVED`.
- `FULL_BROWSER_PASS`: not claimed.
- Merge: not authorized; PR remains draft until Owner directs otherwise.
- Next slice: eligible if Owner says proceed.
