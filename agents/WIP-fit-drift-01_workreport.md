# WIP-fit-drift-01 — FIT machine truth / drift hardening

Status: **DRAFT PR OPEN / EXECUTABLE VALIDATION ENVIRONMENT-BLOCKED**

Owner issue: #443. Parent vibration gate: #429. Draft PR: #565. Merge authority remains Owner-only.

## Live grounding

```text
CURRENT_MAIN_SHA                  d12ca2d53d1ea0174e1b91fbe3105137fdd2a42b
CURRENT_BRANCH                    agent/fit-drift-01-workpack
CURRENT_PR                        #565 DRAFT / OPEN / UNMERGED
IMPLEMENTATION_HEAD_AT_LAST_ORACLE f71add94302576c519d5ffee95d278b79a20335f
FIT_ADAPTER_BLOB                  eef88d59846a5c779d5f56b71b9502955ddf1b41
ACTIVE_REGISTRY_STATE             ACTIVE
PRE_MUTATION_MANIFEST_COUNT       57
BRANCH_MANIFEST_COUNT             58
CURRENT_PRODUCT_FREEZE_STATE      BLOCKED / NOT FROZEN
```

`main` was re-read during the continuation pass and remained at the SHA above. Handoff-only report commits may follow the implementation head shown above; executable repository validation must be rerun on the eventual merge-candidate head.

## Current FIT method / authority state

```text
capabilityId          VIB.FIV.FLOW_TURBULENCE
methodRevision        ei-aviff2-fit-screening-v1
calculationState      IMPLEMENTED
qualificationState    SCREENING
engineeringAuthority  SCREENING
screeningAuthority    AUTHORIZED_BOUNDED
designAuthority       false
codeCompliance        false
registry               ACTIVE
full vibration         INCOMPLETE
product freeze         BLOCKED / NOT FROZEN
```

PR #499 is the merged bounded-screening engineering qualification event. PR #511 merged freeze machinery/evidence work but did not establish the official URL-based Product Freeze.

## Takeover qualification — Appendix A

```text
A1 Production Trace              20/20
A2 Current Failure Isolation     20/20
A3 Authority / Invariant         20/20
A4 Independent Validation        18/20
A5 Next-Commit / Minimal Patch   20/20
TOTAL                            98/100
minimum challenge                18/20
```

```text
TAKEOVER_DECISION   CONTINUE from fresh current main
OLD_BRANCH_RULE     SUPERSEDE direct continuation of #539/#540
TAKEOVER_AUTHORITY  FIT-DRIFT-01 implementation only
```

Draft #564 remains an unmerged capability-lifecycle proposal. No `RESERVED -> QUALIFIED -> ACTIVE -> DEPRECATED` implementation was copied into FIT.

## Implemented drift-hardening

1. Added `engineering/workpacks/VIB-FIT.json` as the machine-readable FIT current-state/work-pack contract.
2. Added generic `scripts/verify-engineering-workpack.mjs` with FIT-WP-001..012 deterministic gates.
3. Added `tests/vibration-fit-workpack-drift.test.mjs` and wired it into the FIT/VIB release manifest.
4. Replaced FIT console `BENCHMARK ONLY` hard-code with registered `definitionState(definition)` projection.
5. Replaced the family-level no-screening-authority statement with a registered/executable SCREENING projection.
6. Reconciled `FIT-Source-Basis-Evidence-v1.md` as `CURRENT_AUTHORITY`.
7. Classified `FIT-source-register.md` as `HISTORICAL_BASELINE` while retaining its original blocked-state history.
8. Reconciled Issue #443 by comment: its old `BENCHMARK_ONLY / NONE / NOT_AUTHORIZED` block is historical, not current truth.
9. Hardened Product Freeze verification so only current `BLOCKED + frozen=false` or future `FROZEN + frozen=true + protocol PASS receipt` can pass FIT-WP-012.
10. Removed a brittle literal `2 mechanisms` regression assumption; the expected screening count is now derived from current registered/executable definitions, matching the UI projection model.

No FIT equation, correlation coefficient, empirical constant, benchmark expected value/tolerance, applicability boundary, QST-003 disposition, method revision, screening/design/code authority, or `.github/workflows/*` file was changed.

## Benchmark state

```text
FIT-EI-WORKED-EXAMPLES-V1
  10 controlled cases = 8 Appendix D2.1 + 2 Appendix D4

FIT-INDEPENDENT-HAND-BENCHMARKS-V1
  liquid / gas / multiphase
  standard families
  flexible-small and flexible-large advanced branches
  LOF thresholds
  fn/support boundaries
  unit invariance
  QST-003 fail-close
```

All required work-pack benchmark IDs were re-read from the controlled JSON datasets. Production output remains forbidden from creating/correcting expected values, relaxing tolerances, or fitting benchmarks.

