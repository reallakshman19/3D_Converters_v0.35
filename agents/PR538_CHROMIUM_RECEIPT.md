# PR538 Chromium Receipt — HP Piping Class I5 Native Editors

## Runtime

```text
Chromium: 144.0.7559.96
Engine: real Chromium DOM/JS runtime via Chrome DevTools Protocol
Desktop viewport: default headless desktop
Mobile viewport: 375 x 900 with viewport meta
Runtime.exceptionThrown observed: 0
```

Normal localhost/file navigation is unavailable in this environment, so source was executed by injecting the exact I5 tab/controller logic into `about:blank` through CDP. ESM import/export syntax was mechanically removed for injection only. Because `about:blank` denies `localStorage`, a storage-compatible in-memory object was substituted at the controller boundary for the browser receipt.

The project-model and orchestrator dependencies were substituted with deterministic review-only browser fixtures. Therefore this receipt validates the **UI/controller interaction contract**, not Chapter IX numerical parity.

Exact I5 source blobs represented by the browser logic:

```text
tabs/hp-piping-class-workspace-controller.js
  e7bbfe541ca102a1f106252b5bf38276c587080b

tabs/hp-piping-class-tab.js
  324d35c064ca67888671bbc066432b6f415efce2
```

## Browser assertions

```text
 1. native root exists                                      PASS
 2. no initial iframe                                      PASS
 3. review calculate button exists                         PASS
 4. transient identities persisted                         PASS
 5. external KD3 custody persisted                         PASS
 6. draft persisted                                        PASS
 7. schema complete after edits                            PASS
 8. canonical evaluator called once                        PASS
 9. evaluated product identity preserved                   PASS
10. result rendered CALCULATED_NOT_AUTHORIZED / REVIEW ONLY PASS
11. fatigue cumulative usage mapped to 0.500000             PASS
12. DESIGN AUTHORITY FALSE visible                          PASS
13. edit clears stale calculation                           PASS
14. legacy workspace remains lazy                           PASS
15. explicit legacy open creates one iframe                 PASS
16. mobile form uses single-column layout                   PASS
17. mobile root remains contained                           PASS
```

Result:

```text
ASSERTIONS = 17
PASS = 17
FAIL = 0
Runtime.exceptionThrown = 0
```

## Edited browser vector

The interaction path built the following v2 state through actual input/click events:

```text
projectId = P1
classId = HP-CS-001
revision = A
B31.3 edition = 2024
VIII-3 edition = 2025

design pressure = 20 MPa
internal allowance = 3 mm
external allowance = 0 mm

productId = NPS4-S160
basis mode = DIRECT_ENGINEERING_INPUT
OD = 114.3 mm
allowable stress = 138 MPa
nominal wall = 13.49 mm
minus tolerance = 12.5 %
fatigue wall basis = END_OF_LIFE_EFFECTIVE

spectrumId = S1
design life = 20 years

LOW  = 5 MPa / 40 C / 40 C
HIGH = 30 MPa / 40 C / 40 C

cycleId = C1
LOW -> HIGH
n = 10000
category = PROCESS_CYCLE

external KD-3:
locationId = BORE_INNER_SURFACE
user Salt = 87.9159664 MPa
Seq = 95 MPa
N = 20000
code = ASME BPVC VIII-3
edition = 2025
methodRef = KD-3
calculationRef = EXT-KD3-001
calculatedBy = ENGINEER_A
checkedBy = ENGINEER_B
checkedAt = 2026-08-16T05:00:00Z
```

The browser fixture returned cumulative usage `0.5`, and the native Evidence & Results panel rendered `0.500000` with `REVIEW ONLY` and `DESIGN AUTHORITY FALSE`.

## Safety/qualification boundary

This receipt does **not** establish:

```text
real Chapter IX adapter parity
native CORE KD320 qualification
Code compliance
design authority
```

Those states remain:

```text
PR535 REAL_ADAPTER_NUMERICAL_PARITY = NOT_RUN
nativeCoreKd3Qualified = false
codeCompliance = false
canUseForDesignAuthority = false
```
