import { buildAivCanvasProjection } from '../converters/vibration/aiv/aiv-canvas-projection.js';
import { AIV_INPUT_MODE } from './vibration-aiv-engineering-revision.js';

export const AIV_UNIFIED_CANVAS_PROJECTION_SCHEMA = 'AivUnifiedCanvasProjection.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function text(value) { return String(value ?? '').trim(); }

function relationshipKey(item) {
  return `${text(item?.sourceCanonicalId)}\u0000${text(item?.assessmentCanonicalId)}\u0000${text(item?.caseId)}`;
}

function pathEvidenceByRelationship(generatedInputSet) {
  return new Map((generatedInputSet?.pathEvidence ?? []).map((item) => [relationshipKey(item), item]));
}

function entityNodes(baseProjection) {
  return (baseProjection?.nodes ?? []).filter((node) => ['SOURCE', 'ASSESSMENT'].includes(node.nodeKind));
}

function physicalNode(node) {
  return {
    primitiveKind: 'PHYSICAL_NODE',
    canonicalId: text(node.canonicalId),
    nodeKind: text(node.kind),
    tag: text(node.tag) || text(node.canonicalId),
    line: text(node.line) || null,
    caseId: text(node.sourceInput?.caseId) || null,
    presentation: {
      x: Number(node.presentation?.x ?? 0),
      y: Number(node.presentation?.y ?? 0),
    },
    geometryAuthority: 'PRESENTATION_ONLY',
  };
}

function physicalSegment(segment) {
  return {
    primitiveKind: 'PHYSICAL_SEGMENT',
    segmentId: text(segment.segmentId),
    fromNodeId: text(segment.fromNodeId),
    toNodeId: text(segment.toNodeId),
    line: text(segment.line) || null,
    engineeringLength: segment.physicalLength ? {
      value: segment.physicalLength.value,
      unit: text(segment.physicalLength.unit),
    } : null,
    engineeringLengthAuthority: segment.physicalLength
      ? 'EXPLICIT_SEGMENT_ENGINEERING_LENGTH'
      : 'UNRESOLVED',
    svgPixelsAuthoritativeForDistance: false,
  };
}

function networkRelationship(relationship, evidence) {
  const status = text(evidence?.status) || 'PATH_EVIDENCE_MISSING';
  const kind = ({
    RESOLVED: 'RESOLVED_PATH_OVERLAY',
    UNRESOLVED_LENGTH: 'UNRESOLVED_PATH_OVERLAY',
    AMBIGUOUS_PATH: 'AMBIGUOUS_PATH_OVERLAY',
    DISCONNECTED: 'DISCONNECTED_RELATIONSHIP',
  })[status] ?? 'UNRESOLVED_PATH_OVERLAY';
  return {
    ...relationship,
    primitiveKind: kind,
    pathStatus: status,
    segmentIds: [...(evidence?.segmentIds ?? [])],
    unresolvedSegmentIds: [...(evidence?.unresolvedSegmentIds ?? [])],
    pathDistanceM: status === 'RESOLVED' ? (evidence?.physicalDistanceM ?? null) : null,
    distanceAuthority: text(evidence?.distanceAuthority) || 'UNRESOLVED',
    directPhysicalSegment: false,
    physicalRouteInvented: false,
  };
}

function logicalRelationship(relationship) {
  return {
    ...relationship,
    primitiveKind: 'LOGICAL_RELATIONSHIP',
    pathStatus: 'LOGICAL_ONLY',
    segmentIds: [],
    unresolvedSegmentIds: [],
    pathDistanceM: null,
    explicitDistance: relationship.physicalDistance == null ? null : {
      value: relationship.physicalDistance,
      unit: relationship.physicalDistanceUnit,
      source: relationship.distanceSource,
      sourceRevision: relationship.distanceSourceRevision,
    },
    directPhysicalSegment: false,
    physicalRouteInvented: false,
  };
}

function networkRelationships(baseProjection, generatedInputSet) {
  const evidence = pathEvidenceByRelationship(generatedInputSet);
  return (baseProjection?.relationships ?? []).map((relationship) => (
    networkRelationship(relationship, evidence.get(relationshipKey(relationship)))
  ));
}

function tableRelationships(baseProjection) {
  return (baseProjection?.relationships ?? []).map(logicalRelationship);
}

export function buildAivUnifiedCanvasPresentation({
  inputMode = AIV_INPUT_MODE.TABLE_DRIVEN,
  baseProjection = {},
  flareNetwork = null,
  generatedInputSet = null,
} = {}) {
  const networkDriven = inputMode === AIV_INPUT_MODE.NETWORK_DRIVEN;
  return deepFreeze({
    schema: AIV_UNIFIED_CANVAS_PROJECTION_SCHEMA,
    methodId: 'VIB.AIV.ACOUSTIC',
    inputMode,
    presentationOnly: true,
    entityNodes: entityNodes(baseProjection),
    physicalNodes: networkDriven ? (flareNetwork?.nodes ?? []).map(physicalNode) : [],
    physicalSegments: networkDriven ? (flareNetwork?.segments ?? []).map(physicalSegment) : [],
    relationships: networkDriven
      ? networkRelationships(baseProjection, generatedInputSet)
      : tableRelationships(baseProjection),
    lineCaseSummaries: [...(baseProjection?.lineCaseSummaries ?? [])],
    authority: {
      engineeringOwner: networkDriven ? 'AivFlareNetwork.v1' : 'WORKING_AIV_TABLES',
      svgPixelsAuthoritativeForDistance: false,
      relationshipIsPhysicalSegment: false,
      numericalAuthority: 'REGISTERED_VIB.AIV.ACOUSTIC',
      screeningResultScope: 'ASSESSMENT',
      lineCaseSummaryAuthority: 'NON_AUTHORITATIVE_TRACE',
      designAuthority: false,
    },
  });
}

export function buildAivUnifiedCanvasProjection(input = {}) {
  return buildAivUnifiedCanvasPresentation({
    inputMode: input.inputMode,
    baseProjection: buildAivCanvasProjection(input),
    flareNetwork: input.flareNetwork,
    generatedInputSet: input.generatedInputSet,
  });
}
