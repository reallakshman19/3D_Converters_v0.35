import {
  addAivFlareNetworkNode,
  addAivFlareNetworkSegment,
  deleteAivFlareNetworkNode,
  deleteAivFlareNetworkSegment,
  setAivFlareNetworkSegmentLength,
  updateAivFlareNetworkNode,
  updateAivFlareNetworkSegment,
} from '../converters/vibration/aiv/aiv-flare-network-mutations.js';

function text(value) { return String(value ?? '').trim(); }
function value(editor, selector) { return text(editor?.querySelector(selector)?.value); }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function defaultPosition(network) {
  const index = network.nodes.length;
  return { x: 110 + (index % 4) * 220, y: 100 + Math.floor(index / 4) * 130 };
}

function nodeSelectionKey(node) {
  if (node.kind === 'SOURCE') return `SOURCE:${node.canonicalId}:${node.sourceInput?.caseId ?? ''}`;
  if (node.kind === 'ASSESSMENT') return `ASSESSMENT:${node.canonicalId}`;
  return `NETWORK_NODE:${node.canonicalId}`;
}

function parsedValue(target) {
  const raw = text(target?.value);
  if (target?.dataset?.aivValueType !== 'number') return raw;
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) throw new TypeError(`AIV engineering input ${target.dataset.aivNetworkNodePath} must be numeric.`);
  return number;
}

function withNestedValue(input, path, next) {
  const keys = text(path).split('.').filter(Boolean);
  if (!keys.length) return clone(input ?? {});
  const result = clone(input ?? {}) ?? {};
  let cursor = result;
  for (const key of keys.slice(0, -1)) {
    cursor[key] = cursor[key] && typeof cursor[key] === 'object' ? cursor[key] : {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = next;
  return result;
}

function createNode(editor, network, position = defaultPosition(network)) {
  const canonicalId = value(editor, '[data-aiv-network-new-node-id]');
  const kind = value(editor, '[data-aiv-network-new-node-kind]');
  const caseId = value(editor, '[data-aiv-network-new-node-case]');
  const line = value(editor, '[data-aiv-network-new-node-line]');
  const tag = value(editor, '[data-aiv-network-new-node-tag]');
  const sourceDeviceType = value(editor, '[data-aiv-network-new-source-device]');
  const assessmentType = value(editor, '[data-aiv-network-new-assessment-type]');
  return addAivFlareNetworkNode(network, {
    canonicalId, kind, line, tag, presentation: position,
    ...(kind === 'SOURCE' ? { sourceInput: { caseId, ...(sourceDeviceType ? { sourceDeviceType } : {}) } } : {}),
    ...(kind === 'ASSESSMENT' ? { assessmentInput: assessmentType ? { assessmentType } : {} } : {}),
  });
}

function createSegment(editor, network, endpoints = {}) {
  const length = value(editor, '[data-aiv-network-new-segment-length]');
  return addAivFlareNetworkSegment(network, {
    segmentId: value(editor, '[data-aiv-network-new-segment-id]'),
    fromNodeId: endpoints.fromNodeId ?? value(editor, '[data-aiv-network-new-segment-from]'),
    toNodeId: endpoints.toNodeId ?? value(editor, '[data-aiv-network-new-segment-to]'),
    line: value(editor, '[data-aiv-network-new-segment-line]'),
    physicalLength: length ? {
      value: Number(length),
      unit: value(editor, '[data-aiv-network-new-segment-unit]') || 'm',
    } : null,
  });
}

function updateNode(network, target) {
  const nodeId = text(target.dataset.aivNetworkNodeId);
  const node = network.nodes.find((item) => item.canonicalId === nodeId);
  if (!node) throw new RangeError(`Unknown AIV flare-network node ${nodeId}.`);
  const field = text(target.dataset.aivNetworkNodeField);
  if (field === 'tag' || field === 'line') {
    return updateAivFlareNetworkNode(network, nodeId, { [field]: text(target.value) });
  }
  const path = text(target.dataset.aivNetworkNodePath);
  if (!path) return network;
  const [root, ...nested] = path.split('.');
  if (!['sourceInput', 'assessmentInput'].includes(root) || !nested.length) throw new RangeError(`Unsupported AIV node input path ${path}.`);
  return updateAivFlareNetworkNode(network, nodeId, {
    [root]: withNestedValue(node[root], nested.join('.'), parsedValue(target)),
  });
}

function updateSegment(network, editor, target) {
  const segmentId = text(target.dataset.aivNetworkSegmentLength
    || target.dataset.aivNetworkSegmentUnit
    || target.dataset.aivNetworkSegmentId);
  if (!segmentId) return null;
  const field = text(target.dataset.aivNetworkSegmentField);
  if (field) return updateAivFlareNetworkSegment(network, segmentId, { [field]: text(target.value) });
  const scope = target.closest?.('[data-aiv-network-segment-editor]') ?? editor;
  const length = value(scope, `[data-aiv-network-segment-length="${CSS.escape(segmentId)}"]`);
  const unit = value(scope, `[data-aiv-network-segment-unit="${CSS.escape(segmentId)}"]`) || 'm';
  return setAivFlareNetworkSegmentLength(network, segmentId, length ? Number(length) : null, unit);
}

export function createAivUnifiedNetworkNodeAt(network, editor, position) {
  return createNode(editor, network, position);
}

export function createAivUnifiedNetworkSegmentBetween(network, editor, fromNodeId, toNodeId) {
  return createSegment(editor, network, { fromNodeId, toNodeId });
}

export function deleteAivUnifiedNetworkSelection(network, selectionKey) {
  const key = text(selectionKey);
  if (key.startsWith('SEGMENT:')) return deleteAivFlareNetworkSegment(network, key.slice('SEGMENT:'.length));
  const node = network.nodes.find((item) => nodeSelectionKey(item) === key);
  if (!node) throw new RangeError('Select a network node or physical segment before deleting.');
  return deleteAivFlareNetworkNode(network, node.canonicalId);
}

export function applyAivUnifiedNetworkAuthorAction(network, editor, target) {
  const action = target?.closest?.('[data-aiv-network-action]')?.dataset.aivNetworkAction;
  if (action === 'add-node') return Object.freeze({ handled: true, network: createNode(editor, network) });
  if (action === 'add-segment') return Object.freeze({ handled: true, network: createSegment(editor, network) });
  const segmentId = target?.closest?.('[data-aiv-network-delete-segment]')?.dataset.aivNetworkDeleteSegment;
  if (segmentId) return Object.freeze({ handled: true, network: deleteAivFlareNetworkSegment(network, segmentId) });
  const nodeId = target?.closest?.('[data-aiv-network-delete-node]')?.dataset.aivNetworkDeleteNode;
  if (nodeId) return Object.freeze({ handled: true, network: deleteAivFlareNetworkNode(network, nodeId) });
  return Object.freeze({ handled: false, network });
}

export function applyAivUnifiedNetworkAuthorChange(network, editor, target) {
  if (target?.dataset?.aivNetworkNodeField || target?.dataset?.aivNetworkNodePath) {
    return Object.freeze({ handled: true, network: updateNode(network, target) });
  }
  const updatedSegment = updateSegment(network, editor, target);
  return Object.freeze({ handled: Boolean(updatedSegment), network: updatedSegment ?? network });
}
