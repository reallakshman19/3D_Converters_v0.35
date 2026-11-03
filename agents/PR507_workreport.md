# PR507 — EI Master Pack Stage 1

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED
WORK_INTENT: IMPLEMENT / VALIDATE / HANDOVER
CRITICALITY: ENGINEERING_CRITICAL
PR: 507
BRANCH: agent/ei-master-pack-stage1
BASE_MAIN: 0b03855a6d9031c8b531e23bdd3deea3b7fdc5d4
TECHNICAL_HEAD: ac167dca9d2dc94bdfca3c7b586260bc7febf89a
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
```

The report commit is newer than `TECHNICAL_HEAD`; technical head is the exact implementation/test checkpoint inspected before this report-only commit.

## Mission / Outcome

Rebuild the useful governed-master framework from stale PR #483 on current main, pin the fixed `reallaksh19/Advanced_Analysis@6111ddbc0f27dd95b50a80c569a2c4daba3b3921/docs/EI data` source package, register the source-reconciled SBC T3 non-curve tables as non-authorizing CANDIDATE masters, and preserve merged PR #505's fail-closed quarantine of conflicting T3-1..T3-4 curve digitization.

Stage 1 is implemented without changing current SBC runtime, FIT/AIV authority, UI, release scripts or workflows.

## Current Architecture

```text
Pinned Advanced_Analysis source objects
        ↓
VibrationMaster.v1
  authorityClass
  source identity + locator
  deterministic SHA-256 content hash
        ↓
VibrationMasterRegistry.v1
  CANDIDATE / ACTIVE / RETIRED
        ↓
ACTIVE-only runtime resolution

Separate qualification path:
CANDIDATE -> inspectVibrationMasterCandidate()
          -> CANDIDATE_ONLY + provenance + NONE authority
