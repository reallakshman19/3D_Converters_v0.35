# PR536 Work Report — HP Piping Class I4 Native Shell

## Intent

Introduce a native top-level **HP Piping Class** workspace without changing calculation authority.

This PR is stacked on PR #535 (`agent/hp-piping-class-i1-i3`). It must not be merged independently of its base.

## Scope

I4 only:

- replace the top-level HP iframe-only surface with a native tab shell;
- consume `hp-piping-class-project/v2` state/readiness directly;
- expose native sections for Overview, Class Matrix, Cycles & Fatigue, Evidence, and Legacy compatibility;
- retain the historical engineering-library -> authority-package -> calculator chain as a lazy compatibility panel;
- preserve all existing authority restrictions.

Not in scope:

- calculation execution from the native shell;
- product/cycle editors;
- DOM-to-v2 migration;
- master-data migration;
- authority-package v2 transport;
- native KD320;
- Code compliance or design-authority promotion.

## Architecture boundary

The native shell imports only:

```text
converters/b313-chapter-ix/hp-piping-class-project.js
```

It intentionally does **not** import the combined `hp-piping-class.js` entrypoint or the Engineering Calculation API. Calculation wiring belongs to I5 after PR #535 real-adapter parity is established.

The root HP surface contains no iframe. The historical workspace is created only after the engineer enters **Legacy compatibility** and explicitly selects **Open legacy workspace**.

## Authority

```text
calculationMode = USER_CALCULATED_KD3
nativeCoreKd3Qualified = false
codeCompliance = false
canUseForDesignAuthority = false
```

Visible shell status also states:

```text
CORE KD-3 · NOT QUALIFIED
DESIGN AUTHORITY · FALSE
```

## Verification

Command:

```bash
node scripts/verify-hp-piping-class-i4-native-shell.mjs
```

Exact committed/source blobs executed locally:

```text
tabs/hp-piping-class-tab.js                 07db4d2a414f6912e5c9762b65b38ab1122c8b04
tests/hp-piping-class-native-shell.test.mjs 2aa79bc5b2a7cdc4703b97f07fd82c2c34783729
scripts/verify-hp-piping-class-i4-native-shell.mjs 6df05a9b7cf6f5b6c4d77ef87989d6ecb7dffdc8
```

Result:

```text
native shell structural tests = 4
PASS = 4
FAIL = 0
```

Verified conditions:

1. v2 project state/readiness is consumed by the native shell;
2. root HP surface contains no iframe;
3. legacy workspace is lazy compatibility-only;
4. exact historical compatibility entry point is retained;
5. UI imports project state only, not orchestration/calculation graph;
6. native KD-3 and design authority remain visibly blocked;
7. no legacy `calculateAutomaticSeq` or fatigue-curve data route is introduced.

## Parent qualification boundary

PR #535 still has:

```text
REAL_ADAPTER_NUMERICAL_PARITY = NOT_RUN
```

A dedicated Actions workflow was added to #535, but connector-generated push/ready events produced no Actions run. This is an execution-environment limitation, not a numerical PASS or FAIL.

Therefore I4 is deliberately **state/shell-only**. The native shell does not call the orchestrator. I5 remains blocked until the real adapter parity command can execute on a real checkout:

```bash
node scripts/verify-hp-piping-class-i1-i3.mjs
```

## Merge authority

```text
PR_STATE = DRAFT
MERGE_AUTHORITY = OWNER_ONLY / NOT_GRANTED
```
