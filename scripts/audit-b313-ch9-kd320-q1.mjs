import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditOracle } from './audit-b313-ch9-kd3-oracle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const qdir = path.join(root, 'engineering/hp-class-standardization/qualification/kd320-q1');
const oracleDir = path.join(root, 'engineering/hp-class-standardization/qualification/kd3-oracle');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizeIdentity(value) {
  return text(value).toLowerCase();
}

function unique(values, label, errors) {
  const seen = new Set();
  for (const value of values) {
    if (!value) errors.push(`${label} contains a blank ID.`);
    else if (seen.has(value)) errors.push(`${label} duplicate ID ${value}.`);
    else seen.add(value);
  }
}

function authorityFalse(authority = {}) {
  return authority.nativeCoreKd3Qualified === false
    && authority.codeCompliance === false
    && authority.canUseForDesignAuthority === false;
}

function allKeys(value, out = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => allKeys(item, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      out.add(key);
      allKeys(item, out);
    });
  }
  return out;
}

function semanticRepresentationPresent(item) {
  return Boolean(text(item?.engineeringDefinition) || text(item?.controlledSemanticRef));
}

function validateExtractedSemantic(item, errors) {
  if (!text(item.exactSourceLocator)) errors.push(`${item.semanticId} extracted semantics require exactSourceLocator.`);
  if (!semanticRepresentationPresent(item)) {
    errors.push(`${item.semanticId} extracted semantics require engineeringDefinition or controlledSemanticRef.`);
  }
  if (text(item.engineeringDefinition) && item.publicEngineeringParaphraseApproved !== true) {
    errors.push(`${item.semanticId} public engineeringDefinition requires publicEngineeringParaphraseApproved=true.`);
  }
  for (const field of ['units', 'signConvention', 'selectionRule', 'interpolationRule', 'applicabilityRule']) {
    if (!text(item[field])) {
      errors.push(`${item.semanticId}.${field} must be explicit after extraction; use a controlled NOT_APPLICABLE value where appropriate.`);
    }
  }
  if (!text(item.extractedBy) || !text(item.extractedAt)) {
    errors.push(`${item.semanticId} extracted semantics require extractedBy and extractedAt custody.`);
  }
}

const REQUIRED_SEMANTICS = Object.freeze([
  'KD320-SEM-001', 'KD320-SEM-002', 'KD320-SEM-003', 'KD320-SEM-004',
  'KD320-SEM-005', 'KD320-SEM-006', 'KD320-SEM-007', 'KD320-SEM-008',
  'KD320-SEM-009', 'KD320-SEM-010', 'KD320-SEM-011', 'KD320-SEM-012',
  'KD320-SEM-013', 'KD320-SEM-014'
]);
const REQUIRED_EVIDENCE = Object.freeze(Array.from({ length: 12 }, (_, index) => `E${String(index + 1).padStart(2, '0')}`));
const REQUIRED_GATES = Object.freeze(Array.from({ length: 7 }, (_, index) => `G${index}`));
const REQUIRED_LAYERS = Object.freeze(['METHOD_QUALIFICATION', 'SOFTWARE_QUALIFICATION', 'PRODUCT_RELEASE']);
const REQUIRED_RECEIPTS = Object.freeze(['Q1-SRC-B313-2024', 'Q1-SRC-VIII3-2025']);
const ALLOWED_SEMANTIC_STATUS = new Set(['PENDING_CONTROLLED_SOURCE', 'EXTRACTED_PENDING_INDEPENDENT_CHECK', 'INDEPENDENTLY_CHECKED']);
const ALLOWED_RECEIPT_STATUS = new Set(['PENDING_CONTROLLED_SOURCE_RECEIPT', 'CONTROLLED_RECEIPT_VERIFIED']);
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'licensedText', 'codeText', 'equationText', 'nativeKd320Formula', 'fatigueCurvePoints',
  'curvePoints', 'formulaExpression', 'productionEquation', 'numericExpectedKd320'
]);
const SHA256 = /^sha256:[0-9a-f]{64}$/;

