# PR564 — SBC reserved Type 1–4 scaffold + capability lifecycle

## Mission

Implement issue #563 as a fail-closed, implementation-ready scaffold for `VIB.SBC.SMALL_BORE` and introduce the reusable capability lifecycle convention:

```text
RESERVED -> QUALIFIED -> ACTIVE -> DEPRECATED
```

Parent family gate: #429. Type-3 evidence/source work remains separately governed by #514. Roadmap reference: PR #560.

## Pull request

```text
PR = #564
branch = agent/sbc-reserved-vertical-scaffold
base at creation = 042025bfe3f9c60ba11d8c653f98af78ac587a64
engineering implementation head at PR creation = 1872e3153359e5e5af6ecb5eea7d92aaacd91698
state = OPEN / DRAFT
MERGE_AUTHORITY = OWNER_ONLY / NOT_GRANTED
```

Report-only commits after the implementation head do not change engineering behavior. Always re-read live PR head/base/checks before takeover or implementation.

## Classification

```text
ENGINEERING_CRITICAL
scope = SCAFFOLD / GUARDRAIL / UI PLACEHOLDER ONLY
```

No numerical SBC implementation, master publication, screening promotion, design authority, or Type-3 source-conflict resolution is authorized by this PR.

## Delivered capability

### 1. Reusable capability lifecycle

`converters/engineering-calculations/lifecycle.js`

Defines and validates:

```text
RESERVED -> QUALIFIED -> ACTIVE -> DEPRECATED
```

Rules:

- only the immediate forward transition is allowed;
- `RESERVED` permits neither benchmark nor production execution;
- `QUALIFIED` permits benchmark execution metadata but not production execution;
- `ACTIVE` permits production execution metadata;
- `DEPRECATED` has no forward transition.

This is a **capability lifecycle**. It does not replace method/data qualification states or vibration-master publication lifecycle.

### 2. SBC Type 1–4 manifest

`converters/vibration/sbc/vertical-manifest.js`

Pins:

```text
public ID = VIB.SBC.SMALL_BORE
AssessmentUnitType = SBC_CONNECTION
lifecycle = RESERVED
```

Implementation slots:

```text
TYPE_1 -> EI_APPENDIX_D5 -> independent B2 -> calculateSbcType1
TYPE_2 -> EI_APPENDIX_D6 -> independent B2 -> calculateSbcType2
TYPE_3 -> EI_APPENDIX_D7 -> independent B2 -> calculateSbcType3
TYPE_4 -> EI_APPENDIX_D8 -> independent B2 -> calculateSbcType4
```

Every slot has:

- owning issues;
- required trace namespaces;
- B1/B2 benchmark requirements;
- blocked dependencies;
- future implementation file/function seam;
- `executionAllowed=false`.

Type 3 additionally preserves:

```text
issue #514
SBC_T3_CURVES_BLOCKED_SOURCE_DATA_CONFLICT
SBC_TYPE3_INDEPENDENT_B2_NOT_FROZEN
EXISTING_TYPE3_CANDIDATE_NOT_PRODUCTION_AUTHORITY
```

### 3. Main-line authority guardrail

The manifest requires:

```text
sourceContract = QUALIFIED_EI_MAIN_LINE_ASSESSMENT
fitOnlyAccepted = false
assessmentCompletenessRequired = true
unknownMainLineRule = SOURCE_QUALIFICATION_REQUIRED_BEFORE_IMPLEMENTATION
```

A future agent must not wire SBC to FIT LOF alone.

### 4. Reserved type functions / dispatcher

Files:

```text
converters/vibration/sbc/reserved-result.js
converters/vibration/sbc/reserved-kernel.js
converters/vibration/sbc/type1/reserved.js
converters/vibration/sbc/type2/reserved.js
converters/vibration/sbc/type3/reserved.js
converters/vibration/sbc/type4/reserved.js
```

Reserved execution returns implementation/benchmark/blocker metadata only.

Permanent scaffold invariant:

```text
reserved result has NO `lof` field
executionAllowed = false
status = RESERVED
```

### 5. Specialized public SBC placeholder

`converters/engineering-calculations/adapters/vibration-sbc-reserved.js`

The public catalogue ID remains `VIB.SBC.SMALL_BORE`, but the placeholder is now informative and machine-readable:

```text
lifecycle = RESERVED
calculationState = BLOCKED
qualificationState = BLOCKED
executionModes = []
qualificationIssue = #563
family gate = #429
Type-3 evidence = #514
```

`pending-definitions.js` retains the public ID in the pending list and substitutes this specialized reserved definition. SBC is NOT added to the active registry.

### 6. UI placeholder convention

`tabs/engineering-calculation-console-sections.js`

Generic/backward-compatible hook:

- `definitionState()` prefers capability lifecycle when present;
- blocked definitions can expose lifecycle-aware `blockedReason`;
- Basis shows Lifecycle separately from Method state.

Effect for SBC:

```text
catalog / Vibration landing pill = RESERVED
qualification issue = #563
blocked guidance = issue #563 + family gate #429
Type-3 applicability guidance = issue #514
Calculate = unavailable
```

The Vibration family landing file itself was not modified; it already consumes `definitionState()`.

## Authority invariants

