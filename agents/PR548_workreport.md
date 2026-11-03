# PR548 Work Report — HP Piping Class Real Workbench Recovery

## Recovery header

```text
WORK_INTENT: HP_PIPING_CLASS_UI_PRODUCT_RECOVERY
CRITICALITY: ENGINEERING_CRITICAL
REPOSITORY: reallaksh19/3D_Converters
BASE_AT_PR_CREATION: main@9ac255a0664e54fb9ac6c6decb2a5adec8eeceec
BRANCH: agent/hp-ui-real-workspace-recovery
PR: #548
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
```

## User-reported regression

The user reported that the earlier HP Piping Class interface looked like a real engineering application and used real samples, while the current native v2 surface was dominated by placeholders/mock-like empty fields.

The audit confirmed a genuine product-experience regression:

- the older HP workspace used a five-step engineering workflow and a populated reference example;
- the I5 native surface correctly moved state/orchestration ownership out of the iframe/legacy calculator, but presented the domain primarily as generic state-editor cards;
- fresh/uninitialized use therefore appeared empty and schema-centric even though the canonical calculation path and executable regression data already existed.

## Architectural decision

Do **not** restore the old nested iframe or UI-owned engineering formulas.

Recover the product experience on top of the safe v2 architecture:

```text
HP real workbench
    -> HpPipingClassProject/v2
    -> hp-piping-class-workspace-controller/v2
    -> hp-piping-class-orchestrator/v1
    -> central engineering calculation API
```

Authority remains:

```text
Salt                        CORE calculated
Seq                         USER / external KD-3
N                           USER / external KD-3
Ui / U                      CORE derived
native CORE KD320           NOT_QUALIFIED / BLOCKED
codeCompliance              false / NOT ESTABLISHED
canUseForDesignAuthority    false / NOT ESTABLISHED
```

## Canonical real sample

New module:

```text
tabs/hp-piping-class-reference-samples.js
```

Reference ID:

```text
NPS4_S160_PRESSURE_FATIGUE_REGRESSION
```

The sample is copied from the existing executable fixture:

```text
tests/hp-piping-class-orchestrator-parity.test.mjs::directProject
```

Inputs:

```text
project                HP-PROJ-001
class                  HP-CS-001
product                NPS4-S160
OD                     114.3 mm
nominal wall           13.49 mm
minus tolerance        12.5 %
allowable stress       138 MPa
design pressure        20 MPa
internal allowance     3 mm
external allowance     0 mm
spectrum               HP-CS-001-SPECTRUM
LOW state              2 MPa / 40 °C
HIGH state             20 MPa / 200 °C
cycle                  C1 LOW -> HIGH
lifetime cycles n      500
external Seq           70 MPa
external N             10,000
external calc ref      HP-FAT-EXT-001
calculated by          ENGINEER_A
checked by             ENGINEER_B
```

Frozen canonical outputs:

```text
pressure wall                    7.7103934983403475 mm
required minimum wall           10.710393498340348 mm
required nominal wall           12.240449712388969 mm
minimum as-manufactured wall    11.80375 mm
effective net/fatigue wall      8.80375 mm
pressure rating                 23.086120852009273 MPa
CORE cycle Salt                 63.29949581051363 MPa
external Seq                    70 MPa
external N                      10,000
applied n                       500
CORE Ui / cumulative U          0.05
engineering state               REVIEW_COMPLETE_NOT_AUTHORIZED
```

These values are not rendered as hard-coded result cards. The sample object is passed through the same controller/orchestrator used by ordinary HP projects.

## Product surface

New active renderer:

```text
tabs/hp-piping-class-workbench-tab.js
```

Workflow:

```text
1 Design Basis
2 Static Wall
3 Pressure Cycles
4 KD Review
5 Review Envelope
```

### First-use behavior

If there is no supplied project and no persisted meaningful HP project, the workbench:

1. creates the NPS4 canonical reference project;
2. calls the real workspace controller;
3. runs `calculate({ includeEvidence: true })`;
4. opens with actual populated engineering results.

Existing meaningful stored/supplied project state is not automatically overwritten.

An explicit `Load NPS4 reference sample` action is also provided.

### Design Basis

Provides class identity, method editions, pressure/allowance inputs and pipe-product matrix.

### Static Wall

Displays orchestrator results for each product:

- pressure-design wall;
- required minimum wall;
- required nominal wall;
- minimum as-manufactured wall;
- pressure rating;
- effective wall;
- static PASS/FAIL;
- engineering state.

### Pressure Cycles

Provides editable state/transition tables and renders calculated pressure range and CORE Salt from the actual fatigue result.

### KD Review

Shows the custody chain:

```text
CORE pressure states
    -> CORE Salt
    -> External Seq
    -> External N
    -> CORE Σ n/N
```

Seq/N and provenance remain editable external evidence. No native KD320 execution is introduced.

### Review Envelope

Shows class-level/product-level static/fatigue status, selected fatigue wall, cumulative usage, basis mode and review-only authority.

