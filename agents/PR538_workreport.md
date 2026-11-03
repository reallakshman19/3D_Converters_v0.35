# PR538 Work Report — HP Piping Class I5 Native Editors + Review Calculation Wiring

## Mission

Implement I5 on top of the native shell from PR #536:

```text
#535 I1-I3  canonical project/orchestration/parity seam
#536 I4     native top-level shell
#538 I5     native editors + review calculation wiring
```

PR #538 is stacked on `agent/hp-piping-class-i4-native-shell` and must not be merged independently of its parents.

## Product architecture

The HP Piping Class user-facing state is now `hp-piping-class-project/v2` rather than the legacy calculator DOM.

Native editors cover:

- project/class/revision identity;
- B31.3 and VIII-3 edition identity;
- design pressure and service allowances;
- class product rows;
- direct engineering input or governed basis package mode;
- nominal/current/future wall custody;
- fatigue wall basis selection;
- transient spectrum, operating states, and governed transitions;
- per-product external `USER_CALCULATED_KD3` evidence;
- external Seq/N and optional Salt cross-check value;
- Code/edition/method/calculation provenance;
- independent checker identity and timestamp.

The UI contains no Chapter IX pressure-wall equation, pressure-stress equation, Miner formula, fatigue curve evaluator, or native KD320 implementation.

## Workspace controller

New module:

```text
tabs/hp-piping-class-workspace-controller.js
```

Responsibilities:

```text
v2 draft custody
local persistence
schema validation
canonical orchestrator invocation
stale-result invalidation
JSON import/export normalization
authority-promotion rejection
```

The controller calls:

```text
evaluateHpPipingClassProject(...)
```

and does not implement a parallel engineering calculator.

## Authority gate

The controller rejects a returned result if either the top-level or any product row does not retain:

```text
calculationMode = USER_CALCULATED_KD3
nativeCoreKd3Qualified = false
codeCompliance = false
canUseForDesignAuthority = false
```

Rejected promotion state:

```text
AUTHORITY_PROMOTION_BLOCKED
```

The native UI visibly states:

```text
CORE KD-3 · NOT QUALIFIED
DESIGN AUTHORITY · FALSE
REVIEW ONLY
```

## Persistence semantics

Editable v2 state is stored under:

```text
format-converters.hpPipingClass.project.v2
```

Calculation results are not persisted into the project record. Any project mutation clears the previous calculation result so stale evidence cannot remain visually authoritative after an input change.

## Exact source blobs

```text
tabs/hp-piping-class-workspace-controller.js
  e7bbfe541ca102a1f106252b5bf38276c587080b

tabs/hp-piping-class-tab.js
  324d35c064ca67888671bbc066432b6f415efce2

tests/hp-piping-class-workspace-controller.test.mjs
  d318b09789e3d47a00762996971fe4a382324ef9

tests/hp-piping-class-native-editors.test.mjs
  967e9556c36150bfd65a3cc56400c5e6154291f3

scripts/verify-hp-piping-class-i5-native-editors.mjs
  2f8d4ab78c763a50b7034f76482ddcf3319a49f9

tabs/engineering-workspace-tab.js
  59be36fd3494fc5f0bf4d1290819a704e55c1ce3
```

## Executed validation

### Native editor architecture

```text
6 tests
6 PASS
0 FAIL
```

Checks include:

- v2 workspace/controller ownership;
- native editor coverage;
- absence of engineering equations/native KD-3 in UI;
- visible review-only authority;
- lazy legacy workspace;
- I5 module cache-busting in the parent Engineering workspace.

### Workspace controller

```text
6 tests
6 PASS
0 FAIL
```

Checks include:

- local persistence and restore;
- calculation results not persisted;
- invalid project blocks evaluator invocation;
- schema-valid project reaches evaluator;
- top-level and product-level authority promotion rejection;
- edits clear stale calculations;
- v2 JSON round-trip and unsupported-schema rejection.

The controller test executed the exact controller/test blobs. A Node ESM loader substituted unavailable repository dependencies in this environment, so this receipt validates controller behavior, not Chapter IX numerical parity.

### Chromium interaction

See `agents/PR538_CHROMIUM_RECEIPT.md`.

```text
Chromium 144.0.7559.96
17 assertions
17 PASS
0 FAIL
0 Runtime.exceptionThrown
```

The browser exercised real DOM event paths for native basis/product/fatigue editing, persistence, result rendering, stale-result invalidation, legacy lazy loading, and mobile containment. Project/evaluator dependencies were substituted for browser injection only; numerical adapter parity is not inferred from this receipt.

## Verification command

```bash
node scripts/verify-hp-piping-class-i5-native-editors.mjs
```

This command intentionally runs the complete I1-I5 test chain, including:

```text
tests/hp-piping-class-orchestrator-parity.test.mjs
```

Therefore a normal repository checkout remains required before promotion.

## Unresolved parent qualification gate

```text
PR535 REAL_ADAPTER_NUMERICAL_PARITY = NOT_RUN in this environment
```

Container network access to GitHub is blocked and connector-generated repository events have not produced an Actions run. This is not a numerical PASS or FAIL.

I5 product code does call the real canonical orchestrator in the repository. Until the parent parity command executes on a normal checkout, all surfaced results remain explicitly review-only.

## Out of scope

- removal of the remaining legacy compatibility workspace;
- migration of the docs CSV/TSV master runtime to the canonical master store;
- authority-package v2 replacement;
- component qualification matrix;
- system-analysis obligation integration;
- native CORE KD320;
- Code compliance or design-authority promotion.

## Merge authority

```text
PR_STATE = DRAFT
MERGE_AUTHORITY = OWNER_ONLY / NOT_GRANTED
```
