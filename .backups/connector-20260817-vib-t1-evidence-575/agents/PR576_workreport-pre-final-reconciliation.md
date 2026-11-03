# PR576 — VIB-T1-EVIDENCE-01 explicit authoring / scope custody

## Recovery control

```text
PR = #576
ISSUE = #575
BRANCH = agent/vib-t1-evidence-575-authoring-scope
STACK_BASE_PR = #574
STACK_BASE_BRANCH = agent/vib-t1-ident-573-governed-producer
STACK_BASE_SHA = 1beaeb0675168162de1b94e89e65fc5d68442318
MAIN_AT_IMPLEMENTATION = 24080a49647c7802ff8ab496ccd37421b8d53b68
IMPLEMENTATION_HEAD_BEFORE_PR_REPORT = a5558e03ebe1634ebbc3a9048b3bed3eb630a54d
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_VIB_T1_EVIDENCE_AUTHORING
APPENDIX_A_COMMENT = 5312422599
APPENDIX_A_SCORE = 98/100
PR_STATE = DRAFT_OPEN
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED
```

## Mission

Add a separate explicit project/source mechanism-identification authoring workflow and make scope custody machine-enforced from authoring table through the facility matrix.

```text
explicit user/reviewer evidence
 -> authoring table
 -> fail-closed row validation
 -> exact-scope resolver
 -> READY identification records only
 -> render-only row binding
 -> matrix scope assertion
 -> #574 governed universe producer
 -> #572 coverage / completeness
```

## Engineering authority boundary

```text
PROJECT_IDENTIFICATION_EVIDENCE != CONTROLLED_SOURCE_AUTHORITY
SOURCE_ID_TEXT != SOURCE_QUALIFICATION
SCOPE_A_EVIDENCE != SCOPE_B_EVIDENCE
READY_IDENTIFICATION != QUALIFIED_ASSESSMENT
AssessmentCompleteness.COMPLETE != EI_MAIN_LINE_AGGREGATE_ESTABLISHED
```

Authoring authority is identification custody only:

```text
identificationAuthority = EXPLICIT_EVIDENCE_ONLY
controlledSourceAuthority = false
engineeringAuthority = NONE
screeningAuthority = NOT_AUTHORIZED
designAuthority = false
codeCompliance = false
```

No automatic T1 rules, mechanism-to-unit default, numerical authority, benchmark change, Product Freeze change or aggregation exists in this PR.

## Authoring contract

New `tabs/vibration-integrity-identification-model.js` defines `VibrationMechanismIdentificationAuthoringTable.v1`.

Declared authored fields only:

```text
mechanismId
line
caseId
canonicalId
assessmentUnitType
disposition
requiredQualification
sourceId
reason
```

Row state:

```text
EMPTY | INCOMPLETE | INVALID | READY
```

Fail-closed behavior:

- `REQUIRED` requires explicit `requiredQualification`;
- `NOT_APPLICABLE` / `UNRESOLVED` forbid qualification;
- source ID and reason mandatory;
- unknown registry/contract vocabulary INVALID;
- undeclared fields rejected;
- caller-supplied/forged `rowId` rejected;
- non-empty row missing line/canonical identity blocks resolution until fixed/deleted;
- duplicates/contradictions fail through #574/#572 normalization;
- matching scope with any invalid/incomplete row supplies zero positive records.

## Scope custody

`resolveVibrationIdentificationEvidenceForScope()` uses exact:

```text
line
caseId
canonicalId
```

The Vibration Integrity shell resolves this separately for each displayed facility row and attaches records only when resolver status is `READY` to a render-only workspace copy. The underlying FIT workspace/result is not mutated.

`tabs/vibration-integrity-mechanisms.js` independently validates scope for both:

```text
context.mechanismIdentifications
row.mechanismIdentifications
```

Any mismatch fails:

```text
MECHANISM_IDENTIFICATION_SCOPE_MISMATCH:<mechanismId>
```

This protects alternate direct callers as well as the UI path and prevents wrong-scope `NOT_APPLICABLE` evidence from influencing another facility row.

## Product UI / audit

New workspace tab:

```text
Mechanism identification
```

The view enumerates governed vocabulary with blank initial selectors. It never selects mechanism, assessment unit, disposition, qualification, source or reason for the reviewer.

The new authoring state is separate from `VibrationUserEngineeringData.v1` numerical/data-blocker input.

Every add/delete/cell edit emits:

```text
MECHANISM_IDENTIFICATION_CHANGED
```

through the existing activity/audit path.

