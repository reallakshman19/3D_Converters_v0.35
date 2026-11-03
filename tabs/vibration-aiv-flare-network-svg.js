import { AIV_FLARE_NETWORK_SCHEMA, createAivFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network.js';
import { renderAivCanvasNodeGlyph } from './vibration-aiv-canvas-icons.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function network(value) { return value?.schema === AIV_FLARE_NETWORK_SCHEMA ? value : createAivFlareNetwork(value); }

function iconType(node) {
  if (node.kind === 'SOURCE') {
    return ({
      RELIEF_VALVE: 'RELIEF_VALVE',
      CONTROL_VALVE: 'CONTROL_VALVE',
      RESTRICTION_ORIFICE: 'RESTRICTION_ORIFICE',
      PRESSURE_REDUCING_BRANCH_CONNECTION: 'PRESSURE_REDUCING_DEVICE',
    })[node.sourceInput?.sourceDeviceType] ?? 'UNKNOWN_SOURCE';
  }
  if (node.kind === 'ASSESSMENT') return node.assessmentInput?.assessmentType ?? 'UNKNOWN_ASSESSMENT';
  if (node.kind === 'JUNCTION') return 'JUNCTION';
  if (node.kind === 'CONNECTION') return 'CONNECTION_NODE';
  if (node.kind === 'OFF_PAGE') return 'OFF_PAGE';
  if (node.kind === 'BOUNDARY') return 'BOUNDARY';
  return 'PIPE_PATH';
}

function segmentLabel(segment) {
  return segment.physicalLength
    ? `${segment.physicalLength.value} ${segment.physicalLength.unit}`
    : 'length unresolved';
}

function segmentHtml(segment, positions) {
  const from = positions.get(segment.fromNodeId);
  const to = positions.get(segment.toNodeId);
  if (!from || !to) return '';
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const unresolved = segment.physicalLength ? '' : ' is-unresolved';
  return `<g class="aiv-network-segment${unresolved}" data-aiv-network-segment="${esc(segment.segmentId)}" data-aiv-network-from="${esc(segment.fromNodeId)}" data-aiv-network-to="${esc(segment.toNodeId)}" data-aiv-engineering-length="${esc(segment.physicalLength?.value ?? '')}" data-aiv-engineering-length-unit="${esc(segment.physicalLength?.unit ?? '')}" tabindex="0" role="button" aria-label="Pipe segment ${esc(segment.segmentId)} ${esc(segmentLabel(segment))}">
    <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>
    <text x="${mx}" y="${my - 7}" text-anchor="middle">${esc(segment.segmentId)} · ${esc(segmentLabel(segment))}</text>
  </g>`;
}

function nodeHtml(node) {
  const position = node.presentation;
  const icon = iconType(node);
  return `<g class="aiv-network-node is-${esc(node.kind.toLowerCase())}" transform="translate(${position.x} ${position.y})" data-aiv-network-node="${esc(node.canonicalId)}" data-aiv-network-node-kind="${esc(node.kind)}" data-aiv-network-icon-type="${esc(icon)}" data-aiv-network-x="${position.x}" data-aiv-network-y="${position.y}" tabindex="0" role="button" aria-label="${esc(node.kind)} ${esc(node.tag)}">
    ${renderAivCanvasNodeGlyph({ nodeKind: node.kind, iconType: icon })}<text class="aiv-network-node-title" x="0" y="36" text-anchor="middle">${esc(node.tag)}</text>
    <text class="aiv-network-node-subtitle" x="0" y="49" text-anchor="middle">${esc(node.canonicalId)}</text>
  </g>`;
}

export function renderAivFlareNetworkSvg(networkInput, { width = 900, height = 520 } = {}) {
  const value = network(networkInput);
  const positions = new Map(value.nodes.map((node) => [node.canonicalId, node.presentation]));
  const segments = value.segments.map((segment) => segmentHtml(segment, positions)).join('');
  const nodes = value.nodes.map(nodeHtml).join('');
  return `<svg class="aiv-flare-network-svg" data-aiv-flare-network-svg="true" data-aiv-network-id="${esc(value.networkId)}" data-aiv-network-revision="${esc(value.revision)}" viewBox="0 0 ${Number(width)} ${Number(height)}" role="img" aria-label="AIV flare network ${esc(value.networkId)}">
    <style>
      .aiv-flare-network-svg{width:100%;min-height:360px;background:#08111f}.aiv-network-segment line{stroke:#64748b;stroke-width:4}.aiv-network-segment text{fill:#cbd5e1;font-size:10px}.aiv-network-segment.is-unresolved line{stroke:#f59e0b;stroke-dasharray:8 6}.aiv-network-node{cursor:move}.aiv-network-node .aiv-canvas-node-shape{fill:#0f172a;stroke:#7dd3fc;stroke-width:2}.aiv-network-node.is-assessment .aiv-canvas-node-shape{stroke:#c4b5fd}.aiv-network-node .aiv-canvas-node-detail{fill:none;stroke:#e2e8f0;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.aiv-network-node .aiv-canvas-node-glyph-text{fill:#e2e8f0;font-size:14px}.aiv-network-node-title{fill:#e5e7eb;font-size:11px;font-weight:700;stroke:none}.aiv-network-node-subtitle{fill:#94a3b8;font-size:9px;stroke:none}.aiv-network-node:focus,.aiv-network-segment:focus{outline:none;filter:drop-shadow(0 0 4px #38bdf8)}
    </style>
    <g class="aiv-network-segments">${segments}</g><g class="aiv-network-nodes">${nodes}</g>
  </svg>`;
}