## Active-route change

`tabs/engineering-workspace-tab.js` now loads:

```text
./hp-piping-class-workbench-tab.js?v=20260816-hp-real-workbench-1
```

instead of the I5 generic native editor module.

The prior `tabs/hp-piping-class-tab.js` remains in source for compatibility/reference, but is not the active Engineering -> HP Piping Class route.

## Formula / authority custody

The new workbench deliberately contains no:

```text
Math.exp
Math.log
calculateAutomaticSeq
interpolateFatigueLife
parseFatigueCurvePoints
requiredPressureWall implementation
pressureRating implementation
iframe construction
```

All engineering results come from the controller snapshot calculation.

## Regression tests

### New

```text
tests/hp-piping-class-real-workbench.test.mjs
```

Proves:

- sample validates as v2 project;
- authority flags remain false;
- real orchestrator reproduces frozen NPS4 static values;
- CORE Salt reproduces 63.29949581051363 MPa;
- U reproduces 0.05;
- Seq/N remain external;
- five-step workbench exists;
- sample auto-load invokes controller calculation;
- active workspace imports the new workbench;
- active workbench has no local engineering equations or iframe.

### Updated

```text
tests/hp-piping-class-native-editors.test.mjs
```

Now tests the active workbench while retaining an isolation check for the prior compatibility renderer.

### Release gate

```text
node scripts/verify-hp-piping-class-real-workbench.mjs
```

Runs:

```text
hp-piping-class-real-workbench.test.mjs
hp-piping-class-workspace-controller.test.mjs
hp-piping-class-native-editors.test.mjs
hp-piping-class-orchestrator-parity.test.mjs
b313-chapter-ix-user-calculated-fatigue-product.test.mjs
hp-piping-class-master-controller.test.mjs
hp-piping-class-master-ownership.test.mjs
hp-piping-class-legacy-kd3-hard-block.test.mjs
```

Dedicated workflow:

```text
.github/workflows/hp-piping-class-real-workbench.yml
```

## Execution evidence

Before PR creation:

```text
branch Actions run                  NONE
local exact-branch clone            NOT_RUN
reason                              container DNS cannot resolve github.com
```

The workflow was added before PR #548 was opened. A PR-triggered run must therefore be inspected and recorded separately; no PASS is claimed in this report until GitHub produces the run.

## Main-branch operational correction

During setup, a connector action accidentally created this temporary file directly on `main`:

```text
tabs/hp-piping-class-reference-sample.js
content: // placeholder
commit: 63cfbb1a3b1d11781908bcc4294553356eddd2a4
```

It was identified immediately, disclosed, and deleted from `main` before feature implementation continued:

```text
revert/delete commit: 9ac255a0664e54fb9ac6c6decb2a5adec8eeceec
```

There is no surviving placeholder file or functional tree change from that mistake. The feature branch was then created from the restored main tree and all actual UI work was confined to the feature branch.

## Current changed-file ledger

```text
.github/workflows/hp-piping-class-real-workbench.yml       HP-only workflow
scripts/verify-hp-piping-class-real-workbench.mjs          HP-only release gate
tabs/engineering-workspace-tab.js                          HP subtab import line only
tabs/hp-piping-class-reference-samples.js                  canonical executable sample
tabs/hp-piping-class-workbench-tab.js                      new active product UI
tests/hp-piping-class-native-editors.test.mjs              active-route regression
tests/hp-piping-class-real-workbench.test.mjs              real-sample/workbench regression
agents/PR548_workreport.md                                  this report
```

No AIV/FIT/FEM engineering implementation is changed by PR #548.

## Qualification truth

```text
HP v2 state/orchestrator architecture      PRESERVED
NPS4 real executable sample                IMPLEMENTED
app-like five-step native workflow         IMPLEMENTED
UI-owned engineering equations             NONE ADDED
legacy iframe active route                 NO
native CORE KD320                          NOT QUALIFIED / BLOCKED
code compliance                            NOT ESTABLISHED
design authority                           NOT ESTABLISHED
merge authorization                        NOT GRANTED
```

## Appendix A — next-agent expert questionnaire

Before changing this PR, the next agent should be able to answer:

1. Why is the NPS4 sample considered executable regression evidence rather than a design example with Code authority?
2. Which layer owns straight-pipe static arithmetic?
3. Which layer owns pressure-cycle Salt?
4. Why must Seq and N remain external in this PR?
5. What exact value must the NPS4 2→20 MPa pressure cycle reproduce for CORE Salt?
6. What exact cumulative usage must the current sample reproduce and why?
7. Why is restoring the old iframe/formula ownership prohibited even though its UX was better?
8. Which authority flags must remain false regardless of UI polish?
9. What happens to calculation custody when project state is edited?
10. How does the controller prevent result authority promotion?
11. Why must governed master-store state remain separate from a visually realistic sample?
12. What evidence is required before claiming the PR release gate PASS?