```

The candidate inspection path is intentionally separate from runtime resolution.

## Stage-1 Source Manifest

Pinned package:

```text
repository = reallaksh19/Advanced_Analysis
commit     = 6111ddbc0f27dd95b50a80c569a2c4daba3b3921
root       = docs/EI data
runtimeFetchAllowed = false
```

Pinned objects:

```text
P0_SBC_Master_Data.md                         5312c9e2cf86af9e940ba722fcbee64702aeccd3
EI_AVIFF_Guidelines_2nd_Edition_Examples.md c050cd90802c27241c510c6f0ac43bfaf7a89e9d
EI_AVIFF_Complete_Master_Register.md         51bca43473be8018d4ce48fb440ee4d7bd0abc82
README.md                                     72730d065bcd2aa80976f0ad2870aafacff0bb4c
```

No runtime fetch from Advanced_Analysis is permitted.

## Candidate Masters

Three `EI_METHOD_MASTER` records are registered as `CANDIDATE`:

```text
EI_AVIFF.T3.TABLE_T3_1.FITTING_SPAN_FACTORS
EI_AVIFF.T3.TABLE_T3_2.FIRST_SPAN_LIMITS
EI_AVIFF.T3.TABLE_T3_3.BETWEEN_MAIN_LINES_LIMITS
```

These retain the existing #484/#505 table values:
- T3-1: 15 fitting-factor rows;
- T3-2: 8 exact nominal-size rows;
- T3-3: 8 exact nominal-size rows.

Exact candidate inspection supports:
- exact canonical fitting key;
- exact nominal size in inches;
- no nearest-row behavior;
- no interpolation;
- no extrapolation;
- off-grid -> `SBC_T3_MASTER_GRID_MISS`.

Candidate resolution returns:

```text
status               = CANDIDATE_ONLY
engineeringAuthority = NONE
screeningAuthority   = NOT_AUTHORIZED
designAuthority      = false
masterDataAuthority  = false
```

## Curve Quarantine

Merged PR #505 remains authoritative for curve disposition. The supplied T3 digitization fails EI Worked Example D7 at three probes:

```text
T3-1  D=1.5 in, span=1.285714... m  expected 0.2  supplied 0.4
T3-3  D=1.5 in, span=2.3 m          expected 0.6  supplied 0.7
T3-4  D=1.5 in, span=1.4 m          expected 0.2  supplied 0.3
```

Therefore `resolveEiAviffSbcT3CurveCandidate()` returns:

```text
status = BLOCKED_SOURCE_DATA_CONFLICT
value  = null
runtimeCurveActivation = false
masterPublicationAuthorized = false
```

for every T3-1..T3-4 request. No numeric curve master is published in PR507.

## Authority Classes

Framework supports typed source precedence work planned for later phases:

```text
EI_METHOD_MASTER
EI_REFERENCE_LOOKUP
EI_DEFAULT_PROPERTY
PROJECT_INPUT
```

`authorityClass` is included in the engineering-content hash; changing authority class changes content identity.

## Changed-File Ledger

Technical checkpoint contains exactly nine new files:

```text
agents/WIP-ei-master-pack-stage1_workreport.md
converters/vibration/masters/canonical.js
converters/vibration/masters/validate.js
converters/vibration/masters/registry.js
converters/vibration/masters/index.js
converters/vibration/masters/ei-aviff-sbc-t3-candidate.js
data/vibration/ei-aviff-2e/source-manifest.v1.json
tests/vibration-master-registry-stage1.test.mjs
tests/vibration-sbc-t3-master-pack-stage1.test.mjs
```

This numbered handoff is report-only and becomes the tenth changed file after allocation.

No existing production/test file was modified. Repository backup CLI is therefore not applicable to the Stage-1 implementation files.

## Validation Ledger

| Check | STATUS | Observation / Oracle |
|---|---|---|
| live-main grounding | PASS | main `0b03855...` |
| behind/ahead at technical checkpoint | PASS | 9 ahead / 0 behind |
| source object identity | PASS | pinned GitHub blobs inspected |
| #505 curve quarantine preserved | PASS | source inspection / worked-example conflicts retained |
| module-size rule | PASS | all new JS files <300 physical lines |
| reconstructed focused Node execution | PASS | 10/10 tests on exact authored module/test content |
| candidate ACTIVE isolation | PASS | executed focused regression |
| explicit activation/hash preservation | PASS | executed focused regression |
| authority/source hash sensitivity | PASS | executed focused regression |
| exact table-grid resolution | PASS | executed focused regression |
| off-grid failure | PASS | executed focused regression |
| curve numeric resolution blocked | PASS | executed focused regression |
| D7 conflict evidence retained | PASS | executed focused regression |
| exact technical-head workflow runs | NOT_RUN | GitHub returned `[]` |
| exact technical-head status contexts | NOT_RUN | GitHub returned `[]` |
| complete repository-native suite | NOT_RUN | connector environment has no complete checkout |
| browser acceptance | NOT_APPLICABLE | no UI/runtime switch |

The reconstructed test execution is not represented as repository-native CI.

## Appendix A

A1 Production Trace: 19/20
A2 Current Failure Isolation: 20/20
A3 Authority / Invariant: 20/20
A4 Independent Validation: 18/20
A5 Minimal Patch / Next Commit: 19/20

**Total 96/100; all sections >=18/20 — PASS.**

## Protected Invariants

- CANDIDATE records are not runtime-resolvable;
- ACTIVE transition must be explicit;
- no multiple ACTIVE revisions per master ID;
- retired masters cannot reactivate;
- source/authority/data changes alter content hash;
- no curve interpolation/extrapolation;
- conflicting T3 curves return no numerical value;
- current manual User Engineering Data fallback remains untouched;
- SBC screening/design authority is not promoted;
- FIT/AIV authority is unchanged.

## Highest Risk

A future change could try to activate the supplied T3 curve digitization because the source package labels it as master data. PR507 makes the contradiction a first-class quarantine object and permanent test oracle; activation must remain impossible until corrected geometry reproduces the worked examples.

## EXACT_NEXT_ACTION

Review PR507 exact final diff and, if Stage 1 is accepted by the owner, merge only with explicit authorization. Follow-on Stage 2 should consume these table candidates and separately resolve/correct T3-1..T3-4 curve geometry before any SBC runtime master activation or screening qualification.
