import { isLikelyRvmFileName } from '../rvm/BrowserRvmParser.js';
import { loadRvmFileInBrowser } from '../rvm/BrowserRvmLoadBridge.js?v=20260622-rvm-smart-civil-code11-defer-1';
import { applyRvmSupportSymbolSettings } from './RvmSupportSymbols.js?v=20260618-support-kind-authority-1';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-worker-first-direct-bridge-v1');
const LISTENER_FLAG = '__pcfGlbRvmWorkerFirstDirectLoadListener';
const ACTIVE_JOB = Symbol.for('pcf-glb-rvm-worker-first-active-job-v1');
const MAX_TREE_ROWS = 320;

export function installBrowserRvmWorkerFirstBridge(root = document) {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

  patchRvmInputs(root);
  globalThis.addEventListener?.('rvm-browser-parse-diagnostics', (event) => renderWorkerDiagnostics(event.detail, document));

  if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== 'childList') continue;
        for (const node of record.addedNodes || []) {
          patchRvmInputs(node.nodeType === 1 ? node : document);
        }
      }
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }
}

function patchRvmInputs(root = document) {
  if (!root?.querySelectorAll) return;
  const inputs = root.querySelectorAll('#rvm-file-input, input[data-browser-rvm-fallback="true"]');
  inputs.forEach((input) => {
    input.setAttribute('accept', '.json,.uxml,.uxml.json,.rvm,.rev,.att');
    input.setAttribute('multiple', 'multiple');
    input.setAttribute('data-browser-rvm-worker-first', 'true');
    if (input[LISTENER_FLAG]) return;
    input.addEventListener('change', (event) => handleWorkerFirstRvmChange(event, input), { capture: true });
    input[LISTENER_FLAG] = true;
  });
}

function handleWorkerFirstRvmChange(event, input) {
  const files = Array.from(input?.files || []);
  const rvmFile = files.find((file) => isLikelyRvmFileName(file?.name));
  if (!rvmFile) return false;

  const viewer = globalThis.__3D_RVM_VIEWER__;
  if (!viewer) return false;

  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();

  const root = input.closest?.('[data-rvm-viewer]') || document;
  cancelActiveJob(root);
  const abortController = new AbortController();
  root[ACTIVE_JOB] = { abortController, fileName: rvmFile.name };

  void loadWorkerFirstRvm({ root, viewer, files, rvmFile, abortController });
  return true;
}

async function loadWorkerFirstRvm({ root, viewer, files, rvmFile, abortController }) {
  const status = root?.querySelector?.('#rvm-sb-msg') || null;
  const startedAt = Date.now();
  if (root?.dataset) {
    root.dataset.rvmLoadedSourceKind = 'rvm';
    root.dataset.rvmLoadedFileName = rvmFile.name;
    root.dataset.rvmModelPrimitiveMode = 'rvm-native';
  }
  setStatus(status, `Loading ${rvmFile.name} with worker-first RVM path…`);
  renderWorkerDiagnostics({
    fileName: rvmFile.name,
    browserRvmWorkerFirstPipeline: true,
    browserRvmWorkerEnabled: true,
    browserRvmProgressiveRenderEnabled: true,
    browserRvmLoadState: 'starting'
  }, root);

  try {
    const attText = await readBestAttSidecarText(files, rvmFile.name);
    const payload = await loadRvmFileInBrowser(rvmFile, viewer, {
      statusEl: status,
      attText,
      signal: abortController.signal,
      renderOptions: {
        maxRenderableObjects: 6000,
        batchSize: 64,
        timeSliceMs: 8
      },
      onDiagnostics: (diagnostics) => renderWorkerDiagnostics(diagnostics, root),
      onProgress: (progress) => {
        renderWorkerDiagnostics({
          fileName: rvmFile.name,
          browserRvmWorkerFirstPipeline: true,
          browserRvmWorkerEnabled: true,
          browserRvmProgressiveRenderEnabled: true,
          browserRvmLoadState: progress.stage || 'loading',
          browserRvmProgressProcessed: progress.processed,
          browserRvmProgressTotal: progress.total,
          browserRvmRenderableCount: progress.renderableCount,
          browserRvmSkippedCount: progress.skippedCount
        }, root);
      }
    });

    if (abortController.signal.aborted) return;
    updateRvmTabTreeFromPayload(root, payload);
    root?.querySelector?.('#rvm-placeholder')?.remove?.();
    try { applyRvmSupportSymbolSettings(viewer, browserSupportOptions(root)); } catch (_) {}
    renderWorkerDiagnostics(payload?.browserRvmParser || {}, root);
    const renderCount = payload?.browserRvmRender?.renderableCount ?? payload?.manifest?.browserRvmRenderScene?.renderableCount;
    setStatus(status, `Loaded browser RVM ${rvmFile.name}${Number.isFinite(renderCount) ? ` (${renderCount} renderable)` : ''}`);
    console.info('[BrowserRVM] worker-first load completed', {
      fileName: rvmFile.name,
      elapsedMs: Date.now() - startedAt,
      diagnostics: payload?.browserRvmParser || null
    });
  } catch (error) {
    if (abortController.signal.aborted || error?.name === 'AbortError') {
      setStatus(status, `Cancelled RVM load ${rvmFile.name}`);
      return;
    }
    setStatus(status, `RVM worker-first load failed: ${error?.message || error}`);
    console.warn('[BrowserRVM] worker-first load failed', error);
  } finally {
    if (root?.[ACTIVE_JOB]?.abortController === abortController) delete root[ACTIVE_JOB];
  }
}

