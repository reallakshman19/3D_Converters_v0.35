/**
 * UxmlUniversalTopoGraphBuilder.js
 *
 * Agent 05: UXML UniversalTopoGraph Builder skeleton.
 *
 * Purpose:
 * - Build deterministic topology graph evidence from UXML Face Model.
 * - Group coincident endpoint faces into nodes.
 * - Create endpoint-to-endpoint edges.
 * - Report disconnected required faces.
 *
 * Out of scope:
 * - Ray topology.
 * - Gap/overlap fixing.
 * - PCF/GLB/InputXML/CII emission.
 * - Master resolution.
 * - Mutating UXML.
 */

import {
  COMPONENT_TYPES,
  DIAGNOSTIC_SEVERITIES,
  GRAPH_EDGE_CLASSES,
} from './UxmlConstants.js';

import {
  createUxmlDiagnostic,
} from './UxmlTypes.js';

import {
  buildUxmlFaceModel,
} from './UxmlFaceModelBuilder.js';

const UNIVERSAL_TOPO_GRAPH_SCHEMA = 'uxml-universal-topo-graph/v1';

const DEFAULT_CONFIG = Object.freeze({
  connectToleranceMm: 6,
  allowPartialFaceModel: false,
  skipValidation: false,
});

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeConfig(options = {}) {
  return {
    connectToleranceMm: clampNumber(
      options.connectToleranceMm,
      0,
      1000,
      DEFAULT_CONFIG.connectToleranceMm
    ),
    allowPartialFaceModel: options.allowPartialFaceModel === true,
    skipValidation: options.skipValidation === true,
  };
}

function isFinitePoint(point) {
  return (
    point &&
    Number.isFinite(Number(point.x)) &&
    Number.isFinite(Number(point.y)) &&
    Number.isFinite(Number(point.z))
  );
}

function clonePoint(point) {
  if (!isFinitePoint(point)) return null;

  return {
    x: Number(point.x),
    y: Number(point.y),
    z: Number(point.z),
  };
}

