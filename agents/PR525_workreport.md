# PR525 — AIV PF-01 runtime cache custody recovery

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: HEALTHY
WORK_INTENT: IMPLEMENT
CRITICALITY: ENGINEERING_CRITICAL
MUTATION_AUTHORITY: WRITE_ALLOWED
MERGE_AUTHORITY: OWNER_ONLY
REPOSITORY: reallaksh19/3D_Converters
PR: 525
BRANCH: agent/aiv-pf01-cache-custody-20260815
BASE_MAIN: e97effb06ff9bfcad5ea87381abaa9f2665c1bdd
REPORT_BASIS_HEAD: 547991b4695959fab0558dc0562723f673b5d2ba
GROUNDING_EPOCH: 2026-08-15T20:27+04:00
CURRENT_STAGE: DRAFT_PR_OPEN_SOURCE_CHAIN_VERIFIED
CURRENT_BLOCKER: exact post-deploy Chromium replay is pending; native private checkout is unavailable in this connector environment
EXACT_NEXT_ACTION: after owner-authorized merge/deploy, confirm Network/module URLs carry 20260815-aiv-pf01-cache-1, then execute Open AIV -> load/import EI example -> Check Readiness -> Run Screening and confirm the caseId exception is absent.
```

## Handover in 60 Seconds

Owner reproduced the original PF-01 exception **after PR #519 merged**:

```text
vibration-aiv-canvas-filter.js:33
TypeError: Cannot read properties of null (reading 'caseId')
```

The decisive live evidence was:

```text
vibration-aiv-qualification-tab.js?v=aiv-qualification-1
```

But current `main@e97effb...` already contains:

```text
createAivCanvasFilterState: input = input ?? {}
engineering-calculations-tab: aiv-qualification-2
```

Therefore the browser was executing stale/mixed ES-module bytes. The null guard itself was already correct in Git.

## Root cause

The prior PF-01 merge versioned only a leaf AIV import. Unchanged upstream cache identities and bare downstream imports allowed the browser to retain an old Engineering/AIV module graph.

## Implementation

One cache key now reaches every cache-sensitive edge from the production shell to the corrected filter:

```text
20260815-aiv-pf01-cache-1
```

Verified branch chain:

```text
index.html
 -> main-rhbg-fitguard.js?v=20260815-aiv-pf01-cache-1
 -> core/app.js?v=20260815-aiv-pf01-cache-1
 -> engineering-tabs-extension.js?v=20260815-aiv-pf01-cache-1
 -> engineering-workspace-tab.js?v=20260815-aiv-pf01-cache-1
 -> engineering-calculations-tab.js?v=20260815-aiv-pf01-cache-1
 -> vibration-aiv-qualification-tab.js?v=20260815-aiv-pf01-cache-1
 -> vibration-aiv-canvas-controller.js?v=20260815-aiv-pf01-cache-1
 -> vibration-aiv-canvas-filter.js?v=20260815-aiv-pf01-cache-1