async function readBestAttSidecarText(files, rvmName) {
  const base = String(rvmName || '').replace(/\.[^.]+$/, '').toLowerCase();
  const att = files.find((file) => String(file?.name || '').toLowerCase() === `${base}.att`) || files.find((file) => String(file?.name || '').toLowerCase().endsWith('.att'));
  if (!att || typeof att.text !== 'function') return '';
  try { return await att.text(); } catch (_) { return ''; }
}

function cancelActiveJob(root) {
  const job = root?.[ACTIVE_JOB];
  try { job?.abortController?.abort?.(); } catch (_) {}
}

function browserSupportOptions(root) {
  return {
    enabled: root?.querySelector?.('#rvm-support-symbols-toggle')?.checked !== false,
    glyphs: root?.querySelector?.('#rvm-support-symbol-glyphs-toggle')?.checked !== false,
    labels: root?.querySelector?.('#rvm-support-symbol-labels-toggle')?.checked === true,
    supportOnly: root?.querySelector?.('#rvm-support-symbols-only-toggle')?.checked === true,
  };
}

function updateRvmTabTreeFromPayload(root, payload) {
  const tree = root?.querySelector?.('#rvm-tree');
  if (!tree || !payload?.manifest?.nodes) return;
  const allNodes = Array.isArray(payload.manifest.nodes) ? payload.manifest.nodes.filter((node) => nodeId(node)) : [];
  const byId = new Map(allNodes.map((node) => [nodeId(node), node]));
  const children = new Map();
  for (const node of allNodes) {
    const parent = parentId(node);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(node);
  }
  const roots = children.get('') || allNodes.filter((node) => !parentId(node) || !byId.has(parentId(node)));
  let rendered = 0;
  const renderNode = (node, depth = 0) => {
    if (rendered >= MAX_TREE_ROWS) return '';
    rendered += 1;
    const id = nodeId(node);
    const label = nodeLabel(node);
    const path = pathLabel(node, byId);
    const kind = String(node.kind || node.type || 'RVM').toUpperCase();
    const kids = children.get(id) || [];
    const count = kids.length || (Array.isArray(node.renderObjectIds) ? node.renderObjectIds.length : Number(node.count || 0));
    const pathHtml = path && path !== label ? `<span class="rvm-tree-path" data-rvm-tree-path-label="true">${esc(path)}</span>` : '';
    const childHtml = kids.length && depth < 10 ? `<ul>${kids.map((child) => renderNode(child, depth + 1)).filter(Boolean).join('')}</ul>` : '';
    return `<li data-node-id="${esc(id)}" data-depth="${depth}" data-rvm-source-kind="rvm" data-rvm-source-object-id="${esc(node.sourceObjectId || id)}" data-rvm-parent-node-id="${esc(parentId(node))}" data-rvm-tree-path="${esc(path)}"><button type="button" class="rvm-tree-node" title="${esc(path || label)}"><span class="rvm-kind">${esc(kind)}</span><span data-rvm-tree-label="true">${esc(label)}</span>${count ? `<span class="rvm-tree-count">${esc(count)}</span>` : ''}${pathHtml}</button><button type="button" class="rvm-tree-visibility-toggle" data-rvm-visibility-toggle="${esc(id)}" aria-pressed="false" title="Hide or show this row">Hide</button>${childHtml}</li>`;
  };
  const suffix = allNodes.length > rendered ? `<li class="rvm-empty-state">Tree capped at ${MAX_TREE_ROWS} rows. Use search/filter to narrow.</li>` : '';
  tree.innerHTML = roots.map((node) => renderNode(node)).filter(Boolean).join('') + suffix || '<li class="rvm-empty-state">No RVM hierarchy nodes found.</li>';
  const state = {
    sourceKind: 'rvm',
    nodeCount: payload.manifest.nodes.length,
    renderedNodeCount: rendered,
    fileName: root?.dataset?.rvmLoadedFileName || '',
    nodes: allNodes,
  };
  root.__rvmFormatNeutralHierarchy = state;
  root.dataset.rvmHierarchyController = 'format-neutral';
  root.dataset.rvmHierarchySourceKind = 'rvm';
  root.dataset.rvmHierarchyNodeCount = String(payload.manifest.nodes.length);
  try { root.dispatchEvent(new CustomEvent('rvm-tree-rendered', { bubbles: true, detail: state })); } catch (_) {}
}

