#!/usr/bin/env node
'use strict';

const crypto = require('crypto');

const ENGINE_IDENTITY = 'strict-root-topology-engine';
const ENGINE_VERSION = '1.0.0';
const REQUEST_SCHEMA = 'InputXmlTopologyBridgeRequest.v1';
const RESULT_SCHEMA = 'InputXmlTopologyBridgeResult.v1';
const PROFILE_ADAPTERS = Object.freeze({
  'xml-builder-root-branch-node': 'xml-cii-node-to-canonical',
  'seljson-custom-root': 'seljson-custom-model-to-canonical',
});
const MAX_BRANCHES = 2000;
const MAX_NODES = 100000;
const MAX_AUXILIARIES = 100000;
const PROHIBITED_METRICS = Object.freeze({
  duplicateNodeDroppedCount: 0,
  fillerCount: 0,
  shortFillerCount: 0,
  rayFillerCount: 0,
  raySplitNodeCount: 0,
  syntheticNodeCount: 0,
  droppedRouteNodeCount: 0,
});

class TopologyBlock extends Error {
  constructor(code, message, sourceEntityId = '') {
    super(message);
    this.code = code;
    this.sourceEntityId = sourceEntityId;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function hashValue(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableValue(value)), 'utf8')
    .digest('hex');
}

function requireObject(value, code, message, sourceEntityId = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TopologyBlock(code, message, sourceEntityId);
  }
  return value;
}

function requireArray(value, code, message, sourceEntityId = '') {
  if (!Array.isArray(value)) throw new TopologyBlock(code, message, sourceEntityId);
  return value;
}

function requireString(value, code, message, sourceEntityId = '') {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TopologyBlock(code, message, sourceEntityId);
  }
  return value;
}

function validateRequest(request) {
  requireObject(request, 'BRIDGE_CONTRACT_INVALID', 'Bridge request must be an object.');
  if (request.schema !== REQUEST_SCHEMA) {
    throw new TopologyBlock('BRIDGE_CONTRACT_INVALID', `Unsupported request schema ${request.schema}.`);
  }
  const adapter = PROFILE_ADAPTERS[request.profileId];
  if (!adapter || request.adapterId !== adapter) {
    throw new TopologyBlock('ROOT_PROFILE_MISMATCH', 'Profile and adapter identity do not match.');
  }
  if (!/^[0-9a-f]{64}$/.test(String(request.sourceHashSha256 || ''))) {
    throw new TopologyBlock('BRIDGE_CONTRACT_INVALID', 'sourceHashSha256 must be lowercase SHA-256.');
  }
  const branches = requireArray(
    request.branches,
    'ROOT_STRUCTURE_INVALID',
    'Bridge request branches must be an array.',
  );
  if (!branches.length || branches.length > MAX_BRANCHES) {
    throw new TopologyBlock('ROOT_STRUCTURE_INVALID', `Branch count must be 1..${MAX_BRANCHES}.`);
  }
  validateEngineOptions(request.engineOptions);
  let nodeCount = 0;
  let auxiliaryCount = 0;
  for (const branch of branches) {
    requireObject(branch, 'ROOT_STRUCTURE_INVALID', 'Branch request must be an object.');
    requireString(branch.sourcePath, 'ROOT_STRUCTURE_INVALID', 'Branch sourcePath is required.');
    requireString(branch.lineIdentity, 'BRANCH_LINE_IDENTITY_MISSING', 'Branch line identity is required.', branch.sourcePath);
    const nodes = requireArray(branch.nodes, 'ROOT_STRUCTURE_INVALID', 'Branch nodes must be an array.', branch.sourcePath);
    if (nodes.length < 2) {
      throw new TopologyBlock('SOURCE_ADJACENCY_UNPROVEN', 'A branch requires at least two ordered node occurrences.', branch.sourcePath);
    }
    nodeCount += nodes.length;
    for (const node of nodes) auxiliaryCount += requireArray(node.restraints || [], 'BRIDGE_CONTRACT_INVALID', 'Node restraints must be an array.', node.sourcePath).length;
  }
  if (nodeCount > MAX_NODES) throw new TopologyBlock('BRIDGE_CONTRACT_INVALID', `Node count exceeds ${MAX_NODES}.`);
  if (auxiliaryCount > MAX_AUXILIARIES) throw new TopologyBlock('BRIDGE_CONTRACT_INVALID', `Auxiliary count exceeds ${MAX_AUXILIARIES}.`);
  return { branches, nodeCount, auxiliaryCount };
}

