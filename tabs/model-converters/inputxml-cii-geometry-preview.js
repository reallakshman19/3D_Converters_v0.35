/**
 * Geometry preview builder for the InputXML->CII(2019) converter.
 *
 * Functionality:
 * - Builds the shared 3DModelConv preview project from CAESAR InputXML
 *   PIPINGELEMENT deltas.
 * - Builds the same preview project from AVEVA topology XML Branch/Node
 *   Position records when those are used as the source artifact.
 *
 * Parameters expected:
 * - xmlText: source XML text.
 * - sourceName: display/debug name for the XML source.
 *
 * Output passed:
 * - A preview project containing nodes, segments, supports, annotations,
 *   and metadata for model-conv-preview-renderer.js.
 *
 * Fallback:
 * - Returns null when XML parsing is unavailable, invalid, or the file has no
 *   previewable route geometry.
 */

import { parseInputXml } from '../../converters/inputxml-basic-glb/InputXmlBasicParser.js?v=20260710-coordinate-seeds-1';

const INPUTXML_PREVIEW_SCHEMA = 'inputxml-cii-geometry-preview/v1';

function text(value) {
  return String(value ?? '').trim();
}

function safeId(value, fallback) {
  const raw = text(value);
  if (!raw) return fallback;
  return raw.replace(/[^\w:.-]+/g, '-');
}

function clonePoint(point) {
  return {
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    z: Number(point?.z) || 0,
  };
}

