'use strict';
import { array, isRecord, text, unique } from './contract-core.js';

export const PARITY_BOOLEAN_GATES = Object.freeze([
  'nodePlanHashEquivalent',
  'occurrencePlanHashEquivalent',
  'occurrenceIdentityEquivalent',
  'componentProjectionEquivalent',
  'endpointSemanticsEquivalent',
  'engineeringContentEquivalent',
  'sourceBoundaryEquivalent',
  'branchConditionsEquivalent',
  'traceIdentityEquivalent',
  'traceCardinalityEquivalent',
  'reservedOccurrenceTreatmentEquivalent',
  'numberingEquivalent',
  'atomicBundleCoherent',
]);
export const PARITY_NUMERIC_GATES = Object.freeze({
  occurrenceCoverage: 100,
  reservedOccurrenceCoverage: 100,
  writerSideAllocations: 0,
  unplannedOccurrences: 0,
});

export const CONTRACT_SPECS = Object.freeze({
  'TopoSourceInventory.v1': { required: ['schema', 'projectId', 'zoneId', 'coordinateFrameId', 'sourceIdentity', 'branches', 'entities', 'ports', 'validation'], arrayFields: ['branches', 'entities', 'ports'] },
  'TopoLogicalGraph.v1': { required: ['schema', 'projectId', 'zoneId', 'coordinateFrameId', 'sourceInventoryHash', 'nodes', 'edges', 'junctions', 'boundaries', 'supports', 'validation'], arrayFields: ['nodes', 'edges', 'junctions', 'boundaries', 'supports'] },
  'TopoNodeTopologyNormalization.v1': { required: ['schema', 'projectId', 'zoneId', 'sourceInventoryHash', 'inputLogicalTopologyHash', 'outputLogicalTopologyHash', 'rawPortMappings', 'actions', 'validation'], arrayFields: ['rawPortMappings', 'actions'] },
  'TopoSequencePlan.v1': { required: ['schema', 'projectId', 'zoneId', 'sourceInventoryHash', 'logicalTopologyHash', 'branches', 'components', 'validation'], arrayFields: ['branches', 'components'] },
  'TopoNodeHistoryMatchResult.v1': { required: ['schema', 'projectId', 'zoneId', 'mainLineKey', 'coordinateFrameId', 'logicalTopologyHash', 'baseRegistrySnapshotHash', 'matches', 'newNodes', 'ambiguous', 'conflicts', 'reactivated', 'retirementCandidates', 'validation'], arrayFields: ['matches', 'newNodes', 'ambiguous', 'conflicts', 'reactivated', 'retirementCandidates'] },
  'TopoNodeAllocationResult.v1': { required: ['schema', 'projectId', 'zoneId', 'baseRegistrySnapshotHash', 'historyMatchResultHash', 'leases', 'allocations', 'retirements', 'reactivations', 'validation'], arrayFields: ['leases', 'allocations', 'retirements', 'reactivations'] },
  'TopoNodePlan.v1': { required: ['schema', 'projectId', 'zoneId', 'sourceInventoryHash', 'logicalTopologyHash', 'sequencePlanHash', 'baseRegistrySnapshotHash', 'configHash', 'logicalNodes', 'emittedOccurrences', 'reservedOccurrences', 'rawPortMappings', 'componentProjection', 'validation', 'nodePlanHash'], arrayFields: ['logicalNodes', 'emittedOccurrences', 'reservedOccurrences', 'rawPortMappings', 'componentProjection'] },
  'TopoTopologyIndex.v1': { required: ['schema', 'projectId', 'zoneId', 'sourceInventoryHash', 'logicalTopologyHash', 'nodePlanHash', 'sourceToLogical', 'logicalToSource', 'logicalToOccurrences', 'occurrenceToLogical', 'validation'], arrayFields: ['sourceToLogical', 'logicalToSource', 'logicalToOccurrences', 'occurrenceToLogical'] },
  'TopoNodeRegistryPatch.v1': { required: ['schema', 'projectId', 'zoneId', 'baseRegistryCommit', 'baseRegistrySnapshotHash', 'coverage', 'preconditions', 'operations', 'validation', 'proposedRegistryHash'], arrayFields: ['preconditions', 'operations'] },
  'TopoPreprocessAudit.v1': { required: ['schema', 'runId', 'projectId', 'zoneId', 'sourceHash', 'configHash', 'baseRegistrySnapshotHash', 'evaluatedAt', 'summary', 'actions', 'validation'], arrayFields: ['actions'] },
  'TopoEnrichedXmlValidationReport.v1': { required: ['schema', 'projectId', 'zoneId', 'operatingMode', 'sourceInventoryHash', 'logicalTopologyHash', 'sequencePlanHash', 'nodePlanHash', 'gates', 'issues', 'validation'], arrayFields: ['issues'] },
  'PsiWriterOccurrencePlan.v1': { required: ['schema', 'projectId', 'zoneId', 'sourceInventoryHash', 'logicalTopologyHash', 'sequencePlanHash', 'occurrences', 'componentProjection', 'validation', 'occurrencePlanHash'], arrayFields: ['occurrences', 'componentProjection'] },
  'PsiWriterOccurrence.v1': { required: ['schema', 'occurrenceId', 'sourceEntityId', 'sourceBranch', 'canonicalMainLine', 'componentProjectionId', 'projectionRole', 'endpoint', 'psiComponentType', 'coordinateRole', 'disposition'], arrayFields: [] },
  'PsiSerializationPlan.v1': { required: ['schema', 'projectId', 'zoneId', 'nodePlanHash', 'occurrencePlanHash', 'profile', 'branches', 'occurrences', 'validation', 'serializationPlanHash'], arrayFields: ['branches', 'occurrences'] },
  'PsiWriterParityReport.v2': { required: ['schema', 'projectId', 'zoneId', 'nodePlanHash', 'occurrencePlanHash', 'canonical', 'sequential', 'differences', 'gates', 'validation'], arrayFields: ['differences'] },
});

