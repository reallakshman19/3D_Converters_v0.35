# PR569 — Engineering Work Pack framework

## Mission

Issue #568 only: transform the FIT-specific work-pack verifier into a reusable fail-closed Engineering Work Pack framework while preserving FIT semantics exactly and creating the safe extension seam required by AIV #566 and future mechanisms.

```text
CRITICALITY = ENGINEERING_CRITICAL
EXECUTION_MODE = AUTO
AUTO_STATE = TAKEOVER_REQUIRED
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
BRANCH = agent/engineering-workpack-framework-568
PULL_REQUEST = 569
BASE_MAIN = ecf3b7c44826212710f24ff00f3c0e8847570725
IMPLEMENTATION_HEAD_BEFORE_FINAL_HANDOFF = 1df5248d55b2ce975e077de12889aa4a99f3413f
```

Owner validation instruction:

```text
skip workflow
only local check
```

No GitHub workflow/Actions status is used anywhere in this disposition.

## Current live truth

- `main@ecf3b7c44826212710f24ff00f3c0e8847570725` is unchanged from branch creation and contains merged PR #564 lifecycle conventions.
- PR #569 is draft and mergeable against current `main`.
- Merged `scripts/verify-engineering-workpack.mjs` was generic by filename but FIT-specific internally.
- `VIB-FIT.json` is the only merged work pack on `main`.
- Draft PR #567 is still open on the same base and advances AIV #566 with its own local validation, but it still owns a shared-verifier delegation that must be replayed/rebased after PR569.
- PR569 does not absorb AIV drift repair, PF work, UI repair, numerical method changes, or authority promotion.

## Implemented architecture

```text
EngineeringWorkPack.v1 JSON
  -> fail-closed loader / schema gate
  -> explicit lifecycle representation
  -> ordered generic declared-check dispatch
  -> repository-root path confinement
  -> explicitly declared probe modules / exports
  -> deeply frozen work-pack input
  -> deterministic machine-readable PASS / FAIL result
```

Generic core:

```text
engineering/workpacks/framework/workpack-loader.mjs
engineering/workpacks/framework/check-handlers.mjs
engineering/workpacks/framework/path-utils.mjs
engineering/workpacks/framework/probe-runner.mjs
scripts/verify-engineering-workpack.mjs
```

FIT-only runtime engineering semantics:

```text
engineering/workpacks/probes/vib-fit.mjs
```

The generic core contains no FIT/AIV/SBC/T2.9 engineering branch and no QST-003/D.2.3 engineering rule.

## Generalization boundary

Generic engine owns how declared checks execute:

```text
MODULE_EXPORT_EQUALS
REGISTRY_CONTAINS
JSON_IDENTITY_SET
MODULE_LIST_CONTAINS
SOURCE_RULES
DOCUMENT_CLASSIFICATION
FILE_EXISTS
CUSTOM_DECLARED_PROBE
```

Unknown check types fail closed with `BLOCKED_UNSUPPORTED_CHECK_TYPE`. Missing work packs, malformed JSON/schema, duplicate check IDs, unsupported lifecycle states, missing/undeclared probes, invalid probe results and repository path escapes all fail closed.

Mechanism meaning remains outside the core. FIT-specific bounded screening authority, design/code boundary, QST-003 and Product Freeze receipt semantics are declared through the FIT probe module.

## FIT semantic preservation

`VIB-FIT.json` preserves the historical gate IDs and execution order:

```text
FIT-WP-001 identity
FIT-WP-002 method revision
FIT-WP-003 active registry membership
FIT-WP-004 bounded screening authority + authority projections
FIT-WP-005 designAuthority=false
FIT-WP-006 codeCompliance=false
FIT-WP-007 QST-003 fail-closed public error
FIT-WP-008 controlled benchmark identities / required vectors
FIT-WP-009 controlled release-manifest critical paths
FIT-WP-010 UI authority-projection drift
FIT-WP-011 document classification/current-vs-historical drift
FIT-WP-012 Product Freeze independence / PASS-receipt rule
```

A source-audit correction during implementation restored `FIT-WP-006` as an explicit FIT probe so the work pack and adapter cannot both drift `codeCompliance=true` and still pass.

The legacy `releaseManifestCount` output is preserved only for `releaseManifest.requiredCriticalTests`; unrelated future generic list checks do not inherit that FIT-era compatibility field.

## State / authority separation

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

ACTIVE registry membership does not infer capability lifecycle. The stale `PR #564 lifecycle implementation = DRAFT_NOT_ON_MAIN` annotation was corrected to `MERGED_LIFECYCLE_CONVENTION_NOT_MAPPED_TO_FIT` without retrofitting a FIT lifecycle state.

## Scope exclusions preserved

No change to:

```text
FIT equations/correlations/coefficients
FIT benchmark expected values/tolerances
FIT applicability boundaries
QST-003 disposition
AIV equations/assumptions/benchmarks/drift repair
screening authority
design authority
code-compliance authority
Product Freeze completion/state
SBC or T2.9 numerical implementation
UI/runtime/canvas behavior
dependencies
.github/workflows/*
```

## Local validation truth

Native checkout attempt:

```text
git clone --depth 1 --branch agent/engineering-workpack-framework-568 ...
FAIL / ENVIRONMENT_BLOCKED
fatal: Could not resolve host: github.com
```

Therefore repository-native exact-head suites are not claimed PASS.

Exact PR569 framework source was reconstructed locally for the generic engine/probe seam and executed with Node 22.16.0. Results:

```text
PASS  node --check reconstructed framework MJS set
PASS  new MJS modules remain <300 physical lines
PASS  synthetic second consumer verifies without mechanism branch
PASS  unknown generic check type fails closed
PASS  missing declared probe fails closed
PASS  duplicate check ID fails closed
PASS  unsupported schema version fails closed
PASS  declared probe cannot mutate work-pack authority/lifecycle
PASS  repository path escape fails closed
PASS  generic core scan contains no FIT/AIV/SBC/T2.9 engineering rule
PASS  legacy releaseManifestCount is scoped only to releaseManifest.requiredCriticalTests
PASS  FIT probe syntax in reconstruction
PASS  PR scope/source reconciliation against GitHub branch
PASS  PR569 mergeability against unchanged current main
```

Still truthfully:

```text
NOT_RUN / ENVIRONMENT_BLOCKED  npm run workpack:verify -- VIB-FIT
NOT_RUN / ENVIRONMENT_BLOCKED  node --test tests/engineering-workpack-framework.test.mjs
NOT_RUN / ENVIRONMENT_BLOCKED  npm run verify:vibration-fit-release
```

These remain the exact local/native gates required before moving PR569 out of draft. `NOT_RUN` is not represented as PASS.

## Second-consumer proof

The framework test defines `EWP-SECOND-CONSUMER` and verifies it through `verifyEngineeringWorkpackDefinition()` using generic declared checks only. No generic-core engineering branch is required. This establishes the framework seam without solving AIV #566 inside PR569.

PR #567 remains the real AIV consumer candidate and must rebase/replay its AIV work pack on this framework after PR569 lands; its current `VIB-AIV` branch in the shared verifier is not the final architecture.

## Changed-file ledger

```text
.backups/PR569_agents_PR569_workreport_md.bak
.backups/PR569_agents_WIP-eng-workpack-568_workreport_md.bak
.backups/PR569_agents_status_PR569_yaml.bak
.backups/PR569_engineering_workpacks_VIB-FIT_json.bak
.backups/PR569_engineering_workpacks_framework_check-handlers_mjs.bak
.backups/PR569_engineering_workpacks_framework_check-handlers_path-hardened_mjs.bak
.backups/PR569_engineering_workpacks_framework_probe-runner_mjs.bak
.backups/PR569_engineering_workpacks_probes_vib-fit_mjs.bak
.backups/PR569_scripts_verify-engineering-workpack_mjs.bak
.backups/PR569_tests_engineering-workpack-framework_current_test_mjs.bak
.backups/PR569_tests_engineering-workpack-framework_test_mjs.bak
.backups/WIP-eng-workpack-568_engineering_workpacks_VIB-FIT_json.bak
.backups/WIP-eng-workpack-568_scripts_verify-engineering-workpack_mjs.bak
agents/PR569_workreport.md
agents/claims/PR569.yaml
agents/status/PR569.yaml
engineering/workpacks/VIB-FIT.json
engineering/workpacks/framework/check-handlers.mjs
engineering/workpacks/framework/path-utils.mjs
engineering/workpacks/framework/probe-runner.mjs
engineering/workpacks/framework/workpack-loader.mjs
engineering/workpacks/probes/vib-fit.mjs
scripts/verify-engineering-workpack.mjs
tests/engineering-workpack-framework.test.mjs
tests/fixtures/engineering-workpack-mutation-probe.mjs
```

The WIP work report itself was retired after PR allocation; its exact bytes are retained in `.backups/PR569_agents_WIP-eng-workpack-568_workreport_md.bak`.

## Coordination

```text
PR567 = COORDINATION_REQUIRED
reason = shared verifier architecture overlap
required merge order = PR569 framework first; PR567 rebase/replay second
```

No numerical/authority scope from #566/#567 is absorbed.

## Highest risk

Silent weakening of existing FIT protection while making the code appear generic. Source/falsification review found no intentional weakening, but full exact-repository FIT execution remains mandatory before review readiness.

## AUTO disposition

Implementation and available local checks are complete. Continuing cannot close the remaining validation gap because this environment cannot materialize the private repository checkout. Per repository AUTO rules:

```text
AUTO_STATE = TAKEOVER_REQUIRED
PR_RECOVERY_STATE = TAKEOVER_REQUIRED
TAKEOVER_AUTHORITY = READ_ONLY until re-grounded by the next qualified agent
```

## EXACT_NEXT_ACTION

In a native-capable checkout of the exact PR569 head:

```bash
npm run workpack:verify -- VIB-FIT
node --test tests/engineering-workpack-framework.test.mjs
npm run verify:vibration-fit-release
```

If and only if all three pass, re-ground current `main` and PR567, confirm no new overlap, update PR569 validation evidence, and request Owner review. Do not merge without explicit Owner authorization.
