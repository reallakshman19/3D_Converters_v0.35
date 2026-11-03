# VibrationTableExchange v1

Status: **IMPLEMENTATION FOUNDATION — NO SCREENING AUTHORITY**

## 1. Purpose

`VibrationTableExchange.v1` is the table-only integration boundary between:

```text
Advanced_Analysis / 3D EDIT
        -> certified table export
3D_Converters / Vibration Integrity
        -> engineering screening, cases, findings, evidence and RCA
```

There is intentionally no 3D viewer, canvas, geometry rendering, spatial heatmap or embedded Advanced_Analysis runtime in the vibration product.

The exchange preserves the engineering identity and provenance needed by downstream vibration workflows without making the vibration application responsible for editing or rendering the upstream model.

## 2. Current upstream authority

The current upstream source is:

```text
Repository: reallaksh19/Advanced_Analysis
Export schema: TopologyEditTableHumanExport.v1
Exporter: src/workspace/topology-edit/table/topology-edit-table-human-export.js
```

The upstream exporter refuses certified export when the editing session is stale, the projection is stale relative to canonical authority, unapplied table changes exist, source authority changes, or dataset identity changes.

The upstream XLSX contains five sheets:

```text
Elements
Connections
Source Mapping
Catalogue Evidence
Export Metadata
```

The current CSV contains only the `Elements` sheet.

## 3. Downstream schema

Successful parsing returns:

```text
schema = VibrationTableExchange.v1
```

Core fields:

```text
sourceSchema
sourceFormat
sourceSystem
completeExchange
integrityStatus
authority
elements
connections
sourceMapping
catalogueEvidence
metadata
warnings
sourceFileName
```

## 4. Formats

### 4.1 XLSX

```text
sourceFormat = XLSX
completeExchange = true
integrityStatus = DECLARED_NOT_REVERIFIED
```

The parser requires all five upstream sheets and their exact v1 headers.

`DECLARED_NOT_REVERIFIED` is deliberate. The current human XLSX carries the upstream export hash in workbook properties, but v1 does not duplicate the Advanced_Analysis `semanticHash` implementation or reconstruct the exact upstream export model solely to re-hash it.

Therefore:

- the importer validates the structural and authority declarations in the XLSX;
- the importer preserves the declared upstream export hash when present;
- the importer does **not** claim cryptographic revalidation of that hash.

A future machine-oriented exchange package can close this gap with an explicit manifest/hash contract.

### 4.2 CSV

```text
sourceFormat = CSV_ELEMENTS_ONLY
completeExchange = false
integrityStatus = LIMITED_ELEMENTS_ONLY
```

The current 3D EDIT CSV includes only Elements data. It does not include:

```text
Connections
Source Mapping
Catalogue Evidence
Export Metadata
```

CSV is therefore acceptable only for workflows that explicitly allow an incomplete Elements-only projection.

A caller that needs full authority/provenance must use:

```js
parseVibrationTableExchangeCsv(csv, { requireCompleteExchange: true })
```

which fails closed with `VIBRATION_TABLE_EXCHANGE_INCOMPLETE`.

## 5. Sheet contracts

### 5.1 Elements

Exact columns:

```text
Tag
Type
Line
Connect From
Connect To
DN In (mm)
DN Out (mm)
Length (mm)
Schedule
Material
Piping Class
Pressure Class
Catalogue Authority
Source Status
Canonical ID
```

Canonical downstream object:

```text
tag
type
line
connectFrom
connectTo
dnInMm
dnOutMm
lengthMm
schedule
material
pipingClass
pressureClass
catalogueAuthority
sourceStatus
canonicalId
```

`canonicalId` is mandatory and unique.

### 5.2 Connections

Exact columns:

```text
Canonical ID
Element Type
Port Role
Port Key
Node ID
```

Every row must reference an existing Elements `Canonical ID`.

### 5.3 Source Mapping

Exact columns:

```text
Canonical ID
Component Key
Entity ID
Source Entity ID
Source Path
Source Node Key
JSON Pointer
Source Status
Source Hash
```

Every Elements row must have exactly one Source Mapping row.

### 5.4 Catalogue Evidence

Exact columns:

