# WIP-eng-workpack-568 — Engineering Work Pack framework

## Mission

Issue #568 only: transform the FIT-specific work-pack verifier into a reusable fail-closed Engineering Work Pack framework while preserving FIT semantics exactly and creating the safe extension seam required by AIV #566 and future mechanisms.

```text
CRITICALITY = ENGINEERING_CRITICAL
TAKEOVER_AUTHORITY = IMPLEMENTATION_AUTHORIZED_AFTER_ISSUE_568_GATE
MERGE_AUTHORITY = OWNER_ONLY
BRANCH = agent/engineering-workpack-framework-568
BASE_MAIN = ecf3b7c44826212710f24ff00f3c0e8847570725
```

## Current live truth

- `main@ecf3b7c...` is merged PR #564 and contains the capability lifecycle convention.
- Existing `scripts/verify-engineering-workpack.mjs` is generic by name but FIT-specific internally.
- `VIB-FIT.json` is the only merged work pack on `main`.
- Draft PR #567 for #566 adds `VIB-AIV.json` plus an AIV-specific verifier and edits the shared verifier with a `VIB-AIV` branch.
- #567 is `COORDINATION_REQUIRED`; this branch does not absorb AIV drift repair and stays based directly on `main`.

## Scope lock

In scope: generic loader/schema validation, generic declared-check dispatch, declared probe interface, FIT migration preserving `FIT-WP-001..012`, explicit unmapped legacy lifecycle representation, falsification tests, second-consumer framework proof.

Forbidden: FIT/AIV equation or benchmark changes, applicability/QST-003 disposition changes, screening/design/code authority promotion, Product Freeze completion, SBC/T2.9 numerical implementation, UI/runtime/canvas redesign, workflow edits.

## Architecture decision

```text
workpack JSON
  -> schema/lifecycle/check declaration validation
  -> ordered generic check dispatch
  -> explicitly declared narrow probe modules
  -> deterministic PASS/FAIL result
```

FIT-only runtime meaning belongs in `engineering/workpacks/probes/vib-fit.mjs`. Generic core must not branch on FIT/AIV/SBC/T2.9 or contain QST-003/D.2.3 engineering rules.

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

FIT remains `IMPLEMENTED / SCREENING / AUTHORIZED_BOUNDED`, `designAuthority=false`, `codeCompliance=false`, Product Freeze separately `BLOCKED`. Capability lifecycle is explicitly `UNMAPPED_LEGACY` with `inferred=false`; ACTIVE registry membership does not create lifecycle state.

## Hypothesis / falsifier

Hypothesis: a new mechanism can be added by supplying a work pack, generic checks and narrow declared probes without adding mechanism engineering branches to the shared verifier.

Falsifier: if a second consumer requires `if FIT/AIV/...` logic or engineering-specific values/rules inside the generic loader/dispatcher, stop rather than call the abstraction generic.

## Validation checkpoint

```text
PASS     exact pre-edit blob backups committed
PASS     node --check on all prepared MJS
PASS     VIB-FIT.json parses in local reconstruction
PASS     every new MJS <300 physical lines
PASS     synthetic second-consumer framework smoke
PASS     unknown check type fails closed
PASS     declared mutation probe cannot change authority/lifecycle
NOT_RUN  npm run workpack:verify -- VIB-FIT
NOT_RUN  node --test tests/engineering-workpack-framework.test.mjs
NOT_RUN  npm run verify:vibration-fit-release
```

The final three remain `NOT_RUN` because this runtime has no executable private checkout. No `NOT_RUN` is represented as PASS.

## Intended changed-file ledger

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
agents/WIP-eng-workpack-568_workreport.md
```

## Active risks

1. PR #567 exact-file overlap on `scripts/verify-engineering-workpack.mjs`; merge order should be #568 first, then #567 rebase/replay.
2. Connector-only mutation path: no local checkout and no `gh` binary; GitHub connector writes are used.
3. FIT behavioral equivalence must be confirmed by exact-repository execution before merge readiness.

## Highest risk

Silent weakening of existing FIT protection while making the code appear generic. Semantic preservation, not refactoring aesthetics, is the acceptance criterion.

## EXACT_NEXT_ACTION

Add generic framework modules and FIT declared probe, then replace the shared verifier and `VIB-FIT.json` only after those modules exist. Add falsification tests, inspect the complete diff, open a draft PR, and rename this report to `agents/PR<NUMBER>_workreport.md`.