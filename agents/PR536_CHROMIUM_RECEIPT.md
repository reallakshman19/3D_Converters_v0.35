# PR536 Chromium Receipt — HP Piping Class I4 Native Shell

## Runtime

```text
Chromium: 144.0.7559.96
Engine: real Chromium DOM/JS runtime via Chrome DevTools Protocol
Desktop viewport: 1440 x 1100
Mobile viewport: 375 x 900
Runtime exceptions: 0
```

The exact committed source blobs were injected into `about:blank` for browser execution because normal localhost/file navigation is restricted in this environment. ESM `export`/`import` syntax was mechanically removed only for runtime injection; function and UI logic were unchanged.

Exact source blobs:

```text
converters/b313-chapter-ix/hp-piping-class-project.js
  bc89a69ce65a9a19224505e664551b8302644f16

tabs/hp-piping-class-tab.js
  07db4d2a414f6912e5c9762b65b38ab1122c8b04
```

## Assertions

```text
1.  native root exists                                      PASS
2.  initial root has no iframe                              PASS
3.  five native panels render                               PASS
4.  fail-closed authority badges render                     PASS
5.  v2 readiness is visible                                 PASS
6.  Legacy compatibility contains no iframe before open     PASS
7.  explicit legacy open creates exactly one iframe         PASS
8.  legacy iframe retains exact historical entry point      PASS
9.  Class Matrix native placeholder renders                 PASS
10. mobile root remains contained                           PASS
11. mobile metrics use single-column layout                 PASS
12. valid v2 project drives shell summary                   PASS
```

Result:

```text
ASSERTIONS = 12
PASS = 12
FAIL = 0
Runtime.exceptionThrown = 0
```

## Valid v2 state vector

The browser also rendered a schema-valid project with:

```text
projectId = P1
classId = HP-CS-001
revision = A
B31.3 edition = 2024
VIII-3 edition = 2025
product = NPS4-S160
outside diameter = 114.3 mm
allowable stress = 138 MPa
nominal wall = 13.49 mm
minus tolerance = 12.5 %
fatigue wall basis = END_OF_LIFE_EFFECTIVE
```

The native shell displayed:

```text
Class = HP-CS-001
Products = 1
v2 setup = Complete
```

This demonstrates that the visible summary is driven by `HpPipingClassProject/v2` rather than hard-coded shell text.

## Authority boundary

This receipt validates I4 browser behavior only. It does not promote the unresolved parent numerical gate.

```text
PR535 REAL_ADAPTER_NUMERICAL_PARITY = NOT_RUN
I4 CALCULATION EXECUTION = NOT WIRED
nativeCoreKd3Qualified = false
codeCompliance = false
canUseForDesignAuthority = false
```
