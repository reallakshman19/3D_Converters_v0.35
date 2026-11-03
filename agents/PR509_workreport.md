# PR509 — EI Appendix B Shared Candidate Masters

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED
WORK_INTENT: IMPLEMENT / VALIDATE / HANDOVER
CRITICALITY: ENGINEERING_CRITICAL
PR: #509
BRANCH: agent/ei-appendix-b-stage3
BASE: agent/ei-master-pack-stage1
BASE_SHA: 9ed5acbf2e6ab20746c93650ea167e1a59893f3d
REPORT_BASIS_HEAD: 4d7ab86aebb0b7d3312171c1f978e533ffee5f10
CURRENT_MAIN_LAST_CHECKED: 0b03855a6d9031c8b531e23bdd3deea3b7fdc5d4
DEPENDENCY: PR #507 registry framework
COORDINATION: SAFE — independent of SBC PR #508
PR_STATE_AT_REPORT_BASIS: OPEN / DRAFT / MERGEABLE / UNMERGED
MERGE_AUTHORITY: NOT_GRANTED
EXACT_NEXT_ACTION: leave PR #509 draft/unmerged; if work resumes, re-ground #507/main and run repository-native focused tests before any authority or production-consumer transition
```

## Mission / Delivered Capability

Stage 3 creates shared EI AVIFF reference/default masters from the owner-pinned package:

```text
reallaksh19/Advanced_Analysis@6111ddbc0f27dd95b50a80c569a2c4daba3b3921
docs/EI data/Appendix_B_Defaults_and_Fluid_Properties.md
blob 1d26832aa3ba1e2a99f680ea3d8243490e0ffeb6
size 7972 bytes
```

Delivered six `VibrationMaster.v1` candidate families:

```text
EI_DEFAULT_PROPERTY
  liquid speed of sound at 20 C
  gas dynamic viscosity exact temperature grid
  gas molecular-weight / gamma / sonic-velocity references
  water vapor-pressure exact temperature grid

EI_METHOD_MASTER
  Appendix B.9 Reynolds-number / Dchar rule
  T2.3 mechanical-excitation baseline LOF table
```

Usable bounded candidate evaluators:

```text
calculateEiAviffReynoldsCandidate(input)
evaluateEiAviffMechanicalBaselineCandidate(sourceKeys)
```

The mechanical evaluator selects the maximum exact numeric baseline among explicit machine-source keys. Shared-support transfer remains inspection-only because its result is the explicit adjacent-line LOF, not a fixed baseline.

## Authority / default-use invariant

Pinned package governance:

```text
PROJECT_EXPLICIT > ACTIVE_EI_METHOD_MASTER > APPENDIX_B_DEFAULT
```

Encoded policy:

```text
automaticFallbackAllowed = false
explicitAcceptanceRequired = true
interpolationAllowed = false
extrapolationAllowed = false
```

All Stage-3 records remain:

```text
publicationState     = CANDIDATE
engineeringAuthority = NONE
screeningAuthority   = NOT_AUTHORIZED
designAuthority      = false
masterDataAuthority  = false
runtime activation   = false
```

PR #507's ACTIVE-only resolver is unchanged and rejects these candidates.

## Source / provenance

```text
PRIMARY
repository = reallaksh19/Advanced_Analysis
commit     = 6111ddbc0f27dd95b50a80c569a2c4daba3b3921
path       = docs/EI data/Appendix_B_Defaults_and_Fluid_Properties.md
blob       = 1d26832aa3ba1e2a99f680ea3d8243490e0ffeb6
size       = 7972

CORROBORATION
EI_AVIFF_Complete_Master_Register.md
blob = 51bca43473be8018d4ce48fb440ee4d7bd0abc82
size = 32592

GOVERNANCE
README.md
blob = 72730d065bcd2aa80976f0ad2870aafacff0bb4c
size = 3472

