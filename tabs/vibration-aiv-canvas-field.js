function text(value) { return String(value ?? '').trim(); }
function encoded(value) { return encodeURIComponent(text(value)); }

export function aivCanvasFieldKey(tableKind, rowIndex, column) {
  const kind = text(tableKind); const row = Number(rowIndex); const name = text(column);
  if (!kind || !Number.isInteger(row) || row < 0 || !name) return null;
  return `${kind}:${row}:${encodeURIComponent(name)}`;
}

export function aivCanvasNetworkNodeFieldKey(nodeId, path) {
  const id = text(nodeId); const field = text(path);
  return id && field ? `network-node:${encoded(id)}:${encoded(field)}` : null;
}

export function aivCanvasNetworkSegmentFieldKey(segmentId, field) {
  const id = text(segmentId); const name = text(field);
  return id && name ? `network-segment:${encoded(id)}:${encoded(name)}` : null;
}

function fieldCandidates(container, key) {
  return [...container.querySelectorAll('[data-aiv-field-key],[data-aiv-engineering-field-key]')]
    .filter((element) => text(element.dataset.aivFieldKey || element.dataset.aivEngineeringFieldKey) === key)
    .sort((a, b) => Number(Boolean(b.closest('[data-aiv-canvas-selected-detail]')))
      - Number(Boolean(a.closest('[data-aiv-canvas-selected-detail]'))));
}
function activateEditPanel(element) {
  const panel = element?.closest?.('[data-aiv-detail-panel]'); if (!panel?.hidden) return;
  const detail = panel.closest('[data-aiv-canvas-assumption-detail]'); if (!detail) { panel.hidden = false; return; }
  const id = text(panel.dataset.aivDetailPanel);
  for (const item of detail.querySelectorAll('[data-aiv-detail-panel]')) item.hidden = text(item.dataset.aivDetailPanel) !== id;
  for (const tab of detail.querySelectorAll('[data-aiv-detail-tab]')) {
    const selected = text(tab.dataset.aivDetailTab) === id;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false'); tab.setAttribute('tabindex', selected ? '0' : '-1');
  }
}
function revealElement(element) {
  if (!element) return;
  activateEditPanel(element);
  const details = element.closest?.('details');
  if (details) details.open = true;
}
function linkedCanvasText(container, key) {
  return [...container.querySelectorAll('[data-aiv-canvas-field-keys]')].filter((element) =>
    text(element.dataset.aivCanvasFieldKeys).split('|').filter(Boolean).includes(key));
}

export function clearAivCanvasFieldHighlight(container) {
  for (const element of container.querySelectorAll('[data-aiv-field-highlight]')) {
    element.removeAttribute('data-aiv-field-highlight'); element.style.fontWeight = ''; element.style.textDecoration = '';
  }
}

export function applyAivCanvasFieldHighlight(container, fieldKey) {
  const key = text(fieldKey); clearAivCanvasFieldHighlight(container); if (!key) return false;
  const values = linkedCanvasText(container, key);
  for (const element of values) {
    element.dataset.aivFieldHighlight = 'true'; element.style.fontWeight = '700'; element.style.textDecoration = 'underline';
  }
  return values.length > 0;
}

export function flashAivCanvasField(container, fieldKey, durationMs = 1200) {
  const key = text(fieldKey); if (!key || !applyAivCanvasFieldHighlight(container, key)) return false;
  const timer = globalThis.setTimeout?.(() => {
    const focused = container.ownerDocument?.activeElement;
    const activeKey = text(focused?.dataset?.aivFieldKey || focused?.dataset?.aivEngineeringFieldKey);
    if (activeKey !== key) clearAivCanvasFieldHighlight(container);
  }, Math.max(0, Number(durationMs) || 0));
  timer?.unref?.();
  return true;
}

export function focusAivCanvasField(container, fieldKey) {
  const key = text(fieldKey); if (!key) return false;
  const input = fieldCandidates(container, key)[0]; if (!input) return false;
  revealElement(input); input.scrollIntoView?.({ block: 'center', inline: 'nearest' }); input.focus?.();
  applyAivCanvasFieldHighlight(container, key); return true;
}

export function openAivWorkingTable(container, tableKind, selectionKey = '') {
  const kind = text(tableKind); if (!kind) return false;
  const disclosure = container.querySelector('[data-aiv-disclosure-key="working-data-tables"]'); if (disclosure) disclosure.open = true;
  const rows = [...container.querySelectorAll(`[data-aiv-table-row-kind="${kind}"]`)];
  const key = text(selectionKey); const row = rows.find((item) => key && text(item.dataset.aivSelectionKey) === key) ?? rows[0];
  row?.scrollIntoView?.({ block: 'center', inline: 'nearest' }); return Boolean(disclosure || row);
}
