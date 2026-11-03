# FIT Source Basis Evidence v1

Status: **OFFICIAL ERRATA REVIEWED / PRODUCT METHOD BASIS CONFIRMED / DIRECT T2.2 PAGE TRACE STILL OPEN**

Artifact classification: **CURRENT_AUTHORITY**

Calculation ID: `VIB.FIV.FLOW_TURBULENCE`

## 1. Purpose

This record separates four source questions that were previously grouped together as one FIT qualification blocker:

1. which published method the product implements;
2. whether the Energy Institute official errata alter the FIT T2.2 calculation chain;
3. whether the product method basis should be confused with a client/project procedure adoption;
4. how the published D2/D4 examples and the richer Owner-controlled DOCX are used when their scenario values differ.

It does not grant screening or design authority. Current authority is projected from the qualified FIT calculation state and is not created by this source-basis record.

## 2. Controlled method source

Repository-controlled source identity:

```text
reallaksh19/Common@fb549185b9b27edc2379734240320a85c5bef9f6
EI - AVIFF Guidelines 2nd Edition.pdf
blob 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
```

Publisher identity independently confirmed from the Energy Institute publication record:

```text
Publication 3160
Guidelines for the avoidance of vibration induced fatigue failure in process pipework
Edition: 2nd
Published: January 2008
ISBN: 9780852934630
```

The FIT product method is explicitly:

```text
Technical Module T2.2 — Flow Induced Turbulence
methodRevision = ei-aviff2-fit-screening-v1
```

Disposition:

```text
productMethodBasis = ADOPTED_EI_T2_2_REFERENCE
```

This is the product calculation basis, not a declaration that every external client/project specification has adopted the same method.

## 3. Official Energy Institute errata review

The current Energy Institute publication page states that official errata apply to pages **61** and **68**, and that the corrections are incorporated into the current main PDF.

The publisher's freely available sample-pages PDF identifies the two corrections as:

```text
Page 61 — feed from Flowchart T2-5
Page 68 — peak-force calculation in Flowchart T2-8
```

Repository method custody independently identifies:

```text
Flowchart T2-5 correction -> AIV feed-equation evidence
Flowchart T2-8 correction -> valve-transient / T2.8 peak-force path
```

Neither correction is part of the FIT **T2.2** correlation chain implemented by `VIB.FIV.FLOW_TURBULENCE`.

Disposition:

```text
officialErrata.status = REVIEWED_NOT_APPLICABLE_TO_FIT_T2_2
```

This conclusion is deliberately narrow. It means the two currently issued official corrections do not modify the FIT T2.2 equations. It does not replace the outstanding direct T2.2 page/table/equation locator audit.

## 4. Product basis versus project/client adoption

The repository and Owner-directed qualification program explicitly adopt EI 2nd Edition T2.2 as the FIT **product reference method**.

A generic engineering application cannot infer that a specific operating project, client specification, contract or asset has adopted that method merely because the product supports it.

Therefore:

```text
productReferenceMethod = CONFIRMED
externalProjectOrClientAdoption = PROJECT_SPECIFIC_CONFIRMATION_REQUIRED
```

The Engineering Basis UI exposes this distinction. No project/client adoption default is introduced.

## 5. Worked-example source disposition

Source precedence remains:

```text
governing EI method PDF
  > published EI worked-example PDF
  > Owner-controlled DOCX / revised project-scenario evidence
  > controlled JSON transcription
  > retained workbook migration/parity evidence
```

For the controlled FIT benchmark vectors:

```text
published EI PDF / controlled JSON = benchmark comparison vectors
Owner-controlled DOCX              = qualification anchor + richer/revised scenario evidence
retained FIT workbook              = migration/parity evidence only
```

Known D2 span differences and D4 revised-scenario differences are preserved as evidence; they are not averaged, silently normalized or used to tune tolerances.

Disposition:

```text
D2_D4_SOURCE_DIFFERENCES = EXPLICITLY_DISPOSITIONED
```

## 6. Remaining direct-source trace gate

Still open:

```text
DIRECT_T2_2_PAGE_TABLE_EQUATION_MAPPING = NOT_COMPLETE
```

Reason: the exact controlled full guidance PDF is repository-pinned by commit/path/blob, but this connector runtime has not rendered the governing T2.2 pages at calibration/readback quality. Repository transcriptions and retained workbook formulas do not substitute for that direct locator check.

This remaining gate must not be reported as PASS from source-code inspection alone. Under the Owner-approved worked-example qualification policy it is a traceability/audit enhancement, not a downgrade of the merged bounded-screening qualification.

## 7. Operator-visible evidence

Machine-readable source-basis record:

```text
converters/vibration/fit/source-basis-evidence.js
FitSourceBasisEvidence.v1
```

Visible UI:

```text
Vibration Integrity -> FIT -> Engineering Basis
```

The UI shows:

- EI edition and T2.2 method;
- official errata disposition;
- product reference-method confirmation;
- project/client adoption requirement;
- current bounded `SCREENING` authority state with design authority false.

## 8. Current authority projection

Current authority is established by the qualified FIT calculation state and merged qualification evidence; this document only reports it:

```text
qualificationState    = SCREENING
engineeringAuthority  = SCREENING
screeningAuthority    = AUTHORIZED_BOUNDED
designAuthority       = false
codeCompliance        = false
```

No source-basis or errata disposition independently promotes or downgrades those values. Product Freeze remains a separate state and is not established by this record.
