# AIV T2.7 Reconciliation Contract v1

Status: **HUMAN SOURCE-REVIEW GATE — PRODUCTION EQUATIONS REMAIN UNAUTHORIZED**

## Purpose

`AivT27SourceExtraction.v1` proves that the review starts from the exact pinned Common PDF and binds the review to page hashes for T2.7 pages 59-62. It does not prove that engineering equations, branch predicates, units or errata have been transcribed correctly.

`AivT27Reconciliation.v1` closes that separate human-review step without granting screening or numerical authority.

## Required trace set

The reconciliation record is exact and requires all nine controlled main-guidance trace IDs:

```text
AIV-APP-T2-7-EXTENT-001          page 59
AIV-UNIT-T2-7-INPUTS-001         page 59
AIV-EQ-SOURCE-PWL-001            page 60
AIV-CONST-SFF-001                 page 60
AIV-ASS-155DB-001                 page 60
AIV-EQ-ATTENUATION-001            page 60
AIV-EQ-MULTI-SOURCE-001           page 60
AIV-ASS-LOW-NOISE-TRIM-001       page 61
AIV-EQ-T2-6-001                   page 61
```

Missing, duplicate, additional-substitute or page-moved records do not satisfy the gate.

## Binding to controlled source

Every reconciliation record carries:

```text
sourcePage
sourcePageTextSha256
```

The hash must exactly equal the corresponding page hash in the supplied `AivT27SourceExtraction.v1` manifest.

The reconciliation also binds to:

```text
source.gitBlobSha1
source.extractionManifestSha256
```

so a reviewed record cannot silently be reused with another PDF or another extraction run.

## Required human review fields

A record can become `REVIEWED` only when it carries:

```text
reviewerType = HUMAN_ENGINEER
reviewer     = named reviewer
reviewDate   = YYYY-MM-DD
transcriptionSha256 = sha256:<64 hex>
```

`transcriptionSha256` is the hash of the reviewed engineering transcription maintained under document control. The repository contract does not require copyrighted EI page text to be committed.

AI or anonymous review cannot satisfy this gate.

## Engineering dispositions

Each reviewed item must explicitly disposition:

```text
equationOrRuleDisposition
  TRANSCRIBED_AND_VERIFIED
  RULE_ONLY_NO_EQUATION

branchPredicateDisposition
  RECORDED
  NOT_APPLICABLE

nativeUnitsDisposition
  RECORDED
  NOT_APPLICABLE
```

This prevents a reviewer from marking a source location complete while omitting the branch predicate or unit basis needed to implement it safely.

## Page-61 errata disposition

The two page-61 records have different obligations.

Low-noise-trim rule:

```text
AIV-ASS-LOW-NOISE-TRIM-001
errataDisposition = NOT_AFFECTED_BY_T2_6_FEED_ERRATA
```

T2-6 chain:

```text
AIV-EQ-T2-6-001
errataDisposition = RECONCILED_WITH_AIV-EQ-T2-6-FEED-ERRATA-001
```

Any other value fails verification.

## CLI

Generate a review template from a controlled extraction manifest:

```text
npm run verify:aiv-t27-reconciliation -- \
  private-review/aiv-t27-source-manifest.json \
  --template-out private-review/aiv-t27-reconciliation.json
```

After named human engineering review, verify the completed record:

```text
npm run verify:aiv-t27-reconciliation -- \
  private-review/aiv-t27-source-manifest.json \
  --verify private-review/aiv-t27-reconciliation.json
```

## Verification result

Even a fully complete reconciliation returns:

```text
reconciliationComplete = true
productionEquationAuthorized = false
```

and retains these promotion gates:

```text
COMPLETE_D2_3_FINAL_T2_6_ENDPOINT
INDEPENDENT_SONIC_SFF6_BENCHMARK
INDEPENDENT_MULTI_SOURCE_BENCHMARK
RETAINED_WORKBOOK_RECONCILIATION
INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW
```

Therefore source reconciliation is necessary but cannot by itself promote `VIB.AIV.ACOUSTIC` to benchmark or screening execution.

## CI behavior

The AIV controlled-source workflow generates the reconciliation template from the real pinned PDF extraction and verifies that:

- all nine trace records exist;
- all are still `PENDING`;
- page hashes are bound from the extraction manifest;
- T2-6 is page 61 with errata disposition still pending;
- production equation authority remains false.

CI intentionally does **not** auto-complete human review.
