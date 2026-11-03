# WIP — EI Master Pack Stage 1

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED
WORK_INTENT: IMPLEMENT / VALIDATE / HANDOVER
CRITICALITY: ENGINEERING_CRITICAL
BRANCH: agent/ei-master-pack-stage1
BASE_MAIN: 0b03855a6d9031c8b531e23bdd3deea3b7fdc5d4
SOURCE_TASK: owner-approved EI Master Pack Stage 1
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
```

## Mission

Rebuild the useful governed-master framework from stale PR #483 on current main, pin the fixed `reallaksh19/Advanced_Analysis@6111ddbc0f27dd95b50a80c569a2c4daba3b3921/docs/EI data` source package, publish the source-reconciled SBC T3 non-curve tables as CANDIDATE masters, expose exact-grid candidate qualification lookups with immutable provenance, and preserve PR #505's fail-closed quarantine of conflicting T3-1..T3-4 digitized curves.

No screening/design/master-data authority promotion is permitted in this stage.

## Live Grounding

```text
main = 0b03855a6d9031c8b531e23bdd3deea3b7fdc5d4
latest relevant merge = PR505 feat(sbc): gate P0 T3 masters against worked examples
stale framework PR = #483
stale source-recovery PR = #480
```

PR505 is authoritative for current SBC curve disposition. It records:

```text
T3-1/T3-2/T3-3 tables = source parity PASS / CANDIDATE only
T3-1..T3-4 digitized curves = BLOCKED_SOURCE_DATA_CONFLICT
runtimeCurveActivation = false
manualUserEngineeringDataFallbackRetained = true
```

The supplied curve pack contradicts Worked Example D7 at three independent probes and must not be published as a numeric runtime master.

## Coordination

Open overlap search found only stale #483/#480. This work does not edit either branch. Current classification:

```text
COORDINATION = SAFE_WITH_STALE_SALVAGE
#483 = SALVAGE_PARTIAL design only
#480 = SUPERSEDED for this pinned-source stage
#505 = PRESERVE / DO NOT BYPASS
```

## Appendix A — Implementation Takeover Qualification

### A1 Production Trace — 19/20
Current source path is traced from Advanced_Analysis pinned Markdown -> existing candidate CSV artifacts / PR505 qualification gate -> future governed registry. One point withheld because the candidate masters are not yet registered on this branch.

### A2 Current Failure Isolation — 20/20
The blocker is isolated: non-curve table parity passes; supplied T3 curve geometry fails D7 at T3-1, T3-3 and T3-4. Stage 1 must not convert those curves into numeric masters.

### A3 Authority / Invariant — 20/20
Protected invariants: CANDIDATE is non-authoritative; ACTIVE-only runtime resolution; no interpolation/extrapolation; curve conflict is fail-closed; user-data fallback remains; screening/design authority unchanged.

### A4 Independent Validation — 18/20
PR505 supplies independent worked-example falsification and existing table parity. New registry tests will use synthetic lifecycle fixtures plus exact pinned SBC table data. Two points withheld until the new branch tests are executed.

### A5 Minimal Patch / Next Commit — 19/20
New files only: generic master framework, pinned source manifest, SBC candidate pack adapter, focused tests and this handoff. No existing runtime/release/workflow file needs modification.

**Score: 96/100; all sections >=18/20 — implementation authorized.**

## Planned Capability

```text
VibrationMaster.v1
  authorityClass = EI_METHOD_MASTER
  publicationState = CANDIDATE | ACTIVE | RETIRED
  deterministic content hash
  strict source identity + locator
  ACTIVE-only runtime resolver

EI AVIFF SBC T3 candidate pack
  Table T3-1 fitting span factor exact lookup
  Table T3-2 first-span minimum exact nominal-size lookup
  Table T3-3 between-main-lines minimum exact nominal-size lookup
  Figure T3-1..T3-4 => BLOCKED_SOURCE_DATA_CONFLICT, no numeric resolution
```

Candidate qualification lookups must return explicit `CANDIDATE_ONLY` authority and cannot be used through the ACTIVE runtime resolver.

## Validation Matrix

| Check | Status | Observation / Oracle |
|---|---|---|
| live main grounding | PASS | GitHub main ref |
| stale PR overlap classification | PASS | GitHub open-PR search |
| PR505 curve quarantine preserved | PASS | merged PR505 source inspection |
| source package identity | PASS | Advanced_Analysis fixed commit/blob inspection |
| generic registry implementation | NOT_RUN | not implemented yet |
| candidate table exact lookup | NOT_RUN | not implemented yet |
| off-grid fail-closed | NOT_RUN | not implemented yet |
| curve conflict fail-closed | NOT_RUN | not implemented yet |
| content-hash/provenance tests | NOT_RUN | not implemented yet |
| repository-native execution | NOT_RUN | pending implementation |
| browser acceptance | NOT_APPLICABLE | no UI/runtime switch in Stage 1 |

## Backup / Recovery

All planned production/test files are new. No existing file will be edited in the initial bounded implementation, so repository backup CLI is not applicable to those paths. If scope later requires editing an existing file, backup requirements must be re-evaluated before that edit.

## Highest Risk

Accidentally turning the conflicting Advanced_Analysis T3 curve digitization into an apparently governed numerical master. The implementation must encode that conflict as an explicit non-resolving state.

## EXACT_NEXT_ACTION

Create the generic master framework and the pinned SBC T3 Stage-1 source/candidate pack as new files; execute focused lifecycle, exact-grid, provenance and curve-quarantine tests before opening a draft PR.
