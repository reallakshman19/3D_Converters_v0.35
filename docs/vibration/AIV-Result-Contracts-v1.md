# AIV Result Contracts v1

## Purpose

This document freezes the product-facing result scopes for `VIB.AIV.ACOUSTIC` before any numerical AIV equation is implemented.

The contracts are intentionally instantiated while method authority remains blocked so later numerical work has a fixed place to put source, assessment, and line/case outputs without collapsing unlike engineering quantities into one generic result.

Current authority remains:

```text
calculationState      = BLOCKED
qualificationState    = BLOCKED
engineeringAuthority  = NONE
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
```

Every numerical result field therefore remains `null` with result status `NOT_CALCULATED`.

`NOT_CALCULATED` is not equivalent to zero, pass, safe, not applicable, or a screening disposition.

## Contract set

```text
AivSourceResult.v1
AivAssessmentResult.v1
AivLineCaseSummary.v1
AivResultSet.v1
```

Implementation:

```text
converters/vibration/aiv/aiv-result-contracts.js
```

Read-only UI projection:

```text
tabs/vibration-aiv-result-view.js
```

## 1. Source Result

Identity:

```text
Source Canonical ID + Operating Case
```

Engineering ownership:

```text
source process/device evidence
→ raw source acoustic result
→ sonic modifier
→ trim modifier
→ effective source acoustic result
```

Frozen numerical fields:

```text
rawSourcePwlDb
sonicFlowFactorDb
trimReductionDb
effectiveSourcePwlDb
thresholdBranch
```

While blocked, each is `null`.

The contract deliberately separates raw and effective source PWL so the worked-example raw recycle value and the low-noise-trim-adjusted report value cannot both be presented under an ambiguous generic `PWL` field.

A Source Result may exist with zero Source→Assessment relationships. This is expected for a source record that has been loaded but has no explicit assessment relationship in the current working dataset.

## 2. Assessment Result

Identity:

```text
Assessment Canonical ID + Operating Case
```

An Assessment Result groups all Source→Assessment readiness rows for the same assessment and case. This supports multiple sources contributing to one welded discontinuity without duplicating assessment geometry.

Frozen fields include:

```text
contributingSourceCanonicalIds
sourceContributionsAtPoint[]
combinedPointPwlDb
geometry
t26Intermediates
lof
```

Each source-contribution shell retains:

```text
sourceCanonicalId
physicalDistance
applicabilityDisposition
simultaneousSourceGroup
readinessStatus
topologyPath
relationshipTrace
```

The topology path remains connectivity evidence only. Its `physicalDistanceMm` remains non-authoritative/null; engineering physical distance comes from Source→Assessment evidence.

While blocked:

```text
pointPwlDb         = null
combinedPointPwlDb = null
t26Intermediates   = null
lof                = null
```

## 3. Line / Case Summary

Identity:

```text
Line + Operating Case
```

A Line / Case Summary groups Assessment Results. It records the assessment/source identities that participate in the line/case but does not choose a governing result until aggregation semantics are qualified.

Frozen fields include:

```text
lof
controllingAssessmentCanonicalId
controllingSourceCanonicalIds
assessmentCount
assessmentCanonicalIds
sourceCanonicalIds
```

While blocked:

```text
lof                              = null
controllingAssessmentCanonicalId = null
controllingSourceCanonicalIds    = []
aggregationState                  = NOT_PERFORMED_AUTHORITY_BLOCKED
```

This prevents the UI from guessing that the only loaded assessment is automatically the controlling assessment, and it prevents a worked-example line-level LOF from being substituted for a specific discontinuity LOF.

## Result Set

`AivResultSet.v1` is a read-only envelope containing:

```text
sourceResults[]
assessmentResults[]
lineCaseSummaries[]
```

It is constructed only from `AivReadinessTableEnvelope.v2`, which means result scope identity is based on the split input/readiness model rather than the transitional combined `AivSourceCaseCsv.v1` model.

The builder is:

```text
buildAivBlockedResultSet(readinessEnvelope)
```

The builder performs grouping/projection only. It contains no AIV numerical equation, coefficient, threshold, pressure conversion, attenuation calculation, logarithmic dB summation, T2-6 calculation, LOF calculation, or line-result assessment rule.

## Controlled D.2.3 behavior

Loading EI D.2.3 currently creates:

```text
Source Result shells      2
Assessment Result shells  1
Line/Case Summary shells  1
```

The controlled published benchmark reference values remain in the benchmark evidence layer and **do not populate result fields** while authority is blocked.

Therefore, even when the benchmark panel visibly shows published values such as relief source PWL or first-discontinuity LOF, the frozen result tables still show `NOT_CALCULATED`.

This is intentional and is a qualification boundary.

## Future numerical mapping

Only after the human engineering gates are closed and a qualification-only numerical kernel is authorized may central numerical execution populate these fields.

Planned stage mapping:

```text
qualified source calculation
→ AivSourceResult.v1 numerical fields

qualified attenuation / simultaneous-source / T2-6 calculation
→ AivAssessmentResult.v1 numerical fields

qualified assessment-to-line aggregation
→ AivLineCaseSummary.v1 numerical fields
```

Single-row and batch workflows must populate the same contracts through the same central Engineering Calculation kernel.

## Permanent constraints

- no UI-side equations or thresholds;
- no zero placeholders for missing numerical results;
- no generic unscoped `PWL` or `LOF` field that mixes result scopes;
- no automatic controlling assessment/source before aggregation authority exists;
- no production/screening/design authority inferred from result-shell existence;
- published worked-example values remain evidence until a qualified calculation reproduces them through the controlled kernel.
