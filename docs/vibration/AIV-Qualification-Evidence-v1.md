# AIV Qualification Evidence v1

Status: **CONTROLLED SOURCE LOCATIONS + REVALIDATED WORKED-EXAMPLE EVIDENCE — PRODUCTION EQUATION NOT AUTHORIZED**

Method ID:

```text
VIB.AIV.ACOUSTIC
```

Authority remains:

```text
calculationState      = BLOCKED
qualificationState    = BLOCKED
engineeringAuthority  = NONE
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
```

## 1. Controlled sources

### Main EI guidance

```text
repository: reallaksh19/Common
commit: aef163a5def3bfe04ca0ba860da05728a27daf42
file: EI - AVIFF Guidelines 2nd Edition.pdf
blob: 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
locator: T2.7 High Frequency Acoustic Excitation, pages 59-62
edition: 2nd
published: January 2008
```

The official Energy Institute errata affects pages 61 and 68. Page 61 is AIV-relevant because it contains the T2-6 feed from Flowchart T2-5. The branch therefore keeps controlled extraction and errata reconciliation as explicit qualification gates.

### Worked-example DOCX

```text
repository: reallaksh19/Common
commit: fb549185b9b27edc2379734240320a85c5bef9f6
file: Energy-Institute-AVIFF---Worked-Examples.doc.docx
blob: ceee15ed5f7f320045d5f3979024e2e8664613f2
locator: Appendix D / D.2.3 High Frequency Acoustic Excitation (T2.7)
```

### Revalidation PDF

```text
repository: reallaksh19/Common
commit: fb549185b9b27edc2379734240320a85c5bef9f6
file: EI examples.pdf
blob: 1ddef94f81bd30570d1b1f86b1d3e2acdcc17dec
size: 1,602,640 bytes
locator: Appendix D / D.2.3, printed pages 183-185
```

The exact GitHub PDF blob is pinned in `aiv-d23-pdf-revalidation.js`. Direct binary extraction of that GitHub blob remains a separate gate because the current connector does not expose its PDF bytes/text. Revalidation values are therefore retained as qualification evidence only and cannot authorize production equations.

## 2. Main T2.7 trace locations

```text
AIV-APP-T2-7-EXTENT-001         T2.7.1, page 59
AIV-UNIT-T2-7-INPUTS-001       T2.7.2, page 59
AIV-EQ-SOURCE-PWL-001           T2.7.3 / T2-5, page 60
AIV-CONST-SFF-001               T2.7.3, page 60
AIV-ASS-155DB-001               T2-5, page 60
AIV-EQ-ATTENUATION-001          T2-5, page 60
AIV-EQ-MULTI-SOURCE-001         T2-5, page 60
AIV-ASS-LOW-NOISE-TRIM-001     Note 1 / T2.7.3, page 61
AIV-EQ-T2-6-001                 T2-6, page 61
```

No production equation is authorized merely because its source location is known.

## 3. D.2.3 source cases revalidated

### Relief valve

```text
P1 gauge                  98 barg
P2 gauge                  0 barg
published P1 absolute     9.9 MPa abs
published P2 absolute     0.1 MPa abs
mass flow                 53,482 kg/h
normalized mass flow      14.86 kg/s
upstream temperature      137 degC
published temperature     410 K
molecular weight          21.75 g/mol
sonic state               NON_SONIC
SFF                       0 dB
published source PWL      164.7 dB
```

### Recycle valve

The PDF revalidation corrects the raw temperature retained in the earlier fixture:

```text
P1 gauge                  87 barg
P2 gauge                  25 barg
published P1 absolute     8.8 MPa abs
published P2 absolute     2.6 MPa abs
mass flow                 53,482 kg/h
upstream temperature      136.7 degC
published temperature     410 K
molecular weight          21.75 g/mol
sonic state               NON_SONIC
SFF                       0 dB
published source PWL      159.4 dB
manufacturer trim         approximately 30 dB reduction
```

The example states that applying the manufacturer reduction takes the recycle source below the 155 dB branch and sets the recycle-line high-frequency-acoustic main-line LOF to `0.29`.

## 4. Relief first welded discontinuity - full published chain

The first evaluated discontinuity downstream of the relief source is the 2-inch bypass weldolet.

```text
source-to-assessment distance 0.8 m
main pipe ID                  154 mm
main pipe OD                  168.3 mm
main wall thickness           7.11 mm
branch OD                     60.3 mm
source PWL                    164.7 dB
attenuation                   0.312 dB
assessment PWL                164.4 dB
A                             0.93989
S                             68.229
B                             152.207
log10(N)                      9.9026
N                             7.99E9
Dext/dext                     2.791
published FLM1                1.2133
published N after FLM1        9.70E9
published FLM2                0.2009
published N after FLM2        1.95E9
material duplex               no
published Lf                  0.31
published final LOF           0.29
```

The previously recorded gap:

```text
FINAL_T2_6_LOF_NOT_YET_CAPTURED_FROM_CONTROLLED_SOURCE
```

is closed. The published example explicitly states `Lf < 0.5`, therefore `LOF = 0.29`.

## 5. New arithmetic reconciliation gap

Independent evaluation of the printed T2-6 FLM1 equation using the displayed ratio:

```text
Dext/dext = 168.3 / 60.3 = 2.791044776...
```

gives approximately:

```text
FLM1 = 1.2109758194
```

while the worked example publishes:

```text
FLM1 = 1.2133
```

The absolute difference is approximately `0.00232418` (~0.19%). This could arise from undisplayed source precision, a worked-example arithmetic issue, or another source detail that still requires reconciliation. The software must not silently choose either value.

Using the printed equation with displayed inputs still produces approximately:

```text
FLM2      0.20095
Lf        0.313
final LOF 0.29
```

so the final worked-example branch disposition does not change.

This is now encoded as:

```text
PUBLISHED_FLM1_ARITHMETIC_RECONCILIATION_REQUIRED
```

## 6. Official page-61 errata cross-check

The official Energy Institute correction for the T2-6 feed equation is stored separately as `AIV-EQ-T2-6-FEED-ERRATA-001` with `implementationAuthorized = false`.

At the worked-example `B = 152.207`, that corrected feed reproduces the displayed:

```text
log10(N) = 9.9026
N        = 7.99E9
```

This strengthens the T2-6 evidence but does not authorize the production chain.

## 7. Remaining qualification gaps

```text
DIRECT_EXTRACT_PINNED_EI_EXAMPLES_PDF
RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC
INDEPENDENT_SONIC_SFF6_BENCHMARK
INDEPENDENT_MULTI_SOURCE_BENCHMARK
CONTROLLED_T2_7_HUMAN_RECONCILIATION
RETAINED_WORKBOOK_RECONCILIATION
INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW
```

The earlier final-D.2.3-endpoint gap is no longer present.

## 8. Production separation

The evidence/revalidation modules:

- do not expose a production AIV calculator;
- are not imported by the pending Engineering Calculation definition;
- do not authorize PWL, attenuation, FLM, Lf or LOF execution;
- keep `productionEquationAuthorized = false`;
- preserve BLOCKED / NOT_AUTHORIZED / no-design-authority state.

Until the remaining source, arithmetic, benchmark, workbook and independent-review gates close, `VIB.AIV.ACOUSTIC` remains BLOCKED.