```text
Canonical ID
Authority
Catalogue ID
Catalogue Version
Catalogue Hash
Source Hash
Record ID
Record Hash
Source Reference
```

Every Elements row must have exactly one Catalogue Evidence row.

`Source Reference`, when present, must be valid JSON because the upstream exporter serializes the structured source-reference object as JSON text.

### 5.5 Export Metadata

Exact columns:

```text
Key
Value
```

Required keys:

```text
Schema
Canonical Hash
Projection Hash
Authority
Row Count
Ordering
```

Current required values:

```text
Schema    = TopologyEditTableHumanExport.v1
Authority = CERTIFIED_CANONICAL_PROJECTION_ONLY
Ordering  = DETERMINISTIC_CANONICAL_ROW_ID
```

`Row Count` must equal the parsed Elements count.

Other preserved authority fields include:

```text
Source Hash
Dataset ID
Dataset Version
Journal Hash
Active Ledger Hash
Session Version
```

## 6. Authority model

The exchange authority object is:

```text
canonicalHash
projectionHash
sourceHash
datasetId
datasetVersion
journalHash
activeLedgerHash
sessionVersion
sourceAuthority
sourceExportHash
```

None of these fields are vibration engineering method authority.

They answer questions such as:

- Which certified topology projection was exported?
- Which source dataset/revision did it come from?
- Which edit/session ledger was active?
- Which upstream export hash was declared?

They do **not** answer:

- Is FIT applicable?
- Is LOF below a qualified threshold?
- Is the piping acceptable for vibration fatigue?
- Is the project method approved?

Those remain vibration-kernel/qualification responsibilities.

## 7. Validation and fail-closed behavior

The XLSX parser fails on:

```text
missing required sheet
header drift / aliasing
wrong source schema
wrong source authority
missing canonical/projection hash
wrong deterministic-ordering declaration
Row Count mismatch
duplicate Elements Canonical ID
orphan Connections reference
orphan Source Mapping reference
orphan Catalogue Evidence reference
missing/duplicate Source Mapping coverage
missing/duplicate Catalogue Evidence coverage
invalid Catalogue Source Reference JSON
invalid numeric Elements fields
```

v1 intentionally performs **no header aliasing**. Contract changes require a new controlled parser revision rather than silent guessing.

## 8. Identity rule

`Canonical ID` from Advanced_Analysis is the downstream primary piping-element identity.

Do not replace it with:

- row number;
- line/tag concatenation;
- geometry hash;
- viewer object ID;
- regenerated UUID.

Line and Tag remain useful human/business identifiers, but `Canonical ID` is the integration key for topology and provenance.

## 9. Process and vibration enrichment are separate authorities

The 3D EDIT export owns topology/piping facts.

Operating cases should be joined as separate authoritative data, for example:

```text
Line
Operating Case
Mass Flow
Density
Pressure
Temperature
Viscosity
Phase
Source
Revision
```

Vibration-specific enrichment should also remain separate, for example:

```text
Canonical ID
Line
Property
Value
Unit
Source
Status
Reviewer
```

Potential properties include maximum unsupported span, support effectiveness, dead-leg classification, susceptible weld, SBC concentrated mass and field verification status.

Do not silently insert process or vibration defaults into the topology exchange.

## 10. Intended facility workflow

```text
3D EDIT
  -> certified table export
  -> parse VibrationTableExchange.v1
  -> validate identity/provenance/completeness
  -> join operating cases
  -> join vibration-specific enrichment
  -> mechanism applicability
  -> benchmark/qualified calculation kernels
  -> facility screening table
  -> findings / mitigation / reassessment / verification
```

No geometry viewer is required at any step.

## 11. Future machine package

The preferred future upstream machine exchange is a versioned package such as:

```text
vibration-export/
  manifest.json
  elements.csv
  connections.csv
  source-mapping.csv
  catalogue-evidence.csv
```

The manifest should bind at least:

```text
schema
datasetId
datasetVersion
canonicalHash
projectionHash
sourceHash
exportHash
file hashes
```

That would allow downstream cryptographic verification without depending on human workbook properties.

This future package is not required for the current XLSX ingestion foundation and must not break existing human CSV/XLSX export behavior.
