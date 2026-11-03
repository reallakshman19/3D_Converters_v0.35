# PR516 Work Report — controlled EIT sonic-state recovery

## Current state

- PR: #516 `fix(aiv): resolve controlled EIT sonic-state blockers`
- State: OPEN / DRAFT / NOT MERGED.
- Mission: remove the three redundant `AIV_SONIC_STATE_UNRESOLVED` blockers for the exact controlled Energy Institute AVIFF worked-example `.eit` without creating generic sonic inference.
- Classification: `ENGINEERING_CRITICAL`.
- Work Pack: #513. Production acceptance umbrella: #453.
- Base: `main@a49085cde69ef71518c0d6315a615477887d7b4e`.
- Branch: `agent/aiv-eit-controlled-sonic-20260815`.
- Implementation head before report-sync commits: `fdd42e435fd5b56ddecb4f510ba1dfa0a3ca3bb0`.
- Main re-read after implementation: still `a49085cde69ef71518c0d6315a615477887d7b4e`.
- Coordination: SAFE for exact files. #515 owns canvas/filter PF-01; #511/#512 own shared Vibration Integrity workflow/evidence. No exact production-file overlap.
- Recovery decision: `CONTINUE_FROM_CURRENT_MAIN`; PR #506 is not a code source for this slice.

## User-visible failure

Importing the controlled Common worked-example `.eit` currently yields:

```text
EIT-SOURCE-5-1 -> EIT-ASSESS-5  AIV_SONIC_STATE_UNRESOLVED
EIT-SOURCE-6-1 -> EIT-ASSESS-6  AIV_SONIC_STATE_UNRESOLVED
EIT-SOURCE-8-1 -> EIT-ASSESS-8  AIV_SONIC_STATE_UNRESOLVED
```

Root cause trace:

```text
Common .eit
 -> parseAivEitImport()
 -> buildAivEitImportedRecords()
 -> sourceRow()
 -> legacy detail.sonicState absent
 -> old sonicState() returned UNRESOLVED
 -> source CSV Sonic State=UNRESOLVED
 -> readiness validateSource()
 -> AIV_SONIC_STATE_UNRESOLVED
```

This is not a P/T/flow/MW deficit and not a readiness-UI defect. It is a compatibility-import policy defect for this already-controlled benchmark.

## Controlled evidence custody

Pinned legacy source:

```text
repository: reallaksh19/Common
commit:     7bfead910f6bca91b10748ead009e40f20c82219
path:       Energy-Institute-AVIFF---Worked-Examples.eit
Git blob:   aaf3afe262b19f927fe05e0c44f07f08167fbfa0
options:    title="Energy Institute AVIFF - Worked Examples", version=5, id=8872, project=3010
```

Independent implementation-side qualification evidence:

```text
docs/vibration/AIV-D2.3-Qualification-Solve-v1.md
```

Frozen source/effective PWL oracles:

```text
RID 5 recycle discharge  129.3648155401 dB -> report 129.36 dB
RID 6 recycle suction    129.0239800907 dB -> report 129.02 dB
RID 8 relief downstream  164.6851759525 dB -> report 164.69 dB
```

All three require `SFF = 0 dB`, therefore `Sonic State = NON_SONIC` for these exact worked-example vectors.

## Implemented behavior

New precedence:

```text
1. explicit EIT detail.sonicState
2. exact pinned worked-example vector match
3. UNRESOLVED
```

The controlled compatibility resolver requires all of:

- exact worked-example document identity;
- exact RID;
- P&ID;
- line reference;
- legacy device type;
- mass flow;
- P1;
- P2;
- upstream temperature;
- molecular weight;
- low-noise trim reduction;
- historical report PWL.

A one-field mismatch returns no controlled resolution and therefore remains `UNRESOLVED`.

No pressure-ratio / critical-flow heuristic, device-type default or generic sonic resolver was introduced.

The resolver carries provenance in `eitImportEvidence.detailEvidence[].sonicStateResolution`, including Common repository/commit/path/blob, benchmark ID, qualified PWL and the explicit statement `genericSonicInference=false`.

## Authority invariants

1. Explicit modern `.eit` sonic state always wins.
2. Generic legacy files remain fail-closed `UNRESOLVED`.
3. The controlled mapping does not qualify an automatic sonic-state calculation method.
4. `SFF=0 dB / NON_SONIC` is a worked-example compatibility disposition, not a production default.
5. Imported historical AIV results remain `REVIEW_REQUIRED`; current results still require registered screening.
6. No AIV equation/coefficient change.
7. No topology/physical-distance authority change.
8. `screeningResultScope = ASSESSMENT` remains unchanged.
9. line/case summary remains non-authoritative for screening.
10. `designAuthority = false` remains unchanged.

## Changed-file ledger

```text
converters/vibration/aiv/aiv-eit-controlled-sonic-state.js
  ADDED
  pure exact-vector controlled resolver; 123 lines (<300)

converters/vibration/aiv/aiv-eit-import-records.js
  MODIFIED
  + controlled resolver import
  + explicit > controlled > unresolved precedence
  + controlled resolution evidence in detailEvidence
  pre-edit blob: 6f23c8b31ecab9b43d0b7732dd6129b5f6d188d4

package.json
  MODIFIED
  registers controlled-sonic regression in verify:aiv-eit-export
  pre-edit blob: 9a371439c4c4e32b4a73dd5dd83bc809615f8dea

tests/vibration-aiv-eit-controlled-sonic.test.mjs
  ADDED
  exact 3-vector import, frozen PWL, drift-negative, document-negative and explicit-precedence tests

ValidationRecords/AIV/ProductionFreeze/AIV-PF-EIT-SONIC-01.json
  ADDED
  production-freeze qualification receipt

agents/PR516_workreport.md
  ADDED
  durable handover
```