const RELATIVE_NUMBER_FIELDS = new Set([
  'offset', 'numberOffset', 'nodeOffset', 'derivedFromOccurrenceId', 'startNodeNumber',
  'nodeCounter', 'numberingSpan', 'increment', 'relativeTo', 'baseNodeNumber',
]);
const OCCURRENCE_REQUIRED_FIELDS = CONTRACT_SPECS['PsiWriterOccurrence.v1'].required.filter((field) => field !== 'schema');
const OCCURRENCE_ALLOWED_FIELDS = new Set([
  ...CONTRACT_SPECS['PsiWriterOccurrence.v1'].required,
  'logicalNodeId', 'sourceRecordId', 'rawComponentType', 'normalizedComponentType',
  'coordinateEvidence', 'orderingEvidence',
]);
const PARITY_SIDE_REQUIRED_FIELDS = Object.freeze([
  'nodePlanHash', 'occurrencePlanHash', 'xmlHash', 'traceHash', 'bundleHash',
  'emittedOccurrenceCount', 'reservedOccurrenceCount',
]);

export function customValidateContract(schemaName, value) {
  const errors = [];
  if (['TopoNodePlan.v1', 'PsiSerializationPlan.v1'].includes(schemaName)) errors.push(...rejectRelativeNumberRepresentation(value, schemaName));
  if (schemaName === 'TopoSourceInventory.v1') errors.push(...validateSourceInventory(value));
  if (schemaName === 'TopoLogicalGraph.v1') errors.push(...validateLogicalGraph(value));
  if (schemaName === 'TopoNodeTopologyNormalization.v1') errors.push(...validateNormalization(value));
  if (schemaName === 'TopoSequencePlan.v1') errors.push(...validateSequencePlan(value));
  if (schemaName === 'TopoNodeHistoryMatchResult.v1') errors.push(...validateHistoryMatches(value));
  if (schemaName === 'TopoNodeAllocationResult.v1') errors.push(...validateAllocation(value));
  if (schemaName === 'TopoNodePlan.v1') errors.push(...validateNodePlan(value));
  if (schemaName === 'TopoTopologyIndex.v1') errors.push(...validateTopologyIndex(value));
  if (schemaName === 'TopoNodeRegistryPatch.v1') errors.push(...validateRegistryPatch(value));
  if (schemaName === 'TopoPreprocessAudit.v1') errors.push(...validateAudit(value));
  if (schemaName === 'TopoEnrichedXmlValidationReport.v1') errors.push(...validateValidationReport(value));
  if (schemaName === 'PsiWriterOccurrence.v1') errors.push(...validateOccurrence(value, 'PsiWriterOccurrence.v1', true));
  if (schemaName === 'PsiWriterOccurrencePlan.v1') errors.push(...validateOccurrencePlan(value));
  if (schemaName === 'PsiSerializationPlan.v1') errors.push(...validateSerializationPlan(value));
  if (schemaName === 'PsiWriterParityReport.v2') errors.push(...validateParity(value));
  return unique(errors);
}

