# KD320 Q1 — Controlled Semantic Contract and Evidence Ledger

## Purpose

Q1 creates the controlled qualification contract that must be completed before any native CORE KD320 arithmetic is written or any pending native KD-3 oracle case receives expected `Seq` / permissible-cycle values.

Q1 is **qualification infrastructure only**.

```text
native CORE KD320          NOT QUALIFIED / BLOCKED
native arithmetic in Q1    PROHIBITED
production kernel in Q1    PROHIBITED
fatigue-curve evaluator     PROHIBITED
Code compliance             FALSE / NOT ESTABLISHED
design authority            FALSE / NOT ESTABLISHED
```

## Public-source identity recheck

On 2026-08-16 the official ASME public product pages were rechecked for edition/scope identity only:

- ASME B31.3-2024 is the target piping edition and the public page identifies High Pressure Fluid Service Fatigue Analysis at K302.3/K304.8.
- ASME BPVC Section VIII Division 3 is available in the 2025 edition as the high-pressure vessel standard.

These public pages are **not** admitted as equation, symbol-semantic, fatigue-curve, or numerical oracles. Controlled licensed source custody remains mandatory.

## Q1 artifacts

### `source-receipts.json`

Creates two controlled-source receipt slots:

```text
Q1-SRC-B313-2024
Q1-SRC-VIII3-2025
```

A receipt may be promoted to `CONTROLLED_RECEIPT_VERIFIED` only with:

```text
secure storage reference
document SHA-256
exact source locators
verifier identity + timestamp
independent checker identity + timestamp
```

Verifier and checker must be different normalized identities.

Licensed source text or copied curve data must not be committed to this public repository. If engineering semantic descriptions are later published here, they must be license-approved paraphrases; otherwise the public contract should retain only controlled references/hashes and the semantic detail must remain in the secure evidence system.

### `semantic-contract.json`

Defines 14 mandatory semantic questions without answering them. The inventory covers:

1. B31.3 invocation and routing conditions;
2. stress-state / plane / component / pair selection;
3. alternating-stress quantity consumed by the controlled route;
4. associated controlled mean-stress quantity;
5. compression / negative / zero-mean treatment;
6. correction parameters and material dependencies;
7. equivalent alternating-stress result semantics and limits;
8. fatigue-curve family/identity selection;
9. interpolation, endpoint and extrapolation policy;
10. permissible-cycle result and boundary handling;
11. material/environment/temperature selection;
12. geometry, wall-state, loading and applicability envelope;
13. limit/singular/missing/ambiguous fail-closed behavior;
14. evidence and review custody for a native result.

Every item starts:

```text
status                  PENDING_CONTROLLED_SOURCE
exactSourceLocator      null
engineeringDefinition   null
units                    null
signConvention           null
selectionRule            null
interpolationRule        null
applicabilityRule        null
prohibitedDefault        NO_DEFAULT
independentlyChecked     false
```

This is intentional. Q1 does not infer controlled Code semantics from project masters, old calculator code, internet summaries, or the production implementation.

### `evidence-ledger.json`

Carries E01-E12 and G0-G6 forward from `KD320_NATIVE_CORE_VALIDATION_RECORD.md`, while separating qualification into three layers:

```text
METHOD_QUALIFICATION
        ↓
SOFTWARE_QUALIFICATION
        ↓
PRODUCT_RELEASE
```

Passing Q1 can at most authorize **Q2 independent oracle completion**. It cannot authorize a native production kernel and cannot enable design authority.

## Required human/source work to close Q1

### Step 1 — source officer / implementer

For B31.3-2024 and VIII-3-2025:

- reconcile the exact controlled document bytes;
- calculate/confirm the document SHA-256;
- record secure storage custody;
- record exact paragraph/figure/table/definition locators required by the method;
- do not copy restricted source text into the public repository.

### Step 2 — semantic extraction

Using only the controlled sources, complete each `KD320-SEM-*` item with the required engineering meaning, units, sign treatment, selection/interpolation/applicability rules and explicit prohibited/default behavior.

A project-specification expression or legacy code path is not accepted as a source of truth.

### Step 3 — independent checker

A different engineer independently checks:

- source edition and hash;
- exact locators;
- all semantic definitions;
- branch conditions and exclusions;
- fatigue-curve custody;
- material/temperature rules;
- applicability envelope;
- fail-closed requirements.

Q1 is complete only after E01-E08 and G0-G1 are explicitly PASS with checker custody.

## Q1 exit effect

Even after Q1 is completed:

```text
nativeCoreKd3Qualified       false
production native KD320      still prohibited
canUseForDesignAuthority     false
```

The only promotion is:

```text
Q2_INDEPENDENT_ORACLE_COMPLETION = ALLOWED
```

Q2 may then populate the 14 pending native oracle cases from independent expected-value sources. Expected values must be frozen before they are compared to future production code.

## Verification

Run:

```bash
node scripts/verify-b313-ch9-kd320-q1.mjs
```

The gate executes:

- existing KD-3 oracle audit;
- Q1 semantic/source/evidence audit;
- existing independent-oracle tests;
- Q1 contract tests.

The Q1 audit imports only qualification tooling. It does not import production converters, the central calculation registry, the HP workspace controller, or the legacy calculator.
