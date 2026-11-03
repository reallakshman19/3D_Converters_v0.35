import { computeSemanticHash } from '../../contracts/topo-enriched-xml/contract-core.js';
import { PSIWRITEROCCURRENCEPLAN_V1, TOPONODEPLAN_V1 } from '../../contracts/topo-enriched-xml/contracts.js';
import { computeSemanticValueHash } from './psi-writer-parity-bundle.js';

export async function inspectPsiWriterParityPlans({ occurrencePlan, nodePlan, canonicalBundle, sequentialBundle }) {
  const differences = [];
  addContractErrors(differences, 'occurrencePlan', PSIWRITEROCCURRENCEPLAN_V1.validate(occurrencePlan));
  addContractErrors(differences, 'nodePlan', TOPONODEPLAN_V1.validate(nodePlan));
  addDuplicatePlanEvidence(differences, occurrencePlan, nodePlan);
  addRootChainEvidence(differences, occurrencePlan, nodePlan);
  const expectedOccurrence = await occurrencePlanHash(occurrencePlan);
  const expectedNode = await safeNodePlanHash(nodePlan);
  compareHashChain(differences, 'OCCURRENCE_PLAN_HASH', 'OCCURRENCE_PLAN_HASH_MISMATCH', expectedOccurrence,
    occurrencePlan?.occurrencePlanHash, canonicalBundle?.occurrencePlanHash, sequentialBundle?.occurrencePlanHash);
  compareHashChain(differences, 'NODE_PLAN_HASH', 'NODE_PLAN_HASH_MISMATCH', expectedNode,
    nodePlan?.nodePlanHash, canonicalBundle?.nodePlanHash, sequentialBundle?.nodePlanHash);
  return differences;
}

function addContractErrors(target, owner, errors) {
  if (errors.length) target.push(difference('OUTPUT_VALIDATION', 'OUTPUT_VALIDATION_NOT_PASS',
    `${owner}:CONTRACT`, null, null, { errors }));
}

function addDuplicatePlanEvidence(target, occurrencePlan, nodePlan) {
  const occurrenceDuplicates = duplicates(array(occurrencePlan?.occurrences), 'occurrenceId');
  const allocationDuplicates = duplicates([
    ...array(nodePlan?.emittedOccurrences), ...array(nodePlan?.reservedOccurrences),
  ], 'occurrenceId');
  const projectionDuplicates = duplicates(array(occurrencePlan?.componentProjection), 'componentProjectionId');
  for (const [owner, rows] of [
    ['OCCURRENCE_PLAN', occurrenceDuplicates], ['NODE_PLAN', allocationDuplicates],
  ]) {
    for (const row of rows) target.push(difference('TRACE_IDENTITY', 'TRACE_IDENTITY_MISMATCH',
      `${owner}:${row.key}`, null, null, { owner, claims: row.claims }));
  }
  for (const row of projectionDuplicates) target.push(difference(
    'COMPONENT_PROJECTION', 'COMPONENT_PROJECTION_MISMATCH', `OCCURRENCE_PLAN:${row.key}`,
    null, null, { claims: row.claims },
  ));
}

function addRootChainEvidence(target, occurrencePlan, nodePlan) {
  const fields = ['projectId', 'zoneId', 'sourceInventoryHash', 'logicalTopologyHash', 'sequencePlanHash'];
  const stale = fields.filter((field) => text(occurrencePlan?.[field]) !== text(nodePlan?.[field]))
    .map((field) => ({ field, occurrencePlan: text(occurrencePlan?.[field]), nodePlan: text(nodePlan?.[field]) }));
  if (stale.length) target.push(difference('OCCURRENCE_PLAN_HASH', 'OCCURRENCE_PLAN_HASH_MISMATCH',
    'PLAN_ROOT_CHAIN', null, null, { stale }));
}

function compareHashChain(target, dimension, code, expected, plan, canonical, sequential) {
  const values = { expected, plan: text(plan), canonical: text(canonical), sequential: text(sequential) };
  if (!expected || Object.values(values).some((value) => value !== expected)) {
    target.push(difference(dimension, code, 'ROOT', values));
  }
}

async function occurrencePlanHash(plan) {
  if (!isObject(plan)) return '';
  return computeSemanticValueHash({
    schema: plan.schema, projectId: plan.projectId, zoneId: plan.zoneId,
    sourceInventoryHash: plan.sourceInventoryHash, logicalTopologyHash: plan.logicalTopologyHash,
    sequencePlanHash: plan.sequencePlanHash, occurrences: plan.occurrences,
    componentProjection: plan.componentProjection,
  });
}

async function safeNodePlanHash(plan) {
  try { return isObject(plan) ? await computeSemanticHash(plan, 'nodePlanHash') : ''; }
  catch { return ''; }
}

function duplicates(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = text(row?.[field]), claims = groups.get(key) || [];
    claims.push(row); groups.set(key, claims);
  }
  return [...groups].filter(([key, claims]) => !key || claims.length > 1)
    .map(([key, claims]) => ({ key: key || '(blank)', claims: stable(claims) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function stable(rows) {
  return [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function difference(dimension, code, key, canonical = null, sequential = null, evidence = {}) {
  return { dimension, code, key: text(key), canonical, sequential, evidence };
}
function array(value) { return Array.isArray(value) ? value : []; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return String(value ?? '').trim(); }
