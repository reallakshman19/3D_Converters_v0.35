# PR502 — SBC Facility Register Integration — Final Takeover Report

## Recovery / authority

```text
WORK_INTENT             = RECONCILE / FIX / VALIDATE / MERGE
CRITICALITY             = ENGINEERING_CRITICAL
OWNER_MERGE_AUTHORITY   = GRANTED 2026-08-15
BASE                     = main@a172850462cd92d238d090ae041daac24ede8c40
BRANCH                   = agent/vibration-sbc-facility-register
```

## Reconciliation outcome

The original PR502 branch predated merged PR499 FIT screening qualification. It was rebuilt on current main to prevent stale authority state from overwriting the qualified FIT implementation. Current relationship before final validation:

```text
status    = ahead
behind    = 0
base      = a172850462cd92d238d090ae041daac24ede8c40
```

The rebuild also preserves merged PR503 AIV runtime changes because PR502 now starts from `main@a172850...`.

## Authority model

```text
FIT implementation     = IMPLEMENTED_SCREENING
FIT qualification      = SCREENING
FIT screening authority = authorized bounded screening

SBC implementation     = IMPLEMENTED_CANDIDATE_USER_INPUT
SBC qualification      = CANDIDATE_USER_INPUT
SBC engineeringAuthority = NONE
SBC screeningAuthority = NOT_AUTHORIZED
SBC designAuthority    = false

fullScreeningGoverningEstablished = false
```

The generic mechanism lifecycle now explicitly accepts both `IMPLEMENTED_SCREENING` and `IMPLEMENTED_CANDIDATE_USER_INPUT`. This closes the merged integration defect where FIT emitted `IMPLEMENTED_SCREENING` but the generic contract did not accept that state.

## Governing semantics

The facility matrix now separates:

```text
screeningGoverning        = highest current authorized SCREENING mechanism
candidateGoverning        = highest current candidate-only mechanism
implementedGoverning      = compatibility alias to screeningGoverning only
retainedScreeningGoverning
retainedCandidateGoverning
```

A numerically higher SBC candidate can never replace the authorized FIT screening governing result.

## SBC facility workflow

```text
line + case + canonical ID
 -> deterministic SBC-FACILITY scope
 -> exact User Engineering Data rows
 -> existing Type-3 evaluator
 -> candidate mechanism assessment
 -> separate SBC matrix cell / candidate governing column
```

Missing data opens the existing User Engineering Data workspace through `SBC inputs` / `Complete inputs`. The first-span WITH/WITHOUT unsupported-mass selection remains explicit. No curve interpolation, extrapolation or hidden applicability assumption is introduced.

## Controlled regression integration

The FIT/VIB release manifest increases from 51 to 53 files by adding:

```text
tests/vibration-sbc-facility-register.test.mjs
tests/vibration-sbc-facility-module-boundaries.test.mjs
```

Existing mechanism matrix and contract regressions are updated to pin:

- FIT screening lifecycle acceptance;
- SBC candidate lifecycle;
- screening versus candidate governing separation;
- stale-result exclusion;
- incomplete SBC fail-closed behavior;
- 0.7 Type-3 oracle;
- no SBC screening/design authority;
- no duplicated SBC arithmetic in UI/facility bridge.

## Changed-file ledger

```text
agents/PR502_workreport.md
converters/vibration/mechanisms/contracts.js
converters/vibration/mechanisms/index.js
converters/vibration/mechanisms/sbc.js
converters/vibration/sbc/facility.js
scripts/verify-vibration-fit-release.mjs
tabs/vibration-integrity-mechanisms.js
tabs/vibration-integrity-user-data-shell.js
tabs/vibration-integrity-view.js
tests/vibration-fit-release-gate.test.mjs
tests/vibration-integrity-mechanism-matrix.test.mjs
tests/vibration-mechanism-contract.test.mjs
tests/vibration-sbc-facility-module-boundaries.test.mjs
tests/vibration-sbc-facility-register.test.mjs
```

No FIT numerical equation/correlation file, AIV file, vibration master or source-register file is changed.

## Validation classification

```text
live-main reconciliation        PASS
behind_by                       0
scope/authority source review   PASS
53-file manifest construction   PASS_SOURCE
repository-native 53-file suite NOT_RUN unless an actual runner executes it
browser acceptance              NOT_RUN
```

Source/static inspection is not represented as native execution. Owner merge authorization permits merge after the final exact-head reconciliation; it does not convert NOT_RUN checks to PASS.