function distance(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return Number.POSITIVE_INFINITY;

  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function makeDiagnosticFactory(out) {
  return function addDiagnostic({
    severity = DIAGNOSTIC_SEVERITIES.INFO,
    code,
    message,
    componentId = '',
    portId = '',
    details = {},
  }) {
    const diagnostic = createUxmlDiagnostic({
      id: `UTG-D-${String(out.diagnostics.length + 1).padStart(5, '0')}`,
      severity,
      code,
      message,
      componentId,
      portId,
      details,
    });

    out.diagnostics.push(diagnostic);
    return diagnostic;
  };
}

function isEndpointFace(face) {
  if (!face || !isFinitePoint(face.point)) return false;
  if (upper(face.faceKind) === 'SUPPORT_ASSOCIATION') return false;
  if (upper(face.connectsTo) !== 'ENDPOINT') return false;
  return true;
}

function isRequiredEndpointFace(face) {
  if (!isEndpointFace(face)) return false;

  const role = upper(face.role);
  const kind = upper(face.faceKind);
  const type = upper(face.type);

  if (kind === 'OLET_HEADER_TAP') return false;
  if (kind === 'SUPPORT_ASSOCIATION') return false;

  if (role.includes('END_1') || role.includes('END_2')) return true;
  if (role === 'TEE_BRANCH') return true;
  if (role === 'OLET_BRANCH') return true;

  if (type === COMPONENT_TYPES.PIPE && role.startsWith('PIPE_END')) return true;

  return false;
}

function isMovablePipeEndpoint(face) {
  return (
    upper(face.type) === COMPONENT_TYPES.PIPE &&
    upper(face.connectsTo) === 'ENDPOINT' &&
    face.futureMovable === true
  );
}

function sortById(items) {
  return [...items].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
}

function findOrCreateNode(out, point, toleranceMm) {
  for (const node of out.nodes) {
    if (distance(node.point, point) <= toleranceMm) {
      return node;
    }
  }

  const node = {
    id: `UTG-N-${String(out.nodes.length + 1).padStart(5, '0')}`,
    point: clonePoint(point),
    portIds: [],
    faceIds: [],
    componentIds: [],
  };

  out.nodes.push(node);
  return node;
}

function createGraphComponent(faceComponent) {
  return {
    id: `UTG-C-${faceComponent.componentId}`,
    componentId: faceComponent.componentId,
    type: faceComponent.type,
    pipelineRef: faceComponent.pipelineRef || '',
    lineKey: faceComponent.lineKey || '',
    refNo: faceComponent.refNo || '',
    seqNo: faceComponent.seqNo || '',
    name: faceComponent.name || '',
    bore: faceComponent.bore ?? null,
    branchBore: faceComponent.branchBore ?? null,
    faceIds: faceComponent.faces.map(face => face.id),
    sourceComponent: faceComponent.sourceComponent,
  };
}

function createGraphPort(face, nodeId) {
  return {
    id: `UTG-P-${face.id}`,
    faceId: face.id,
    componentId: face.componentId,
    type: face.type,
    role: face.role,
    faceKind: face.faceKind,
    point: clonePoint(face.point),
    nodeId,
    anchorId: face.anchorId || '',
    sourcePortId: face.portId || '',
    pipelineRef: face.pipelineRef || '',
    connectsTo: face.connectsTo || '',
    fixed: face.fixed === true,
    futureMovable: face.futureMovable === true,
    mutableNow: face.mutableNow === true,
    isPipeEndpoint: isMovablePipeEndpoint(face),
    required: isRequiredEndpointFace(face),
    connectedEdgeIds: [],
  };
}

function edgeKey(a, b) {
  return [a.id, b.id].sort().join('|');
}

function createEdge(out, a, b, node) {
  const d = distance(a.point, b.point);
  const edgeClass = d <= 1e-9
    ? GRAPH_EDGE_CLASSES.EXACT_CONNECTION
    : GRAPH_EDGE_CLASSES.WITHIN_CONNECT_TOLERANCE;

  return {
    id: `UTG-E-${String(out.edges.length + 1).padStart(5, '0')}`,
    nodeId: node.id,
    sourcePortId: a.id,
    targetPortId: b.id,
    sourceComponentId: a.componentId,
    targetComponentId: b.componentId,
    edgeClass,
    distanceMm: Number(d.toFixed(6)),
    point: clonePoint(node.point),
    pipelineRef: a.pipelineRef || b.pipelineRef || '',
  };
}

function compatibleForContinuity(a, b) {
  if (!a || !b) return false;
  if (a.id === b.id) return false;
  if (a.componentId === b.componentId) return false;
  if (!a.required || !b.required) return false;

  if (a.pipelineRef && b.pipelineRef && a.pipelineRef !== b.pipelineRef) {
    return false;
  }

  return true;
}

function buildEdges(out, add) {
  const seen = new Set();

  for (const node of out.nodes) {
    const ports = node.portIds
      .map(portId => out.ports.find(port => port.id === portId))
      .filter(Boolean);

    if (ports.length > 12) {
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-UTG-COLLAPSED-ENDPOINT-NODE',
        message: 'UniversalTopoGraph skipped an implausible high-degree endpoint node; source geometry likely collapsed.',
        details: {
          nodeId: node.id,
          point: node.point,
          portCount: ports.length,
          componentIds: node.componentIds,
        },
      });
      continue;
    }

    for (let i = 0; i < ports.length; i += 1) {
      for (let j = i + 1; j < ports.length; j += 1) {
        const a = ports[i];
        const b = ports[j];

        if (!compatibleForContinuity(a, b)) continue;

        const key = edgeKey(a, b);
        if (seen.has(key)) continue;
        seen.add(key);

        const edge = createEdge(out, a, b, node);
        out.edges.push(edge);
        out.candidateEdges.push({
          ...edge,
          accepted: true,
          reason: 'Endpoint faces share coordinate node within tolerance.',
        });

        a.connectedEdgeIds.push(edge.id);
        b.connectedEdgeIds.push(edge.id);
      }
    }
  }
}

function buildDisconnected(out, add) {
  for (const port of out.ports) {
    if (!port.required) continue;

    if (!port.connectedEdgeIds.length) {
      const issue = {
        id: `UTG-X-${String(out.disconnected.length + 1).padStart(5, '0')}`,
        code: `UXML-TOPO-${port.role}-DISCONNECTED`,
        componentId: port.componentId,
        portId: port.id,
        role: port.role,
        faceKind: port.faceKind,
        point: clonePoint(port.point),
        pipelineRef: port.pipelineRef,
      };

      out.disconnected.push(issue);

      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: issue.code,
        message: `${port.type} ${port.role} is disconnected in UniversalTopoGraph.`,
        componentId: port.componentId,
        portId: port.id,
        details: issue,
      });
    }
  }
}

