# AIV D.2.3 FLM1 Reconciliation Contract v1

Status: **HUMAN ENGINEERING DISPOSITION REQUIRED — PRODUCTION AUTHORITY BLOCKED**

Method:

```text
VIB.AIV.ACOUSTIC
```

## Controlled evidence being reconciled

Worked-example PDF:

```text
reallaksh19/Common
commit fb549185b9b27edc2379734240320a85c5bef9f6
EI examples.pdf
Git blob 1ddef94f81bd30570d1b1f86b1d3e2acdcc17dec
D.2.3 High Frequency Acoustic Excitation
```

Main-guidance trace:

```text
AIV-EQ-T2-6-001
Flowchart T2-6, page 61
```

Official page-61 errata trace:

```text
AIV-EQ-T2-6-FEED-ERRATA-001
```

## Discrepancy

The worked example publishes:

```text
Dext = 168.3 mm
dext = 60.3 mm
Dext/dext = 2.791
FLM1 = 1.2133
```

Direct evaluation of the traced T2-6 FLM1 relation at the displayed dimensions gives:

```text
exact ratio from displayed diameters = 2.7910447761194033
recalculated FLM1                    = 1.2109758194311824
published FLM1                       = 1.2133
absolute difference                  = 0.002324180568817627
relative difference                  = 0.001915586061829413
```

The D.2.3 downstream branch remains unchanged at the displayed precision:

```text
published FLM2 = 0.2009
published Lf   = 0.31
published LOF  = 0.29
independent final LOF disposition = 0.29
```

This invariance does not authorize ignoring the FLM1 difference.

## Reconciliation record

`scripts/verify-aiv-d23-flm1-reconciliation.mjs` defines:

```text
AivD23Flm1Reconciliation.v1
```

The record is bound to:

1. the exact pinned EI examples Git blob;
2. the extracted D.2.3 section SHA-256;
3. the D.2.3 extraction-manifest SHA-256;
4. a reviewed T2-6 transcription SHA-256;
5. the official page-61 errata trace.

A complete record requires:

```text
review.state       = REVIEWED
review.reviewerType = HUMAN_ENGINEER
review.reviewer    = named person
review.reviewDate  = YYYY-MM-DD
```

and one explicit disposition:

```text
PUBLISHED_EXAMPLE_VARIANCE_ACCEPTED
MAIN_GUIDANCE_TRANSCRIPTION_CHANGES_RECALCULATION
SOURCE_CORRECTION_IDENTIFIED
```

The reviewer must also freeze:

- expected FLM1 benchmark value;
- absolute benchmark tolerance;
- engineering rationale;
- implementation note explaining how the published `1.2133` and the reviewed equation result are handled.

`UNRESOLVED`, anonymous review, or AI-only review cannot close the gate.

## Authority boundary

A successful reconciliation returns:

```text
reconciliationComplete       = true
productionEquationAuthorized = false
screeningAuthority           = NOT_AUTHORIZED
designAuthority              = false
```

It closes only:

```text
RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC
```

It cannot close the T2.7 source-review gate, sonic benchmark, multi-source benchmark, workbook reconciliation, or independent promotion review.

## CI behavior

CI may generate a section-hash-bound **PENDING** FLM1 reconciliation template after successful extraction of the exact `EI examples.pdf` object. CI must not:

- invent a reviewed T2-6 transcription hash;
- select an engineering disposition;
- set a benchmark tolerance;
- mark the human review complete.

At the time this contract was added, GitHub Actions did not start the job because the repository reported an Actions-budget limitation. Therefore no direct exact-PDF CI result is claimed yet.