## Coordination / overlap

```text
#539  DESIGN/PATCH PROPOSAL ONLY — stale/diverged; do not continue branch
#540  DESIGN/PATCH PROPOSAL ONLY — stale/diverged; do not continue branch
#564  DRAFT LIFECYCLE PROPOSAL — not on main; no lifecycle implementation copied
```

The implementation deliberately does not edit `converters/engineering-calculations/lifecycle.js` or `tabs/engineering-calculation-console-sections.js`; the regression only imports the existing `definitionState` helper so its expected count follows the same registered-state semantics as the family projection.

## Changed-file ledger

Implementation / governance files:

```text
agents/PR565_workreport.md
agents/WIP-fit-drift-01_workreport.md
docs/vibration/FIT-Source-Basis-Evidence-v1.md
docs/vibration/FIT-source-register.md
engineering/workpacks/VIB-FIT.json
package.json
scripts/verify-engineering-workpack.mjs
scripts/verify-vibration-fit-release.mjs
tabs/engineering-calculation-console-view.js
tabs/engineering-calculation-vibration-family.js
tests/vibration-fit-workpack-drift.test.mjs
```

Exact pre-edit connector custody:

```text
.backups/connector-20260816-fit-drift-01/agents/WIP-fit-drift-01_workreport.md
.backups/connector-20260816-fit-drift-01/docs/vibration/FIT-Source-Basis-Evidence-v1.md
.backups/connector-20260816-fit-drift-01/docs/vibration/FIT-source-register.md
.backups/connector-20260816-fit-drift-01/package.json
.backups/connector-20260816-fit-drift-01/scripts/verify-vibration-fit-release.mjs
.backups/connector-20260816-fit-drift-01/tabs/engineering-calculation-console-view.js
.backups/connector-20260816-fit-drift-01/tabs/engineering-calculation-vibration-family.js
```

The native `node utils/backup.js save ...` CLI was not runnable in this connector environment; custody uses exact pre-edit Git blobs and is not represented as a native-backup PASS.

## Validation ledger

```text
STATUS       OBSERVATION                                             ORACLE
PASS         live main SHA re-read                                   GitHub branch ref
PASS         FIT adapter/registry current authority inspected        current production source
PASS         pre-mutation release manifest = 57                      release manifest source
PASS         branch release manifest = 58 paths                      branch manifest source
PASS         EI + independent controlled benchmark identities re-read controlled JSON sources
PASS         no FIT numerical/benchmark/workflow path changed        PR changed-file ledger
PASS         #443 current-authority reconciliation comment posted    issue #443 comment 5308272919
PASS         revised work-pack regression parses under Node v22.16.0 local `node --check` syntax oracle
NOT_RUN      npm run workpack:verify -- VIB-FIT                      no authenticated private-repo checkout in shell runtime
NOT_RUN      npm run verify:vibration-fit-release                    no authenticated private-repo checkout in shell runtime
FAIL         GitHub Actions job start                                Actions budget prevented job from starting
NOT_RUN      workflow test bodies                                    jobs never started
NOT_RUN      official Chromium Product Freeze                        protocol remains BLOCKED / NOT FROZEN
```

Latest implementation-head Actions example: run `31957478412`, job `95190194272`, annotation: `The job was not started because an Actions budget is preventing further use.` This is `FAIL / ENVIRONMENT_BLOCKED`, not a source-test failure and not a PASS.

The shell runtime has Node/npm but no `gh` binary, no GitHub token/credential, and no local checkout of this private repository. Therefore an exact substitute repository execution cannot be manufactured from the connector source reads.

## Active blockers

```text
FIT-CI-001  GitHub Actions budget prevents executable PR validation; shell has no authenticated private-repo checkout.
FIT-PF-001  Official Product Freeze remains BLOCKED until the protocol-defined served Chromium journey emits a PASS receipt.
```

## Highest risk

The highest remaining risk is claiming executable validation from syntax/static inspection. The new work-pack code is reviewable and machine-enforcing by construction, and the revised regression syntax has been executed successfully, but `workpack:verify` and the 58-file FIT/VIB release suite still require an exact repository execution oracle before merge consideration.

## EXACT_NEXT_ACTION

Restore GitHub Actions capacity or provide an authenticated checkout/executable environment for the private repository. Run `npm run workpack:verify -- VIB-FIT` and `npm run verify:vibration-fit-release` on PR #565's eventual merge-candidate head, record the actual STATUS/OBSERVATION/ORACLE in `agents/PR565_workreport.md`, keep Product Freeze `BLOCKED / NOT FROZEN` unless the protocol journey emits its PASS receipt, and do not merge unless the Owner separately authorizes it.