The predecessor WIP report is retired after this PR report is committed.

## Backup / rollback

Mandatory repository backup command could not run because this environment has no native repository checkout and `gh` is unavailable.

```text
STATUS = NOT_RUN / ENVIRONMENT_BLOCKED
```

Rollback custody uses the immutable pre-edit Git blobs listed above. This limitation is not classified as PASS.

## Validation ledger

| Gate | Status | Observation / oracle |
|---|---|---|
| current-main grounding | PASS | `main=a49085c...`, re-read after implementation |
| Common controlled EIT blob identity | PASS | `aaf3afe...` at exact pinned Common commit |
| source/root-cause trace | PASS | current importer + readiness source inspection |
| new resolver syntax | PASS | reconstructed exact resolver `node --check` |
| controlled resolver execution | PASS 5/5 | 3 exact positive + process-drift + document-drift negative |
| independent frozen PWL recalculation | PASS 3/3 | 129.3648155401 / 129.0239800907 / 164.6851759525 dB, abs tol `1e-9` |
| targeted Chromium resolver | PASS | Chrome 144.0.7559.96, 3 exact + 2 negative cases |
| browser classification | TARGETED_ONLY | not full application Chromium |
| repository-native new test | NOT_RUN / ENVIRONMENT_BLOCKED | no private checkout |
| `npm run verify:aiv-eit-export` | NOT_RUN / ENVIRONMENT_BLOCKED | no private checkout |
| `npm run verify:aiv-canvas-release` | NOT_RUN / ENVIRONMENT_BLOCKED | no private checkout |
| full app Chromium import/readiness | NOT_RUN / ENVIRONMENT_BLOCKED | no materialized app/deployment |
| backup CLI | NOT_RUN / ENVIRONMENT_BLOCKED | no checkout |
| hosted Actions exact implementation head | NOT_RUN / INFRASTRUCTURE_BLOCKED | three workflows concluded `failure` but every job has `steps=null` / no logs, so no product step executed |

Hosted runs observed for `fdd42e4...`:

```text
31881629732  Vibration AIV Controlled Source Qualification
  job 95004932882  conclusion=failure  steps=null  logs_url=null

31881629707  Topology Edit Support Reprojection
  job 95004932788  conclusion=failure  steps=null  logs_url=null

31881629667  Vibration Mechanical Stage 4 Validation
  job 95004932608  conclusion=failure  steps=null  logs_url=null
```

Do not convert these zero-step jobs into code failures or PASS.

## Regression intent

`tests/vibration-aiv-eit-controlled-sonic.test.mjs` proves:

1. exact controlled RIDs 5/6/8 import as `NON_SONIC`;
2. resolution evidence is retained with pinned Common blob identity;
3. the imported state reproduces the three frozen PWL oracles through `calculateAivKernelCandidateSource`;
4. one-field process drift disables the mapping;
5. document identity drift disables all mapping;
6. explicit modern `SONIC` overrides compatibility resolution.

Existing `tests/vibration-aiv-eit-import.test.mjs` continues to require an ordinary legacy EI document to import as `UNRESOLVED`; generic behavior is therefore intentionally unchanged.

## Appendix A — implementation qualification

### A1 Production Trace — 20/20
Exact chain traced from EIT legacy detail to readiness blocker, including generated source IDs 5/6/8.

### A2 Current Failure Isolation — 20/20
Importer compatibility policy is the isolated defect. Falsifier was defined before mutation: exact imported rows already being non-sonic would disprove it; they were not.

### A3 Authority / Invariant — 20/20
No generic sonic inference. Exact controlled vector only; explicit value wins; any drift fails closed.

### A4 Independent Validation — 20/20
Frozen PWL values are independent controlled oracles and were recalculated separately. Browser-engine execution and implementation-coupled future test are reported separately.

### A5 Next-Commit / Minimal Patch — 19/20
New pure resolver + 11-line importer integration + one focused regression + receipt. No readiness/calculator/UI refactor. One point withheld because full native/browser execution remains environment-blocked.

**Score: 99/100; each >=19/20.**

## Active risks / limitations

- `RISK`: full application Chromium has not yet shown the three blocker rows disappearing on PR #516.
- `RISK`: repository-native new regression and aggregate AIV release suite have not executed.
- `DEC`: do not broaden this PR to a generic sonic-state method.
- `DEC`: if the exact Common vector no longer matches due controlled-source revision, fail closed and require a separately reviewed compatibility-vector update.

## Merge state

```text
MERGE_AUTHORITY = OWNER_ONLY
MERGE_AUTHORIZED = false
PR_STATE = DRAFT
```

## EXACT_NEXT_ACTION

On a native checkout of PR #516 final head: run the repository backup parity check if required for acceptance, `node --test tests/vibration-aiv-eit-controlled-sonic.test.mjs`, `npm run verify:aiv-eit-export`, then `npm run verify:aiv-canvas-release`; launch the full app in Chromium, import the exact pinned Common worked-example `.eit`, verify `AIV_SONIC_STATE_UNRESOLVED` count is zero for RIDs 5/6/8, and compare the three source/effective PWL results to the frozen receipt. Do not merge until those gates are recorded or the Owner explicitly waives them.