function validateSourceInventory(value) {
  return [
    ...requiredFieldsForRows(value.branches, ['sourceBranch'], 'TopoSourceInventory.v1.branches'),
    ...requiredFieldsForRows(value.entities, ['sourceEntityId'], 'TopoSourceInventory.v1.entities'),
    ...requiredFieldsForRows(value.ports, ['sourcePortId', 'sourceEntityId'], 'TopoSourceInventory.v1.ports'),
    ...uniqueField(value.entities, 'sourceEntityId', 'TopoSourceInventory.v1.entities'),
    ...uniqueField(value.ports, 'sourcePortId', 'TopoSourceInventory.v1.ports'),
  ];
}

function validateLogicalGraph(value) {
  const errors = [
    ...requiredFieldsForRows(value.nodes, ['logicalNodeId'], 'TopoLogicalGraph.v1.nodes'),
    ...requiredFieldsForRows(value.edges, ['logicalEdgeId', 'fromLogicalNodeId', 'toLogicalNodeId'], 'TopoLogicalGraph.v1.edges'),
    ...uniqueField(value.nodes, 'logicalNodeId', 'TopoLogicalGraph.v1.nodes'),
    ...uniqueField(value.edges, 'logicalEdgeId', 'TopoLogicalGraph.v1.edges'),
  ];
  const nodes = new Set(array(value.nodes).map((row) => text(row?.logicalNodeId)).filter(Boolean));
  for (const edge of array(value.edges)) {
    if (!nodes.has(text(edge?.fromLogicalNodeId))) errors.push(`Logical edge ${text(edge?.logicalEdgeId)} has unknown fromLogicalNodeId.`);
    if (!nodes.has(text(edge?.toLogicalNodeId))) errors.push(`Logical edge ${text(edge?.logicalEdgeId)} has unknown toLogicalNodeId.`);
    if (text(edge?.fromLogicalNodeId) && text(edge?.fromLogicalNodeId) === text(edge?.toLogicalNodeId)) errors.push(`Logical edge ${text(edge?.logicalEdgeId)} cannot be a self-loop.`);
  }
  return errors;
}

function validateNormalization(value) {
  const errors = [
    ...requiredFieldsForRows(value.rawPortMappings, ['sourcePortId', 'logicalNodeId'], 'TopoNodeTopologyNormalization.v1.rawPortMappings'),
    ...requiredFieldsForRows(value.actions, ['actionId', 'disposition'], 'TopoNodeTopologyNormalization.v1.actions'),
  ];
  for (const action of array(value.actions)) {
    const disposition = text(action?.disposition);
    if (!['PRESERVE', 'CONSUME_MICRO_COMPONENT', 'SNAP_MICRO_GAP', 'BLOCKED_CONFLICT', 'REVIEW_REQUIRED'].includes(disposition)) {
      errors.push(`Unknown topology-normalization disposition: ${disposition || '(blank)'}.`);
    }
    if (['CONSUME_MICRO_COMPONENT', 'SNAP_MICRO_GAP'].includes(disposition) && !text(action?.authority)) errors.push(`${disposition} requires explicit authority.`);
  }
  return errors;
}

