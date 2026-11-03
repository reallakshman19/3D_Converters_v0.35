/**
 * TE-016A source identity and line-inventory adapter.
 *
 * Bridges the accepted component-topology production API
 * (buildComponentTopologyArtifacts / buildTopologySourceModel) — proven only
 * against the synthetic TE-012 fixture until now — onto real 3D project
 * source data, for the purpose of sizing a node-history zone registry
 * bootstrap. It does not participate in TE-013/014/015 PSI/CII production;
 * that remains TE-016's separate concern.
 *
 * Canonical main-line identity is derived using the already-accepted
 * canonicalBranchRoot() function (strips the trailing /B<n> sub-branch
 * suffix) applied to both the branch's own name and its OWNER attribute.
 * Agreement between the two auto-accepts; a genuine disagreement
 * (OWNER_SOURCE_CONFLICT) is never silently resolved — it fails closed
 * unless the caller supplies an explicit approvedBranchIdentityResolutions
 * entry, per the branch-identity authority model.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { buildComponentTopologyArtifacts } from '../../../tabs/model-converters/converters/component-topology/topology-artifact-exporter.js';
import { buildTopologySourceModel } from '../../../tabs/model-converters/converters/component-topology/topology-source-model.js';
import { canonicalBranchRoot } from '../../../tabs/stagedjson-to-enrichxml/sj-branch-identity.js';

const SOURCE_INVENTORY_SCHEMA = 'TopoSourceInventory.v1';
const PASS = Object.freeze({ status: 'PASS', blockers: [], reviewItems: [], warnings: [] });

export async function buildAsim1885SourceLineInventory({
  filePath,
  sourceName,
  jobName,
  projectId,
  zoneId,
  coordinateFrameId,
  toleranceMm,
  supportProjectionToleranceMm,
  expectedGitBlobSha1,
  approvedBranchIdentityResolutions = {},
}) {
  const rawBuffer = readFileSync(filePath);
  const identity = computeRawIdentity(rawBuffer, expectedGitBlobSha1);
  const sourceText = rawBuffer.toString('utf8');

  const [built, model] = await Promise.all([
    buildComponentTopologyArtifacts(sourceText, {
      sourceName, jobName, toleranceMm, supportProjectionToleranceMm, enrichmentConfig: {},
    }),
    buildTopologySourceModel(sourceText, { sourceName, sourceRevision: 1, toleranceMm }),
  ]);

  const branchIdentity = classifyBranchIdentities(model.branches, approvedBranchIdentityResolutions);
  if (branchIdentity.conflicts.length) {
    const summary = branchIdentity.conflicts
      .map((row) => `${row.sourceBranch}: name-root=${row.fromName} OWNER-root=${row.fromOwner}`)
      .join('; ');
    throw new BranchIdentityConflictError(
      `OWNER_SOURCE_CONFLICT for ${branchIdentity.conflicts.length} branch(es): ${summary}. `
      + 'Per the branch-identity authority model this requires explicit engineering resolution '
      + '(approvedBranchIdentityResolutions) rather than silently preferring OWNER or the source root.',
      branchIdentity.conflicts,
    );
  }

  const sourceMainLineByEntityId = new Map();
  for (const branch of model.branches) {
    const sourceMainLineKey = branchIdentity.mainLineByBranchEntityId.get(branch.sourceEntityId);
    sourceMainLineByEntityId.set(branch.sourceEntityId, sourceMainLineKey);
    for (const component of branch.components) sourceMainLineByEntityId.set(component.sourceEntityId, sourceMainLineKey);
  }
  const registryMainLineKeyBySource = buildRegistryKeyMap(sourceMainLineByEntityId);

  const { currentLogicalNodes, lineDemand } = attributeNodesToLines({
    nodes: built.canonicalTopology.nodes,
    mainLineByEntityId: sourceMainLineByEntityId,
    registryMainLineKeyBySource,
    projectId,
    zoneId,
  });

  const sourceInventory = buildSourceInventory({
    model, mainLineByEntityId: sourceMainLineByEntityId, registryMainLineKeyBySource,
    projectId, zoneId, coordinateFrameId, identity,
  });

  return Object.freeze({
    identity,
    metrics: built.metrics,
    lines: [...lineDemand.entries()]
      .map(([mainLineKey, nodeCount]) => Object.freeze({ mainLineKey, nodeCount }))
      .sort((a, b) => a.mainLineKey.localeCompare(b.mainLineKey)),
    sourceInventory,
    currentLogicalNodes,
  });
}

export class BranchIdentityConflictError extends Error {
  constructor(message, conflicts) {
    super(message);
    this.name = 'BranchIdentityConflictError';
    this.conflicts = conflicts;
  }
}

/**
 * Section 8.2 branch-identity authority model: the canonical main line comes
 * from canonicalBranchRoot(), applied to both the branch's own name and its
 * OWNER attribute. Agreement is auto-accepted (OWNER_CONFIRMED_BY_SOURCE_ROOT).
 * A missing OWNER falls back to the source root (SOURCE_ROOT_ONLY). A real
 * disagreement (OWNER_SOURCE_CONFLICT) is never silently resolved here — it
 * must be pre-approved by the caller (e.g. an engineering decision record)
 * or the build fails closed.
 */
