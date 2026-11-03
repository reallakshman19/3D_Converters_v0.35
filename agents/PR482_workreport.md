# PR482 — T4 Thermowell Wall Modifier

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED
PR_HEAD_OBSERVED: 6f3efd84441b0a0a26f15d567715cc8d54a81ef7
REPORT_BASIS_HEAD: 6f3efd84441b0a0a26f15d567715cc8d54a81ef7
MAIN_HEAD_LAST_CHECKED: 36748e381012bb52ba720cc288101948115721bb
MERGE_BASE: 36748e381012bb52ba720cc288101948115721bb
REPORT_SYNC: CURRENT
APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-PR482-003
CURRENT_STAGE: Stage 4 — exact-Git validation / handover — COMPLETE
CURRENT_BLOCKER: CONTROLLED_SOURCE_RECONCILIATION_REQUIRED
HIGHEST_RISK: promoting a secondary-source schedule-band candidate without exact controlled-Git reconciliation
EXACT_NEXT_ACTION: when the exact controlled EI PDF/provider is reachable, execute #470 DocumentEvidence for T4.2.2/Table T4-1 and reconcile the four categorical rows; otherwise make no further engineering mutation in PR #482.
```

Work intent: `VALIDATE / HANDOVER`
Criticality: `ENGINEERING_CRITICAL`
PR: #482
Branch: `agent/vibration-t4-wall-modifier`
Source issue: #450
Base: `main@36748e381012bb52ba720cc288101948115721bb`
PR state: `DRAFT / OPEN / MERGEABLE / UNMERGED / MERGE NOT AUTHORIZED`
Coordination: `SAFE`

## Handover in 60 Seconds

- Table T4-1 is independently reproduced in multiple EI AVIFF 2nd-edition copies at T4.2.2 / printed page 87.
- Exact candidate rows are:
  - `SCHEDULE_160_OR_GREATER`: FM 0.96; 4-way welded gusset FM 0.98
  - `SCHEDULE_80_TO_LT_160`: FM 0.93; gusset FM 0.96
  - `SCHEDULE_40_TO_LT_80`: FM 0.85; gusset FM 0.93
  - `LESS_THAN_SCHEDULE_40`: FM 0.42; gusset FM 0.85
- Source describes 4-way welded gusset plates at 90-degree intervals around the connection.
- Schedule bands are categorical. Interpolation, nearest-band fallback, and implicit `STD` mapping are forbidden.
- Independent worked example: 14-inch Schedule STD parent pipe, actual wall 9.5 mm < Schedule 40 wall 11.1 mm, therefore `LESS_THAN_SCHEDULE_40` and `FM=0.42` without gussets.
- No thermowell-named workbook was located in the pinned CRF repository, so no workbook-cell provenance was invented.
- Candidate/provenance/test exact Git blobs pass 5/5 locally.
- Controlled-Git DocumentEvidence reconciliation remains NOT_RUN/BLOCKED_ENVIRONMENT.
- No production resolver, thermowell equations/geometry, ASME PTC data, authority promotion, or master publication exists in this PR.

## Exact candidate artifacts

```text
candidate CSV      695d1c806f6a1f6fbcf9171d5aaff28eb1e295dd
provenance receipt 89e44892f359dd4326638f15aa8be12c019dd981
focused test       00a11fa5a48ba64537fc6a1c553c867d4e5fabfd
implementation head 6f3efd84441b0a0a26f15d567715cc8d54a81ef7
```

## Mission / acceptance disposition

Mission: recover `EI_AVIFF.T4.WALL_MODIFIER.v1` as a governed categorical candidate while preserving controlled-source and authority boundaries.

Completed:
1. four Table T4-1 bands recovered;
2. both plain and 4-way-gusset FM columns retained;
3. stable row/source locators added;
4. unknown band fails `NOT_READY`;
5. interpolation/nearest fallback prohibited;
6. worked-example FM 0.42 independently replayed;
7. exact-Git focused regression PASS 5/5;
8. no publication/runtime/authority integration added.

Blocked/deferred:
- exact controlled-Git DocumentEvidence reconciliation;
- final qualification/promotion;
- thermowell geometry taxonomy/natural-frequency method and product integration, which remain separate scope.

## Source state

Controlled EI:
```text
repository = reallaksh19/Common
commit     = fb549185b9b27edc2379734240320a85c5bef9f6
path       = EI - AVIFF Guidelines 2nd Edition.pdf
blob       = 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
size       = 10348594
section    = T4.2.2
printed page = 87
execution  = BLOCKED_ENVIRONMENT
```

Independent secondary EI copies: `PASS` as `AUTHORITATIVE_REFERENCE` corroboration only; not a substitute for controlled source.

Pinned CRF project search:
```text
repository = reallaksh19/CRF-4-1
commit     = 68dc8e1fa2ef67073c59b3afc56f1bf40953d535
thermowell-named workbook located = false
workbook cell provenance claimed = false
```

## Authority / publication state

```text
engineeringAuthority  = NONE
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
masterValuesPublished = false
publicationState      = CANDIDATE
qualificationStatus   = NOT_QUALIFIED
qualificationBlocker  = CONTROLLED_SOURCE_RECONCILIATION_REQUIRED
```

## Validation Ledger

| Check | STATUS | OBSERVATION | ORACLE | Basis / limitation |
|---|---|---|---|---|
| live main/PR grounding | PASS | REMOTE_EXECUTION | NONE | current main unchanged |
| Table T4-1 row corroboration | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | secondary EI copies |
| worked-example FM 0.42 | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | independent source example |
| exact candidate/provenance/test blob identity | PASS | ARTIFACT_INSPECTION | NONE | SHA-1s above |
| exact-Git focused regression | PASS 5/5 | LOCAL_EXECUTION | AUTHORITATIVE_REFERENCE + IMPLEMENTATION_COUPLED | test executed against bytes matching Git blobs |
| PR changed-file audit | PASS | REMOTE_EXECUTION | NONE | exactly four expected files |
| GitHub commit status contexts | NOT_RUN | REMOTE_EXECUTION | NONE | GitHub returned zero contexts |
| controlled DocumentEvidence reconciliation | NOT_RUN | NOT_OBSERVED | AUTHORITATIVE_REFERENCE | provider/PDF unavailable |
| active publication/authority | NOT_APPLICABLE | NOT_OBSERVED | AUTHORITATIVE_REFERENCE | explicitly outside current scope |

Focused test coverage:
1. exact four T4-1 rows;
2. explicit gusset-column selection;
3. unknown schedule band => `NOT_READY`;
4. worked example selects `< Schedule 40` => `FM=0.42`;
5. provenance/publication/authority remains fail-closed.

Negative assurance:
- intentionally added: candidate CSV + provenance receipt + focused regression;
- intentionally not added: numeric interpolation, nearest/default mapping, production resolver, thermowell equations/geometry, ASME PTC data, T2.9/T3/SBC/charts, workflows/dependencies, authority changes.

## Changed-File Ledger

| File | Purpose | Engineering-sensitive | Validation |
|---|---|---:|---|
| `agents/PR482_workreport.md` | recovery/handover | yes | current |
| `docs/Masters/Vibration/ei-aviff-t4-wall-modifier.candidate.csv` | Table T4-1 candidate | yes | PASS 5/5 |
| `ValidationRecords/VibrationMasters/ei-aviff-t4-wall-modifier-candidate-v1.json` | provenance / source-role / authority receipt | yes | PASS 5/5 |
| `tests/vibration-t4-wall-modifier-candidate.test.mjs` | focused row/boundary/worked-example regression | yes | PASS 5/5 |

Actual PR changed-file audit: exactly these four files.

## Appendix A — Implementation Takeover Qualification

`APPENDIX_A_STATUS: CURRENT`

Any future engineering mutation must re-ground and prove:
- exact controlled T4-1 evidence lineage;
- categorical schedule-band semantics remain unchanged;
- no interpolation/nearest/default mapping is introduced;
- both gusset states reconcile to controlled source;
- minimal patch does not silently broaden into thermowell method/runtime authority.

## Next-Agent Handover

Do not redo Table T4-1 recovery or 5/5 candidate validation.
Do not add T3/SBC/chart work to this PR.
If controlled EI DocumentEvidence becomes reachable, reconcile the four rows and update qualification state only from that evidence.
Otherwise leave PR #482 draft/open/unmerged and continue issue #450 in a separate SBC T3 table/rule workstream.

Handover readiness: `READY`.
No merge is authorized.
