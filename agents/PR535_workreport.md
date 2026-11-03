# PR535 — HP Piping Class I1–I3 Work Report

## Status

```text
PR                    #535
WORK_INTENT            IMPLEMENT
CRITICALITY            ENGINEERING_CRITICAL
SCOPE                  HP Piping Class integration I1-I3
BASE                    main@63e07cdf71d815b38eb559ee663dd3f2c438f478
CODE_HEAD               8ff90865c65f70942ff797441d3a6665700e9ca9
HANDOVER_READINESS      READY_WITH_NUMERICAL_PARITY_GATE
UI_CHANGED              NO
IFRAME_CHANGED          NO
LEGACY_APP_JS_CHANGED   NO
NATIVE_KD320            NOT_QUALIFIED / BLOCKED
CODE_COMPLIANCE         FALSE / NOT_ESTABLISHED
DESIGN_AUTHORITY        FALSE / NOT_ESTABLISHED
MERGE_AUTHORITY         OWNER_ONLY / NOT_GRANTED
```

## Mission

Implement the first integration seam identified by the HP Piping Class audit before changing the visible product shell:

```text
I1  HpPipingClassProject/v2 canonical product state
I2  public central Engineering Calculation API orchestration
I3  frozen legacy-reference -> canonical parity harness
```

The independent KD-3 qualification/oracle work remains a qualification-layer concern and is not called by the production HP Piping Class orchestrator.

## I1 — canonical project state

New contract:

```text
hp-piping-class-project/v2
```

Canonical state includes:

- project/class/revision identity;
- B31.3 / VIII-3 method identity;
- canonical engineering units;
- class design pressure and service allowances;
- product rows;
- explicit product calculation-basis mode;
- explicit fatigue wall-state basis;
- governed transient spectrum/states/transitions;
- per-product external USER_CALCULATED_KD3 evidence.

Supported product basis modes:

```text
DIRECT_ENGINEERING_INPUT
GOVERNED_BASIS_PACKAGE
```

`DIRECT_ENGINEERING_INPUT` is a migration/parity bridge for the current HP calculator inputs. `GOVERNED_BASIS_PACKAGE` is the target master-resolver route.

Supported fatigue wall bases:

```text
END_OF_LIFE_EFFECTIVE
PROJECTED_END_OF_LIFE
```

Brownfield projected-EOL selection requires measured current wall plus explicit future internal/external loss custody.

Authority is immutable/fail-closed at this stage:

```text
calculationMode             USER_CALCULATED_KD3
nativeCoreKd3Qualified      false
codeCompliance              false
canUseForDesignAuthority    false
```

The schema rejects attempts to promote those fields.

## I2 — public central API orchestration

Production entry point:

```text
converters/b313-chapter-ix/hp-piping-class.js
```

Production orchestrator:

```text
converters/b313-chapter-ix/hp-piping-class-orchestrator.js
```

The orchestrator imports the public central API only:

```text
converters/engineering-calculations/index.js
  -> calculateEngineering(...)
```

It does not instantiate a private calculation registry and does not import Chapter IX adapters directly.

Calculation IDs used:

```text
PIPE.B313.CH9.RESOLVE_BASIS
PIPE.B313.CH9.STRAIGHT_PRESSURE
PIPE.B313.CH9.STRAIGHT_PRESSURE_FROM_BASIS
PIPE.B313.CH9.WALL_STATE
PIPE.B313.CH9.FATIGUE_USER_CALCULATED
```

No engineering formula is implemented in the HP orchestrator.

The result contract deliberately separates:

```text
calculationOk      calculation/API execution state
engineeringState   engineering disposition
```

Therefore a valid calculation returning a static reference failure is not misclassified as a solver failure.

Representative engineering states:

```text
CALCULATION_BLOCKED
FATIGUE_BLOCKED
STATIC_REFERENCE_FAIL
STATIC_EVALUATED_FATIGUE_NOT_SUPPLIED
FATIGUE_REVIEW_EXCEEDS_UNITY
REVIEW_COMPLETE_NOT_AUTHORIZED
```

Absence of fatigue evidence is represented explicitly as `NOT_EVALUATED`; malformed/supplied fatigue evidence that fails canonical evaluation blocks the product.

## I3 — parity harness

Tests:

```text
tests/hp-piping-class-project-schema.test.mjs
tests/hp-piping-class-orchestrator-contract.test.mjs
tests/hp-piping-class-orchestrator-parity.test.mjs
```

