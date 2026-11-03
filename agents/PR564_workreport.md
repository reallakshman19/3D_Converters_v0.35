# PR564 — SBC reserved Type 1–4 scaffold + source-grounded structural contracts

## Recovery summary

Mission: continue issue #563 on draft PR #564 / `agent/sbc-reserved-vertical-scaffold` without changing numerical, screening, master-data, or design authority.

```text
TAKEOVER_DECISION = CONTINUE
CLASSIFICATION = ENGINEERING_CRITICAL
MERGE_AUTHORITY = OWNER_ONLY / NOT_GRANTED
```

Current capability/authority remains:

```text
calculationId          = VIB.SBC.SMALL_BORE
assessmentUnitType     = SBC_CONNECTION
lifecycle              = RESERVED
calculationState       = BLOCKED
qualificationState     = BLOCKED
productionExecution    = FORBIDDEN
benchmarkExecution     = FORBIDDEN
screeningAuthority     = NOT_AUTHORIZED
designAuthority        = false
```

Permanent separations:

```text
PLACEHOLDER PRESENCE != IMPLEMENTATION QUALIFICATION
IMPLEMENTATION QUALIFICATION != SCREENING AUTHORITY
SCREENING AUTHORITY != DESIGN AUTHORITY
```

## Live grounding at this checkpoint

```text
main SHA                                  = d12ca2d53d1ea0174e1b91fbe3105137fdd2a42b
PR                                         = #564 OPEN / DRAFT
branch                                     = agent/sbc-reserved-vertical-scaffold
merge base                                 = 042025bfe3f9c60ba11d8c653f98af78ac587a64
engineering head before report update      = 2b20021147aadf67799c177ea7ff35e08878111e
base drift                                 = behind live main by 2 unrelated CII commits
mergeable                                  = true
changed files before report update         = 28
review threads at takeover                 = none
```

This report update creates a later report-only head. Future takeover must re-read live PR/main/checks rather than treating the engineering-head SHA above as perpetually current.

## Scope / ownership

```text
#563 = SBC scaffold, fill-in-the-blanks architecture, structural contracts
#429 = Vibration family qualification/completeness and qualified EI main-line assessment
#514 = Type-3 source/qualification evidence and T3 source conflict
```

PR #546 remains evidence/source-reconciliation work only and is not an implementation baseline. PR #508 Type-3 candidate code remains salvage/evidence only. PR #480/#483 remain adjacent source/master infrastructure without authority transfer.

Coordination classification:

```text
COORDINATION_REQUIRED
not BLOCKED_BY_ACTIVE_CLAIM
```

No exact #546 file was modified.

## Authority invariants preserved

1. SBC main-line input requires a qualified EI main-line assessment with completeness semantics; FIT LOF alone is rejected.
2. Type 1–4 remain explicit branches.
3. D5/D6/D7/D8 remain B1 worked-example families; each materially distinct branch also requires independent B2 engineering evidence.
4. Production code does not generate or correct benchmark expected values.
5. D7 remains an oracle, never calibration data.
6. Existing Type-3 candidate code remains salvage/evidence only.
7. T3 curves remain quarantined while the controlled-source conflict exists.
8. No hidden engineering defaults are introduced.
9. A conservative value remains legal only as `METHOD_MANDATED_CONSERVATIVE_ASSUMPTION` with exact source rule/provenance.
10. Structural completeness does not establish method qualification or execution authority.
11. No lifecycle transition occurs in this slice.

## Controlled source identities now pinned

Implemented in:

```text
converters/vibration/sbc/source-trace.js
```

### SBC-SRC-001 — controlled EI PDF identity

```text
repository          = reallaksh19/Common
commit              = fb549185b9b27edc2379734240320a85c5bef9f6
path                = EI - AVIFF Guidelines 2nd Edition.pdf
blob                = 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
role                = CONTROLLED_SOURCE_IDENTITY
qualificationStatus = IDENTITY_PINNED_ENGINEERING_QUALIFICATION_NOT_ESTABLISHED
```