function validateSequencePlan(value) {
  return [
    ...requiredFieldsForRows(value.branches, ['sourceBranch', 'canonicalMainLine'], 'TopoSequencePlan.v1.branches'),
    ...requiredFieldsForRows(value.components, ['sourceEntityId', 'sourceBranch'], 'TopoSequencePlan.v1.components'),
    ...uniqueField(value.branches, 'sourceBranch', 'TopoSequencePlan.v1.branches'),
    ...uniqueField(value.components, 'sourceEntityId', 'TopoSequencePlan.v1.components'),
  ];
}

function validateHistoryMatches(value) {
  const errors = requiredFieldsForRows(value.matches, ['logicalNodeId', 'historyNodeId'], 'TopoNodeHistoryMatchResult.v1.matches');
  const current = new Set();
  const history = new Set();
  for (const match of array(value.matches)) {
    const logicalNodeId = text(match?.logicalNodeId);
    const historyNodeId = text(match?.historyNodeId);
    if (current.has(logicalNodeId)) errors.push(`Logical node ${logicalNodeId} is claimed more than once.`);
    if (history.has(historyNodeId)) errors.push(`Historical node ${historyNodeId} is claimed more than once.`);
    current.add(logicalNodeId);
    history.add(historyNodeId);
  }
  return errors;
}

function validateAllocation(value) {
  const errors = requiredFieldsForRows(value.leases, ['leaseId', 'mainLineKey', 'start', 'end', 'step'], 'TopoNodeAllocationResult.v1.leases');
  const numbers = new Map();
  const logicalOwners = new Map();
  const historyOwners = new Map();
  for (const [index, row] of array(value.allocations).entries()) {
    const number = row?.engineeringNodeNumber;
    const logicalNodeId = text(row?.logicalNodeId);
    const historyNodeId = text(row?.historyNodeId);
    const owner = historyNodeId || logicalNodeId;
    if (!Number.isInteger(number) || number < 0) errors.push(`Allocation ${index} requires a non-negative integer engineeringNodeNumber.`);
    if (!owner) errors.push(`Allocation ${index} requires historyNodeId or logicalNodeId ownership.`);
    if (logicalNodeId && logicalOwners.has(logicalNodeId)) errors.push(`Logical node ${logicalNodeId} has more than one engineering allocation.`);
    if (historyNodeId && historyOwners.has(historyNodeId)) errors.push(`Historical node ${historyNodeId} has more than one engineering allocation.`);
    if (numbers.has(number) && numbers.get(number) !== owner) errors.push(`Engineering node number ${number} has multiple zone owners.`);
    if (logicalNodeId) logicalOwners.set(logicalNodeId, number);
    if (historyNodeId) historyOwners.set(historyNodeId, number);
    numbers.set(number, owner);
  }
  return errors;
}

