import { compareText } from '../../zone-geometry/compare.js';

const REVIEW_SCHEMA = 'FbxSelectedZoneConnectivityReviewModel.v1';

function componentMessage(evidence) {
  const counts = evidence.counts;
  if (evidence.status === 'BLOCKED') {
    return `Connectivity review found ${counts.blockingDiagnosticCount} blocking diagnostics. No inferred repair was applied.`;
  }
  return `Connectivity review passed with ${counts.internalLinkCount} internal links, ${counts.boundaryLinkCount} boundary links, and ${counts.openPortCount} open ports.`;
}

function diagnosticBySubject(evidence) {
  const index = new Map();
  for (const item of evidence.diagnostics) {
    const values = index.get(item.subjectId) || [];
    values.push(item.code); index.set(item.subjectId, values);
  }
  for (const values of index.values()) values.sort(compareText);
  return index;
}

function componentRows(evidence) {
  const diagnostics = diagnosticBySubject(evidence);
  return evidence.components.map((component) => ({
    managedRecordId: component.managedRecordId,
    logicalComponentId: component.logicalComponentId,
    nativeType: component.nativeType,
    sourceOccurrenceId: component.sourceOccurrenceId,
    groupId: component.groupId,
    status: component.status,
    internalLinkCount: component.internalLinkCount,
    boundaryLinkCount: component.boundaryLinkCount,
    openPortCount: component.openPortCount,
    blockedPortCount: component.blockedPortCount,
    diagnosticCodes: diagnostics.get(component.managedRecordId) || [],
  }));
}

function groupRows(evidence) {
  return evidence.connectedGroups.map((group) => ({
    groupId: group.groupId,
    topology: group.topology,
    componentCount: group.componentCount,
    internalLinkCount: group.internalLinkCount,
    boundaryLinkCount: group.boundaryLinkCount,
    openPortCount: group.openPortCount,
    blockedComponentCount: group.blockedComponentCount,
    componentIds: [...group.componentIds],
  }));
}

function portRows(evidence) {
  return evidence.ports.filter((port) => (
    port.disposition !== 'CONNECTED_INTERNAL'
  )).map((port) => ({
    endpointId: port.endpointId,
    logicalComponentId: port.logicalComponentId,
    groupId: port.groupId,
    role: port.role,
    disposition: port.disposition,
    targetEndpointId: port.targetEndpointId,
    diagnosticCodes: [...port.diagnosticCodes],
  }));
}

export function unavailableConnectivityReview(mappingStatus = 'MAPPED_STAGE_NOT_AVAILABLE') {
  return Object.freeze({
    schema: REVIEW_SCHEMA,
    status: 'MAPPING_REQUIRED',
    mappingStatus,
    message: 'Run FBX conversion with an approved mapping package before reviewing selected-zone connectivity.',
    counts: {
      componentCount: 0, internalLinkCount: 0, boundaryLinkCount: 0,
      openPortCount: 0, blockedComponentCount: 0, connectedGroupCount: 0,
    },
    groupRows: [], componentRows: [], portRows: [],
  });
}

export function buildConnectivityReviewModel(evidence, mappingStatus = 'MAPPED_STAGE_AVAILABLE') {
  if (!evidence) return unavailableConnectivityReview(mappingStatus);
  return Object.freeze({
    schema: REVIEW_SCHEMA,
    status: evidence.status,
    mappingStatus,
    artifactId: evidence.artifactId,
    message: componentMessage(evidence),
    counts: { ...evidence.counts },
    topologyCounts: { ...evidence.topologyCounts },
    groupRows: groupRows(evidence),
    componentRows: componentRows(evidence),
    portRows: portRows(evidence),
  });
}
