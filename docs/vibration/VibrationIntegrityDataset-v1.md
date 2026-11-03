# VibrationIntegrityDataset v1

Status: **DATA-ASSEMBLY CONTRACT — NO SCREENING OR DESIGN AUTHORITY**

## 1. Purpose

`VibrationIntegrityDataset.v1` combines three independent data authorities into one deterministic vibration-workflow input dataset:

```text
3D EDIT certified table exchange
+ authoritative operating cases
+ vibration-specific enrichment
= VibrationIntegrityDataset.v1
```

The dataset does not calculate FIT, AIV, FIP, SBC or any other vibration mechanism. It does not assign pass/fail and it does not grant screening authority.

It exists to make the data join explicit, auditable and fail-closed before mechanism-specific calculation kernels run.

## 2. Authority boundary

Every assembled dataset contains:

```text
authority = DATA_ASSEMBLY_ONLY
engineeringAuthority = NONE
screeningAuthorized = false
```

This is distinct from:

- upstream topology/export authority;
- process-data authority;
- vibration enrichment review status;
- FIT/AIV/etc method qualification;
- project acceptance authority.

## 3. Input A — table exchange

Input must use:

```text
schema = VibrationTableExchange.v1
```

A complete exchange is required by default.

Elements-only CSV can be accepted only by explicit caller choice:

```js
assembleVibrationIntegrityDataset(input, {
  allowLimitedExchange: true,
})
```

When limited input is accepted, the resulting dataset carries `LIMITED_EXCHANGE_ACCEPTED` and does not gain missing provenance by inference.

## 4. Input B — operating cases

Operating cases are line-level records.

Required fields:

```text
caseId
line
source
```

Optional metadata:

```text
label
phase
sourceRevision
recordId
```

Supported engineering quantities:

```text
massFlow
density
pressure
temperature
dynamicViscosity
velocity
```

Every present engineering quantity must be explicit:

```json
{
  "value": 20000,
  "unit": "kg/h"
}
```

Pressure may additionally carry its reference basis:

```json
{
  "value": 64,
  "unit": "barg",
  "reference": "gauge"
}
```

The dataset layer preserves units exactly. It does **not** convert them. Central engineering input resolution performs unit conversion later when a mechanism request is built.

Missing quantities remain absent. There are no operating-case engineering defaults.

## 5. Input C — vibration enrichment

Enrichment is element-specific evidence keyed by the upstream `Canonical ID`.

Required:

```text
canonicalId
property
value
source
```

Optional:

```text
line
caseId
unit
sourceRevision
recordId
status
reviewer
```

Examples:

```json
{
  "canonicalId": "CANON-001",
  "property": "MAX_UNSUPPORTED_SPAN",
  "value": 5.8,
  "unit": "m",
  "source": "FIELD-VERIFY-01",
  "status": "VERIFIED",
  "reviewer": "engineer-a"
}
```

```json
{
  "canonicalId": "CANON-001",
  "caseId": "NORMAL",
  "property": "SUPPORT_EFFECTIVENESS",
  "value": "EFFECTIVE",
  "source": "FIELD-VERIFY-01"
}
```

The enrichment schema is intentionally strict in v1. `value` must be a string, finite number or boolean. Rich structured evidence should be stored separately and referenced by record/source identifiers rather than silently embedding arbitrary objects.

## 6. Join authority

### 6.1 Element identity

`Canonical ID` from 3D EDIT is authoritative for element joins.

Do not regenerate or replace it.

### 6.2 Operating-case identity

Operating cases are unique by:

```text
(line, caseId)
```

The operating-case line must exist in the exchange Elements table.

### 6.3 Enrichment joins

An enrichment `canonicalId` must exist in Elements.

If enrichment supplies `line`, it must equal the line assigned to that element.

If enrichment supplies `caseId`, that case must exist on the element's line.

Enrichment is unique by:

```text
(canonicalId, caseId-or-global, property)
```

A second record with the same key is rejected rather than silently overriding the first source.

## 7. Deterministic result

Output schema:

```text
VibrationIntegrityDataset.v1
```

Core fields:

```text
authority
engineeringAuthority
screeningAuthorized
exchangeSchema
exchangeIntegrityStatus
exchangeAuthority
sourceFileName
lines[]
unassignedElementCanonicalIds[]
operatingCases[]
enrichment[]
counts
warnings[]
```

Lines are sorted by line identifier.

Element Canonical IDs within a line are sorted.

Operating cases are sorted by line then case ID.

Enrichment is sorted by Canonical ID, case ID, then property.

The same semantic input records therefore produce the same assembled ordering regardless of input array order.

## 8. Fail-closed behavior

The assembler rejects:

```text
invalid exchange schema
incomplete exchange unless explicitly allowed
unknown operating-case fields
operating case with missing caseId/line/source
operating case for unknown line
duplicate line/case ID
engineering quantity without finite value
engineering quantity without unit
unknown quantity subfields
enrichment for unknown Canonical ID
enrichment line mismatch
enrichment case not defined on element line
duplicate element/case/property enrichment
non-primitive or non-finite enrichment value
```

There is no "last row wins" behavior.

## 9. Explicit warnings

Non-fatal conditions remain visible:

### `ELEMENTS_WITHOUT_LINE`

The upstream element has no line and therefore cannot receive line-level operating cases.

### `LINES_WITHOUT_OPERATING_CASES`

A line exists but no operating-case data were provided. Later mechanism execution should normally become `NOT_ASSESSED` if its required process data are missing.

### `LIMITED_EXCHANGE_ACCEPTED`

The caller explicitly allowed an Elements-only exchange. The dataset is structurally usable for limited workflows but does not contain the full upstream provenance package.

## 10. Data ownership

Recommended ownership is:

| Data | Authority |
|---|---|
| Canonical element identity/topology | Advanced_Analysis 3D EDIT export |
| Line/tag/dimensions/material/catalogue evidence | Advanced_Analysis certified table |
| Operating mass flow/density/pressure/temperature/viscosity/phase | HMB/process source |
| Maximum unsupported span/support effectiveness/field condition | vibration enrichment source/reviewer |
| FIT empirical equations/limits | qualified FIT method authority |
| Acceptance/project decision | assessment/project authority |

The assembler does not collapse these into one generic "source" authority.

## 11. Intended next API layer

A later mechanism request builder may consume the dataset and construct central Engineering Calculation requests, for example:

```text
VibrationIntegrityDataset.v1
  -> select line / operating case / element
  -> resolve required enrichment
  -> build explicit FIT request + inputUnits
  -> central Engineering Calculation API
  -> benchmark or qualified result
```

That builder must fail closed if a required field such as maximum unsupported span, density, mass flow, phase or gas viscosity is unavailable.

It must not invent defaults in order to make a line calculable.

## 12. Product consequence

The table-first vibration product can now be structured around rows rather than geometry:

```text
Facility table
  Line | Case | FIT | AIV | FIP | SBC | Governing

Line detail
  Summary | Inputs | Cases | Mechanisms | Findings | Evidence
```

The dataset contract is the foundation for those views, but it remains independent of UI implementation and independent of engineering screening authority.
