# WIP — VIB-GEOM-CUSTODY-02

## Mission

Implement #583 from merged `main@fd7f303dbce054a63f10f8c6b8e234e6d09462ef`:

> bind `wallBasis=NOMINAL` FIT facility readiness to exact certified Catalogue Evidence custody for the same Canonical ID, without deriving OD/wall from DN/schedule or inventing geometry tolerances.

## Authority / qualification

```text
parent                = #429 M5
issue                 = #583
branch                = agent/vib-geom-custody-583-nominal-catalogue
Appendix A comment    = 5314137872
score                 = 98/100
qualification         = QUALIFIED_FOR_VIB_NOMINAL_GEOMETRY_CUSTODY_M5
overlap               = SAFE
merge authority       = OWNER_ONLY / NOT_GRANTED_FOR_THIS NEW PR
```

## First failing falsifier

Committed before production repair:

```text
1156b8231e9775e2bef8fe82b071fcc7c0ce794a
```

Primary falsifier:

```text
NOMINAL + otherwise-complete FIT M5 basis + no same-ID certified catalogue record
=> NOT_READY / request=null / NOMINAL_GEOMETRY_CATALOGUE_CUSTODY_REQUIRED
```

## Exact source loss found

Complete XLSX exchange already contains:

```text
Elements:
  dnInMm / dnOutMm / schedule / catalogueAuthority / canonicalId

Catalogue Evidence:
  authority / catalogueId / catalogueVersion / catalogueHash
  sourceHash / recordId / recordHash / sourceReference
```

The complete workbook parser already requires one Catalogue Evidence row per element. The live gap was `assembleVibrationIntegrityDataset()`, which discarded both `exchange.elements` and `exchange.catalogueEvidence` before FIT planning.

## Production implementation

### Dataset custody

`converters/vibration/dataset/assemble.js` now retains, under the existing deep-frozen dataset:

```text
exchangeComplete
elements[]
catalogueEvidence[]
```

No numerical transformation occurs.

### Geometry custody resolver

New:

```text
converters/vibration/facility/fit-geometry-custody.js
schema = FitFacilityGeometryCustody.v1
```

For `wallBasis=NOMINAL`, READY requires:

```text
complete exchange
same exact Canonical ID element
same exact Canonical ID catalogue evidence
authority
catalogueId
catalogueVersion
catalogueHash
recordId
recordHash
non-empty sourceReference
```

When Elements `catalogueAuthority` is present, it must equal Catalogue Evidence `authority`.

Fail-closed reasons include:

```text
NOMINAL_GEOMETRY_COMPLETE_EXCHANGE_REQUIRED
NOMINAL_GEOMETRY_CATALOGUE_CUSTODY_REQUIRED
NOMINAL_GEOMETRY_CATALOGUE_AUTHORITY_MISMATCH
```

Canonical-ID lookup is exact; whitespace-normalized substitution is not accepted.

Resolver authority:

```text
authority                   = GEOMETRY_PROVENANCE_CUSTODY_ONLY
engineeringAuthority        = NONE
screeningAuthority          = NOT_AUTHORIZED
designAuthority             = false
numericalDimensionAuthority = false
```

### Planner integration

`fit-plan-context.js` builds per-point custody exclusively from dataset exchange records.

`fit-plan-item.js` passes that custody receipt into `resolveFitFacilityEngineeringBasis()`.

`FitFacilityEngineeringBasis.v1.geometry` now exposes:

```text
wallBasis
geometrySource
catalogueAuthority
catalogueRecordId
nominalDescriptor = { dnInMm, dnOutMm, schedule }
```

The catalogue trace is also exposed under:

```text
sourceTrace.geometry.catalogueCustody
```

### Permanent numerical boundary

Catalogue/DN/schedule data are not copied into `request.inputs`.

FIT requests continue to take explicit dimensional enrichment only:

```text
outsideDiameter
wallThickness
optional insideDiameter
```

The new regression deliberately changes DN and schedule to absurd descriptors while proving explicit OD/wall request values remain unchanged.

## Non-NOMINAL behavior

For:

```text
MIN_SPEC | AS_BUILT | MEASURED_CURRENT
```

catalogue custody is `NOT_REQUIRED` in this slice and no catalogue authority/record is silently attached.

This does not define those bases' future source-governance rules; it only prevents NOMINAL semantics leaking into them.

## Fixture migration

Pre-#583 synthetic FIT fixtures used `NOMINAL` as a generic wall-basis value without catalogue records. Rather than fabricate catalogue evidence, unrelated planner/preflight/workflow/tabular/Data-Blocker tests were migrated to explicit `AS_BUILT`.

Dedicated #583 tests are the sole new positive NOMINAL authority seam.

## Backups

Exact pre-edit production/test blobs were preserved with Git blob/tree reuse because the connector-only runtime cannot run `node utils/backup.js`:

```text
.backups/connector-20260817-vib-geom-custody-583/
```

Primary backup checkpoint:

```text
509a8640acbb48ec89de0730a6a6bab6ae53726e
```

Fixture backup checkpoint:

```text
30601674c3b3f6bb553536bda4fcd4f78a85eab6
```

The first attempt to add a second-round backup tree for a newly created file was rejected by the connector. No overwrite followed that rejection. A later retry succeeded and preserved the created geometry resolver under `postcreate/` at checkpoint:

```text
9b967deff21550c5cf9a060f8d074e30c79829d7
```

Do not describe these as native backup-CLI execution.

## Machine acceptance coverage

```text
G01 dataset retains exact exchange element/catalogue custody
G02 NOMINAL missing same-ID record fails closed
G03 incomplete record identity fails closed
G04 Elements/Catalogue authority mismatch fails closed
G05 exact record allows normal readiness without changing dimensions
G06 limited Elements-only exchange cannot establish NOMINAL
G07 DN/schedule cannot populate or modify explicit dimensions
G08 non-NOMINAL basis does not acquire catalogue authority
G09 plan trace exposes catalogue record/source identity without authority promotion
G10 catalogue/DN/schedule metadata stays out of numerical request
additional: foreign/whitespace Canonical-ID evidence cannot satisfy exact scope
```

## Protected scope

No changes to:

```text
FIT equations/correlations/applicability
B1/B2 benchmark expected values or tolerances
screening/design/code authority
Product Freeze
NPS/DN/schedule dimension tables
OD-wall-ID consistency tolerance
standard/normal process conversion
scenario synthesis
.github/workflows/*
PR #546 technical work
T2.9 numerical/source work
```

## Validation truth so far

```text
PASS     issue/base/branch exact
PASS     Appendix A 98/100 before production mutation
PASS     first failing custody test committed before repair
PASS     branch diff contains no workflows/#546/T2.9 numerical-source paths
PASS     no FIT numerical/benchmark files changed
PASS     new geometry custody resolver <300 physical lines by compare ledger (174 before hardening; still <300)
PASS     focused custody regressions <300 physical lines each
PASS     unrelated fixtures no longer fake NOMINAL semantics
NOT_RUN  native exact-checkout Node tests — connector-only private checkout unavailable
NOT_RUN  full repository-native VIB/FIT/AIV suites
NOT_RUN  browser
```

No static/source review is promoted to native execution PASS.

## Exact next action

Open a draft PR after exact-head re-grounding. Keep it unmerged pending separate Owner authorization. This slice does not authorize M6.