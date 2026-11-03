import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const AIV_WORKBOOK_RECONCILIATION_SCHEMA = 'AivWorkbookReconciliation.v1';

const REQUIRED_BASELINE = Object.freeze({
  repository: 'reallaksh19/CRF-4-1',
  commit: '68dc8e1fa2ef67073c59b3afc56f1bf40953d535',
});

const EXPECTED_WORKBOOKS = Object.freeze(new Map([
  ['AIV-WB-KS-PR-CAL-0087', 'sha1:2566d41c02768a2345513ed42d270b123fe5087c'],
  ['AIV-WB-AIV-FIV', 'sha1:048332ed93abd258ffced6b83af0ae343dfcbc9d'],
  ['AIV-WB-CLOSED-RV', 'sha1:83eeb40d9b224ddd5020c26410a659e01bcea991'],
]));

const MAIN_EI_TRACE_IDS = Object.freeze(new Set([
  'AIV-APP-T2-7-EXTENT-001',
  'AIV-UNIT-T2-7-INPUTS-001',
  'AIV-EQ-SOURCE-PWL-001',
  'AIV-CONST-SFF-001',
  'AIV-ASS-155DB-001',
  'AIV-EQ-ATTENUATION-001',
  'AIV-EQ-MULTI-SOURCE-001',
  'AIV-ASS-LOW-NOISE-TRIM-001',
  'AIV-EQ-T2-6-001',
]));

const ALLOWED_DISPOSITIONS = Object.freeze([
  'REFERENCE_ONLY_NO_FORMULA_ADOPTION',
  'RECONCILED_TO_EI_TRACE_SET_NO_AUTHORITY',
  'CONFLICT_IDENTIFIED_AND_EXCLUDED',
]);

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function sha256Value(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(String(value ?? '').trim().toLowerCase());
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertAivWorkbookInventoryForReconciliation(inventory) {
  if (inventory?.schema !== 'AivWorkbookSourceInventory.v1' || inventory?.methodId !== 'VIB.AIV.ACOUSTIC') {
    throw fail('AIV_WORKBOOK_RECONCILIATION_INVENTORY_SCHEMA_INVALID', 'Expected AivWorkbookSourceInventory.v1 for VIB.AIV.ACOUSTIC.');
  }
  if (inventory?.baseline?.repository !== REQUIRED_BASELINE.repository || inventory?.baseline?.commit !== REQUIRED_BASELINE.commit) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_BASELINE_MISMATCH', 'Workbook inventory is not from the retained CRF-4-1 baseline.');
  }
  if (!Array.isArray(inventory.workbooks) || inventory.workbooks.length !== EXPECTED_WORKBOOKS.size) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_SET_INVALID', 'Exactly three retained AIV workbooks are required.');
  }
  const seen = new Set();
  for (const workbook of inventory.workbooks) {
    const expectedBlob = EXPECTED_WORKBOOKS.get(workbook?.workbookId);
    if (!expectedBlob || seen.has(workbook.workbookId)) {
      throw fail('AIV_WORKBOOK_RECONCILIATION_WORKBOOK_ID_INVALID', 'Workbook IDs must be the exact retained set and unique.');
    }
    seen.add(workbook.workbookId);
    if (workbook.gitBlobSha1 !== expectedBlob) {
      throw fail('AIV_WORKBOOK_RECONCILIATION_BLOB_MISMATCH', `${workbook.workbookId} does not match the pinned retained blob.`);
    }
    if (!sha256Value(workbook.privateDetailsSha256)) {
      throw fail('AIV_WORKBOOK_RECONCILIATION_DETAILS_HASH_REQUIRED', `${workbook.workbookId} requires a private formula-detail SHA-256.`);
    }
    for (const [key, value] of [
      ['formulaCount', workbook.formulaCount],
      ['hiddenSheetCount', workbook.hiddenSheetCount],
      ['definedNameCount', workbook.definedNameCount],
    ]) {
      if (!nonNegativeInteger(value)) throw fail('AIV_WORKBOOK_RECONCILIATION_COUNT_INVALID', `${workbook.workbookId} ${key} must be a non-negative integer.`);
    }
    if (workbook.migrationEvidenceOnly !== true
      || workbook.productionAuthority !== false
      || workbook.formulaImplementationAuthorized !== false
      || workbook.eiReconciliationRequired !== true) {
      throw fail('AIV_WORKBOOK_RECONCILIATION_SOURCE_AUTHORITY_INVALID', `${workbook.workbookId} must remain migration evidence only.`);
    }
  }
  if (inventory?.authority?.evidenceClass !== 'MIGRATION_REFERENCE_ONLY'
    || inventory?.authority?.productionEquationAuthorized !== false
    || inventory?.authority?.screeningAuthority !== 'NOT_AUTHORIZED'
    || inventory?.authority?.designAuthority !== false) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_INVENTORY_AUTHORITY_INVALID', 'Workbook inventory cannot carry engineering authority.');
  }
  return inventory;
}

