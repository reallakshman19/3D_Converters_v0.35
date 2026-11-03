import { canonicalDigest } from './mapping-package.js';
import { validateMappingManifest } from './mapping-validator.js';
import { resolveEntryPortsV2 } from './port-resolver.js';
import { validateConnectivityV2 } from './connectivity.js';
import { enforceSourceGraphPolicy } from './source-graph.js';
import { verifyMappingWorklist } from './mapping-worklist.js';

const DECISION_SET_KEYS = Object.freeze([
  'schema', 'decisionSetId', 'worklistId',
  'sourceGraphCanonicalSha256', 'decisions',
]);
const EXCLUSION_KEYS = Object.freeze(['workItemId', 'disposition', 'reason']);
const PROMOTION_KEYS = Object.freeze(['workItemId', 'disposition', 'mappingEntry']);
const ENTRY_KEYS = Object.freeze([
  'mappingEntryId', 'logicalComponentId', 'sourceModelObjectId',
  'sourceOccurrenceId', 'sourceGeometryObjectIds', 'componentType',
  'scopeDisposition', 'ports', 'engineering',
]);
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export class DecisionFailure extends Error {
  constructor(status, message, evidence = null) {
    super(`${status} ${message}`);
    this.name = 'DecisionFailure';
    this.status = status;
    this.evidence = evidence;
  }
}