WORKED EXAMPLE ORACLE
EI_AVIFF_Guidelines_2nd_Edition_Examples.md
blob = c050cd90802c27241c510c6f0ac43bfaf7a89e9d
size = 99120
```

Controlled EI PDF reconciliation remains `NOT_RUN`; no authority promotion is allowed from this PR.

## Engineering semantics retained

### Reynolds number

```text
Re = rho * v * Dchar / (1000 * mu)
rho   = kg/m3
v     = m/s
Dchar = mm
mu    = Pa.s
```

Dchar rules:
- T2.6.3 deadleg -> main-pipe internal diameter;
- straight thermowell -> Dtw tip;
- tapered/stepped thermowell -> D2 tip.

Candidate evaluator rejects missing/nonpositive density, Dchar or viscosity. Zero velocity remains valid.

### Exact source grids

Gas viscosity:

```text
-50, 0, 50, 150, 250, 350, 450 C
```

Water vapor pressure:

```text
0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150 C
```

No nearest point, interpolation or extrapolation.

### Gas thermodynamic references
Molecular weight, gamma, sonic velocity and source reference temperature are retained. Steam/water vapor is a 100 C reference; other tabulated gases are 20 C references.

### T2.3 mechanical excitation
Numeric baseline families include reciprocating/PD, engine drive, screw compressor/pump, centrifugal pump, motor/alternator power bands, centrifugal compressor, gas turbine and fan/blower.

Shared-support rule:

```text
adjacent LOF threshold = 0.50
result = EQUAL_ADJACENT_LOF
```

It cannot enter the direct numeric baseline evaluator.

## Independent worked-example oracle

Pinned EI D2.4:

```text
centrifugal compressor LOF = 0.2
electric motor >15 kW LOF = 0.4
governing mechanical LOF  = 0.4
```

A dedicated regression encodes that expected result separately from the governing evaluator implementation.

## Appendix A — Implementation Takeover Qualification

```text
A1 Production Trace            20/20
A2 Current Failure Isolation   20/20
A3 Authority / Invariant       20/20
A4 Independent Validation      19/20
A5 Minimal Patch               19/20
TOTAL                           98/100
IMPLEMENTATION_AUTHORITY       GRANTED_FOR_THIS_BOUNDED_STAGE
```

## Backup / rollback evidence

Repository backup CLI:

```text
node utils/backup.js save ... = NOT_RUN
reason = connector-only runtime
```

Only existing file modified:

```text
converters/vibration/masters/index.js
pre-edit blob = 91df0169e002ec90712412c904f57ef3ff95f6f0
Stage-3 implementation blob = 9485d16977be274f6b6da60c6b32a5c5bf1a044e
```

All other implementation/test/source-evidence files are new.

## Changed-File Ledger

```text
agents/PR509_workreport.md
converters/vibration/masters/ei-aviff-appendix-b-data.js
converters/vibration/masters/ei-aviff-appendix-b-candidate.js
converters/vibration/masters/ei-aviff-appendix-b-evaluator.js
converters/vibration/masters/index.js
data/vibration/ei-aviff-2e/appendix-b-stage3-source.v1.json
tests/vibration-appendix-b-master-stage3.test.mjs
tests/vibration-appendix-b-module-boundaries-stage3.test.mjs
tests/vibration-appendix-b-worked-example-stage3.test.mjs
tests/vibration-appendix-b-evaluator-stage3.test.mjs
```

Exact parent comparison at report basis:

```text
base    = 9ed5acbf2e6ab20746c93650ea167e1a59893f3d
head    = 4d7ab86aebb0b7d3312171c1f978e533ffee5f10
ahead   = 15
behind  = 0
files   = 10
PR      = OPEN / DRAFT / MERGEABLE
```

## Validation Ledger

| Check | Status | Observation | Oracle / limitation |
|---|---|---|---|
| current main / parent grounding | PASS | GitHub inspection | main and #507 unchanged |
| active PR overlap | PASS | GitHub PR search | no Appendix-B/property-master overlap |
| pinned source identity | PASS | exact repo/commit/path/blob/size | owner-selected package |
| package governance precedence | PASS | README inspection | project data outranks defaults |
| exact source values / locators | PASS | Appendix-B source inspection | package transcription |
| consolidated package corroboration | PASS | package register inspection | package corroboration |
| EI D2.4 mechanical oracle | PASS | worked-example source inspection | 0.2 + 0.4 -> 0.4 |
| new JS <300 physical lines | PASS | branch-visible line-300 probes returned EOF | repository policy |
| ACTIVE-only runtime isolation | PASS | #507 source inspection | CANDIDATE rejection retained |
| no interpolation/extrapolation | PASS | source inspection | exact-grid only |
| exact changed-file boundary | PASS | parent/head comparison | 10 files, 15 ahead, 0 behind |
| PR mergeability / draft state | PASS | GitHub PR inspection | mergeable=true, draft=true |
| exact-head GitHub workflow runs | NOT_RUN | zero runs returned for `4d7ab86...` | no hosted execution observed |
| exact-head commit status contexts | NOT_RUN | zero statuses returned for `4d7ab86...` | no hosted execution observed |
| repository backup CLI | NOT_RUN | connector-only runtime | repository policy limitation |
| focused Node regressions | NOT_RUN | exact repository execution unavailable | committed tests present |
| complete repository-native suite | NOT_RUN | exact checkout/runtime unavailable | not claimed |
| browser acceptance | NOT_APPLICABLE | data/API-only stage | no UI changes |
| controlled EI PDF reconciliation | NOT_RUN | outside executed evidence | required before authority promotion |

## Highest Risk

Treating Appendix-B reference values as automatic engineering inputs merely because a candidate master exists. Protection: explicit default acceptance, exact-grid-only resolution, no automatic fallback, no interpolation and no runtime activation.

## Next-Agent Handover

Do not activate these masters or wire them as silent defaults. Do not infer values between Figure B-1/B-6 grid points. Do not convert the shared-support rule into a fixed LOF. Future T2.3/T2.6/T2.8/T2.9/T4 production consumers belong in separate PRs after source/qualification decisions.
