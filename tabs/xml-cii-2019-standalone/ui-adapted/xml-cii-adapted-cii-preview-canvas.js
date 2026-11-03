import { createElement } from './xml-cii-adapted-dom.js';

function text(value) {
  return String(value ?? '');
}

function byteCount(value) {
  return new TextEncoder().encode(text(value)).length;
}

export function adaptedCiiPreviewStats(ciiText) {
  const source = text(ciiText);
  const lines = source ? source.split(/\r\n|\r|\n/).length : 0;
  return { lines, bytes: byteCount(source), chars: source.length };
}

export function adaptedCiiPreviewLines(ciiText, limit) {
  return text(ciiText).split(/\r\n|\r|\n/).slice(0, limit);
}

function drawFallback(canvas, ciiText) {
  const preview = adaptedCiiPreviewLines(ciiText, 14).join('\n');
  canvas.textContent = preview || 'Run conversion to preview generated .cii output.';
}

export function drawAdaptedCiiPreviewCanvas(canvas, ciiText) {
  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) {
    drawFallback(canvas, ciiText);
    return;
  }

  const rect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : {};
  const width = Math.max(720, Math.floor(rect.width || 920));
  const height = Math.max(240, Math.floor(rect.height || 280));
  const ratio = Number(canvas.ownerDocument?.defaultView?.devicePixelRatio || 1);
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  ctx.fillStyle = '#07111f';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0d1b2d';
  ctx.fillRect(0, 0, width, 34);
  ctx.fillStyle = '#9fb7d6';
  ctx.font = '12px Consolas, ui-monospace, monospace';
  ctx.fillText('CII 2019 output preview', 14, 22);

  const lines = adaptedCiiPreviewLines(ciiText, 15);
  if (!lines.length || !text(ciiText).trim()) {
    ctx.fillStyle = '#7f8ea3';
    ctx.fillText('Run conversion to preview generated .cii output.', 18, 70);
    return;
  }

  ctx.font = '12px Consolas, ui-monospace, monospace';
  lines.forEach((line, index) => {
    const y = 58 + index * 14;
    ctx.fillStyle = '#4f6582';
    ctx.fillText(String(index + 1).padStart(3, ' '), 14, y);
    ctx.fillStyle = '#d6e4f7';
    ctx.fillText(text(line).slice(0, 150), 54, y);
  });
}

function _localName(node) { return text(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function _childText(parent, name) {
  for (const child of parent?.childNodes || []) {
    if (child.nodeType === 1 && _localName(child) === name) return text(child.textContent).trim();
  }
  return '';
}
function _point(raw) {
  const parts = (text(raw).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  return parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite) ? { x: parts[0], y: parts[1], z: parts[2] } : null;
}

// Builds a renderer project (nodes / segments / supports) from the enriched
// or source XML so the standalone canvas can show geometry like the parent
// tab's "3DModelConv Geometry Preview".
export function buildAdaptedGeometryProject(xmlText) {
  if (!text(xmlText).trim() || typeof DOMParser === 'undefined') return null;
  let doc;
  try { doc = new DOMParser().parseFromString(xmlText, 'application/xml'); } catch { return null; }
  if (doc.getElementsByTagName('parsererror').length) return null;
  const nodes = [];
  const segments = [];
  const supports = [];
  for (const branch of [...doc.getElementsByTagName('*')].filter((el) => _localName(el) === 'Branch')) {
    let previous = null;
    for (const node of [...branch.childNodes].filter((child) => child.nodeType === 1 && _localName(child) === 'Node')) {
      const position = _point(_childText(node, 'Position'));
      if (!position) continue;
      nodes.push({ id: `${nodes.length}`, position });
      const hasRestraint = [...node.childNodes].some((child) => child.nodeType === 1 && _localName(child) === 'Restraint');
      if (hasRestraint) supports.push({ normalized: { supportCoord: position } });
      if (previous) segments.push({ normalized: { ep1: previous, ep2: position } });
      previous = position;
    }
  }
  return segments.length || nodes.length ? { nodes, segments, supports } : null;
}

async function renderAdaptedGeometryPreview(host, meta, xmlText) {
  const project = buildAdaptedGeometryProject(xmlText);
  if (!project) {
    meta.textContent = 'Geometry preview unavailable: no node positions parsed yet (load a source XML or run conversion).';
    return;
  }
  try {
    const { ModelConverters_3DModelConv_PreviewRenderer } = await import('../../../converters/view/model-conv-preview-renderer.js');
    const renderer = new ModelConverters_3DModelConv_PreviewRenderer(host);
    renderer._3DModelConv_renderProject(project);
    meta.textContent = `Geometry preview: ${project.segments.length} segment(s), ${project.nodes.length} node(s), ${project.supports.length} support(s). Drag to orbit, scroll to zoom.`;
  } catch (error) {
    meta.textContent = `Geometry preview unavailable: ${text(error?.message || error)}`;
  }
}

export function renderAdaptedCiiPreviewCanvas(parent, state, report) {
  const ciiText = text(state?.result?.ciiText);
  const ciiRow = (Array.isArray(report?.artifactRows) ? report.artifactRows : []).find((row) => row.kind === 'cii');
  const available = !!ciiText.trim() && ciiRow?.available !== false;
  const stats = adaptedCiiPreviewStats(ciiText);

  const card = createElement('div', '', 'xml-cii-adapted-cii-preview-card model-converters-preview-card');
  const head = createElement('div', '', 'xml-cii-adapted-cii-preview-head');
  head.appendChild(createElement('strong', 'CII Preview Canvas'));
  const download = createElement('button', 'Download .cii', 'model-converters-download-btn xml-cii-adapted-cii-download');
  download.type = 'button';
  download.dataset.action = 'download-cii';
  download.disabled = !available;
  head.appendChild(download);

  // Geometry preview (parity with the parent 3DModelConv Geometry Preview),
  // built from the enriched XML when available, else the loaded source XML.
  const geometryHost = createElement('div', '', 'xml-cii-adapted-geometry-host model-converters-preview-host');
  if (geometryHost.style) Object.assign(geometryHost.style, { minHeight: '280px', height: '320px', marginBottom: '8px' });
  const geometryMeta = createElement('div', 'Building geometry preview…', 'model-converters-preview-meta');

  const host = createElement('div', '', 'xml-cii-adapted-cii-preview-host model-converters-preview-host');
  const canvas = createElement('canvas');
  canvas.setAttribute('aria-label', 'CII output preview canvas');
  host.appendChild(canvas);

  const metaText = available
    ? `${ciiRow?.filename || state?.result?.ciiName || 'output.cii'} | ${stats.lines} lines | ${stats.bytes} bytes`
    : 'Run conversion to enable the .cii preview and download.';
  card.append(head, geometryHost, geometryMeta, host, createElement('div', metaText, 'xml-cii-adapted-cii-preview-meta model-converters-preview-meta'));
  parent.appendChild(card);
  drawAdaptedCiiPreviewCanvas(canvas, ciiText);
  const geometryXml = text(state?.result?.enrichedText) || text(state?.sourceText);
  renderAdaptedGeometryPreview(geometryHost, geometryMeta, geometryXml);
}
