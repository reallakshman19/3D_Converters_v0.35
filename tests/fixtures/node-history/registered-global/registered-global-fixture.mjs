import { computeSemanticHash } from '../../../../contracts/topo-enriched-xml/contract-core.js';
import {
  buildRegistrySnapshotManifest,
  computeLineHistoryHash,
  computeZoneRegistryHash,
} from '../../../../node-history/registry/registry-hash.js';
import { computeRegisteredMatcherPolicyHash } from '../../../../node-history/matching/registered-matcher-policy.js';

export const HASH = `sha256:${'1'.repeat(64)}`;
export const TOPOLOGY_HASH = `sha256:${'2'.repeat(64)}`;

export async function baseInput(overrides = {}) {
  const currentNodes = overrides.currentLogicalNodes ?? [current('C1', 0, { topologySignature: 'SIG-A' })];
  const unmatchedIds = overrides.unmatchedIds ?? currentNodes.map((row) => row.logicalNodeId);
  const exact = await exactResult(unmatchedIds, overrides.exactMatches || []);
  const histories = overrides.histories ?? [history('H1')];
  const positions = overrides.positions ?? [registeredPosition('H1', 1, { topologySignature: 'SIG-A' })];
  const mainLine = overrides.historyLine || '/A';
  const previousRegistry = await registry(histories, mainLine);
  exact.baseRegistrySnapshotHash = previousRegistry.registrySnapshotHash;
  await refreshExactHash(exact);
  const registration = await registrationArtifact(positions, previousRegistry.registrySnapshotHash);
  const matcherPolicy = policy(overrides);
  matcherPolicy.policyHash = await computeRegisteredMatcherPolicyHash(matcherPolicy);
  return {
    exactMatchResult: exact,
    currentLogicalNodes: currentNodes,
    sourceInventory: sourceInventory(currentNodes),
    previousRegistry,
    coordinateRegistrations: [registration],
    coverage: overrides.coverage ?? { scope: 'PARTIAL_LINE', authoritativeForRetirement: false },
    policy: matcherPolicy,
    evaluatedAt: overrides.evaluatedAt || '2026-07-20T10:30:00Z',
  };
}

export async function refreshRegistrationHash(artifact) {
  artifact.coordinateRegistrationHash = await computeSemanticHash({
    registration: normalizedRegistration(artifact.registration),
  }, 'coordinateRegistrationHash');
}
export async function refreshExactHash(result) {
  result.historyMatchResultHash = await computeSemanticHash(result, 'historyMatchResultHash');
}
export async function refreshPolicyHash(value) {
  value.policyHash = await computeRegisteredMatcherPolicyHash(value);
}
export async function refreshRegistry(input) {
  const registryValue = input.previousRegistry;
  for (const line of registryValue.lineHistories) line.lineHistoryHash = await computeLineHistoryHash(line);
  for (const ref of registryValue.zoneRegistry.lineHistoryRefs) {
    ref.lineHistoryHash = registryValue.lineHistories.find((row) => row.mainLineKey === ref.mainLineKey).lineHistoryHash;
  }
  registryValue.zoneRegistry.zoneRegistryHash = await computeZoneRegistryHash(registryValue.zoneRegistry);
  registryValue.snapshotManifest = await buildRegistrySnapshotManifest({
    zoneRegistry: registryValue.zoneRegistry,
    lineHistories: registryValue.lineHistories,
  });
  registryValue.registrySnapshotHash = registryValue.snapshotManifest.registrySnapshotHash;
  input.exactMatchResult.baseRegistrySnapshotHash = registryValue.registrySnapshotHash;
  await refreshExactHash(input.exactMatchResult);
  input.coordinateRegistrations[0].registration.baseRegistrySnapshotHash = registryValue.registrySnapshotHash;
  await refreshRegistrationHash(input.coordinateRegistrations[0]);
}