function validateNodePlan(value) {
  const emitted = array(value.emittedOccurrences);
  const reserved = array(value.reservedOccurrences);
  const all = [...emitted, ...reserved];
  const errors = [
    ...requiredFieldsForRows(value.logicalNodes, ['logicalNodeId'], 'TopoNodePlan.v1.logicalNodes'),
    ...requiredFieldsForRows(all, ['occurrenceId', 'logicalNodeId', 'componentProjectionId', 'engineeringNodeNumber'], 'TopoNodePlan.v1.occurrences'),
    ...requiredFieldsForRows(value.rawPortMappings, ['sourcePortId', 'logicalNodeId'], 'TopoNodePlan.v1.rawPortMappings'),
    ...requiredFieldsForRows(value.componentProjection, ['componentProjectionId', 'sourceEntityId', 'emittedOccurrenceIds', 'reservedOccurrenceIds'], 'TopoNodePlan.v1.componentProjection'),
    ...uniqueField(value.logicalNodes, 'logicalNodeId', 'TopoNodePlan.v1.logicalNodes'),
    ...uniqueField(all, 'occurrenceId', 'TopoNodePlan.v1.occurrences'),
    ...uniqueField(value.componentProjection, 'componentProjectionId', 'TopoNodePlan.v1.componentProjection'),
  ];
  const logicalNodes = new Set(array(value.logicalNodes).map((row) => text(row?.logicalNodeId)).filter(Boolean));
  const occurrenceKind = new Map();
  const occurrenceById = new Map();
  const numberOwners = new Map();
  for (const [kind, occurrences] of [['EMITTED', emitted], ['RESERVED', reserved]]) {
    for (const row of occurrences) {
      const occurrenceId = text(row?.occurrenceId);
      const logicalNodeId = text(row?.logicalNodeId);
      const number = row?.engineeringNodeNumber;
      occurrenceKind.set(occurrenceId, kind);
      occurrenceById.set(occurrenceId, row);
      if (!logicalNodes.has(logicalNodeId)) errors.push(`${kind.toLowerCase()} occurrence ${occurrenceId} has no logical-node mapping.`);
      if (!Number.isInteger(number) || number < 0) errors.push(`${kind.toLowerCase()} occurrence ${occurrenceId} requires an explicit engineeringNodeNumber.`);
      if (numberOwners.has(number) && numberOwners.get(number) !== logicalNodeId) errors.push(`Engineering node number ${number} maps to multiple logical nodes.`);
      numberOwners.set(number, logicalNodeId);
    }
  }
  const ownership = new Map();
  for (const projection of array(value.componentProjection)) {
    const projectionId = text(projection?.componentProjectionId);
    const refs = [['EMITTED', projection?.emittedOccurrenceIds], ['RESERVED', projection?.reservedOccurrenceIds]];
    if (refs.every(([, ids]) => array(ids).length === 0)) errors.push(`Component projection ${projectionId} owns no occurrence.`);
    for (const [expectedKind, ids] of refs) {
      for (const rawId of array(ids)) {
        const occurrenceId = text(rawId);
        const row = occurrenceById.get(occurrenceId);
        if (!row) {
          errors.push(`Component projection ${projectionId} references unknown ${expectedKind.toLowerCase()} occurrence ${occurrenceId}.`);
          continue;
        }
        if (occurrenceKind.get(occurrenceId) !== expectedKind) errors.push(`Component projection ${projectionId} classifies occurrence ${occurrenceId} as ${expectedKind} but the node plan classifies it as ${occurrenceKind.get(occurrenceId)}.`);
        if (text(row.componentProjectionId) !== projectionId) errors.push(`Occurrence ${occurrenceId} declares componentProjectionId ${text(row.componentProjectionId)} but is owned by ${projectionId}.`);
        if (ownership.has(occurrenceId)) errors.push(`Occurrence ${occurrenceId} is owned by multiple component projections.`);
        ownership.set(occurrenceId, projectionId);
      }
    }
  }
  for (const occurrenceId of occurrenceById.keys()) {
    if (!ownership.has(occurrenceId)) errors.push(`Occurrence ${occurrenceId} is orphaned from componentProjection ownership.`);
  }
  return errors;
}

function validateTopologyIndex(value) {
  return [
    ...requiredFieldsForRows(value.sourceToLogical, ['sourceIdentity'], 'TopoTopologyIndex.v1.sourceToLogical'),
    ...requiredFieldsForRows(value.occurrenceToLogical, ['occurrenceId', 'logicalNodeId'], 'TopoTopologyIndex.v1.occurrenceToLogical'),
    ...uniqueField(value.sourceToLogical, 'sourceIdentity', 'TopoTopologyIndex.v1.sourceToLogical'),
    ...uniqueField(value.occurrenceToLogical, 'occurrenceId', 'TopoTopologyIndex.v1.occurrenceToLogical'),
  ];
}