function classifyBranchIdentities(branches, approvedResolutions) {
  const mainLineByBranchEntityId = new Map();
  const conflicts = [];
  for (const branch of branches) {
    const fromName = canonicalBranchRoot(branch.name);
    const owner = branch.attributes?.OWNER;
    if (!owner) {
      if (!fromName) throw new Error(`Branch ${branch.name} has no derivable canonical main line.`);
      mainLineByBranchEntityId.set(branch.sourceEntityId, fromName);
      continue;
    }
    const fromOwner = canonicalBranchRoot(owner);
    if (fromOwner === fromName) {
      mainLineByBranchEntityId.set(branch.sourceEntityId, fromOwner);
      continue;
    }
    const resolution = approvedResolutions[branch.name];
    if (resolution === 'OWNER' || resolution === 'SOURCE_ROOT') {
      mainLineByBranchEntityId.set(branch.sourceEntityId, resolution === 'OWNER' ? fromOwner : fromName);
      continue;
    }
    conflicts.push(Object.freeze({ sourceBranch: branch.name, owner, fromName, fromOwner }));
  }
  return { mainLineByBranchEntityId, conflicts };
}

function computeRawIdentity(rawBuffer, expectedGitBlobSha1) {
  const rawByteLength = rawBuffer.length;
  const rawSha256 = createHash('sha256').update(rawBuffer).digest('hex');
  const gitBlobSha1 = createHash('sha1')
    .update(`blob ${rawByteLength}\0`)
    .update(rawBuffer)
    .digest('hex');
  if (expectedGitBlobSha1 && gitBlobSha1 !== expectedGitBlobSha1) {
    throw new Error(`Git blob identity mismatch: expected ${expectedGitBlobSha1}, computed ${gitBlobSha1}.`);
  }
  return Object.freeze({ rawByteLength, rawSha256, gitBlobSha1 });
}

function attributeNodesToLines({ nodes, mainLineByEntityId, registryMainLineKeyBySource, projectId, zoneId }) {
  const currentLogicalNodes = [];
  const lineDemand = new Map();
  for (const node of nodes) {
    const candidates = [...new Set(
      node.sourceEntityIds.map((entityId) => mainLineByEntityId.get(entityId)).filter(Boolean),
    )].sort();
    if (!candidates.length) throw new Error(`Canonical node ${node.id} has no attributable main line.`);
    const sourceMainLineKey = candidates[0];
    const mainLineKey = registryMainLineKeyBySource.get(sourceMainLineKey);
    lineDemand.set(mainLineKey, (lineDemand.get(mainLineKey) ?? 0) + 1);
    currentLogicalNodes.push(Object.freeze({
      logicalNodeId: `LN-${node.id}`, mainLineKey, sourceMainLineKey, projectId, zoneId,
      sourceEntityIds: Object.freeze([...node.sourceEntityIds].sort()),
      sourcePortIds: Object.freeze([...node.sourcePortIds].sort()),
    }));
  }
  currentLogicalNodes.sort((a, b) => a.logicalNodeId.localeCompare(b.logicalNodeId));
  return { currentLogicalNodes: Object.freeze(currentLogicalNodes), lineDemand };
}

/**
 * The registry's zone/lease/allocation authority requires mainLineKey values
 * matching MAIN_LINE_PATTERN (uppercase [A-Z0-9._-] segments only). Real
 * source main-line names legitimately contain characters outside that set
 * (e.g. the inch mark in nominal bore, `6"`). This maps each distinct source
 * main line to a deterministic, collision-checked, schema-valid registry key
 * without altering which components group together — the grouping itself
 * still comes solely from canonicalBranchRoot().
 */
function buildRegistryKeyMap(mainLineByEntityId) {
  const sourceKeys = [...new Set(mainLineByEntityId.values())].sort();
  const registryKeyBySource = new Map();
  const used = new Set();
  for (const sourceKey of sourceKeys) {
    const candidate = sanitizeMainLineKey(sourceKey);
    if (used.has(candidate)) throw new Error(`Sanitized main-line key collision for ${sourceKey} -> ${candidate}.`);
    used.add(candidate);
    registryKeyBySource.set(sourceKey, candidate);
  }
  return registryKeyBySource;
}

function sanitizeMainLineKey(sourceKey) {
  const segments = sourceKey.split('/').filter(Boolean).map((segment) => {
    let cleaned = segment
      .toUpperCase()
      .replace(/"/g, 'IN')
      .replace(/[^A-Z0-9._-]/g, '_')
      .replace(/^[._-]+/, '');
    if (!cleaned) cleaned = 'X';
    if (!/^[A-Z0-9]/.test(cleaned)) cleaned = `X${cleaned}`;
    return cleaned;
  });
  return `/${segments.join('/')}`;
}

function buildSourceInventory({ model, mainLineByEntityId, registryMainLineKeyBySource, projectId, zoneId, coordinateFrameId, identity }) {
  const branches = model.branches.map((branch) => {
    const sourceMainLineKey = mainLineByEntityId.get(branch.sourceEntityId);
    return Object.freeze({
      sourceBranch: branch.name,
      canonicalMainLine: sourceMainLineKey,
      registryMainLineKey: registryMainLineKeyBySource.get(sourceMainLineKey),
    });
  });
  const entities = model.entities.map((entity) => Object.freeze({ sourceEntityId: entity.sourceEntityId }));
  const ports = model.sourcePorts.map((port) => Object.freeze({
    sourcePortId: port.sourcePortId, sourceEntityId: port.sourceEntityId,
  }));
  return Object.freeze({
    schema: SOURCE_INVENTORY_SCHEMA,
    projectId,
    zoneId,
    coordinateFrameId,
    sourceIdentity: Object.freeze({
      sourceHash: `sha256:${identity.rawSha256}`,
      rawByteLength: identity.rawByteLength,
      gitBlobSha1: identity.gitBlobSha1,
    }),
    branches: Object.freeze(branches),
    entities: Object.freeze(entities),
    ports: Object.freeze(ports),
    validation: PASS,
  });
}
