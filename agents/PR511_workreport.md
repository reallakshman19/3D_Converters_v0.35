# PR511 — Vibration Integrity Production Freeze v1

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: RECOVERABLE
WORK_INTENT: IMPLEMENT / VALIDATE / HANDOVER
CRITICALITY: ENGINEERING_CRITICAL
PR: 511
BRANCH: agent/vibration-product-freeze-v1
LIVE_MAIN: d659e670a2f8fe0a35fc8072382512f6493898cf
EI_BENCHMARK_COMMIT: fc2c64b6fc7781e79d014d8cca69ab72924266a9
GROUNDING_EPOCH: 2026-08-15T13:05Z
TAKEOVER_AUTHORITY: WRITE_ALLOWED
RECOVERY_DECISION: SALVAGE_PARTIAL / CONTINUE
APPENDIX_A_STATUS: PASS 97/100
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
CURRENT_STAGE: FULL_EI_WORKED_EXAMPLE_COVERAGE_PASS
FREEZE_STATE: BLOCKED
HIGHEST_RISK: promoting bounded worked-example/browser diagnostic evidence to the official URL-based Production Freeze gate
EXACT_NEXT_ACTION: execute the unchanged scripts/validate-vibration-production-freeze-browser.mjs in an environment where URL navigation is permitted; retain official screenshots/receipt; only then move BLOCKED -> FROZEN
```

## Handover in 60 Seconds

PR #511 owns the FIT reproducibility-evidence and production-freeze layer. PR #512 owns the shared observational workflow/Activity layer.

```text
product workflow state != FIT result currency
Activity / audit         != engineering evidence
FitRunEvidencePackage.v1 = FIT engineering reproducibility evidence envelope
```

The Owner supplied a pinned digitized EI Appendix-D dataset at:

```text
reallaksh19/Advanced_Analysis
commit 04328852dced9f5c4827da8afe8a82aeb8b1a1d3
path   docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md
blob   c050cd90802c27241c510c6f0ac43bfaf7a89e9d
```

That source is recorded as `CORROBORATING_TRANSCRIPTION_ONLY`; the governing EI method PDF and published worked-example PDF remain higher-precedence sources.

The D2.1 benchmark pack now preserves all eight published FIT rows, plus the existing two D4 rows. Executable worked-example + UI benchmark validation passes 25/25 with no equation, correlation, master-value, tolerance-policy, applicability, action-band, screening-authority, or design-authority implementation change.

The exact URL-based production-freeze gate is still externally blocked, so this PR remains `BLOCKED / NOT FROZEN` and draft.

## Live Source Ground Truth

```text
main                                  d659e670a2f8fe0a35fc8072382512f6493898cf
main change since a49085c             AIV/package-only; FIT implementation unchanged
EI benchmark implementation commit    fc2c64b6fc7781e79d014d8cca69ab72924266a9
shared audit blob                     f6135a3172a3b7a562a14635c36897b030873127
shared workflow blob                  a49dbac79854192be13fb6dc6d41c34dc84d2c83
shared controller blob                cc3ab1c219ed7f4c4efdbfbaab9a6fe716857067
run-evidence blob                     6f09d34727b8da5c3c6954873d459d01430cf489
PF browser script blob                f314ef9e1212a95295b55548e83e6c478ff0495e
expanded benchmark JSON blob          92c589d4f347f59abd29c059b13462802f436deb
expanded UI benchmark blob            058dc431af78d2a365160dbc3a45c57f29adb7a9
EI numeric regression blob            b82e5630071c1436361cae7318577497aaf65b60
UI benchmark regression blob           63cb9ac0e0b125c20db93b517c251fc5f1a4de33
traceability document blob            a2e43e8d16f89ea41b6f1901a3fec2d8fd387a49
```

Commit `fc2c64b6...` changes exactly five paths:

```text
Benchmarks/VibrationFIT/fit-ei-worked-examples-v1.json
docs/vibration/FIT-EI-Worked-Example-Traceability-v1.md
tabs/vibration-integrity-benchmarks.js
tests/vibration-fit-ei-worked-examples.test.mjs
tests/vibration-fit-ui-benchmarks.test.mjs
```

No calculation or authority implementation module is changed by that commit.

## Controlled EI Worked-Example Evidence

### Source precedence

```text
1 governing EI method PDF              equations / applicability
2 published EI worked-example PDF      D2/D4 published comparison vector
3 Advanced_Analysis@0432885            corroborating owner-supplied transcription only
4 owner-pinned worked-example DOCX     qualification anchor
5 executable benchmark JSON            adopted machine-readable comparison vector
6 retained workbook                    migration/parity evidence only
```

### D2.1 complete FIT table

```text
Stream 4 supply to cooler          published LOF 0.014
Stream 5 suction scrubber          published LOF 0.007
Stream 6 compressor suction        published LOF 0.006
Stream 7 compressor discharge      published LOF 0.019
Recycle discharge                  published LOF 0.019
Recycle suction                    published LOF 0.276
Relief upstream                    published LOF 0.338
Relief downstream                  published LOF 0.881
```

The existing D4 cases remain:

```text
Separator inlet                    published LOF 0.26
Produced water                     published LOF 3.15
```

`EI-D2-FIT-RECYCLE-SUCTION-6IN` remains first/default so the established PF-002 browser path is unchanged.

### Tolerance policy

```text
FIT-EI-PUBLISHED-RECONCILIATION-V1
```

Absolute per-field allowances remain derived independently from the documented equation register applied to the published input vector plus half of the least displayed output increment. They were not widened to obtain this pass.

The largest observed printed/intermediate reconciliation in the new D2 rows is the 8-in SCH120 published `Fv=38483` versus independent/current-equation `Fv=38525.096...`; the existing reconciliation policy covers that printed/intermediate rounding. No equation was changed to force agreement.

### Authority distinction

```text
benchmark artifact engineeringAuthority = BENCHMARK_ONLY
calculated FIT qualification.method      = SCREENING
calculated FIT qualification.data        = SCREENING
calculated FIT designAuthority           = false
```

The previous regression incorrectly required the calculated product result itself to report `BENCHMARK_ONLY`; the test now preserves the benchmark/product distinction instead of weakening product authority semantics.

### D2.4 Mechanical corroboration

The same pinned Appendix-D transcription confirms:

```text
centrifugal compressor LOF = 0.20
electric motor >15 kW LOF = 0.40
governing Mechanical LOF   = 0.40
```

Mechanical remains a separate candidate-authority path and does not replace Screening governing.

## Executed Validation

### Existing #511 focused validation

```text
inherited Stage-4 focused suite  PASS 28/28
new #511 regressions             PASS 8/8
combined focused suite           PASS 36/36
```

### Full available EI worked-example validation

Pre-fix exact benchmark test:

```text
13 tests
8 PASS
5 FAIL
```

All five failures occurred after successful numeric comparisons and were caused solely by the stale assertion that the calculated result must report `BENCHMARK_ONLY` rather than current bounded `SCREENING` qualification.

Post-fix expanded numeric benchmark suite:

```text
PASS 19/19
```

Combined numeric + UI benchmark suite:

```text
PASS 25/25
10 controlled EI FIT cases
  8 x D2.1
  2 x D4
