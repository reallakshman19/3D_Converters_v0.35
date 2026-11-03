# AIV Data Readiness Contract v1

Status: **QUALIFICATION DATA FOUNDATION — NUMERICAL AIV REMAINS BLOCKED**

Stable method ID:

```text
VIB.AIV.ACOUSTIC
```

Qualification authority remains issue `#441`.

## 1. Purpose

This contract closes the data ambiguity identified during AIV qualification without enabling a numerical AIV calculation.

The shared `VibrationOperatingCaseCsv.v1` has one generic pressure quantity. EI T2.7 source qualification requires distinct source-side `P1` and `P2` pressure evidence and explicit pressure basis. The shared FIT contract is therefore not overloaded or changed.

AIV uses a mechanism-specific source-case table:

```text
AivSourceCaseCsv.v1
```

Topology remains a separate authority supplied by the complete certified `TopologyEditTableHumanExport.v1` XLSX.

## 2. Controlled evidence basis

Worked-example source reviewed for this contract:

```text
repository: reallaksh19/Common
commit: fb549185b9b27edc2379734240320a85c5bef9f6
file: Energy-Institute-AVIFF---Worked-Examples.doc.docx
blob: ceee15ed5f7f320045d5f3979024e2e8664613f2
example: D.2.3 High Frequency Acoustic Excitation (T2.7)
```

D.2.3 provides controlled evidence for representing:

- relief/open source-device operating state;
- distinct upstream and downstream pressures;
- gauge-to-absolute pressure treatment;
- mass flow;
- upstream temperature;
- molecular weight;
- non-sonic branch state (`SFF = 0` in both published cases);
- manufacturer low-noise-trim reduction;
- downstream welded-discontinuity assessment.

D.2.3 does **not** qualify the sonic `SFF = 6` branch or multiple simultaneous acoustic-source behavior. Those stay explicit method gaps.

## 3. Source-case CSV contract

Exact header:

```text
Source Canonical ID
Assessment Canonical ID
Operating Case
Source Device Type
Source State
Phase
Mass Flow
Mass Flow Unit
Upstream Pressure
Upstream Pressure Unit
Upstream Pressure Basis
Downstream Pressure
Downstream Pressure Unit
Downstream Pressure Basis
Reference Pressure
Reference Pressure Unit
Reference Pressure Source
Reference Pressure Source Revision
Upstream Temperature
Upstream Temperature Unit
Molecular Weight
Molecular Weight Unit
Low Noise Trim State
Low Noise Trim Reduction
Low Noise Trim Unit
Low Noise Trim Source
Low Noise Trim Source Revision
Sonic State
Source
Source Revision
Record ID
Status
Reviewer
```

The parser is exact-header and fail-closed. It performs no header aliases and inserts no engineering defaults.

`READY_FOR_QUALIFICATION` additionally requires the source-case `Source Revision` and `Record ID`; a row with numeric values but no stable record/revision is not treated as traceable readiness.

## 4. Explicit branch/state values

Source-device type representation:

```text
CONTROL_VALVE
RELIEF_VALVE
RESTRICTION_ORIFICE
PRESSURE_REDUCING_BRANCH_CONNECTION
```

Source state:

```text
OPEN
RELIEVING
ACTIVE
CLOSED
```

Phase representation:

```text
GAS
WET_GAS
TWO_PHASE
LIQUID
```

Pressure basis:

```text
ABSOLUTE
GAUGE
```

Low-noise-trim state:

```text
NONE
MANUFACTURER_REDUCTION
UNRESOLVED
```

Sonic state:

```text
NON_SONIC
SONIC
UNRESOLVED
```

These values make ambiguity visible; they do not themselves authorize the corresponding numerical branch.

## 5. Pressure rule

Readiness does not convert pressure.

If either `P1` or `P2` is declared `GAUGE`, all of the following are required:

```text
Reference Pressure
Reference Pressure Unit
Reference Pressure Source
Reference Pressure Source Revision
```

No atmospheric pressure is hard-coded and the process/source-case record is not silently reused as the authority for a separate reference-pressure value.

The future qualified AIV resolver must perform the actual conversion and preserve the transformation and reference-pressure provenance in central resolved-input evidence.

If both pressures are already absolute, a supplied reference pressure is retained but is not selected by readiness.

