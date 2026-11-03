# AIV Qualification Math Harness v1

## Purpose

The AIV qualification math harness provides a reproducible numerical path for controlled benchmark evidence **without** creating a production AIV calculator.

Implementation is intentionally isolated under `scripts/`:

```text
scripts/aiv-qualification-math.mjs
scripts/solve-aiv-d23-qualification.mjs
scripts/solve-aiv-independent-qualification-benchmarks.mjs
```

These files are not exported from `converters/vibration/aiv/index.js`, are not imported by the AIV UI, and are not registered in the Engineering Calculation API.

Authority remains:

```text
calculationState      = BLOCKED
qualificationState    = BLOCKED
engineeringAuthority  = NONE
productionEquationAuthorized = false
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
```

## Qualification-only primitives

The shared helper currently contains only the numerical primitives already exercised by controlled evidence/tests:

```text
source PWL reproduction
source-to-point attenuation
logarithmic point-level source combination
official page-61 errata log10(N) feed
FLM1 qualification reproduction
FLM2 qualification reproduction
fatigue factor Lf
final LOF branch used by the D.2.3 qualification chain
```

This helper is **not** a production kernel. It exists to remove duplicated test arithmetic and make qualification vectors execute through one isolated path.

## D.2.3 solve

See:

```text
docs/vibration/AIV-D2.3-Qualification-Solve-v1.md
```

The isolated D.2.3 solve reproduces:

```text
Relief raw source PWL       164.6851759525 dB
Recycle raw source PWL      159.3648155401 dB
Recycle effective PWL       129.3648155401 dB
Relief attenuation            0.3116883117 dB
Relief point PWL             164.3734876409 dB
log10(N)                       9.9025678705
N                              7.9903880379E9
FLM2                           0.2009306329
Final LOF                      0.29
```

Both FLM1 paths are evaluated:

```text
published FLM1      1.2133          -> LOF 0.29
recalculated FLM1   1.210975819431  -> LOF 0.29
```

The FLM1 discrepancy therefore remains a qualification/authority issue, but it does not alter this benchmark's final LOF.

`A`, `S`, and `B` remain controlled published intermediates and are not rederived until the T2.6 human-transcription gate is complete.

## Controlled Markdown source-row parity

Source/effective-source PWL parity is reproduced for all three controlled Markdown AIV rows:

```text
Recycle compressor discharge  129.3648155401 -> report 129.36 dB
Recycle compressor suction    129.0239800907 -> report 129.02 dB
Relief downstream line        164.6851759525 -> report 164.69 dB
```

The associated line/case LOFs are not claimed as reproduced by this source-PWL path. In particular, relief-line `LOF=1.48` still requires line/case result-scope and aggregation reconciliation.

## Independent sonic vector

Controlled qualification vector:

```text
P1 absolute       5.0 MPa
P2 absolute       1.0 MPa
mass flow        10 kg/s
T               300 K
MW               20 g/mol
```

Reproduced results:

```text
non-sonic PWL  156.72433464037815 dB
sonic SFF        6.00000000000000 dB
sonic PWL      162.72433464037815 dB
```

The numerical vector is machine-reproduced; `AivIndependentBenchmarkReview.v1` still requires named human acceptance against reviewed EI trace hashes.

## Independent simultaneous-source vectors

Reproduced logarithmic point-level combinations:

```text
160 + 160 dB -> 163.0102999566398 dB
increase       3.0102999566398 dB

160 + 150 dB -> 160.41392685158226 dB
increase       0.41392685158226 dB
```

Again, machine reproduction does not replace the named human benchmark acceptance gate.

## Executed isolated validation

Two isolated Node harnesses were executed during implementation:

```text
D.2.3 qualification solve
  5 tests
  5 pass
  0 fail

Independent sonic/multi-source solve
  3 tests
  3 pass
  0 fail
```

These focused executions validate the isolated scripts and numerical vectors. They are not repository-wide CI.

GitHub Actions remains separately unable to start because the repository Actions budget/capacity condition assigns no runner.

## Commands

```bash
npm run solve:aiv-d23-qualification
npm run solve:aiv-independent-qualification-benchmarks
npm run verify:aiv-input-model
```

## Promotion boundary

Machine-side numerical reproduction now covers the principal benchmark branches needed before production implementation, but the following human gates remain authoritative:

```text
CONTROLLED_T2_7_HUMAN_RECONCILIATION
RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC
RECONCILE_WORKED_EXAMPLES_DERIVED_REPORT_RESULT_SCOPE
INDEPENDENT_SONIC_SFF6_BENCHMARK human acceptance
INDEPENDENT_MULTI_SOURCE_BENCHMARK human acceptance
RETAINED_WORKBOOK_RECONCILIATION
INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW
```

No code in this harness applies an authority transition.
