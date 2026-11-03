# AIV Product Roadmap v2 — AUTO Screening Release

## Current state

`VIB.AIV.ACOUSTIC` has completed the AUTO benchmark and screening release sequence.

```text
humanEvidenceRequired = false
missing engineering data -> visible AivAssumptionProfile.v1 -> user editable
explicit table values override assumptions
```

Current product authority:

```text
calculationState      = IMPLEMENTED
qualificationState    = SCREENING
engineeringAuthority  = SCREENING
productionEquationAuthorized = true
screeningAuthority    = AUTHORIZED
screeningResultScope  = ASSESSMENT
designAuthority       = false
```

The configured line/case summary is **not** authoritative for screening.

## Controlled benchmark basis

Readable worked-example source:

```text
3D_Converters
commit 8f243592d73ccf4790d9e308a311003ce7d8f5bb
docs/Energy-Institute-AVIFF---Worked-Examples.md
blob 9f22d92eba8bdf3b67adc25a4c77a7f7d7211da8
```

## Product model

Three result scopes remain mandatory:

```text
SOURCE
  raw source PWL
  sonic SFF
  trim reduction
  effective source PWL

ASSESSMENT
  source contributions at point
  combined point PWL
  T2-6 chain
  assessment LOF   <- qualified SCREENING scope

LINE_CASE_SUMMARY
  configured/reporting line/case result
  non-authoritative for screening
```

D.2.3 first-discontinuity `LOF=0.29` and worked-example relief-line `LOF=1.48` are different result scopes and are never substituted for each other.

## Missing-data assumptions

`AivAssumptionProfile.v1` supplies visible, editable defaults for source/process data, geometry/material, distance/applicability, identity/provenance and configured method parameters. Every assumed cell is recorded and exported. Explicit user input wins.

The project-flow qualification starts from blank Sources / Assessments / Relationships and resolves **56 visible assumptions**. An explicit mass-flow override is preserved rather than overwritten and changes the screening result.

Optional quantity pairs remain fail-safe: if an optional value is blank its unit is not injected independently.

## Central ten-stage kernel

`converters/vibration/aiv/aiv-calculator.js` is the central numerical path:

```text
1  VALIDATE_INPUT
2  RESOLVE_INPUT
3  EVALUATE_APPLICABILITY
4  CALCULATE_SOURCE_PWL
5  APPLY_SOURCE_MODIFIERS
6  CALCULATE_POINT_ATTENUATION
7  COMBINE_SIMULTANEOUS_SOURCES
8  CALCULATE_DISCONTINUITY_RESULT
9  AGGREGATE_LINE_CASE_RESULT
10 ASSESS_RESULT
```

The D.2.3 validation wrapper and product screening execution both route through this central calculator. `calculateAivBatch()` uses the same kernel for every batch item.

## D.2.3 full product-path validation

Machine-readable validation record:

```text
docs/vibration/validation/AIV-D2.3-Product-Path-Validation-v1.json
blob 6d3cd2f7d71ab47d2825d802628f18c0782ffdc7
status PASS
22 / 22 checks
completeKernelStageCount = 10
```

Readable step-by-step record:

```text
docs/vibration/AIV-D2.3-Product-Path-Validation-v1.md
```

Representative results:

```text
Relief raw PWL           164.6851759525391 dB
Recycle raw PWL          159.36481554007995 dB
Recycle effective PWL    129.36481554007995 dB
Attenuation                0.3116883116883117 dB
First-point PWL          164.3734876408508 dB
log10(N)                   9.902567870507482
N                          7.990388037921443E9
Dext/dext                  2.7910447761194033
FLM1 selected              1.2133
FLM1 recalculated          1.2109758194311824
FLM1 variance              0.0023241805688176687 <= 0.0024
FLM2                       0.2009306328510857
N after FLM1               9.694737806410088E9
N after FLM2               1.9479698027673252E9
Lf                         0.31287602368755874
Assessment LOF             0.29
Configured line LOF        1.48
```

## Stage 19 — BENCHMARK_ONLY release completed