function validateRegistryPatch(value) {
  const errors = requiredFieldsForRows(value.operations, ['operationId', 'type'], 'TopoNodeRegistryPatch.v1.operations');
  const coverage = isRecord(value.coverage) ? value.coverage : {};
  const permitsRetirement = coverage.authoritativeForRetirement === true && ['FULL_LINE', 'FULL_ZONE'].includes(text(coverage.scope));
  for (const operation of array(value.operations)) {
    if (text(operation?.type) === 'RETIRE_NODE' && !permitsRetirement) errors.push('Partial or non-authoritative runs cannot retire historical nodes.');
  }
  return errors;
}

function validateAudit(value) {
  return [
    ...requiredFieldsForRows(value.actions, ['actionId', 'type'], 'TopoPreprocessAudit.v1.actions'),
    ...uniqueField(value.actions, 'actionId', 'TopoPreprocessAudit.v1.actions'),
  ];
}

function validateValidationReport(value) {
  return text(value.operatingMode) === 'ENFORCED' && value.validation?.status !== 'PASS'
    ? ['ENFORCED output requires validation PASS.'] : [];
}

function validateOccurrence(value, owner, requireSchema) {
  const errors = requiredFields(value, requireSchema ? ['schema', ...OCCURRENCE_REQUIRED_FIELDS] : OCCURRENCE_REQUIRED_FIELDS, owner);
  if (!['EMITTED', 'RESERVED'].includes(text(value?.disposition))) errors.push(`${owner}.disposition must be EMITTED or RESERVED.`);
  if (requireSchema && value?.schema !== 'PsiWriterOccurrence.v1') errors.push(`${owner}.schema must equal PsiWriterOccurrence.v1.`);
  for (const field of ['engineeringNodeNumber', 'nodeNumber']) {
    if (field in (value || {})) errors.push(`${owner} must not contain ${field}.`);
  }
  for (const field of Object.keys(value || {})) {
    if (!OCCURRENCE_ALLOWED_FIELDS.has(field)) errors.push(`${owner} contains unapproved field ${field}.`);
  }
  return errors;
}

function validateOccurrencePlan(value) {
  const errors = [
    ...uniqueField(value.occurrences, 'occurrenceId', 'PsiWriterOccurrencePlan.v1.occurrences'),
    ...requiredFieldsForRows(value.componentProjection, ['componentProjectionId', 'occurrenceIds'], 'PsiWriterOccurrencePlan.v1.componentProjection'),
    ...uniqueField(value.componentProjection, 'componentProjectionId', 'PsiWriterOccurrencePlan.v1.componentProjection'),
  ];
  const ids = new Set();
  for (const [index, occurrence] of array(value.occurrences).entries()) {
    errors.push(...validateOccurrence(occurrence, `PsiWriterOccurrencePlan.v1.occurrences[${index}]`, false));
    ids.add(text(occurrence?.occurrenceId));
  }
  const ownership = new Map();
  for (const projection of array(value.componentProjection)) {
    for (const rawId of array(projection?.occurrenceIds)) {
      const occurrenceId = text(rawId);
      const projectionId = text(projection?.componentProjectionId);
      if (!ids.has(occurrenceId)) errors.push(`Occurrence-plan component projection references unknown occurrence ${occurrenceId}.`);
      if (ownership.has(occurrenceId)) errors.push(`Occurrence-plan occurrence ${occurrenceId} has multiple component-projection owners.`);
      ownership.set(occurrenceId, projectionId);
    }
  }
  for (const occurrence of array(value.occurrences)) {
    const occurrenceId = text(occurrence?.occurrenceId);
    const owner = ownership.get(occurrenceId);
    if (!owner) errors.push(`Occurrence-plan occurrence ${occurrenceId} is orphaned from componentProjection ownership.`);
    else if (owner !== text(occurrence?.componentProjectionId)) errors.push(`Occurrence-plan occurrence ${occurrenceId} declares ${text(occurrence?.componentProjectionId)} but is owned by ${owner}.`);
  }
  return errors;
}