function nodeId(node = {}) { return String(node.canonicalObjectId || node.id || node.sourceObjectId || '').trim(); }
function parentId(node = {}) { return String(node.parentCanonicalObjectId || node.parentId || node.parent || '').trim(); }
function nodeLabel(node = {}) { return String(node.name || node.label || node.displayName || node.sourceObjectId || node.canonicalObjectId || node.id || 'RVM node'); }
function pathLabel(node, byId = new Map()) {
  const parts = [];
  const seen = new Set();
  let current = node;
  while (current && !seen.has(nodeId(current))) {
    seen.add(nodeId(current));
    parts.unshift(nodeLabel(current));
    const parent = parentId(current);
    current = parent ? byId.get(parent) : null;
  }
  if (parts.length > 1) return parts.join(' > ');
  const raw = node?.attributes?.RVM_OWNER_PATH || node?.attributes?.RVM_REVIEW_PATH || node?.sourcePath || node?.canonicalObjectId || '';
  const attrParts = String(raw || '').replace(/\\/g, '/').split('/').map((part) => part.trim()).filter(Boolean);
  return attrParts.length > 1 ? attrParts.join(' > ') : parts.join(' > ');
}

function renderWorkerDiagnostics(diagnostics = {}, root = document) {
  const panel = root?.querySelector?.('#rvm-browser-parse-diagnostics');
  if (!panel) return;
  const rows = [
    ['Loaded JS version/hash', '20260622-rvm-smart-civil-code11-defer-1'],
    ['Worker loaded', bool(diagnostics.browserRvmWorkerEnabled)],
    ['Worker message received', bool(diagnostics.browserRvmWorkerFirstPipeline)],
    ['Legacy handler bypassed', bool(diagnostics.browserRvmWorkerFirstPipeline)],
    ['Parse time', ms(diagnostics.browserRvmStageTimingsMs?.['worker.parse.renderInstructions'])],
    ['Render-instruction time', ms(diagnostics.browserRvmStageTimingsMs?.['scene.progressiveCreate'])],
    ['First geometry', ms(diagnostics.browserRvmStageTimingsMs?.['scene.progressiveCreate'])],
    ['Objects rendered', diagnostics.browserRvmRenderableCount ?? '-'],
    ['Skipped objects', diagnostics.browserRvmSkippedCount ?? '-'],
    ['Native facet groups', diagnostics.browserRvmNativeFacetGroupPrimaryCount ?? '-'],
    ['Zone mode', zoneText(diagnostics.browserRvmZoneSelection)],
    ['LOD', lodText(diagnostics.browserRvmLodSelection)],
    ['Tree nodes rendered', root?.querySelectorAll?.('#rvm-tree li[data-node-id]')?.length ?? '-'],
    ['Max event-loop stall', ms(diagnostics.browserRvmMaxEventLoopStallMs)],
    ['Long tasks >100 ms', diagnostics.browserRvmEventLoopStallCount ?? '-'],
    ['Binary PRIM', diagnostics.browserRvmPrimitiveCounts?.PRIM ?? diagnostics.primitiveCounts?.PRIM ?? '-'],
    ['Hierarchy groups', diagnostics.browserRvmHierarchyCounts?.CNTB ?? diagnostics.hierarchyCounts?.CNTB ?? '-'],
    ['Fit guard', diagnostics.browserRvmScaleSafeContract?.fitGuard || '-'],
  ];
  panel.innerHTML = `<div class="rvm-browser-diag-grid">${rows.map(([label, value]) => `<div class="rvm-browser-diag-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div>`;
}

function zoneText(selection) { if (!selection) return 'all'; if (selection.mode === 'selected') return `selected ${selection.selectedCount || 0}/${selection.originalCount || ''}`; return `${selection.mode || 'all'} ${selection.filteredCount || selection.originalCount || ''}/${selection.originalCount || ''}`; }
function lodText(selection) { if (!selection) return '100%'; return `${selection.percent || selection.detailPercent || 100}%`; }
function setStatus(el, text) { if (el) el.textContent = text; }
function bool(value) { return value ? 'yes' : 'no'; }
function ms(value) { const n = Number(value); return Number.isFinite(n) ? `${n.toFixed(1)} ms` : '-'; }
function esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
