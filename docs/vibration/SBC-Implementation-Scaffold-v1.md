# SBC Implementation Scaffold v1

Issue: #563  
Family gate: #429  
Type-3 evidence/source work: #514  
Public calculation ID: `VIB.SBC.SMALL_BORE`

## Purpose

This scaffold exists so a future agent can implement SBC without inventing architecture or confusing code presence with engineering authority.

The scaffold is intentionally executable only as a **fail-closed placeholder**. It must not return an SBC LOF while lifecycle state is `RESERVED`.

## Capability lifecycle convention

```text
RESERVED -> QUALIFIED -> ACTIVE -> DEPRECATED
```

### RESERVED

- API/UI slot exists.
- implementation seams and required evidence are machine-readable.
- numerical engineering execution is forbidden.
- adding a function does not change authority.

### QUALIFIED

- bounded method specification is frozen;
- required controlled source trace is complete;
- B1 published/adopted benchmark evidence passes;
- independent B2 benchmark evidence passes;
- all material branches/boundaries are covered.

`QUALIFIED` does not by itself mean normal production execution is authorized.

### ACTIVE

- capability is registered for the explicitly approved production authority scope;
- production execution is allowed;
- authority wording must match the separate qualification/authority contract.

### DEPRECATED

- retained for traceability/migration;
- not selected for new production work;
- reactivation requires a separately governed policy, not an ad-hoc state reversal.

## SBC architecture reserved by this scaffold

```text
SBC_CONNECTION
  -> validate connection/context
  -> resolve qualified EI main-line assessment
  -> classify/confirm Type 1/2/3/4
  -> resolve type-specific inputs and qualified masters
  -> run the qualified type kernel
  -> assess SBC result and required actions
  -> return immutable evidence + authority
```

The main-line input contract is intentionally explicit:

```text
sourceContract = QUALIFIED_EI_MAIN_LINE_ASSESSMENT
fitOnlyAccepted = false
assessmentCompletenessRequired = true
```

A future implementation must not substitute FIT LOF alone for the EI main-line assessment.

## Fill-in-the-blanks implementation slots

### Type 1

```text
reserved file: converters/vibration/sbc/type1/reserved.js
future kernel: converters/vibration/sbc/type1/calculate-type1.js
future export: calculateSbcType1
B1 oracle: EI Appendix D5
B2: at least one independent Type-1 engineering family
```

Before replacing the reserved function:

- [ ] freeze Type-1 applicability/classification trace;
- [ ] freeze equations/tables/selection rules;
- [ ] freeze D5 expected intermediates/final values;
- [ ] freeze independent B2 expected values;
- [ ] add branch/boundary/unit tests;
- [ ] update the manifest only after evidence review.

### Type 2

```text
reserved file: converters/vibration/sbc/type2/reserved.js
future kernel: converters/vibration/sbc/type2/calculate-type2.js
future export: calculateSbcType2
B1 oracle: EI Appendix D6
B2: at least one independent Type-2 engineering family
```

Use the same evidence sequence as Type 1. Do not reuse Type-1 semantics merely because data shapes look similar.

### Type 3

```text
reserved file: converters/vibration/sbc/type3/reserved.js
future kernel: converters/vibration/sbc/type3/calculate-type3.js
future export: calculateSbcType3
B1 oracle: EI Appendix D7
B2: at least one independent Type-3 engineering family
additional evidence issue: #514
```

Additional hard stops:

```text
SBC_T3_CURVES_BLOCKED_SOURCE_DATA_CONFLICT
EXISTING_TYPE3_CANDIDATE_NOT_PRODUCTION_AUTHORITY
```

Existing `type3-combination.js` and candidate/master-assisted modules are salvage/evidence candidates only. Reuse requires source trace + D7 + independent B2 qualification.

D7 is a benchmark oracle. Never tune/digitize curves until D7 passes.

### Type 4

```text
reserved file: converters/vibration/sbc/type4/reserved.js
future kernel: converters/vibration/sbc/type4/calculate-type4.js
future export: calculateSbcType4
B1 oracle: EI Appendix D8
B2: at least one independent Type-4 engineering family
```

## Agent workflow

For one Type at a time:

```text
1. open #563 + #429 and the type-specific evidence issue if present
2. re-ground current main and active overlapping PRs
3. freeze controlled source/trace items
4. create independent benchmark oracle files BEFORE production math
5. implement the pure type kernel
6. run B1 + B2 + branch/boundary regressions
7. update type slot evidence/status
8. only after all Type 1-4 branches are qualified, build common SBC router/assessment
9. promote public definition to QUALIFIED in a separate reviewed change
10. activate production authority only in a later explicit ACTIVE transition
```

## Forbidden shortcuts

Do not:

- change `RESERVED` directly to `ACTIVE`;
- activate a type because its function now exists;
- use production output to populate expected benchmarks;
- count unit/UI/API parity as the independent B2 family;
- activate quarantined Type-3 curves;
- treat Type-3 completion as complete SBC Type 1-4 coverage;
- use FIT alone as the SBC main-line authority;
- return `safe`, `pass`, or design approval from the reserved scaffold;
- add an LOF field to reserved results.

## Public UI behavior while RESERVED

The Engineering Calculation catalogue remains visible so users/agents can discover the intended capability. It must show a blocked/reserved reason pointing to #563 and #429 and expose no execution mode.

This is intentional: **visible placeholder, unavailable engineering execution**.

## Promotion checklist

`RESERVED -> QUALIFIED` requires, at minimum:

- [ ] SBC method specification frozen;
- [ ] Type 1 D5 + independent B2 pass;
- [ ] Type 2 D6 + independent B2 pass;
- [ ] Type 3 D7 + independent B2 pass;
- [ ] Type 4 D8 + independent B2 pass;
- [ ] all material type branches/boundaries covered;
- [ ] required masters qualified or explicitly fail-closed;
- [ ] main-line assessment contract qualified;
- [ ] required-action/result semantics qualified.

`QUALIFIED -> ACTIVE` is a separate authority decision and must not be bundled with material equation/master changes.
