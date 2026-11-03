# AIV Controlled D.2.3 PDF Extraction v1

Status: **EXACT SOURCE EXTRACTION GATE IMPLEMENTED — EXECUTION/PROMOTION STILL BLOCKED**

Method:

```text
VIB.AIV.ACOUSTIC
```

## Exact source pin

```text
repository: reallaksh19/Common
commit: fb549185b9b27edc2379734240320a85c5bef9f6
file: EI examples.pdf
Git blob: 1ddef94f81bd30570d1b1f86b1d3e2acdcc17dec
size: 1,602,640 bytes
locator: Appendix D / D.2.3 High Frequency Acoustic Excitation
printed-page locator: 183-185
```

The extraction command is:

```bash
npm run extract:aiv-ei-d23-source -- \
  "../Common/EI examples.pdf" \
  --out /tmp/aiv-d23-source-manifest.json \
  --section-text-out /tmp/aiv-d23-private-review.txt
```

The optional section text is a private reviewer artifact and is not committed.

## Fail-closed source identity

`scripts/extract-aiv-ei-d23-source.mjs` computes Git's blob identity from the actual file bytes:

```text
SHA1("blob " + byteLength + NUL + bytes)
```

Both the expected blob ID and expected file size must match. A same-name or re-exported PDF is rejected.

## D.2.3 section discovery

The extractor converts the byte-verified PDF with `pdftotext -layout`, splits the result at PDF page boundaries, and requires exactly one page containing both:

```text
D.2.3
High Frequency Acoustic Excitation
```

The D.2.3 section continues until `D.2.4 Mechanical Excitation`; if D.2.4 begins on the final D.2.3 page, content after that heading is excluded from the D.2.3 section hash.

The committed manifest contains hashes and structured observations, not EI page text.

## Published anchors required

The exact pinned D.2.3 section must contain evidence for all of the following before the direct-PDF gate closes:

```text
recycle temperature            136.7 degC
relief source PWL              164.7 dB
recycle source PWL             159.4 dB
diameter input                 168.3 / 60.3
diameter ratio                 2.791
published FLM1                 1.2133
published FLM2                 0.2009
published N after FLM2         1.95E9
published Lf                   0.31
published final LOF            0.29
```

The anchor check proves that the values encoded in qualification evidence are present in the exact pinned PDF section. It does not prove that every published arithmetic step is internally consistent.

## FLM1 arithmetic remains a separate gate

The main T2-6 relation currently traced for `Dext/dext < 10` is evaluated independently at the displayed D.2.3 ratio:

```text
Dext/dext = 168.3 / 60.3 = 2.791044776...
independent FLM1 = 1.210975819...
published FLM1   = 1.2133
absolute delta   = 0.002324181...
```

This is intentionally represented as:

```text
PUBLISHED_FLM1_ARITHMETIC_RECONCILIATION_REQUIRED
```

The direct-PDF extraction gate does **not** choose one value over the other. The disposition must be made against the controlled main-guidance T2-6 transcription and reviewed worked-example evidence.

The downstream D.2.3 published endpoint remains:

```text
FLM2 = 0.2009
N     = 1.95E9
Lf    = 0.31
LOF   = 0.29
```

and independent recalculation with the displayed-input FLM1 still leads to the same `LOF = 0.29` branch. This invariance is benchmark evidence only, not permission to ignore the FLM1 discrepancy.

## Manifest

The generated `AivD23ExamplesSourceExtraction.v1` records:

- exact source Git blob, size and SHA-256;
- PDF-to-text tool/version;
- total PDF page count;
- actual PDF page numbers containing D.2.3;
- SHA-256 for each extracted D.2.3 page;
- SHA-256 for the bounded D.2.3 section text;
- required published-anchor observations;
- unchanged authority state.

It explicitly requires:

```text
directPinnedPdfExtractionComplete            = true
publishedFinalLofObserved                     = true
publishedFlm1ArithmeticReconciliationRequired = true
productionEquationAuthorized                  = false
screeningAuthority                            = NOT_AUTHORIZED
designAuthority                               = false
```

## CI gate

`.github/workflows/vibration-aiv-controlled-source.yml` now checks out two separately pinned Common revisions:

1. main EI guidance at `aef163a5def3bfe04ca0ba860da05728a27daf42`;
2. worked-example PDF at `fb549185b9b27edc2379734240320a85c5bef9f6`.

The workflow runs both controlled extraction commands and the focused AIV qualification tests. The private D.2.3 section text remains in the runner temporary directory and is not published as a repository artifact.

At the time this gate was added, repository GitHub Actions jobs were not starting because GitHub reported an Actions-budget limitation. Therefore a successful exact-PDF CI extraction is not yet claimed.

## Promotion consequence

Closing the direct-PDF extraction gate removes:

```text
DIRECT_EXTRACT_PINNED_EI_EXAMPLES_PDF
```

It does **not** remove:

```text
RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC
CONTROLLED_T2_7_HUMAN_RECONCILIATION
INDEPENDENT_SONIC_SFF6_BENCHMARK
INDEPENDENT_MULTI_SOURCE_BENCHMARK
RETAINED_WORKBOOK_RECONCILIATION
INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW
```

`VIB.AIV.ACOUSTIC` remains BLOCKED until the applicable qualification gates are independently closed.