function midpoint(left, right) {
  const a = clonePoint(left);
  const b = clonePoint(right);
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

function localName(node) {
  return text(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function elementChildren(node) {
  if (!node) return [];
  if (node.children && typeof node.children.length === 'number') {
    return Array.from(node.children).filter((child) => localName(child));
  }
  if (node.childNodes && typeof node.childNodes.length === 'number') {
    return Array.from(node.childNodes).filter((child) => child?.nodeType === 1 && localName(child));
  }
  return [];
}

function walkElements(root, visitor) {
  const start = root?.documentElement || root;
  if (!start) return;
  const visit = (node) => {
    if (localName(node)) visitor(node);
    for (const child of elementChildren(node)) visit(child);
  };
  visit(start);
}

function elementsByLocalName(root, name) {
  const wanted = text(name).toUpperCase();
  const out = [];
  walkElements(root, (node) => {
    if (localName(node).toUpperCase() === wanted) out.push(node);
  });
  return out;
}

function directChildrenByLocalName(parent, name) {
  const wanted = text(name).toUpperCase();
  return elementChildren(parent).filter((child) => localName(child).toUpperCase() === wanted);
}

function childText(parent, name) {
  const child = directChildrenByLocalName(parent, name)[0];
  return text(child?.textContent);
}

function parsePoint(value) {
  const parts = (text(value).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (parts.length < 3) return null;
  if (!parts.slice(0, 3).every(Number.isFinite)) return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function hasDirectChild(parent, name) {
  return directChildrenByLocalName(parent, name).length > 0;
}

function hasAnyDirectChild(parent, names) {
  return names.some((name) => hasDirectChild(parent, name));
}

function parseXmlDocument(xmlText) {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(text(xmlText), 'application/xml');
    if (elementsByLocalName(doc, 'parsererror').length) return null;
    return doc;
  } catch {
    return null;
  }
}

function buildProjectEnvelope(sourceName, geometrySource, nodes, segments, supports, annotations) {
  if (!nodes.length && !segments.length && !supports.length) return null;
  return {
    id: `inputxml-cii-geometry-preview-${safeId(sourceName, 'source')}`,
    name: `InputXML->CII Geometry Preview: ${sourceName || 'source XML'}`,
    nodes,
    segments,
    supports,
    annotations,
    metadata: {
      schema: INPUTXML_PREVIEW_SCHEMA,
      sourceName: sourceName || '',
      geometrySource,
    },
  };
}

function buildFromInputXmlPipingElements(xmlText, sourceName) {
  if (!/<\s*(?:[\w.-]+:)?PIPINGELEMENT\b/i.test(text(xmlText))) return null;

  let model;
  try {
    model = parseInputXml(xmlText, {
      lineNoMode: 'none',
      lineNoText: '',
      isonoteText: '',
    });
  } catch {
    return null;
  }

  if (!Array.isArray(model?.elements) || !model.elements.length) return null;

  const nodes = [];
  const nodeIdByKey = new Map();
  for (const [nodeKey, node] of model.nodes.entries()) {
    const id = `inputxml-node-${safeId(nodeKey, String(nodes.length + 1))}`;
    nodeIdByKey.set(nodeKey, id);
    nodes.push({
      id,
      position: clonePoint(node),
      attributes: {
        sourceNode: nodeKey,
      },
    });
  }

  const segments = [];
  const annotations = [];
  for (let index = 0; index < model.elements.length; index += 1) {
    const element = model.elements[index];
    const fromNodeId = nodeIdByKey.get(element.fromNode) || '';
    const toNodeId = nodeIdByKey.get(element.toNode) || '';
    const ep1 = clonePoint(element.from);
    const ep2 = clonePoint(element.to);
    const id = `inputxml-segment-${String(index + 1).padStart(4, '0')}`;
    segments.push({
      id,
      fromNodeId,
      toNodeId,
      normalized: { ep1, ep2 },
      attributes: {
        fromNode: element.fromNode,
        toNode: element.toNode,
        componentType: element.type || 'PIPE',
      },
    });
    if (element.type && element.type !== 'PIPE') {
      annotations.push({
        id: `inputxml-annotation-${String(annotations.length + 1).padStart(4, '0')}`,
        type: element.type,
        normalized: { anchorPoint: midpoint(ep1, ep2) },
        attributes: {
          fromNode: element.fromNode,
          toNode: element.toNode,
          componentType: element.type,
        },
      });
    }
  }

  const supports = [];
  for (const restraint of model.restraints || []) {
    const node = model.nodes.get(restraint.node);
    if (!node) continue;
    supports.push({
      id: restraint.id || `inputxml-support-${String(supports.length + 1).padStart(4, '0')}`,
      nodeId: nodeIdByKey.get(restraint.node) || '',
      normalized: { supportCoord: clonePoint(node) },
      attributes: {
        sourceNode: restraint.node,
        typeCode: restraint.typeCode || '',
        gapMm: restraint.gapMm ?? '',
      },
    });
  }

  return buildProjectEnvelope(sourceName, 'inputxml-pipingelement-delta', nodes, segments, supports, annotations);
}

function buildFromTopologyBranchNodes(xmlText, sourceName) {
  const doc = parseXmlDocument(xmlText);
  if (!doc) return null;

  const nodes = [];
  const segments = [];
  const supports = [];
  const annotations = [];
  const branches = elementsByLocalName(doc, 'Branch');

  for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
    const branch = branches[branchIndex];
    const branchName = childText(branch, 'Branchname');
    const branchNodes = directChildrenByLocalName(branch, 'Node');
    let previous = null;

    for (let nodeIndex = 0; nodeIndex < branchNodes.length; nodeIndex += 1) {
      const nodeElement = branchNodes[nodeIndex];
      const position = parsePoint(childText(nodeElement, 'Position'));
      if (!position) continue;

      const nodeNumber = childText(nodeElement, 'NodeNumber');
      const componentType = childText(nodeElement, 'ComponentType');
      const nodeId = `topology-node-${branchIndex + 1}-${nodeIndex + 1}-${safeId(nodeNumber, 'unnumbered')}`;
      nodes.push({
        id: nodeId,
        position: clonePoint(position),
        attributes: {
          branchName,
          sourceNode: nodeNumber,
          componentType,
        },
      });

      if (hasAnyDirectChild(nodeElement, ['Restraint', 'CustomRestraint'])) {
        supports.push({
          id: `topology-support-${String(supports.length + 1).padStart(4, '0')}`,
          nodeId,
          normalized: { supportCoord: clonePoint(position) },
          attributes: {
            branchName,
            sourceNode: nodeNumber,
            componentType,
          },
        });
      }

      if (componentType && componentType !== 'PIPE') {
        annotations.push({
          id: `topology-annotation-${String(annotations.length + 1).padStart(4, '0')}`,
          type: componentType,
          normalized: { anchorPoint: clonePoint(position) },
          attributes: {
            branchName,
            sourceNode: nodeNumber,
            componentType,
          },
        });
      }

      if (previous) {
        segments.push({
          id: `topology-segment-${String(segments.length + 1).padStart(4, '0')}`,
          fromNodeId: previous.nodeId,
          toNodeId: nodeId,
          normalized: {
            ep1: clonePoint(previous.position),
            ep2: clonePoint(position),
          },
          attributes: {
            branchName,
            fromNode: previous.nodeNumber,
            toNode: nodeNumber,
          },
        });
      }

      previous = { nodeId, nodeNumber, position: clonePoint(position) };
    }
  }

  return buildProjectEnvelope(sourceName, 'topology-branch-node-position', nodes, segments, supports, annotations);
}

export function buildInputXmlCiiGeometryPreviewProject(xmlText, sourceName) {
  const fromInputXml = buildFromInputXmlPipingElements(xmlText, sourceName);
  if (fromInputXml) return fromInputXml;
  return buildFromTopologyBranchNodes(xmlText, sourceName);
}
