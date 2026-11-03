# PR500 — User Engineering Data fallback for blocked vibration masters

## Recovery header

- Source task: Owner direction following #450 / merged #484/#485
- PR / branch: `#500` / `agent/vibration-user-engineering-data`
- Base at allocation: `main@638af071b70d4b27676ba385004382aa0a5a35e6`
- Current tested implementation head before this report: `73c72b83c75666ce57b8aaeae0984d44f1d638ef`
- Work intent: IMPLEMENT
- Criticality: ENGINEERING_CRITICAL
- Execution mode: AUTO
- Recovery state: CONTINUE
- Coordination: COORDINATION_REQUIRED; no exact-file overlap with active #499/#480/#483
- Merge authority: OWNER_ONLY / NOT AUTHORIZED

## Mission

Replace vibration master-data dead ends with an explicit, fail-closed **User Engineering Data** path. When a governed vibration master is unavailable, a user may enter the required project-specific value/table row in a separate Vibration Integrity tab. User entries remain project evidence and never become silent engineering-master, screening, or design authority.

First concrete data template: SBC T3 Figures T3-1...T3-4. Generic blocker IDs also cover valve-transient, cavitation/flashing, thermowell, reciprocating/PD, rotating-stall, advanced deadleg, corrugation and slug-flow data.

## Implemented capability

### Core resolver

`converters/vibration/user-engineering-data.js`

- `VibrationUserEngineeringData.v1` contract;
- explicit `USER_SUPPLIED_PROJECT_INPUT` authority metadata;
- known blocked-data catalogue plus support for caller-defined blocker IDs;
- exact mechanism/blocker/scope/record/X/Y matching;
- available governed master always takes precedence;
- no nearest-row lookup;
- no interpolation or extrapolation;
- no automatic unit conversion;
- missing exact row -> `NOT_READY`;
- duplicate exact rows -> `AMBIGUOUS`;
- invalid matching row -> `INVALID_USER_DATA`;
- numeric blockers require finite numeric values;
- every usable row requires `sourceReference`.

### User Engineering Data tab

The visible Vibration Integrity product now has:

```text
Screening workspace | User Engineering Data
```

The User Engineering Data table exposes:

```text
Mechanism
Data blocker
Scope / assessment
Record key
X
X unit
Y
Y unit
Value
Unit
Source / basis
Notes
```

Actions:

- `Add row`
- `Add SBC T3-1…T3-4 rows`

The SBC action adds four empty explicit rows only. It does not seed numerical answers.

### Authority boundary

```text
user evidence class   = USER_SUPPLIED_PROJECT_INPUT
engineeringAuthority  = NONE
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
masterDataAuthority   = false
```

An available governed value always outranks user data. This PR does not activate SBC or any other blocked mechanism calculation by itself.

## Coordination / protected boundaries

Unchanged:

- FIT equations, empirical correlations and active #499 implementation paths;
- AIV equations, .eit semantics and current AIV authority;
- `docs/Masters/Vibration/*` candidate/source files;
- `docs/Masters/Vibration/source-register.json`;
- PR #480 SBC source-recovery branch;
- PR #483 vibration master framework branch;
- workflow files and dependencies.

The shared FIT/VIB release manifest was deliberately not edited because #499 currently owns that integration surface.

## Changed-file ledger

```text
agents/PR500_workreport.md                              added
converters/vibration/user-engineering-data.js           added
tabs/vibration-integrity-tab.js                         modified
tabs/vibration-integrity-user-data-model.js             added
tabs/vibration-integrity-user-data-shell.js             added
tabs/vibration-integrity-user-data-view.js              added
tests/vibration-user-engineering-data.test.mjs          added
```

The pre-PR WIP report is retired after this numbered report is committed.

## Backup / rollback evidence

Repository backup CLI:

```text
node utils/backup.js save tabs/vibration-integrity-tab.js ...
```

was `NOT_RUN / connector-only runtime` because there is no repository checkout in this environment.

Exact pre-edit Git blob retained as rollback evidence:

```text
tabs/vibration-integrity-tab.js
646113c43ec790625bb8ac09242eb506c8f09259
```

