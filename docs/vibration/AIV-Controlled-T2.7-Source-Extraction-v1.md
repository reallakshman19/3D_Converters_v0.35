# AIV Controlled T2.7 Source Extraction v1

Status: **SOURCE-PARITY TOOLING — NUMERICAL PRODUCTION AUTHORITY REMAINS BLOCKED**

## Purpose

The qualification branch can identify the exact controlled Common PDF but the current connector cannot stream that binary for page-level extraction. This tooling makes the next source gate reproducible in a normal checkout without weakening the source pin.

Controlled source:

```text
repository: reallaksh19/Common
commit: aef163a5def3bfe04ca0ba860da05728a27daf42
file: EI - AVIFF Guidelines 2nd Edition.pdf
git blob: 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
T2.7 pages: 59-62
```

## Command

```text
npm run extract:aiv-ei-t27-source -- <path-to-controlled-pdf> \
  --out private-review/aiv-t27-source-manifest.json \
  --text-dir private-review/aiv-t27-pages
```

The extractor requires `pdftotext` on `PATH` unless a binary is supplied with `--pdftotext`.

## Fail-closed source identity

Before extraction, the script calculates the Git blob SHA-1 from the exact PDF bytes using Git's `blob <length>\0` object header and requires an exact match to:

```text
9d3eccc56429411e17c07a579bdebbd13cb0bdc5
```

A different file, re-saved PDF, vendor copy, or web mirror fails with `AIV_T27_SOURCE_MISMATCH`.

## Extraction scope

Only PDF pages 59 through 62 are selected. The page splitter requires exactly four page-separated outputs. The manifest records, for each page:

```text
pageNumber
utf8Bytes
lineCount
textSha256
```

The manifest does **not** embed the copyrighted page text. Reviewer text can be written to the optional private `--text-dir` and should not be committed unless project document-control rules explicitly authorize that copy.

## Qualification consequence

Every generated manifest contains:

```text
productionEquationAuthorized = false
humanEquationReconciliationRequired = true
page61OfficialErrataReconciliationRequired = true
```

Therefore successful extraction is necessary but not sufficient for implementation.

## Human reconciliation gate

A qualified reviewer must compare the private page extracts against the existing trace register and record exact source text/branch predicates for:

```text
AIV-APP-T2-7-EXTENT-001
AIV-UNIT-T2-7-INPUTS-001
AIV-EQ-SOURCE-PWL-001
AIV-CONST-SFF-001
AIV-ASS-155DB-001
AIV-EQ-ATTENUATION-001
AIV-EQ-MULTI-SOURCE-001
AIV-ASS-LOW-NOISE-TRIM-001
AIV-EQ-T2-6-001
```

Page 61 must also be reconciled against the official publisher record:

```text
AIV-EQ-T2-6-FEED-ERRATA-001
```

The existing independent errata benchmark already reproduces the D.2.3 `log10(N)`/`N` values, but that does not replace controlled Common-PDF parity.

## Promotion gate

No production AIV numerical code should be enabled until all of the following exist:

1. exact controlled PDF blob match;
2. four-page extraction manifest for pages 59-62;
3. human-reviewed equation/table/constant trace records;
4. explicit page-61 errata parity disposition;
5. complete D.2.3 final T2-6 endpoint;
6. independent sonic `SFF = 6` benchmark;
7. independent multiple-source benchmark;
8. retained workbook reconciliation;
9. independent vibration-engineer approval.

Until then `VIB.AIV.ACOUSTIC` remains `BLOCKED` and the extraction artifacts are qualification evidence only.
