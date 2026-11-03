import { moveAivFlareNetworkNodePresentation } from '../converters/vibration/aiv/aiv-flare-network.js';
import {
  addAivFlareNetworkNode,
  addAivFlareNetworkSegment,
  deleteAivFlareNetworkNode,
  deleteAivFlareNetworkSegment,
  setAivFlareNetworkSegmentLength,
  updateAivFlareNetworkNode,
} from '../converters/vibration/aiv/aiv-flare-network-mutations.js';

function value(editor, selector) { return String(editor.querySelector(selector)?.value ?? '').trim(); }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function text(value) { return String(value ?? '').trim(); }

function defaultPosition(network) {
  const index = network.nodes.length;
  return { x: 110 + (index % 4) * 220, y: 100 + Math.floor(index / 4) * 130 };
}

function createNode(editor, network) {
  const canonicalId = value(editor, '[data-aiv-network-new-node-id]');
  const kind = value(editor, '[data-aiv-network-new-node-kind]');
  const caseId = value(editor, '[data-aiv-network-new-node-case]');
  const line = value(editor, '[data-aiv-network-new-node-line]');
  const tag = value(editor, '[data-aiv-network-new-node-tag]');
  const sourceDeviceType = value(editor, '[data-aiv-network-new-source-device]');
  const assessmentType = value(editor, '[data-aiv-network-new-assessment-type]');
  return addAivFlareNetworkNode(network, {
    canonicalId, kind, line, tag, presentation: defaultPosition(network),
    ...(kind === 'SOURCE' ? { sourceInput: { caseId, ...(sourceDeviceType ? { sourceDeviceType } : {}) } } : {}),
    ...(kind === 'ASSESSMENT' ? { assessmentInput: assessmentType ? { assessmentType } : {} } : {}),
  });
}

function createSegment(editor, network) {
  const segmentId = value(editor, '[data-aiv-network-new-segment-id]');
  const fromNodeId = value(editor, '[data-aiv-network-new-segment-from]');
  const toNodeId = value(editor, '[data-aiv-network-new-segment-to]');
  const length = value(editor, '[data-aiv-network-new-segment-length]');
  const unit = value(editor, '[data-aiv-network-new-segment-unit]') || 'm';
  const line = value(editor, '[data-aiv-network-new-segment-line]');
  return addAivFlareNetworkSegment(network, {
    segmentId, fromNodeId, toNodeId, line,
    physicalLength: length ? { value: Number(length), unit } : null,
  });
}

function updateNodeEngineeringField(network, target) {
  const nodeId = text(target.dataset.aivNetworkNodeId);
  const field = text(target.dataset.aivNetworkNodeField);
  const node = network.nodes.find((item) => item.canonicalId === nodeId);
  if (!node) throw new RangeError(`Unknown AIV flare-network node ${nodeId}.`);
  const next = text(target.value);
  if (field === 'tag' || field === 'line') return updateAivFlareNetworkNode(network, nodeId, { [field]: next });
  if (field === 'caseId' || field === 'sourceDeviceType') {
    return updateAivFlareNetworkNode(network, nodeId, { sourceInput: { ...(node.sourceInput ?? {}), [field]: next } });
  }
  if (field === 'assessmentType') {
    return updateAivFlareNetworkNode(network, nodeId, { assessmentInput: { ...(node.assessmentInput ?? {}), assessmentType: next } });
  }
  throw new RangeError(`Unsupported AIV flare-network node field ${field}.`);
}

function svgDelta(svg, dx, dy) {
  const rect = svg.getBoundingClientRect?.();
  const viewBox = svg.viewBox?.baseVal;
  if (!rect || !viewBox || !(rect.width > 0) || !(rect.height > 0)) return { x: dx, y: dy };
  return { x: dx * (viewBox.width / rect.width), y: dy * (viewBox.height / rect.height) };
}

function redrawConnectedSegments(svg, nodeId, x, y) {
  for (const segment of svg.querySelectorAll('[data-aiv-network-segment]')) {
    const fromId = segment.dataset.aivNetworkFrom;
    const toId = segment.dataset.aivNetworkTo;
    if (fromId !== nodeId && toId !== nodeId) continue;
    const otherId = fromId === nodeId ? toId : fromId;
    const other = svg.querySelector(`[data-aiv-network-node="${CSS.escape(otherId)}"]`);
    if (!other) continue;
    const otherX = number(other.dataset.aivNetworkX);
    const otherY = number(other.dataset.aivNetworkY);
    const line = segment.querySelector('line');
    const label = segment.querySelector('text');
    const x1 = fromId === nodeId ? x : otherX;
    const y1 = fromId === nodeId ? y : otherY;
    const x2 = toId === nodeId ? x : otherX;
    const y2 = toId === nodeId ? y : otherY;
    line?.setAttribute('x1', String(x1)); line?.setAttribute('y1', String(y1));
    line?.setAttribute('x2', String(x2)); line?.setAttribute('y2', String(y2));
    label?.setAttribute('x', String((x1 + x2) / 2));
    label?.setAttribute('y', String((y1 + y2) / 2 - 7));
  }
}

