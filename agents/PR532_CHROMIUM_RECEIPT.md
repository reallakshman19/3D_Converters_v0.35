# PR532 — Chromium Verification Receipt

## Scope

This receipt verifies the canonical `USER_CALCULATED_KD3` browser module added by PR #532. It does **not** qualify native KD320 mathematics and does not promote Code/design authority.

```text
PR: 532
BRANCH: agent/hp-user-calculated-kd3-integration
MODE: USER_CALCULATED_KD3
NATIVE_CORE_KD320: NOT_QUALIFIED / BLOCKED
CODE_COMPLIANCE: FALSE
DESIGN_AUTHORITY: FALSE
```

## Browser environment

```text
Chromium: 144.0.7559.96
Engine: real Chromium DOM/JS runtime through Chrome DevTools Protocol
Viewport checks: 1440x1100 desktop, 375x900 mobile
```

The execution environment applies an enterprise browser policy that blocks normal navigation to `localhost`, `file:` and `data:` URLs. Therefore the exact repository source blobs were injected into an `about:blank` Chromium document through DevTools rather than served by URL.

This is an execution-environment limitation, not an application failure.

## Exact-source custody

Before browser execution, the reconstructed files were checked with `git hash-object`. Every hash matched the PR #532 GitHub blob SHA:

```text
pressure-stress.js                       c6846bc39ce0440c8c90fd5bb5f275039c8b5246
cycle-stress.js                          cc7e9f7a2217e8479ff8d61c61ebe8bed78d5580
transient-spectrum.js                    04651e2baa49f74a2c022c5100e2eec1f7b08c69
cumulative-damage.js                     4d1680e398abc9b8508c9a31c9b7f5bd605b4020
user-calculated-fatigue.js               a56fa92ca5419091e76e60a90593f40b5985784b
user-calculated-fatigue-exchange.js      5ba41d03deaf66b5622e8bdcb27b2c487be70d2a
user-calculated-fatigue-evidence-bridge.js
                                           8499abd6f6754f7f094d1f96bea12b5b84103072
user-calculated-fatigue-product.js       91c5b24843fe3981d6620b5681f3976036266a94
user-calculated-fatigue-product.css      ed3ba74c59dd70c74cdcbd914519dfe52ccae668
```

The DevTools harness preserved module isolation while exposing only each module's declared exports to the next layer. No calculation expression was substituted with a test-only implementation.

## Functional browser vectors

Two rows were exercised at the same wall:

```text
D = 114.3 mm
effective wall = 8.80375 mm

C1:
  PA = 5 MPa
  PB = 30 MPa
  n  = 10000
  external Seq = 95 MPa
  external N   = 20000

C0 zero-damage vector:
  PA = 15 MPa
  PB = 15 MPa
  n  = 25000
  external Seq = 0
  N = null / N/A
```

For C1 Chromium reproduced:

```text
CORE Salt = 87.9160 MPa (display precision)
Ui = 0.500000
cumulative U = 0.500000
review state = CHECKED / NOT AUTHORIZED
```

For C0 Chromium displayed:

```text
CORE Salt = 0.0000 MPa
Seq = 0
N = N/A / disabled
Ui = 0.000000
review state = ZERO DAMAGE
```

## Assertions

Final Chromium execution:

```text
21 assertions
21 PASS
0 FAIL
0 Runtime.exceptionThrown events
```

Covered behaviors:

1. canonical surface created;
2. native `CORE KD-3 — Not Qualified` alternative remains disabled;
3. legacy fatigue matrix hidden from the review surface;
4. wall × cycle rows render;
5. CORE Salt executes in-browser;
6. user Salt MATCH state;
7. positive-damage Ui derivation;
8. checked result remains explicitly `NOT AUTHORIZED`;
9. explicit zero-damage state;
10. zero-damage Ui = 0;
11. zero-damage N disabled / N/A;
12. cumulative Miner summary;
13. evidence bridge row collection;
14. zero-damage evidence preserves N = null;
15. user Salt mismatch fails closed as `USER_SALT_MISMATCH`;
16. normalized calculator/checker identity collision fails closed as `USER_FATIGUE_CHECKER_NOT_INDEPENDENT`;
17. JSON export serialize/parse round-trip path;
18. CSV export serialize/parse round-trip path;
19. evidence bridge restore of all rows;
20. provenance uses native `details/summary` interaction;
21. exchange actions remain semantic button controls.

## Responsive check

At 375 px viewport:

```text
form grid columns = one column
product surface client width = 335 px
table wrapper client width = 333 px
table wrapper scroll width = 1386 px
table minimum width = 1350 px
overflow-x = auto
horizontal table scroll = TRUE
wrapper contained within product surface = TRUE
```

The wide engineering table intentionally scrolls horizontally on small viewports rather than compressing numeric/provenance fields into unreadable widths.

## Interpretation

This receipt closes the previously missing **browser execution evidence for the canonical PR #532 module path**.

It does not replace the repository-wide Node suite or hosted CI. GitHub Actions remains separately blocked by zero-step/no-runner infrastructure on observed runs.

```text
CHROMIUM_CANONICAL_MODULE_STATUS = PASS
CHROMIUM_ASSERTIONS = 21/21
CHROMIUM_RUNTIME_EXCEPTIONS = 0
FULL_REPOSITORY_NODE_SUITE = NOT_RUN IN THIS ENVIRONMENT
HOSTED_ACTIONS = INFRASTRUCTURE_BLOCKED / ZERO_STEP
NATIVE_KD320_AUTHORITY = NOT_QUALIFIED
```

## Promotion boundary

No result in this receipt authorizes:

- native KD320 mean-stress correction;
- native ASME fatigue-curve evaluation;
- Code compliance;
- design authority;
- general VIII-3 multiaxial/non-pressure fatigue.

The next engineering activity is the independent KD-3 qualification/oracle dataset, isolated from production execution.