function validateEngineOptions(options) {
  requireObject(options, 'BRIDGE_CONTRACT_INVALID', 'engineOptions must be an object.');
  if (options.adjacencyAuthority !== 'DIRECT_NODE_CHILD_ORDER_REGISTERED_PRODUCER_V1') {
    throw new TopologyBlock('SOURCE_ADJACENCY_UNPROVEN', 'Registered direct-child adjacency authority is required.');
  }
  for (const key of [
    'coordinateCoalescing',
    'shortFillers',
    'rayFillers',
    'secondPassFillers',
    'midspanSplits',
    'syntheticNodes',
  ]) {
    if (options[key] !== false) {
      const code = key === 'coordinateCoalescing'
        ? 'PROHIBITED_COORDINATE_COALESCING'
        : 'PROHIBITED_FILLER_TOPOLOGY';
      throw new TopologyBlock(code, `Strict topology option ${key} must be false.`);
    }
  }
}

function nodeIdentity(node) {
  requireObject(node, 'BRIDGE_CONTRACT_INVALID', 'Node request must be an object.');
  const sourcePath = requireString(node.sourcePath, 'BRIDGE_CONTRACT_INVALID', 'Node sourcePath is required.');
  if (!Number.isSafeInteger(node.nodeNumber) || node.nodeNumber <= 0) {
    throw new TopologyBlock('NODE_NUMBER_INVALID', 'Node number must be a positive safe integer.', sourcePath);
  }
  const position = requireArray(node.position, 'NODE_POSITION_MISSING', 'Node position is required.', sourcePath);
  if (position.length !== 3 || position.some((value) => typeof value !== 'string' || value === '')) {
    throw new TopologyBlock('NODE_POSITION_INVALID', 'Node position requires three decimal strings.', sourcePath);
  }
  return {
    sourcePath,
    logicalNodeId: `LN-${node.nodeNumber}`,
    canonicalNodeId: String(node.nodeNumber),
    nodeNumber: node.nodeNumber,
    nodeNumberLexical: String(node.nodeNumberLexical),
    position,
  };
}

function edgeIdentity(branch, fromNode, toNode, ordinal) {
  if (fromNode.nodeNumber === toNode.nodeNumber) {
    throw new TopologyBlock('EDGE_SELF_LOOP', 'Adjacent source occurrences resolve to the same node number.', toNode.sourcePath);
  }
  if (fromNode.position.every((value, index) => value === toNode.position[index])) {
    throw new TopologyBlock('EDGE_ZERO_LENGTH', 'Adjacent source occurrences have identical positions.', toNode.sourcePath);
  }
  return {
    logicalEdgeId: `LE-${String(ordinal).padStart(6, '0')}`,
    canonicalElementId: `RBN-E-${String(ordinal).padStart(6, '0')}`,
    sourceBranchPath: branch.sourcePath,
    sourceFromNodePath: fromNode.sourcePath,
    sourceToNodePath: toNode.sourcePath,
    logicalFromNodeId: fromNode.logicalNodeId,
    logicalToNodeId: toNode.logicalNodeId,
    canonicalFromNodeId: fromNode.canonicalNodeId,
    canonicalToNodeId: toNode.canonicalNodeId,
    topologyRule: 'DIRECT_NODE_CHILD_ORDER_REGISTERED_PRODUCER_V1',
    sequence: ordinal,
  };
}

function ownerEdge(edges, nodeIndex) {
  return nodeIndex === 0 ? edges[0] : edges[nodeIndex - 1];
}