1. `VIB.SBC.SMALL_BORE` remains fail-closed.
2. No reserved path returns numerical SBC LOF.
3. Type 1–4 are explicit separate implementation branches.
4. Type-3 candidate code is not production authority.
5. T3 curves remain quarantined.
6. D7 is validation evidence, not calibration input.
7. SBC requires qualified EI main-line assessment; FIT alone is insufficient.
8. B3/B4 regressions do not replace the independent B2 family.
9. Code existence does not advance lifecycle.
10. Authority promotion remains a separate reviewed change.

## Coordination / overlap

At PR creation, exact PR #546 changed files were:

```text
ValidationRecords/VibrationSBC/ProductionFreeze/SBC-AC1-local-check.json
ValidationRecords/VibrationSBC/SourceReconciliation/SBC-T3-AdvancedAnalysis-76eb-source-reconciliation-v1.json
agents/SBC_AC1_local_check_addendum.md
agents/SBC_AC1_workreport.md
scripts/validate-vibration-sbc-type3-production-freeze-browser.mjs
scripts/vibration-sbc-type3-browser-fixture.mjs
```

PR564 has zero exact-file overlap with that set and does not attempt to solve #546.

## Existing-file backup custody

Normal repository backup CLI could not be executed in this connector-only runtime. Exact pre-edit blobs were retained and repository backup copies were committed before edits:

```text
converters/engineering-calculations/pending-definitions.js
pre-edit blob = 8182b490f60343301e74fb56a717330109a8f612
backup = .backups/connector-20260816-sbc563/converters/engineering-calculations/pending-definitions.js

 tabs/engineering-calculation-console-sections.js
pre-edit blob = da46d582bd97e556719dbcc9f744242fb713deb8
backup = .backups/connector-20260816-sbc563/tabs/engineering-calculation-console-sections.js
```

This is explicit fallback custody; it is NOT a claim that `node utils/backup.js save ...` ran.

## Changed-file ledger at PR creation

```text
.backups/connector-20260816-sbc563/converters/engineering-calculations/pending-definitions.js
.backups/connector-20260816-sbc563/tabs/engineering-calculation-console-sections.js
agents/WIP-sbc563_workreport.md                  (to be replaced by this PR report)
converters/engineering-calculations/adapters/vibration-sbc-reserved.js
converters/engineering-calculations/lifecycle.js
converters/engineering-calculations/pending-definitions.js
converters/vibration/sbc/reserved-kernel.js
converters/vibration/sbc/reserved-result.js
converters/vibration/sbc/type1/reserved.js
converters/vibration/sbc/type2/reserved.js
converters/vibration/sbc/type3/reserved.js
converters/vibration/sbc/type4/reserved.js
converters/vibration/sbc/vertical-manifest.js
docs/vibration/SBC-Implementation-Scaffold-v1.md
tabs/engineering-calculation-console-sections.js
tests/vibration-sbc-reserved-scaffold.test.mjs
```

## Validation truth

```text
GitHub base/head compare and exact changed-file inventory   PASS
PR #546 exact-file non-overlap                              PASS
exact lifecycle/manifest/adapter source re-fetch            PASS
regression test source committed                            PASS (artifact/source inspection only)
node --test tests/vibration-sbc-reserved-scaffold.test.mjs  NOT_RUN / ENVIRONMENT_BLOCKED
full private checkout                                       NOT_RUN / ENVIRONMENT_BLOCKED
browser execution                                            NOT_RUN / NOT_REQUIRED_FOR_SCAFFOLD
```

Environment observation:

```text
raw.githubusercontent.com DNS resolution = blocked
```

Do not convert test-source inspection into runtime PASS.

## Regression file

`tests/vibration-sbc-reserved-scaffold.test.mjs` is intended to prove in a normal checkout:

- only immediate lifecycle transitions are allowed;
- RESERVED/QUALIFIED/ACTIVE execution semantics remain distinct;
- all four Type slots exist;
- D5/D6/D7/D8 + independent B2 requirements are present;
- Type-3 blockers and #514 remain present;
- reserved kernel cannot emit `lof`;
- public definition validates and remains BLOCKED;
- pending registry has exactly one SBC definition;
- generic console shows RESERVED / #563 / BLOCKED separately;
- Vibration landing shows RESERVED / Issue #563 / issue #514 guidance.

## Highest risk

A future agent may mistake a completed type function or green unit test for lifecycle/authority promotion. The manifest/lifecycle must remain a consumed runtime/UI contract, and transitions must not be advanced in the same patch merely because implementation code now exists.

## Next implementation sequence

Do not start with Type-3 activation.

Recommended continuation under #563 / follow-on type issues:

```text
1. run the committed scaffold regression in a real checkout
2. freeze SBC-Engineering-Method-Specification-v1
3. freeze B1/B2 benchmark registry before production type math
4. implement/qualify Type 1 (D5 + B2)
5. implement/qualify Type 2 (D6 + B2)
6. implement/qualify Type 3 (D7 + B2; retain source quarantine until resolved)
7. implement/qualify Type 4 (D8 + B2)
8. build common SBC router/assessment/action contract
9. only then propose RESERVED -> QUALIFIED
10. ACTIVE remains a separate authority decision
```

## EXACT_NEXT_ACTION

In a native/private checkout of PR #564, execute:

```bash
node --test tests/vibration-sbc-reserved-scaffold.test.mjs
```

If any assertion fails, keep lifecycle `RESERVED`, record the exact failure, and fix the scaffold only. Do not begin numerical Type 1–4 implementation or any lifecycle transition until this scaffold regression passes and the controlled SBC method/benchmark work is started under its owning issue.
