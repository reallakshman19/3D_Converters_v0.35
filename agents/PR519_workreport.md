# PR519 — AIV PF-01 current-main runtime recovery

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: HEALTHY
WORK_INTENT: IMPLEMENT
CRITICALITY: ENGINEERING_CRITICAL
TAKEOVER_AUTHORITY: WRITE_ALLOWED
EXECUTION_MODE: MANUAL
MERGE_AUTHORITY: OWNER_ONLY

REPOSITORY: reallaksh19/3D_Converters
PR: 519
BRANCH: agent/aiv-pf01-current-main-fix-20260815
MAIN_HEAD_AT_FREEZE: 5ad2288d41e031ef23df0cb3e600763081b4ac62
MERGE_BASE: 5ad2288d41e031ef23df0cb3e600763081b4ac62
REPORT_BASIS_HEAD: 343ef45f0d753c4de74d5de2b75bb9757b92dd0c
GROUNDING_EPOCH: GE-PF01-CURRENT-MAIN-20260815-1804+04
CURRENT_STAGE: IMPLEMENTED_FOCUSED_VALIDATION_PASS
CURRENT_BLOCKER: native AIV release suite and exact served-PR Chromium replay are NOT_RUN in this connector environment
HIGHEST_RISK: merging before the exact PR build is replayed through the live AIV D.2.3 workflow
EXACT_NEXT_ACTION: run the exact PR519 head in the real AIV application, load/import EI D.2.3, Check Readiness, Run Screening, exercise Case/Line/Show, confirm zero uncaught caseId error and D.2.3 visible output; run verify:aiv-canvas-release; then update receipt before requesting merge.
```

## Handover in 60 Seconds

The owner re-reproduced the PF-01 failure on current production:

```text
TypeError: Cannot read properties of null (reading 'caseId')
```

Current production source independently confirmed the same failure boundary and the old `aiv-qualification-1` dynamic module token.

PR519 supersedes stale PR515. PR515 is now closed/unmerged and retained only as evidence/salvage history.

Implemented on current main:

```text
createAivCanvasFilterState(null, ...) -> null-safe
change-before-first-sync              -> null-safe
canvasController.sync exception       -> local degraded-canvas warning
AIV workspace import token            -> aiv-qualification-2
focused regressions                   -> registered in verify:aiv-canvas
```

No AIV numerical, readiness/executable, grouping, master, distance-authority or export semantic changed.

## Qualification / assignment authority

Source Work Pack: #513.

Owner recorded:

```text
QUALIFIED_FOR_AIV_PRODUCTION_FREEZE
```

in issue comment `5301819610` after the five repository-specific qualification answers. This PR does not reopen those architecture decisions.

## Coordination

```text
#515 PF-01  CLOSED / SUPERSEDED by #519
#517 PF-02  OPEN; readiness/executable semantics; untouched
#518 PF-03  OPEN; simultaneous-source semantics; untouched
#506 broad hardening  SALVAGE/EVIDENCE ONLY
```

Current coordination classification: `SAFE_AFTER_SUPERSESSION` for PF-01 exact-file ownership. PR519 owns only the current-main PF-01 runtime/UI delivery paths listed below.

## Live BEFORE evidence

Owner Chromium stack showed the same failure during multiple real user paths including mock flare load, pointer error rendering and Check Readiness:

```text
createAivCanvasFilterState
-> filterController.sync
-> canvasController.sync
-> qualification render
```

Observed failing module URL:

```text
vibration-aiv-qualification-tab.js?v=aiv-qualification-1
```

Current-main source at freeze:

```text
tabs/vibration-aiv-canvas-filter.js
  blob a5da4fb99e69310659659725696c61c3d9347085
  createAivCanvasFilterState reads input.caseId with no null normalization

tabs/engineering-calculations-tab.js
  blob 5d638f86197e5175faf14f7cace8cf92bf97537d
  imports ?v=aiv-qualification-1
