# PR529 Workreport — SBC Type-3 Production Freeze PF-006

## Recovery Header

```text
WORK_INTENT: IMPLEMENT / VALIDATE / HANDOVER
CRITICALITY: ENGINEERING_CRITICAL
ISSUE: #514
PR: #529
BRANCH: agent/sbc-pf-006-browser-acceptance
STACK_BASE: PR #527 head a68cba98d81df5e182c17bfa4233a42a9e553157
GROUNDED_CURRENT_MAIN: 36f53018d5c1cf8bec609e39d6995a6067bb5d01
QUALIFICATION: QUALIFIED_FOR_SBC_TYPE3_PRODUCTION_FREEZE
OWNER_PROGRESSION: ok proceed
TAKEOVER_AUTHORITY: WRITE_ALLOWED
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
PR_RECOVERY_STATE: RECOVERABLE
CURRENT_SLICE: PF-006 SBC-specific served-Chromium acceptance harness
FREEZE_STATE: BLOCKED / NOT_FROZEN
```

## Defect / ownership boundary

The shared production-freeze Chromium journey owned by #511 currently validates FIT, Mechanical candidate separation and FIT evidence export. It does not enter the SBC Type-3 master-assisted product path. Therefore restored hosted infrastructure alone would still be insufficient to produce an SBC freeze receipt.

PF-006 adds a dedicated SBC acceptance harness and does not edit:

```text
scripts/validate-vibration-production-freeze-browser.mjs
.github/workflows/vibration-mechanical-stage4-validation.yml
```

or any production file. Shared runner/protocol/release ownership remains with #511.

## Exact scope

PF-006 adds only:

```text
scripts/vibration-sbc-type3-browser-fixture.mjs
scripts/validate-vibration-sbc-type3-production-freeze-browser.mjs
tests/vibration-sbc-type3-production-freeze-browser-contract.test.mjs
ValidationRecords/VibrationSBC/ProductionFreeze/SBC-PF-006-browser-harness.json
agents/PR529_workreport.md
```

The pre-PR WIP handoff is retired after this report is durable.

## Two-facility product fixture

The browser harness generates real product input files from two already-controlled FIT benchmark cases and uploads them through the Vibration Integrity file controls:

```text
EI-D2-FIT-RELIEF-UPSTREAM-4IN
EI-D2-FIT-RECYCLE-SUCTION-6IN
```

It requires:

```text
READY     2
NOT_READY 0
```

before running FIT and reading each facility's exact live SBC scope from `data-vi-sbc-facility-scope`.

## Frozen SBC oracle / evidence custody

```text
C       .68
D       .20  exact T3-1 project read
E       .70
F       .60  exact T3-3 project read
G       .20  exact T3-4 project read
LOFLOC  1.00
mult    1.42
SBC LOF .70
```

Physical vector:

```text
first span unsupported mass = true
fitting = WELDOLET
branch length = 700 mm
valve class = 600
configuration = one valve / integral DBB
parent schedule = 120
SBC diameter = 1.5 in
first span = .9 m
subsequent mass span = 2.3 m
subsequent no-mass span = 1.4 m
location = VALVE
```

D/F/G rows are entered through visible User Engineering Data controls with the exact prepared x/y coordinates and a non-empty D7 source reference. T3-1..T3-4 remain `BLOCKED_SOURCE_DATA_CONFLICT`, `runtimeCurveActivation=false`, `masterPublicationAuthorized=false`. No interpolation, extrapolation, curve reconstruction or publication occurs.

## Browser acceptance mapping

```text
PF-007  served facility adapter rejects wrong-scope precomputed candidate
        INVALID_PRECOMPUTED_CANDIDATE / FACILITY_SCOPE_MISMATCH

PF-008  physical edit on facility A invalidates A synchronously;
        facility B remains current

PF-009  D/F/G evidence edit on facility A invalidates A only;
        facility B remains current

PF-010  same-task Evaluate + physical edit starts evaluation, then edits the
        synchronously rerendered input before the promise continuation can commit;
        stale completion cannot restore A; facility B remains current

AUTH     both facilities may show SBC .70 in candidate tier;
        FIT remains screening governing
```

The harness also requires visible `BLOCKED SOURCE DATA`, `SBC CANDIDATE · NOT SCREENING AUTHORITY`, and zero Chromium page/console errors.

## Durable artifacts on successful browser execution

```text
01-two-facility-screening.png
02-facility-a-d7.png
03-facility-b-d7.png
04-two-facility-authority.png
05-stale-race-isolation.png
99-failure.png                         failure only
sbc-type3-production-freeze-receipt.json
```

Receipt schema: `VibrationSbcType3ProductionFreezeReceipt.v1`.
Gate: `SBC_TYPE3_TWO_FACILITY_USER_JOURNEY`.

## Exact payload validation

GitHub and locally executed/syntax-checked bytes are identical:

```text
scripts/vibration-sbc-type3-browser-fixture.mjs
386be6398b27400a217db55ad05a888874078322

scripts/validate-vibration-sbc-type3-production-freeze-browser.mjs
5644e329146c10956ba56bdc7cf34896e48eddaa

tests/vibration-sbc-type3-production-freeze-browser-contract.test.mjs
0bab89b9e9a8e7721575f89dc16049f1f5ae8eaa
```

Local validation:

```text
helper node --check            PASS
harness node --check           PASS
browser contract suite         PASS 5/5
helper physical lines          175
harness physical lines         231
contract physical lines        65
longest harness functions      runAcceptance 30; main 29
```

The 5/5 suite validates the source/acceptance contract only. It is not a browser PASS.

## Repository / browser execution truth

```text
full repository Node suite     NOT_RUN / no local checkout
Playwright served Chromium     NOT_RUN / no executable local Playwright served environment
```

The existing GitHub production-freeze workflow is triggered by the new `tests/vibration-**` file and would execute the static contract inside `node --test tests/*.test.mjs` if a runner starts. Its browser step still invokes the #511 shared FIT/Mechanical script, not the new SBC-specific script. PF-006 deliberately does not assume or take over #511 runner ownership.

`EXACT_NEXT_ACTION`: inspect the exact post-handoff PR head's hosted run. If runner assignment remains blocked, record `NOT_RUN / INFRASTRUCTURE_BLOCKED`; do not call the static 5/5 result or any zero-step workflow a Chromium PASS.

## Authority / merge state

Unchanged:

```text
engineeringAuthority=NONE
screeningAuthority=NOT_AUTHORIZED
designAuthority=false
masterDataAuthority=false
FIT remains screeningGoverning
SBC may be candidateGoverning only
```

PR #529 is a stacked draft on #527. `MERGE_AUTHORITY=OWNER_ONLY / NOT_GRANTED`. Do not merge.
