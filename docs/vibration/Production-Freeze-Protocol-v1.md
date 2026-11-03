# Vibration Integrity Production Freeze Protocol v1

## Purpose

Production freeze is earned by exercising the product as a user in Chromium, observing the visible state, fixing defects, validating against a controlled engineering benchmark, and recording the evidence before moving to the next workflow.

Source inspection, unit tests, source-contract tests or numerical agreement alone do not establish `FROZEN` product status.

## Required loop

For each user workflow:

```text
1. OPEN AS USER IN CHROMIUM
2. CAPTURE CURRENT VISIBLE STATE
3. OBSERVE / RECORD ISSUE OR CONFIRM EXPECTED BEHAVIOUR
4. FIX ONE BOUNDED ISSUE
5. RE-RUN THE SAME USER JOURNEY
6. COMPARE ENGINEERING RESULT TO CONTROLLED BENCHMARK
7. VERIFY AUTHORITY / RESULT-CURRENCY INVARIANTS
8. CAPTURE AFTER-FIX SCREENSHOT
9. EXPORT / VERIFY REPRODUCIBILITY EVIDENCE
10. WRITE PRODUCTION-FREEZE RECEIPT
11. ONLY THEN MOVE TO NEXT WORKFLOW
```

If any required gate is not executed, the workflow remains `NOT_FROZEN`.

## Freeze states

- `NOT_STARTED` — no Chromium evidence.
- `OBSERVED` — user journey executed and current issue/state captured.
- `FIXED_UNVERIFIED` — code changed but browser/benchmark replay not complete.
- `BENCHMARK_PASS` — engineering benchmark agrees within controlled tolerance.
- `FROZEN` — browser journey, benchmark, authority, evidence export and receipt all pass.
- `BLOCKED` — required browser/source/benchmark infrastructure unavailable.

`BLOCKED` is not `FROZEN` and must never be represented as PASS.

## Benchmark rule

Every workflow must have a named independent oracle before it can freeze. The receipt records:

```text
benchmark id
controlled source repository / commit / path / blob where available
published expected value(s)
tolerance or exact-match rule
actual visible value(s)
delta
reference band / classification when applicable
PASS / FAIL
```

Current first production-freeze journey uses:

### FIT

- benchmark: `EI-D2-FIT-RECYCLE-SUCTION-6IN`
- source set: `FIT-EI-WORKED-EXAMPLES-V1`
- published standard LOF: `0.276`
- tolerance: `±0.0012`
- expected band: `LOF_LT_0_3`

### Mechanical T2.3

- benchmark: EI worked example D2 / D2.4 mechanical excitation
- centrifugal compressor baseline LOF: `0.20`
- electric motor / alternator >=15 kW baseline LOF: `0.40`
- governing LOF: `0.40`
- authority: candidate only; must not replace authorized screening governing.

## Screenshot rule

Capture the actual Chromium state at every meaningful transition. The first journey requires:

```text
01-workspace.png
02-benchmark-loaded.png
03-readiness.png
04-fit-result.png
05-mechanical-result.png
06-governing-matrix.png
07-evidence-exported.png
99-failure.png (only when a failure occurs)
```

A screenshot is evidence of visible product state, not numerical authority by itself.

## Defect record

When a defect is observed, record at minimum:

```text
issue id
affected workflow step
before screenshot
user-visible symptom
expected behaviour
root cause
fix commit
benchmark replay result
after screenshot
regression test(s)
residual risk
```

Do not combine unrelated UX/engineering defects into one freeze fix unless they share the same root cause.

## Receipt

The browser harness writes `VibrationProductionFreezeReceipt.v1`. Each step contains:

```text
step id
name
status
screenshot
observations
benchmark expected / actual / tolerance / delta where applicable
authority assertion where applicable
```

The complete receipt also carries browser errors and controlled source identity.

## CI artifact

The production-freeze workflow must upload, even on failure:

- all Chromium screenshots;
- `production-freeze-receipt.json`;
- exported `vibration-fit-run-evidence.json` when reached;
- static-server log.

This allows a failed run to be inspected as a user-visible product defect rather than reduced to a textual stack trace.

## Move-next rule

The next workflow may begin only when the current workflow is either:

1. `FROZEN`, with receipt and benchmark evidence; or
2. explicitly `BLOCKED`, with the blocker recorded and no claim of PASS.

Known numerical refinement below the controlled engineering tolerance is not a reason to delay product freeze unless it changes the published benchmark disposition, authority boundary, or user decision.