### SBC-SRC-002 — Appendix D structured transcription reference

```text
repository          = reallaksh19/Advanced_Analysis
commit              = 76eb4bd075ce2e8e2442d02b2798df7be491fb4b
path                = docs/EI data/EI_AVIFF_Guidelines_2nd_Edition_Examples.md
blob                = c050cd90802c27241c510c6f0ac43bfaf7a89e9d
qualificationStatus = REFERENCE_ONLY_NOT_ENGINEERING_AUTHORITY
```

### SBC-SRC-003 — T3 structured transcription reference

```text
repository          = reallaksh19/Advanced_Analysis
commit              = 76eb4bd075ce2e8e2442d02b2798df7be491fb4b
path                = docs/EI data/P0_SBC_Master_Data.md
blob                = 5312c9e2cf86af9e940ba722fcbee64702aeccd3
qualificationStatus = REFERENCE_ONLY_CURVE_VALUES_QUARANTINED
```

Source identity and transcription references do not establish engineering qualification.

## Source/trace population status

Updated:

```text
docs/vibration/SBC-source-trace-register-v1.md
```

Current status:

```text
artifactStatus       = SCAFFOLD_PRESENT_NOT_FROZEN
populationStatus     = REFERENCE_ROWS_POPULATED_NOT_ENGINEERING_QUALIFIED
engineeringAuthority = NONE
sourceQualification  = NOT_ESTABLISHED
```

Populated non-numerical reference rows:

```text
SBC-TYPE-001  TYPE_1  D5  T3-2  cantilever / single-parent
SBC-TYPE-002  TYPE_2  D6  T3-4  loop/bypass re-entering same main line
SBC-TYPE-003  TYPE_3  D7  T3-5  supported first + subsequent spans
SBC-TYPE-004  TYPE_4  D8  T3-8  bridge between distinct parent lines

SBC-APP-001  T3-1  first span with unsupported mass
SBC-APP-002  T3-2  first span without unsupported mass
SBC-APP-003  T3-3  subsequent span with unsupported mass
SBC-APP-004  T3-4  subsequent span without unsupported mass
SBC-APP-005  T3-2 table  first span connected to deck/steelwork
SBC-APP-006  T3-3 table  SBC between two main lines
```

The applicability rows carry labels only. Numerical figure/table use is not authorized by this slice. `SBC-FIG-*` remains `BLOCKED_SOURCE_DATA_CONFLICT`; `SBC-EQ-*`, numerical `SBC-TBL-*`, `SBC-CONST-*`, `SBC-ASS-*`, and `SBC-UNIT-*` remain unpopulated.

## Explicit Type confirmation contract

New module:

```text
converters/vibration/sbc/type-classification-contract.js
```

Current status:

```text
SOURCE_GROUNDED_EXAMPLE_SCOPE_NOT_METHOD_FROZEN
classificationAuthority        = NONE
automaticClassificationAllowed = false
numericalExecutionAllowed      = false
```

The contract requires an explicit declared Type and checks only whether supplied topology contradicts the D5–D8 structural facts. It is not a complete EI automatic classifier.

Structural confirmation contracts:

```text
TYPE_1 = CANTILEVER_SINGLE_PARENT
         parentConnectionCount=1
         parentLineRelationship=SINGLE_PARENT_LINE

TYPE_2 = LOOP_BYPASS_SAME_MAIN_LINE
         parentConnectionCount=2
         parentLineRelationship=SAME_MAIN_LINE

TYPE_3 = SUPPORTED_FIRST_AND_SUBSEQUENT_SPANS
         parentConnectionCount=1
         parentLineRelationship=SINGLE_PARENT_LINE
         subsequentSpanEvidenceRequired=true

TYPE_4 = BRIDGE_DISTINCT_PARENT_LINES
         parentConnectionCount=2
         parentLineRelationship=DISTINCT_MAIN_LINES
```

Positive structural confirmation returns:

```text
CONFIRMED_EXAMPLE_SCOPE_NOT_QUALIFIED
```

