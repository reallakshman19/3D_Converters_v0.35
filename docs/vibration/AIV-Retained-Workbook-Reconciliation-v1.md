# AIV Retained Workbook Source Inventory and Reconciliation v1

Status: **MIGRATION EVIDENCE GATE IMPLEMENTED — WORKBOOKS ARE NOT ENGINEERING AUTHORITY**

Method:

```text
VIB.AIV.ACOUSTIC
```

## 1. Retained baseline

The retained AIV workbook evidence is pinned to:

```text
repository: reallaksh19/CRF-4-1
commit: 68dc8e1fa2ef67073c59b3afc56f1bf40953d535
```

Exact files:

```text
AIV-WB-KS-PR-CAL-0087
Enhanced stress report/extended calc/KS-PR-CAL-0087 Vibration Assessment Calculation V and V.xlsx
Git blob: 2566d41c02768a2345513ed42d270b123fe5087c

AIV-WB-AIV-FIV
Extended calc2/AIV FIV/AIV.xlsx
Git blob: 048332ed93abd258ffced6b83af0ae343dfcbc9d

AIV-WB-CLOSED-RV
Enhanced stress report/extended calc/9.4_AIV Closed RV Calc.xls
Git blob: 83eeb40d9b224ddd5020c26410a659e01bcea991
```

These files are retained for source extraction, migration comparison and historical behavior reconciliation only.

They do **not** outrank the controlled EI T2.7 guidance, official EI errata, or qualified benchmark evidence.

## 2. Source inventory

Command:

```bash
npm run extract:aiv-workbook-sources -- \
  ../CRF-4-1 \
  --out /tmp/aiv-workbook-source-inventory.json \
  --details-dir /tmp/aiv-workbook-private-details
```

Schema:

```text
AivWorkbookSourceInventory.v1
```

Each workbook is byte-verified using its exact Git blob ID before it is opened.

The public inventory records:

- workbook ID and path;
- exact Git blob and file SHA-256;
- byte size;
- XLS/XLSX type;
- VBA-project presence;
- sheet count;
- each sheet name, visibility, used range, merge count, formula count and formula-set SHA-256;
- total formula count;
- hidden/very-hidden sheet count;
- defined-name count and defined-name SHA-256;
- SHA-256 binding to the private detailed formula inventory.

The private review details contain formula addresses, formula strings, cached values, formatted values, number formats and defined-name records.

Private detail files are review artifacts and are not committed or published by the AIV qualification workflow.

## 3. Authority boundary

Every public workbook record states:

```text
migrationEvidenceOnly            = true
productionAuthority              = false
formulaImplementationAuthorized  = false
eiReconciliationRequired         = true
```

The inventory-level authority is:

```text
evidenceClass                = MIGRATION_REFERENCE_ONLY
productionEquationAuthorized = false
screeningAuthority           = NOT_AUTHORIZED
designAuthority              = false
```

A workbook formula must never be copied into the production AIV calculator merely because it exists, produces a familiar value, or appears in a historically used sheet.

## 4. Human reconciliation

Command:

```bash
npm run verify:aiv-workbook-reconciliation -- \
  /tmp/aiv-workbook-source-inventory.json \
  --template-out /tmp/aiv-workbook-reconciliation.json
```

Verification mode:

```bash
npm run verify:aiv-workbook-reconciliation -- \
  /tmp/aiv-workbook-source-inventory.json \
  --verify /path/to/reviewed-aiv-workbook-reconciliation.json
```

Schema:

```text
AivWorkbookReconciliation.v1
```

The reconciliation record is bound to:

1. the exact CRF-4-1 baseline commit;
2. each workbook Git blob;
3. the workbook inventory-manifest SHA-256;
4. each private formula-detail SHA-256;
5. extracted formula, hidden-sheet and defined-name counts.

## 5. Required review coverage

For every retained workbook, a named human engineer must verify that:

```text
reviewedFormulaCount      == extracted formulaCount
reviewedHiddenSheetCount  == extracted hiddenSheetCount
reviewedDefinedNameCount  == extracted definedNameCount
```

Partial sampling does not close the retained-workbook gate.

AI-only or anonymous review cannot close the gate.

## 6. Allowed dispositions

Each workbook must receive exactly one engineering disposition.

### `REFERENCE_ONLY_NO_FORMULA_ADOPTION`

The workbook is retained for historical/migration evidence, but none of its formulas are adopted as AIV method authority.

### `RECONCILED_TO_EI_TRACE_SET_NO_AUTHORITY`

The reviewed workbook content is mapped to one or more controlled EI trace IDs such as:

```text
AIV-EQ-SOURCE-PWL-001
AIV-EQ-ATTENUATION-001
AIV-EQ-T2-6-001
```

The workbook remains secondary evidence even when it agrees with EI.

### `CONFLICT_IDENTIFIED_AND_EXCLUDED`

A workbook behavior or formula conflicts with the controlled EI source or qualified interpretation. The conflict must be recorded explicitly and the workbook behavior must be excluded from production implementation.

A conflict does not permit selecting the workbook instead of EI.

## 7. Formula adoption rule

The retained workbook gate does not authorize production formulas under any disposition.

A production equation may only come from the separately reconciled controlled EI method trace and its qualification benchmark package.

Therefore a successful workbook reconciliation returns:

```text
reconciliationComplete                 = true
workbookFormulasRemainMigrationEvidenceOnly = true
productionEquationAuthorized           = false
```

## 8. Closed-RV workbook boundary

The retained file:

```text
9.4_AIV Closed RV Calc.xls
```

must not be interpreted by filename alone as authority that a closed zero-flow relief valve is an active T2.7 acoustic source.

Its formulas and assumptions must be reviewed against the controlled EI applicability/source-state trace. Any historical closed-valve behavior that cannot be reconciled to EI is recorded and excluded rather than silently preserved.

## 9. CI behavior

The AIV controlled-source workflow now checks out:

```text
reallaksh19/CRF-4-1 @ 68dc8e1fa2ef67073c59b3afc56f1bf40953d535
```

and performs:

1. exact Git-blob verification of all three retained workbooks;
2. formula/hidden-sheet/name inventory extraction;
3. generation of private detail files in the runner temporary directory;
4. generation of a public hash/count manifest;
5. generation of a **PENDING** human reconciliation template;
6. focused workbook-inventory and workbook-reconciliation regression tests.

CI cannot mark any workbook record reviewed and cannot select a reconciliation disposition.

At the time this gate was implemented, repository GitHub Actions jobs were not starting because GitHub reported an Actions-budget limitation. Therefore successful extraction of the actual retained workbook bytes in CI is not yet claimed.

## 10. Promotion consequence

After exact extraction and complete independent human reconciliation, the gate:

```text
RETAINED_WORKBOOK_RECONCILIATION
```

may be considered closed as a migration-evidence gate.

This still does not authorize production AIV calculation. Remaining independent gates include the controlled T2.7 human source reconciliation, D.2.3 FLM1 disposition, sonic SFF=6 benchmark, multi-source benchmark and independent vibration-engineer promotion review.

Until the complete qualification package is accepted, `VIB.AIV.ACOUSTIC` remains BLOCKED.
