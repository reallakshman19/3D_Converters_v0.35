import { canonicalSemanticJson } from '../../../contracts/topo-enriched-xml/contract-core.js';

const SCALAR_KEYS = new Set([
  'logicalNodeId', 'nodeId', 'attachmentLogicalNodeId', 'fromLogicalNodeId',
  'toLogicalNodeId', 'survivorLogicalNodeId',
]);
const ARRAY_KEYS = new Set([
  'logicalNodeIds', 'nodeIds', 'attachmentLogicalNodeIds', 'endpointLogicalNodeIds',
  'connectedLogicalNodeIds',
]);

export function collectNodeReferences(value) {
  const result = [];
  walk(value, (key, child) => {
    if (SCALAR_KEYS.has(key) && text(child)) result.push(text(child));
    if (ARRAY_KEYS.has(key) && Array.isArray(child)) result.push(...child.map(text).filter(Boolean));
  });
  return [...new Set(result)].sort();
}

export function remapNodeReferences(value, survivorByNode) {
  return remap(value, survivorByNode);
}

export function validateGraphNodeReferences(graph, blockers) {
  const known = new Set((graph?.nodes || []).map((row) => text(row?.logicalNodeId)).filter(Boolean));
  for (const [collection, rows] of Object.entries({
    edges: graph?.edges,
    junctions: graph?.junctions,
    boundaries: graph?.boundaries,
    supports: graph?.supports,
  })) {
    for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
      const unknown = collectNodeReferences(row).filter((id) => !known.has(id));
      if (unknown.length) blockers.push(issue('NORMALIZATION_NODE_REFERENCE_STALE', {
        collection, index, unknownLogicalNodeIds: unknown,
      }));
    }
  }
}

function remap(value, survivorByNode) {
  if (Array.isArray(value)) return value.map((row) => remap(row, survivorByNode));
  if (!record(value)) return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (SCALAR_KEYS.has(key) && text(child)) result[key] = survivorByNode.get(text(child)) || text(child);
    else if (ARRAY_KEYS.has(key) && Array.isArray(child)) {
      result[key] = unique(child.map((id) => survivorByNode.get(text(id)) || text(id)).filter(Boolean));
    } else result[key] = remap(child, survivorByNode);
  }
  return result;
}

function walk(value, visit) {
  if (Array.isArray(value)) return value.forEach((row) => walk(row, visit));
  if (!record(value)) return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    if (!SCALAR_KEYS.has(key) && !ARRAY_KEYS.has(key)) walk(child, visit);
  }
}

function issue(code, evidence = {}) { return { code, evidence }; }
function unique(values) { return [...new Set(values)]; }
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return String(value ?? '').trim(); }
export function nodeReferenceSemanticKey(value) { return canonicalSemanticJson(collectNodeReferences(value)); }
