import { canonicalSemanticJson, computeSemanticHash, deepFreeze } from '../../contracts/topo-enriched-xml/contract-core.js';
import { PSISERIALIZATIONPLAN_V1, PSIWRITEROCCURRENCEPLAN_V1, TOPONODEPLAN_V1 } from '../../contracts/topo-enriched-xml/contracts.js';

const PLAN_SCHEMA = 'PsiSerializationPlan.v1';
const ROOT_FIELDS = ['projectId', 'zoneId', 'sourceInventoryHash', 'logicalTopologyHash', 'sequencePlanHash'];
const OPTIONAL_FIELDS = ['sourceEntityId', 'sourceBranch', 'canonicalMainLine', 'projectionRole', 'endpoint', 'psiComponentType'];

export class PsiSerializationPlanError extends Error {
  constructor(blockers) {
    super(blockers.map((row) => row.code).join(', ') || 'PSI serialization plan blocked.');
    this.name = 'PsiSerializationPlanError';
    this.blockers = deepFreeze(dedupe(blockers));
  }
}

export async function buildPsiSerializationPlan({ occurrencePlan, nodePlan, profile = 'STRICT_PSI' }) {
  const blockers = [], reviewItems = [], warnings = [];
  if (!isObject(occurrencePlan)) blockers.push(issue('OCCURRENCE_PLAN_MISSING'));
  if (!isObject(nodePlan)) blockers.push(issue('NODE_PLAN_MISSING'));
  if (blockers.length) throw new PsiSerializationPlanError(blockers);

  validateUpstream(occurrencePlan, nodePlan, blockers, reviewItems, warnings);
  await validateHashes(occurrencePlan, nodePlan, blockers);
  validateRootChain(occurrencePlan, nodePlan, blockers);
  validateProfile(profile, blockers);

  const rows = joinOccurrences(occurrencePlan, nodePlan, blockers);
  validateProjectionCoverage(occurrencePlan, nodePlan, blockers);
  validateNumberOwnership(rows, blockers);
  const semantic = {
    schema: PLAN_SCHEMA, projectId: text(occurrencePlan.projectId), zoneId: text(occurrencePlan.zoneId),
    nodePlanHash: text(nodePlan.nodePlanHash), occurrencePlanHash: text(occurrencePlan.occurrencePlanHash),
    profile: text(profile), branches: buildNeutralBranches(occurrencePlan), occurrences: rows,
  };
  const candidate = {
    ...semantic,
    validation: validation(blockers, reviewItems, warnings),
    serializationPlanHash: await hash(semantic),
  };
  const errors = PSISERIALIZATIONPLAN_V1.validate(candidate);
  if (errors.length) {
    throw new PsiSerializationPlanError([...blockers, issue('SERIALIZATION_PLAN_CONTRACT_INVALID', { errors })]);
  }
  return PSISERIALIZATIONPLAN_V1.freeze(candidate);
}

export async function verifyPsiSerializationPlan({ occurrencePlan, nodePlan, serializationPlan, profile = 'STRICT_PSI' }) {
  const expected = await buildPsiSerializationPlan({ occurrencePlan, nodePlan, profile });
  const blockers = [];
  const errors = PSISERIALIZATIONPLAN_V1.validate(serializationPlan);
  if (errors.length) blockers.push(issue('SERIALIZATION_PLAN_CONTRACT_INVALID', { errors }));
  if (isObject(serializationPlan)) {
    const actualHash = await computeSerializationPlanHash(serializationPlan);
    if (actualHash !== text(serializationPlan.serializationPlanHash)) {
      blockers.push(issue('SERIALIZATION_PLAN_HASH_MISMATCH', { expected: actualHash, actual: text(serializationPlan.serializationPlanHash) }));
    }
    if (canonicalSemanticJson(serializationPlan) !== canonicalSemanticJson(expected)) {
      blockers.push(issue('SERIALIZATION_PLAN_CONTRACT_INVALID', { reason: 'SUPPLIED_PLAN_AGREEMENT_MISMATCH' }));
    }
  }
  return deepFreeze({ expected, blockers: dedupe(blockers) });
}

function validateUpstream(occurrencePlan, nodePlan, blockers, reviewItems, warnings) {
  addContract(PSIWRITEROCCURRENCEPLAN_V1, occurrencePlan, 'OCCURRENCE', blockers);
  addContract(TOPONODEPLAN_V1, nodePlan, 'NODE', blockers);
  addStatus(occurrencePlan.validation, 'OCCURRENCE_PLAN', blockers, reviewItems, warnings);
  addStatus(nodePlan.validation, 'NODE_PLAN', blockers, reviewItems, warnings);
}

function addContract(api, value, prefix, blockers) {
  const errors = api.validate(value);
  if (errors.length) blockers.push(issue(`${prefix}_PLAN_INVALID`, { errors }));
}

function addStatus(value, prefix, blockers, reviewItems, warnings) {
  const status = text(value?.status);
  warnings.push(...array(value?.warnings));
  if (status === 'BLOCKED') blockers.push(issue(`${prefix}_NOT_PASS`, { status, blockers: array(value?.blockers) }));
  if (status === 'REVIEW_REQUIRED') reviewItems.push(issue(`${prefix}_NOT_PASS`, { status, reviewItems: array(value?.reviewItems) }));
}

