# AIV Kernel Candidate — Stages 1–7 v1

## Purpose

`converters/vibration/aiv/aiv-kernel-candidate.js` is the first production-shaped numerical candidate for `VIB.AIV.ACOUSTIC`.

It is deliberately **not a released calculator**.

```text
implementationState          = CANDIDATE_NOT_AUTHORIZED
registeredInEngineeringApi   = false
uiExecutionAuthorized        = false
benchmarkExecutionAuthorized = false
screeningExecutionAuthorized = false
productionEquationAuthorized = false
screeningAuthority           = NOT_AUTHORIZED
designAuthority              = false
```

The module is not exported from `converters/vibration/aiv/index.js` and is not imported by the AIV workspace or Engineering Calculation registry.

## Implemented stage boundary

Implemented candidate stages:

```text
1  VALIDATE_INPUT
2  RESOLVE_INPUT
3  EVALUATE_APPLICABILITY
4  CALCULATE_SOURCE_PWL
5  APPLY_SOURCE_MODIFIERS
6  CALCULATE_POINT_ATTENUATION
7  COMBINE_SIMULTANEOUS_SOURCES
```

Still blocked:

```text
8  CALCULATE_DISCONTINUITY_RESULT
9  AGGREGATE_LINE_CASE_RESULT
10 ASSESS_RESULT
```

Stages 8–10 remain blocked because the full T2-6 discontinuity chain, result-scope aggregation, and final engineering assessment still require named human reconciliation/release evidence.

## Candidate input behavior

The candidate consumes the existing split AIV records rather than inventing a parallel worksheet model.

### Source

Uses explicit source evidence for:

```text
mass flow
P1 / P2
pressure basis
reference pressure + provenance when gauge
upstream temperature
molecular weight
explicit sonic state
low-noise trim state/reduction + provenance
```

Gauge pressure is converted to absolute only when reference pressure, source and source revision are present.

No sonic-state detection is implemented. The candidate consumes only explicit `SONIC` or `NON_SONIC` input. `UNRESOLVED` fails closed.

### Relationship / assessment

Point attenuation requires:

```text
APPLICABLE relationship
exact source/case/assessment identity match
physical distance
Distance Source
Distance Source Revision
assessment main inside diameter
```

Topology/SVG coordinates are never used as physical AIV distance.

## Supported candidate arithmetic

The candidate independently implements the reviewed qualification expressions used for source-level release preparation:

```text
source PWL
explicit SFF contribution
manufacturer trim reduction
source-to-point attenuation
logarithmic simultaneous-source combination
```

It does not import the qualification helper under `scripts/`, so candidate-versus-qualification parity can be checked independently.

## D.2.3 candidate parity

Focused isolated execution produced:

```text
Relief raw source PWL       164.6851759525391 dB
Recycle raw source PWL      159.36481554007995 dB
Recycle effective PWL       129.36481554007995 dB
Relief attenuation            0.3116883116883117 dB
Relief first-point PWL       164.3734876408508 dB
```

Independent branch parity:

```text
Explicit SONIC SFF=6
  162.72433464037815 dB

160 + 160 dB
  163.0102999566398 dB

160 + 150 dB
  160.41392685158226 dB
```

## Focused regression

```text
tests/vibration-aiv-kernel-candidate.test.mjs
6 pass / 0 fail in isolated execution
```

The test verifies D.2.3 source/point parity, explicit sonic-state handling, simultaneous-source combination, gauge/distance provenance fail-closed behavior, blocked stages 8–10, and absence from the public AIV facade.

## Release significance

This slice reduces Release-1 implementation risk without granting authority.

The BENCHMARK_ONLY release sequence remains:

```text
candidate stages 1–7
→ complete/reconcile T2-6 authority evidence
→ complete stages 8–10 in candidate form
→ drive EI D.2.3 through the real candidate result path
→ exact-head node/browser validation
→ independent vibration-engineer BENCHMARK_ONLY recommendation
→ separate reviewed authority-transition change
```

Until that transition, product result contracts remain `NOT_CALCULATED` and the UI has no Run AIV action.