export function createAivWorkbookReconciliationTemplate(inventoryInput, options = {}) {
  const inventory = assertAivWorkbookInventoryForReconciliation(inventoryInput);
  return {
    schema: AIV_WORKBOOK_RECONCILIATION_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    source: {
      inventoryManifestSha256: options.inventoryManifestSha256 ?? null,
      baselineRepository: inventory.baseline.repository,
      baselineCommit: inventory.baseline.commit,
    },
    authority: {
      productionEquationAuthorized: false,
      screeningAuthority: 'NOT_AUTHORIZED',
      designAuthority: false,
    },
    records: inventory.workbooks.map((workbook) => ({
      workbookId: workbook.workbookId,
      gitBlobSha1: workbook.gitBlobSha1,
      privateDetailsSha256: workbook.privateDetailsSha256,
      expectedFormulaCount: workbook.formulaCount,
      expectedHiddenSheetCount: workbook.hiddenSheetCount,
      expectedDefinedNameCount: workbook.definedNameCount,
      reviewState: 'PENDING',
      reviewerType: null,
      reviewer: null,
      reviewDate: null,
      reviewedFormulaCount: null,
      reviewedHiddenSheetCount: null,
      reviewedDefinedNameCount: null,
      disposition: null,
      eiTraceIds: [],
      conflicts: [],
      rationale: null,
      implementationNote: null,
    })),
  };
}

function assertEiTraceIds(record) {
  if (!Array.isArray(record.eiTraceIds) || record.eiTraceIds.some((id) => !MAIN_EI_TRACE_IDS.has(id))) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_EI_TRACE_INVALID', `${record.workbookId} contains an unknown EI trace ID.`);
  }
  if (record.disposition === 'RECONCILED_TO_EI_TRACE_SET_NO_AUTHORITY' && record.eiTraceIds.length === 0) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_EI_TRACE_REQUIRED', `${record.workbookId} requires at least one EI trace ID for the reconciled disposition.`);
  }
}

function assertReviewedRecord(record, workbook) {
  if (record.gitBlobSha1 !== workbook.gitBlobSha1 || record.privateDetailsSha256 !== workbook.privateDetailsSha256) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_SOURCE_MISMATCH', `${workbook.workbookId} review is not bound to the extracted workbook/formula details.`);
  }
  if (record.reviewState !== 'REVIEWED'
    || record.reviewerType !== 'HUMAN_ENGINEER'
    || !nonBlank(record.reviewer)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(String(record.reviewDate ?? ''))) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_HUMAN_REVIEW_REQUIRED', `${workbook.workbookId} requires a named HUMAN_ENGINEER review with ISO date.`);
  }
  if (record.reviewedFormulaCount !== workbook.formulaCount
    || record.reviewedHiddenSheetCount !== workbook.hiddenSheetCount
    || record.reviewedDefinedNameCount !== workbook.definedNameCount) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_COVERAGE_INCOMPLETE', `${workbook.workbookId} reviewed counts must exactly match the extracted inventory.`);
  }
  if (!ALLOWED_DISPOSITIONS.includes(record.disposition)) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_DISPOSITION_REQUIRED', `${workbook.workbookId} requires an allowed reconciliation disposition.`);
  }
  assertEiTraceIds(record);
  if (!Array.isArray(record.conflicts)) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_CONFLICTS_INVALID', `${workbook.workbookId} conflicts must be an array.`);
  }
  if (record.disposition === 'CONFLICT_IDENTIFIED_AND_EXCLUDED' && record.conflicts.length === 0) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_CONFLICT_REQUIRED', `${workbook.workbookId} requires at least one recorded conflict when excluded.`);
  }
  if (!nonBlank(record.rationale) || !nonBlank(record.implementationNote)) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_NOTES_REQUIRED', `${workbook.workbookId} requires rationale and implementation note.`);
  }
}

