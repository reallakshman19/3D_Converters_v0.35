# Vibration Mechanism Qualification Framework v1

## 1. Purpose

Stage 5 establishes a reusable, non-numerical assessment contract for vibration mechanisms after FIT became an explicit production consumer in Stage 4.

The framework standardizes identity, lifecycle, benchmark/evidence state and traceability. It does **not** provide vibration equations, select a mechanism method, or authorize screening/design use.

## 2. Authority boundary

```text
FIT calculationState      = IMPLEMENTED
FIT qualificationState    = BENCHMARK_ONLY
engineeringAuthority      = NONE
screeningAuthority        = NOT_AUTHORIZED
designAuthority           = false

all non-FIT mechanisms    = NOT_IMPLEMENTED
```

No Stage-5 contract state is an authority promotion.

## 3. Production consumer

FIT is the first and only numerical production consumer in this stage:

```text
existing FIT facility workflow
  -> central Engineering Calculation API
  -> VibrationWorkspaceFitDetail.v1
  -> FIT mechanism adapter
  -> VibrationMechanismAssessmentItem.v1
  -> VibrationMechanismAssessmentSet.v1
  -> matrix / selected-row detail
```

The framework does not call `calculateFit()`, `calculateEngineering()` or `calculateEngineeringBatch()`.

## 4. Assessment item identity

Each mechanism assessment item has deterministic identity over:

```text
mechanismId
line
caseId
canonicalId
childKey
```

The serialized `itemId` is a JSON tuple rather than a delimiter-concatenated string, preventing identity collisions when source identifiers contain punctuation.

Examples of future child items include an equipment item, deadleg branch, valve source, thermowell or small-bore connection. FIT currently has exactly one child item with `childKey = mainline`.

## 5. Assessment set and cardinality

`VibrationMechanismAssessmentSet.v1` groups all child assessment items for one mechanism at one line/case/canonical scope.

Cardinality is explicit:

```text
ZERO
ONE
MANY
```

A non-implemented mechanism currently has `ZERO` items. That does not mean `NOT_APPLICABLE`.

The set fails closed on duplicate item IDs, schema mismatch, or scope/mechanism mismatch.

## 6. Lifecycle dimensions

Implementation:

```text
NOT_IMPLEMENTED
IMPLEMENTED_BENCHMARK_ONLY
```

Assessment/readiness:

```text
NOT_EVALUATED
APPLICABILITY_UNKNOWN
NOT_APPLICABLE
APPLICABLE_INCOMPLETE
READY
CALCULATED
FAILED
REVIEW_REQUIRED
```

Result currency:

```text
UNRUN
READY
RUNNING
CURRENT_RESULT
STALE_RESULT
INVALID_INPUT
```

Benchmark comparison:

```text
NOT_CONFIGURED
NOT_RUN
PASS
FAIL
STALE_RESULT
NOT_APPLICABLE_MODIFIED_INPUTS
```

These dimensions remain independent. For example, a FIT item can remain `CALCULATED` while its retained output is `STALE_RESULT`; that retained result is evidence only and is excluded from current implemented governing.

## 7. Request / execution / result envelope

A mechanism item may carry:

- normalized request inputs and calculation/method identity;
- execution metadata from the central calculation result;
- mechanism result values;
- applicability and readiness facts;
- qualification and evidence objects.

The generic layer does not invent missing values and does not normalize units itself.

## 8. Trace envelope

Trace dimensions are explicit and independent:

```text
equationIds
ruleIds
correlationIds
inputTrace
```

`inputTrace` state is one of:

```text
UNAVAILABLE
SOURCE_AND_NORMALIZED_ONLY
COMPLETE_WORKING_TRACE
```

A complete working trace requires every normalized input present in the mechanism request to have a real backing working-cell pointer. Missing pointers are never synthesized.

For FIT, Stage-3 Engineering-basis pointers are reused for supported inputs and carry:

```text
kind
rowIndex
rowId
columnIndex
header
sourceAnchorId
```

The chain is therefore:

```text
normalized FIT input
  -> working value/unit cell
  -> original value held by the canonical working-state table
  -> source-row identity / source anchor
  -> existing FIT source trace
```

Where a true working pointer is unavailable, the contract reports `SOURCE_AND_NORMALIZED_ONLY`.

## 9. FIT benchmark adapter

FIT benchmark comparison is mechanism-specific and remains separate from engineering calculation.

The adapter compares the already-calculated standard LOF/reference band against the loaded controlled benchmark target and declared tolerance. It returns the benchmark lifecycle state only; it does not alter FIT outputs or qualification.

Modified benchmark inputs fail to `NOT_APPLICABLE_MODIFIED_INPUTS`. A stale calculation reports `STALE_RESULT`. Only `CURRENT_RESULT` can produce benchmark `PASS` or `FAIL`.

## 10. Matrix semantics

The facility mechanism matrix now consumes mechanism assessment sets.

For FIT:

- one `mainline` child item is projected;
- current calculated FIT may be the `Implemented governing` result;
- stale calculated FIT is retained for inspection but is not current governing.

For every non-FIT mechanism:

- implementation remains `NOT_IMPLEMENTED`;
- assessment set cardinality is `ZERO`;
- no numerical result is manufactured;
- `NOT_IMPLEMENTED` is never converted to `NOT_APPLICABLE`.

`fullScreeningGoverningEstablished` remains false.

## 11. UI contract

The existing selected-row detail remains:

```text
Summary | Inputs | Calculation | Case | Evidence | Source | Diagnostics
```

Stage 5 adds contract metadata to existing views rather than introducing a new solver surface.

Summary exposes mechanism set/item identity, cardinality, implementation/assessment/result states, benchmark state, input-trace state and the non-authorizing screening boundary.

Inputs exposes available working-cell trace metadata and source anchors. The Calculation tab remains the Stage-4 backend-only FIT calculation trace.

## 12. Fail-closed rules

1. Unknown lifecycle/benchmark/trace enum values throw.
2. Item identity requires mechanism, line, canonical ID and child key.
3. Duplicate child item IDs throw.
4. Assessment sets reject cross-scope/cross-mechanism items.
5. Missing working pointers lower trace completeness; they are never guessed.
6. Stale results cannot become current implemented governing.
7. Modified benchmark inputs cannot claim benchmark parity.
8. Generic contracts contain no engineering formulas or coefficients.
9. Non-FIT numerical behavior remains unimplemented in Stage 5.
10. Authority changes require a separate explicit governance decision.

## 13. Permanent regression coverage

```text
tests/vibration-mechanism-contract.test.mjs
tests/vibration-fit-mechanism-contract.test.mjs
tests/vibration-integrity-mechanism-context.test.mjs
tests/vibration-integrity-mechanism-matrix.test.mjs
tests/vibration-integrity-detail-view.test.mjs
```

The controlled FIT/VIB release manifest contains 39 test files after Stage 5.

## 14. Next stage

Stage 6 is Mechanical excitation, but its numerical implementation must not begin from the generic contract alone. It still requires controlled method/rule adoption, source evidence, equipment-item cardinality, independent benchmark examples, boundary/unit validation and a benchmark-only authority decision.
