# PR569 — Engineering Work Pack framework

## Mission

Issue #568 only: transform the FIT-specific work-pack verifier into a reusable fail-closed Engineering Work Pack framework while preserving FIT semantics exactly and creating the safe extension seam required by AIV #566 and future mechanisms.

```text
CRITICALITY = ENGINEERING_CRITICAL
EXECUTION_MODE = AUTO (Owner instruction: proceed in auto mode)
AUTO_STATE = RUNNING
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
BRANCH = agent/engineering-workpack-framework-568
PULL_REQUEST = 569
BASE_MAIN = ecf3b7c44826212710f24ff00f3c0e8847570725
CURRENT_HEAD = 565ba338df79ae48812c4b12d6d85318281e17e0
```

## Current live truth

- `main@ecf3b7c...` is merged PR #564 and contains the capability lifecycle convention.
- PR #569 is draft, mergeable, based directly on current `main`.
- Existing merged `scripts/verify-engineering-workpack.mjs` is generic by name but FIT-specific internally.
- `VIB-FIT.json` is the only merged work pack on `main`.
- Draft PR #567 for #566 adds `VIB-AIV.json` plus an AIV-specific verifier and edits the shared verifier with a `VIB-AIV` branch.
- #567 is `COORDINATION_REQUIRED`; PR569 does not absorb AIV drift repair. Intended order: framework first, then #567 rebase/replay.

## Scope lock

In scope: generic loader/schema validation, generic declared-check dispatch, declared probe interface, FIT migration preserving `FIT-WP-001..012`, explicit unmapped legacy lifecycle representation, falsification tests, second-consumer framework proof.

Forbidden: FIT/AIV equation or benchmark changes, applicability/QST-003 disposition changes, screening/design/code authority promotion, Product Freeze completion, SBC/T2.9 numerical implementation, UI/runtime/canvas redesign, dependency migration, workflow edits.

Owner instruction for validation: **skip workflow; local checks only**. GitHub Actions/workflows are not used as evidence for PR569.

## Architecture implemented

```text
EngineeringWorkPack.v1 JSON
  -> fail-closed schema/lifecycle/check declaration validation
  -> deterministic generic check dispatch
  -> explicitly declared narrow probe modules
  -> immutable work-pack input to probes
  -> machine-readable PASS/FAIL checks
```

Generic core paths:

```text
engineering/workpacks/framework/workpack-loader.mjs
engineering/workpacks/framework/check-handlers.mjs
engineering/workpacks/framework/probe-runner.mjs
scripts/verify-engineering-workpack.mjs
```

FIT-only runtime meaning is isolated in:

```text
engineering/workpacks/probes/vib-fit.mjs
```

The generic core contains no FIT/AIV/SBC/T2.9 engineering branch and no QST-003/D.2.3 engineering rule.

## FIT semantic preservation

Historical gate IDs and order remain:

```text
FIT-WP-001 identity
FIT-WP-002 method revision
FIT-WP-003 active registry membership
FIT-WP-004 bounded screening authority + projections
FIT-WP-005 designAuthority=false
FIT-WP-006 codeCompliance=false
FIT-WP-007 QST-003 fail-closed
FIT-WP-008 benchmark identity set
FIT-WP-009 release manifest critical paths
FIT-WP-010 UI projection drift
FIT-WP-011 document classification drift
FIT-WP-012 Product Freeze independence / receipt rule
```

A review correction during implementation restored `FIT-WP-006` as a dedicated FIT probe so both the work pack and adapter cannot drift `codeCompliance=true` together and still pass.

## Protected state/authority invariants

```text
capabilityLifecycle != registryState
                    != qualificationState
                    != engineeringAuthority
                    != screeningAuthority
                    != Product Freeze
                    != designAuthority
                    != codeCompliance
```

FIT remains:

```text
calculationState      = IMPLEMENTED
qualificationState    = SCREENING
engineeringAuthority  = SCREENING
screeningAuthority    = AUTHORIZED_BOUNDED
designAuthority       = false
codeCompliance        = false
Product Freeze        = BLOCKED / qualificationIndependent=true
capabilityLifecycle   = UNMAPPED_LEGACY / inferred=false
```

ACTIVE registry membership does not create a lifecycle state.

## Hypothesis / falsifier

Hypothesis: a new mechanism can be added by supplying a work pack, generic checks and narrow declared probes without adding mechanism engineering branches to the shared verifier.

Falsifier: if a second consumer requires `if FIT/AIV/...` logic or engineering-specific values/rules inside the generic loader/dispatcher, stop rather than call the abstraction generic.

## Validation truth

Local clone attempt:

```text
git clone --depth 1 --branch agent/engineering-workpack-framework-568 ...
-> FAIL / ENVIRONMENT_BLOCKED
-> Could not resolve host: github.com
```

Available local reconstruction checks:

```text
PASS     exact pre-edit blob backups committed before source mutation
PASS     VIB-FIT.json parses in prepared local reconstruction
PASS     node --check on prepared changed MJS
PASS     every new MJS <300 physical lines
PASS     synthetic second-consumer generic-engine smoke
PASS     unknown check type fails closed
PASS     declared mutation probe cannot change authority/lifecycle
PASS     source/diff scope reconciliation against GitHub branch
PASS     PR569 mergeable against current main
```

Repository-native exact-head execution remains truthfully:

```text
NOT_RUN / ENVIRONMENT_BLOCKED  npm run workpack:verify -- VIB-FIT
NOT_RUN / ENVIRONMENT_BLOCKED  node --test tests/engineering-workpack-framework.test.mjs
NOT_RUN / ENVIRONMENT_BLOCKED  npm run verify:vibration-fit-release
```

No workflow/Actions result is consulted or claimed by Owner instruction.

## Changed-file ledger

```text
.backups/WIP-eng-workpack-568_scripts_verify-engineering-workpack_mjs.bak
.backups/WIP-eng-workpack-568_engineering_workpacks_VIB-FIT_json.bak
engineering/workpacks/framework/workpack-loader.mjs
engineering/workpacks/framework/check-handlers.mjs
engineering/workpacks/framework/probe-runner.mjs
engineering/workpacks/probes/vib-fit.mjs
scripts/verify-engineering-workpack.mjs
engineering/workpacks/VIB-FIT.json
tests/engineering-workpack-framework.test.mjs
tests/fixtures/engineering-workpack-mutation-probe.mjs
agents/PR569_workreport.md
agents/status/PR569.yaml
agents/claims/PR569.yaml
```

## Coordination

```text
PR567 = COORDINATION_REQUIRED
reason = exact shared-verifier architecture overlap
required disposition = PR569 generic framework first; #567 rebase/replay without mechanism branch in generic core
```

No numerical or authority overlap is absorbed from #566/#567.

## Highest risk

Silent weakening of existing FIT protection while making the code appear generic. Semantic preservation, not refactoring aesthetics, is the acceptance criterion. Full exact-repository FIT execution is still required before merge readiness.

## AUTO hard-stop evaluation

No approved-scope mutation changes vibration numerical authority, engineering master data, topology/geometry authority, result publication authority, units, screening authority, design authority, code compliance, or Product Freeze state. Automatic progression remains inside #568 scope.

## EXACT_NEXT_ACTION

Create PR569 status/claim records, perform final source/diff/falsifier audit, update PR/issue evidence with exact validation truth, then set `AUTO_STATE=TAKEOVER_REQUIRED` because repository-native execution is environment-blocked and merge readiness cannot be established here. Do not merge.