async function validateHashes(occurrencePlan, nodePlan, blockers) {
  const occurrenceHash = await computeOccurrencePlanHash(occurrencePlan);
  if (occurrenceHash !== text(occurrencePlan.occurrencePlanHash)) {
    blockers.push(issue('OCCURRENCE_PLAN_HASH_MISMATCH', { expected: occurrenceHash, actual: text(occurrencePlan.occurrencePlanHash) }));
  }
  const nodeHash = await computeSemanticHash(nodePlan, 'nodePlanHash');
  if (nodeHash !== text(nodePlan.nodePlanHash)) {
    blockers.push(issue('NODE_PLAN_HASH_MISMATCH', { expected: nodeHash, actual: text(nodePlan.nodePlanHash) }));
  }
}

function validateRootChain(occurrencePlan, nodePlan, blockers) {
  for (const field of ROOT_FIELDS) {
    if (!(field in occurrencePlan) || !(field in nodePlan)) continue;
    if (text(occurrencePlan[field]) !== text(nodePlan[field])) blockers.push(issue('PLAN_ROOT_CHAIN_MISMATCH', {
      field, occurrencePlan: text(occurrencePlan[field]), nodePlan: text(nodePlan[field]),
    }));
  }
}

function validateProfile(profile, blockers) {
  if (profile === 'AUDIT_EXTENDED') blockers.push(issue('AUDIT_EXTENDED_PROFILE_NOT_APPROVED'));
  else if (profile !== 'STRICT_PSI') blockers.push(issue('STRICT_PROFILE_REQUIRED', { profile: text(profile) }));
}

function joinOccurrences(occurrencePlan, nodePlan, blockers) {
  const allocation = indexAllocations(nodePlan, blockers), planned = new Set(), rows = [];
  for (const occurrence of array(occurrencePlan.occurrences)) {
    const occurrenceId = text(occurrence?.occurrenceId);
    planned.add(occurrenceId);
    const nodeRow = allocation.byId.get(occurrenceId);
    if (!nodeRow) {
      blockers.push(issue(missingCode(occurrence), { occurrenceId }));
      continue;
    }
    compareOccurrence(occurrence, nodeRow, allocation.kind.get(occurrenceId), blockers);
    rows.push(serializationRow(occurrence, nodeRow));
  }
  for (const occurrenceId of allocation.byId.keys()) {
    if (!planned.has(occurrenceId)) blockers.push(issue('UNPLANNED_ALLOCATION', { occurrenceId }));
  }
  return rows;
}

function indexAllocations(nodePlan, blockers) {
  const byId = new Map(), kind = new Map();
  for (const [disposition, rows] of [['EMITTED', array(nodePlan.emittedOccurrences)], ['RESERVED', array(nodePlan.reservedOccurrences)]]) {
    for (const row of rows) {
      const occurrenceId = text(row?.occurrenceId);
      if (byId.has(occurrenceId)) blockers.push(issue('DUPLICATE_OCCURRENCE_ALLOCATION', { occurrenceId }));
      else { byId.set(occurrenceId, row); kind.set(occurrenceId, disposition); }
    }
  }
  return { byId, kind };
}

function compareOccurrence(occurrence, nodeRow, nodeDisposition, blockers) {
  const occurrenceId = text(occurrence.occurrenceId);
  if (text(occurrence.disposition) !== nodeDisposition) blockers.push(issue('OCCURRENCE_DISPOSITION_MISMATCH', {
    occurrenceId, expected: text(occurrence.disposition), actual: nodeDisposition,
  }));
  if (text(occurrence.componentProjectionId) !== text(nodeRow.componentProjectionId)) {
    blockers.push(issue('COMPONENT_PROJECTION_MISMATCH', { occurrenceId }));
  }
  if (text(occurrence.logicalNodeId) && text(occurrence.logicalNodeId) !== text(nodeRow.logicalNodeId)) {
    blockers.push(issue('LOGICAL_NODE_ID_MISMATCH', { occurrenceId }));
  }
  for (const field of OPTIONAL_FIELDS) compareOptional(field, occurrence, nodeRow, blockers);
}

function compareOptional(field, occurrence, nodeRow, blockers) {
  if (!(field in nodeRow) || canonicalSemanticJson(nodeRow[field]) === canonicalSemanticJson(occurrence[field])) return;
  const code = field === 'endpoint' ? 'ENDPOINT_SEMANTICS_MISMATCH'
    : (field === 'psiComponentType' ? 'PSI_COMPONENT_TYPE_MISMATCH' : 'COMPONENT_PROJECTION_MISMATCH');
  blockers.push(issue(code, { occurrenceId: text(occurrence.occurrenceId), field, expected: occurrence[field], actual: nodeRow[field] }));
}

