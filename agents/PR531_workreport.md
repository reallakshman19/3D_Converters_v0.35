# PR531 — Chapter IX Fatigue Foundation R3 Work Report

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: HEALTHY
WORK_INTENT: IMPLEMENT
CRITICALITY: ENGINEERING_CRITICAL
TAKEOVER_AUTHORITY: WRITE_ALLOWED
EXECUTION_MODE: AUTO
AUTO_STATE: HARD_BOUNDARY_REACHED
SCOPE_AUTHORITY: LOCKED_TO_APPROVED_MISSION
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
REPOSITORY: reallaksh19/3D_Converters
PR: 531
BRANCH: agent/hp-ch9-fatigue-foundation-r3
BASE_MAIN: f25f721dc35c30b2f7a911f31c26ccdf8a53c6ac
SOURCE_BASIS: reallaksh19/Advanced_Analysis@951798864e6f557691d0d4388368b7805e425f0d/docs/High Pr
CURRENT_STAGE: FATIGUE FOUNDATION + USER_CALCULATED_KD3 INTAKE + NATIVE KD320 VALIDATION RECORD COMPLETE
CURRENT_BLOCKER: native CORE KD320 formulation/custody is not qualified; UI/registry expansion is outside the locked PR531 scope
EXACT_NEXT_ACTION: preserve USER_CALCULATED_KD3 as the usable intake; satisfy VR-B313-CH9-KD320-NATIVE-001 evidence/gates before any native KD320 implementation or authority promotion.
```

## Mission / Current Design

Deliver straight-pipe Chapter IX pressure-cycle fatigue mechanics without inventing licensed KD-3 semantics. Independent checking may occur later, but Code/design authority is never inferred.

Implemented:
- operating-state and transition custody;
- KD-2 bore pressure stresses / Tresca intensity;
- pressure-cycle `DeltaSp` and `Salt`;
- synthetic `DIRECT_SALT_EQUAL_SEQ` route;
- log-log fatigue interpolation with strict no-extrapolation;
- zero-stress / zero-damage handling;
- Miner cumulative usage;
- straight-pipe spectrum orchestrator;
- method/route/curve/point/spectrum master resolver;
- pinned benchmark/source audit and reference runner;
- `USER_CALCULATED_KD3` result ingestion;
- optional user `Salt` cross-check against CORE;
- external `Seq` and `N` custody;
- calculator/checker provenance;
- JSON candidate verifier and authoring template;
- formal native KD320 validation record and qualification gate matrix.

Removed after research review:
- the provisional CORE arithmetic `Seq = Salt/(1-beta*sigmaMean/Sy)`;
- `yieldStrengthMpa` as a claimed KD320 correction denominator;
- hidden per-cycle mean-stress parameter execution in the spectrum path.

## Native KD320 Hard Boundary

`KD320_MEAN_STRESS_CORRECTION` now returns:

```text
KD320_CORE_ROUTE_NOT_QUALIFIED
requiredInputMode = USER_CALCULATED_KD3
reason = CONTROLLED_KD320_FORMULATION_AND_CUSTODY_NOT_ESTABLISHED
canUseForDesignAuthority = false
```

The pinned production master still resolves structurally as `PRODUCTION_EVIDENCE_PENDING`. No native production KD320 calculation is executed.

## USER_CALCULATED_KD3 Contract

For every governed transient cycle, the user supplies:

```text
cycleId                  REQUIRED
locationId               REQUIRED
fromStateId              REQUIRED and must match governed spectrum
toStateId                REQUIRED and must match governed spectrum
Seq                      equivalentAlternatingStressMpa — REQUIRED
N                        permissibleCycles — REQUIRED when Seq > 0
calculationBasis.code    REQUIRED
calculationBasis.edition REQUIRED
calculationBasis.methodRef REQUIRED
calculationBasis.calculationRef REQUIRED
calculationBasis.calculatedBy REQUIRED
```

Optional evidence fields:

```text
userAlternatingStressIntensityMpa -> cross-checked against CORE Salt
associatedMeanStressMpa           -> audit only
beta                              -> audit only
saPrimeMpa                        -> audit only
checkedBy / checkedAt             -> may be added later
```

CORE does not use `associatedMeanStressMpa`, `beta`, `saPrimeMpa`, or any yield-strength field to reconstruct `Seq`.

## Authority Custody

Per cycle:

```text
Salt authority = CORE_AND_USER_CROSSCHECKED
                 or CORE_CALCULATED_USER_NOT_PROVIDED
