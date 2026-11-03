# AIV Independent Promotion Review v1

## Purpose

This document defines the final human handoff for `VIB.AIV.ACOUSTIC` after all six qualification prerequisites are satisfied.

The independent review is **not** an automated authority transition. It records an independent vibration engineer's recommendation and binds that recommendation to the exact promotion-readiness artifact and prerequisite evidence hashes.

Current authority remains:

```text
calculationState      = BLOCKED
qualificationState    = BLOCKED
engineeringAuthority  = NONE
productionEquationAuthorized = false
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
```

## Entry condition

The review package can be created only from:

```text
AivQualificationPromotionReadiness.v1
status = READY_FOR_INDEPENDENT_AUTHORITY_REVIEW
eligibleForAuthorityReview = true
```

The planner must contain exactly six prerequisite gates with `SATISFIED` state and the separate `INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW` gate must still be `UNSATISFIED`.

Each prerequisite gate must retain its verification schema and SHA-256 artifact identity.

## Browser handoff

When all prerequisites are satisfied, the qualification workspace exposes:

```text
Export independent engineer review files
```

The browser exports:

```text
aiv-promotion-readiness.json
aiv-independent-vibration-engineer-review-template.json
```

The exact bytes of `aiv-promotion-readiness.json` are SHA-256 hashed with Web Crypto. The generated review template is bound to that hash.

Implementation:

```text
tabs/vibration-aiv-independent-review-package.js
tabs/vibration-aiv-promotion-view.js
tabs/vibration-aiv-qualification-tab.js
```

## Review contract

```text
AivIndependentVibrationEngineerPromotionReview.v1
```

The template starts with:

```text
review.state = PENDING
reviewerType = null
authorityTransitionApplied = false
```

The review requires a named:

```text
HUMAN_VIBRATION_ENGINEER
```

with reviewer name, organization, role, ISO review date, rationale, conditions, and explicit attestations covering independence, controlled-source evidence, qualification evidence, benchmark limitations, and the continuing prohibition on screening/design use.

## Allowed recommendations

```text
RECOMMEND_BENCHMARK_ONLY_PROMOTION
REWORK_REQUIRED
REJECT_PROMOTION
```

Only `RECOMMEND_BENCHMARK_ONLY_PROMOTION` may name:

```text
recommendedAuthorityTarget = BENCHMARK_ONLY
```

This is still a recommendation artifact. It does **not** modify source code, pending definitions, registry authority, calculation state, or screening/design authority.

## Verification

CLI:

```bash
npm run verify:aiv-independent-promotion-review -- \
  aiv-promotion-readiness.json \
  --verify aiv-independent-vibration-engineer-review.json
```

Template generation from an already-ready promotion artifact:

```bash
npm run verify:aiv-independent-promotion-review -- \
  aiv-promotion-readiness.json \
  --template-out aiv-independent-vibration-engineer-review-template.json
```

Verifier implementation:

```text
scripts/verify-aiv-independent-promotion-review.mjs
converters/vibration/aiv/aiv-independent-promotion-review.js
```

Successful verification returns:

```text
AivIndependentVibrationEngineerPromotionReviewVerification.v1
reviewComplete = true
authorityTransitionApplied = false
productionEquationAuthorized = false
screeningAuthority = NOT_AUTHORIZED
designAuthority = false
```

For a recommendation to promote to `BENCHMARK_ONLY`, the verifier returns:

```text
nextAction = SEPARATE_REVIEWED_AUTHORITY_TRANSITION_CHANGE_REQUIRED
```

That next change must be separately reviewed. The independent review artifact cannot self-promote the method.

## What the reviewer must review

The human reviewer should review the complete prerequisite evidence package, including:

```text
AivT27ReconciliationVerification.v1
AivD23Flm1ReconciliationVerification.v1
AivWorkedExampleResultScopeReviewVerification.v1
AivIndependentBenchmarkReviewVerification.v1
AivWorkbookReconciliationVerification.v1
```

The promotion-readiness artifact contains the SHA-256 identity and verification schema for each prerequisite gate. A changed prerequisite artifact requires regeneration of the promotion-readiness artifact and independent review template.

## Explicit non-goals

This review process does not:

- implement the AIV numerical kernel;
- authorize production equations automatically;
- enable benchmark execution automatically;
- authorize screening;
- authorize design use;
- infer an engineer's signature or approval;
- allow an AI or CI job to mark the human review complete.

## After a human recommendation

If the independent engineer recommends `BENCHMARK_ONLY`, the next repository change is a **separate authority-transition change**. That change must explicitly identify the verified independent-review artifact and its SHA-256 identity, update only the intended authority state, and preserve the distinction between benchmark qualification and later screening authority.

No numerical AIV implementation should be treated as authorized merely because the review template exists.