Verification entry point:

```text
node scripts/verify-hp-piping-class-i1-i3.mjs
```

The parity suite freezes current legacy NPS 4 numerical outputs instead of re-implementing the production legacy equations in a second test calculator.

Frozen direct reference:

```text
D                                  114.3 mm
P                                  20 MPa
S                                  138 MPa
ci                                 3 mm
co                                 0 mm
minus tolerance                    12.5%
nominal wall                       13.49 mm
pressure design thickness          7.7103934983403475 mm
required minimum thickness         10.710393498340348 mm
required nominal thickness         12.240449712388969 mm
minimum as-manufactured wall       11.80375 mm
effective net wall                 8.80375 mm
pressure rating                    23.086120852009273 MPa
static reference                   PASS
Salt for 2 -> 20 MPa cycle         63.29949581051363 MPa
```

The parity suite also declares:

- governed-basis synthetic resolver/static reference;
- brownfield projected-EOL wall selection (`8.7 mm`);
- pressure-cycle Salt at that projected wall (`63.99142829153606 MPa`);
- static engineering failure distinct from calculation failure;
- static-only class with fatigue explicitly not evaluated;
- production source prohibition on direct adapter imports, DOM/UI imports, private registry creation, legacy static formulas and native KD-3 helpers.

## Validation performed

### Exact schema execution

Exact GitHub blobs reconciled to the execution workspace:

```text
hp-piping-class-project.js                  bc89a69ce65a9a19224505e664551b8302644f16
hp-piping-class-project-schema.test.mjs     556583a3012b7cab24931d2f86ecfffbf0594b6f
```

Result:

```text
5 tests
5 PASS
0 FAIL
```

### Exact orchestration contract execution

Exact production orchestrator blob after public-API refactor:

```text
hp-piping-class-orchestrator.js             6e21d9d549d54d79188aa016963e7ed7b2df5ae0
hp-piping-class-orchestrator-contract       ebb3f3278d66f96d00a835bb74b559e529e40f13
```

The contract suite was executed with a Node ESM loader that substituted only the unavailable `engineering-calculations/index.js` dependency. The production orchestrator and committed test were exact GitHub blobs.

Result:

```text
5 tests
5 PASS
0 FAIL
```

This proves orchestration request mapping, product-state semantics, failure semantics and authority non-promotion. It is not represented as real numerical central-adapter parity.

### Real-adapter parity

```text
REAL_ADAPTER_NUMERICAL_PARITY = NOT_RUN
FULL_HP_SUITE                  = NOT_RUN
```

Reason: this environment does not have a native private repository checkout, and `gh` is unavailable. The full frozen-reference parity test is committed, but the real `calculateEngineering()` dependency graph has not been executed here end-to-end.

No GitHub Actions workflow run was observed for the code head at the time of this handoff. No CI PASS/FAIL is inferred.

## Production source invariants

The I1-I3 production layer must retain all of the following until a later controlled migration stage:

```text
no engineering/hp-class-standardization DOM dependency
no iframe traversal
no document/getElementById/querySelector calculation custody
no HP-owned requiredPressureWall/pressureRating formula
no calculateAutomaticSeq
no native fatigue-curve evaluator
no direct engineering-calculations/adapters import
no second private Engineering Calculation registry
nativeCoreKd3Qualified = false
codeCompliance = false
canUseForDesignAuthority = false
```

## Scope explicitly not changed

- existing HP iframe chain;
- visible `HP Piping Class` UI;
- legacy `engineering/hp-class-standardization/app.js`;
- docs CSV library workflow;
- authority-package transport;
- PR #530 static qualification candidate;
- native KD320 implementation/qualification;
- component matrix;
- system-analysis obligations.

## Next gate

Run in a real repository checkout:

```bash
node scripts/verify-hp-piping-class-i1-i3.mjs
```

Acceptance for I1-I3 freeze:

```text
project schema                    PASS
orchestration contract            PASS
real central-adapter parity       PASS
frozen legacy outputs unchanged   PASS
no authority promotion            PASS
```

Any numerical mismatch must be resolved in PR #535 before starting I4.

Only after the real-adapter parity gate passes should the next integration stage begin:

```text
I4  remove the outer HP iframe / mount the native workspace directly
```

The later iframe/UI migration must consume `HpPipingClassProject/v2`; it must not reintroduce UI-owned engineering formulas or hidden DOM synchronization as engineering state.
