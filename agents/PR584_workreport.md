# PR #584 workreport — VIB-GEOM-CUSTODY-02

## Mission

Bounded M5 slice #583:

> Bind FIT `wallBasis=NOMINAL` readiness to exact certified Catalogue Evidence custody for the same Canonical ID without using DN/schedule as numerical geometry and without inventing a geometry consistency tolerance.

## Repository / PR identity

```text
base at original implementation = fd7f303dbce054a63f10f8c6b8e234e6d09462ef
branch                          = agent/vib-geom-custody-583-nominal-catalogue
issue                           = #583
PR                              = #584
Appendix A comment              = 5314137872
score                           = 98/100
qualification                   = QUALIFIED_FOR_VIB_NOMINAL_GEOMETRY_CUSTODY_M5
primary implementation head     = 11579c2d5510e0597840f10c434ed6c77211ca89
purity-hardening head            = 5128de06558231afde7fe25499c94aa272af0697
pre-reconciliation final head   = f3832d9d6dc1864068432a73b4e31a4d1bca260f
```

The original implementation/test-first history remains preserved under the pre-reconciliation backup branch recorded below. The current PR head is a contents-based reconstruction on current `main`; do not claim the original test-first commits are ancestors of the rebuilt head.

## Delivered production behavior

The complete `VibrationTableExchange.v1` already includes `Elements[]` descriptors and complete-only `Catalogue Evidence[]`, but the pre-#584 dataset assembler discarded both before FIT planning.

This PR retains exact exchange custody in the deep-frozen dataset:

```text
exchangeComplete
elements[]
catalogueEvidence[]
```

and introduces:

```text
FitFacilityGeometryCustody.v1
```

For `wallBasis=NOMINAL`, readiness requires:

```text
complete exchange
exact same Canonical ID element
exact same Canonical ID Catalogue Evidence
authority
catalogueId
catalogueVersion
catalogueHash
recordId
recordHash
non-empty sourceReference
```

When Elements `catalogueAuthority` is present it must agree with Catalogue Evidence `authority`.

Fail-closed reasons:

```text
NOMINAL_GEOMETRY_COMPLETE_EXCHANGE_REQUIRED
NOMINAL_GEOMETRY_CATALOGUE_CUSTODY_REQUIRED
NOMINAL_GEOMETRY_CATALOGUE_AUTHORITY_MISMATCH
```

Canonical-ID matching is exact. Foreign IDs and whitespace-different source identities do not satisfy the assessment point.

## Numerical / authority boundary

Permanent invariants remain:

```text
DN/NPS != outsideDiameter
Schedule != wallThickness
```

`dnInMm`, `dnOutMm` and `schedule` are retained only as `nominalDescriptor` trace. They never populate or modify OD/wall/ID and never enter `request.inputs`.

Catalogue custody is provenance-only:

```text
authority                   = GEOMETRY_PROVENANCE_CUSTODY_ONLY
engineeringAuthority        = NONE
screeningAuthority          = NOT_AUTHORIZED
designAuthority             = false
numericalDimensionAuthority = false
```

For `MIN_SPEC | AS_BUILT | MEASURED_CURRENT`, this slice returns catalogue custody `NOT_REQUIRED`; it does not silently attach nominal catalogue authority.

No schedule-to-dimension resolver or OD-wall-ID tolerance is introduced.

## Production seam

```text
EDIT converters/vibration/dataset/assemble.js
NEW  converters/vibration/facility/fit-geometry-custody.js
EDIT converters/vibration/facility/fit-plan-context.js
EDIT converters/vibration/facility/fit-engineering-basis.js
EDIT converters/vibration/facility/fit-plan-item.js
```

Flow:

```text
complete exchange
 -> isolated deep-frozen dataset element/catalogue custody copies
 -> per-point exact custody receipt
 -> FitFacilityEngineeringBasis.v1 geometry gate
 -> READY only if NOMINAL custody is valid
 -> existing FIT request uses explicit dimensional enrichment only
```

`FitFacilityEngineeringBasis.v1.geometry` exposes:

```text
wallBasis
geometrySource
catalogueAuthority
catalogueRecordId
nominalDescriptor
```

and source trace exposes:

```text
sourceTrace.geometry.catalogueCustody
```

## Test-first evidence

Primary nominal-custody falsifier was committed before production repair in the preserved original history:

