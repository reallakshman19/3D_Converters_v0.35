# AIV Artifact Classification v1

Artifact classification: **CURRENT_AUTHORITY_RECONCILIATION**

This register prevents historical qualification evidence from being mistaken for current product authority. It does not rewrite, delete, or retroactively change historical records.

Current authority: `IMPLEMENTED / SCREENING / AUTHORIZED` for `ASSESSMENT` results only.

Permanent boundaries remain:

```text
screeningResultScope = ASSESSMENT
line/case summary authoritative for screening = false
designAuthority = false
codeCompliance = false
SVG/pixel geometry = presentation only; never engineering physical-distance authority
assumption presence = does not itself create screening authority
Product Freeze final disposition = owned only by issue #513
```

## Artifact register

| Artifact | Classification | Current-state interpretation |
|---|---|---|
| `AIV-Independent-Promotion-Review-v1.md` | HISTORICAL_PRE_PROMOTION_QUALIFICATION | Its `BLOCKED/NONE/NOT_AUTHORIZED` authority block is historically correct for the pre-promotion review stage and must not override current registered authority. |
| `AIV-Release-Validation-v1.md` | QUALIFICATION_EVIDENCE_PROTOCOL | Defines exact-head release-evidence rules. A PASS receipt is evidence for a separate authority transition and never self-promotes authority. |
| `AIV-Independent-Sonic-MultiSource-Benchmarks-v1.md` | HISTORICAL_PRE_PROMOTION_BENCHMARK_EVIDENCE | Numerical benchmark evidence remains valid according to its own custody; embedded pre-promotion authority prose is historical, not current product authority. |
| `validation/AIV-SCREENING-ReleaseValidationReceipt-v1.json` | QUALIFICATION_EVIDENCE | Historical exact-head Stage-20 PASS receipt. `authorityTransitionApplied=false` is intentional; merged PR #446 supplied the separate transition. |
| merged PR #446 | AUTHORITY_TRANSITION_EVENT | Established assessment-level SCREENING authority while retaining `designAuthority=false`, non-authoritative line/case summary, visible assumptions, and no pixel-derived distance. |
| active `VIB.AIV.ACOUSTIC` adapter + registered calculator contract | CURRENT_MACHINE_TRUTH | Governs current calculation/qualification/result-scope authority unless higher-precedence controlled engineering evidence proves a source conflict. |

## Precedence rule

Historical records are preserved as evidence. They may reveal defects but cannot silently override current executable/registered authority. Conversely, current UI or prose cannot override controlled engineering evidence or the registered result-scope contract.

If executable behavior conflicts with controlled qualified engineering evidence, classify `BLOCKED_SOURCE_CONFLICT` rather than editing prose to hide the mismatch.
