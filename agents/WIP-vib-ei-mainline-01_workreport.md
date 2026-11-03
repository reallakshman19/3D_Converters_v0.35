# WIP-vib-ei-mainline-01 — fail-closed EI main-line aggregation

```text
ISSUE = #579
BRANCH = agent/vib-ei-mainline-579-aggregation
BASE_MAIN = 02de308ad91a569123fb166f7598ee59915e22ff
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_EI_MAINLINE_AGGREGATION
APPENDIX_A_COMMENT = 5312940137
APPENDIX_A_SCORE = 98/100
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED_FOR_NEW_PR
```

## Mission

Implement M4 of #429: one exact-scope, fail-closed EI main-line aggregation contract that emits a number only after all governed T2 dispositions are resolved, all required main-line assessments are current Screening evidence, and each required contributor is M3 benchmark-ready.

## Governed M4 policy

Included from #429 current T2 main-line sequence:

```text
fit
mechanicalExcitation
reciprocatingPulsation
rotatingStall
deadlegPulsation
aiv
valveTransients
cavitationFlashing
```

Explicitly excluded from this aggregate:

```text
corrugationPulsation  OUTSIDE_CURRENT_429_T2_AGGREGATION_LIST
slugFlow              SPECIALIST_ROUTE_OUTSIDE_CURRENT_429_T2_AGGREGATE
thermowells           T4_INTRUSIVE_ELEMENT_CONTINUATION
smallBoreConnections  T3_SBC_CONTINUATION
```

Exclusion from M4 is not a full-family N/A/risk conclusion.

## Frozen authority invariants

```text
EI_MAIN_LINE_COMPLETE != FULL_VIBRATION_ASSESSMENT_COMPLETE
EI_MAIN_LINE_LOF != UNIVERSAL_VIBRATION_RISK
EI_MAIN_LINE_COMPLETE != PRODUCT_FREEZE
EI_MAIN_LINE_COMPLETE != DESIGN_AUTHORITY
```

Contributor eligibility requires:

```text
T1 REQUIRED
coverage ASSESSMENT_COMPLETE
IMPLEMENTED_SCREENING
qualification.effective = SCREENING
assessmentState = CALCULATED
resultState = CURRENT_RESULT
M3 mechanism state = READY
finite non-negative result.governingLof
```

No conservative substitution rule exists in this slice.

## Pinned current source chain

```text
main                                  02de308ad91a569123fb166f7598ee59915e22ff
mechanism registry                    cab12923b3da58769eddfd84cf4335e58ce7b507
identification producer               18a8f8559f61a0e3e7204a1759d817bf28bd1314
coverage/completeness                  517f50f067d7d91dcf72570a76463f62fd619aad
M3 benchmark registry                 6053ab7fd948611426c763b16c5e215e7e6b8d4d
active engineering calculation registry 47e55c8a8dcf63536b897c63401f16b5686857e1
pre-M4 production matrix              e21bc9b3fa03752ea8c976e3bc07e72547b74550
```

## Current implementation

New:

```text
converters/vibration/ei-mainline-aggregation.js
```

Exports:

```text
EI_MAIN_LINE_AGGREGATION_SCHEMA
EI_MAIN_LINE_AGGREGATION_POLICY_SCHEMA
EI_MAIN_LINE_AGGREGATION_POLICY_REVISION
EI_MAIN_LINE_MECHANISM_IDS
EI_MAIN_LINE_AGGREGATION_POLICY
eiMainLineAggregationPolicyFingerprint()
evaluateEiMainLineAggregation()
```

The evaluator:

1. rejects caller policy/benchmark/active-capability overrides;
2. requires exact line/case/canonical scope for every supplied evidence record;
3. filters evidence to the governed M4 set;
4. reuses `evaluateVibrationCoverageAndCompleteness()` on that set;
5. computes M3 benchmark compliance from the real active calculation registry internally;
6. emits `INCOMPLETE` with null LOF for missing/unresolved/stale/candidate/unqualified/unbenchmarked/invalid-LOF evidence;
7. emits `NOT_APPLICABLE` only when all governed main-line mechanisms are explicitly N/A;
8. emits `COMPLETE` only with qualified contributors, using deterministic maximum `governingLof`.

## Production integration

Edited only:

```text
tabs/vibration-integrity-mechanisms.js
```

The matrix now exposes:

```text
eiMainLineAggregation
```

separately from existing:

```text
screeningGoverning
candidateGoverning
retainedScreeningGoverning
retainedCandidateGoverning
assessmentCompleteness
fullScreeningGoverningEstablished = false
```

No existing governing meaning is replaced.

## Backup custody

Before matrix edit, exact blob `e21bc9b3fa03752ea8c976e3bc07e72547b74550` was preserved at:

```text
.backups/connector-20260817-vib-ei-mainline-579/tabs/vibration-integrity-mechanisms.js
```

Connector-only environment cannot run the repository backup CLI; the backup is exact source-byte reuse from the Git blob.

## Protective/falsification test

New:

```text
tests/vibration-ei-mainline-aggregation.test.mjs
```

Primary falsifier was committed before the evaluator existed:

> A valid current FIT Screening LOF with only FIT identified must still yield `INCOMPLETE` / `eiMainLineLof=null` because the other governed T2 dispositions are missing.

Additional falsifiers cover all-N/A, FIT-only complete with seven explicit N/A, FIT+AIV maximum, stale/candidate/M3-pending evidence, invalid LOF, many child contributors, excluded high LOFs, cross-scope evidence, and matrix authority separation.

## Current branch ledger

```text
protective test commit   f328cb0f80f41f974d133beca18605feeaaa2667
evaluator commit         a624eb9362925ab521c96b485b88ad92d629f0bb
matrix backup commit     786a03d62c8f44e535cbea99ca4ec0f8b309dcfc
matrix integration       e5ec45f9c2559d5e613db8439ef3f43a9fd3c073
```

Latest compare before this report:

```text
ahead = 4
behind = 0
new evaluator = 259 lines
new focused test = 233 lines
matrix = 284 lines after integration
```

## Validation ledger

```text
PASS     live main / dependency / overlap grounding
PASS     #578 M3 merged at 02de308ad91a569123fb166f7598ee59915e22ff
PASS     Appendix A 98/100 before production mutation
PASS     policy covers every governed mechanism exactly once as included/excluded
PASS     caller policy/benchmark/active-capability override seam absent
PASS     exact-scope enforcement present
PASS     M3 family and per-mechanism readiness gates present
PASS     invalid governingLof fail-closed check present
PASS     excluded mechanisms filtered before coverage/contributor aggregation
PASS     existing matrix semantics retained; M4 is additive
PASS     JS line limits under 300
NOT_RUN  native exact-checkout focused Node suite
NOT_RUN  full repository-native VIB/FIT/AIV suites
NOT_RUN  browser
```

## Protected non-goals

No FIT/AIV equation or applicability changes; no benchmark expected-value/tolerance changes; no Mechanical/FIP/Recip/Rotating/Surge/Cavitation numerical qualification; no screening/design/code authority promotion; no Product Freeze; no automatic T1 rules; no M5 work; no required-actions/reference-band policy; no workflow changes; no PR #546 technical work; no T2.9 numerical/source changes.

## Highest risk

A future change to the #429 T2 mechanism policy or mechanism-registry membership must explicitly update M4 policy custody. The policy fingerprint and whole-registry classification check are intended to fail rather than silently reinterpret that change.

## EXACT_NEXT_ACTION

Run independent falsification of the M4 state machine and final branch scope, then open the draft PR from this exact branch without merging it unless the Owner separately authorizes the new PR.