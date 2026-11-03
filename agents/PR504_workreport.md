# PR504 — AIV master DB UI wiring

## Recovery header

```text
WORK_INTENT: IMPLEMENT
REPOSITORY_STATE: EXISTING_PR
MUTATION_AUTHORITY: WRITE_ALLOWED
CRITICALITY: ENGINEERING_CRITICAL
EXECUTION_MODE: MANUAL
AUTO_STATE: NOT_ACTIVE
SCOPE_AUTHORITY: LOCKED_TO_APPROVED_MISSION
PHASE_PROGRESSION: MANUAL
MERGE_AUTHORITY: OWNER_ONLY
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: HEALTHY
TAKEOVER_AUTHORITY: NOT_APPLICABLE_NEW_WORK
REPOSITORY: reallaksh19/3D_Converters
SOURCE_TASK: Owner request 2026-08-15 — upgrade target AIV data flow and wire UI to DB-creator masters
PR_OR_WIP: PR504
PR_URL: https://github.com/reallaksh19/3D_Converters/pull/504
BRANCH: agent/aiv-master-db-ui-wiring
BASE: main@0fb4be2a03aa455efe5d476c8a8ba4e82b732b95
REPORT_BASIS_HEAD: 47d5a06e07bf7cbfd29378f64bbeceec410d27dc
MAIN_HEAD_LAST_CHECKED: 0fb4be2a03aa455efe5d476c8a8ba4e82b732b95
REPORT_SYNC: CURRENT
EXACT_NEXT_ACTION: retain PR504 as draft; execute native AIV/browser acceptance when a runnable environment is available; do not merge without explicit Owner authorization
```

`REPORT_BASIS_HEAD` is the exact PR head on which hosted workflow jobs were inspected. This report synchronization commit is recovery-artifact-only and does not intentionally change production/test behavior.

## Handover in 60 Seconds

PR504 wires the AIV workspace to a **product-managed, exact-pinned DB-creator master snapshot** from:

```text
repository: reallaksh19/Advanced_Analysis
commit: dad2f1dbf8f200132c9669d275467611d51d6d3b
path: docs/EI data/AIV misc/masters
```

End users do not upload or maintain the master CSVs. Seven byte-identical files are vendored under `converters/vibration/aiv/master-data/`, auto-loaded by the AIV workspace, verified at runtime with Git blob SHA-1, structurally validated fail-closed, and used only for deterministic blank-field enrichment.

Data-origin precedence:

```text
explicit project/user value > exact-pinned master [M] > visible assumption [A]
```

The master layer is a reversible overlay. Editing an `[M]` field transfers custody to explicit project/user data. Identity/classification edits invalidate dependent master values; dataset/topology replacement removes still-master-derived values and rediscoverable rows before re-resolution.

## Current PR state

At the last live grounding:

```text
PR:       #504
state:    open
draft:    true
merged:   false
mergeable:true
main:     0fb4be2a03aa455efe5d476c8a8ba4e82b732b95
head:     47d5a06e07bf7cbfd29378f64bbeceec410d27dc
behind:   0
ahead:    34
files:    21
```

PR483 remains open/draft and owns the generic `converters/vibration/masters/*` framework. Its seven changed paths do not overlap PR504. Coordination remains required at the engineering-governance level, but there is no exact-file collision.

## Exact master identity

The owner-provided source blobs and PR504 vendored blobs match 7/7:

```text
M_COMPONENT_TYPE.csv     700f4c8da754a5ec3bc59cafd54a3581b05e5b65
M_DOCUMENT_SOURCE.csv    75894476eaddaecbcacc637a8e968dc5414d72b6
M_MATERIAL.csv           731fdd83b6f6f6ebc5ca9b964be55c508ad85ed7
M_PIPE_DIMENSION.csv     7aaee1609329f00273a40637052705eed251b30b
M_PIPING_CLASS.csv       c3c3381295b22b94354651e76af79519e44e6017
M_SOURCE_DEVICE_TYPE.csv 0019925fe1cc56945fe3a7154edefa3fb5b5dd47
M_UNIT.csv               d0364eb267d94c784a058810c5c4173cbded4d37
```

Controlled row counts:

```text
documents       15
units           27
materials       17
components      20
sourceDevices   11
pipeDimensions 137
pipingClasses   34
```

The browser loader accepts the bundled package only when each local asset hashes to its pinned source blob. Filename equality alone is insufficient.

## Implemented flow