```text
1156b8231e9775e2bef8fe82b071fcc7c0ce794a
```

Focused tests:

```text
tests/vibration-facility-fit-geometry-custody.test.mjs         173 lines
tests/vibration-facility-fit-geometry-custody-trace.test.mjs    84 lines
tests/vibration-facility-fit-geometry-custody-scope.test.mjs    45 lines
tests/vibration-facility-fit-geometry-custody-purity.test.mjs   53 lines
```

Coverage:

```text
G01 dataset retains exchange custody
G02 NOMINAL missing catalogue record fails closed
G03 incomplete catalogue identity fails closed
G04 authority mismatch fails closed
G05 exact record allows normal readiness without changing dimensions
G06 limited Elements-only exchange cannot establish NOMINAL
G07 absurd DN/schedule descriptors cannot modify explicit OD/wall
G08 non-NOMINAL basis acquires no catalogue authority
G09 exact catalogue record/source trace is exposed without authority promotion
G10 catalogue/DN/schedule fields never enter numerical FIT request
extra foreign/whitespace Canonical IDs cannot satisfy exact scope
extra dataset freezing does not freeze caller-owned exchange custody objects
```

## Continuation hardening — caller-object purity

A live continuation review identified an unintended side effect introduced by the new dataset custody retention:

```text
pre-hardening behavior:
  elements: [...exchange.elements]
  catalogueEvidence: [...exchange.catalogueEvidence]
  exchangeAuthority: exchange.authority

then deepFreezeVibrationDataset(...)
```

The arrays were copied but their objects were not. Recursive dataset freezing could therefore freeze caller-owned `Elements`, `Catalogue Evidence.sourceReference`, and exchange-authority objects.

The protective regression and repair remain preserved in original history:

```text
baf32a7fc6d34ff73b9d1b5446ef56aa6026a90c  purity falsifier
5128de06558231afde7fe25499c94aa272af0697  repair
```

`assembleVibrationIntegrityDataset()` recursively clones retained exchange custody values before freezing the dataset. This changes no FIT inputs, equations, applicability, catalogue authority semantics, or readiness criteria.

## Existing fixture migration

Pre-#583 synthetic tests had used `NOMINAL` as a generic wall-basis token while carrying no catalogue record. Rather than fabricate catalogue evidence, unrelated tests were migrated to explicit `AS_BUILT`:

```text
tests/vibration-facility-fit-engineering-basis.test.mjs
tests/vibration-facility-fit-plan.test.mjs
tests/vibration-facility-fit-preflight.test.mjs
tests/vibration-facility-fit-workflow.test.mjs
tests/vibration-facility-fit-tabular-workflow.test.mjs
tests/vibration-fit-data-blockers.test.mjs
```

Their numerical expectations remain unchanged. Dedicated #583 tests own the positive NOMINAL authority seam.

## Backup custody

Connector-only backup custody is explicit; no claim is made that `node utils/backup.js` ran.

Earlier exact Git blob/tree checkpoints retained in the PR content:

```text
509a8640acbb48ec89de0730a6a6bab6ae53726e  pre-production production-file blobs
30601674c3b3f6bb553536bda4fcd4f78a85eab6  pre-migration fixture blobs
9b967deff21550c5cf9a060f8d074e30c79829d7  post-create resolver blob before hardening
18b94a76c1858824724666c994afcac2eedf0799  exact pre-purity-repair assemble.js copy
a633cca9837e77fa9c8eb3724de164352a9773e5  exact pre-report-refresh PR584 workreport copy
```

Pre-reconciliation exact head is additionally preserved at:

```text
backup/vib-geom-custody-583-pre-main-sync-20260817
= f3832d9d6dc1864068432a73b4e31a4d1bca260f
```

## 2026-08-17 current-main reconciliation receipt

Owner instruction in the active conversation authorized **refresh/reconcile #584 to current main and make it merge-ready; no merge**.

```text
pre-reconciliation exact head = f3832d9d6dc1864068432a73b4e31a4d1bca260f
current main at rebuild start = a43765008863fa93cccb7186bfea3af24bde562f
post-original-base dependencies = #586 + #588
sync PR                      = #590
sync merge attempt           = BLOCKED_BY_REPOSITORY_POLICY
repository response          = merge commits are not allowed
reconciliation method        = contents-based true reconstruction from exact current main
rebuild branch               = agent/vib-geom-custody-583-rebase-20260817
original history custody     = backup/vib-geom-custody-583-pre-main-sync-20260817
```

