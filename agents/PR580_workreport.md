# PR580 — VIB-EI-MAINLINE-01 fail-closed EI main-line aggregation

## Recovery control

```text
PR = #580
ISSUE = #579
BRANCH = agent/vib-ei-mainline-579-aggregation
BASE_MAIN = 02de308ad91a569123fb166f7598ee59915e22ff
IMPLEMENTATION_HEAD_BEFORE_PR_REPORT = 76e603175777b26f5875bbba0d2d44851f325d67
TAKEOVER_QUALIFICATION = QUALIFIED_FOR_EI_MAINLINE_AGGREGATION
APPENDIX_A_COMMENT = 5312940137
APPENDIX_A_SCORE = 98/100
PR_STATE = DRAFT_OPEN
MERGE_AUTHORITY = OWNER_ONLY_NOT_GRANTED_FOR_THIS_NEW_PR
```

## Mission

Close M4 of #429 by adding a governed EI main-line aggregation contract that emits a number only after exact-scope T1 disposition, main-line coverage/completeness, current Screening qualification and M3 benchmark readiness are all proven.

```text
T1 identification
  -> M1/M2 main-line subset coverage/completeness
  -> M3 benchmark readiness
  -> qualified current child governingLof values
  -> EiMainLineAggregation.v1
```

## Governed policy

Included current #429 T2 mechanisms:

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

Excluded from this aggregate only:

```text
corrugationPulsation  OUTSIDE_CURRENT_429_T2_AGGREGATION_LIST
slugFlow              SPECIALIST_ROUTE_OUTSIDE_CURRENT_429_T2_AGGREGATE
thermowells           T4_INTRUSIVE_ELEMENT_CONTINUATION
smallBoreConnections  T3_SBC_CONTINUATION
```

Every mechanism in the governed family registry is classified exactly once by M4 policy.

## Contract

`converters/vibration/ei-mainline-aggregation.js` exports:

```text
EI_MAIN_LINE_AGGREGATION_SCHEMA
EI_MAIN_LINE_AGGREGATION_POLICY_SCHEMA
EI_MAIN_LINE_AGGREGATION_POLICY_REVISION
EI_MAIN_LINE_MECHANISM_IDS
EI_MAIN_LINE_AGGREGATION_POLICY
eiMainLineAggregationPolicyFingerprint()
evaluateEiMainLineAggregation()
```

Output states:

```text
COMPLETE       -> eiMainLineLof = deterministic maximum qualified contributor LOF
INCOMPLETE     -> eiMainLineLof = null
NOT_APPLICABLE -> eiMainLineLof = null
```

No conservative substitution is implemented.

## Fail-closed chain

The evaluator independently enforces:

```text
caller cannot override policy / benchmark compliance / active capabilities
all evidence exact line/case/canonical scope
T1 completeness over governed M4 set
required assessment coverage complete
M3 family readiness = READY
required mechanism M3 state = READY
IMPLEMENTED_SCREENING
qualification.effective = SCREENING
assessmentState = CALCULATED
resultState = CURRENT_RESULT
result.governingLof is number, finite, >= 0
```

Missing, unresolved, stale, candidate, unqualified, unbenchmarked, malformed or invalid-LOF evidence therefore cannot create a partial numeric maximum.

## Production consumer

`tabs/vibration-integrity-mechanisms.js` now exposes:

```text
eiMainLineAggregation
```

without replacing:

```text
screeningGoverning
candidateGoverning
retainedScreeningGoverning
retainedCandidateGoverning
implementedGoverning
retainedImplementedGoverning
full-family requiredAssessmentSet / mechanismCoverage / assessmentCompleteness
fullScreeningGoverningEstablished = false
```

The matrix reuses the same assessment-set collection for full-family coverage and M4, preventing a second evidence store.

## Authority boundary

```text
authorityPromotion = false
contributorQualificationRequired = SCREENING
designAuthority = false
codeCompliance = false
fullVibrationAssessmentComplete = false
productFreezeImplied = false
```

Permanent distinctions:

```text
EI_MAIN_LINE_COMPLETE != FULL_VIBRATION_ASSESSMENT_COMPLETE
EI_MAIN_LINE_LOF != UNIVERSAL_VIBRATION_RISK
M4 != PRODUCT_FREEZE
M4 != DESIGN_OR_CODE_AUTHORITY
```

## Source identities

Pinned at M4 qualification:

