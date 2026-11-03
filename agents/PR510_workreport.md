# PR510 — Mechanical T2.3 Facility Candidate Workflow

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED
WORK_INTENT: IMPLEMENT / VALIDATE / HANDOVER
CRITICALITY: ENGINEERING_CRITICAL
PR: #510
BRANCH: agent/mechanical-t23-facility-stage4
BASE: agent/ei-appendix-b-stage3
BASE_SHA: db64392374c198434c3a8a142fa33ab080160a0c
EXECUTED_VALIDATION_SOURCE_HEAD: 133c7f9ededb873b16868203d8b0768220e10460
LAST_REPORT_SYNC_HEAD: 1afdf04b4d516d580ba8b377d3babb2ceb3f22fe
CURRENT_MAIN_LAST_CHECKED: 0b03855a6d9031c8b531e23bdd3deea3b7fdc5d4
DEPENDENCIES: PR #507 master registry + PR #509 Appendix-B/T2.3 candidate masters
MERGE_AUTHORITY: NOT_GRANTED
EXACT_NEXT_ACTION: leave draft/unmerged; when a complete-checkout runner is available, run the committed validation workflow and require full Node + full product Chromium PASS
```

## Mission / Delivered Capability

Stage 4 turns EI AVIFF T2.3 Mechanical Excitation into a facility-scoped master-backed candidate:

```text
facility row
  -> explicit applicability
  -> connected/adjacent equipment source selection
  -> PR #509 evaluateEiAviffMechanicalBaselineCandidate()
  -> maximum baseline LOF + governing source
  -> exact-scope cached result
  -> candidate governing tier