```text
3D / topology
     |
     v
bundled exact-pinned AIV master snapshot
     |
     +--> source-device classification where deterministic
     +--> assessment candidate/type where deterministic
     +--> main OD / ID / WT where deterministic
     +--> branch OD / WT where deterministic
     +--> material / duplex where deterministic
     |
     v
explicit project / process inputs
     |
     v
visible assumptions only for remaining gaps
     |
     v
readiness -> registered AIV screening -> existing tables/charts/audit
```

## Explicit non-generation boundary

The master resolver has no population path for:

```text
Operating Case
Mass Flow
Upstream Pressure
Downstream Pressure
Upstream Temperature
Molecular Weight
Source State
Physical Distance
Applicability Disposition
Simultaneous Source Group
```

Generic topology element length is not promoted to AIV physical-distance authority. Existing flare-network explicit segment/path distance authority remains unchanged.

## Authority / engineering invariants

UNCHANGED:
- AIV equations, correlations, coefficients, and tolerances;
- registered ten-stage AIV kernel;
- readiness rules;
- qualification-mode mechanics;
- flare-network explicit engineering-distance authority;
- SVG/presentation coordinates non-authoritative for distance;
- Assessment LOF screening scope;
- Line/Case summary non-authoritative status;
- `.eit` import/export contracts;
- `designAuthority=false`.

The adapter establishes source identity and structural integrity only:

```text
engineeringQualification = NOT_ESTABLISHED_BY_ADAPTER
screeningAuthorityConferred = false
designAuthority = false
```

Known upstream DB provenance/value caveats remain upstream and are not silently repaired in this PR. The upstream validator proves structural/PK/FK/join properties, not independent qualification of every engineering value.

## Findings / decisions

- `IMP-001 CLOSED` — exact source repo/commit/path and seven Git blobs pinned.
- `IMP-002 CLOSED` — destination/source blob equality verified remotely 7/7.
- `IMP-003 CLOSED` — end-user master upload removed; master snapshot is product-managed and auto-loaded.
- `IMP-004 CLOSED` — `[M]` provenance is visible; `[A]` remains assumption origin.
- `IMP-005 CLOSED` — explicit edits remain authoritative and master overlay is reversible.
- `RISK-001 CONTROLLED` — ambiguous component/source mappings remain unresolved.
- `RISK-002 CONTROLLED` — generic topology does not invent AIV distance.
- `RISK-003 CONTROLLED` — PR483 shares governance domain but not files.
- `RISK-004 OPEN_SOURCE_DATA` — DB source engineering qualification is outside this adapter.
- `DEC-001` — AIV-specific pinned adapter avoids parallel mutation of PR483 generic registry.
- `DEC-002` — vendor exact source assets for deterministic browser availability.
- `DEC-003` — precedence is `explicit > master > assumption`.

## Recovery / backup truth

Immutable pre-edit blobs for modified existing files:

```text
tabs/vibration-aiv-qualification-tab.js d7c8b2c8af7c5ddcc062168f087bbec07e7a4df7
tabs/vibration-aiv-input-view.js        ddbd7c4692bd7a080523f68a8e11c5ac67d18c09
package.json                             e786f685b4a9673c789d1aabdde17f8a96c872c7
```

`tabs/vibration-aiv-state.js` was inspected at `021f6a89a483c0d7de820e6c59ebe35f322fe139` and not modified.

Repository backup CLI: **NOT_RUN / ENVIRONMENT_BLOCKED**. The session has connector access but no usable authenticated local checkout/`gh`; do not claim the backup command ran.

## Validation ledger