export function assertAivWorkbookReconciliationComplete(inventoryInput, reconciliation, options = {}) {
  const inventory = assertAivWorkbookInventoryForReconciliation(inventoryInput);
  if (reconciliation?.schema !== AIV_WORKBOOK_RECONCILIATION_SCHEMA || reconciliation?.methodId !== 'VIB.AIV.ACOUSTIC') {
    throw fail('AIV_WORKBOOK_RECONCILIATION_SCHEMA_INVALID', `Expected ${AIV_WORKBOOK_RECONCILIATION_SCHEMA}.`);
  }
  if (options.inventoryManifestSha256 && reconciliation?.source?.inventoryManifestSha256 !== options.inventoryManifestSha256) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_MANIFEST_HASH_MISMATCH', 'Reconciliation is not bound to the supplied workbook inventory manifest bytes.');
  }
  if (reconciliation?.source?.baselineRepository !== REQUIRED_BASELINE.repository
    || reconciliation?.source?.baselineCommit !== REQUIRED_BASELINE.commit) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_BASELINE_MISMATCH', 'Reconciliation baseline does not match the retained CRF-4-1 source.');
  }
  if (reconciliation?.authority?.productionEquationAuthorized !== false
    || reconciliation?.authority?.screeningAuthority !== 'NOT_AUTHORIZED'
    || reconciliation?.authority?.designAuthority !== false) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_AUTHORITY_INVALID', 'Workbook reconciliation cannot promote AIV authority.');
  }
  if (!Array.isArray(reconciliation.records) || reconciliation.records.length !== inventory.workbooks.length) {
    throw fail('AIV_WORKBOOK_RECONCILIATION_RECORD_SET_INVALID', 'Reconciliation requires one record per retained workbook.');
  }
  const byId = new Map();
  for (const record of reconciliation.records) {
    if (!nonBlank(record?.workbookId) || byId.has(record.workbookId)) {
      throw fail('AIV_WORKBOOK_RECONCILIATION_RECORD_ID_INVALID', 'Reconciliation workbook IDs must be present and unique.');
    }
    byId.set(record.workbookId, record);
  }
  for (const workbook of inventory.workbooks) {
    const record = byId.get(workbook.workbookId);
    if (!record) throw fail('AIV_WORKBOOK_RECONCILIATION_RECORD_MISSING', `Missing review record for ${workbook.workbookId}.`);
    assertReviewedRecord(record, workbook);
  }
  return {
    schema: 'AivWorkbookReconciliationVerification.v1',
    methodId: 'VIB.AIV.ACOUSTIC',
    reconciliationComplete: true,
    reviewedWorkbookCount: inventory.workbooks.length,
    productionEquationAuthorized: false,
    workbookFormulasRemainMigrationEvidenceOnly: true,
    remainingPromotionGates: [
      'CONTROLLED_T2_7_HUMAN_RECONCILIATION',
      'RECONCILE_D2_3_PUBLISHED_FLM1_ARITHMETIC',
      'RECONCILE_WORKED_EXAMPLES_DERIVED_REPORT_RESULT_SCOPE',
      'INDEPENDENT_SONIC_SFF6_BENCHMARK',
      'INDEPENDENT_MULTI_SOURCE_BENCHMARK',
      'INDEPENDENT_VIBRATION_ENGINEER_PROMOTION_REVIEW',
    ],
  };
}

function parseArguments(argv) {
  const positional = [];
  const options = { templateOut: null, verify: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--template-out') options.templateOut = argv[++index] ?? null;
    else if (arg === '--verify') options.verify = argv[++index] ?? null;
    else if (arg.startsWith('--')) throw new TypeError(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1 || Boolean(options.templateOut) === Boolean(options.verify)) {
    throw new TypeError('Usage: node scripts/verify-aiv-workbook-reconciliation.mjs <workbook-inventory.json> (--template-out reconciliation.json | --verify reconciliation.json)');
  }
  return { inventoryPath: positional[0], ...options };
}

export function runAivWorkbookReconciliation(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const inventoryPath = resolve(args.inventoryPath);
  const inventoryBytes = readFileSync(inventoryPath);
  const inventory = JSON.parse(inventoryBytes.toString('utf8'));
  const inventoryManifestSha256 = `sha256:${sha256Hex(inventoryBytes)}`;
  if (args.templateOut) {
    const outputPath = resolve(args.templateOut);
    const template = createAivWorkbookReconciliationTemplate(inventory, { inventoryManifestSha256 });
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    return { template, outputPath };
  }
  const reconciliation = JSON.parse(readFileSync(resolve(args.verify), 'utf8'));
  const verification = assertAivWorkbookReconciliationComplete(inventory, reconciliation, { inventoryManifestSha256 });
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
  return verification;
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runAivWorkbookReconciliation();