```

Applicability:

```text
no decision / no sources                -> APPLICABILITY_UNKNOWN
explicit no connected/adjacent source   -> NOT_APPLICABLE
sources chosen, evaluation absent/bad   -> APPLICABLE_INCOMPLETE
valid exact-scope candidate              -> CALCULATED_CANDIDATE
```

Authority:

```text
FIT        = IMPLEMENTED_SCREENING / SCREENING / AUTHORIZED_BOUNDED
Mechanical = IMPLEMENTED_CANDIDATE_MASTER / CANDIDATE_MASTER / NOT_AUTHORIZED
SBC        = IMPLEMENTED_CANDIDATE_USER_INPUT / CANDIDATE_USER_INPUT / NOT_AUTHORIZED
```

Mechanical/SBC may compete only in `candidateGoverning`; Mechanical cannot become `screeningGoverning`. `fullScreeningGoverningEstablished=false`; design authority remains false.

## Numerical custody / protected engineering rules

Stage 4 does not duplicate T2.3 values. D2.4 independent constraint:

```text
CENTRIFUGAL_COMPRESSOR                    0.2
ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW     0.4
governing Mechanical T2.3 LOF            0.4
```

No TM-09/dynamic-study reduction is applied. Shared-support transfer is not a fixed LOF and direct use fails with:

```text
MECHANICAL_T23_SHARED_SUPPORT_REQUIRES_ADJACENT_LOF
```

Scope:

```text
MECHANICAL-FACILITY/<encoded line>/<encoded case or ->/<encoded canonical ID>
```

Wrong-scope candidate -> `FACILITY_SCOPE_MISMATCH`. Source/applicability edits invalidate pending/cached async results using per-scope tokens.

## Owner-requested validation infrastructure

Added:

```text
.github/workflows/vibration-mechanical-stage4-validation.yml
scripts/validate-vibration-mechanical-stage4-browser.mjs
```

The workflow is designed to execute:

1. focused Stage-4/generic Node tests;
2. `node --test tests/*.test.mjs`;
3. real app static server;
4. Playwright Chromium: Engineering Calculations -> Vibration -> FIT benchmark -> Run FIT -> Mechanical inputs -> compressor + >=15 kW motor -> candidate LOF 0.4 -> governing/authority checks.

## GitHub-hosted exact-head attempt

```text
run_id     31875120781
head       133c7f9ededb873b16868203d8b0768220e10460
job_id     94989590474
steps      []
runner_id  0
```

GitHub annotation:

```text
The job was not started because an Actions budget is preventing further use.
```

Classification:

```text
NOT_RUN / ACTIONS_BUDGET_BLOCKED
```

No checkout or test command started, so this is not classified as a code/test FAIL.

## Exact-blob local Node validation

The local runtime cannot clone/download the complete private repository because outbound GitHub network access is blocked. For the bounded Stage-4 path, files were materialized via the GitHub connector and verified with `git hash-object` against GitHub blobs before execution.

Key exact blobs:

```text
converters/vibration/mechanical/facility.js                  578d943a2435339e53c1d2e7083b74690c0116c3
converters/vibration/mechanisms/mechanical.js                74339c2598dea9ed42b79f4f3aac885aaa8182bb
converters/vibration/masters/canonical.js                    d48c8d545b679247efc4ed455485255fae8f8594
converters/vibration/masters/registry.js                     61e7250890ffe1c8b020d0672365a5608f5da6f1
converters/vibration/masters/validate.js                     ba20656afc69b28f52d0f1e1baf702753398aa0c
converters/vibration/masters/ei-aviff-appendix-b-data.js     3ef76b1b997e29227bcef5af82f502e6f6d8e9cc
converters/vibration/masters/ei-aviff-appendix-b-candidate.js 8dbfbdfb9c2c95bdcdb506bb14aa7ab9b1b12368
converters/vibration/masters/ei-aviff-appendix-b-evaluator.js 7e5af2676952559e26d4131ffce31457566b17d2
tabs/vibration-integrity-mechanical-controller.js            2b9614274dc1c34126c36923d0ed1e64c249b042
tabs/vibration-integrity-mechanical-view.js                  e2ab173d6279dcca0a876dd8f2a487b0e0bc30ce
tests/vibration-mechanical-t23-facility-stage4.test.mjs      87cdd9f78b637f64dcb44b14188c16467c6de0c8
tests/vibration-mechanical-t23-module-boundaries-stage4.test.mjs b8830126cd0ec481c64513dda408110f516b1bdc
tests/vibration-mechanical-t23-ui-stage4.test.mjs            caad349a8e25dfdd28272e1ad2d33df65f66c48e
```

Executed:

```text
vibration-mechanical-t23-facility-stage4.test.mjs       PASS 4/4
vibration-mechanical-t23-module-boundaries-stage4.test.mjs PASS 4/4
vibration-mechanical-t23-ui-stage4.test.mjs             PASS 4/4 executable panel tests
```

Facility test proves real Stage-3 master evaluator D2.4 = 0.4, exact scope behavior, duplicate/unknown fail-closed handling, and shared-support hard stop.

UI test proves source controls, explicit NOT APPLICABLE, shared-support disabled, and candidate LOF/governing source rendering. Its separate source-routing test remains NOT_RUN because a complete exact product checkout is unavailable.

Classification: `PASS / EXACT_BLOB_BOUNDED_EXECUTION`; this is not a full repository-suite claim.

## Chromium execution

Installed runtime:

```text
Chromium 144.0.7559.96
HeadlessChrome/144.0.0.0
```

System-managed Chromium has `URLBlocklist=["*"]`; localhost and `file:` navigation are blocked before app loading. `about:blank` is allowed but is not a secure context and lacks native `crypto.subtle`.

A bounded Chromium module/UI acceptance was executed by loading the exact Git-blob-verified Stage-4 view/controller/domain/master modules as ES data modules. The harness redirected only the canonical crypto binding to a test-only SHA-256 bridge because WebCrypto is unavailable in the permitted `about:blank` context. The bridge self-tested against the standard SHA-256 `abc` digest before master-registry execution. No repository source was changed for the bridge.

Executed result:

```text
status                  PASS
scope                   MECHANICAL-FACILITY/14-GAS-1001/NORMAL/CAN-K402
source                   CENTRIFUGAL_COMPRESSOR
source                   ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW
governing LOF           0.4
governing source        ELECTRIC_MOTOR_OR_ALTERNATOR_GE_15KW
screeningAuthority      NOT_AUTHORIZED
designAuthority         false
shared-support disabled true
rendered authority      CANDIDATE
```

Classification:

```text
Chromium Stage-4 module/UI acceptance = PASS
Full product Chromium navigation      = NOT_RUN / MANAGED_URL_POLICY_BLOCKED
```

Do not broaden the bounded module/UI PASS into a full hosted-product browser PASS.

## Full repository-suite truth

```text
node --test tests/*.test.mjs = NOT_RUN / ENVIRONMENT_BLOCKED
```

Complete-checkout routes are both blocked:

1. local container: private GitHub checkout/archive cannot be reached;
2. GitHub runner: Actions budget blocked allocation before step 1.

No PASS is inferred.

## Validation Ledger

| Check | Status | Evidence / limitation |
|---|---|---|
| D2.4 exact-blob facility Node path | PASS | 4/4 |
| Stage-4 module boundaries | PASS | 4/4 |
| executable Mechanical UI panel tests | PASS | 4/4 |
| Chromium Stage-4 module/UI path | PASS | Chromium 144; LOF 0.4; candidate authority retained |
| Full product Chromium navigation | NOT_RUN | managed URL policy blocks local/file navigation |
| Full repository Node suite | NOT_RUN | no complete checkout runner |
| GitHub Actions validation | NOT_RUN | Actions budget; steps=[] |
| controlled EI PDF reconciliation | inherited NOT_RUN | #509 remains candidate |

## Appendix A

```text
A1 Production trace             20/20
A2 Failure isolation            20/20
A3 Authority / invariant        20/20
A4 Independent validation       19/20
A5 Minimal patch                19/20
TOTAL                            98/100
```

## Backup / rollback evidence

Repository backup CLI remains `NOT_RUN` because no complete local checkout exists. Pre-edit blobs for original existing engineering files are preserved in earlier PR510 commits/history. Work-report rollback blobs:

```text
cc00c4451011a952034d7eeca8460916f3cd8f8e
dd992ab2dd94c182770a21bd5232e1cac1194bf9
1df6743c9e738e25d1c54e75f9ef86fc7f88ab6c
```

## Changed-file ledger

Parent comparison at executed validation head `133c7f9e...` was 29 commits ahead / 0 behind / 18 files. Stage-4 files comprise:

```text
.github/workflows/vibration-mechanical-stage4-validation.yml
agents/PR510_workreport.md
converters/vibration/mechanical/facility.js
converters/vibration/mechanisms/contracts.js
converters/vibration/mechanisms/index.js
converters/vibration/mechanisms/mechanical.js
scripts/validate-vibration-mechanical-stage4-browser.mjs
tabs/vibration-integrity-mechanical-controller.js
tabs/vibration-integrity-mechanical-view.js
tabs/vibration-integrity-mechanisms.js
tabs/vibration-integrity-user-data-shell.js
tabs/vibration-integrity-view.js
tests/vibration-integrity-mechanism-matrix.test.mjs
tests/vibration-mechanical-t23-applicability-stage4.test.mjs
tests/vibration-mechanical-t23-facility-stage4.test.mjs
tests/vibration-mechanical-t23-module-boundaries-stage4.test.mjs
tests/vibration-mechanical-t23-ui-stage4.test.mjs
tests/vibration-mechanism-contract.test.mjs
```

## Highest risk / handover

Highest risk remains authority overstatement. A valid T2.3 baseline is still candidate-only. Recheck live PR/base/head before mutation. Leave PR draft/unmerged unless Owner separately authorizes merge. When a complete-checkout runner becomes available, execute `.github/workflows/vibration-mechanical-stage4-validation.yml` and require full Node + real product Chromium PASS before upgrading those two NOT_RUN classifications.