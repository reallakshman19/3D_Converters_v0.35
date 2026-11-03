# PR527 Workreport — SBC Type-3 Production Freeze PF-005

## Recovery Header

```text
WORK_INTENT: IMPLEMENT / VALIDATE / HANDOVER
CRITICALITY: ENGINEERING_CRITICAL
ISSUE: #514
PR: #527
BRANCH: agent/sbc-pf-005-runtime-cache-custody
STACK_BASE: PR #524 head 390aeb954f73eade6aa1f8344cd646d5c6048832
GROUNDED_CURRENT_MAIN: 36f53018d5c1cf8bec609e39d6995a6067bb5d01
QUALIFICATION: QUALIFIED_FOR_SBC_TYPE3_PRODUCTION_FREEZE
OWNER_PROGRESSION: proceed next
TAKEOVER_AUTHORITY: WRITE_ALLOWED
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
PR_RECOVERY_STATE: RECOVERABLE
CURRENT_SLICE: PF-005 runtime ES-module cache custody / served-module identity
FREEZE_STATE: BLOCKED / NOT_FROZEN
```

## Root Cause / Result

Current main's AIV PF-01 recovery proved that browser module caching can execute stale bytes from a mixed ES-module graph. PF-004 had the same exposure: its Vibration Integrity product entry retained `vibration-integrity-fit-placeholder-1`, and its new SBC children were reached through bare URLs.

PF-005 applies one deterministic cache identity to every changed/new SBC dependency edge:

```text
20260815-sbc-pf05-cache-1
```

The hypothesis is supported at source/diff level: the full PF-004-to-PF-005 production delta is import URL identity only; no calculation, state, authority, UI behavior, or curve-publication body changed.

## Current-main shared-entry reconciliation

Grounding at `main@36f53018...` established the accepted AIV key:

```text
20260815-aiv-pf01-cache-1
```

PF-005 preserves that exact AIV key in `tabs/engineering-calculations-tab.js` while replacing only the Vibration Integrity placeholder entry token with the SBC key.

## Pre-edit custody / backup truth

Native repository backup CLI was unavailable in the connector-only environment and is classified `NOT_RUN / ENVIRONMENT_BLOCKED`. Immutable Git blob custody was captured before each existing-file edit:

```text
tabs/engineering-calculations-tab.js                  04b5f1340b0300dd582a4d659af3079c2c847251
tabs/vibration-integrity-tab.js                       cc3ab1c219ed7f4c4efdbfbaab9a6fe716857067
tabs/vibration-integrity-user-data-shell.js           a5be41ce465fa561827e7e50643fa5016f5f7b3f
tabs/vibration-integrity-sbc-type3-controller.js      6346872d86e0ccf39b6328bba9167285d8793603
tabs/vibration-integrity-sbc-type3-state.js           5e81c826156c93a00c2c335ab307d79e215ee8e2
tabs/vibration-integrity-view.js                      e1a00053c14f133c6b1a3734220095a99cdefe47
tabs/vibration-integrity-mechanisms.js                dc1c9b4ae022b27fa9d1bde07899cf9c9979b084
converters/vibration/mechanisms/index.js              e19a1e0c82ae7e1edc557cff6e0112c2210fd8b1
converters/vibration/mechanisms/sbc.js                ccbf4155fa163303504d5e6371b0ea9bd036f049
converters/vibration/sbc/facility.js                  4aa59c49e9c8502b040322ab9d4424f2e22e8fb3
converters/vibration/sbc/type3-user-data.js           6a5766ab96c86ec3be3e69c2f9681c1fc10e126b
converters/vibration/sbc/type3-master-assisted-candidate.js fda1fdc7d444c5ce1965b12f834bfa65fbda6e6b
converters/vibration/sbc/type3-master-assisted-derivation.js 20498cc872681aadb436cc77cf491bca5c98fb0c
```

## Final production diff boundary

Direct Git compare from exact PF-004 head `390aeb95...` to PF-005 before PR allocation showed:

```text
13 production files changed
all 13 production files: import URL substitutions only
largest production delta: 5 added / 5 deleted import lines
no production body hunk
```

A transcription typo was detected immediately after the first derivation rewrite (`modifiedMinimumSpanM` vs existing `modifiedSpanM`) and corrected before PR allocation. The final derivation diff contains exactly two import URL substitutions and no body change.

## Versioned graph

