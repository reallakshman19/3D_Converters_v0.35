# PR444 Work Report

## Mission Control

```text
Mission               Traceable, example-driven AIV product architecture for VIB.AIV.ACOUSTIC
Issue                  #441
PR                     #444
Branch                 agent/aiv-traceable-table-ui-foundation
Base                   243042fba24915ae7b2734556cf2d28c1b5425b7
Current stage          Stage 16A — isolated qualification numerical harness
Source implementation IMPLEMENTED
Focused execution     D2.3 5/5 PASS; independent vectors 3/3 PASS
Repository CI         NOT_RUN because Actions budget assigns no runner
Engineering authority BLOCKED / NONE / NOT_AUTHORIZED
Exact next action      Complete named human reconciliation/acceptance; do not wire qualification math into production/UI yet
```

## Authority invariant

```text
calculationState      = BLOCKED
qualificationState    = BLOCKED
engineeringAuthority  = NONE
productionEquationAuthorized = false
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
```

No benchmark solve, result shell, verification artifact, promotion checklist, or human-review template changes these values.

## Product boundary

```text
Advanced_Analysis:
AUTHOR → EDIT → VALIDATE → CERTIFY → EXPORT

3D_Converters / AIV:
IMPORT → VERIFY → JOIN → ASSESS → EXPLAIN
```

No 3D viewer, geometry writeback, pixel-derived AIV distance, click-on-model calculation, or UI-side AIV equations.

## Durable documents

```text
docs/vibration/AIV-Product-Roadmap-v2.md
docs/vibration/AIV-D2.3-Working-Table-Benchmark-v1.md
docs/vibration/AIV-Result-Contracts-v1.md
docs/vibration/AIV-Promotion-Readiness-v1.md
docs/vibration/AIV-Independent-Promotion-Review-v1.md
docs/vibration/AIV-D2.3-Qualification-Solve-v1.md
docs/vibration/AIV-Qualification-Math-Harness-v1.md
```

## Operator/data architecture

Working inputs are split and joined explicitly:

```text
AivSourceCsv.v2
  Source Canonical ID + Operating Case
  process/device/source evidence

AivAssessmentCsv.v1
  Assessment Canonical ID
  welded discontinuity geometry/material evidence

AivSourceAssessmentCsv.v1
  Source + Assessment + Operating Case
  applicability + physical engineering distance/provenance + simultaneous-source group
```

`AivSourceCaseCsv.v1` remains transitional/migration-only.

Current operator foundation:

```text
Load EI D.2.3
→ edit Sources
→ edit Assessments
→ edit Source → Assessment evidence
→ Check AIV readiness
→ frozen result shells
→ method-promotion evidence
```

The controlled D.2.3 fixture intentionally contains relief + recycle sources, one actual first-weldolet assessment, and one relief→weldolet relationship at 0.8 m. No fictitious recycle assessment is created.

## Frozen result contracts

```text
AivSourceResult.v1
AivAssessmentResult.v1
AivLineCaseSummary.v1
AivResultSet.v1
```

Production-facing result shells remain `NOT_CALCULATED` with numerical fields `null`.

Published references and qualification solves do **not** populate those blocked result contracts.

## Stage 15 — human reconciliation and promotion orchestration

Implemented human-only review contracts include:

```text
AivT27Reconciliation.v1
AivD23Flm1Reconciliation.v1
AivWorkedExampleResultScopeReview.v1
AivIndependentBenchmarkReview.v1
AivWorkbookReconciliation.v1
AivIndependentVibrationEngineerPromotionReview.v1
```

The browser can load the five prerequisite verification JSON files, hashes the actual bytes with SHA-256 using Web Crypto, and evaluates:

```text
SATISFIED
UNSATISFIED
INVALID_EVIDENCE
```

Only all six prerequisite gates satisfied may produce:

```text
READY_FOR_INDEPENDENT_AUTHORITY_REVIEW
eligibleForAuthorityReview = true
```

Even then:

```text
authorityPromotionAuthorized = false
productionEquationAuthorized = false
screeningAuthority = NOT_AUTHORIZED
designAuthority = false
```

The final independent-engineer review can recommend `BENCHMARK_ONLY`, request rework, or reject promotion, but its verifier still returns `authorityTransitionApplied=false`. Any transition requires a separate reviewed code change.

## Stage 16A — isolated qualification numerical harness

### Isolation rule

Numerical qualification code is intentionally under `scripts/` only:

```text
scripts/aiv-qualification-math.mjs
scripts/solve-aiv-d23-qualification.mjs
scripts/solve-aiv-independent-qualification-benchmarks.mjs
```

It is not exported from:

```text
converters/vibration/aiv/index.js
```

and is not imported by the AIV UI or Engineering Calculation API.

Regression tests assert that isolation explicitly.

### Shared qualification-only primitives

The helper consolidates arithmetic already used by controlled evidence/tests:

```text
source PWL
source-to-point attenuation
logarithmic simultaneous-source combination
official page-61 errata log10(N) feed
FLM1 qualification reproduction
FLM2 qualification reproduction
fatigue factor Lf
final D.2.3 LOF branch
```

This is not the production kernel.

### D.2.3 numerical closure

Executed qualification solve:

