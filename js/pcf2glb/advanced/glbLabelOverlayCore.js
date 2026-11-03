import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const DEFAULT_MAX_LABELS = 250;
const LABEL_TOGGLE_PANEL_ID = 'glb-label-toggle-panel';
const LABEL_VISIBILITY_STORAGE_KEY = 'pcf-glb-label-visibility-v2';
const LABEL_PANEL_COLLAPSED_STORAGE_KEY = 'pcf-glb-label-panel-collapsed-v2';
const LABEL_PANEL_POSITION_STORAGE_KEY = 'pcf-glb-label-panel-position-v1';

export const DEFAULT_GLB_LABEL_VISIBILITY = Object.freeze({
  node: true,
  support: true,
  valve: false,
  flange: false,
  tee: true,
  terminal: true,
  component: false,
});

const LABEL_TOGGLE_DEFS = Object.freeze([
  ['node', 'Node labels'],
  ['support', 'Support / restraint text'],
  ['valve', 'Valve text'],
  ['flange', 'Flange text'],
  ['tee', 'Tee / branch text'],
  ['terminal', 'Terminal / nozzle text'],
  ['component', 'Other component text'],
]);

function text(value) {
  return String(value ?? '').trim();
}

function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readJsonStorage(key, fallback) {
  const storage = safeStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort persistence only.
  }
}

function normalizeVisibility(value = {}) {
  return {
    ...DEFAULT_GLB_LABEL_VISIBILITY,
    ...(value && typeof value === 'object' ? value : {}),
  };
}

export function readGlbLabelVisibility() {
  return normalizeVisibility(readJsonStorage(LABEL_VISIBILITY_STORAGE_KEY, {}));
}

function writeGlbLabelVisibility(visibility) {
  writeJsonStorage(LABEL_VISIBILITY_STORAGE_KEY, normalizeVisibility(visibility));
}

function readPanelCollapsed() {
  const storage = safeStorage();
  if (!storage) return true;
  try {
    const raw = storage.getItem(LABEL_PANEL_COLLAPSED_STORAGE_KEY);
    return raw == null ? true : raw !== 'false';
  } catch {
    return true;
  }
}

function writePanelCollapsed(collapsed) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(LABEL_PANEL_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
  } catch {
    // Best-effort persistence only.
  }
}

function readPanelPosition() {
  const pos = readJsonStorage(LABEL_PANEL_POSITION_STORAGE_KEY, null);
  if (!pos || !Number.isFinite(Number(pos.left)) || !Number.isFinite(Number(pos.top))) return null;
  return { left: Number(pos.left), top: Number(pos.top) };
}

function writePanelPosition(pos) {
  if (!pos) return;
  writeJsonStorage(LABEL_PANEL_POSITION_STORAGE_KEY, {
    left: Math.max(8, Math.round(Number(pos.left) || 0)),
    top: Math.max(8, Math.round(Number(pos.top) || 0)),
  });
}

function isLabelSuppressed(object) {
  const data = object?.userData || {};
  return data.EXPORT_LABEL === false || data.exportLabel === false || data.hideLabel === true;
}

function isExplicitLabelAnchor(object) {
  const data = object?.userData || {};
  const shape = text(data.glbShape).toLowerCase();
  const name = text(object?.name);
  return !!(
    data.labelAnchor === true ||
    name.startsWith('label:') ||
    name.startsWith('node-label:') ||
    shape === 'node-label-anchor' ||
    shape === 'localized-bend-label-anchor' ||
    shape === 'terminal-label-anchor'
  );
}

function hasLabelFallbackMetadata(object) {
  const data = object?.userData || {};
  return !!(data.labelKind || data.supportKind || data.glbShape || data.pcfType || data.componentType);
}

function isLabelCandidate(object) {
  if (isLabelSuppressed(object)) return false;
  if (!text(object?.userData?.labelText)) return false;
  return isExplicitLabelAnchor(object) || hasLabelFallbackMetadata(object);
}

function labelClassFor(object) {
  const data = object?.userData || {};
  const shape = text(data.glbShape).toLowerCase();
  if (data.labelKind === 'node' || shape === 'node-label-anchor' || text(object?.name).startsWith('node-label:')) return 'node';
  if (data.labelKind === 'terminal' || shape.includes('terminal') || data.TERMINAL_NODE) return 'terminal';
  if (data.supportKind || shape.startsWith('support-') || data.labelKind === 'support') return 'support';
  if (shape.startsWith('valve')) return 'valve';
  if (shape.startsWith('flange')) return 'flange';
  if (shape.startsWith('tee')) return 'tee';
  return 'component';
}

