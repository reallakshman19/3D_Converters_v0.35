/**
 * UxmlTypes.js
 *
 * Agent 00 runtime contract builders for the Universal XML (UXML) program.
 *
 * This file defines stable object shapes used by downstream agents.
 * These helpers intentionally perform light normalization only.
 * Do not add source parsing, topology solving, ray casting, output generation,
 * or master-resolution logic here.
 */

import {
  DEFAULT_UNITS,
  UXML_PROFILES,
  UXML_REQUIRED_SECTIONS,
  UXML_SCHEMA_VERSION,
} from './UxmlConstants.js';

export function createUxmlDocument(overrides = {}) {
  return {
    schemaVersion: UXML_SCHEMA_VERSION,
    profile: UXML_PROFILES.TOPOLOGY_FULL,

    header: createUxmlHeader(),
    sources: [],
    mappings: [],
    units: createUxmlUnits(),
    pipelines: [],
    components: [],
    anchors: [],
    ports: [],
    segments: [],
    supports: [],
    topologyHints: [],
    rayEvidence: [],
    lossContract: [],
    diagnostics: [],

    ...overrides,
  };
}

export function createUxmlHeader(overrides = {}) {
  return {
    projectId: '',
    modelId: '',
    createdBy: 'PCF_GLB_Viewer_Conv',
    createdAt: new Date(0).toISOString(),
    purpose: 'topology-normalization',
    notes: '',
    ...overrides,
  };
}

export function createUxmlUnits(overrides = {}) {
  return {
    ...DEFAULT_UNITS,
    ...overrides,
  };
}

export function createUxmlSource(overrides = {}) {
  return {
    id: '',
    format: '',
    path: '',
    name: '',
    hash: '',
    role: 'PRIMARY',
    diagnostics: [],
    ...overrides,
  };
}

export function createUxmlMapping(overrides = {}) {
  return {
    id: '',
    profile: '',
    sourceFormat: '',
    sourceField: '',
    targetField: '',
    confidence: '',
    notes: '',
    ...overrides,
  };
}

export function createUxmlPipeline(overrides = {}) {
  return {
    id: '',
    pipelineRef: '',
    lineKey: '',
    lineNo: '',
    spec: '',
    area: '',
    system: '',
    rawAttributes: {},
    diagnostics: [],
    ...overrides,
  };
}

export function createUxmlComponent(overrides = {}) {
  return {
    id: '',
    sourceRefs: [],
    type: '',
    normalizedType: '',
    pipelineRef: '',
    lineKey: '',
    refNo: '',
    seqNo: '',
    name: '',

    bore: null,
    branchBore: null,
    boreUnit: 'MM',
    sizeRaw: '',

    skey: '',
    ca: {},
    rawAttributes: {},
    normalized: {},
    derived: {},

    anchorIds: [],
    portIds: [],
    segmentIds: [],
    supportId: '',

    confidence: '',
    diagnostics: [],
    ...overrides,
  };
}

export function createUxmlAnchor(overrides = {}) {
  return {
    id: '',
    componentId: '',
    role: '',
    point: null,
    nodeNumber: '',
    nodeLabel: '',

    sourceRef: null,
    sourceField: '',
    confidence: '',
    fallbackLevel: '',
    derivationMethod: '',

    diagnostics: [],
    ...overrides,
  };
}

export function createUxmlPort(overrides = {}) {
  return {
    id: '',
    componentId: '',
    anchorId: '',
    role: '',

    point: null,
    bore: null,
    branchBore: null,

    fixed: true,
    futureMovable: false,
    mutableNow: false,

    connectsTo: 'ENDPOINT',
    maxDegree: 1,

    diagnostics: [],
    ...overrides,
  };
}

export function createUxmlSegment(overrides = {}) {
  return {
    id: '',
    componentId: '',
    type: '',
    startAnchorId: '',
    endAnchorId: '',
    supportAnchorId: '',

    bore: null,
    length: null,
    lengthUnit: 'MM',

    diagnostics: [],
    ...overrides,
  };
}

export function createUxmlSupport(overrides = {}) {
  return {
    id: '',
    componentId: '',
    type: '',
    skey: '',
    supportAnchorId: '',
    hostCandidates: [],
    restraints: [],
    diagnostics: [],
    ...overrides,
  };
}

export function createUxmlTopologyHint(overrides = {}) {
  return {
    id: '',
    type: '',
    componentId: '',
    portId: '',
    segmentId: '',
    sourcePortId: '',
    targetPortId: '',
    confidence: '',
    reason: '',
    diagnostics: [],
    ...overrides,
  };
}

export function createUxmlRayEvidence(overrides = {}) {
  return {
    id: '',
    sourcePortId: '',
    targetPortId: '',
    targetSegmentId: '',

    origin: null,
    direction: null,
    distanceAlongRayMm: null,
    perpendicularMissMm: null,

    method: '',
    confidence: '',
    decision: '',
    reason: '',

    diagnostics: [],
    ...overrides,
  };
}

export function createUxmlLoss(overrides = {}) {
  return {
    id: '',
    severity: 'INFO',
    code: '',
    componentId: '',
    sourceId: '',
    message: '',
    details: {},
    ...overrides,
  };
}

export function createUxmlDiagnostic(overrides = {}) {
  return {
    id: '',
    severity: 'INFO',
    code: '',
    message: '',

    componentId: '',
    anchorId: '',
    portId: '',
    segmentId: '',
    supportId: '',
    sourceId: '',

    details: {},
    ...overrides,
  };
}

export function createUniversalTopoGraph(overrides = {}) {
  return {
    schema: 'universal-topo-graph/v1',
    components: [],
    anchors: [],
    ports: [],
    nodes: [],
    segments: [],
    edges: [],
    candidateEdges: [],
    issues: [],
    lossContract: [],
    sourceRefs: [],
    stats: {},
    ...overrides,
  };
}

export function createRayFaceModel(overrides = {}) {
  return {
    schema: 'ray-face-model/v1',
    components: [],
    faces: [],
    segments: [],
    diagnostics: [],
    stats: {},
    ...overrides,
  };
}

export function createRayGraph(overrides = {}) {
  return {
    schema: 'ray-graph/v1',
    rayConnections: [],
    rayOnlyConnections: [],
    bridgePipeCandidates: [],
    branchConnections: [],
    oletPassthroughCandidates: [],
    orphans: [],
    ambiguousHits: [],
    rejectedHits: [],
    diagnostics: [],
    stats: {},
    ...overrides,
  };
}

export function createTopologyComparisonReport(overrides = {}) {
  return {
    schema: 'topology-comparison-report/v1',
    agreedConnections: [],
    universalOnlyConnections: [],
    rayOnlyConnections: [],
    promotedRayConnections: [],
    rejectedRayConnections: [],
    manualReviewItems: [],
    diagnostics: [],
    stats: {},
    ...overrides,
  };
}

export function createUxmlReadinessReport(overrides = {}) {
  return {
    schema: 'uxml-readiness-report/v1',
    ready: false,
    exportAllowed: false,
    blockers: [],
    warnings: [],
    sections: {
      uxml: null,
      sourceProfile: null,
      anchors: null,
      boreUnits: null,
      supports: null,
      universalTopology: null,
      rayComparison: null,
      gapOverlap: null,
      transactionSafety: null,
      exportPermission: null,
      masters: null,
    },
    diagnostics: [],
    stats: {},
    ...overrides,
  };
}

export function assertUxmlDocumentShape(doc) {
  const missing = [];

  for (const section of UXML_REQUIRED_SECTIONS) {
    if (!(section in (doc || {}))) {
      missing.push(section);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}