Seq authority  = USER_SUPPLIED
N authority    = USER_SUPPLIED
n authority    = GOVERNED_TRANSIENT_SPECTRUM
Damage         = CORE_DERIVED
```

Before independent checking:

```text
EXTERNAL_KD3_CALCULATED_NOT_CHECKED
USER_CALCULATED_NOT_INDEPENDENTLY_CHECKED
```

With distinct checker + timestamp:

```text
EXTERNAL_KD3_CALCULATED_CHECKED_NOT_AUTHORIZED
USER_CALCULATED_INDEPENDENTLY_CHECKED
```

Even the checked state retains `canUseForDesignAuthority=false` and `codeCompliance=false`.

## Salt Cross-Check Policy

If user `Salt` is supplied, CORE independently computes straight-pipe pressure-cycle `Salt` and compares using repository QA policy:

```text
type = RELATIVE
value = 1e-4
```

This is not an ASME design tolerance. Mismatch fails closed as `USER_SALT_MISMATCH`. User `Salt` remains optional.

## User Authoring Artifacts

```text
converters/b313-chapter-ix/user-calculated-fatigue.js
scripts/verify-b313-ch9-user-calculated-fatigue.mjs
engineering/hp-class-standardization/qualification/user-calculated-fatigue.template.json
```

CLI:

```text
node scripts/verify-b313-ch9-user-calculated-fatigue.mjs <candidate.json>
```

## Source Custody

Pinned High-Pr source blobs remain:

```text
method_manifest.csv      a34af2063105db4dae59003ebe77704b95541e81
fatigue_route.csv        6a7b603951c34586da292812e7e38a3a19499aae
fatigue_curve.csv        997fa0a863c9887d64472aabab1d3ac58be60ad4
fatigue_curve_point.csv  d773a01bf550e343dddf5b3ac85f328d859116f9
cycle_spectrum.csv       e972475b9b12864aea6d2b8975babe3f6b6b482c
operating_state.csv      812498264cb0de94907c34b0e076fb827a17ccdb
cycle_transition.csv     9393f7da50bc1575476af0c183834c3f6dea38e2
code_source_revision.csv 33367b2e471ccb5189327a9d06c38ac34cd72582
```

## Validation Receipt

Original R3 validation remains intact:
- pinned analytical/synthetic benchmarks PASS;
- exact pinned synthetic master execution retained `U = 1.1200262680869295 / REFERENCE_FAIL` without weakening inputs;
- production master audit remains fail-closed.

Post-research correction focused suite:

```text
22 tests
22 PASS
0 FAIL
```

Coverage includes native KD320 hard block, external `Seq + N`, state/cycle binding, optional Salt cross-check, mismatch rejection, mandatory provenance, checker collision rejection, checked/not-checked evidence states, zero damage, and file verifier.

Exact tested Git blobs:

```text
fatigue-equivalent.js               99ef93cc82ba447467bbe246a390727628954476
fatigue-spectrum.js                 f035dee53ccdcb09c2872bf2b1fcf4f9a79f31c8
user-calculated-fatigue.js          07e173707a105556057f8ada81ea53f24386b144
fatigue-foundation.test.mjs         b01f49ea3f6e2401be2b256d32b31c72eaf55647
user-calculated-fatigue.test.mjs    a98769a49c7f68f8b4746b2953cabee15a2c1259
```

## Native KD320 Validation Record

Record:

```text
engineering/hp-class-standardization/qualification/KD320_NATIVE_CORE_VALIDATION_RECORD.md
```

Disposition:

```text
record_id = VR-B313-CH9-KD320-NATIVE-001
disposition = NOT_QUALIFIED_FAIL_CLOSED
native_execution = BLOCKED
authority = NOT_ESTABLISHED
permitted_interim_path = USER_CALCULATED_KD3
```

The record freezes the qualification package required before native CORE KD320 can be implemented or released:

- `E01-E12` mandatory evidence package covering controlled B31.3/VIII-3 custody, semantic extraction, mean-stress definition and parameters, fatigue-curve custody, material/temperature rules, applicability envelope, independent numerical oracles, negative testing, checker, and release authorization;
- `G0-G6` qualification gates from source custody through explicit authority release;
- independent benchmark matrix `KD320-BM-01` through `KD320-BM-12` including zero range, mean-stress branches, curve exact/interpolation/no-extrapolation cases, Miner spectrum, applicability boundary, edition mismatch, and missing/ambiguous parameter blocks;
- immutable benchmark-record format and user-calculated oracle admission rules;
- change-control and independent approval/sign-off requirements.

The validation record explicitly treats the provisional project-spec KD320 expression as non-authoritative until the exact controlled licensed method semantics and custody are independently reconciled. The validation-record commit changes documentation only; it does not modify calculation behavior, relax any blocker, or promote authority.

## Final Reconciliation Receipt

After the correction implementation and native KD320 validation-record addition:

```text
base main = f25f721dc35c30b2f7a911f31c26ccdf8a53c6ac
native KD320 validation-record commit = 998522160455d46a363514cf9d64c42bd284769e
```

No `.github/workflows/*`, UI/runtime, package script, or central registry files are changed by the native KD320 validation-record addition.

## Validation Truth

PASS:
- live grounding / overlap classification;
- exact pinned-source hash reconstruction;
- source-supported pressure-cycle mechanics;
- pinned independent benchmark regressions;
- synthetic master audit/execution;
- native KD320 fail-closed behavior;
- `USER_CALCULATED_KD3` focused suite 22/22;
- exact branch-blob identity for tested changed files;
- formal native KD320 validation/evidence/gate/benchmark record created;
- base main re-read before validation-record mutation.

NOT_RUN / NOT_ESTABLISHED:
- complete private-repo native suite: NOT_RUN / environment limitation;
- native CORE KD320 controlled formulation/custody: NOT_ESTABLISHED;
- licensed curve independent custody: NOT_ESTABLISHED;
- native KD320 independent numerical benchmark qualification: NOT_RUN / NOT_ESTABLISHED;
- independent engineering qualification: deferred / NOT_ESTABLISHED;
- Code/design authority: NOT_ESTABLISHED.

## Protected Invariants

- no authority promotion;
- no hidden engineering defaults;
- no fatigue-curve extrapolation;
- no tolerance weakening;
- no oracle regeneration;
- no native KD320 calculation from guessed semantics;
- optional mean-stress fields remain audit-only;
- user `Seq/N` provenance is explicit;
- controlled licensed text is not copied into the open repository;
- source custody and numerical benchmark qualification remain separate gates;
- no component/class qualification from straight-pipe mechanics;
- no workflow mutation;
- no merge without explicit owner authorization.

## Handover in 60 Seconds

PR531 provides a usable user/external KD-3 result pathway while native CORE KD320 remains fail-closed. `VR-B313-CH9-KD320-NATIVE-001` now defines the exact evidence package, qualification gates, benchmark matrix, oracle custody, change control, and sign-off needed to cross that boundary. Users may continue supplying externally calculated `Seq` and `N`; CORE binds them to governed cycles, optionally reproduces `Salt`, and derives Miner damage. Keep PR531 draft/unmerged until explicit owner merge authorization.