export function shouldShowGlbLabelKind(kind, visibility = {}) {
  const normalized = normalizeVisibility(visibility);
  const key = kind && normalized[kind] !== undefined ? kind : 'component';
  return normalized[key] !== false;
}

function makeLabelElement(label, kind) {
  const div = document.createElement('div');
  div.textContent = label;
  div.className = `glb-label glb-label-${kind || 'component'}`;
  const palette = {
    node: ['#dbeafe', 'rgba(37,99,235,0.96)', '#93c5fd'],
    support: ['#dcfce7', 'rgba(22,163,74,0.94)', '#86efac'],
    valve: ['#dcfce7', 'rgba(22,163,74,0.94)', '#86efac'],
    flange: ['#dcfce7', 'rgba(21,128,61,0.94)', '#bbf7d0'],
    tee: ['#ccfbf1', 'rgba(20,184,166,0.94)', '#5eead4'],
    terminal: ['#fed7aa', 'rgba(249,115,22,0.95)', '#fdba74'],
    component: ['#bfdbfe', 'rgba(37,99,235,0.92)', '#93c5fd'],
  }[kind] || ['#bfdbfe', 'rgba(37,99,235,0.92)', '#93c5fd'];
  const fontSize = kind === 'node' ? 13 : 11;
  div.style.cssText = `
    font: 800 ${fontSize}px/1.15 "Inter", "Segoe UI", Arial, sans-serif;
    color: ${palette[0]};
    background: ${palette[1]};
    padding: 3px 7px;
    border: 1px solid ${palette[2]};
    border-radius: 5px;
    pointer-events: none;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.42);
    letter-spacing: 0.02em;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 2px rgba(0,0,0,0.65);
    transform: translateY(-8px);
  `;
  return div;
}

function clearGlbLabels(labelGroup) {
  if (!labelGroup?.children) return;
  for (let i = labelGroup.children.length - 1; i >= 0; i -= 1) {
    const child = labelGroup.children[i];
    if (child?.userData?.type === 'glb-userdata-label') {
      labelGroup.remove(child);
      child.element?.remove?.();
    }
  }
}

function candidatePriority(object) {
  const data = object?.userData || {};
  const name = text(object?.name);
  const shape = text(data.glbShape).toLowerCase();
  if (name.startsWith('node-label:')) return 0;
  if (name.startsWith('label:')) return 1;
  if (data.labelAnchor === true) return 2;
  if (shape === 'node-label-anchor') return 3;
  if (object?.children?.length) return 5;
  return isExplicitLabelAnchor(object) ? 4 : 9;
}

function logicalLabelKey(object, label, kind) {
  const data = object?.userData || {};
  const name = text(object?.name);
  const id = text(data.pcfId)
    || text(data.componentId)
    || text(data.refNo)
    || text(data.NODE_LABEL)
    || text(data.TERMINAL_NODE)
    || name.replace(/-(valve|flange|tee|ring|body|bonnet|stem|handwheel|collar|hub|arrow|plate|bar|base|post|mesh|marker).*$/i, '')
    || label;
  return `${kind}|${id}|${label}`;
}

export function collectGlbLabelAnchors(root, options = {}) {
  const maxLabels = Number.isFinite(Number(options.maxLabels)) ? Math.max(0, Number(options.maxLabels)) : DEFAULT_MAX_LABELS;
  if (!root?.traverse || maxLabels <= 0) return [];

  root.updateMatrixWorld?.(true);
  const candidatesByKey = new Map();
  const position = new THREE.Vector3();

  root.traverse((object) => {
    if (!isLabelCandidate(object)) return;
    const label = text(object.userData.labelText);
    if (!label) return;

    const kind = labelClassFor(object);
    const key = logicalLabelKey(object, label, kind);
    const priority = candidatePriority(object);
    object.getWorldPosition(position);

    const candidate = {
      text: label,
      kind,
      position: position.clone(),
      sourceName: object.name || object.userData.pcfId || '',
      sourceId: object.userData.pcfId || object.userData.componentId || object.name || '',
      priority,
    };

    const existing = candidatesByKey.get(key);
    if (!existing || priority < existing.priority) candidatesByKey.set(key, candidate);
  });

  return Array.from(candidatesByKey.values())
    .sort((a, b) => a.priority - b.priority || a.kind.localeCompare(b.kind) || a.text.localeCompare(b.text))
    .slice(0, maxLabels)
    .map(({ priority, ...label }) => label);
}

export function summarizeGlbLabels(labels = []) {
  const summary = { total: labels.length, node: 0, support: 0, valve: 0, flange: 0, tee: 0, terminal: 0, component: 0 };
  for (const label of labels) {
    const kind = label?.kind || 'component';
    summary[kind] = (summary[kind] || 0) + 1;
  }
  return summary;
}