function fail(status, message, evidence = null) {
  throw new DecisionFailure(status, message, evidence);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('BLOCKED_DECISION_BINDING', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort().join('\0');
  const expected = [...keys].sort().join('\0');
  if (actual !== expected) fail('BLOCKED_DECISION_BINDING', `${label} has missing or unexpected fields.`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail('BLOCKED_DECISION_BINDING', `${label} is required.`);
  return value;
}

function requireHash(value, label) {
  const text = requireText(value, label);
  if (!HASH_PATTERN.test(text)) fail('BLOCKED_DECISION_BINDING', `${label} must be lowercase SHA-256.`);
  return text;
}

function compareText(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

function normalizedDecision(decision) {
  const value = structuredClone(decision);
  if (value.disposition === 'promote' && Array.isArray(value.mappingEntry?.sourceGeometryObjectIds)) {
    value.mappingEntry.sourceGeometryObjectIds.sort(compareText);
  }
  return value;
}

function normalizedDecisions(decisions) {
  return decisions.map(normalizedDecision).sort((left, right) => (
    compareText(left.workItemId, right.workItemId) || compareText(left.disposition, right.disposition)
  ));
}

function decisionSetPayload(value) {
  return {
    schema: value.schema,
    worklistId: value.worklistId,
    sourceGraphCanonicalSha256: value.sourceGraphCanonicalSha256,
    decisions: normalizedDecisions(value.decisions),
  };
}

export async function calculateDecisionSetId(value) {
  return canonicalDigest(decisionSetPayload(value));
}

function assertNoPlaceholders(value, label, path = '') {
  if (value === null) fail('BLOCKED_DECISION_BINDING', `${label}${path} cannot be null.`);
  if (typeof value === 'string' && ['TBD', 'TODO', 'PLACEHOLDER', 'DEFAULT'].includes(value.trim().toUpperCase())) {
    fail('BLOCKED_DECISION_BINDING', `${label}${path} contains a placeholder sentinel.`);
  }
  if (Array.isArray(value)) value.forEach((item, index) => assertNoPlaceholders(item, label, `${path}[${index}]`));
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (['coordinate', 'position', 'xyz'].includes(key)) {
      fail('BLOCKED_DECISION_BINDING', `${label}${path}.${key} is unbound coordinate authority.`);
    }
    assertNoPlaceholders(child, label, `${path}.${key}`);
  }
}

function validateMappingEntry(entry, label) {
  exactKeys(entry, ENTRY_KEYS, label);
  if (entry.scopeDisposition !== 'promote') {
    fail('BLOCKED_DECISION_BINDING', `${label}.scopeDisposition must be promote.`);
  }
  if (!Array.isArray(entry.sourceGeometryObjectIds)) {
    fail('BLOCKED_DECISION_BINDING', `${label}.sourceGeometryObjectIds must be an array.`);
  }
  assertNoPlaceholders(entry, label);
}

function validateDecision(decision, index) {
  const label = `decisions[${index}]`;
  if (decision?.disposition === 'exclude-with-reason') {
    exactKeys(decision, EXCLUSION_KEYS, label);
    assertNoPlaceholders(requireText(decision.reason, `${label}.reason`), `${label}.reason`);
  } else if (decision?.disposition === 'promote') {
    exactKeys(decision, PROMOTION_KEYS, label);
    validateMappingEntry(decision.mappingEntry, `${label}.mappingEntry`);
  } else {
    fail('BLOCKED_DECISION_BINDING', `${label}.disposition is unsupported.`);
  }
  requireText(decision.workItemId, `${label}.workItemId`);
}

export function validateDecisionSetShape(value) {
  const set = exactKeys(value, DECISION_SET_KEYS, 'decisionSet');
  if (set.schema !== 'FbxMappingDecisionSet.v1') fail('BLOCKED_DECISION_BINDING', 'unsupported decision-set schema.');
  requireHash(set.decisionSetId, 'decisionSet.decisionSetId');
  requireHash(set.worklistId, 'decisionSet.worklistId');
  requireHash(set.sourceGraphCanonicalSha256, 'decisionSet.sourceGraphCanonicalSha256');
  if (!Array.isArray(set.decisions)) fail('BLOCKED_DECISION_BINDING', 'decisionSet.decisions must be an array.');
  set.decisions.forEach(validateDecision);
  return set;
}

export async function createDecisionSet({ worklist, decisions }) {
  const draft = {
    schema: 'FbxMappingDecisionSet.v1',
    decisionSetId: '0'.repeat(64),
    worklistId: worklist.worklistId,
    sourceGraphCanonicalSha256: worklist.sourceGraph.canonicalSha256,
    decisions: normalizedDecisions(decisions),
  };
  draft.decisionSetId = await calculateDecisionSetId(draft);
  return validateDecisionSetShape(draft);
}

function decisionIndex(decisions, items) {
  const expected = new Set(items.map((item) => item.workItemId));
  const index = new Map();
  for (const decision of decisions) {
    if (!expected.has(decision.workItemId)) {
      fail('BLOCKED_DECISION_COVERAGE', `unknown work item ${decision.workItemId}.`);
    }
    if (index.has(decision.workItemId)) {
      fail('BLOCKED_DECISION_CONFLICT', `duplicate decision for ${decision.workItemId}.`);
    }
    index.set(decision.workItemId, decision);
  }
  for (const id of expected) if (!index.has(id)) {
    fail('BLOCKED_DECISION_COVERAGE', `missing decision for ${id}.`);
  }
  return index;
}

function sameIds(left, right) {
  return [...left].map(String).sort(compareText).join('\0')
    === [...right].map(String).sort(compareText).join('\0');
}

function assertPromotionIdentity(item, entry) {
  if (entry.sourceModelObjectId !== item.sourceModelObjectId) {
    fail('BLOCKED_DECISION_CONFLICT', `${item.workItemId} changes source model identity.`);
  }
  if (entry.sourceOccurrenceId !== item.sourceOccurrenceId) {
    fail('BLOCKED_DECISION_CONFLICT', `${item.workItemId} changes source occurrence identity.`);
  }
  if (!sameIds(entry.sourceGeometryObjectIds, item.sourceGeometryObjectIds)) {
    fail('BLOCKED_DECISION_CONFLICT', `${item.workItemId} changes geometry ownership.`);
  }
}

function compileDisposition(item, decision) {
  if (decision.disposition === 'exclude-with-reason') {
    return { exclusion: {
      sourceModelObjectId: item.sourceModelObjectId,
      scopeDisposition: 'exclude-with-reason',
      reason: decision.reason,
    } };
  }
  assertPromotionIdentity(item, decision.mappingEntry);
  return { entry: structuredClone(decision.mappingEntry) };
}

function compileManifest(worklist, decisions) {
  const byItem = decisionIndex(decisions, worklist.workItems);
  const entries = [], exclusions = [], scope = [];
  const modelOwners = new Set();
  for (const item of worklist.workItems) {
    if (modelOwners.has(item.sourceModelObjectId)) {
      fail('BLOCKED_DECISION_CONFLICT', `multiple work items share source model ${item.sourceModelObjectId}.`);
    }
    modelOwners.add(item.sourceModelObjectId);
    scope.push(item.sourceModelObjectId);
    const result = compileDisposition(item, byItem.get(item.workItemId));
    if (result.entry) entries.push(result.entry);
    else exclusions.push(result.exclusion);
  }
  return {
    schema: 'FbxStagedMapping.v2',
    inScopeSourceObjectIds: scope.sort(compareText),
    entries,
    exclusions,
  };
}

function validateCompiledMapping(manifest, graph) {
  const accepted = validateMappingManifest(manifest, graph);
  const resolved = new Map(accepted.entries.map((entry) => [
    entry.mappingEntryId, resolveEntryPortsV2(entry, graph),
  ]));
  validateConnectivityV2(accepted.entries, resolved);
  return {
    schema: accepted.schema,
    inScopeSourceObjectIds: accepted.scope,
    entries: accepted.entries,
    exclusions: accepted.exclusions,
  };
}

async function verifyDecisionBinding(set, worklist) {
  validateDecisionSetShape(set);
  if (set.worklistId !== worklist.worklistId) fail('BLOCKED_DECISION_BINDING', 'decision set targets another worklist.');
  if (set.sourceGraphCanonicalSha256 !== worklist.sourceGraph.canonicalSha256) {
    fail('BLOCKED_DECISION_BINDING', 'decision set targets another source graph.');
  }
  const observedId = await calculateDecisionSetId(set);
  if (observedId !== set.decisionSetId) fail('BLOCKED_DECISION_BINDING', 'decisionSetId is stale or tampered.');
}

export async function compileMappingDecisions({
  bytes, graph, parserEvidence, worklist, decisionSet,
}) {
  await verifyMappingWorklist({ bytes, graph, parserEvidence, worklist });
  const canonicalGraph = enforceSourceGraphPolicy(graph);
  await verifyDecisionBinding(decisionSet, worklist);
  const manifest = compileManifest(worklist, normalizedDecisions(decisionSet.decisions));
  return validateCompiledMapping(manifest, canonicalGraph);
}
