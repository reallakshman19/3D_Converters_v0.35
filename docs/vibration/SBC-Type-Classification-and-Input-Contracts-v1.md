# SBC Type Classification and Input Contracts v1

## Authority

This artifact is a structural #563 contract, not a numerical method qualification.

```text
lifecycle                       = RESERVED
classificationAuthority         = NONE
automaticClassificationAllowed  = false
inputValidationPurpose           = STRUCTURAL_COMPLETENESS_ONLY
numericalExecutionAllowed        = false
benchmarkExecutionAllowed        = false
engineeringDefaultsAllowed       = false
```

## Source basis

The contracts bind the source identities and trace rows in `docs/vibration/SBC-source-trace-register-v1.md` and `converters/vibration/sbc/source-trace.js`.

D5–D8 establish worked-example structural labels only:

```text
TYPE_1  D5  cantilever / single-parent connection
TYPE_2  D6  loop or bypass exiting and re-entering the same main line
TYPE_3  D7  supported first span plus subsequent spans
TYPE_4  D8  bridge between distinct parent lines
```

These example descriptions do not establish a complete automatic EI classifier. The software therefore requires an explicit Type declaration and only checks for contradiction with the source-grounded structural facts.

## Common structural inputs

Every Type contract requires explicit values/evidence for:

```text
connectionId
declaredSbcType
operatingScenario.scenarioId
mainLineAssessment.assessmentId
mainLineAssessment.sourceContract
topology.topologyKind
topology.parentConnectionCount
topology.parentLineIds
geometry.minimumNominalDiameter
attachments.fittings
attachments.valves
locationContext
```

The main-line `sourceContract` must identify `QUALIFIED_EI_MAIN_LINE_ASSESSMENT`; that declaration does not itself prove qualification. Qualification/completeness remains owned by #429. `FIT_LOF_ONLY` and `fitOnly=true` fail structural validation.

## Type-specific structural inputs

### TYPE_1 — D5 example scope

```text
geometry.overallBranchLength
```

Confirmation facts:

```text
topologyKind          = CANTILEVER_SINGLE_PARENT
parentConnectionCount = 1
parentLineRelationship = SINGLE_PARENT_LINE
```

### TYPE_2 — D6 example scope

```text
topology.returnsToSameMainLine
geometry.branchLegs
```

Confirmation facts:

```text
topologyKind           = LOOP_BYPASS_SAME_MAIN_LINE
parentConnectionCount  = 2
parentLineRelationship = SAME_MAIN_LINE
```

### TYPE_3 — D7 example scope

```text
topology.hasSubsequentSpans
geometry.firstSpan
geometry.subsequentSpans
supportTopology.firstSpanSupport
```

Confirmation facts:

```text
topologyKind                 = SUPPORTED_FIRST_AND_SUBSEQUENT_SPANS
parentConnectionCount        = 1
parentLineRelationship       = SINGLE_PARENT_LINE
subsequentSpanEvidenceRequired = true
```

T3-1..T3-4 numerical curve data remain quarantined under #514. The contract does not create runtime curve masters or derive D/F/G values.

### TYPE_4 — D8 example scope

```text
topology.bridgesDistinctMainLines
geometry.endLegs
geometry.bridgeSpan
```

Confirmation facts:

```text
topologyKind           = BRIDGE_DISTINCT_PARENT_LINES
parentConnectionCount  = 2
parentLineRelationship = DISTINCT_MAIN_LINES
```

Any eventual figure/table numerical dependency remains separately qualified; this structural contract does not authorize it.

## Validation result semantics

`validateSbcTypeInputStructure()` can only produce structural truth. A complete shape returns:

```text
STRUCTURE_COMPLETE_NOT_QUALIFIED_FOR_NUMERICAL_EXECUTION
```

It never grants benchmark or production execution. Missing fields, FIT-only main-line substitution, or topology contradiction return:

```text
STRUCTURE_INCOMPLETE_OR_UNCONFIRMED
```

## Remaining blockers

Even structurally complete inputs remain blocked by:

```text
SBC_METHOD_SPECIFICATION_NOT_FROZEN
SBC_MAIN_LINE_ASSESSMENT_QUALIFICATION_OWNED_BY_429
SBC_TYPE_B1_B2_QUALIFICATION_REQUIRED
SBC_QUALIFIED_MASTER_DEPENDENCIES_NOT_FROZEN
```

No lifecycle transition is made by this artifact.