function serializationRow(occurrence, nodeRow) {
  return {
    occurrenceId: text(occurrence.occurrenceId), logicalNodeId: text(nodeRow.logicalNodeId),
    componentProjectionId: text(occurrence.componentProjectionId), engineeringNodeNumber: nodeRow.engineeringNodeNumber,
    disposition: text(occurrence.disposition), sourceEntityId: text(occurrence.sourceEntityId),
    sourceBranch: text(occurrence.sourceBranch), canonicalMainLine: text(occurrence.canonicalMainLine),
    projectionRole: occurrence.projectionRole, endpoint: occurrence.endpoint,
    psiComponentType: text(occurrence.psiComponentType), coordinateRole: text(occurrence.coordinateRole),
  };
}

function validateProjectionCoverage(occurrencePlan, nodePlan, blockers) {
  const expected = ownership(occurrencePlan, false), actual = ownership(nodePlan, true);
  if (canonicalSemanticJson(expected) !== canonicalSemanticJson(actual)) {
    blockers.push(issue('COMPONENT_PROJECTION_COVERAGE_MISMATCH', { expected, actual }));
  }
}

function ownership(plan, nodeShape) {
  return array(plan.componentProjection).map((row) => ({
    componentProjectionId: text(row.componentProjectionId), sourceEntityId: text(row.sourceEntityId),
    emitted: nodeShape ? array(row.emittedOccurrenceIds) : ownedByKind(plan, row, 'EMITTED'),
    reserved: nodeShape ? array(row.reservedOccurrenceIds) : ownedByKind(plan, row, 'RESERVED'),
  }));
}

function ownedByKind(plan, projection, disposition) {
  const ids = new Set(array(projection.occurrenceIds).map(text));
  return array(plan.occurrences).filter((row) => ids.has(text(row.occurrenceId)) && row.disposition === disposition).map((row) => text(row.occurrenceId));
}

function validateNumberOwnership(rows, blockers) {
  const numberOwner = new Map(), logicalNumber = new Map();
  for (const row of rows) {
    const number = row.engineeringNodeNumber, logicalNodeId = text(row.logicalNodeId);
    if (numberOwner.has(number) && numberOwner.get(number) !== logicalNodeId) blockers.push(issue('DUPLICATE_ACTIVE_ZONE_NODE_NUMBER', { number, logicalNodeId }));
    if (logicalNumber.has(logicalNodeId) && logicalNumber.get(logicalNodeId) !== number) blockers.push(issue('LOGICAL_NODE_NUMBER_CONFLICT', { logicalNodeId, number }));
    numberOwner.set(number, logicalNodeId); logicalNumber.set(logicalNodeId, number);
  }
}

function buildNeutralBranches(occurrencePlan) {
  const branches = [], byKey = new Map();
  for (const occurrence of array(occurrencePlan.occurrences)) {
    const key = `${text(occurrence.sourceBranch)}\u0000${text(occurrence.canonicalMainLine)}`;
    let branch = byKey.get(key);
    if (!branch) {
      branch = { sourceBranch: text(occurrence.sourceBranch), canonicalMainLine: text(occurrence.canonicalMainLine), componentProjectionIds: [], occurrenceIds: [] };
      branches.push(branch); byKey.set(key, branch);
    }
    const projectionId = text(occurrence.componentProjectionId);
    if (!branch.componentProjectionIds.includes(projectionId)) branch.componentProjectionIds.push(projectionId);
    branch.occurrenceIds.push(text(occurrence.occurrenceId));
  }
  return branches;
}

export async function computeOccurrencePlanHash(plan) {
  return hash({
    schema: plan?.schema, projectId: plan?.projectId, zoneId: plan?.zoneId,
    sourceInventoryHash: plan?.sourceInventoryHash, logicalTopologyHash: plan?.logicalTopologyHash,
    sequencePlanHash: plan?.sequencePlanHash, occurrences: plan?.occurrences,
    componentProjection: plan?.componentProjection,
  });
}

export async function computeSerializationPlanHash(plan) { return hash(serializationSemantic(plan)); }

function serializationSemantic(plan) {
  return {
    schema: plan?.schema, projectId: plan?.projectId, zoneId: plan?.zoneId,
    nodePlanHash: plan?.nodePlanHash, occurrencePlanHash: plan?.occurrencePlanHash,
    profile: plan?.profile, branches: plan?.branches, occurrences: plan?.occurrences,
  };
}

async function hash(value) {
  const bytes = new TextEncoder().encode(canonicalSemanticJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function validation(blockers, reviewItems, warnings) {
  const cleanBlockers = dedupe(blockers), cleanReview = dedupe(reviewItems);
  return { status: cleanBlockers.length ? 'BLOCKED' : (cleanReview.length ? 'REVIEW_REQUIRED' : 'PASS'), blockers: cleanBlockers, reviewItems: cleanReview, warnings: dedupe(warnings) };
}

function dedupe(rows) {
  const seen = new Set();
  return array(rows).filter((row) => { const key = canonicalSemanticJson(row); if (seen.has(key)) return false; seen.add(key); return true; });
}
function missingCode(row) { return row.disposition === 'RESERVED' ? 'RESERVED_OCCURRENCE_ALLOCATION_MISSING' : 'EMITTED_OCCURRENCE_ALLOCATION_MISSING'; }
function issue(code, evidence = {}) { return { code, evidence }; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