Local controlled exact-source validation was required because GitHub-hosted Actions jobs receive no runner/steps due the repository Actions budget.

Release evidence:

```text
docs/vibration/validation/AIV-BENCHMARK-ONLY-ReleaseValidationRecord-v1.json
docs/vibration/validation/AIV-BENCHMARK-ONLY-ReleaseValidationReceipt-v1.json
```

The post-registration BENCHMARK_ONLY candidate was validated at exact head:

```text
32a0c4962d74940b9cded8709eb2b83a68c006ad
```

Validation groups:

```text
AIV_FOCUSED_NODE_TESTS              PASS
AIV_CONTROLLED_BENCHMARK_PARITY     PASS
AIV_BROWSER_WORKSPACE_SMOKE         PASS
AIV_MODULE_BOUNDARY_CHECK           PASS
```

The AIV Engineering Calculation definition was then activated as `IMPLEMENTED / BENCHMARK_ONLY` before Stage 20.

## Stage 20 — SCREENING qualification completed

The screening candidate was locally qualified at exact head:

```text
613e1ec48335db3794e5208b0c3435d387683b04
```

Release evidence:

```text
docs/vibration/validation/AIV-SCREENING-ReleaseValidationRecord-v1.json
docs/vibration/validation/AIV-SCREENING-ReleaseValidationReceipt-v1.json
```

All eight required groups pass:

```text
AIV_FOCUSED_NODE_TESTS                  PASS
AIV_CONTROLLED_BENCHMARK_PARITY         PASS
AIV_BROWSER_WORKSPACE_SMOKE             PASS
AIV_MODULE_BOUNDARY_CHECK               PASS
AIV_REAL_PRODUCT_PATH_PARITY            PASS
AIV_SINGLE_BATCH_PARITY                 PASS
AIV_PROJECT_INPUT_BROWSER_FLOW          PASS
AIV_EXPORT_PROVENANCE                   PASS
```

The screening qualification summary remains:

```text
benchmark parity       22 / 22 PASS
screening scope        ASSESSMENT
line summary authority false
project assumptions    56 visible defaults in blank-row qualification
single/batch kernel    same calculateAiv implementation
designAuthority        false
```

After the receipt was generated, a separate code change applied `qualificationState=SCREENING` and enabled explicit `qualificationMode=screening` through the Engineering Calculation API.

## AUTO stage plan — complete

```text
16B.1 stages 1–7 candidate                         COMPLETE
16B.2 assumptions + stages 8–10 configuration      COMPLETE
16B.3 stages 8–10 implementation                   COMPLETE
17     D.2.3 Source/Assessment/Line validation      COMPLETE / PASS
18     result detail / assumptions / export         COMPLETE
19     exact-head validation + BENCHMARK_ONLY       COMPLETE
20     SCREENING machine qualification/release      COMPLETE
```

There is no pending AUTO release stage. Future work is operational hardening or a separately scoped authority program; it does not implicitly extend screening into design authority.

## Screening workspace behavior

The AIV workspace now supports:

```text
Load/import inputs
Edit visible assumptions
Check readiness
Run AIV screening
Inspect Source results
Inspect Assessment screening results
Inspect non-authoritative Line/Case summary
Export screening result + input/assumption provenance
```

Screening execution routes through the registered Engineering Calculation API, not through UI equations.

Readiness rules include:
- explicit `SONIC` is accepted because the SFF=6 branch is machine-qualified;
- `UNRESOLVED` sonic state remains fail-closed;
- gas phase remains the qualified envelope;
- closed-source behavior remains outside the active-source envelope;
- physical AIV distance comes from relationship evidence or an explicit visible assumption, never topology pixels.

## Permanent application boundary

```text
Advanced_Analysis:
AUTHOR -> EDIT -> VALIDATE -> CERTIFY -> EXPORT

3D_Converters / AIV:
IMPORT -> VERIFY -> JOIN -> ASSESS -> EXPLAIN
```

No 3D viewer, free-form topology authoring, pixel-derived AIV distance, click-on-model calculation workflow, or geometry writeback is introduced by AIV.

`designAuthority=false` remains the permanent boundary for this release.