| Check | Status | Observation | Oracle | Evidence |
|---|---|---|---|---|
| current main grounding | PASS | REMOTE_EXECUTION | NONE | main `0fb4be2...` |
| branch drift | PASS | REMOTE_EXECUTION | NONE | 34 ahead / 0 behind at `47d5a06...` |
| PR mergeability | PASS | REMOTE_EXECUTION | NONE | PR504 `mergeable=true`, draft |
| PR483 exact-file overlap | PASS | SOURCE_INSPECTION | NONE | no overlapping changed path |
| source master identity | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | exact owner-provided commit/blobs |
| vendored master identity | PASS | REMOTE_EXECUTION | AUTHORITATIVE_REFERENCE | destination blobs match source 7/7 |
| module size policy | PASS | SOURCE_INSPECTION | NONE | new JS modules <300 lines |
| focused early draft checks | PASS | LOCAL_EXECUTION | IMPLEMENTATION_COUPLED | 6/6 before final auto-load pivot; not claimed as final exact-head suite |
| bundled identity Node regression | NOT_RUN | NOT_OBSERVED | AUTHORITATIVE_REFERENCE | test implemented/registered; no local runnable checkout |
| `verify:aiv-input-model` | NOT_RUN | NOT_OBSERVED | MIXED | connector-only runtime |
| `verify:aiv-screening-release` | NOT_RUN | NOT_OBSERVED | MIXED | connector-only runtime |
| `verify:aiv-canvas-release` | NOT_RUN | NOT_OBSERVED | MIXED | connector-only runtime |
| real-browser master auto-load/enrichment | NOT_RUN | NOT_OBSERVED | NONE | pending runtime acceptance |
| Topology Edit Support Reprojection hosted run | NOT_RUN | REMOTE_EXECUTION | NONE | run `31868368179`, job `94972864760`: `failure` but `steps=[]`, `runner_id=0`, empty runner name |
| Vibration AIV Controlled Source Qualification hosted run | NOT_RUN | REMOTE_EXECUTION | NONE | run `31868368151`, job `94972864501`: `failure` but `steps=[]`, `runner_id=0`, empty runner name |
| repo backup CLI | NOT_RUN | NOT_OBSERVED | NONE | ENVIRONMENT_BLOCKED |

Hosted workflow conclusions are classified **NOT_RUN / INFRASTRUCTURE_BLOCKED**, not product FAIL, because neither job was assigned a runner and neither executed a step.

No unexecuted check is represented as PASS.

## Changed-file ledger

Production/reference:
- `converters/vibration/aiv/aiv-master-db-reference.js`
- `converters/vibration/aiv/aiv-master-db.js`
- `converters/vibration/aiv/aiv-master-db-resolver.js`
- `converters/vibration/aiv/aiv-master-db-bundled.js`
- `converters/vibration/aiv/master-data/M_COMPONENT_TYPE.csv`
- `converters/vibration/aiv/master-data/M_DOCUMENT_SOURCE.csv`
- `converters/vibration/aiv/master-data/M_MATERIAL.csv`
- `converters/vibration/aiv/master-data/M_PIPE_DIMENSION.csv`
- `converters/vibration/aiv/master-data/M_PIPING_CLASS.csv`
- `converters/vibration/aiv/master-data/M_SOURCE_DEVICE_TYPE.csv`
- `converters/vibration/aiv/master-data/M_UNIT.csv`
- `tabs/vibration-aiv-master-db-controller.js`
- `tabs/vibration-aiv-master-db-view.js`
- `tabs/vibration-aiv-dataset-loader.js`
- `tabs/vibration-aiv-input-view.js`
- `tabs/vibration-aiv-qualification-tab.js`

Tests/registration:
- `tests/vibration-aiv-master-db.test.mjs`
- `tests/vibration-aiv-master-db-bundled.test.mjs`
- `tests/vibration-aiv-master-db-ui.test.mjs`
- `package.json`

Recovery:
- `agents/PR504_workreport.md`

## Appendix A — next-agent qualification

### A1 Production Trace — 19/20
Trace: topology `canonicalId/type/dnInMm/schedule/pipingClass` -> component/main-class lookup -> pipe/material master -> resolver blank-only write + source trace -> `[M]` UI badge -> assumption resolver fills only remaining blanks. Explicit table values terminate master overwrite.

### A2 Failure Isolation — 19/20
If `[M]` data is absent, isolate: local asset fetch -> Git blob verification -> structural parse -> topology availability -> semantic mapping -> piping-class match -> dimension/material resolution -> blank/explicit precedence -> UI trace. Do not touch equations or loosen readiness to conceal a join failure.

### A3 Authority / Invariant — 20/20
Master identity is not engineering-method authority. Never invent process-case values or generic-topology distance, never overwrite explicit project data, and never treat structural DB validation as screening/design qualification.

### A4 Independent Validation — 18/20
Strongest independent evidence is exact cross-repository Git-blob identity 7/7. Native Node/full AIV/browser runs are still NOT_RUN; hosted jobs are infrastructure-blocked before runner assignment.

### A5 Minimal Next Patch — 19/20
No further production mutation is currently justified without executable runtime evidence. If a runnable environment exposes a defect, patch only the isolated adapter/UI path while preserving master source bytes and all authority invariants.

**Appendix A score: 95/100; every section >=18/20.**