all production calculations within the existing independent tolerances
all UI benchmark cases build production-parseable tables
default PF case unchanged
```

A separate run-evidence test was attempted from the downloaded static Pages artifact but could not start because the artifact has no installed `xlsx` package:

```text
ERR_MODULE_NOT_FOUND: Cannot find package 'xlsx'
classification: NOT_RUN / ENVIRONMENT_ARTIFACT_DEPENDENCY_BLOCKED
```

That is not represented as PASS or product failure.

The previously attempted repository-wide Node suite remains `NOT_RUN / INCOMPLETE`; unrelated base/artifact limitations were observed and are not attributed to #511.

## Chromium Evidence

### Official unchanged PF script

The exact script launches Chromium but its initial URL navigation is blocked by managed policy:

```text
page.goto(http://127.0.0.1:4173/)
-> net::ERR_BLOCKED_BY_ADMINISTRATOR
managed policy: URLBlocklist = ["*"]
classification: NOT_RUN / ENVIRONMENT_POLICY_BLOCKED
```

The policy was not modified or bypassed.

### Policy-compliant production-module diagnostic

Prior exact production-module diagnostic remains:

```text
browser                         Chromium 144.0.7559.96
PF-001 Engineering > VIB > FIT  PASS_BROWSER_DIAGNOSTIC
PF-002 controlled benchmark     PASS_BROWSER_DIAGNOSTIC
PF-003 readiness                PASS_BROWSER_DIAGNOSTIC
PF-004 FIT visible benchmark    PASS_BROWSER_DIAGNOSTIC
PF-005 Mechanical T2.3          PASS_BROWSER_DIAGNOSTIC
PF-006 authority boundary       PASS_BROWSER_DIAGNOSTIC
PF-007 FIT evidence export      PASS_BROWSER_DIAGNOSTIC
browser/page errors             []
```

Controlled visible values:

```text
FIT expected / tolerance       0.276 / +/-0.0012
FIT actual                     0.27668688083478665
FIT band                       LOF_LT_0_3
Mechanical expected / actual   0.40 / 0.40
candidate replaces Screening   false
designAuthority                false
```

PF-007 produced `FitRunEvidencePackage.v1` with SHA-256 Activity identity, `RUN_EVIDENCE_EXPORT_STARTED`, `designAuthority=false`, and `REPRODUCIBILITY_EVIDENCE_ONLY`. The visible UI subsequently showed `RUN_EVIDENCE_EXPORTED`.

This is bounded browser diagnostic evidence, not the official URL-based freeze receipt.

## Infrastructure Truth

GitHub Actions jobs have repeatedly executed zero steps because the account Actions budget prevents runner allocation. The GitHub annotation is:

```text
The job was not started because an Actions budget is preventing further use.
```

Classification remains `NOT_RUN / INFRASTRUCTURE_BLOCKED`. Do not retry until capacity/budget changes.

## Authority / Negative Assurance

```text
FIT bounded screening authority          unchanged
Mechanical T2.3 candidate authority      unchanged
SBC Type-3 candidate authority           unchanged
candidate replaces Screening governing   false
designAuthority                          false
Activity engineering authority           NONE
Activity purpose                         ACTIVITY_AUDIT_ONLY
FIT evidence purpose                     REPRODUCIBILITY_EVIDENCE_ONLY
benchmark artifact authority             BENCHMARK_ONLY
```

The expanded benchmark set strengthens qualification evidence coverage only. It does not widen the FIT applicability envelope and does not resolve or weaken QST-003 (`219.1 < Dext < 273 mm`), which remains fail-closed.

## Validation Ledger

| Check | Status | Observation / Oracle |
|---|---|---|
| Advanced_Analysis source pin | PASS_SOURCE_TRACE | commit `04328852...`, blob `c050cd...` |
| complete D2.1 row transcription | PASS_SOURCE_TRACE | 8 published FIT rows |
| expanded numeric EI suite | PASS 19/19 | local execution against production FIT implementation |
| expanded numeric + UI suite | PASS 25/25 | local execution |
| existing focused #511 suite | PASS 36/36 | prior local execution |
| run-evidence test from Pages artifact | NOT_RUN / ENVIRONMENT_BLOCKED | missing `xlsx` installation |
| official JS PF script | NOT_RUN / POLICY_BLOCKED | managed URL policy |
| PF-001..PF-007 production-module diagnostic | PASS_BROWSER_DIAGNOSTIC | Chromium 144 |
| official freeze state | BLOCKED | official URL-based receipt not executed |

## Overlap / Dependency State

`COORDINATION_REQUIRED`: PR #512 remains owner of shared workflow/Activity behavior. #511 continues to consume the aligned audit/workflow/controller blobs and does not independently evolve those semantics.

## Exact Continuation State

```text
restore GitHub Actions budget OR use Chromium environment without URLBlocklist
-> run unchanged scripts/validate-vibration-production-freeze-browser.mjs
-> collect official 01..07 screenshots + VibrationProductionFreezeReceipt.v1
-> compare controlled FIT and Mechanical oracles
-> verify result currency / authority / evidence export
-> if all PASS, mark FROZEN
-> if any FAIL, patch only the first observed material defect and replay
```

The available EI worked-example data are now sufficient for the current bounded FIT numerical qualification; the remaining blocker is release execution/reproducibility evidence, not missing worked-example data.

## Appendix A — Takeover Qualification

```text
APPENDIX_A_STATUS: PASS
A1 20/20
A2 20/20
A3 20/20
A4 18/20
A5 19/20
TOTAL 97/100
```

## Merge State

```text
FREEZE_STATE    BLOCKED
MERGE_AUTHORITY OWNER_ONLY / NOT_GRANTED
MERGE           NOT_AUTHORIZED
```