```text
engineering-calculations-tab
  -> vibration-integrity-tab
vibration-integrity-tab
  -> vibration-integrity-user-data-shell
vibration-integrity-user-data-shell
  -> type3-user-data
  -> SBC Type-3 controller
  -> SBC Type-3 state
  -> SBC Type-3 view
  -> vibration-integrity-view
SBC Type-3 controller
  -> master-assisted candidate
  -> master-assisted derivation
  -> candidate currentness
  -> SBC Type-3 state
SBC Type-3 state
  -> type3-user-data
  -> candidate currentness
master-assisted candidate
  -> combination
  -> derivation
  -> type3-user-data
master-assisted derivation
  -> type3-user-data
  -> non-curve candidate data
type3-user-data
  -> combination
vibration-integrity-view
  -> vibration-integrity-mechanisms
vibration-integrity-mechanisms
  -> SBC facility
  -> mechanism index
mechanism index
  -> SBC mechanism adapter
SBC mechanism adapter
  -> SBC facility
SBC facility
  -> type3-user-data
```

Untouched FIT, Mechanical, generic user-data-model, master-registry and mechanism-contract dependencies are intentionally not rewritten with the SBC key.

## Durable regression / receipt

Added:

```text
tests/vibration-sbc-type3-runtime-cache-chain.test.mjs
ValidationRecords/VibrationSBC/ProductionFreeze/SBC-PF-005-cache-custody.json
```

The regression asserts 25 exact cache-key edges, preserves the current-main AIV cache identity, rejects the old FIT placeholder token, and confirms untouched Mechanical edges remain unversioned by the SBC key.

The existing `Vibration Production Freeze Validation` workflow already executes `node --test tests/*.test.mjs`; no workflow or package mutation was needed.

## Protected engineering invariants

Unchanged by direct diff inspection:

```text
D7 C=.68 D=.20 E=.70 F=.60 G=.20 LOFLOC=1 multiplier=1.42 final=.70
no-mass target=.284
missing/blank terms fail closed
only explicit no-unsupported-mass may auto C=0
T3-1..T3-4 publicationState=BLOCKED_SOURCE_DATA_CONFLICT
runtimeCurveActivation=false
masterPublicationAuthorized=false
engineeringAuthority=NONE
screeningAuthority=NOT_AUTHORIZED
designAuthority=false
masterDataAuthority=false
FIT remains screeningGoverning; SBC candidate tier only
PF-003 revision/token semantics unchanged
PF-004 live UI/state behavior unchanged
```

## Hosted validation observation

The first exact post-WIP-removal code-equivalent head was:

```text
head       6d982f7ca1d074ef9ff98dcd7ad21dcb6b154217
workflow   31898365393
job        95045073162
conclusion failure
steps      []
runner_id  0
annotation The job was not started because an Actions budget is preventing further use.
```

Classification:

```text
HOSTED_VALIDATION = NOT_RUN / INFRASTRUCTURE_BLOCKED
CACHE_CHAIN_TEST  = NOT_RUN / INFRASTRUCTURE_BLOCKED
CHROMIUM_STATUS   = NOT_RUN / INFRASTRUCTURE_BLOCKED
```

No repository test, cache-chain test, Playwright install, static server, Chromium step, or artifact upload executed. The GitHub `failure` conclusion is not represented as a product/code failure and is not relabeled PASS.

After this observation, only the validation receipt and this workreport were synchronized; production bytes did not change. The exact final docs-synchronized head must still be rechecked and recorded in the PR/issue checkpoint without another branch mutation.

## Validation ledger

| Check | Status | Observation |
|---|---|---|
| current-main grounding | PASS | `36f53018...` remained current before PR allocation |
| PF004→PF005 Git compare | PASS | production changes are import URL identity only |
| old FIT placeholder removed | PASS / SOURCE INSPECTION | shared entry uses SBC PF-005 key |
| current-main AIV key preserved | PASS / SOURCE INSPECTION | `20260815-aiv-pf01-cache-1` |
| cache-chain regression | NOT_RUN / INFRASTRUCTURE_BLOCKED | hosted job received no runner / executed zero steps |
| D7/no-mass numeric rerun | NOT_RUN / NOT_APPLICABLE_TO_URL_ONLY_DIFF | numerical code bodies unchanged |
| hosted workflow | NOT_RUN / INFRASTRUCTURE_BLOCKED | Actions budget prevented job startup |
| official served-app Chromium | NOT_RUN / INFRASTRUCTURE_BLOCKED | Chromium step never started |
| production freeze | NOT_FROZEN | live browser evidence still required |

## Handover boundary

PR #527 is code-complete for runtime cache custody only. It is stacked on #524 and must not be merged independently.

Do not widen #527 into equations, source/master changes, curve activation, UI redesign, currentness logic, facility semantics, AIV work, or the live Chromium acceptance itself.

`EXACT_NEXT_ACTION`: on an executable environment, run the full repository Node suite and the exact served Chromium two-facility SBC journey using the cache-custodied graph. Until that evidence exists, keep `FREEZE_STATE=BLOCKED / NOT_FROZEN`.
