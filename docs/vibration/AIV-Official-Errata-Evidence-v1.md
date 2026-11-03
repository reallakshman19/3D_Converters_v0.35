# AIV Official Errata Evidence v1

Status: **OFFICIAL PUBLISHER ERRATA CAPTURED — PRODUCTION IMPLEMENTATION STILL BLOCKED**

## Source

The Energy Institute publication record for the second-edition process-pipework vibration guidelines states that errata apply to pages 61 and 68 and that those changes are incorporated into the main PDF.

The freely available official sample-pages PDF contains:

```text
Errata 1
Pg 61: Feed in from Flowchart T2-5 should be ...
```

The AIV-relevant corrected feed equation shown by the publisher is represented in qualification evidence as:

```text
log10(N)
= 470711.5155
- 63075.1242 log10(B)
+ 183685.4368 / sqrt(B)
- 575094.3273 / B^0.1
```

Structured evidence record:

```text
AIV-EQ-T2-6-FEED-ERRATA-001
```

Source record:

```text
AIV-SRC-EI-OFFICIAL-ERRATA
publisher: Energy Institute
locator: Official sample pages, Errata 1, Pg 61: Feed in from Flowchart T2-5
source class: OFFICIAL_PUBLISHER_ERRATA
```

## Independent worked-example cross-check

The controlled D.2.3 worked example records:

```text
B        = 152.207
log10(N) = 9.9026
N        = 7.99e9
```

An independent test evaluates the official errata equation directly from the captured publisher coefficients. It does not call any production AIV kernel.

For `B = 152.207`, the corrected publisher equation evaluates to approximately:

```text
log10(N) = 9.90256787
N        = 7.990388e9
```

This is consistent with the D.2.3 displayed values `9.9026` and `7.99e9`.

Test evidence:

```text
tests/vibration-aiv-errata-benchmark.test.mjs
```

## Authority consequence

This cross-check substantially strengthens the page-61 trace but does **not** authorize the production T2-6 implementation.

The evidence object deliberately says:

```text
implementationAuthorized = false
controlledCommonPdfParityRequired = true
```

Before production transcription, the corrected publisher equation must still be reconciled against the pinned controlled Common main-guidance PDF:

```text
Common commit: aef163a5def3bfe04ca0ba860da05728a27daf42
file: EI - AVIFF Guidelines 2nd Edition.pdf
blob: 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
```

No screening or design authority changes as a result of this evidence capture.