```text
main                                  02de308ad91a569123fb166f7598ee59915e22ff
mechanism registry                    cab12923b3da58769eddfd84cf4335e58ce7b507
identification producer               18a8f8559f61a0e3e7204a1759d817bf28bd1314
coverage/completeness                  517f50f067d7d91dcf72570a76463f62fd619aad
M3 benchmark registry                 6053ab7fd948611426c763b16c5e215e7e6b8d4d
active engineering calculation registry 47e55c8a8dcf63536b897c63401f16b5686857e1
pre-M4 matrix                         e21bc9b3fa03752ea8c976e3bc07e72547b74550
```

## Changed-file ledger before this report

```text
NEW  converters/vibration/ei-mainline-aggregation.js
NEW  tests/vibration-ei-mainline-aggregation.test.mjs
EDIT tabs/vibration-integrity-mechanisms.js
NEW  agents/WIP-vib-ei-mainline-01_workreport.md
NEW  .backups/connector-20260817-vib-ei-mainline-579/tabs/vibration-integrity-mechanisms.js
```

No workflow, benchmark oracle, method equation, authority, Product Freeze, #546 technical or T2.9 numerical/source file is changed.

## Backup custody

Exact pre-edit matrix blob `e21bc9b3fa03752ea8c976e3bc07e72547b74550` is preserved under:

```text
.backups/connector-20260817-vib-ei-mainline-579/tabs/vibration-integrity-mechanisms.js
```

The connector runtime lacks the local repository backup CLI, so this is exact Git-source reuse rather than a claimed CLI execution.

## Protective regression

`tests/vibration-ei-mainline-aggregation.test.mjs` was committed before the evaluator existed.

Primary falsifier:

> Valid current FIT Screening LOF + only FIT identified must remain `INCOMPLETE` with `eiMainLineLof=null` because the remaining governed T2 dispositions are missing.

Other falsifiers cover:

```text
unresolved identification
all explicit N/A
FIT-only with seven explicit N/A
FIT+AIV maximum
stale FIT
Mechanical candidate
forged Screening Mechanical blocked by M3
invalid NaN/Infinity/negative/missing LOF
multiple child contributors
high SBC/TW/slug/corrugation values ignored
cross-scope evidence
matrix semantic/authority separation
```

## Validation ledger at implementation head

```text
PASS     base = 02de308ad91a569123fb166f7598ee59915e22ff / behind 0
PASS     M3 #578 landed before M4 mutation
PASS     Appendix A 98/100 before mutation
PASS     open implementation overlap = SAFE
PASS     policy classifies governed mechanism universe exactly once
PASS     no caller policy/benchmark/active-capability authority seam
PASS     exact-scope gate present
PASS     M3 family and mechanism readiness consumed
PASS     invalid governingLof fail-closed gate present
PASS     existing matrix fields retained; M4 additive
PASS     evaluator = 259 physical lines (<300)
PASS     focused test = 233 physical lines (<300)
PASS     matrix = 284 physical lines (<300)
PASS     independent state-machine mirror = 8/8 material falsifiers
PASS     PR mergeability after GitHub computation = true
PASS     review submissions = 0
PASS     review threads = 0
PASS     changed paths = exact bounded M4 seam
NOT_RUN  native exact-checkout focused Node test
NOT_RUN  full repository-native VIB/FIT/AIV suites
NOT_RUN  browser
NOT_RUN  implementation-head hosted Actions: no PR-triggered run returned
```

The 8/8 mirror is supporting independent logic evidence only; it is not execution of the repository module.

## Protected non-goals

No FIT/AIV equations/coefficients/applicability changes; no benchmark expected-value/tolerance changes; no new Mechanical/FIP/Recip/Rotating/Surge/Cavitation qualification; no screening/design/code promotion; no Product Freeze; no automatic T1 applicability; no M5; no reference-band/action/finding policy; no workflow changes; no PR #546 technical work; no T2.9 numerical/source work.

## Highest risk

M4 policy is a governed programme boundary. A future #429 mechanism-map change must update the policy explicitly; policy whole-universe classification/fingerprint are intended to fail rather than silently alter aggregation membership.

## EXACT_NEXT_ACTION

Re-query #580 at the final report head, classify any exact-head hosted workflow by actual job steps, update PR/issue metadata with final SHA and validation truth, and leave draft/unmerged unless the Owner explicitly authorizes this new PR merge.