The large `tabs/vibration-integrity-view.js` was intentionally not modified; the narrower shell -> row -> matrix seam was selected after review.

## Changed-file ledger relative to #574

Production/UI:

```text
NEW  tabs/vibration-integrity-identification-model.js
NEW  tabs/vibration-integrity-identification-view.js
EDIT tabs/vibration-integrity-user-data-shell.js
EDIT tabs/vibration-integrity-ui-contract.js
EDIT tabs/vibration-integrity-mechanisms.js
```

Tests/handoff:

```text
NEW tests/vibration-integrity-identification-authoring.test.mjs
agents/WIP-vib-t1-evidence-01_workreport.md
agents/PR576_workreport.md
```

Exact pre-edit/intermediate custody:

```text
.backups/connector-20260817-vib-t1-evidence-575/
```

A backup of `tabs/vibration-integrity-view.js` exists from seam evaluation, but that production file is not modified in the final diff.

No `.github/workflows/*`, mechanism numerical kernel, benchmark expected data/tolerance, Product Freeze record, T2.9 numerical/source implementation or PR #546 technical file is modified.

## Falsification coverage

Focused regression pins:

```text
blank authoring -> no evidence
READY row -> VibrationMechanismIdentification.v1
unscoped partial row -> fail-closed resolution
REQUIRED -> explicit qualification required
N/A / unresolved -> qualification forbidden
sourceId + reason mandatory
unknown vocabulary -> INVALID
duplicate / contradictory identity -> INVALID
scope A data cannot resolve for B
invalid matching scope -> zero positive evidence
exact-scope READY record reaches #574/#572 path
family remains INCOMPLETE when only FIT is identified
FIT screening governing remains unchanged
direct matrix cross-scope injection -> hard fail
generated row identity cannot be forged
undeclared hidden authority fields -> hard fail
governed vocab exposed with blank selectors
authoring state separate from user engineering data
identification mutations audit logged
no automatic process-to-disposition logic in authoring modules
```

Primary falsifier:

> A READY scope-A identification must never enter scope B's identification bundle or alter B's completeness.

## Validation ledger

```text
STATUS   OBSERVATION                                                        ORACLE
PASS     main = 24080a49647c7802ff8ab496ccd37421b8d53b68                  live GitHub
PASS     #574 base = 1beaeb0675168162de1b94e89e65fc5d68442318             live PR / exact stack
PASS     stack merge base exact / behind 0                                  GitHub compare
PASS     Appendix A = 98/100 before mutation                                #575 comment 5312422599
PASS     model 216 / view 86 / focused test 194 lines                       GitHub compare
PASS     existing shell ~272 / matrix ~276 / UI contract ~30               base + diff accounting
PASS     reconstructed pure authoring/scope behavior = 14/14                Node v22.16.0
PASS     reconstructed matrix scope assertion helper = 4/4                  Node v22.16.0
PASS     changed-file scope excludes workflow/numerical/benchmark/freeze/#546 technical paths GitHub compare
NOT_RUN  native exact-checkout focused authoring test                        private checkout unavailable
NOT_RUN  native exact-checkout matrix regressions                            private checkout unavailable
NOT_RUN  full repository-native VIB/FIT/AIV suites                          private checkout unavailable
NOT_RUN  browser                                                            no browser acceptance claimed
```

Reconstructed checks are supporting executable evidence, not native exact-checkout PASS.

## Protected non-goals

Do not add to this PR:

```text
process-data automatic T1 applicability rules
mechanism-to-assessment-unit inference
EI applicability thresholds from memory
FIT/AIV/Mechanical/SBC numerical changes
T2.8/T2.9/T4 numerical changes
benchmark expected values/tolerances
EI main-line aggregation
universal vibration score
screening/design/code authority promotion
Product Freeze changes
runtime/writer/canvas ownership changes
workflow changes
PR #546 technical work
```

## Remaining dependency

The product can now safely author and consume explicit project/source identification evidence, but source ID text does not independently qualify an engineering source. A future automatic T1 rule engine would require separately controlled/adopted source qualification and is not part of this PR.

## Highest risk

Future import/persistence convenience must preserve the declared-field lock and exact scope assertion. It must not deserialize hidden authority fields, infer applicability, or bypass the #574 producer.

## EXACT_NEXT_ACTION

Re-query PR #576 mergeability after GitHub computes it, inspect exact-head Actions/status and review threads, sync final PR/issue metadata, and leave draft/unmerged. If native checkout becomes available, execute the focused authoring test plus existing mechanism matrix regressions; otherwise keep them NOT_RUN.