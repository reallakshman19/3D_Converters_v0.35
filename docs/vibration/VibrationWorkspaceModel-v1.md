# VibrationWorkspaceModel.v1

## Purpose

`VibrationWorkspaceModel.v1` is the table-only read model for the Vibration Integrity product. It consumes a completed `VibrationFacilityFitWorkflow.v1` artifact and prepares facility rows, filters, summary counts and selected-row detail for a future UI.

It does **not** calculate FIT, normalize engineering units, resolve missing values, change qualification, rank engineering risk or grant screening/design authority.

## Product boundary

```text
Advanced_Analysis 3D EDIT
        |
        v
certified table export
        |
        v
Vibration workflow artifacts
        |
        v
VibrationWorkspaceModel.v1
        |
        v
Table UI / detail panels
```

There is no 3D viewer, canvas, geometry rendering, heatmap or embedded Advanced_Analysis runtime in this contract.

## Authority

Every model returns:

```text
schema               = VibrationWorkspaceModel.v1
authority            = READ_MODEL_ONLY
engineeringAuthority = NONE
screeningAuthorized  = false
qualificationMode    = benchmark
```

The model rejects a source workflow that does not remain benchmark-only with `engineeringAuthority=NONE` and `screeningAuthorized=false`.

## Rows

Workspace rows are copied from `VibrationFacilityFitRegister.v1` and gain only a stable presentation identity:

```text
rowKey = JSON.stringify([line, caseId, canonicalId])
```

No numerical result is recomputed. Null LOF values remain null.

Default ordering is deterministic by Line, then Operating Case, then Canonical ID.

Supported presentation sort fields are deliberately non-numerical:

```text
line
caseId
canonicalId
status
completenessStatus
referenceBand
```

LOF sorting/ranking is not part of v1 because the workspace must not silently become a risk-ranking engine.

## Filters

Supported exact filters:

```text
lines
caseIds
statuses
completenessStatuses
referenceBands
qualificationStates
phaseEvidenceStrengths
correlationEvidenceStrengths
candidateForEngineeringReview
```

Filters affect visibility only. They do not alter source rows, evidence or authority.

No score/risk threshold filters are defined.

## Summary

The summary keeps total and visible counts separate and reports independent dimensions rather than one facility score:

```text
totalRows
visibleRows
calculatedRows
incompleteRows
calculationFailedRows
candidateForEngineeringReviewRows
byStatus
byCompleteness
byReferenceBand
byQualification
byPhaseEvidence
byCorrelationEvidence
```

There is no facility pass/fail or universal vibration score.

## Selected-row detail

A selected row is joined to source artifacts using exact identity only:

```text
Canonical ID + Line + Operating Case
```

Detail sections are:

```text
Summary
Inputs
Operating Case
Enrichment
Evidence / Qualification
Source Trace
Diagnostics
```

`Inputs` come only from the existing plan request. If the row was not READY, the workspace does not invent an input object.

`Operating Case` comes from the exact line/case record in the dataset.

`Enrichment` includes exact Canonical-ID rows that are global or match the selected case.

`Evidence / Qualification` comes from the existing central calculation result. It is absent for rows without a central result.

`Diagnostics` preserves missing, invalid and error states; it never substitutes numerical values.

## Selection behavior

A missing `selectedRowKey` produces no detail. An unknown supplied key produces:

```text
WORKSPACE_SELECTION_NOT_FOUND
```

and does not fall back to the first or nearest row.

## API

```js
import {
  buildVibrationWorkspaceModel,
  vibrationWorkspaceRowKey,
} from './converters/vibration/index.js';

const rowKey = vibrationWorkspaceRowKey({
  line: 'L-100',
  caseId: 'NORMAL',
  canonicalId: 'CAN-001',
});

const workspace = buildVibrationWorkspaceModel(workflow, {
  filters: {
    completenessStatuses: ['CALCULATED'],
    candidateForEngineeringReview: true,
  },
  sort: { field: 'line', direction: 'asc' },
  selectedRowKey: rowKey,
});
```

## Non-goals

- no DOM or visual styling contract;
- no 3D/canvas integration;
- no method calculation;
- no pass/safe field;
- no risk score;
- no hidden severity ranking;
- no engineering defaults;
- no identity inference;
- no screening authority promotion.