The reconstruction replays #584's final production/test/governance content on top of `main@a43765008863fa93cccb7186bfea3af24bde562f`. It does not synthesize a fake merge commit and does not claim original test-first commits are ancestors of the rebuilt head.

Post-base authority gates were verified byte-for-byte before the feature ref move:

```text
#586 geometry consistency module
  path = converters/vibration/fit/geometry-consistency-authority.js
  main blob = rebuilt blob = 29e922c4289bbeac0c3ea58cf5f1b639e54ca1df
  tolerance = null
  productionExecutionAllowed = false

#588 process actualization module
  path = converters/vibration/fit/process-basis-authority.js
  main blob = rebuilt blob = 56606f2d2696744a174f5242fdf42417305cbf73
  referenceConditions = null
  conversionModel = null
  compressibilityModel = null
  gasConstant = null
  atmosphericPressure = null
  pressureReferenceRule = null
  invariantQuantityRule = null
  STANDARD/NORMAL production conversion = false
```

No #546 technical work, workflow edits, T2.9 numerical/source work, FIT benchmark-oracle changes, Product-Freeze changes, geometry-tolerance authorization, or process-actualization authorization were introduced by reconciliation.

## Protected scope

No changes to:

```text
FIT equations/correlations/applicability
B1/B2 benchmark expected values/tolerances
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

## Validation truth after reconciliation

```text
PASS     Appendix A 98/100 before original production mutation
PASS     original test-first history preserved on exact backup branch
PASS     production five-file final content replayed from preserved #584 head
PASS     dedicated G01-G10 + exact-ID + purity regressions replayed
PASS     six unrelated legacy fixtures retain explicit AS_BUILT basis
PASS     connector backup custody retained
PASS     #586 geometry-consistency authority byte-identical to current main
PASS     #588 process-basis authority byte-identical to current main
PASS     no merge to main performed during reconciliation
NOT_RUN  native exact-checkout focused Node tests — connector-only private checkout unavailable
NOT_RUN  full repository-native VIB/FIT/AIV suites
NOT_RUN  browser
PENDING  exact rebuilt-head PR Actions/reviews/mergeability — superseded by post-ref receipt below
```

Source/static evidence is not promoted to native execution PASS.

## Merge state

```text
DRAFT = true
MERGE_AUTHORITY = OWNER_ONLY / NOT_GRANTED_FOR_PR_584
```

This reconciliation is not merge authorization. PR #584 remains draft and unmerged until a new explicit Owner merge instruction.

## Next programme position

#429 remains in M5 after this slice. This PR does not authorize M6.

Still-separate M5 obligations include controlled geometry consistency/tolerance authority, explicit standard/normal-to-actual process resolution, and broader coherent OperatingScenario semantics. The first two remain explicitly blocked by #586/#588; OperatingScenario identity/coherence is the next non-overlapping M5 slice after #584 lands.

## Post-ref exact-head re-ground — 2026-08-17

The feature ref was moved only after reconstruction and authority-gate equality checks. Exact state observed immediately after the move:

```text
base main                    = a43765008863fa93cccb7186bfea3af24bde562f
PR head before this receipt = 72a43a65366094c4fc23902df143b100073dccbe
PR state                     = OPEN
PR draft                     = true
PR merged                    = false
PR mergeable                 = true
review submissions           = 0
review threads               = 0
combined commit statuses     = 0 returned
Actions workflow-run query   = UNAVAILABLE_TO_INTEGRATION (403)
native focused Node tests    = NOT_RUN
full native VIB/FIT/AIV      = NOT_RUN
browser                      = NOT_RUN
merge authority              = OWNER_ONLY / NOT_GRANTED_FOR_PR_584
```

The empty combined-status result is not promoted to an Actions PASS. Exact-head Actions remain **NOT_VERIFIED** because the workflow-runs endpoint was inaccessible to the integration. This receipt supersedes the `PENDING` line above for reviews/threads/mergeability.

PR #590 became empty after the true current-main reconstruction (`0 commits / 0 changed files` relative to the rebuilt feature branch); GitHub subsequently reports it closed/merged by ancestry with `merge_commit_sha` equal to current main. No new synchronization commit was introduced into either branch, and no merge to `main` occurred.