```

The target filter remains:

```js
input = input ?? {};
```

Permanent AIV regression:

```text
tests/vibration-aiv-runtime-cache-chain.test.mjs
```

registered in:

```text
npm run verify:aiv-canvas
```

## Shared-shell FBX reconciliation

`index.html` and `main-rhbg-fitguard.js` are shared startup-shell files. Existing FBX test `tests/fbx/test-fbx2-runtime-cache-chain.mjs` previously assumed its FBX release key was also the startup-shell key.

That assertion would be stale after this AIV shell advance. The test is therefore adjusted to separate:

```text
shellKey = 20260815-aiv-pf01-cache-1
fbxKey   = 20260804-fbx-multifamily-release-1
```

FBX production/runtime imports remain on the original FBX key. No FBX engineering or converter behavior changed.

## Scope / negative assurance

No changes to:

- AIV equations, coefficients, tolerances or numerical oracles;
- readiness/calculator executable contract;
- simultaneous-source grouping;
- master data or provenance authority;
- physical-distance authority;
- Assessment screening authority;
- export semantics;
- FBX production behavior;
- workflow files.

Production/config changes are cache-identity-only. The only non-AIV test modification is the shared-shell/FBX-key distinction required by the common startup boundary.

## Coordination

```text
#517 PF-02: evidence/status only; no exact-file overlap
#518 PF-03: kernel + canvas integration benchmark; no exact-file overlap
```

Coordination classification: SAFE for exact files and authority scope.

## Backup / rollback custody

Repository backup CLI is NOT_RUN because the connector environment has no native private checkout. Exact pre-edit Git blobs on `main@e97effb...` are rollback custody:

```text
index.html                               888c13df7c61c32e0b1330424b571341d702d44f
main-rhbg-fitguard.js                    4def9d6e828ee0326fc40ea0f082f69e95a6bcf2
core/app.js                              b4a50be2f31fb10e20b66437c4ce4a1f0e2615d6
core/engineering-tabs-extension.js       f8bb1300e97e485b43ac2f708725bf6c517ca337
tabs/engineering-workspace-tab.js        dfe796364a92fc9f7eca174cc853e21959c79da3
tabs/engineering-calculations-tab.js     04b5f1340b0300dd582a4d659af3079c2c847251
tabs/vibration-aiv-qualification-tab.js  41e2432af389994fa259f7c7de4103710c34118d
tabs/vibration-aiv-canvas-controller.js  9c7af05425cdf763e668ae38c83ba3dde594990e
package.json                             a558ff66e06d43f735fc6ab8e4303a477e975ce6
tests/fbx/test-fbx2-runtime-cache-chain.mjs 115de609682d81c3a9a214cca6d6202b263da875
```

## Validation ledger

| Check | Status | Observation | Oracle |
|---|---|---|---|
| owner post-merge live failure | PASS_REPRODUCED | USER_SUPPLIED | NONE |
| current main contains null guard | PASS | SOURCE_INSPECTION | NONE |
| live browser token differs from current main | PASS | USER_SUPPLIED + SOURCE_INSPECTION | NONE |
| exact branch cache chain | PASS | SOURCE_INSPECTION of every edge | NONE |
| corrected filter at chain terminus | PASS | SOURCE_INSPECTION | NONE |
| changed-file scope | PASS | Git compare | NONE |
| AIV cache-custody regression | PASS_IMPLEMENTED | SOURCE_INSPECTION | IMPLEMENTATION_COUPLED |
| FBX shared-shell test reconciliation | PASS_IMPLEMENTED | SOURCE_INSPECTION | IMPLEMENTATION_COUPLED |
| native `verify:aiv-canvas` | NOT_RUN | no native private checkout | MIXED |
| native FBX cache-chain test | NOT_RUN | no native private checkout | IMPLEMENTATION_COUPLED |
| hosted workflows | NOT_RUN / INFRASTRUCTURE_BLOCKED if zero-step | inspect exact final head before closure | NONE |
| full production Chromium after deployment | NOT_RUN | requires merged/deployed exact head | PRODUCT |
| EI D.2.3 numerical oracle | NOT_APPLICABLE_TO_CACHE_CHANGE | numerical implementation unchanged | AUTHORITATIVE_REFERENCE |

## Acceptance after deployment

Browser Network / stack must show:

```text
20260815-aiv-pf01-cache-1
```

and must not show:

```text
vibration-aiv-qualification-tab.js?v=aiv-qualification-1
```

Then execute:

```text
Open AIV -> import/load EI example -> Check Readiness -> Run Screening
```

PASS requires zero `caseId` exception. Any remaining issue is captured as the next live defect; do not alter AIV numerical authority in this cache slice.

## Appendix A

Implementation authorization remains inherited from issue #513 where the owner recorded:

```text
QUALIFIED_FOR_AIV_PRODUCTION_FREEZE
```

No new numerical or engineering-authority decision was introduced in PR525.
