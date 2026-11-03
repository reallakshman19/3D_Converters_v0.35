# PR532 — Canonical USER_CALCULATED_KD3 Product Integration Work Report

## Recovery Header

```text
HANDOVER_READINESS: READY_WITH_VALIDATION_BLOCKER
PR_RECOVERY_STATE: HEALTHY
WORK_INTENT: IMPLEMENT
CRITICALITY: ENGINEERING_CRITICAL
TAKEOVER_AUTHORITY: WRITE_ALLOWED
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
REPOSITORY: reallaksh19/3D_Converters
PR: 532
BRANCH: agent/hp-user-calculated-kd3-integration
STACKED_BASE_PR: 531
STACKED_BASE_BRANCH: agent/hp-ch9-fatigue-foundation-r3
STACKED_BASE_SHA: dce37cc2b1814d4a487e6ca05adb4b67d67cf182
NATIVE_KD320: NOT_QUALIFIED / BLOCKED
CURRENT_PRODUCT_MODE: USER_CALCULATED_KD3
EXTERNAL_DATA_QUALIFICATION: DRAFT
CODE_COMPLIANCE: FALSE / NOT_ESTABLISHED
DESIGN_AUTHORITY: FALSE / NOT_ESTABLISHED
```

## Mission

Integrate the PR531 `USER_CALCULATED_KD3` contract into the central calculation registry and the HP piping-class product path without implementing or implying native KD320 authority.

The governing authority split is preserved:

```text
Salt = CORE straight-pipe pressure-cycle calculation
       + optional user Salt QA cross-check
Seq  = EXTERNAL / USER SUPPLIED
N    = EXTERNAL / USER SUPPLIED
n    = GOVERNED TRANSIENT SPECTRUM
Ui   = CORE DERIVED n/N
U    = CORE DERIVED Miner sum
```

No native KD320 mean-stress formula is implemented in this PR.

## Central Calculation API

Registered calculation:

```text
PIPE.B313.CH9.FATIGUE_USER_CALCULATED
```

Adapter:

```text
converters/engineering-calculations/adapters/b313-chapter-ix-user-calculated-fatigue.js
```

The adapter calls the canonical domain evaluator:

```text
evaluateChapterIxUserCalculatedFatigueSpectrum(...)
```

It exposes:

- calculation state;
- independent-check state;
- cumulative usage and unity state;
- per-cycle CORE Salt;
- optional user-Salt QA state;
- external Seq/N;
- zero-damage state;
- Ui;
- per-cycle authority/provenance.

The method is implemented, but caller-supplied external KD-3 data are deliberately **not** promoted to project-approved/governed master data:

```text
qualification.method = IMPLEMENTED
qualification.data = DRAFT
qualification.designAuthority = false
engineeringAuthority = EXTERNAL_KD3_REVIEW_ONLY
codeCompliance = false
canUseForDesignAuthority = false
```

The central adapter also rejects calculator/checker identity collisions after trim + case normalization.

## Canonical Evaluator Custody Hardening

The PR531 evaluator is reused rather than duplicated. In this stacked PR its checker-independence comparison is hardened to normalized identity semantics, so product UI and central API use the same fail-closed checker rule:

```text
trim + locale-lowercase(calculatedBy)
!=
trim + locale-lowercase(checkedBy)
```

This is provenance/custody hardening only; no fatigue equation or KD320 formulation is changed.

## Canonical Product UI

Product module:

```text
engineering/hp-class-standardization/user-calculated-fatigue-product.js
```

It replaces the visible legacy KD-3 matrix while retaining the hidden compatibility DOM needed by the existing package/workflow shell.

Visible table:

```text
Wall
Cycle
PA
PB
DeltaP
CORE Salt
User Salt
Salt QA
User Seq
User N
n
Ui=n/N
Review state
Per-cycle provenance
```

Per-cycle provenance:

```text
code
edition
methodRef
calculationRef
calculatedBy
checkedBy
checkedAt
```

Native option remains visible but disabled:

```text
CORE KD-3 — Not Qualified
```

The PR531 `fatigue-authority-guard.js` continues to block legacy automatic Seq and automatic fatigue-curve N paths.

## Salt QA

User Salt remains optional.

When supplied, it is compared against CORE Salt using the existing repository QA relative tolerance:

```text
1e-4
```

This is a repository QA comparison only and is not an ASME acceptance tolerance.

Mismatch is visible in the product as:

```text
MISMATCH
SALT MISMATCH
```

and the canonical evaluator fails closed as `USER_SALT_MISMATCH`.

## Zero-Damage Custody

The UI and package contract explicitly support:

```text
CORE Salt = 0
Seq = 0
N = null / N/A
Ui = 0
```

Blank inputs are no longer used as the semantic representation of zero damage in the canonical surface.

## JSON / CSV Exchange

Module:

```text
converters/b313-chapter-ix/user-calculated-fatigue-exchange.js
```

JSON schema:

```text
b313-ch9-user-calculated-fatigue-exchange/v1
```

JSON includes:

- geometry;
- governed spectrum;
- state/transition identity;
- external rows;
- false native/design/Code authority flags.

CSV columns:

```text
cycleId
locationId
fromStateId
toStateId
userAlternatingStressIntensityMpa
equivalentAlternatingStressMpa
permissibleCycles
code
edition
methodRef
calculationRef
calculatedBy
checkedBy
checkedAt
associatedMeanStressMpa
beta
saPrimeMpa
```

JSON and CSV exports perform serialize -> parse round-trip verification before download.

CSV authoring template:

```text
engineering/hp-class-standardization/qualification/user-calculated-fatigue.template.csv
```

## Authority-Package Round Trip

The HP evidence package carries:

```text
userCalculatedKd3Evidence[]
```

in addition to legacy compatibility row evidence.

All package lifecycles reject structurally invalid canonical fatigue evidence, including:

```text
User Salt < 0
Seq < 0
supplied N <= 0
Seq = 0 with a numeric N
checkedBy without checkedAt
checkedAt without checkedBy
normalized checkedBy == calculatedBy
```

Draft / for-review packages may remain incomplete, but they cannot transport known-invalid fatigue values or malformed checker custody.

For an `approved-record` document lifecycle, canonical rows additionally require:

- finite Seq >= 0;
- N > 0 when Seq > 0;
- N null/N/A when Seq = 0 zero-damage custody is used;
- code / edition / method / calculation reference / calculator identity;
- checkedBy + checkedAt;
- checker distinct from calculator.

The UI evidence bridge preserves per-cycle User Salt, Seq, N and calculation-basis custody across package export/import.

Import fails closed if the canonical evidence set cannot be restored completely to the recalculated wall/cycle keys:

```text
canonical.expected !== canonical.restored
  -> USER_CALCULATED_KD3 package restore incomplete
```

## Tests Added / Extended

```text
tests/b313-chapter-ix-user-calculated-fatigue-product.test.mjs
tests/b313-chapter-ix-user-calculated-fatigue-package-roundtrip.test.mjs
```

Coverage declared in source includes:

- registry presence;
- central API execution;
- external Seq/N authority;
- external-data qualification remains DRAFT;
- normalized checker independence;
- Salt match/mismatch;
- cumulative U;
- zero damage;
- JSON round trip;
- CSV round trip;
- quoted CSV fields;
- JSON authority-promotion rejection;
- product UI canonical-binding source checks;
- package positive-damage round trip;
- package zero-damage round trip;
- positive Seq missing-N rejection;
- invalid negative Salt/Seq/N rejection even for review lifecycle;
- unpaired checker/timestamp rejection even for review lifecycle;
- checker-independence rejection;
- partial canonical package restore fail-closed source check.

Consolidated command:

```text
npm run verify:hp-chapter-ix-fatigue
```

## Diff Reconciliation

The branch remains directly stacked on the exact #531 parent head:

```text
BASE_SHA: dce37cc2b1814d4a487e6ca05adb4b67d67cf182
BEHIND_BY: 0
```

Changed paths are confined to:

- central USER_CALCULATED_KD3 adapter/registry exports;
- canonical evaluator provenance hardening;
- exchange module;
- HP product UI and evidence bridge;
- authority-package canonical evidence support;
- CSV template;
- tests/package script;
- this recovery record.

No native KD320 implementation was added.

## Validation Truth

The agent environment does not provide a usable repository checkout / `gh` execution path for running the Node suite locally.

On code head:

```text
31e8420045b050be9c3f9db18d0b46d34392f381
```

GitHub Actions created three repository-wide runs. All three failed before any runner executed a step:

```text
Vibration Production Freeze Validation
  conclusion = failure
  steps = []
  runner_id = 0

Topology Edit Support Reprojection
  conclusion = failure
  steps = []
  runner_id = 0

Vibration AIV Controlled Source Qualification
  conclusion = failure
  steps = []
  runner_id = 0
```

Therefore the authoritative execution status is:

```text
SOURCE_LEVEL_RECONCILIATION: COMPLETE
LOCAL_NODE_TESTS: NOT_RUN
POST_INTEGRATION_FATIGUE_TESTS: NOT_RUN
HOSTED_EXECUTION: INFRASTRUCTURE_BLOCKED / ZERO_STEP
SOURCE_TEST_FAILURE_OBSERVED: NO
NUMERICAL_TEST_FAILURE_OBSERVED: NO
```

Do not convert zero-step workflow failures into a test failure, and do not convert source inspection into a PASS claim.

## Remaining Scope Boundary

This PR intentionally does not deliver:

- native KD320 mean-stress arithmetic;
- native Code fatigue-curve authority;
- general VIII-3 multi-axial/non-pressure load-state fatigue;
- routed-system fatigue;
- local discontinuity FEA fatigue;
- Code/design-authority promotion.

Those require separate controlled qualification programmes.

## Current Disposition

```text
PR_STATE: DRAFT
PR_MERGEABILITY_AT_FINAL_CODE_REVIEW: MERGEABLE
STACKED_ON: PR531
PR531_HEAD_UNCHANGED: dce37cc2b1814d4a487e6ca05adb4b67d67cf182
NATIVE_CORE_KD320: BLOCKED
USER_CALCULATED_KD3_PRODUCT_PATH: IMPLEMENTED IN SOURCE
POST_INTEGRATION_EXECUTION_RECEIPT: NOT_ESTABLISHED
CODE_COMPLIANCE: FALSE
DESIGN_AUTHORITY: FALSE
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
```