Contradiction returns `STRUCTURAL_CONFIRMATION_FAILED`. Missing/unknown explicit type returns `EXPLICIT_TYPE_CONFIRMATION_REQUIRED`.

## Explicit Type 1–4 input contracts

New module:

```text
converters/vibration/sbc/type-input-contracts.js
```

Current status:

```text
SOURCE_GROUNDED_EXAMPLE_SCOPE_NOT_METHOD_FROZEN
validationPurpose          = STRUCTURAL_COMPLETENESS_ONLY
numericalExecutionAllowed = false
benchmarkExecutionAllowed = false
engineeringDefaultsAllowed = false
fitOnlyAccepted            = false
```

Common required structural fields:

```text
connectionId
declaredSbcType
operatingScenario.scenarioId
mainLineAssessment.assessmentId
mainLineAssessment.sourceContract
topology.topologyKind
topology.parentConnectionCount
topology.parentLineIds
geometry.minimumNominalDiameter
attachments.fittings
attachments.valves
locationContext
```

Required main-line source contract declaration:

```text
QUALIFIED_EI_MAIN_LINE_ASSESSMENT
```

This declaration does not itself prove #429 qualification/completeness. `FIT_LOF_ONLY` or `fitOnly=true` fails closed.

Type-specific structural fields:

```text
TYPE_1
  geometry.overallBranchLength

TYPE_2
  topology.returnsToSameMainLine
  geometry.branchLegs

TYPE_3
  topology.hasSubsequentSpans
  geometry.firstSpan
  geometry.subsequentSpans
  supportTopology.firstSpanSupport

TYPE_4
  topology.bridgesDistinctMainLines
  geometry.endLegs
  geometry.bridgeSpan
```

Even a fully populated structural request returns:

```text
STRUCTURE_COMPLETE_NOT_QUALIFIED_FOR_NUMERICAL_EXECUTION
qualificationEstablished = false
numericalExecutionAllowed = false
```

The contracts contain no SBC equation, LOF arithmetic, curve value, table value, hidden engineering default, or benchmark expected value.

## Manifest status

Updated consumed manifest:

```text
converters/vibration/sbc/vertical-manifest.js
```

Overall states deliberately remain:

```text
METHOD_SPECIFICATION               = SCAFFOLD_PRESENT_NOT_FROZEN
SOURCE_TRACE_REGISTER              = SCAFFOLD_PRESENT_NOT_FROZEN
BENCHMARK_REGISTRY                 = SCAFFOLD_PRESENT_NOT_FROZEN
TYPE_INPUT_CONTRACTS               = NOT_FROZEN
APPLICABILITY_TYPE_CLASSIFICATION  = NOT_FROZEN
QUALIFIED_MASTER_DEPENDENCIES      = NOT_FROZEN
PURE_TYPE_KERNELS                  = NOT_QUALIFIED
```

New sub-statuses make the partial progress machine-readable without removing blockers:

```text
SOURCE_TRACE_REGISTER.populationStatus
  = REFERENCE_ROWS_POPULATED_NOT_ENGINEERING_QUALIFIED

TYPE_INPUT_CONTRACTS.structuralContractStatus
  = SOURCE_GROUNDED_EXAMPLE_SCOPE_NOT_METHOD_FROZEN

APPLICABILITY_TYPE_CLASSIFICATION.confirmationContractStatus
  = SOURCE_GROUNDED_EXAMPLE_SCOPE_NOT_METHOD_FROZEN

APPLICABILITY_TYPE_CLASSIFICATION.automaticClassificationAllowed
  = false
```

## Type-3 boundary

Unchanged:

```text
issue #514 owns source/qualification evidence
D7 = B1 oracle only
D7 calibration use = forbidden
T3-1..T3-4 numerical curves = BLOCKED_SOURCE_DATA_CONFLICT
existing Type-3 candidate = salvage/evidence only
runtime curve activation = false
```

The Type-3 structural input contract names first/subsequent span evidence only. It does not derive D/F/G or consume quarantined curve values.