function validateSerializationPlan(value) {
  const errors = [
    ...uniqueField(value.occurrences, 'occurrenceId', 'PsiSerializationPlan.v1.occurrences'),
    ...requiredFieldsForRows(value.occurrences, ['occurrenceId', 'logicalNodeId', 'componentProjectionId', 'engineeringNodeNumber', 'disposition'], 'PsiSerializationPlan.v1.occurrences'),
  ];
  for (const row of array(value.occurrences)) {
    if (!Number.isInteger(row?.engineeringNodeNumber) || row.engineeringNodeNumber < 0) errors.push(`Serialization occurrence ${text(row?.occurrenceId)} requires explicit engineeringNodeNumber.`);
    if (!['EMITTED', 'RESERVED'].includes(text(row?.disposition))) errors.push(`Serialization occurrence ${text(row?.occurrenceId)} requires EMITTED or RESERVED disposition.`);
  }
  return errors;
}

function validateParity(value) {
  const errors = [];
  for (const sideName of ['canonical', 'sequential']) {
    const side = isRecord(value?.[sideName]) ? value[sideName] : {};
    errors.push(...requiredFields(side, PARITY_SIDE_REQUIRED_FIELDS, `PsiWriterParityReport.v2.${sideName}`));
    if (side.nodePlanHash && side.nodePlanHash !== value.nodePlanHash) errors.push(`${sideName} nodePlanHash must equal report nodePlanHash.`);
    if (side.occurrencePlanHash && side.occurrencePlanHash !== value.occurrencePlanHash) errors.push(`${sideName} occurrencePlanHash must equal report occurrencePlanHash.`);
  }
  const gates = isRecord(value.gates) ? value.gates : {};
  errors.push(...requiredFields(gates, [...PARITY_BOOLEAN_GATES, ...Object.keys(PARITY_NUMERIC_GATES)], 'PsiWriterParityReport.v2.gates'));
  if (value.validation?.status === 'PASS') {
    if (array(value.differences).length) errors.push('PASS parity report cannot contain differences.');
    for (const gate of PARITY_BOOLEAN_GATES) {
      if (gates[gate] !== true) errors.push(`PASS parity report requires ${gate}=true.`);
    }
    for (const [gate, expected] of Object.entries(PARITY_NUMERIC_GATES)) {
      if (gates[gate] !== expected) errors.push(`PASS parity report requires ${gate}=${expected}.`);
    }
  }
  return errors;
}

function rejectRelativeNumberRepresentation(value, owner) {
  const errors = [];
  walk(value, (key) => {
    if (RELATIVE_NUMBER_FIELDS.has(key)) errors.push(`${owner} prohibits relative or writer-owned number field ${key}.`);
  });
  return errors;
}

function walk(value, visit) {
  if (Array.isArray(value)) return value.forEach((item) => walk(item, visit));
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walk(child, visit);
  }
}

function requiredFields(value, fields, owner) {
  const errors = [];
  if (!isRecord(value)) return [`${owner} must be an object.`];
  for (const field of fields) {
    if (!(field in value) || value[field] === null || value[field] === '') errors.push(`${owner}.${field} is required.`);
  }
  return errors;
}

function requiredFieldsForRows(rows, fields, owner) {
  const errors = [];
  for (const [index, row] of array(rows).entries()) errors.push(...requiredFields(row, fields, `${owner}[${index}]`));
  return errors;
}

function uniqueField(rows, field, owner) {
  const errors = [];
  const seen = new Set();
  for (const row of array(rows)) {
    const value = text(row?.[field]);
    if (!value) errors.push(`${owner} entry requires ${field}.`);
    else if (seen.has(value)) errors.push(`${owner} contains duplicate ${field} ${value}.`);
    seen.add(value);
  }
  return errors;
}