export function current(logicalNodeId, x, overrides = {}) {
  return {
    logicalNodeId, projectId: 'P1', zoneId: 'Z1', mainLineKey: '/A', logicalRole: 'ROUTE',
    position: { x, y: 0, z: 0 }, ...overrides,
  };
}
export function history(historyNodeId, overrides = {}) {
  return { historyNodeId, lifecycleStatus: 'ACTIVE', ...overrides };
}
export function registeredPosition(historyNodeId, x, corroboration = {}) {
  return {
    historyNodeId, position: { x, y: 0, z: 0 }, coordinateFrameId: 'HISTORY-FRAME',
    corroboration: { logicalRole: 'ROUTE', ...corroboration },
  };
}
export function dimension(dimensionId, field) {
  return {
    dimensionId, currentPath: field, historyPath: field, weight: '1000000000000',
    authority: 'MATCH-POLICY',
  };
}
export function validation(status, blockers = [], reviewItems = []) {
  return { status, blockers, reviewItems, warnings: [] };
}
export function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).reverse().map((key) => [key, reverseObjectKeys(value[key])]));
}

async function exactResult(unmatchedIds, matches) {
  const result = {
    schema: 'TopoNodeHistoryMatchResult.v1', projectId: 'P1', zoneId: 'Z1', mainLineKey: '/A',
    coordinateFrameId: 'CURRENT-FRAME', logicalTopologyHash: TOPOLOGY_HASH,
    baseRegistrySnapshotHash: HASH, matches,
    newNodes: unmatchedIds.map((logicalNodeId) => ({ logicalNodeId, outcome: 'NO_EXACT_MATCH', candidates: [] })),
    ambiguous: [], conflicts: [], reactivated: [], retirementCandidates: [],
    validation: validation('PASS'), evaluatedAt: '2026-07-20T10:00:00Z',
  };
  await refreshExactHash(result);
  return result;
}

async function registrationArtifact(historyPositions, registryHash) {
  const artifact = {
    registration: {
      registrationId: 'REG-1', projectId: 'P1', zoneId: 'Z1',
      sourceCoordinateFrameId: 'CURRENT-FRAME', targetCoordinateFrameId: 'HISTORY-FRAME',
      transform: {
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        sourceUnit: 'MM', targetUnit: 'MM',
      },
      anchors: [{ anchorId: 'A1', sourceIdentity: 'S1', targetIdentity: 'T1', authority: 'APPROVED', approved: true }],
      residual: { rms: 0.1, maximum: 0.2 },
      policyVersion: 'REG-P1', configVersion: 'REG-C1',
      baseRegistrySnapshotHash: registryHash, historyPositions,
    },
    validation: validation('PASS'), coordinateRegistrationHash: '',
  };
  await refreshRegistrationHash(artifact);
  return artifact;
}

async function registry(historyNodes, mainLineKey) {
  const lineHistory = {
    schema: 'PsiNodeLineHistory.v1', registryVersion: '1.0.0', projectId: 'P1', zoneId: 'Z1',
    mainLineKey, coordinateRegistrationRef: 'REG-1',
    historyNodes: historyNodes.map((row, index) => historyRecord(row, mainLineKey, 100 + index * 10)),
    validation: validation('PASS'), lineHistoryHash: HASH,
  };
  lineHistory.lineHistoryHash = await computeLineHistoryHash(lineHistory);
  const zoneRegistry = {
    schema: 'PsiNodeZoneRegistry.v1', registryVersion: '1.0.0', projectId: 'P1', zoneId: 'Z1',
    policyVersion: 'REGISTRY-P1', configVersion: 'REGISTRY-C1',
    namespace: { minimum: 0, maximum: 9990, defaultStep: 10 },
    leases: [{
      leaseId: 'LEASE-A', mainLineKey, status: 'ACTIVE', ranges: [{ start: 100, end: 990, step: 10 }],
      firstObservedRevision: 'R1', lastObservedRevision: 'R1',
      evidence: { authority: 'APPROVED_REGISTRY', revisionId: 'R1' },
    }],
    lineHistoryRefs: [{ mainLineKey, path: 'node-history/registry/lines/A.json', lineHistoryHash: lineHistory.lineHistoryHash }],
    coordinateRegistrationRefs: ['REG-1'], validation: validation('PASS'), zoneRegistryHash: HASH,
  };
  zoneRegistry.zoneRegistryHash = await computeZoneRegistryHash(zoneRegistry);
  const snapshotManifest = await buildRegistrySnapshotManifest({ zoneRegistry, lineHistories: [lineHistory] });
  return { zoneRegistry, lineHistories: [lineHistory], snapshotManifest, registrySnapshotHash: snapshotManifest.registrySnapshotHash };
}

