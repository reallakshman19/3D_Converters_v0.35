# PR481 — T2.9 Valve Recovery Factors

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED

PR_HEAD_OBSERVED: bcb1649401131e5b6c9a89b99a5dd7d08d52c16b
REPORT_BASIS_HEAD: bcb1649401131e5b6c9a89b99a5dd7d08d52c16b
MAIN_HEAD_LAST_CHECKED: 36748e381012bb52ba720cc288101948115721bb
MERGE_BASE: 36748e381012bb52ba720cc288101948115721bb
REPORT_SYNC: CURRENT
APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-PR481-003
CURRENT_STAGE: Stage 5 — exact-Git validation / handover — COMPLETE
CURRENT_BLOCKER: CONTROLLED_SOURCE_RECONCILIATION_REQUIRED
HIGHEST_RISK: presenting secondary-publication FL rows as controlled-source-qualified values
EXACT_NEXT_ACTION: when the exact controlled EI PDF/provider becomes reachable, run #470 DocumentEvidence for T2.9.2 and reconcile the four candidate rows; otherwise make no further engineering mutation in PR #481.
```

Work intent: `VALIDATE / HANDOVER`
Criticality: `ENGINEERING_CRITICAL`
PR: #481
Branch: `agent/vibration-t29-valve-recovery-factors`
Source issue: #450
Base: `main@36748e381012bb52ba720cc288101948115721bb`
PR state: `DRAFT / OPEN / UNMERGED / MERGE NOT AUTHORIZED`
Coordination: `SAFE`

## Handover in 60 Seconds

### Current truth
- #470 remains the canonical controlled-source DocumentEvidence architecture.
- #471 remains separate/frozen T2.8 work.
- Every workbook under the Owner-specified `CRF-4-1@68dc8e1.../Extended calc2` root was inventoried.
- `Extended calc2/FIV.xlsx` was decoded and proven to be T2.8 valve-transient content, not T2.9.
- The sibling `KS-PR-CAL-0089 Vibration Assessment - Cavitation & Flashing Calculation V and V.xlsx` was decoded and proven to be a `Coversheet`/`Checklist` verification shell, not a numerical FL workbook.
- No complete T2.9 FL table exists in the inspected Git workbook cells; no cell locator was invented.
- EI AVIFF 2nd edition T2.9.2 printed page 69 is independently reproduced by four secondary copies with the same rows:
  - Ball = 0.60
  - Butterfly = 0.62
  - Globe = 0.90
  - Gate = 0.60
- Candidate CSV, provenance receipt, and focused test are committed.
- Exact Git blobs pass 5/5 locally.
- Unknown valve type fails closed as `NOT_READY`.
- Candidate remains `NOT_QUALIFIED / CANDIDATE`; controlled-Git reconciliation is still required.
- No production resolver/calculator consumes this candidate.

## Exact candidate artifacts

```text
candidate CSV     d5ec83db5b778fad426accc30e8ec4f80537614b
provenance receipt df8b78af3d8e5d96e5f7fe0c00c2b74a7ef2ff4f
focused test       024e7edb0a76f8a4ef05f644f67b74b53441fd03
implementation head bcb1649401131e5b6c9a89b99a5dd7d08d52c16b
```

## Mission / acceptance disposition

Mission: recover `EI_AVIFF.T2.9.VALVE_RECOVERY_FACTORS.v1` as a governed candidate while preserving controlled-source and authority boundaries.

Completed:
1. owner-requested workbook root audited;
2. false workbook-source candidates ruled out with actual ZIP/XML evidence;
3. four literal EI T2.9.2 FL rows recovered from independent publication copies;
4. source/applicability provenance captured;
5. unknown valve behavior fail-closed;
6. independent Globe delta replay passes;
7. exact Git candidate regression passes 5/5;
8. no authority/publication/runtime integration added.

Blocked/deferred:
- exact controlled-Git DocumentEvidence reconciliation;
- final qualification/promotion;
- full T2.9 decision-logic integration, which is a separate follow-on scope.

## Source evidence

### Owner-requested workbook root
```text
repository = reallaksh19/CRF-4-1
commit     = 68dc8e1fa2ef67073c59b3afc56f1bf40953d535
root       = Extended calc2
```

### FIV workbook negative finding
```text
path = Extended calc2/FIV.xlsx
blob = bc0aedbefac54c1a2e5d643e76c047cb890bf14d
size = 154500
sharedStrings count = 179
sharedStrings CRC32 = fe58bb23
sheet5 uncompressed bytes = 136883
sheet5 CRC32 = df699df1
sheet5 title = APP C - Liquid or Multiphase Valve Opening
finding = T2.8 valve transient workbook; no T2.9/FL table label
```

### Cavitation/flashing sibling negative finding
```text
path = Enhanced stress report/extended calc/KS-PR-CAL-0089 Vibration Assessment - Cavitation & Flashing Calculation V and V.xlsx
blob = 8c6c3e9771675d9463ed15361ff0f6035dab8c87
size = 903076
workbook sheets = Coversheet | Checklist
sharedStrings count = 54
sharedStrings CRC32 = 89e74d7b
finding = verification/checklist shell; no numerical FL table in workbook cells
```

### Independent EI secondary evidence
```text
publication = Guidelines for the Avoidance of Vibration Induced Fatigue Failure in Process Pipework, 2nd edition
section = T2.9.2
printed page = 69
copies checked = 4
rows = Ball 0.60 | Butterfly 0.62 | Globe 0.90 | Gate 0.60
valve equation = delta = FL^2 * (P1 - 0.96 * Pv)
role = navigation/reconciliation only until controlled Git object executes
```

Controlled source remains:
```text
repository = reallaksh19/Common
commit     = fb549185b9b27edc2379734240320a85c5bef9f6
path       = EI - AVIFF Guidelines 2nd Edition.pdf
blob       = 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
size       = 10348594
execution  = BLOCKED_ENVIRONMENT
```

## Authority / publication state

```text
engineeringAuthority = NONE
screeningAuthority   = NOT_AUTHORIZED
designAuthority      = false
masterValuesPublished = false
publicationState      = CANDIDATE
qualificationStatus   = NOT_QUALIFIED
qualificationBlocker  = CONTROLLED_SOURCE_RECONCILIATION_REQUIRED
```

## Engineering decisions / risks

| ID | Type | Status | Summary |
|---|---|---|---|
| DEC-001 | Decision | ACCEPTED | #470 remains canonical controlled-source architecture. |
| DEC-002 | Decision | SUPERSEDED | Four rows must not be described as workbook-derived; requested workbook audit did not contain the table. |
| DEC-003 | Decision | ACCEPTED | Unknown valve type => `NOT_READY`; nearest/generic FL fallback forbidden. |
| DEC-004 | Decision | ACCEPTED | FL lookup and full cavitation/flashing decision logic are separate artifacts/scopes. |
| DEC-005 | Decision | ACCEPTED | Four EI rows are secondary-source candidate values pending exact controlled-source reconciliation. |
| RISK-001 | Risk | RESOLVED | FIV hidden-table misclassification eliminated by source inspection. |
| RISK-002 | Risk | ACTIVE | Secondary/publication copies must not be promoted to controlled authority. |

## Validation ledger

| Check | STATUS | OBSERVATION | ORACLE | Basis / limitation |
|---|---|---|---|---|
| live main/PR grounding | PASS | REMOTE_EXECUTION | NONE | current main unchanged |
| requested workbook inventory | PASS | SOURCE_INSPECTION | NONE | exact pinned Git tree |
| FIV ZIP/XML target classification | PASS | SOURCE_INSPECTION | NONE | target ruled out |
| cavitation sibling workbook classification | PASS | SOURCE_INSPECTION | NONE | target table absent |
| independent EI FL row corroboration | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | 4 secondary copies; not controlled Git object |
| exact candidate/provenance blob identity | PASS | ARTIFACT_INSPECTION | NONE | Git blob SHA-1s above |
| exact-Git focused regression | PASS 5/5 | LOCAL_EXECUTION | AUTHORITATIVE_REFERENCE + IMPLEMENTATION_COUPLED | candidate/provenance/test bytes match Git blobs |
| GitHub commit status contexts | NOT_RUN | REMOTE_EXECUTION | NONE | GitHub returned zero status contexts |
| controlled DocumentEvidence reconciliation | NOT_RUN | NOT_OBSERVED | AUTHORITATIVE_REFERENCE | provider/PDF unavailable |
| active publication / authority | NOT_APPLICABLE | NOT_OBSERVED | AUTHORITATIVE_REFERENCE | explicitly outside current authority |

Focused test coverage:
1. exactly four EI FL rows;
2. unknown valve types fail `NOT_READY`;
3. Globe `FL=0.9` reproduces `delta=11050579.7424 Pa` for the independent example;
4. negative workbook findings are preserved without invented source cells;
5. publication/authority state stays fail-closed.

Negative assurance:
- intentionally added: candidate table + provenance + focused regression;
- intentionally not added: production lookup/resolver, full T2.9 decision logic, workflows, dependencies, T2.8/T4/T3/SBC changes, authority promotion.

## Changed-file ledger

| File | Purpose | Engineering-sensitive | Validation |
|---|---|---:|---|
| `agents/PR481_workreport.md` | recovery/handover | yes | current |
| `docs/Masters/Vibration/ei-aviff-t29-valve-recovery-factors.candidate.csv` | four FL candidate rows | yes | PASS 5/5 |
| `ValidationRecords/VibrationMasters/ei-aviff-t29-valve-recovery-candidate-v1.json` | provenance / source-role / authority receipt | yes | PASS 5/5 |
| `tests/vibration-t29-workbook-candidate.test.mjs` | focused independent/replay regression | yes | PASS 5/5 |

Actual PR changed-file audit: exactly these four files.

## Appendix A — Implementation Takeover Qualification

`APPENDIX_A_STATUS: CURRENT`

Any future engineering mutation must re-ground and prove:
- exact controlled T2.9.2 evidence lineage;
- no public/workbook source is being substituted for controlled authority;
- four row values and valve equation reconcile exactly;
- unknown valve remains fail-closed;
- minimal patch does not silently introduce full decision-logic/runtime authority.

## Next-Agent Handover

Do not redo the workbook audits or secondary-source four-row recovery.
Do not add T4/T3/SBC work to this PR.
If exact controlled EI DocumentEvidence becomes reachable, reconcile the four rows and update qualification state only from that evidence.
Otherwise leave PR #481 draft/open/unmerged and continue issue #450 in a separate T4 workstream.

Handover readiness: `READY`.
No merge is authorized.