Only five net source lines were added and two removed from that existing controller; all substantial capability lives in new modules.

## Module-size boundary

```text
converters/vibration/user-engineering-data.js        184 lines
tabs/vibration-integrity-user-data-model.js          106 lines
tabs/vibration-integrity-user-data-shell.js           97 lines
tabs/vibration-integrity-user-data-view.js            71 lines
tabs/vibration-integrity-tab.js                      299 lines
```

All are below 300 physical lines at the checked checkpoint.

## Validation ledger

### PASS — executed bounded local reconstruction

The current environment cannot resolve `github.com`, so an authenticated/full repository checkout could not be created. Exact new-module source was reconstructed locally and executed with Node.

```text
node --check converters/vibration/user-engineering-data.js        PASS
node --check tabs/vibration-integrity-user-data-model.js           PASS
node --check tabs/vibration-integrity-user-data-view.js            PASS
node --check tabs/vibration-integrity-user-data-shell.js           PASS
focused resolver/model/view execution                              PASS
```

Executed behavior included:

```text
governed-master precedence      PASS
exact user-data resolution      PASS
X mismatch -> NOT_READY         PASS
duplicate exact rows -> AMBIGUOUS PASS
SBC four-row template           PASS
no numerical template defaults PASS
editable table validation       PASS
visible user-data rendering     PASS
```

Oracle class: synthetic hand-authored independent contract expectations. No retained EI numerical target is used to construct an expected answer.

### PASS — source/GitHub reconciliation

Before PR creation:

```text
base      638af071b70d4b27676ba385004382aa0a5a35e6
status    ahead
behind    0
net files 7
```

### NOT_RUN

```text
repository-native tests/vibration-user-engineering-data.test.mjs  NOT_RUN
full FIT/VIB release suite                                        NOT_RUN
real-browser tab/edit behavior                                    NOT_RUN
```

These are not claimed as PASS.

## Known limitation / next dependency

SBC remains `NOT_IMPLEMENTED` in the mechanism matrix. PR #500 intentionally establishes the safe project-input boundary only.

The next stacked SBC implementation may consume:

- merged #484 non-curve candidate rules/tables as non-authoritative candidate evidence;
- exact user-entered T3 curve results through `resolveBlockedVibrationData()`;
- existing worked-example D.5-D.8 evidence as independent validation constraints.

It must retain `engineeringAuthority=NONE`, `screeningAuthority=NOT_AUTHORIZED`, `designAuthority=false` until source/master qualification is separately closed.

## Appendix A — CURRENT takeover gate

### A1 Production trace — 19/20

Trace the visible input route from `tabs/vibration-integrity-tab.js` through `vibration-integrity-user-data-shell.js` to the user-data table and from a future calculator request through `resolveBlockedVibrationData()`. Prove that governed master precedence cannot be bypassed.

### A2 Failure isolation — 20/20

Reproduce one missing-row, one exact-row, one duplicate-row and one invalid-numeric-row case. Expected states are `NOT_READY`, `RESOLVED_USER_INPUT`, `AMBIGUOUS`, and `INVALID_USER_DATA` respectively.

### A3 Authority / invariant — 20/20

Prove that no user-data state sets engineering/screening/design/master authority and that no automatic interpolation, extrapolation, nearest-match or unit conversion exists.

### A4 Independent validation — 18/20

Run the committed focused test from a clean exact PR head and verify its expected results are hand-authored contract expectations rather than production-derived values. Then run the relevant shared release suite after coordination with #499.

### A5 Minimal next patch — 19/20

If continuing to SBC, create a stacked/independent SBC calculation slice that reads project-input curve values through the resolver without modifying PR #500's authority contract or active vibration master/source branches.

**Qualification threshold retained: 96/100; minimum 18/20.**

## EXACT_NEXT_ACTION

Continue AUTO MODE with a separate SBC calculation slice: trace the EI T3/D.5-D.8 combination logic from current repository evidence, define the minimal SBC request/result contract, consume exact T3 user values through PR #500's resolver, validate against independent worked-example constraints, and open a stacked draft PR. Do not merge either PR without Owner authorization.