function historyRecord(row, mainLineKey, number) {
  const status = row.lifecycleStatus || 'ACTIVE';
  return {
    ...structuredClone(row), engineeringNodeNumber: number,
    sourceAliases: [`ALIAS-${row.historyNodeId}`],
    identityEvidence: [{ kind: 'SOURCE_REF', value: `REF-${row.historyNodeId}`, authority: 'FIXTURE' }],
    immutableFacts: { historyNodeId: row.historyNodeId, engineeringNodeNumber: number, mainLineKey, firstObservedRevision: 'R1' },
    firstObservedRevision: 'R1', lastObservedRevision: 'R1',
    retirementEvidence: status === 'RETIRED' ? { authority: 'FIXTURE', revisionId: 'R1', reason: 'Retired fixture identity' } : null,
    reactivationEvidence: null,
    supersessionEvidence: status === 'SUPERSEDED' ? { authority: 'FIXTURE', revisionId: 'R1', reason: 'Superseded fixture identity' } : null,
    supersededByHistoryNodeId: status === 'SUPERSEDED' ? `${row.historyNodeId}-NEXT` : null,
  };
}

function sourceInventory(nodes) {
  return {
    schema: 'TopoSourceInventory.v1', projectId: 'P1', zoneId: 'Z1', coordinateFrameId: 'CURRENT-FRAME',
    sourceIdentity: { sourceHash: 'sha256:source' }, branches: [{ sourceBranch: '/A/B1' }],
    entities: nodes.map((node) => ({ sourceEntityId: `E-${node.logicalNodeId}` })),
    ports: nodes.map((node) => ({ sourcePortId: `P-${node.logicalNodeId}`, sourceEntityId: `E-${node.logicalNodeId}` })),
    validation: validation('PASS'),
  };
}

function policy(overrides) {
  const renames = (overrides.approvedLineRenames || []).map((row) => ({
    authority: 'APPROVED_RENAME', evidenceHash: HASH, ...row,
  }));
  return {
    schema: 'RegisteredHistoryMatcherPolicy.v1', policyVersion: 'MATCH-P1', configVersion: 'MATCH-C1',
    registration: {
      maximumResidual: 1, minimumAnchors: 1, allowedUnits: ['MM'],
      policyVersion: 'REG-P1', configVersion: 'REG-C1',
    },
    numeric: { coordinateScale: 1000 }, eligibility: { maximumDistance: 20 },
    hardEligibility: overrides.hardEligibility || {}, approvedLineRenames: renames,
    scoring: {
      corroborationDimensions: overrides.dimensions || [dimension('TOPOLOGY', 'topologySignature')],
      minimumCorroboratingDimensions: 1, distanceSquaredWeight: '1', minimumCandidateScore: '0',
    },
    assignment: { objective: 'MAX_CARDINALITY_THEN_SCORE', scoreMargin: '0', maximumSearchStates: 100000 },
    policyHash: '',
  };
}

function normalizedRegistration(row) {
  return {
    ...row,
    anchors: [...row.anchors].sort((a, b) => a.anchorId.localeCompare(b.anchorId)),
    historyPositions: [...row.historyPositions].sort((a, b) => a.historyNodeId.localeCompare(b.historyNodeId)),
  };
}