## 6. Low-noise-trim rule

`MANUFACTURER_REDUCTION` requires:

```text
Low Noise Trim Reduction
Low Noise Trim Unit = dB
Low Noise Trim Source
Low Noise Trim Source Revision
```

The source is deliberately separate from the process/source-case record because the EI example uses manufacturer noise-reduction evidence.

`NONE` conflicts with supplied trim reduction/vendor evidence and is rejected as inconsistent input.

`UNRESOLVED` remains not ready; the software does not assume no trim.

This contract does not permit a vendor-predicted source PWL to silently replace the EI source calculation.

## 7. Certified topology requirement

AIV readiness requires the complete five-sheet topology exchange:

```text
Elements
Connections
Source Mapping
Catalogue Evidence
Export Metadata
```

Elements-only CSV is insufficient because the source-to-assessment relationship must be checked against certified connectivity.

`Canonical ID` remains the downstream identity key.

The topology resolver returns:

```text
RESOLVED
IDENTITY_NOT_FOUND
NO_PATH
AMBIGUOUS_SHORTEST_PATH
AMBIGUOUS_TOPOLOGY_PATH
```

Ambiguous paths fail closed. `AMBIGUOUS_TOPOLOGY_PATH` also rejects a case where one route is shorter but a second certified route exists; readiness never chooses a path merely by minimum hop count.

## 8. Distance boundary

The readiness/topology UI intentionally returns:

```text
physicalDistanceMm = null
distanceStatus = NOT_DERIVED_BY_TOPOLOGY_VIEW
```

Declared pipe lengths may be shown as evidence, but the UI does not sum them into an EI AIV distance and never derives distance from SVG pixels.

The physical source-to-assessment distance rule remains a future qualified AIV resolver responsibility.

## 9. Readiness states

```text
READY_FOR_QUALIFICATION
METHOD_GAP
NOT_READY
```

### READY_FOR_QUALIFICATION

All currently required source-case evidence, field-level provenance and a single unambiguous certified topology route are present for the controlled non-sonic gas qualification envelope.

This state explicitly sets:

```text
requestPrepared = false
numericalExecutionAuthorized = false
```

It is **not** benchmark or screening readiness.

### METHOD_GAP

Data are present, but the row enters a branch not yet qualified, for example:

```text
AIV_SONIC_SFF6_BRANCH_UNQUALIFIED
AIV_PHASE_OUTSIDE_CURRENT_QUALIFICATION_ENVELOPE
AIV_CLOSED_SOURCE_OUTSIDE_CURRENT_ACTIVE_SOURCE_ENVELOPE
```

### NOT_READY

Required evidence is missing/invalid or topology identity/path resolution fails. Examples include:

```text
AIV_SOURCE_REVISION_REQUIRED
AIV_SOURCE_RECORD_ID_REQUIRED
AIV_REFERENCE_PRESSURE_REQUIRED
AIV_REFERENCE_PRESSURE_SOURCE_REQUIRED
AIV_REFERENCE_PRESSURE_SOURCE_REVISION_REQUIRED
AIV_LOW_NOISE_TRIM_STATE_UNRESOLVED
AIV_LOW_NOISE_TRIM_SOURCE_REQUIRED
AIV_LOW_NOISE_TRIM_SOURCE_REVISION_REQUIRED
AIV_SONIC_STATE_UNRESOLVED
AIV_TOPOLOGY_AMBIGUOUS_SHORTEST_PATH
AIV_TOPOLOGY_AMBIGUOUS_TOPOLOGY_PATH
```

## 10. UI behavior

The BLOCKED AIV qualification workspace now supports only:

```text
Load complete 3D EDIT topology XLSX
Load AivSourceCaseCsv.v1
Download blank AIV source-case template
Check AIV readiness
Inspect source/assessment/path evidence
```

It exposes no:

```text
Run AIV benchmark
Run AIV screening
Calculate
PWL
attenuation result
LOF result
PASS / SAFE classification
```

## 11. Numerical authority

Nothing in this contract changes:

```text
calculationState      = BLOCKED
qualificationState    = BLOCKED
engineeringAuthority  = NONE
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
```

The next numerical slice must not start until the equation/table/constant trace register, corrected EI source locations/errata, D.2.3 benchmark fixture and independent branch benchmarks are frozen under issue #441.
