# AIV D.2.3 Product-Path Validation v1

## Validation identity

```text
method                  VIB.AIV.ACOUSTIC
benchmark               EI-D2.3-AIV
validated numerical path complete 10-stage calculator
execution               local controlled Node exact-source validation
result                  PASS
checks                  22 / 22 PASS
repository Actions      NOT_RUN (budget / zero-step jobs)
human evidence required false
```

Machine-readable receipt: `docs/vibration/validation/AIV-D2.3-Product-Path-Validation-v1.json`.

The validation uses the same controlled D.2.3 Source / Assessment / Source→Assessment values used by the AIV benchmark loader. The product validation wrapper now delegates to the same central `calculateAiv` implementation used by screening.

## Scope rule

Two published results remain separate:

```text
first weldolet assessment LOF = 0.29   -> ASSESSMENT
relief-line report LOF        = 1.48   -> LINE_CASE_SUMMARY
```

The line value is a visible configurable reference and is not authoritative for screening.

## Step-by-step validation

| # | Stage / check | Expected | Actual | Tolerance | Result |
|---:|---|---:|---:|---:|---|
| 01 | Relief raw source PWL, dB | 164.7 | 164.6851759525 | 0.05 | PASS |
| 02 | Recycle raw source PWL, dB | 159.4 | 159.3648155401 | 0.05 | PASS |
| 03 | Recycle effective PWL after 30 dB trim | 129.36 | 129.3648155401 | 0.05 | PASS |
| 04 | Relief attenuation to first discontinuity, dB | 0.312 | 0.3116883117 | 0.001 | PASS |
| 05 | Relief point PWL, dB | 164.4 | 164.3734876409 | 0.05 | PASS |
| 06 | Configured published A | 0.93989 | 0.93989 | 1e-9 | PASS |
| 07 | Configured published S | 68.229 | 68.229 | 1e-9 | PASS |
| 08 | Configured published B | 152.207 | 152.207 | 1e-9 | PASS |
| 09 | Errata log10(N) | 9.9026 | 9.9025678705 | 0.0001 | PASS |
| 10 | N | 7.99E9 | 7.9903880379E9 | 1.0E7 | PASS |
| 11 | Dext/dext | 2.791 | 2.7910447761 | 0.001 | PASS |
| 12 | Selected published FLM1 | 1.2133 | 1.2133 | 1e-9 | PASS |
| 13 | Recalculated FLM1 vs published | 1.2133 | 1.2109758194 | 0.0024 | PASS |
| 14 | FLM2 | 0.2009 | 0.2009306329 | 0.0001 | PASS |
| 15 | N after FLM1 | 9.70E9 | 9.6947378064E9 | 1.0E7 | PASS |
| 16 | N after FLM2 | 1.95E9 | 1.9479698028E9 | 5.0E6 | PASS |
| 17 | Lf | 0.31 | 0.3128760237 | 0.01 | PASS |
| 18 | First-discontinuity LOF | 0.29 | 0.29 | 0.01 | PASS |
| 19 | Assessment and line result scopes remain distinct | true | true | exact | PASS |
| 20 | Configured relief-line LOF | 1.48 | 1.48 | exact | PASS |
| 21 | Complete stage count | 10 | 10 | exact | PASS |
| 22 | Universal operating classification emitted | false | false | exact | PASS |

## Numerical chain

```text
Mass flow
53482 kg/h -> 14.8561111111 kg/s

Relief source
98 barg + 1 bar reference -> 99 bara
0 barg + 1 bar reference  -> 1 bara
raw source PWL             -> 164.6851759525 dB

First discontinuity
Ldis = 0.8 m
Dint = 154 mm
attenuation                -> 0.3116883117 dB
point PWL                  -> 164.3734876409 dB

Configured intermediates
A = 0.93989
S = 68.229
B = 152.207

Errata chain
log10(N)                   -> 9.9025678705
N                          -> 7.9903880379E9
Dext/dext                  -> 2.7910447761
FLM1 selected              -> 1.2133
FLM1 recalculated          -> 1.2109758194
N after FLM1               -> 9.6947378064E9
FLM2                       -> 0.2009306329
N after FLM2               -> 1.9479698028E9
Lf                         -> 0.3128760237
assessment LOF             -> 0.29

Separate line/case scope
configured relief-line LOF -> 1.48
```

## Release progression after validation

```text
16B.1  stages 1–7 candidate                         COMPLETE
16B.2  assumption/configuration model               COMPLETE
16B.3  stages 8–10 implementation                   COMPLETE
17     D.2.3 product-path parity                    COMPLETE / PASS
18     benchmark result detail + assumptions/export COMPLETE
19     BENCHMARK_ONLY exact-source release          COMPLETE
20     SCREENING qualification/release              COMPLETE
```

Stage 19 release evidence is recorded in `AIV-BENCHMARK-ONLY-ReleaseValidationRecord-v1.json` / `Receipt-v1.json`. Stage 20 screening evidence is recorded in `AIV-SCREENING-ReleaseValidationRecord-v1.json` / `Receipt-v1.json`.

## Current authority

```text
calculationState      = IMPLEMENTED
qualificationState    = SCREENING
engineeringAuthority  = SCREENING
screeningAuthority    = AUTHORIZED
screeningResultScope  = ASSESSMENT
designAuthority       = false
```

This remains screening, not design approval. The configured line/case result remains non-authoritative for screening.