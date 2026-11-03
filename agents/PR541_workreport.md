# PR541 Work Report — HP Piping Class I6 Master-Data Ownership

## Mission

Make `b313-ch9-master-store/v1` the only runtime master-data authority for governed HP Piping Class calculations, while demoting the legacy docs CSV/TSV library to ingestion/authoring evidence.

## Base

```text
main = d748cc5c891f281704391182fb778d921a691829
branch = agent/hp-piping-class-i6-master-store
```

I6 was initially developed from the HP stack merge SHA `5f695e3...`. Main advanced by two AIV-only commits. The final I6 tree was rebuilt on current main after confirming no HP/master files overlapped.

## Architecture after I6

```text
docs CSV / TSV
    |
    | ingestion / authoring evidence only
    v
master-docs-ingestion.js
    |
    | controlled review / publication boundary
    v
b313-ch9-master-store/v1
    |
    | ONLY governed runtime master source
    v
hp-piping-class-master-store-service.js
    |
    v
HpPipingClassProject/v2 governed basis package
    |
    v
canonical Chapter IX orchestrator
```

## Current data truth

Repository docs currently contain:

```text
material-properties.csv       HEADER_ONLY
pipe-product-overrides.csv    HEADER_ONLY
NPS_OD_BORE_SCHEDULE_MASTER   populated geometry dependency
```

No material allowable, governed purchase product or manufacturing-tolerance row has been promoted into the canonical runtime store.

Current committed store:

```text
revision = R2-CANONICAL-RUNTIME-SOURCE-PENDING
runtimeRole = CANONICAL_RUNTIME_MASTER_STORE
legacyDocsPolicy = CSV_TSV_ARE_INGESTION_AUTHORING_ONLY
canUseForDesignAuthority = false
```

Explicit blockers:

```text
Q-MATERIAL-DATASET-PENDING
  MATERIAL_DATASET_HAS_NO_CONTROLLED_ROWS
  B313_ALLOWABLE_STRESS_SOURCE_REQUIRED
  B313_EDITION_AND_SHA256_CUSTODY_REQUIRED

Q-PRODUCT-OVERLAY-PENDING
  PURCHASE_PRODUCT_DATASET_HAS_NO_CONTROLLED_ROWS
  PRODUCT_MATERIAL_AND_MANUFACTURING_PROCESS_REQUIRED
  SEPARATE_PRODUCT_TOLERANCE_SOURCE_REQUIRED
```

The docs pipe-master Git blob identity is recorded for ingestion traceability but is **not** treated as a controlled document SHA-256.

## Fail-closed ingestion

`converters/b313-chapter-ix/master-docs-ingestion.js`:

- stages dimension candidates only as `SOURCE_PENDING`;
- keeps controlled standard edition/hash reconciliation open;
- quarantines legacy material rows rather than presenting them as B31.3 allowable authority;
- quarantines legacy product overlays because product and tolerance custody are collapsed;
- rejects duplicate/invalid dimension identities;
- never grants design authority.

## Runtime service

`tabs/hp-piping-class-master-store-service.js` is the canonical browser/runtime access seam.

It:

- loads only `engineering/hp-class-standardization/masters/b313-ch9-master-store.json`;
- exposes material/product choices only from projected canonical collections;
- preserves legitimate `0 °C` material points;
- rejects null/blank material temperatures;
- requires selected material+edition to exist;
- requires exactly one selected canonical product;
- requires product material to match selected material;
- creates governed basis packages from the canonical projection;
- validates the entire governed master payload against the currently loaded store before execution.

Imported/manual master payload mismatch -> `GOVERNED_BASIS_CUSTODY_BLOCKED`.

## Workspace controller

`hp-piping-class-workspace-controller/v2` adds:

```text
loadMasterStore()
bindGovernedBasis()
MASTER_STORE_CUSTODY_BLOCKED calculation gate
```

Master runtime state is transient and is not persisted into `HpPipingClassProject/v2`.

Direct engineering input remains available as an explicit migration/review route while the governed master store has no published choices.

## Legacy library cutover

`engineering-library-ui.js` no longer:

```text
traverses .contentDocument
gets the nested calculator document
writes diameter
writes allowable stress
writes cycle Syt
writes product spec / tolerance / candidate walls
clicks Calculate
```

Material interpolation and product selection in that page are now **authoring preview only**.

## Verification

Repository gate:

```bash
node scripts/verify-hp-piping-class-i6-master-data.mjs
```

It includes:

```text
master docs ingestion tests
master runtime tests
0 °C / null-temperature regression
master controller/custody tests
master ownership prohibitions
existing HP workspace controller tests
native editor architecture tests
real-adapter parity test
```

### Executed local exact-blob receipts

The following branch source was reconstructed locally and Git blob hashes were checked before execution:

```text
master-store.js
  GitHub/local blob = 4172af387b57e34fd31e2567cab248f92a36166e

master-docs-ingestion.js
  GitHub/local blob = f0ae51b81ef98397b128e3b8aeb878651601775c

hp-piping-class-master-store-service.js
  GitHub/local blob = 1f10a648a3a03100d7b90642c19fa4f6cdb245a4

hp-piping-class-workspace-controller.js
  GitHub/local blob = e5468141b0bec1fde8f71b339890325a8513eb2e
```

Execution:

```text
I6 exact-blob ingestion/runtime smoke   PASS
I6 exact-blob controller custody smoke  PASS
Node syntax checks                      PASS
```

These receipts verify the new I6 semantics. They are not a substitute for the full native repository suite.

## Unresolved qualification inherited from the merged HP stack

```text
PR535 real Chapter IX adapter numerical parity = NOT_RUN in this environment
Native CORE KD320                       = NOT QUALIFIED / BLOCKED
Code compliance                         = NOT ESTABLISHED
Design authority                        = NOT ESTABLISHED
```

I6 does not promote any of those states.

## Product implication

The governed master route is correctly fail-closed today because the canonical store publishes no material/product/tolerance choices. A native master selector should only become operational after controlled rows are published. Showing inferred choices now would undermine the custody model I6 establishes.

## Merge authority

```text
PR = #541
STATE = DRAFT
MERGE_AUTHORITY = NOT GRANTED FOR I6
```
