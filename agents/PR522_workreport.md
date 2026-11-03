# PR522 Workreport — SBC Type-3 Production Freeze PF-003

## Recovery Header

```text
WORK_INTENT: IMPLEMENT / VALIDATE / HANDOVER
CRITICALITY: ENGINEERING_CRITICAL
ISSUE: #514
PR: #522
BRANCH: agent/sbc-pf-003-candidate-currentness
BASE_MAIN: e97effb06ff9bfcad5ea87381abaa9f2665c1bdd
QUALIFICATION: QUALIFIED_FOR_SBC_TYPE3_PRODUCTION_FREEZE
OWNER_PROGRESSION: ok, proceed next phase
OWNER_PROGRESSION_COMMENT: #514 comment 5302780129
TAKEOVER_AUTHORITY: WRITE_ALLOWED
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
PR_RECOVERY_STATE: RECOVERABLE
CURRENT_SLICE: PF-003 per-scope candidate currentness + stale-async commit protection
FREEZE_STATE: BLOCKED / NOT_FROZEN
```

## Progression / Scope Boundary

PF-001 / PR #520 and PF-002 / PR #521 remain OPEN / DRAFT / BLOCKED / NOT_FROZEN. Owner progression authorizes this isolated slice only; it does not convert prior browser NOT_RUN evidence to PASS/FROZEN and does not grant merge authority.

PF-003 is independent of both unmerged SBC branches. It contains no Type-3 equation, master-assisted derivation, final LOF, facility-matrix integration, live UI/controller wiring, curve publication/activation, shared workflow/activity redesign, or AIV work.

## Live Grounding

```text
main                  e97effb06ff9bfcad5ea87381abaa9f2665c1bdd
main advance          731655e2... -> e97effb0... via merged AIV PF-01 #519
advance overlap       NONE with PF-003 SBC paths
PR #520 / PF-001      OPEN / DRAFT / BLOCKED / NOT_FROZEN
PR #521 / PF-002      OPEN / DRAFT / BLOCKED / NOT_FROZEN
PR #508               OPEN / DRAFT / salvage evidence only
competing SBC PF-003  none found
AIV / #513            OUT OF SCOPE
```

Current merged Mechanical controller was inspected as the repository-local safety precedent: per-scope pending tokens are invalidated by engineering edits and only a matching current token may commit.

Old #508 `tabs/vibration-integrity-sbc-master-assisted-controller.js` is `REIMPLEMENT_FROM_CONCEPT`, not `SALVAGE_EXACT`: its `evaluateMasterAssisted()` commits after `await` without an engineering-revision/current-operation guard. PF-003 specifically closes that stale-commit class.

## Implemented Contract

```text
NEW tabs/vibration-integrity-sbc-candidate-currentness.js
    schema: SbcType3CandidateCurrentnessStore.v1
    exact per-scope engineering revision
    engineering changes: PHYSICAL_INPUT | MANUAL_CURVE_EVIDENCE
    synchronous CURRENT -> STALE invalidation
    deterministic evaluation sequence/token
    exact pending-token + engineering-revision commit guard
    wrong embedded candidate scope rejection
    stale failure protection
    exact-scope current candidate inspection/read
    presentation/navigation engineering-state no-op
    deep immutable JSON-safe candidate snapshot

NEW tests/vibration-sbc-type3-candidate-currentness.test.mjs
    PF-07 through PF-10 plus isolation/supersession/presentation/immutability
```

Production module size: 222 physical lines (<300).

No existing production/test file was edited, so no production pre-edit backup was required. WIP pre-delete custody is retained as Git blob `9a387f346cc205221e12867265d4d508ab6ec610` for `agents/WIP_3_handoff.md`.

## Currentness Semantics

```text
engineering edit on scope S
  -> S.engineeringRevision += 1
  -> existing S candidate becomes STALE immediately
  -> S pending evaluation cleared
  -> other scopes unchanged

begin evaluation on S
  -> bind {scopeId, engineeringRevision, sequence, token}
  -> latest operation replaces older pending operation for S

completion on S
  -> require exact current pending token
  -> require exact current engineering revision
  -> require candidate.scopeId == S
  -> otherwise reject without mutating newer state

presentation/navigation change
  -> exact existing store returned
  -> no revision increment
  -> no candidate invalidation
```

Deterministic token: `SBC-T3-EVAL/<encoded scopeId>/<engineeringRevision>/<sequence>`. No wall clock or randomness is used.

## Frozen Regression Mapping

```text
SBC-PF-07 wrong facility-scope cached result rejected
SBC-PF-08 physical-input edit invalidates prior SBC candidate
SBC-PF-09 D/F/G evidence edit invalidates prior SBC candidate
SBC-PF-10 async stale result cannot overwrite newer input
```

Additional coverage proves A/B isolation, same-revision latest-intent supersession, stale failure protection, presentation neutrality, deterministic tokens, and immutable result custody.

## Exact Payload Custody / Local Validation

Exact GitHub production/test blobs equal the locally executed bytes:

```text
tabs/vibration-integrity-sbc-candidate-currentness.js
e7dcd31cab2cc8e33c07c0769d61541833712c7a

tests/vibration-sbc-type3-candidate-currentness.test.mjs
40e870aef5d702301df1005d016b6cd6d8af3181
```

```text
node v22.16.0
JS syntax                         PASS
focused PF-003 Node suite         PASS 11/11
PF-07 wrong/exact scope           PASS
PF-08 physical edit invalidation  PASS
PF-09 D/F/G edit invalidation     PASS
PF-10 stale async guard           PASS
same-revision supersession        PASS
A/B isolation                     PASS
presentation neutrality           PASS
stale failure protection          PASS
deterministic token               PASS
immutable candidate snapshot      PASS
```

No engineering expected value, tolerance, equation, source authority, curve state, or Screening authority was changed.

## Hosted CI Truth

Exact code + PR-handoff head inspected:

```text
head       06aacec776e7dbfa67b368cd008044bfb9607fa9
workflow   31891476570
job        95028270266
conclusion failure
steps      []
runner_id  0
```

GitHub annotation: `The job was not started because an Actions budget is preventing further use.`

Classification: `NOT_RUN / INFRASTRUCTURE_BLOCKED`. No product/test step executed, so the workflow failure is neither PF-003 product FAIL nor PASS.

## Browser / Authority / Freeze Truth

PF-003 is not connected to the live SBC workflow in this slice. Therefore the required two-facility browser journey is not claimed here.

```text
official served-app Chromium = NOT_RUN
reason                       = UNWIRED_PURE_STATE_SEAM
engineering calculation      = none
screening authority change   = none
curve authority change       = none
freeze state                 = BLOCKED / NOT_FROZEN
```

A later focused integration slice must connect real physical/manual D/F/G edits and candidate evaluation to this state contract and then execute the exact #514 A/B/edit/async Chromium experiment. SBC must remain candidate-only and must never replace FIT `screeningGoverning`.

## Handover Boundary

PR #522 is code-complete for PF-003's bounded state/currentness contract, but is not production-frozen and not merge-authorized.

Do not widen #522 into calculation/final LOF, #520/#521 code, facility matrix integration, live controller/UI wiring, shared #511/#512 architecture, curve activation, or AIV.

`EXACT_NEXT_ACTION`: keep #522 draft; after the prerequisite SBC calculation/derivation slices are accepted/reconciled, create a separate product-integration slice that consumes this currentness contract and proves PF-07–PF-10 live in Chromium.