## Existing-file backup custody

The exact repository `utils/backup.js` was executed against hash-verified pre-edit copies for the two existing engineering-sensitive files changed in this slice.

```text
backup #1
file    = converters/vibration/sbc/vertical-manifest.js
old blob = a70d5aa4bf56733e7eca9cf18065f6479c99f9e9
context = PR564 #563 type-contract structural source population pre-edit
result  = PASS
committed backup = .backups/1_converters_vibration_sbc_vertical_manifest_js.bak

backup #2
file    = docs/vibration/SBC-source-trace-register-v1.md
old blob = 001ec6a71501374a4122fd4e5bd63b97fbe49d0d
context = PR564 #563 controlled source trace population pre-edit
result  = PASS
committed backup = .backups/2_docs_vibration_SBC_source_trace_register_v1_md.bak
```

The backup CLI created a local `.backups/log.json`; the connector refused the remote write for that log, so a committed backup-log receipt is **not claimed**. The `.bak` content files are committed.

For this workreport edit, the connector cannot materialize the current remote-only file through the native backup CLI. Immutable pre-edit custody is therefore recorded as:

```text
pre-edit workreport blob = 5c40a5184536c5aafe0022778df4c7e9a9c7b8a7
backup mechanism = Git immutable blob/history fallback
backup CLI for report = NOT_RUN / CONNECTOR_REMOTE_FILE
```

No contrary PASS is claimed.

## Validation truth

### Mandatory reserved-scaffold command

Actually executed against the exact published/hash-matched engineering bytes:

```bash
node --test tests/vibration-sbc-reserved-scaffold.test.mjs
```

```text
STATUS = PASS
OBSERVATION = 9 tests, 9 pass, 0 fail
ORACLE = implementation-coupled scaffold/lifecycle/authority regression
```

### Aggregate SBC structural validation

Actually executed:

```bash
node --test \
  tests/vibration-sbc-reserved-scaffold.test.mjs \
  tests/vibration-sbc-controlled-structure.test.mjs \
  tests/vibration-sbc-type-contracts.test.mjs
```

```text
STATUS = PASS
OBSERVATION = 21 tests, 21 pass, 0 fail
```

Subsets:

```text
reserved scaffold             PASS 9/9
controlled structural blanks  PASS 5/5
source/type/input contracts   PASS 7/7
```

Syntax checks actually executed and passed for:

```text
converters/vibration/sbc/source-trace.js
converters/vibration/sbc/type-classification-contract.js
converters/vibration/sbc/type-input-contracts.js
converters/vibration/sbc/vertical-manifest.js
```

Published-byte verification:

```text
source-trace.js                         90b2897b394155641071f2dfb9cd1613a743cc42
 type-classification-contract.js        51c5fb1788b2f0cb437d0599d58c16d43f61ad87
 type-input-contracts.js                86c399bb3c9899d0324bcda1e3c3d03750b09968
 vertical-manifest.js                   a991a694ef8f955432ffe7e1e22ecf303bfe0425
 SBC-source-trace-register-v1.md        24e323b8d9b094aaf6694d399372bef1ecd6390d
 SBC-Type-Classification-and-Input-Contracts-v1.md 4861d73bb80b53546e892fe706d5afb7b5048641
 vibration-sbc-type-contracts.test.mjs  87b6f020ec27d54560816a0ba30046cc6910fd07
```

Each re-fetched GitHub blob matched the tested local Git hash exactly.

### Hosted workflows on engineering head `2b200211...`

```text
HP Piping Class I1-I3 Qualification Gate           NOT_RUN / INFRASTRUCTURE_BLOCKED
Vibration Production Freeze Validation             NOT_RUN / INFRASTRUCTURE_BLOCKED
Vibration AIV Controlled Source Qualification      NOT_RUN / INFRASTRUCTURE_BLOCKED
```

Observation: every job exposed `steps=[]`, `runner_id=0`, and no runner name. GitHub's workflow conclusion string `failure` is not treated as executed product failure evidence.