export function applyGlbLabelVisibility(labelGroup, visibility = {}) {
  const normalized = normalizeVisibility(visibility);
  let visible = 0;
  let hidden = 0;

  for (const child of labelGroup?.children || []) {
    if (child?.userData?.type !== 'glb-userdata-label') continue;
    const show = shouldShowGlbLabelKind(child.userData.labelKind, normalized);
    child.visible = show;
    if (child.element) child.element.style.display = show ? '' : 'none';
    if (show) visible += 1;
    else hidden += 1;
  }

  labelGroup.userData = {
    ...(labelGroup.userData || {}),
    glbLabelVisibility: normalized,
    glbLabelVisibleCount: visible,
    glbLabelHiddenCount: hidden,
  };
  return { visible, hidden, visibility: normalized };
}

function defaultPanelStyle() {
  const saved = readPanelPosition();
  const pos = saved
    ? `left:${saved.left}px;top:${saved.top}px;right:auto;bottom:auto;`
    : 'right:96px;bottom:92px;left:auto;top:auto;';
  return `
    position: fixed;
    ${pos}
    z-index: 1400;
    width: 242px;
    max-width: calc(100vw - 32px);
    border-radius: 14px;
    border: 1px solid rgba(147,197,253,0.24);
    background: rgba(15, 28, 45, 0.92);
    color: #e5f2ff;
    box-shadow: 0 10px 28px rgba(0,0,0,0.30);
    padding: 8px 10px;
    font: 12px/1.35 "Inter", "Segoe UI", Arial, sans-serif;
    backdrop-filter: blur(5px);
    user-select: none;
  `;
}