export function auditKd320Q1(overrides = {}) {
  const contract = overrides.contract ?? readJson(path.join(qdir, 'semantic-contract.json'));
  const receipts = overrides.receipts ?? readJson(path.join(qdir, 'source-receipts.json'));
  const evidence = overrides.evidence ?? readJson(path.join(qdir, 'evidence-ledger.json'));
  const oracleLedger = overrides.oracleLedger ?? readJson(path.join(oracleDir, 'source-ledger.json'));
  const oracleRequirements = overrides.oracleRequirements ?? readJson(path.join(oracleDir, 'requirements.json'));
  const oracle = overrides.oracleAudit ?? auditOracle();
  const errors = [];

  if (contract.schema !== 'kd320-semantic-contract/v1') errors.push('Unexpected semantic-contract schema.');
  if (receipts.schema !== 'kd320-controlled-source-receipts/v1') errors.push('Unexpected source-receipts schema.');
  if (evidence.schema !== 'kd320-qualification-evidence-ledger/v1') errors.push('Unexpected evidence-ledger schema.');
  if (!authorityFalse(contract.methodTarget)) errors.push('Semantic contract authority must remain false.');
  if (!authorityFalse(receipts.authority)) errors.push('Controlled source receipt authority must remain false.');
  if (!authorityFalse(evidence.authority)) errors.push('Evidence-ledger authority must remain false.');

  const boundary = contract.qualificationBoundary ?? {};
  for (const field of [
    'nativeArithmeticAllowed',
    'productionKernelAllowed',
    'fatigueCurveEvaluatorAllowed',
    'licensedSourceTextAllowedInPublicRepository',
    'automaticAuthorityPromotionAllowed'
  ]) {
    if (boundary[field] !== false) errors.push(`Qualification boundary ${field} must remain false in Q1.`);
  }

  unique(contract.semanticItems?.map((item) => item.semanticId) ?? [], 'semantic contract', errors);
  unique(receipts.receipts?.map((item) => item.receiptId) ?? [], 'source receipts', errors);
  unique(evidence.evidence?.map((item) => item.evidenceId) ?? [], 'evidence ledger', errors);
  unique(evidence.gates?.map((item) => item.gateId) ?? [], 'qualification gates', errors);
  unique(evidence.qualificationLayers?.map((item) => item.layerId) ?? [], 'qualification layers', errors);

  const semantics = new Map((contract.semanticItems ?? []).map((item) => [item.semanticId, item]));
  const receiptMap = new Map((receipts.receipts ?? []).map((item) => [item.receiptId, item]));
  const evidenceMap = new Map((evidence.evidence ?? []).map((item) => [item.evidenceId, item]));
  const gateMap = new Map((evidence.gates ?? []).map((item) => [item.gateId, item]));
  const layerIds = new Set((evidence.qualificationLayers ?? []).map((item) => item.layerId));
  const requirementIds = new Set((oracleRequirements.requirements ?? []).map((item) => item.id));
  const sourceIds = new Set((oracleLedger.sources ?? []).map((item) => item.sourceId));

  for (const id of REQUIRED_SEMANTICS) if (!semantics.has(id)) errors.push(`Missing semantic item ${id}.`);
  for (const id of REQUIRED_RECEIPTS) if (!receiptMap.has(id)) errors.push(`Missing controlled source receipt ${id}.`);
  for (const id of REQUIRED_EVIDENCE) if (!evidenceMap.has(id)) errors.push(`Missing evidence item ${id}.`);
  for (const id of REQUIRED_GATES) if (!gateMap.has(id)) errors.push(`Missing qualification gate ${id}.`);
  for (const id of REQUIRED_LAYERS) if (!layerIds.has(id)) errors.push(`Missing qualification layer ${id}.`);

  for (const binding of contract.sourceBindings ?? []) {
    if (binding.publicIdentitySourceRef && !sourceIds.has(binding.publicIdentitySourceRef)) {
      errors.push(`${binding.bindingId} unknown public identity source ${binding.publicIdentitySourceRef}.`);
    }
    if (binding.controlledSourceRef && !sourceIds.has(binding.controlledSourceRef)) {
      errors.push(`${binding.bindingId} unknown controlled source ${binding.controlledSourceRef}.`);
    }
    if (!receiptMap.has(binding.controlledReceiptRef)) {
      errors.push(`${binding.bindingId} unknown controlled receipt ${binding.controlledReceiptRef}.`);
    }
  }

  for (const item of contract.semanticItems ?? []) {
    if (!ALLOWED_SEMANTIC_STATUS.has(item.status)) errors.push(`${item.semanticId} unsupported status ${item.status}.`);
    if (!receiptMap.has(item.controlledSourceRef)) errors.push(`${item.semanticId} unknown controlledSourceRef ${item.controlledSourceRef}.`);
    for (const ref of item.requirementRefs ?? []) if (!requirementIds.has(ref)) errors.push(`${item.semanticId} unknown requirementRef ${ref}.`);
    for (const ref of item.evidenceRefs ?? []) if (!evidenceMap.has(ref)) errors.push(`${item.semanticId} unknown evidenceRef ${ref}.`);
    if (item.prohibitedDefault !== 'NO_DEFAULT') errors.push(`${item.semanticId} must prohibit hidden/default semantics.`);

    if (item.status === 'PENDING_CONTROLLED_SOURCE') {
      for (const field of [
        'exactSourceLocator', 'engineeringDefinition', 'units', 'signConvention',
        'selectionRule', 'interpolationRule', 'applicabilityRule'
      ]) {
        if (item[field] !== null) errors.push(`${item.semanticId}.${field} must remain null while source semantics are pending.`);
      }
      if (item.controlledSemanticRef != null) errors.push(`${item.semanticId}.controlledSemanticRef must remain empty while source semantics are pending.`);
      if (item.extractedBy != null || item.extractedAt != null) errors.push(`${item.semanticId} cannot carry extraction custody while source semantics are pending.`);
      if (item.independentlyChecked !== false) errors.push(`${item.semanticId} cannot be independently checked before extraction.`);
      if (item.independentCheckBy != null || item.independentCheckedAt != null) errors.push(`${item.semanticId} cannot carry checker custody while source semantics are pending.`);
    }

    if (item.status === 'EXTRACTED_PENDING_INDEPENDENT_CHECK') {
      validateExtractedSemantic(item, errors);
      if (item.independentlyChecked !== false) errors.push(`${item.semanticId} extracted-pending status requires independentlyChecked=false.`);
      if (item.independentCheckBy != null || item.independentCheckedAt != null) {
        errors.push(`${item.semanticId} extracted-pending status cannot carry completed checker custody.`);
      }
    }

    if (item.status === 'INDEPENDENTLY_CHECKED') {
      validateExtractedSemantic(item, errors);
      if (item.independentlyChecked !== true) errors.push(`${item.semanticId} independently checked status requires independentlyChecked=true.`);
      if (!text(item.independentCheckBy) || !text(item.independentCheckedAt)) {
        errors.push(`${item.semanticId} independently checked status requires independentCheckBy and independentCheckedAt.`);
      }
      if (normalizeIdentity(item.extractedBy) && normalizeIdentity(item.extractedBy) === normalizeIdentity(item.independentCheckBy)) {
        errors.push(`${item.semanticId} extractor and independent checker must be distinct identities.`);
      }
    }
  }

  for (const receipt of receipts.receipts ?? []) {
    if (!ALLOWED_RECEIPT_STATUS.has(receipt.status)) errors.push(`${receipt.receiptId} unsupported status ${receipt.status}.`);
    if (receipt.publicRepositoryContentAllowed !== false) errors.push(`${receipt.receiptId} must prohibit public licensed-source content.`);
    if (receipt.publicIdentitySourceRef && !sourceIds.has(receipt.publicIdentitySourceRef)) {
      errors.push(`${receipt.receiptId} unknown public identity source ${receipt.publicIdentitySourceRef}.`);
    }
    if (receipt.controlledLedgerSourceRef && !sourceIds.has(receipt.controlledLedgerSourceRef)) {
      errors.push(`${receipt.receiptId} unknown controlled ledger source ${receipt.controlledLedgerSourceRef}.`);
    }

    if (receipt.status === 'PENDING_CONTROLLED_SOURCE_RECEIPT') {
      for (const field of ['secureStorageRef', 'documentSha256', 'verifiedBy', 'verifiedAt', 'independentCheckBy', 'independentCheckedAt']) {
        if (receipt[field] !== null) errors.push(`${receipt.receiptId}.${field} must remain null while source receipt is pending.`);
      }
      if (Array.isArray(receipt.exactLocators) && receipt.exactLocators.length) {
        errors.push(`${receipt.receiptId}.exactLocators must remain empty while source receipt is pending.`);
      }
    }

    if (receipt.status === 'CONTROLLED_RECEIPT_VERIFIED') {
      if (!text(receipt.secureStorageRef)) errors.push(`${receipt.receiptId} verified receipt requires secureStorageRef.`);
      if (!SHA256.test(receipt.documentSha256 ?? '')) errors.push(`${receipt.receiptId} verified receipt requires canonical sha256:<64 hex> document hash.`);
      if (!Array.isArray(receipt.exactLocators) || !receipt.exactLocators.length) errors.push(`${receipt.receiptId} verified receipt requires exact locators.`);
      if (!text(receipt.verifiedBy) || !text(receipt.independentCheckBy)) errors.push(`${receipt.receiptId} verified receipt requires verifier/checker identities.`);
      if (normalizeIdentity(receipt.verifiedBy) && normalizeIdentity(receipt.verifiedBy) === normalizeIdentity(receipt.independentCheckBy)) {
        errors.push(`${receipt.receiptId} source verifier and independent checker must be distinct identities.`);
      }
      if (!text(receipt.verifiedAt) || !text(receipt.independentCheckedAt)) errors.push(`${receipt.receiptId} verified receipt requires verification timestamps.`);
    }
  }

  for (const item of evidence.evidence ?? []) {
    if (!item.title || !item.acceptance) errors.push(`${item.evidenceId} requires title and acceptance criteria.`);
    if (!Array.isArray(item.supportRefs) || !item.supportRefs.length) errors.push(`${item.evidenceId} requires supportRefs.`);
  }
  for (const gate of evidence.gates ?? []) {
    for (const ref of gate.evidenceRefs ?? []) if (!evidenceMap.has(ref)) errors.push(`${gate.gateId} unknown evidenceRef ${ref}.`);
  }

  const receiptVerified = (id) => receiptMap.get(id)?.status === 'CONTROLLED_RECEIPT_VERIFIED';
  const semanticChecked = (id) => semantics.get(id)?.status === 'INDEPENDENTLY_CHECKED' && semantics.get(id)?.independentlyChecked === true;
  const allSemanticChecked = REQUIRED_SEMANTICS.every(semanticChecked);
  const evidencePass = (id) => evidenceMap.get(id)?.status === 'PASS';
  const gatePass = (id) => gateMap.get(id)?.status === 'PASS';

  if (evidencePass('E01') && !receiptVerified('Q1-SRC-B313-2024')) errors.push('E01 cannot PASS before Q1-SRC-B313-2024 is CONTROLLED_RECEIPT_VERIFIED.');
  if (evidencePass('E02') && !receiptVerified('Q1-SRC-VIII3-2025')) errors.push('E02 cannot PASS before Q1-SRC-VIII3-2025 is CONTROLLED_RECEIPT_VERIFIED.');
  if (evidencePass('E03') && !allSemanticChecked) errors.push('E03 cannot PASS before all semantic items are independently checked.');
  for (const evidenceId of ['E04', 'E05', 'E06', 'E07', 'E08']) {
    const semanticRefs = (evidenceMap.get(evidenceId)?.supportRefs ?? []).filter((ref) => ref.startsWith('KD320-SEM-'));
    if (evidencePass(evidenceId) && (!semanticRefs.length || !semanticRefs.every(semanticChecked))) {
      errors.push(`${evidenceId} cannot PASS before all referenced semantic items are independently checked.`);
    }
  }

  if (gatePass('G0') && !(evidencePass('E01') && evidencePass('E02'))) errors.push('G0 cannot PASS before E01 and E02 PASS.');
  if (gatePass('G1') && !['E03', 'E04', 'E05', 'E06', 'E07', 'E08'].every(evidencePass)) errors.push('G1 cannot PASS before E03-E08 PASS.');
  for (const gateId of ['G2', 'G3', 'G4', 'G5', 'G6']) {
    if (gatePass(gateId)) errors.push(`${gateId} cannot be promoted to PASS in Q1.`);
  }
  if (['E09', 'E10', 'E11', 'E12'].some(evidencePass)) errors.push('E09-E12 cannot be promoted to PASS in Q1.');

  if (evidence.authority?.automaticPromotionAllowed !== false) errors.push('Evidence ledger automatic promotion must remain disabled.');
  if (evidence.q1ExitCriteria?.nativeCoreKd3QualifiedAfterQ1 !== false) errors.push('Q1 exit must not qualify native CORE KD3.');
  if (evidence.q1ExitCriteria?.canUseForDesignAuthorityAfterQ1 !== false) errors.push('Q1 exit must not grant design authority.');

  for (const artifact of [contract, receipts, evidence]) {
    for (const key of allKeys(artifact)) if (FORBIDDEN_PUBLIC_KEYS.has(key)) errors.push(`Forbidden public-repository field ${key}.`);
  }

  if (!oracle.ok) errors.push(...oracle.errors.map((error) => `oracle: ${error}`));

  const q1Complete = receiptVerified('Q1-SRC-B313-2024')
    && receiptVerified('Q1-SRC-VIII3-2025')
    && allSemanticChecked
    && ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08'].every(evidencePass)
    && gatePass('G0')
    && gatePass('G1');

  return {
    ok: errors.length === 0,
    errors,
    counts: {
      semanticItems: contract.semanticItems?.length ?? 0,
      sourceReceipts: receipts.receipts?.length ?? 0,
      evidenceItems: evidence.evidence?.length ?? 0,
      gates: evidence.gates?.length ?? 0,
      qualificationLayers: evidence.qualificationLayers?.length ?? 0,
      oracleCases: oracle.counts?.cases ?? 0,
      oraclePendingNative: oracle.counts?.pendingNative ?? 0
    },
    state: {
      q1ArtifactsStructurallyValid: errors.length === 0,
      controlledSemanticsComplete: q1Complete,
      q2OraclePopulationAllowed: q1Complete,
      nativeCoreKd3Qualified: false,
      productionKernelAllowed: false,
      canUseForDesignAuthority: false
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditKd320Q1();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
