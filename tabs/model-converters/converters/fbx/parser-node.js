import { deepFreeze } from './canonical-json.js';
import {
  parseFbxBytesWithWasm,
  parseFbxGeometryBundleWithWasm,
  parseFbxVertexAttributeBundleWithWasm,
} from './parser-wasm.js';
import { enforceSourceGraphPolicy } from './source-graph.js';

export async function parseFbxBytesNode(bytes) {
  const graph = await parseFbxBytesWithWasm(bytes);
  return deepFreeze(enforceSourceGraphPolicy(graph));
}

export async function parseFbxGeometryBundleNode(bytes, options = {}) {
  return parseFbxGeometryBundleWithWasm(bytes, options);
}

export async function parseFbxVertexAttributeBundleNode(bytes, options = {}) {
  return parseFbxVertexAttributeBundleWithWasm(bytes, options);
}
