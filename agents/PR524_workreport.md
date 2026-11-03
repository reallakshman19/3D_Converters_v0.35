# PR524 Workreport — SBC Type-3 Production Freeze PF-004

## Recovery Header

```text
WORK_INTENT: IMPLEMENT / VALIDATE / HANDOVER
CRITICALITY: ENGINEERING_CRITICAL
ISSUE: #514
PR: #524
BRANCH: agent/sbc-pf-004-live-integration
STACK_BASE: PR #522 @ af0ca1e2e7e899ced52cf402218860780a7c4d63
LIVE_MAIN_AT_ENTRY: e97effb06ff9bfcad5ea87381abaa9f2665c1bdd
QUALIFICATION: QUALIFIED_FOR_SBC_TYPE3_PRODUCTION_FREEZE
OWNER_PROGRESSION: ok, proceed next phase
COORDINATION_COMMENT: #514 comment 5302898291
TAKEOVER_AUTHORITY: WRITE_ALLOWED
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
PR_RECOVERY_STATE: RECOVERABLE
CURRENT_SLICE: PF-004 stacked master-assisted live-product integration
FREEZE_STATE: BLOCKED / NOT_FROZEN
```

## Stack / dependency truth

PF-004 is deliberately stacked on PF-003 / PR #522 and is not a standalone merge candidate.

```text
#520 PF-001  OPEN / DRAFT / browser NOT_RUN
#521 PF-002  OPEN / DRAFT / browser NOT_RUN
#522 PF-003  OPEN / DRAFT / browser NOT_RUN
#524 PF-004  OPEN / DRAFT / STACKED / NOT_FROZEN
```

PF-004 replays exact validated PF-001/PF-002 payloads so the integration branch can exercise the complete engineering path without pretending those sibling drafts are merged to main.

Exact replay blobs:

```text
PF-001 type3-combination.js                         2c1212e67c8403e9dc55fe64a6f55a012cb57a33
PF-001 type3-user-data.js                           6a5766ab96c86ec3be3e69c2f9681c1fc10e126b
PF-001 combination frozen test                      a589e023f2342821dfb92d604ccda5a1dfb77533
PF-002 type3-noncurve-candidate-data.js             3267534b7688906156bb30454d876a9c4b265614
PF-002 type3-master-assisted-derivation.js           20498cc872681aadb436cc77cf491bca5c98fb0c
PF-002 derivation frozen test                        0f34a4a625901bcdc4f9591e685dac81eec2b219
PF-003 currentness implementation                    e7dcd31cab2cc8e33c07c0769d61541833712c7a
PF-003 currentness regression                        40e870aef5d702301df1005d016b6cd6d8af3181
```

No prerequisite expected value/tolerance was changed by PF-004.

## Live defect / root cause

Current main still exposed the older explicit-intermediate SBC workflow. It could calculate Type-3 when the engineer manually supplied C/E/location/main-line/multiplier as rows, but it did not connect the qualified master-assisted physical-input derivation, exact manual D/F/G project evidence, and PF-003 currentness guard into the live facility workflow.

The root integration gap was distributed across four SBC-specific boundaries:

1. no orchestrator combined PF-002 derived terms with exact project D/F/G evidence and PF-001 arithmetic;
2. no controller bound physical/evidence edits to per-scope engineering revisions and async operation tokens;
3. facility/mechanism matrix did not consume a current exact-scope precomputed SBC candidate;
4. the SBC panel still described auto-derivable non-curve terms as explicit project inputs.

## #512 overlap decision

Live #512 changed-file inspection showed one direct overlap:

```text
tabs/vibration-integrity-user-data-shell.js
```

The coordination decision was recorded on #514 comment `5302898291` after the Owner explicitly directed the next live-product integration phase.

The PF-004 shared hunk is bounded to:

- initialize SBC-specific state;
- delegate SBC-specific click/change events;
- notify SBC currentness when generic project-evidence rows change.

PF-004 does not alter #512 workspace tabs, workflow vocabulary, authority tiers, Activity architecture, generic selector contract, or `vibration-integrity-ui-contract.js`.