function resolveModel(request, validation) {
  const nodes = [];
  const edges = [];
  const components = [];
  const auxiliaries = [];
  const nodeMappings = [];
  const elementMappings = [];
  const nodeOwners = new Map();
  const edgePairs = new Set();
  let edgeOrdinal = 0;
  for (const branch of validation.branches) {
    const branchNodes = branch.nodes.map(nodeIdentity);
    const branchEdges = [];
    for (const node of branchNodes) {
      if (nodeOwners.has(node.nodeNumber)) {
        throw new TopologyBlock('DUPLICATE_NODE_NUMBER', `Node number ${node.nodeNumber} has multiple source occurrences.`, node.sourcePath);
      }
      nodeOwners.set(node.nodeNumber, node.sourcePath);
      nodes.push(node);
      nodeMappings.push({
        sourceNodePath: node.sourcePath,
        logicalNodeId: node.logicalNodeId,
        canonicalNodeId: node.canonicalNodeId,
      });
    }
    for (let index = 1; index < branchNodes.length; index += 1) {
      edgeOrdinal += 1;
      const edge = edgeIdentity(branch, branchNodes[index - 1], branchNodes[index], edgeOrdinal);
      const pair = `${edge.canonicalFromNodeId}->${edge.canonicalToNodeId}`;
      if (edgePairs.has(pair)) {
        throw new TopologyBlock('EDGE_DUPLICATE_CONFLICT', `Directed edge ${pair} occurs more than once.`, edge.sourceToNodePath);
      }
      edgePairs.add(pair);
      edges.push(edge);
      branchEdges.push(edge);
      elementMappings.push({
        sourceBranchPath: branch.sourcePath,
        sourceFromNodePath: edge.sourceFromNodePath,
        sourceToNodePath: edge.sourceToNodePath,
        logicalEdgeId: edge.logicalEdgeId,
        canonicalElementId: edge.canonicalElementId,
      });
    }
    branch.nodes.forEach((sourceNode, nodeIndex) => {
      const owner = ownerEdge(branchEdges, nodeIndex);
      components.push({
        sourceNodePath: sourceNode.sourcePath,
        sourceFieldPath: sourceNode.fieldPaths.ComponentType || sourceNode.sourcePath,
        componentType: String(sourceNode.fields.ComponentType || '').toUpperCase(),
        connectionType: String(sourceNode.fields.ConnectionType || '').toUpperCase(),
        componentRefNo: String(sourceNode.fields.ComponentRefNo || ''),
        logicalNodeId: branchNodes[nodeIndex].logicalNodeId,
        canonicalElementId: owner.canonicalElementId,
        ownershipRule: nodeIndex === 0 ? 'FIRST_NODE_OUTGOING_EDGE' : 'NODE_INCOMING_EDGE',
      });
      for (const restraint of sourceNode.restraints || []) {
        auxiliaries.push({
          sourcePath: restraint.sourcePath,
          sourceNodePath: sourceNode.sourcePath,
          sourceName: restraint.sourceName,
          logicalNodeId: branchNodes[nodeIndex].logicalNodeId,
          canonicalNodeId: branchNodes[nodeIndex].canonicalNodeId,
          canonicalElementId: owner.canonicalElementId,
          ownershipRule: nodeIndex === 0 ? 'FIRST_NODE_OUTGOING_EDGE' : 'NODE_INCOMING_EDGE',
        });
      }
    });
  }
  return { nodes, edges, components, auxiliaries, nodeMappings, elementMappings };
}

function resultBase(request) {
  return {
    schema: RESULT_SCHEMA,
    resolutionStatus: 'BLOCKED',
    engineIdentity: ENGINE_IDENTITY,
    engineVersion: ENGINE_VERSION,
    profileId: String(request?.profileId || ''),
    adapterId: String(request?.adapterId || ''),
    sourceHashSha256: String(request?.sourceHashSha256 || ''),
    nodes: [],
    edges: [],
    components: [],
    auxiliaries: [],
    elementMappings: [],
    nodeMappings: [],
    topologyProof: null,
    diagnostics: [],
    metrics: { ...PROHIBITED_METRICS },
  };
}

function resolveStrictTopology(request) {
  const result = resultBase(request);
  try {
    const validation = validateRequest(request);
    const model = resolveModel(request, validation);
    Object.assign(result, model);
    result.metrics = {
      branchCount: validation.branches.length,
      sourceNodeOccurrenceCount: validation.nodeCount,
      edgeCount: model.edges.length,
      componentCount: model.components.length,
      auxiliaryCount: validation.auxiliaryCount,
      diagnosticCount: 0,
      ...PROHIBITED_METRICS,
    };
    result.topologyProof = {
      schema: 'InputXmlStrictTopologyProof.v1',
      sourceInventorySummary: request.sourceInventorySummary,
      logicalNodeCount: model.nodes.length,
      logicalEdgeCount: model.edges.length,
      nodeMappingCount: model.nodeMappings.length,
      elementMappingCount: model.elementMappings.length,
      unresolvedEdgeCount: 0,
      unresolvedOwnershipCount: 0,
      syntheticTopologyCount: 0,
      topologyHashSha256: hashValue({
        nodes: model.nodes,
        edges: model.edges,
        components: model.components,
        auxiliaries: model.auxiliaries,
        nodeMappings: model.nodeMappings,
        elementMappings: model.elementMappings,
      }),
    };
    result.resolutionStatus = 'RESOLVED';
  } catch (error) {
    if (!(error instanceof TopologyBlock)) throw error;
    result.diagnostics.push({
      code: error.code,
      severity: 'BLOCKING',
      stage: 'PROFILE_RESOLVER_GATE',
      disposition: 'REJECT_INVALID',
      candidatePolicy: 'NO_CANDIDATE',
      productionEffect: 'BLOCK',
      sourceEntityId: error.sourceEntityId,
      message: error.message,
    });
    result.metrics.diagnosticCount = 1;
  }
  return result;
}

module.exports = {
  ENGINE_IDENTITY,
  ENGINE_VERSION,
  REQUEST_SCHEMA,
  RESULT_SCHEMA,
  resolveStrictTopology,
};