export function createAivFlareNetworkAuthoringController(container, callbacks = {}) {
  let drag = null;

  function apply(editor, mutator) {
    try {
      const current = callbacks.getNetwork?.();
      if (!current) return;
      callbacks.onNetworkChange?.(mutator(editor, current));
    } catch (error) {
      callbacks.onError?.(error);
    }
  }

  function click(event) {
    const editor = event.target.closest('[data-aiv-network-editor]');
    if (!editor) return;
    const action = event.target.closest('[data-aiv-network-action]')?.dataset.aivNetworkAction;
    if (action === 'add-node') { apply(editor, createNode); return; }
    if (action === 'add-segment') { apply(editor, createSegment); return; }
    const segmentId = event.target.closest('[data-aiv-network-delete-segment]')?.dataset.aivNetworkDeleteSegment;
    if (segmentId) { apply(editor, (_, network) => deleteAivFlareNetworkSegment(network, segmentId)); return; }
    const nodeId = event.target.closest('[data-aiv-network-delete-node]')?.dataset.aivNetworkDeleteNode;
    if (nodeId) apply(editor, (_, network) => deleteAivFlareNetworkNode(network, nodeId));
  }

  function change(event) {
    const editor = event.target.closest('[data-aiv-network-editor]');
    if (!editor) return;
    if (event.target.dataset.aivNetworkNodeField) {
      apply(editor, (_, network) => updateNodeEngineeringField(network, event.target));
      return;
    }
    const segmentId = event.target.dataset.aivNetworkSegmentLength || event.target.dataset.aivNetworkSegmentUnit;
    if (!segmentId) return;
    const lengthInput = editor.querySelector(`[data-aiv-network-segment-length="${CSS.escape(segmentId)}"]`);
    const unitInput = editor.querySelector(`[data-aiv-network-segment-unit="${CSS.escape(segmentId)}"]`);
    const length = text(lengthInput?.value);
    const unit = text(unitInput?.value) || 'm';
    apply(editor, (_, network) => setAivFlareNetworkSegmentLength(network, segmentId, length ? Number(length) : null, unit));
  }

  function pointerdown(event) {
    const node = event.target.closest('[data-aiv-network-node]');
    const svg = event.target.closest('[data-aiv-flare-network-svg]');
    if (!node || !svg || !event.target.closest('[data-aiv-network-editor]')) return;
    drag = {
      pointerId: event.pointerId,
      nodeId: node.dataset.aivNetworkNode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: number(node.dataset.aivNetworkX),
      startY: number(node.dataset.aivNetworkY),
      node,
      svg,
    };
    svg.setPointerCapture?.(event.pointerId);
    event.preventDefault?.();
  }

  function pointermove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const delta = svgDelta(drag.svg, event.clientX - drag.startClientX, event.clientY - drag.startClientY);
    const x = drag.startX + delta.x;
    const y = drag.startY + delta.y;
    drag.node.setAttribute('transform', `translate(${x} ${y})`);
    drag.node.dataset.aivNetworkX = String(x);
    drag.node.dataset.aivNetworkY = String(y);
    redrawConnectedSegments(drag.svg, drag.nodeId, x, y);
    event.preventDefault?.();
  }

  function pointerup(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const completed = drag;
    drag = null;
    completed.svg.releasePointerCapture?.(event.pointerId);
    try {
      const current = callbacks.getNetwork?.();
      if (!current) return;
      callbacks.onPresentationChange?.(moveAivFlareNetworkNodePresentation(
        current,
        completed.nodeId,
        number(completed.node.dataset.aivNetworkX, completed.startX),
        number(completed.node.dataset.aivNetworkY, completed.startY),
      ));
    } catch (error) {
      callbacks.onError?.(error);
    }
  }

  container.addEventListener('click', click);
  container.addEventListener('change', change);
  container.addEventListener('pointerdown', pointerdown);
  container.addEventListener('pointermove', pointermove);
  container.addEventListener('pointerup', pointerup);
  container.addEventListener('pointercancel', pointerup);
  return Object.freeze({
    destroy() {
      drag = null;
      container.removeEventListener('click', click);
      container.removeEventListener('change', change);
      container.removeEventListener('pointerdown', pointerdown);
      container.removeEventListener('pointermove', pointermove);
      container.removeEventListener('pointerup', pointerup);
      container.removeEventListener('pointercancel', pointerup);
    },
  });
}
