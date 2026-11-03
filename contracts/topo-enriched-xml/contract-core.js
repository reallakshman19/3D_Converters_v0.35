/**
 * TE-002 frozen runtime contract core.
 * Contract validation is deliberately side-effect free and never allocates,
 * matches, normalizes topology, serializes XML, or mutates source records.
 */

import { CONTRACT_SPECS, customValidateContract } from './contract-rules.js';

export const TOPO_STATUS_VALUES = Object.freeze(['PASS', 'REVIEW_REQUIRED', 'BLOCKED']);
export const TOPO_OPERATING_MODE_VALUES = Object.freeze(['LEGACY', 'SHADOW', 'REVIEW', 'ENFORCED']);
export const PSI_OCCURRENCE_DISPOSITIONS = Object.freeze(['EMITTED', 'RESERVED']);
export const AUDIT_METADATA_KEYS = Object.freeze(new Set([
  'evaluatedAt', 'generatedAt', 'createdAt', 'updatedAt', 'runtimeMs',
  'durationMs', 'displayUrl', 'runUrl', 'workflowRunId', 'workflowRunAttempt',
]));

export const HASH_POLICIES = deepFreeze({
  sourceInventoryHash: {
    contract: 'TopoSourceInventory.v1',
    include: ['schema', 'projectId', 'zoneId', 'coordinateFrameId', 'sourceIdentity', 'branches', 'entities', 'ports'],
    excludeAuditMetadata: true,
  },
  logicalTopologyHash: {
    contract: 'TopoLogicalGraph.v1',
    include: ['schema', 'projectId', 'zoneId', 'coordinateFrameId', 'nodes', 'edges', 'junctions', 'boundaries', 'supports'],
    excludeAuditMetadata: true,
  },
  sequencePlanHash: {
    contract: 'TopoSequencePlan.v1',
    include: ['schema', 'projectId', 'zoneId', 'sourceInventoryHash', 'logicalTopologyHash', 'branches', 'components'],
    excludeAuditMetadata: true,
  },
  baseRegistrySnapshotHash: {
    contract: 'registry snapshot aggregate',
    include: ['schemaVersions', 'policy', 'pool', 'lineHistories'],
    excludeAuditMetadata: true,
  },
  configHash: {
    contract: 'TopoEnrichedXML configuration',
    include: ['config'],
    excludeAuditMetadata: true,
  },
  coordinateRegistrationHash: {
    contract: 'coordinate registration evidence',
    include: ['registration'],
    excludeAuditMetadata: true,
  },
  historyMatchResultHash: {
    contract: 'TopoNodeHistoryMatchResult.v1',
    include: ['schema', 'projectId', 'zoneId', 'mainLineKey', 'coordinateFrameId', 'matches', 'newNodes', 'ambiguous', 'conflicts', 'reactivated', 'retirementCandidates'],
    excludeAuditMetadata: true,
  },
  allocationResultHash: {
    contract: 'TopoNodeAllocationResult.v1',
    include: ['schema', 'projectId', 'zoneId', 'baseRegistrySnapshotHash', 'leases', 'allocations', 'retirements', 'reactivations'],
    excludeAuditMetadata: true,
  },
  nodePlanHash: {
    contract: 'TopoNodePlan.v1',
    include: ['schema', 'projectId', 'zoneId', 'sourceInventoryHash', 'logicalTopologyHash', 'sequencePlanHash', 'baseRegistrySnapshotHash', 'configHash', 'logicalNodes', 'emittedOccurrences', 'reservedOccurrences', 'rawPortMappings', 'componentProjection'],
    excludeAuditMetadata: true,
  },
  proposedRegistryHash: {
    contract: 'TopoNodeRegistryPatch.v1',
    include: ['schema', 'projectId', 'zoneId', 'baseRegistryCommit', 'baseRegistrySnapshotHash', 'preconditions', 'operations'],
    excludeAuditMetadata: true,
  },
});