#511 live changed-file inspection shows no PF-004 path overlap.

## Pre-edit rollback custody

The connector environment has no authenticated checkout for `node utils/backup.js`. Immutable Git blob custody was recorded before every existing-file edit:

```text
converters/vibration/sbc/type3-user-data.js                69215382db2fabaae8356370ca5760def19d4cba
converters/vibration/sbc/facility.js                       f723aace9c7c7fcbedfcb0fcab64c528dcc1f046
converters/vibration/mechanisms/sbc.js                     fe0a15b8cb32b0d1e16ae41f0fd2e934b88a2557
tabs/vibration-integrity-mechanisms.js                     38368ac98cd685b8fa0f5bd4b680e886cc7c426e
tabs/vibration-integrity-view.js                           ef061686257455ed611545611eceff6165d8fe86
tabs/vibration-integrity-user-data-shell.js                e81e50c22f997fbde28a8cece348dd34e1ec15df
tabs/vibration-integrity-sbc-type3-view.js                 85146c0a72cea36d7c9a37d24fe355356da95c01
```

## Implemented path

```text
facility SBC action
  -> exact SBC facility scope
  -> physical project inputs
  -> candidate non-curve C/E/location/main-line/1.42 derivation
  -> exact D/F/G request rows at controlled coordinates
  -> engineer enters D/F/G LOF + project/source reference
  -> master-assisted candidate orchestrator validates exact scope/coordinates/source
  -> PF-001 Type-3 combination
  -> PF-003 exact scope/revision/token commit guard
  -> current per-scope candidate cache
  -> facility mechanism matrix candidate tier only
```

The legacy explicit-intermediate calculation path remains available as a compatibility fallback.

## Engineering custody / D7

Frozen D7 remains:

```text
C       = 0.68
D       = 0.20  manual exact T3-1 project evidence
E       = 0.70
F       = 0.60  manual exact T3-3 project evidence
G       = 0.20  manual exact T3-4 project evidence
LOFLOC  = 1.00
main-line multiplier = 1.42
final SBC LOF = 0.70
```

Exact manual curve coordinates use the PF-002 request objects and `1e-12` deterministic comparison tolerance. Every consumed curve row must have exact scope/blocker/record identity, exact x/y units and coordinates, one unambiguous row, a finite nonnegative LOF, and a non-empty project/source reference.

Curves remain quarantined:

```text
publicationState = BLOCKED_SOURCE_DATA_CONFLICT
runtimeCurveActivation = false
masterPublicationAuthorized = false
```

No reconstruction/interpolation/extrapolation/tuning/publication/runtime activation occurs.

## Currentness / scope contract

```text
physical input edit
  -> exact scope engineeringRevision + 1
  -> existing candidate STALE synchronously
  -> current candidate map entry removed
  -> pending evaluation invalidated

D/F/G project evidence edit
  -> exact affected scope revision + 1
  -> current candidate removed for that scope only

begin evaluation
  -> bind {scopeId, engineeringRevision, deterministic token}

completion
  -> exact pending token + revision required
  -> embedded candidate scope must match facility scope
  -> stale completion cannot mutate newer state

navigation/presentation
  -> no engineering revision change
```

## Facility / authority contract

The facility adapter accepts a precomputed candidate only when its embedded scope matches the exact current facility scope, it is calculated, and its LOF is finite. Explicit stale/currentness markers other than `CURRENT` fail closed.

SBC authority remains:

```text
engineeringAuthority = NONE
screeningAuthority = NOT_AUTHORIZED
designAuthority = false
masterDataAuthority = false
```

The mechanism matrix's screening selector is unchanged. A current SBC `.70` may become `candidateGoverning`; FIT `.34` remains `screeningGoverning` / `implementedGoverning` in the frozen fixture.

## Professional SBC presentation

The touched SBC-specific panel now displays in text, not color alone:

- exact facility scope;
- candidate-only / Screening-not-authorized authority;
- physical project fields with units;
- AUTO-DERIVED C/E/location/main-line/1.42 section;
- MANUAL EXACT CURVE EVIDENCE D/F/G section with figure/x/y coordinates;
- project/source reference status;
- permanent `BLOCKED SOURCE DATA` explanation;
- INPUT REQUIRED / INVALID;
- EVALUATING;
- STALE / RERUN REQUIRED;
- current `SBC CANDIDATE · NOT SCREENING AUTHORITY`;
- legacy explicit intermediate-input fallback.

No top-level workspace redesign or #512 vocabulary change is included.

## Module-size guard

New authored production modules:

```text
type3-master-assisted-candidate.js      162 lines
vibration-integrity-sbc-type3-state.js  103 lines
vibration-integrity-sbc-type3-controller.js 232 lines
```

All are below 300 physical lines.

## Validation ledger

| Check | STATUS | Observation / oracle |
|---|---|---|
| qualification / progression | PASS | #514 qualification + Owner next-phase direction |
| live main / PR grounding | PASS | current GitHub state read before mutation |
| #512 overlap decision | PASS | #514 comment `5302898291`; one minimal shared file |
| exact PF-001/PF-002 replay identity | PASS | Git blob reuse, no retyping for engineering-critical payload |
| authored branch/local blob identity | PASS | checked authored orchestrator/controller/state/tests + existing update SHAs |
| JS syntax checks | PASS | all PF-004 authored/updated JS parsed locally |
| focused local evidence/race harness | PASS 7/7 | implementation-focused stubs; not full repository/browser oracle |
| D7 exact evidence path in local harness | PASS | expected/observed `.70` |
| wrong exact curve coordinate | PASS | fail closed |
| missing curve source reference | PASS | fail closed |
| wrong-scope project rows | PASS | not consumed |
| physical edit vs stale async completion | PASS | old completion discarded |
| A/B navigation neutrality | PASS | no engineering invalidation |
| D/F/G edit scope isolation | PASS | matching scope only invalidated |
| PF-001 frozen test | COMMITTED / NOT_HOSTED_RUN | exact test blob replayed |
| PF-002 frozen test | COMMITTED / NOT_HOSTED_RUN | exact test blob replayed |
| PF-003 frozen currentness suite | INHERITED | stacked #522 |
| PF-004 repository integration tests | COMMITTED / NOT_HOSTED_RUN | exact branch tests present |
| official served-app Chromium | NOT_RUN | no served authenticated checkout/browser runner available here |
| production freeze | NOT_FROZEN | browser + full repository validation still required |

### Hosted CI at PR allocation head

```text
head       32004463322b532e365476868eb3593ad237d17f
workflow   31892705678
job        95031265525
conclusion failure
steps      []
runner_id  0
annotation The job was not started because an Actions budget is preventing further use.
classification NOT_RUN / INFRASTRUCTURE_BLOCKED
```

No hosted product/test/browser step executed. The GitHub failure conclusion is neither product FAIL nor PASS.

## Browser / freeze truth

PF-004 is wired as a product integration draft, but official served-app Chromium has not run on this branch. Required live proof still includes the exact two-facility A/B journey, physical and D/F/G invalidation, stale async suppression, matrix candidate/screening governing status, 1280/1440 UI acceptance, focus/keyboard behavior, and zero uncaught console errors.

```text
CHROMIUM_STATUS = NOT_RUN
FREEZE_STATE = BLOCKED / NOT_FROZEN
MOVE_NEXT = false unless Owner explicitly directs another isolated slice while infrastructure remains blocked
```

The Owner's progression direction allowed this integration work to proceed despite prior browser infrastructure blockage; no NOT_RUN state has been relabeled PASS/FROZEN.

## Handover boundary

Do not merge #524 until:

1. prerequisite PF-001/PF-002/PF-003 ownership is reconciled;
2. the #512 shared-shell hunk is replayed against accepted #512 if that branch moves;
3. full repository tests execute on the exact candidate head;
4. official served-app Chromium executes the required SBC journey;
5. D7 and applicable frozen regressions pass on the exact integrated head;
6. Owner explicitly authorizes merge.

`MERGE_AUTHORITY=OWNER_ONLY / NOT_GRANTED`.