```

## Root cause

```text
createAivCanvasFilterController initializes state = null
-> first sync passes explicit null
-> default parameter input = {} applies only to undefined
-> input.caseId dereference throws
```

A separate presentation-authority problem was visible in the same live stack: because `render()` called `canvasController.sync()` unguarded, a canvas exception surfaced as an AIV engineering action failure.

## Implementation

### 1. Filter null safety

`tabs/vibration-aiv-canvas-filter.js`

```diff
 export function createAivCanvasFilterState(input = {}, options = {}) {
+  input = input ?? {};
```

and early change safety:

```diff
- const next = { ...state };
+ const next = { ...(state ?? {}) };
```

Patched filter blob:

```text
ed6be3648409fb3582576cd069dfa6132efdcc8b
```

### 2. Professional degraded-canvas behavior

`tabs/vibration-aiv-qualification-tab.js`

`canvasController.sync()` is locally guarded. A presentation failure inserts:

```text
Canvas unavailable: <error>. Engineering tables and screening controls remain authoritative and usable.
```

The warning is marked `data-aiv-canvas-error=true`. This is presentation degradation only; it does not change engineering inputs/results/authority.

Patched qualification-tab blob:

```text
41e2432af389994fa259f7c7de4103710c34118d
```

### 3. Cache-distinct delivery

`tabs/engineering-calculations-tab.js`

```text
aiv-qualification-1 -> aiv-qualification-2
```

Patched blob:

```text
04b5f1340b0300dd582a4d659af3079c2c847251
```

### 4. Permanent regressions

New:

```text
tests/vibration-aiv-canvas-filter-runtime.test.mjs
tests/vibration-aiv-pf01-ui-guard.test.mjs
```

Both are registered in `npm run verify:aiv-canvas`, therefore inherited by `npm run verify:aiv-canvas-release`.

## Primary engineering golden benchmark

The production acceptance philosophy for this slice is deliberately simple:

```text
real UI workflow + EI D.2.3 golden example + focused software safety regressions
```

Existing `tests/vibration-aiv-canvas-integration.test.mjs` is unchanged and already freezes the registered production/canvas path:

```text
relief raw source PWL   164.6851759525391 dB
relief point PWL        164.3734876408508 dB
Assessment LOF          0.29
line/case LOF           1.48, non-authoritative
single API == batch API == canvas projection
```

Corroborating owner-supplied EI transcription:

```text
reallaksh19/Advanced_Analysis
commit 04328852dced9f5c4827da8afe8a82aeb8b1a1d3
path docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md
blob c050cd90802c27241c510c6f0ac43bfaf7a89e9d
locator D.2.3 High Frequency Acoustic Excitation
```

Independent calculation using the frozen D.2.3 inputs:

```text
P1 absolute = 9.9e6 Pa
P2 absolute = 1.0e5 Pa
W           = 53482 / 3600 kg/s
T           = 137 + 273.15 K
MW          = 21.75 g/mol
SFF         = 0 dB

source PWL  = 164.6851759525391 dB
attenuation = 60*0.8/154 = 0.3116883116883117 dB
point PWL   = 164.3734876408508 dB
```

No expected value or tolerance was edited.

## Validation ledger

| Check | Status | Observation | Oracle |
|---|---|---|---|
| owner live current-production crash | PASS | USER_SUPPLIED | NONE |
| current-main source root cause | PASS | SOURCE_INSPECTION | NONE |
| focused patched null-state runtime | PASS 3/3 | LOCAL_EXECUTION reconstructed exact filter behavior | IMPLEMENTATION_COUPLED |
| D.2.3 independent source/attenuation/point calculation | PASS exact | INDEPENDENT_REPRODUCTION | AUTHORITATIVE_REFERENCE |
| cache token `aiv-qualification-2` | PASS | SOURCE_INSPECTION | NONE |
| degraded-canvas containment | PASS | SOURCE_INSPECTION | NONE |
| `npm run verify:aiv-canvas` | NOT_RUN | no native private checkout | mixed |
| `npm run verify:aiv-canvas-release` | NOT_RUN | no native private checkout | mixed |
| exact PR519 full-application Chromium | NOT_RUN | exact served branch build unavailable here | AUTHORITATIVE_REFERENCE |

Validation receipt:

```text
ValidationRecords/AIV/ProductionFreeze/AIV-PF-01-current-main.json
```

## Required AFTER acceptance

On the exact PR head in the real application:

```text
Open Engineering Calculations -> Vibration -> AIV
-> load/import the EI worked example
-> Check AIV readiness
-> Run AIV screening
-> operate Case / Line / Show
```

Required visible behavior:

```text
zero uncaught caseId TypeError
no canvas-only exception promoted to engineering AIV action failure
D.2.3 result follows the frozen engineering chain
Assessment result is clearly screening-authoritative
line/case summary remains non-authoritative
if canvas fails, tables/readiness/screening remain usable with a local warning
```

## Authority / negative assurance

Unchanged intentionally:

```text
AIV equations / coefficients / tolerances
readiness <-> executable contract (PF-02)
simultaneous-source grouping semantics (PF-03)
master-data authority
physical-distance authority
screeningResultScope = ASSESSMENT
line/case summary authoritativeForScreening = false
designAuthority = false
export semantics
```

## Backup / rollback

Repository backup CLI is required before editing existing files but cannot run in this connector-only environment because no native private checkout is materialized.

Status:

```text
node utils/backup.js save ... = NOT_RUN / ENVIRONMENT_BLOCKED
```

Exact current-main pre-edit Git blobs are recorded above and in the validation receipt as rollback custody. This limitation is not called PASS.

## Changed-file ledger

```text
Production:
  tabs/vibration-aiv-canvas-filter.js
  tabs/vibration-aiv-qualification-tab.js
  tabs/engineering-calculations-tab.js

Release registration:
  package.json

Tests:
  tests/vibration-aiv-canvas-filter-runtime.test.mjs
  tests/vibration-aiv-pf01-ui-guard.test.mjs

Evidence/handover:
  ValidationRecords/AIV/ProductionFreeze/AIV-PF-01-current-main.json
  agents/PR519_workreport.md
```

No workflow files changed.

## Active items

- `ISS-519-001` — exact served-PR Chromium AFTER replay NOT_RUN.
- `ISS-519-002` — native `verify:aiv-canvas-release` NOT_RUN.
- `DEC-519-001` — PR515 superseded; retain evidence, do not rebase/merge it.
- `DEC-519-002` — EI D.2.3 is the primary engineering golden example for PF-01; focused software regressions supplement it rather than replacing it.
- `RISK-519-001` — do not merge before confirming the current browser loads `aiv-qualification-2` and no `caseId` exception remains.

## Merge state

```text
PR: OPEN / DRAFT
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
MERGE: NOT_AUTHORIZED
```
