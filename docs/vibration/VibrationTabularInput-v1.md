# Vibration Tabular Input v1

Status: **DATA IMPORT CONTRACT — NO ENGINEERING DEFAULTS OR SCREENING AUTHORITY**

## 1. Purpose

The vibration workflow uses tables as its integration surface.

`VibrationTabularInput` defines strict CSV contracts for the two downstream data authorities that do not belong in the 3D EDIT topology export:

```text
Operating cases / HMB process data
Vibration-specific engineering enrichment
```

The parsed records feed `VibrationIntegrityDataset.v1` directly.

## 2. Shared CSV rules

The vibration tabular parser supports:

- comma-delimited fields;
- quoted fields;
- escaped quotes using `""`;
- CRLF, LF and CR newlines;
- UTF-8 BOM on the first header cell;
- empty cells;
- trailing blank rows.

It rejects malformed quoting, including:

- input ending inside a quoted field;
- a quote beginning after unquoted text in the same field;
- unexpected non-delimiter text after a quoted field closes.

v1 does not support header aliases.

A changed header is a contract change and should be handled deliberately rather than guessed.

## 3. Operating-case CSV

Schema identifier:

```text
VibrationOperatingCaseCsv.v1
```

Exact header:

```text
Line
Operating Case
Label
Phase
Mass Flow
Mass Flow Unit
Density
Density Unit
Pressure
Pressure Unit
Pressure Reference
Temperature
Temperature Unit
Dynamic Viscosity
Dynamic Viscosity Unit
Velocity
Velocity Unit
Source
Source Revision
Record ID
```

### Required cells

```text
Line
Operating Case
Source
```

`Phase` may be blank at import time so data-completeness workflows can retain incomplete records. The later FIT planner marks missing/unsupported phase as NOT_READY.

## 4. Engineering quantities

Supported process quantities are imported as explicit pairs:

```text
Mass Flow + Mass Flow Unit
Density + Density Unit
Pressure + Pressure Unit
Temperature + Temperature Unit
Dynamic Viscosity + Dynamic Viscosity Unit
Velocity + Velocity Unit
```

For each quantity:

```text
both blank        -> quantity absent
both populated    -> parse finite number + preserve unit
one populated     -> fail closed
```

No unit is inferred from the header, project, source or neighboring rows.

Example input:

```text
Mass Flow = 20000
Mass Flow Unit = kg/h
```

becomes:

```json
{
  "massFlow": {
    "value": 20000,
    "unit": "kg/h"
  }
}
```

The import layer does not convert units.

## 5. Pressure reference

Pressure may additionally contain:

```text
Pressure Reference
```

Example:

```text
Pressure = 64
Pressure Unit = barg
Pressure Reference = gauge
```

A pressure reference without pressure value/unit is rejected rather than retained as an orphan assumption.

## 6. Operating-case output

A parsed row has the same shape accepted by `assembleVibrationIntegrityDataset()`:

```json
{
  "line": "L-100",
  "caseId": "NORMAL",
  "label": "Normal summer",
  "phase": "GAS",
  "source": "HMB-100",
  "sourceRevision": "C",
  "recordId": "HMB-100-L100-NORMAL",
  "massFlow": { "value": 20000, "unit": "kg/h" },
  "density": { "value": 8.1, "unit": "kg/m3" },
  "dynamicViscosity": { "value": 0.019, "unit": "cP" }
}
```

Missing quantities are omitted, not defaulted.

## 7. Enrichment CSV

Schema identifier:

```text
VibrationEnrichmentCsv.v1
```

Exact header:

```text
Canonical ID
Line
Operating Case
Property
Value
Value Type
Unit
Source
Source Revision
Record ID
Status
Reviewer
```

Required:

```text
Canonical ID
Property
Value Type
Source
```

The value is interpreted only according to the explicit `Value Type` column.

## 8. Enrichment scalar types

Allowed values:

```text
NUMBER
STRING
BOOLEAN
```

### NUMBER

`Value` must be finite numeric text.

```text
168.3 -> 168.3
```

No locale/thousands-separator guessing is performed.

### STRING

The CSV scalar text is preserved.

```text
00123 -> "00123"
```

This prevents record IDs and coded values from being silently converted to numbers.

An empty STRING is permitted because the explicit type already establishes the intended scalar type. Dataset/business rules may reject it later for a specific property if required.

### BOOLEAN

Only case-insensitive:

```text
true
false
```

are accepted.

Values such as:

```text
yes
no
1
0
Y
N
```

are not guessed.

## 9. Enrichment units

`Unit` is optional at the generic import layer because enrichment may be:

- boolean (`FIT_ASSESSMENT_POINT`);
- categorical (`SUPPORT_EFFECTIVENESS`);
- textual references;
- dimensionless numeric properties.

Mechanism-specific planning remains stricter.

For example, the FIT planner requires explicit units for:

```text
OUTSIDE_DIAMETER
WALL_THICKNESS
INSIDE_DIAMETER when present
MAX_UNSUPPORTED_SPAN
NATURAL_FREQUENCY when present
```

Thus a numeric row can import successfully but still be FIT `NOT_READY` if its engineering unit is missing.

## 10. Enrichment output

Example CSV row:

```text
CANON-001,L-100,,MAX_UNSUPPORTED_SPAN,5.8,NUMBER,m,FIELD-VERIFY-01,A,REC-44,VERIFIED,engineer-a
```

becomes:

```json
{
  "canonicalId": "CANON-001",
  "line": "L-100",
  "property": "MAX_UNSUPPORTED_SPAN",
  "value": 5.8,
  "unit": "m",
  "source": "FIELD-VERIFY-01",
  "sourceRevision": "A",
  "recordId": "REC-44",
  "status": "VERIFIED",
  "reviewer": "engineer-a"
}
```

The dataset assembler then verifies Canonical ID, line/case joins and duplicate property rules.

## 11. Import-versus-dataset responsibilities

CSV import validates:

```text
syntax
exact header
required source/identity cells
quantity value/unit pair structure
finite numbers
explicit enrichment scalar typing
```

`VibrationIntegrityDataset.v1` validates:

```text
line exists in topology exchange
Canonical ID exists
case belongs to line
duplicate operating-case identity
duplicate enrichment identity
limited-exchange policy
```

FIT planning validates:

```text
FIT assessment marker
required geometry properties
required process quantities by phase
mechanism request readiness
```

The central Engineering Calculation API validates:

```text
units
method applicability
benchmark qualification mode
FIT calculation
```

No layer silently takes over the responsibilities of the next layer.

## 12. Current 3D EDIT CSV note

The current 3D EDIT Elements-only CSV remains governed by `VibrationTableExchange.v1` and is still `LIMITED_ELEMENTS_ONLY`.

Stage 21 introduces a shared strict CSV parser for new operating/enrichment inputs. The existing exchange parser's private tokenizer has not yet been refactored to this shared utility because the real `xlsx@0.18.5` exchange regression cannot execute in the current environment. That consolidation should be done when the complete exchange parser suite can be run, to avoid broad parser churn without validation.

This does not change the current exchange CSV authority/completeness behavior.

## 13. Recommended import UI

A future table-only workspace can provide three import controls:

```text
Piping / topology: 3D EDIT XLSX (preferred) or limited Elements CSV
Operating cases: VibrationOperatingCaseCsv.v1
Vibration enrichment: VibrationEnrichmentCsv.v1
```

After import, the UI should show a data-quality/preflight table before any FIT benchmark run:

```text
Line
Case
Assessment Point
Piping data status
Process data status
Enrichment status
FIT readiness
```

No 3D model is required.
