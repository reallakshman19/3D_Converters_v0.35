# PR484 — SBC T3 Non-Curve Master Recovery

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED
PR_HEAD_OBSERVED: 1e374d14e6fe442b6b6f7690278d8f566a355653
REPORT_BASIS_HEAD: 1e374d14e6fe442b6b6f7690278d8f566a355653
MAIN_HEAD_LAST_CHECKED: 36748e381012bb52ba720cc288101948115721bb
MERGE_BASE: 36748e381012bb52ba720cc288101948115721bb
REPORT_SYNC: CURRENT
APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-PR484-003
CURRENT_STAGE: Stage 5 — exact-Git validation / handover — COMPLETE
CURRENT_BLOCKER: CONTROLLED_SOURCE_RECONCILIATION_REQUIRED
HIGHEST_RISK: promoting secondary-source EI candidates without exact controlled-Git reconciliation or mixing later figure digitization into this PR
EXACT_NEXT_ACTION: leave PR #484 frozen; continue issue #450 in a separate Figures T3-1...T3-4 digitization PR. If controlled DocumentEvidence becomes reachable, reconcile these non-curve rows separately without adding chart data here.
```

Work intent: `VALIDATE / HANDOVER`
Criticality: `ENGINEERING_CRITICAL`
PR: #484
Branch: `agent/vibration-t3-sbc-tables`
Source issue: #450
Base: `main@36748e381012bb52ba720cc288101948115721bb`
PR state: `DRAFT / OPEN / MERGEABLE / UNMERGED / MERGE NOT AUTHORIZED`
Coordination: `SAFE`

## Handover in 60 Seconds

- Five non-curve EI AVIFF T3 SBC master families are now represented as governed candidates: geometry scores, location scores, fitting span factors, first-span limits, and between-main-lines limits.
- All seven engineering/test artifacts are byte-identical to the branch-visible Git blobs and the focused suite passes 7/7.
- Geometry: 35 exact Flowchart T3-3 source rows across fitting type, branch length, valve/flange category, parent schedule, and minimum SBC diameter; `LOFGEOM` is the arithmetic mean of five scores.
- Location: 13 Flowchart T3-9/C.1.10 rows plus precedence rules; D.6 Bend 0.9 + Schedule 40 0.7 independently reproduces `LOFLOC=0.8`.
- Table T3-1 fitting span factors: 15 exact fitting rows.
- Tables T3-2/T3-3: eight exact SBC-size rows each.
- D.5 independently reproduces `LOFGEOM=0.66`; D.7/D.8 independently reproduce the 0.7/0.2 minimum-span dispositions.
- Project `CRF-4-1/.../SBC.xls` is deliberately `NOT_USED_AS_EI_SOURCE`; observed older MTD/JIP lineage and EI-documented method changes make filename similarity insufficient for authority.
- Figures T3-1...T3-4 are explicitly excluded. No curve point, interpolation, or fit exists in this PR.
- Controlled EI DocumentEvidence reconciliation remains `NOT_RUN / BLOCKED_ENVIRONMENT`.
- No production SBC calculator/resolver, workflow, dependency, active-master publication, or authority promotion was added.

## Exact artifact identities

```text
geometry scores      c51598394189cdcb613cbd0876a1cd3176d99bbf
location scores      02c6be2025b7536c784c915dc3d1b029e9b5ec37
fitting span factors 1c21cd7c856cd9656c50aeb0c6a0d5fc1e0dd319
first-span limits    9da7aa1b4df520ad000bae4a034da2460a899629
between-main limits  86dd78e684c3497ae968c69abf276cc69ccb07f1
provenance receipt   3a0823184f8bf2b698c204d5076183fa6a5ff17e
focused test         b8ad2c430c5f01e927a0c53361874c3979604e4d
implementation head  1e374d14e6fe442b6b6f7690278d8f566a355653
```

## Source / authority state

Controlled source:
```text
repository = reallaksh19/Common
commit     = fb549185b9b27edc2379734240320a85c5bef9f6
path       = EI - AVIFF Guidelines 2nd Edition.pdf
blob       = 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
size       = 10348594
execution  = BLOCKED_ENVIRONMENT
```

Secondary EI locators used for navigation/reconciliation:
```text
geometry scoring     = Flowchart T3-3 printed page 74 + Appendix C
location scoring     = Flowchart T3-9 printed page 80 + Appendix C.1.10
fitting span factors = Table T3-1 printed page 81
first span limits    = Table T3-2 printed page 81
between-main limits  = Table T3-3 printed page 82
```

Project workbook disposition:
```text
repository = reallaksh19/CRF-4-1
commit     = 68dc8e1fa2ef67073c59b3afc56f1bf40953d535
path       = Extended calc2/AIV FIV/SBC.xls
blob       = 69c02f600f84647ececdbf08e1f86fc8dc3fc723
size       = 91648
status     = NOT_USED_AS_EI_SOURCE
```

Authority/publication remains:
```text
engineeringAuthority  = NONE
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
masterValuesPublished = false
publicationState      = CANDIDATE
qualificationStatus   = NOT_QUALIFIED
qualificationBlocker  = CONTROLLED_SOURCE_RECONCILIATION_REQUIRED
```

## Key source semantics retained

Geometry:
- arithmetic mean of five scores;
- branch-length bands are non-overlapping machine bands preserving source `up to` boundaries;
- valve/flange scoring separates `< ANSI 900` from `>= ANSI 900`;
- between listed pipe schedules, use the lower standard schedule;
- unknown geometry fails `NOT_READY`.

Location:
- fixed support within +/-2D overrides other location candidates;
- otherwise select highest applicable non-fixed location score; otherwise Mid Span;
- unknown main-line LOF yields assessment LOF 1.0 and `LOFLOC=1`;
- known main-line LOF >=1 yields `LOFLOC=1`; otherwise average location and parent-schedule scores;
- unknown location fails `NOT_READY`.

Span rules:
- fitting-factor handling for later maximum-span curves is `actual span / factor`;
- fitting-factor handling for minimum-span tables is `actual span * factor`;
- modified span below minimum => geometry component 0.7; at/above => 0.2;
- Figures T3-1...T3-4 remain excluded and `curveDataIncluded=false`.

## Validation Ledger

| Check | STATUS | OBSERVATION | ORACLE | Basis / limitation |
|---|---|---|---|---|
| live main / PR grounding | PASS | REMOTE_EXECUTION | NONE | main unchanged at `36748e38...`; PR mergeable/draft |
| branch-visible Git blob identities | PASS | ARTIFACT_INSPECTION | NONE | all seven SHA-1s match local validated bytes |
| geometry/source-row recovery | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | secondary EI copies; controlled object still pending |
| location/rule recovery | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | secondary EI copies |
| T3-1/T3-2/T3-3 row recovery | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | secondary EI copies |
| exact-Git focused regression | PASS 7/7 | LOCAL_EXECUTION | AUTHORITATIVE_REFERENCE + IMPLEMENTATION_COUPLED | executed against local bytes whose Git blob hashes match branch blobs |
| D.5/D.6/D.7/D.8 source examples | PASS | LOCAL_EXECUTION + SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | independent source expected values |
| changed-file audit | PASS | REMOTE_EXECUTION | NONE | exactly report + seven planned artifacts = 8 files |
| inline review threads | PASS | REMOTE_EXECUTION | NONE | zero threads |
| GitHub commit status contexts | NOT_RUN | REMOTE_EXECUTION | NONE | GitHub returned zero contexts |
| controlled DocumentEvidence reconciliation | NOT_RUN | NOT_OBSERVED | AUTHORITATIVE_REFERENCE | provider/PDF unavailable |
| active publication / authority | NOT_APPLICABLE | NOT_OBSERVED | AUTHORITATIVE_REFERENCE | outside current scope |

Numerical note: JS floating representation produced `0.6599999999999999` for the exact D.5 arithmetic; the regression uses an explicit `1e-12` representation tolerance. No source value or engineering expected value was altered.

## Changed-File Ledger

| File | Purpose | Engineering-sensitive | Validation |
|---|---|---:|---|
| `agents/PR484_workreport.md` | recovery/handover | yes | current |
| `docs/Masters/Vibration/ei-aviff-t3-sbc-geometry-scores.candidate.csv` | Flowchart T3-3 scores | yes | PASS 7/7 |
| `docs/Masters/Vibration/ei-aviff-t3-sbc-location-scores.candidate.csv` | T3-9/C.1.10 scores | yes | PASS 7/7 |
| `docs/Masters/Vibration/ei-aviff-t3-sbc-fitting-span-factors.candidate.csv` | Table T3-1 | yes | PASS 7/7 |
| `docs/Masters/Vibration/ei-aviff-t3-sbc-first-span-limits.candidate.csv` | Table T3-2 | yes | PASS 7/7 |
| `docs/Masters/Vibration/ei-aviff-t3-sbc-between-main-lines-limits.candidate.csv` | Table T3-3 | yes | PASS 7/7 |
| `ValidationRecords/VibrationMasters/ei-aviff-t3-sbc-non-curve-candidate-v1.json` | provenance/rules/authority | yes | PASS 7/7 |
| `tests/vibration-t3-sbc-non-curve-candidate.test.mjs` | focused independent/replay regression | yes | PASS 7/7 |

## Appendix A — Implementation Takeover Qualification

`APPENDIX_A_STATUS: CURRENT`

Any future mutation in #484 must re-ground and prove exact controlled source lineage without introducing curve data. The legitimate remaining mutation is controlled-source reconciliation only; T3 figure digitization belongs in a separate PR.

## Next-Agent Handover

Do not redo the five non-curve source families or 7/7 validation.
Do not add Figures T3-1...T3-4 to this PR.
If controlled EI DocumentEvidence becomes reachable, reconcile these rows/rules and update qualification state only from that evidence.
Otherwise keep #484 draft/open/unmerged and continue with a separate figure-digitization PR.

Handover readiness: `READY`.
No merge is authorized.