function setPanelCollapsed(panel, collapsed) {
  panel.dataset.collapsed = collapsed ? 'true' : 'false';
  const body = panel.querySelector('[data-glb-label-panel-body]');
  const toggle = panel.querySelector('[data-glb-label-panel-toggle]');
  if (body) body.style.display = collapsed ? 'none' : '';
  if (toggle) {
    toggle.textContent = collapsed ? 'Show' : 'Hide';
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
}

function makePanelDraggable(panel) {
  const handle = panel.querySelector('[data-glb-label-panel-drag]');
  if (!handle || panel.dataset.dragInstalled === 'true') return;
  panel.dataset.dragInstalled = 'true';

  let dragging = null;
  const move = (event) => {
    if (!dragging) return;
    event.preventDefault();
    const left = Math.min(Math.max(8, event.clientX - dragging.dx), window.innerWidth - panel.offsetWidth - 8);
    const top = Math.min(Math.max(8, event.clientY - dragging.dy), window.innerHeight - panel.offsetHeight - 8);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  };
  const up = () => {
    if (!dragging) return;
    dragging = null;
    writePanelPosition({ left: panel.offsetLeft, top: panel.offsetTop });
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };

  handle.addEventListener('pointerdown', (event) => {
    if (event.target?.closest?.('button,input')) return;
    dragging = { dx: event.clientX - panel.getBoundingClientRect().left, dy: event.clientY - panel.getBoundingClientRect().top };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function ensureGlbLabelTogglePanel(labelGroup, labels, visibility) {
  if (typeof document === 'undefined') return null;
  if (!labels.length) {
    const existing = document.getElementById(LABEL_TOGGLE_PANEL_ID);
    if (existing) existing.style.display = 'none';
    return null;
  }

  let panel = document.getElementById(LABEL_TOGGLE_PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = LABEL_TOGGLE_PANEL_ID;
    document.body.appendChild(panel);
  }

  const summary = summarizeGlbLabels(labels);
  panel.style.cssText = defaultPanelStyle();
  panel.style.display = '';
  panel.innerHTML = `
    <div data-glb-label-panel-drag style="display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:move;touch-action:none;">
      <strong style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#bfdbfe;">Labels</strong>
      <span style="margin-left:auto;font-size:11px;color:#93c5fd;" title="collected labels">${summary.total}</span>
      <button type="button" data-glb-label-panel-toggle style="border:1px solid rgba(147,197,253,0.28);border-radius:8px;background:#1e293b;color:#dbeafe;padding:3px 7px;cursor:pointer;font-size:11px;">Show</button>
    </div>
    <div data-glb-label-panel-body style="display:grid;gap:8px;margin-top:9px;">
      <div style="display:grid;gap:5px;">
        ${LABEL_TOGGLE_DEFS.map(([key, label]) => `
          <label style="display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none;">
            <input data-glb-label-toggle="${key}" type="checkbox" ${visibility[key] === false ? '' : 'checked'} style="accent-color:#60a5fa;">
            <span>${label}</span>
            <span style="margin-left:auto;color:#94a3b8;font-size:10px;">${summary[key] || 0}</span>
          </label>
        `).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
        <button type="button" data-glb-label-action="all" style="border:1px solid rgba(147,197,253,0.28);border-radius:8px;background:#1e3a5f;color:#dbeafe;padding:5px 7px;cursor:pointer;">All</button>
        <button type="button" data-glb-label-action="none" style="border:1px solid rgba(147,197,253,0.28);border-radius:8px;background:#1e293b;color:#dbeafe;padding:5px 7px;cursor:pointer;">None</button>
        <button type="button" data-glb-label-action="reset" style="border:1px solid rgba(147,197,253,0.28);border-radius:8px;background:#10233d;color:#dbeafe;padding:5px 7px;cursor:pointer;">Reset</button>
      </div>
      <div data-glb-label-diagnostics style="font-size:10px;color:#94a3b8;">collected ${summary.total}</div>
    </div>
  `;

  const current = normalizeVisibility(visibility);
  const updateDiagnostic = (stats = {}) => {
    const diag = panel.querySelector('[data-glb-label-diagnostics]');
    if (!diag) return;
    diag.textContent = `collected ${summary.total}; visible ${stats.visible ?? labelGroup.userData?.glbLabelVisibleCount ?? 0}; hidden ${stats.hidden ?? labelGroup.userData?.glbLabelHiddenCount ?? 0}`;
  };

  const commit = (next) => {
    const normalized = normalizeVisibility(next);
    writeGlbLabelVisibility(normalized);
    const stats = applyGlbLabelVisibility(labelGroup, normalized);
    panel.querySelectorAll('[data-glb-label-toggle]').forEach((input) => {
      const key = input.getAttribute('data-glb-label-toggle');
      input.checked = normalized[key] !== false;
    });
    updateDiagnostic(stats);
  };

  panel.querySelectorAll('[data-glb-label-toggle]').forEach((input) => {
    input.addEventListener('change', () => {
      current[input.getAttribute('data-glb-label-toggle')] = input.checked;
      commit(current);
    });
  });
  panel.querySelector('[data-glb-label-action="all"]')?.addEventListener('click', () => {
    for (const [key] of LABEL_TOGGLE_DEFS) current[key] = true;
    commit(current);
  });
  panel.querySelector('[data-glb-label-action="none"]')?.addEventListener('click', () => {
    for (const [key] of LABEL_TOGGLE_DEFS) current[key] = false;
    commit(current);
  });
  panel.querySelector('[data-glb-label-action="reset"]')?.addEventListener('click', () => {
    Object.assign(current, DEFAULT_GLB_LABEL_VISIBILITY);
    commit(current);
  });
  panel.querySelector('[data-glb-label-panel-toggle]')?.addEventListener('click', () => {
    const collapsed = panel.dataset.collapsed !== 'true';
    writePanelCollapsed(collapsed);
    setPanelCollapsed(panel, collapsed);
  });

  makePanelDraggable(panel);
  setPanelCollapsed(panel, readPanelCollapsed());
  updateDiagnostic();
  return panel;
}

export function installGlbLabelOverlay(root, labelGroup, options = {}) {
  clearGlbLabels(labelGroup);
  if (!labelGroup) return [];

  const labels = collectGlbLabelAnchors(root, options);
  const offsetY = Number.isFinite(Number(options.offsetY)) ? Number(options.offsetY) : 8;
  const visibility = normalizeVisibility(options.labelVisibility || readGlbLabelVisibility());

  for (const label of labels) {
    const obj = new CSS2DObject(makeLabelElement(label.text, label.kind));
    obj.position.copy(label.position);
    obj.position.y += offsetY;
    obj.center?.set?.(0.5, 1.25);
    obj.userData = {
      type: 'glb-userdata-label',
      labelText: label.text,
      labelKind: label.kind,
      sourceName: label.sourceName,
      sourceId: label.sourceId,
    };
    labelGroup.add(obj);
  }

  const summary = summarizeGlbLabels(labels);
  const visibilityStats = applyGlbLabelVisibility(labelGroup, visibility);
  ensureGlbLabelTogglePanel(labelGroup, labels, visibilityStats.visibility);

  labelGroup.userData = {
    ...(labelGroup.userData || {}),
    glbLabelSummary: summary,
    glbLabelCollectedCount: labels.length,
    glbLabelVisibleCount: visibilityStats.visible,
    glbLabelHiddenCount: visibilityStats.hidden,
  };
  root.userData = {
    ...(root.userData || {}),
    glbLabelSummary: summary,
    glbLabelVisibility: visibilityStats.visibility,
    glbLabelCollectedCount: labels.length,
    glbLabelVisibleCount: visibilityStats.visible,
    glbLabelHiddenCount: visibilityStats.hidden,
  };

  return labels;
}
