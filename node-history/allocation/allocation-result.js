import { computeSemanticHash, deepFreeze } from '../../contracts/topo-enriched-xml/contract-core.js';
import { TOPONODEALLOCATIONRESULT_V1 } from '../../contracts/topo-enriched-xml/contracts.js';
import { buildValidation, issue } from '../registry/registry-contracts.js';

export async function buildAllocationResult({
  projectId, zoneId, baseRegistrySnapshotHash, historyMatchResultHash,
  leases = [], allocations = [], retirements = [], reactivations = [],
  blockers = [], warnings = [], evaluatedAt, policy = {},
}) {
  const blocked = blockers.length > 0;
  const semantic = {
    schema: 'TopoNodeAllocationResult.v1', projectId, zoneId, baseRegistrySnapshotHash, historyMatchResultHash,
    leases: blocked ? [] : sortLeases(leases), allocations: blocked ? [] : sortAllocations(allocations),
    retirements: blocked ? [] : sortLifecycle(retirements), reactivations: blocked ? [] : sortLifecycle(reactivations),
  };
  const candidate = {
    ...semantic, evaluatedAt, policyEvidence: structuredClone(policy),
    validation: buildValidation(blockers, [], warnings),
    allocationResultHash: await computeSemanticHash(semantic, 'allocationResultHash'),
  };
  const errors = TOPONODEALLOCATIONRESULT_V1.validate(candidate);
  if (errors.length) throw new AllocationResultContractError([issue('ALLOCATION_RESULT_CONTRACT_INVALID', { errors })]);
  return TOPONODEALLOCATIONRESULT_V1.freeze(candidate);
}

export class AllocationResultContractError extends Error {
  constructor(blockers) { super(blockers.map((row) => row.code).join(', ')); this.name = 'AllocationResultContractError'; this.blockers = deepFreeze(blockers); }
}
function sortLeases(rows) { return structuredClone(rows).sort((a, b) => a.mainLineKey.localeCompare(b.mainLineKey) || a.start - b.start || a.leaseId.localeCompare(b.leaseId)); }
function sortAllocations(rows) { return structuredClone(rows).sort((a, b) => a.mainLineKey.localeCompare(b.mainLineKey) || a.logicalNodeId.localeCompare(b.logicalNodeId)); }
function sortLifecycle(rows) { return structuredClone(rows).sort((a, b) => String(a.mainLineKey).localeCompare(String(b.mainLineKey)) || String(a.historyNodeId).localeCompare(String(b.historyNodeId))); }
