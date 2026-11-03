# AIV Independent Sonic and Multi-Source Benchmarks v1

Status: **ANALYTICAL VECTORS DEFINED — HUMAN ACCEPTANCE REQUIRED — PRODUCTION AUTHORITY BLOCKED**

Method:

```text
VIB.AIV.ACOUSTIC
```

## Purpose

EI D.2.3 is a strong worked-example benchmark, but both published source cases use the non-sonic branch (`SFF = 0`) and it does not provide a simultaneous multi-source example.

The qualification package therefore requires independent analytical vectors for:

1. the explicit sonic `SFF = 6 dB` branch; and
2. logarithmic combination of simultaneous acoustic contributions at the same assessment point and operating case.

These vectors are not production calculator functions.

## Sonic benchmark

Benchmark ID:

```text
AIV-HAND-SONIC-SFF6-001
```

Independent inputs:

```text
P1 = 5,000,000 Pa abs
P2 = 1,000,000 Pa abs
W  = 10 kg/s
Te = 300 K
Mw = 20 g/mol
sonic state = SONIC
SFF = 6 dB
```

The paired non-sonic calculation for the same process quantities gives:

```text
PWL, SFF=0 = 156.72433464037815 dB
```

The explicit sonic vector gives:

```text
PWL, SFF=6 = 162.72433464037815 dB
sonic delta = exactly 6 dB
```

This benchmark intentionally uses values independent of the D.2.3 relief/recycle cases.

Required controlled traces before human acceptance:

```text
AIV-EQ-SOURCE-PWL-001
AIV-CONST-SFF-001
```

The vector exercises an explicitly supplied sonic state. It does not qualify an automatic sonic-state resolver or critical-flow calculation.

## Equal-source combination benchmark

Benchmark ID:

```text
AIV-HAND-MULTI-SOURCE-EQUAL-001
```

Two simultaneous point-level contributions:

```text
160 dB
160 dB
```

Analytical log-power result:

```text
combined PWL = 163.0102999566398 dB
increase over either single source = 3.010299956639812 dB
```

## Asymmetric-source combination benchmark

Benchmark ID:

```text
AIV-HAND-MULTI-SOURCE-ASYM-001
```

Two simultaneous point-level contributions:

```text
160 dB
150 dB
```

Analytical result:

```text
combined PWL = 160.41392685158226 dB
increase above dominant source = 0.4139268515822578 dB
```

The vector also verifies that combination is order-invariant and that the weaker source is not discarded merely because it is 10 dB below the dominant source.

Required controlled trace:

```text
AIV-EQ-MULTI-SOURCE-001
```

## Scope of multi-source benchmark

These vectors start from acoustic contributions **at the same assessment point**. They isolate the logarithmic combination rule.

They do not authorize:

- source-to-point attenuation;
- source simultaneity assumptions;
- topology path selection;
- operating-case coincidence;
- automatic source selection.

Those must remain separately traceable inputs/resolutions.

## Evidence object

`converters/vibration/aiv/aiv-independent-benchmark-evidence.js` defines:

```text
AivIndependentBenchmarkEvidence.v1
```

Every vector states:

```text
benchmarkType       = INDEPENDENT_ANALYTICAL_VECTOR
reviewState         = HUMAN_ACCEPTANCE_REQUIRED
productionAuthority = false
```

The evidence object itself remains:

```text
calculationState             = BLOCKED
qualificationState           = BLOCKED
productionEquationAuthorized = false
screeningAuthority           = NOT_AUTHORIZED
designAuthority              = false
```

## Human acceptance

Command:

```bash
npm run verify:aiv-independent-benchmarks -- \
  --template-out /tmp/aiv-independent-benchmark-review.json
```

Review verification:

```bash
npm run verify:aiv-independent-benchmarks -- \
  --verify /path/to/reviewed-aiv-independent-benchmark-review.json
```

Schema:

```text
AivIndependentBenchmarkReview.v1
```

For every benchmark, a named human engineer must provide:

- reviewed transcription SHA-256 for every required EI trace;
- independent calculation artifact SHA-256;
- `REVIEWED` state and ISO review date;
- disposition `ACCEPTED_AS_INDEPENDENT_ANALYTICAL_BENCHMARK`;
- explicit qualification-only tolerance acceptance;
- engineering rationale;
- implementation note.

AI-only, anonymous, or CI-generated review cannot close the benchmark gates.

## Tolerance boundary

The stored vector tolerances are for exact analytical regression of the qualification calculations. They are **not** automatically production method tolerances and must not become a general `±5%`, `±0.1 dB`, or similar rule.

Any future production tolerance must be justified from method precision, source rounding and sensitivity evidence.

## Promotion consequence

A complete human review can close:

```text
INDEPENDENT_SONIC_SFF6_BENCHMARK
INDEPENDENT_MULTI_SOURCE_BENCHMARK
```

It still returns:

```text
productionEquationAuthorized = false
```

and leaves the controlled EI source reconciliation, exact D.2.3/FLM1 disposition, retained-workbook reconciliation and independent promotion review as separate gates.

Until the complete qualification package is accepted, `VIB.AIV.ACOUSTIC` remains BLOCKED.