### Native private checkout

```text
STATUS = NOT_RUN / ENVIRONMENT_BLOCKED
OBSERVATION = github.com and api.github.com DNS resolution unavailable in execution container
```

### Browser validation

```text
STATUS = NOT_RUN / NOT_REQUIRED_FOR_THIS_STRUCTURAL_SLICE
```

No UI equation or authority path changed.

## Exact files added/modified by this continuation slice

```text
.backups/1_converters_vibration_sbc_vertical_manifest_js.bak
.backups/2_docs_vibration_SBC_source_trace_register_v1_md.bak
agents/PR564_workreport.md
converters/vibration/sbc/source-trace.js
converters/vibration/sbc/type-classification-contract.js
converters/vibration/sbc/type-input-contracts.js
converters/vibration/sbc/vertical-manifest.js
docs/vibration/SBC-Type-Classification-and-Input-Contracts-v1.md
docs/vibration/SBC-source-trace-register-v1.md
tests/vibration-sbc-type-contracts.test.mjs
```

Current PR changed-file inventory immediately before this report update contained 28 paths total. Re-read live PR after this report commit for final head/count.

## Active blockers

```text
SBC_ENGINEERING_METHOD_SPECIFICATION_NOT_FROZEN
SBC_SOURCE_ENGINEERING_QUALIFICATION_NOT_ESTABLISHED
SBC_COMPLETE_TYPE_SELECTION_METHOD_NOT_FROZEN
SBC_TYPE_INPUT_UNITS_AND_SEMANTICS_NOT_FROZEN
SBC_BENCHMARK_REGISTRY_NOT_FROZEN
SBC_B1_EXPECTED_VALUES_NOT_CONTROLLED
SBC_B2_INDEPENDENT_ENGINEERING_EVIDENCE_MISSING_TYPE_1
SBC_B2_INDEPENDENT_ENGINEERING_EVIDENCE_MISSING_TYPE_2
SBC_B2_INDEPENDENT_ENGINEERING_EVIDENCE_MISSING_TYPE_3
SBC_B2_INDEPENDENT_ENGINEERING_EVIDENCE_MISSING_TYPE_4
SBC_MAIN_LINE_ASSESSMENT_CONTRACT_NOT_QUALIFIED_BY_429
SBC_QUALIFIED_MASTER_DEPENDENCIES_NOT_FROZEN
SBC_REQUIRED_ACTION_CONTRACT_NOT_QUALIFIED
SBC_PURE_TYPE_KERNELS_NOT_QUALIFIED
SBC_T3_CURVES_BLOCKED_SOURCE_DATA_CONFLICT
```

## Highest risk

A future agent may mistake either:

```text
CONFIRMED_EXAMPLE_SCOPE_NOT_QUALIFIED
```

or:

```text
STRUCTURE_COMPLETE_NOT_QUALIFIED_FOR_NUMERICAL_EXECUTION
```

for engineering method qualification. They are structural statements only. D5–D8 examples are insufficient to claim a complete automatic classifier, and source/transcription identity is insufficient to claim engineering qualification.

## EXACT_NEXT_ACTION

Remain inside #563 and continue **controlled-source reconciliation only**:

```text
1. establish the exact controlled-source locator/custody for the governing SBC Type-selection rules beyond the D5–D8 example descriptions;
2. populate/review SBC-TYPE-* rows for the complete method if the controlled source supports them;
3. populate SBC-UNIT-* and input-semantic trace rows for each required Type 1–4 structural/numerical input;
4. reconcile those rows against the controlled PDF identity, with independent review;
5. only then propose freezing the Type classification/input contract scope.
```

If the controlled source cannot establish a rule or unit semantic, leave it unknown / `NOT_FROZEN`. Do **not** infer a rule from the examples, candidate Type-3 code, browser evidence, or quarantined T3 digitization.

Do not implement pure numerical Type kernels, publish masters, activate T3 curves, or propose `RESERVED -> QUALIFIED` until the method/source/benchmark prerequisites are genuinely satisfied.
