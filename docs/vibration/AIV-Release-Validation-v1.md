# AIV Release Validation v1

`AivReleaseValidationRecord.v1` and `AivReleaseValidationReceipt.v1` define the machine execution evidence required before an AIV authority-transition change can be reviewed.

## Why this exists

GitHub status labels alone are insufficient release evidence. In particular, the current repository Actions-budget condition creates failed jobs with:

```text
runner_id = 0
steps     = []
```

Those jobs are `NOT_RUN`. They cannot satisfy AIV release validation.

## Candidate binding

Every record is bound to:

```text
repository   = reallaksh19/3D_Converters
methodId     = VIB.AIV.ACOUSTIC
releaseTarget = BENCHMARK_ONLY | SCREENING
exactHeadSha = 40-character candidate commit SHA
```

The verifier may also be supplied an independently known expected head SHA. A mismatch fails closed.

## Allowed execution sources

```text
LOCAL_CONTROLLED_CHECKOUT
CI_RUNNER
```

Both require `actualExecution=true`, environment identity, start timestamp, and completion timestamp.

`CI_RUNNER` additionally requires a positive runner id and nonblank runner name. `runner_id=0` is rejected explicitly.

## BENCHMARK_ONLY validation groups

Exactly four groups are required:

```text
AIV_FOCUSED_NODE_TESTS
AIV_CONTROLLED_BENCHMARK_PARITY
AIV_BROWSER_WORKSPACE_SMOKE
AIV_MODULE_BOUNDARY_CHECK
```

Each group requires:

```text
status       = PASS
exitCode     = 0
command      = nonblank executed command
outputSha256 = SHA-256 of retained output/log evidence
```

## SCREENING validation groups

SCREENING requires the four BENCHMARK_ONLY groups plus:

```text
AIV_REAL_PRODUCT_PATH_PARITY
AIV_SINGLE_BATCH_PARITY
AIV_PROJECT_INPUT_BROWSER_FLOW
AIV_EXPORT_PROVENANCE
```

This expanded set is intentional: screening cannot be released based only on isolated formula parity.

## Receipt

A successful verifier returns `AivReleaseValidationReceipt.v1` with:

```text
status             = PASS
exactHeadValidated = true
```

but still:

```text
authorityTransitionApplied = false
productionEquationAuthorized = false
screeningAuthority = NOT_AUTHORIZED
designAuthority = false
```

The receipt is evidence for a separate reviewed authority-transition change. It never performs that change itself.

## Current status

The contract and focused synthetic regressions are implemented in PR #446. A real release receipt does not yet exist because the repository-hosted Actions jobs are currently not starting and no exact-head controlled browser release run has been supplied.