function makeSummary(out) {
  const connectedPortIds = new Set();

  for (const edge of out.edges) {
    connectedPortIds.add(edge.sourcePortId);
    connectedPortIds.add(edge.targetPortId);
  }

  return {
    componentCount: out.components.length,
    faceCount: out.faceModel?.faces?.length || 0,
    nodeCount: out.nodes.length,
    portCount: out.ports.length,
    edgeCount: out.edges.length,
    candidateEdgeCount: out.candidateEdges.length,
    disconnectedCount: out.disconnected.length,
    connectedRequiredPortCount: out.ports.filter(port => port.required && connectedPortIds.has(port.id)).length,
    disconnectedRequiredPortCount: out.disconnected.length,
    pipeEndpointPortCount: out.ports.filter(port => port.isPipeEndpoint).length,
    supportAssociationPortCount: out.ports.filter(port => upper(port.faceKind) === 'SUPPORT_ASSOCIATION').length,
    supportContinuityEdgeCount: out.edges.filter(edge => {
      const a = out.ports.find(port => port.id === edge.sourcePortId);
      const b = out.ports.find(port => port.id === edge.targetPortId);
      return a?.type === COMPONENT_TYPES.SUPPORT || b?.type === COMPONENT_TYPES.SUPPORT;
    }).length,
    diagnosticCount: out.diagnostics.length,
  };
}

export function buildUxmlUniversalTopoGraph(uxml, options = {}) {
  const config = normalizeConfig(options);

  const out = {
    schema: UNIVERSAL_TOPO_GRAPH_SCHEMA,
    ok: true,
    blocked: false,
    config,
    components: [],
    nodes: [],
    ports: [],
    edges: [],
    candidateEdges: [],
    disconnected: [],
    diagnostics: [],
    summary: {},
    faceModel: null,
  };

  const add = makeDiagnosticFactory(out);

  if (!uxml || typeof uxml !== 'object') {
    add({
      severity: DIAGNOSTIC_SEVERITIES.FATAL,
      code: 'UXML-UTG-DOCUMENT-NOT-OBJECT',
      message: 'Cannot build UniversalTopoGraph because UXML input is not an object.',
    });

    out.ok = false;
    out.blocked = true;
    out.summary = makeSummary(out);
    return out;
  }

  const faceModel = options.faceModel || buildUxmlFaceModel(uxml, {
    allowPartial: config.allowPartialFaceModel,
    skipValidation: config.skipValidation,
  });

  out.faceModel = faceModel;

  if (faceModel.ok !== true && options.allowBlockedFaceModel !== true) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.ERROR,
      code: 'UXML-UTG-FACE-MODEL-BLOCKED',
      message: 'Cannot build UniversalTopoGraph because face model is blocked.',
      details: {
        faceModelBlocked: faceModel.blocked,
        diagnosticCount: faceModel.diagnostics?.length || 0,
      },
    });

    out.ok = false;
    out.blocked = true;
    out.summary = makeSummary(out);
    return out;
  }

  for (const faceComponent of sortById(faceModel.components || [])) {
    out.components.push(createGraphComponent(faceComponent));
  }

  const endpointFaces = sortById((faceModel.faces || []).filter(isEndpointFace));

  for (const face of endpointFaces) {
    const node = findOrCreateNode(out, face.point, config.connectToleranceMm);
    const port = createGraphPort(face, node.id);

    out.ports.push(port);

    node.portIds.push(port.id);
    node.faceIds.push(face.id);

    if (!node.componentIds.includes(face.componentId)) {
      node.componentIds.push(face.componentId);
      node.componentIds.sort();
    }
  }

  buildEdges(out, add);
  buildDisconnected(out, add);
  out.summary = makeSummary(out);

  if (out.summary.supportContinuityEdgeCount > 0) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.ERROR,
      code: 'UXML-UTG-SUPPORT-CONTINUITY-EDGE',
      message: 'Support continuity edge detected. Support must not participate in pipe continuity.',
    });

    out.ok = false;
  }

  if (out.disconnected.length > 0) {
    out.ok = false;
  }

  return out;
}

export const createUxmlUniversalTopoGraph = buildUxmlUniversalTopoGraph;