```text
Relief raw source PWL       164.6851759525391 dB
Published                   164.7 dB

Recycle raw source PWL      159.36481554007995 dB
Published                   159.4 dB

Recycle effective PWL       129.36481554007995 dB
Controlled report           129.36 dB

Relief attenuation            0.3116883116883117 dB
Published                     0.312 dB

Relief first-point PWL       164.3734876408508 dB
Published                    164.4 dB

B                           152.207 (published controlled intermediate)
log10(N)                      9.902567870507482
N                             7.990388037921443E9
```

`A`, `S`, and `B` are not rederived because upstream T2.6 transcription is still human-gated:

```text
A = 0.93989
S = 68.229
B = 152.207
```

FLM1 discrepancy is carried as two explicit chains:

```text
published FLM1      1.2133
  FLM2              0.2009306328510857
  Lf                0.31287602368755874
  LOF               0.29

recalculated FLM1   1.2109758194311824
  FLM2              0.2009306328510857
  Lf                0.31312586392312314
  LOF               0.29
```

Thus final D.2.3 `LOF=0.29` is robust to the open FLM1 arithmetic discrepancy, but the discrepancy remains unresolved for production authority.

### Controlled Markdown source-row parity

Machine reproduction at source/effective-source PWL scope:

```text
Recycle compressor discharge  129.36481554007995 → report 129.36 dB
Recycle compressor suction    129.02398009073715 → report 129.02 dB
Relief downstream line        164.6851759525391  → report 164.69 dB
```

The associated line/case LOFs are not claimed as reproduced by this source-PWL solve. Relief downstream line `LOF=1.48` still belongs to the result-scope/aggregation reconciliation gate, not the first-discontinuity `LOF=0.29` chain.

### Independent analytical vectors

The same qualification-only source/combine path reproduces:

```text
Sonic vector
  non-sonic PWL  156.72433464037815 dB
  SFF              6.0 dB
  sonic PWL      162.72433464037815 dB

Equal simultaneous sources
  160 + 160 dB → 163.0102999566398 dB

Asymmetric simultaneous sources
  160 + 150 dB → 160.41392685158226 dB
```

These numerical vectors remain `HUMAN_ACCEPTANCE_REQUIRED`; machine reproduction does not self-complete `AivIndependentBenchmarkReview.v1`.

## Executed validation

### Isolated D.2.3 harness

```text
node --test tests/vibration-aiv-d23-qualification-solve.test.mjs

5 tests
5 pass
0 fail
```

The CLI solve was also executed and emitted the full numerical result object.

### Isolated independent-vector harness

```text
node --test tests/vibration-aiv-independent-qualification-solve.test.mjs

3 tests
3 pass
0 fail
```

### Focused repository command

```bash
npm install
npm run verify:aiv-input-model
```

The repository command now includes both new qualification-solve regression files in addition to readiness, editable inputs, result contracts, promotion, topology and module-boundary tests.

Repository-wide execution remains:

```text
NOT_RUN
```

because GitHub Actions repeatedly creates the AIV job with `runner_id=0` and no steps when the repository Actions budget prevents further use. Do not infer PASS or a code failure from that infrastructure no-start.

## Stage status

| Stage | Work | Status |
|---:|---|---|
| 1–11 | authority/source/trace/errata/benchmark/workbook foundation | IMPLEMENTED; human reviews pending where applicable |
| 12 | split Sources / Assessments / Relationships + joined readiness | IMPLEMENTED / REPO TEST RUN PENDING |
| 13 | editable tables + controlled D.2.3 loader | IMPLEMENTED / REPO TEST RUN PENDING |
| 14 | Source / Assessment / Line result-contract freeze | IMPLEMENTED / REPO TEST RUN PENDING |
| 15 | result-scope human gate + promotion planner + hashed artifact ingestion + independent-review handoff | IMPLEMENTED / HUMAN ARTIFACTS PENDING |
| 16A | isolated D.2.3 + sonic + multi-source numerical qualification harness | IMPLEMENTED / FOCUSED ISOLATED PASS |
| 16B | production/central qualification kernel | NOT AUTHORIZED |
| 17 | BENCHMARK_ONLY real product-path execution | NOT AUTHORIZED |
| 18 | production result register/detail/export | NOT_STARTED |
| 19 | independent vibration-engineer authority decision | PENDING |

## Current changed-file focus

```text
scripts/aiv-qualification-math.mjs
scripts/solve-aiv-d23-qualification.mjs
scripts/solve-aiv-independent-qualification-benchmarks.mjs
tests/vibration-aiv-d23-qualification-solve.test.mjs
tests/vibration-aiv-independent-qualification-solve.test.mjs
docs/vibration/AIV-D2.3-Qualification-Solve-v1.md
docs/vibration/AIV-Qualification-Math-Harness-v1.md
package.json
```

## Human work still required before production numerical wiring

Complete and verify:

```text
1. AivT27Reconciliation.v1
2. AivD23Flm1Reconciliation.v1
3. AivWorkedExampleResultScopeReview.v1
4. AivIndependentBenchmarkReview.v1
5. AivWorkbookReconciliation.v1
6. independent vibration-engineer promotion review after prerequisites are satisfied
```

The machine-side examples are now solved and reproducible. Do **not** import `scripts/aiv-qualification-math.mjs` into the production calculator/UI or promote authority until those human gates are genuinely completed and an explicit reviewed transition permits Stage 16B.
