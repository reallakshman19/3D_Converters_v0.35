export const AIV_CANVAS_SHOW_MODE = Object.freeze({ CURRENT: 'CURRENT', ALL: 'ALL' });

function text(value) { return String(value ?? '').trim(); }
function values(items) { return [...new Set(items.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function esc(value) { return text(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }

export function aivCanvasProjectionFilterOptions(projection = {}) {
  const cases = values([
    ...(projection.nodes ?? []).flatMap((node) => node.caseIds ?? (node.caseId ? [node.caseId] : [])),
    ...(projection.relationships ?? []).map((item) => item.caseId),
  ]);
  const lines = values([
    ...(projection.nodes ?? []).map((node) => node.line),
    ...(projection.relationships ?? []).map((item) => item.line),
  ]);
  return Object.freeze({ cases: Object.freeze(cases), lines: Object.freeze(lines) });
}

export function renderAivCanvasFilterControls(projection) {
  const options = aivCanvasProjectionFilterOptions(projection);
  const cases = options.cases.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join('');
  const lines = options.lines.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join('');
  return `<div class="aiv-canvas-filter-controls" role="group" aria-label="AIV canvas filters">
    <label>Operating Case <select data-aiv-canvas-filter="case"${options.cases.length ? '' : ' disabled'}>${cases || '<option value="">No cases</option>'}</select></label>
    <label>Line <select data-aiv-canvas-filter="line"><option value="">All lines</option>${lines}</select></label>
    <label>Show <select data-aiv-canvas-filter="show"><option value="CURRENT">Current case</option><option value="ALL">All cases</option></select></label>
  </div>`;
}

export function createAivCanvasFilterState(input = {}, options = {}) {
  input = input ?? {};
  const cases = values(options.cases ?? []);
  const lines = values(options.lines ?? []);
  const requestedCase = text(input.caseId);
  const requestedLine = text(input.line);
  const showMode = input.showMode === AIV_CANVAS_SHOW_MODE.ALL ? AIV_CANVAS_SHOW_MODE.ALL : AIV_CANVAS_SHOW_MODE.CURRENT;
  return Object.freeze({
    showMode: cases.length ? showMode : AIV_CANVAS_SHOW_MODE.ALL,
    caseId: cases.includes(requestedCase) ? requestedCase : cases[0] ?? null,
    line: lines.includes(requestedLine) ? requestedLine : null,
  });
}

function split(value) { return text(value).split('|').map(text).filter(Boolean); }

export function aivCanvasElementMatchesFilters(element, state = {}) {
  const elementCases = split(element?.dataset?.aivCanvasCases);
  const elementLine = text(element?.dataset?.aivCanvasLine);
  const line = text(state.line);
  const caseId = text(state.caseId);
  const showMode = state.showMode === AIV_CANVAS_SHOW_MODE.ALL ? AIV_CANVAS_SHOW_MODE.ALL : AIV_CANVAS_SHOW_MODE.CURRENT;
  if (line && elementLine !== line) return false;
  if (showMode === AIV_CANVAS_SHOW_MODE.CURRENT && caseId && elementCases.length && !elementCases.includes(caseId)) return false;
  return true;
}

function optionValues(select) {
  return [...(select?.options ?? [])].map((option) => text(option.value)).filter(Boolean);
}

export function aivCanvasFilterOptionsFromContainer(container) {
  return Object.freeze({
    cases: Object.freeze(optionValues(container.querySelector('[data-aiv-canvas-filter="case"]'))),
    lines: Object.freeze(optionValues(container.querySelector('[data-aiv-canvas-filter="line"]'))),
  });
}

export function syncAivCanvasFilterControls(container, state) {
  const caseSelect = container.querySelector('[data-aiv-canvas-filter="case"]');
  const lineSelect = container.querySelector('[data-aiv-canvas-filter="line"]');
  const showSelect = container.querySelector('[data-aiv-canvas-filter="show"]');
  if (caseSelect && state.caseId) caseSelect.value = state.caseId;
  if (lineSelect) lineSelect.value = state.line ?? '';
  if (showSelect) showSelect.value = state.showMode;
}

export function applyAivCanvasDomFilters(container, state) {
  let filteredSelection = false;
  for (const element of container.querySelectorAll('[data-aiv-filterable]')) {
    const visible = aivCanvasElementMatchesFilters(element, state);
    element.classList.toggle('is-filtered', !visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (!visible && element.classList.contains('is-selected')) filteredSelection = true;
  }
  return Object.freeze({ filteredSelection });
}

export function createAivCanvasFilterController(container, { onSelectionFiltered = () => {} } = {}) {
  let state = null;
  function sync() {
    const options = aivCanvasFilterOptionsFromContainer(container);
    state = createAivCanvasFilterState(state, options);
    syncAivCanvasFilterControls(container, state);
    if (applyAivCanvasDomFilters(container, state).filteredSelection) onSelectionFiltered();
  }
  function change(event) {
    const kind = event.target?.dataset?.aivCanvasFilter;
    if (!kind) return;
    const next = { ...(state ?? {}) };
    if (kind === 'case') next.caseId = event.target.value;
    if (kind === 'line') next.line = event.target.value;
    if (kind === 'show') next.showMode = event.target.value;
    state = createAivCanvasFilterState(next, aivCanvasFilterOptionsFromContainer(container));
    syncAivCanvasFilterControls(container, state);
    if (applyAivCanvasDomFilters(container, state).filteredSelection) onSelectionFiltered();
  }
  container.addEventListener('change', change);
  return Object.freeze({ sync, getState: () => state, destroy: () => container.removeEventListener('change', change) });
}