export function validateStatusModel(validation, owner = 'validation') {
  const errors = [];
  if (!isRecord(validation)) return [`${owner} must be an object.`];
  const status = text(validation.status);
  if (!TOPO_STATUS_VALUES.includes(status)) errors.push(`${owner}.status must be PASS, REVIEW_REQUIRED, or BLOCKED.`);
  const blockers = array(validation.blockers);
  const reviewItems = array(validation.reviewItems);
  if (status === 'PASS' && blockers.length) errors.push(`${owner}: PASS cannot contain blockers.`);
  if (status === 'PASS' && reviewItems.length) errors.push(`${owner}: PASS cannot contain reviewItems.`);
  if (status === 'REVIEW_REQUIRED' && blockers.length) errors.push(`${owner}: REVIEW_REQUIRED cannot contain blockers.`);
  if (status === 'REVIEW_REQUIRED' && reviewItems.length === 0) errors.push(`${owner}: REVIEW_REQUIRED requires review evidence.`);
  if (status === 'BLOCKED' && blockers.length === 0) errors.push(`${owner}: BLOCKED requires at least one blocker.`);
  return errors;
}

export function validateOperatingMode(mode) {
  return TOPO_OPERATING_MODE_VALUES.includes(text(mode))
    ? [] : ['operatingMode must be LEGACY, SHADOW, REVIEW, or ENFORCED.'];
}

export function validateContract(schemaName, value) {
  const errors = [];
  const spec = CONTRACT_SPECS[schemaName];
  if (!spec) return [`Unknown frozen contract: ${schemaName}.`];
  if (!isRecord(value)) return [`${schemaName} artifact must be an object.`];
  if (value.schema !== schemaName) errors.push(`schema must equal ${schemaName}.`);
  for (const field of spec.required) {
    if (!(field in value) || value[field] === null || value[field] === '') errors.push(`${schemaName}.${field} is required.`);
  }
  for (const field of spec.arrayFields || []) {
    if (field in value && !Array.isArray(value[field])) errors.push(`${schemaName}.${field} must be an array.`);
  }
  if ('validation' in value) errors.push(...validateStatusModel(value.validation, `${schemaName}.validation`));
  if ('operatingMode' in value) errors.push(...validateOperatingMode(value.operatingMode));
  errors.push(...customValidateContract(schemaName, value));
  return unique(errors);
}

export function assertContract(schemaName, value) {
  const errors = validateContract(schemaName, value);
  if (errors.length) throw new TypeError(`${schemaName} validation failed: ${errors.join('; ')}`);
  return value;
}

export function freezeContract(schemaName, value) {
  assertContract(schemaName, value);
  return deepFreeze(structuredClone(value));
}

export function createContractApi(schemaName) {
  return Object.freeze({
    schema: schemaName,
    validate: (value) => Object.freeze(validateContract(schemaName, value)),
    assert: (value) => assertContract(schemaName, value),
    freeze: (value) => freezeContract(schemaName, value),
  });
}

export function canonicalSemanticJson(value, options = {}) {
  const excluded = new Set(options.excludedKeys || AUDIT_METADATA_KEYS);
  const canonical = canonicalize(value, excluded);
  return JSON.stringify(canonical);
}

export function semanticHashInput(value, policyName) {
  const policy = HASH_POLICIES[policyName];
  if (!policy) throw new RangeError(`Unknown semantic hash policy: ${policyName}.`);
  const selected = {};
  for (const field of policy.include) if (Object.prototype.hasOwnProperty.call(value, field)) selected[field] = value[field];
  return selected;
}

export async function computeSemanticHash(value, policyName) {
  const input = semanticHashInput(value, policyName);
  const bytes = new TextEncoder().encode(canonicalSemanticJson(input));
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is required for semantic hashes.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function array(value) { return Array.isArray(value) ? value : []; }
export function text(value) { return String(value ?? '').trim(); }
export function unique(values) { return [...new Set(values)]; }

function canonicalize(value, excluded) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, excluded));
  if (!isRecord(value)) return value;
  const output = {};
  for (const key of Object.keys(value).filter((key) => !excluded.has(key)).sort()) {
    output[key] = canonicalize(value[key], excluded);
  }
  return output;
}
