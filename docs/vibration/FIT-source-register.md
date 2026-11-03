# FIT Controlled Source Register

Artifact classification: **HISTORICAL_BASELINE**

## Purpose

This register identifies the retained source artifacts relevant to the first **Flow-Induced Turbulence (FIT)** implementation behind the frozen public calculation ID:

```text
VIB.FIV.FLOW_TURBULENCE
```

The register establishes source identity only. It does **not** qualify any equation, coefficient, table, acceptance criterion, applicability rule, screening result, or design conclusion.

This file preserves the original source-inventory baseline. Its historical blocked-state labels are not current FIT authority. Current authority is controlled by `engineering/workpacks/VIB-FIT.json`, the registered FIT calculation definition, `FIT-Engineering-Method-Specification-v1.md`, `FIT-Screening-Scope-v1.md`, and `FIT-Qualification-Dossier-v1.md`.

## Current authority

```text
methodRevision        = ei-aviff2-fit-screening-v1
calculationState      = IMPLEMENTED
qualificationState    = SCREENING
engineeringAuthority  = SCREENING
screeningAuthority    = AUTHORIZED_BOUNDED
designAuthority       = false
codeCompliance        = false
```

Merged PR #499 is the bounded-screening engineering qualification event. Product Freeze is a separate state and is not established by this source register.

## Historical qualification baseline

The following block is retained verbatim as the pre-qualification source-inventory state. It is **HISTORICAL_BASELINE**, not current authority:

```text
SOURCE_INVENTORIED
NUMERICAL_METHOD_BLOCKED
ENGINEERING_AUTHORITY_NONE
QUALIFICATION_ISSUE_429_OPEN
```

At that historical stage, the production calculator was required to remain blocked until the exact governing method, native units, equations/tables, applicability, assessment criteria, and independent benchmark evidence were controlled and reviewed. Those subsequent qualification events are recorded in the current method/scope/dossier and PR #499; this paragraph must not be used to downgrade current FIT screening authority.

## Frozen migration baseline

| Item | Value |
|---|---|
| Source repository | `reallaksh19/CRF-4-1` |
| Frozen commit | `68dc8e1fa2ef67073c59b3afc56f1bf40953d535` |
| Intended mechanism | Flow-Induced Turbulence (FIT) |
| Qualification issue | `reallaksh19/3D_Converters#429` |
| Production API ID | `VIB.FIV.FLOW_TURBULENCE` |

## Retained FIT workbook artifacts

Two retained paths at the frozen CRF-4-1 commit resolve to the **same Git blob and same byte size**.

| Path | Git blob SHA-1 | Size | Current role |
|---|---|---:|---|
| `Extended calc2/AIV FIV/FIT.xlsm` | `d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e` | 493,650 bytes | Migration/source evidence only |
| `Enhanced stress report/extended calc/KS-PR-CAL-0086 Vibration Assessment - Flow Induced Turbulence Calculation.xlsm` | `d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e` | 493,650 bytes | Migration/source evidence only |

### Source-control consequence

Qualification must bind the workbook **content identity**, not the filename. The two names above do not represent two independent engineering sources because they are byte-identical Git blobs.

The retained Git blob is therefore the source-extraction pin:

```text
d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e
```

This Git hash proves repository content identity. It does not prove correctness, method authority, licensing scope, or engineering approval.

## Migrated JavaScript status

The retained module:

```text
misc calc update/viewer/calc/formulas/aiv-fiv.js
```

is **not** a numerical implementation source. At the frozen CRF-4-1 commit it explicitly reports that exact workbook formulas/equations are pending source extraction, returns placeholder zeroes for `lof`, `fmax`, and `flim`, and marks the benchmark `PENDING_SOURCE_EXTRACTION`.

Disposition:

```text
REFERENCE_ONLY
DO_NOT_PORT_NUMERICAL_OUTPUTS
DO_NOT_USE_ZEROES_AS_BENCHMARKS
```

## Source extraction command

PR #438 provides an operator tool that reads a supplied `.xlsm/.xlsx` using the repository's existing `xlsx` dependency and emits deterministic JSON containing:

- file size;
- SHA-256;
- Git blob SHA-1;
- workbook sheet names/order;
- visibility and used ranges;
- defined names;
- cell addresses/types/values/formulas/number formats;
- merged ranges;
- formula counts;
- VBA-project presence flag.

Recommended invocation for the retained FIT workbook:

```bash
node scripts/extract-fit-workbook-source.mjs \
  /path/to/FIT.xlsm \
  --expected-git-blob d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e \
  --out /tmp/FIT-source-inventory.json
```

For formula-only review:

```bash
node scripts/extract-fit-workbook-source.mjs \
  /path/to/FIT.xlsm \
  --expected-git-blob d7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e \
  --formulas-only \
  --out /tmp/FIT-formulas.json
```

A supplied expected Git blob mismatch is a hard failure.

## What extraction evidence may be used for

The inventory may support:

- locating workbook formulas and constants;
- identifying named inputs/outputs;
- identifying hidden/very-hidden sheets;
- identifying formula dependencies for method tracing;
- discovering workbook lookup/master candidates;
- creating a controlled cell/equation trace;
- comparing duplicate workbook copies by content identity;
- building the FIT Engineering Method Specification.

## What extraction evidence does not prove

The inventory does **not** establish:

- that every workbook formula is correct;
- that the workbook matches the current licensed Energy Institute/project method;
- that a cached workbook value is a valid benchmark;
- that a hard-coded cell constant has engineering authority;
- that a macro/VBA routine is safe or qualified;
- that a unit-dependent empirical coefficient has been interpreted correctly;
- that the method applies to a specific physical case;
- screening or design authority.

## Historical next engineering artifact

The original baseline required creation of:

```text
docs/vibration/FIT-Engineering-Method-Specification-v1.md
```

That requirement is **SUPERSEDED_REQUIREMENT / COMPLETE**: the controlled method specification now exists and is part of the merged qualification basis. The original minimum trace namespaces remain useful history:

```text
FIT-APP-*    applicability rules
FIT-EQ-*     equations/correlation steps
FIT-TBL-*    lookup tables
FIT-CONST-*  empirical constants
FIT-ASS-*    assessment/action criteria
```

## Historical authority rule

The original rule remains valid as a historical source-control principle:

> Workbook extraction is an evidence-gathering step. It does not by itself establish numerical or engineering authority.

Current bounded-screening authority comes from the qualified method and evidence package, not from workbook extraction alone.
