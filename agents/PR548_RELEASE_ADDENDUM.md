# PR548 Release Addendum — Real HP Piping Class Workbench

## Final release intent

This addendum supersedes the implementation-state portions of `agents/PR548_workreport.md` where the product surface was described with only one reference sample.

The release candidate restores an application-style HP Piping Class workflow while retaining the canonical v2 controller/orchestrator architecture and the existing engineering-authority boundary.

```text
ACTIVE PRODUCT FLOW
Design Basis
  -> Static Wall
  -> Pressure Cycles
  -> KD Review
  -> Review Envelope

STATE / CALCULATION FLOW
HP workbench
  -> HpPipingClassProject/v2
  -> hp-piping-class-workspace-controller/v2
  -> hp-piping-class-orchestrator/v1
  -> central engineering calculation API
```

No UI-owned Chapter IX equation, native KD320 mean-stress correction, fatigue-curve life evaluator, or iframe calculation route is introduced.

## Executable reference catalog

The product now exposes three regression-backed examples derived from the existing HP orchestrator parity fixture lineage.

### 1. Baseline pressure-fatigue

```text
reference ID          NPS4_S160_PRESSURE_FATIGUE_REGRESSION
product               NPS4-S160
OD                    114.3 mm
nominal wall          13.49 mm
minus tolerance       12.5 %
allowable stress      138 MPa
design pressure       20 MPa
internal allowance    3 mm
cycle                 2 -> 20 MPa
lifetime n            500
external Seq          70 MPa
external N            10,000
CORE Salt             63.29949581051363 MPa
CORE U                0.05
```

### 2. Brownfield projected-EOL wall

```text
reference ID          NPS4_S160_BROWNFIELD_PROJECTED_EOL
measured current wall 10.2 mm
future internal loss  1.2 mm
future external loss  0.3 mm
projected EOL wall    8.7 mm
CORE Salt             63.99142829153606 MPa
external Seq          70 MPa
external N            10,000
CORE U                0.05
```

This case proves that the selected projected end-of-life wall, rather than the greenfield end-of-life wall, is used in the fatigue pressure-cycle path.

### 3. Static-fail boundary

```text
reference ID          NPS4_S160_STATIC_FAIL_REGRESSION
nominal wall          11.5 mm
minimum manufactured  10.0625 mm
pressure rating       18.20329217044084 MPa
static assessment     FAIL
fatigue               NOT_EVALUATED
```

This is an executable negative case. A calculation completing successfully is intentionally distinct from the engineering assessment passing.

## Relationship-custody hardening

The release candidate adds `tabs/hp-piping-class-workbench-state.js` so identity changes and deletions cannot silently orphan dependent domain state.

Rules now enforced in the workbench state layer:

```text
productId rename
  -> matching fatigueEvidence.productId follows

stateId rename
  -> transition from/to IDs follow
  -> matching external-result from/to IDs follow

cycleId rename
  -> matching external-result cycleId follows

transition from/to edit
  -> matching external-result state pair follows

remove product
  -> matching fatigue evidence package removed

remove transition
  -> matching external-result rows removed

remove state
  -> dependent transitions removed
  -> matching external-result rows removed
```

Adding an external evidence row selects the next uncovered governed transition rather than repeatedly cloning the first transition.

## Governed-basis custody

A governed master-store product no longer appears as a direct-input row.

The UI identifies it as:

```text
GOVERNED MASTER
```

and presents resolved OD / allowable stress / nominal wall / tolerance values as read-only calculation context. Direct engineering products remain editable. This prevents the UI from visually implying that governed master values can be overwritten locally.

Brownfield wall custody is now visible for every product:

- selected fatigue wall basis;
- measured current wall;
- future internal loss;
- future external loss;
- calculated net EOL wall;
- calculated projected EOL wall;
- selected fatigue wall passed to the fatigue calculation.

## Multi-product usability

The Pressure Cycles step has a product selector for the displayed CORE Salt result. This avoids silently treating the first product as the only class member when multiple products share the governed transient spectrum.

The KD Review step can attach external evidence to any class product that does not already have an evidence package.

## Authority boundary — unchanged

```text
calculationMode             USER_CALCULATED_KD3
Salt                        CORE calculated
Seq                         external/user supplied
N                           external/user supplied
Ui / cumulative U           CORE derived
nativeCoreKd3Qualified      false
codeCompliance              false
canUseForDesignAuthority    false
```

The examples are executable software-regression / external-evidence examples. They are not Code-qualified design examples.

## Validation evidence available in this environment

### Executed locally on authored release files

```text
JavaScript syntax checks                 PASS
pure relationship-custody helper tests  PASS
baseline frozen Salt recomputation      PASS
brownfield frozen Salt recomputation    PASS
```

The independent brownfield recomputation produced `63.99142829153609 MPa`, consistent with the frozen `63.99142829153606 MPa` value to floating-point precision.

### Full repository release gate

Authored release gate:

```text
node scripts/verify-hp-piping-class-real-workbench.mjs
```

It covers:

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

The current execution environment cannot clone/materialize the complete repository because DNS resolution for `github.com` is unavailable. GitHub Actions has not supplied a hosted run for the PR heads through the connected integration. Therefore the full exact-checkout suite and Chromium smoke must remain explicitly `NOT_RUN`, not represented as PASS.

```text
SOURCE / DIFF AUDIT                 PASS
AUTHORITY / FORMULA CUSTODY AUDIT   PASS
AUTHORED JS SYNTAX                  PASS
RELATIONSHIP HELPER EXECUTION       PASS
HOSTED FULL RELEASE GATE            NOT_RUN
FULL EXACT-CHECKOUT NODE GATE       NOT_RUN
CHROMIUM END-TO-END SMOKE           NOT_RUN
```

No failure has been observed; unavailable execution is recorded as unavailable rather than silently waived.

## Re-grounding requirement

Before merge, the final PR tree must be rebuilt on current `main` and the compare must show:

```text
behind main        0
unrelated changes  0
```

Any intervening main change touching HP Piping Class or Chapter IX calculation ownership requires re-review before merge.
