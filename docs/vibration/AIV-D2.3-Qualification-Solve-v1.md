# AIV D.2.3 Qualification Solve v1

## Purpose

This document records an isolated numerical reproduction of the EI AVIFF D.2.3 high-frequency acoustic excitation worked example for `VIB.AIV.ACOUSTIC`.

The implementation is intentionally located in:

```text
scripts/solve-aiv-d23-qualification.mjs
```

It is **qualification-only**. It is not exported from `converters/vibration/aiv/index.js`, is not callable from the AIV UI, and is not registered in the Engineering Calculation API.

Authority remains:

```text
calculationState      = BLOCKED
qualificationState    = BLOCKED
engineeringAuthority  = NONE
productionEquationAuthorized = false
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
```

## Controlled evidence

The solve uses the existing pinned D.2.3 evidence in `AivD23PdfRevalidation.v1` and the official page-61 errata coefficient evidence already stored on the branch.

Key controlled values are:

```text
Relief source
  P1 absolute     99 bara
  P2 absolute      1 bara
  mass flow    53482 kg/h
  temperature    137 °C
  MW            21.75 g/mol
  SFF               0 dB

Recycle source
  P1 absolute     88 bara
  P2 absolute     26 bara
  mass flow    53482 kg/h
  temperature  136.7 °C
  MW            21.75 g/mol
  SFF               0 dB
  trim reduction    30 dB

Relief first discontinuity
  type          2-inch bypass weldolet
  distance      0.8 m
  main ID       154 mm
  main OD       168.3 mm
  branch OD     60.3 mm
```

## Source reproduction

The isolated qualification solve gives:

```text
Relief raw source PWL       164.6851759525 dB
Published                   164.7 dB

Recycle raw source PWL      159.3648155401 dB
Published                   159.4 dB

Recycle effective PWL
  after 30 dB trim          129.3648155401 dB
Controlled Markdown report  129.36 dB
```

This demonstrates that the controlled report's recycle `129.36 dB` value is consistent with the D.2.3 raw source PWL followed by the manufacturer low-noise-trim reduction. Raw source PWL and effective source PWL therefore remain separate product fields.

## Controlled Markdown AIV row parity

The same qualification solver reproduces the three controlled Markdown AIV **PWL** rows at source/effective-source scope:

```text
Recycle compressor discharge
  calculated  129.3648155401 dB
  report      129.36 dB

Recycle compressor suction
  calculated  129.0239800907 dB
  report      129.02 dB

Relief downstream line
  calculated  164.6851759525 dB
  report      164.69 dB
```

The associated Markdown LOF values (`0.29`, `0.29`, `1.48`) are retained as controlled report values but are **not** claimed as reproduced by this source-PWL solve. In particular, the relief line `LOF=1.48` requires the still-unreconciled line/case result-scope and aggregation rule.

## Relief first-discontinuity reproduction

### Attenuation and point PWL

```text
attenuation = 60 × 0.8 / 154
            = 0.3116883117 dB

point PWL   = 164.6851759525 - 0.3116883117
            = 164.3734876409 dB
```

Published displayed values are `0.312 dB` attenuation and `164.4 dB` point PWL.

### Published A / S / B intermediates

The current isolated solve deliberately does **not** rederive these values because their upstream T2.6 equations remain inside the controlled human-transcription gate:

```text
A = 0.93989
S = 68.229
B = 152.207
```

They are used as controlled published D.2.3 intermediates only.

### Official page-61 errata feed

Using `B = 152.207` and the stored official errata coefficients:

```text
log10(N) = 9.9025678705
N        = 7.9903880379E9
```

Published displayed values are `9.9026` and `7.99E9`.

### Diameter multiplier discrepancy

```text
Dext / dext = 168.3 / 60.3
            = 2.7910447761

FLM1 recalculated from displayed inputs
            = 1.2109758194311824

Published FLM1
            = 1.2133
```

The arithmetic reconciliation remains open. The isolated solver evaluates both branches rather than choosing one as engineering authority.

### FLM2 and final chain

Calculated from the reproduced point PWL:

```text
FLM2 = 0.2009306329
```

Using published `FLM1 = 1.2133`:

```text
N after FLM1 = 9.6947378064E9
N after FLM2 = 1.9479698028E9
Lf            = 0.3128760237
LOF           = 0.29
```

Using recalculated `FLM1 = 1.2109758194311824`:

```text
N after FLM1 = 9.6761667018E9
N after FLM2 = 1.9442382990E9
Lf            = 0.3131258639
LOF           = 0.29
```

Therefore the D.2.3 first-discontinuity final `LOF = 0.29` is numerically robust to the currently open FLM1 arithmetic variance.

This does **not** resolve which FLM1 value is authoritative for production implementation.

## Result-scope boundary

The controlled worked-example Markdown also contains a relief downstream **line** result:

```text
PWL = 164.69 dB
LOF = 1.48
```

That line/case summary is not interchangeable with the D.2.3 first-discontinuity assessment result `LOF = 0.29`.

The isolated D.2.3 solver does not attempt to reconstruct `LOF = 1.48`, because the line/case aggregation rule remains inside the human result-scope / method reconciliation gate.

## Executed isolated validation

A local isolated Node harness was executed against the branch solver logic and the exact controlled evidence fields used by the solver.

```text
node --test tests/vibration-aiv-d23-qualification-solve.test.mjs

5 tests
5 pass
0 fail
```

The CLI solve was also executed and produced the values recorded above.

This is a real focused execution of the qualification solver, but it is **not** a substitute for repository-wide CI. GitHub Actions remains separately blocked by repository Actions budget/capacity.

## What this solve closes

Machine-reproducible qualification evidence now demonstrates:

- relief source PWL parity;
- recycle raw source PWL parity;
- recycle post-trim PWL parity with the controlled Markdown report;
- recycle suction controlled-report PWL parity;
- relief controlled-report PWL parity;
- relief attenuation parity;
- relief first-discontinuity point-PWL parity;
- official errata `log10(N)` and `N` parity;
- FLM2 parity;
- final D.2.3 `LOF = 0.29` for both published and recalculated FLM1 branches.

## What remains open

```text
CONTROLLED_T2_7_HUMAN_RECONCILIATION
RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC
RECONCILE_WORKED_EXAMPLES_DERIVED_REPORT_RESULT_SCOPE
INDEPENDENT_SONIC_SFF6_BENCHMARK human acceptance
INDEPENDENT_MULTI_SOURCE_BENCHMARK human acceptance
RETAINED_WORKBOOK_RECONCILIATION
INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW
```

The numerical reproduction improves benchmark closure but does not self-authorize Stage 16 production or screening logic.

## Commands

```bash
npm run solve:aiv-d23-qualification
npm run verify:aiv-input-model
```
