function text(value) {
  return String(value ?? '').trim();
}

function entriesByDataset(container, selector, datasetKey, projector) {
  return [...(container?.querySelectorAll?.(selector) ?? [])]
    .map((element) => {
      const key = text(element?.dataset?.[datasetKey]);
      return key ? projector(element, key) : null;
    })
    .filter(Boolean);
}

export function aivUiFocusKey(element) {
  const dataset = element?.dataset ?? {};
  if (dataset.aivTableCell) {
    return ['table', dataset.aivTableCell, dataset.aivEditRow, dataset.aivEditColumn]
      .map(text).join(':');
  }
  if (dataset.aivAssumption) return `assumption:${text(dataset.aivAssumption)}`;
  return null;
}

function disclosureState(container) {
  return entriesByDataset(
    container,
    '[data-aiv-disclosure-key]',
    'aivDisclosureKey',
    (element, key) => Object.freeze({ key, open: element.open === true }),
  );
}

function scrollState(container) {
  return entriesByDataset(
    container,
    '[data-aiv-scroll-key]',
    'aivScrollKey',
    (element, key) => Object.freeze({
      key,
      top: Number(element.scrollTop) || 0,
      left: Number(element.scrollLeft) || 0,
    }),
  );
}

function detailTabState(container) {
  const detail = [...(container?.querySelectorAll?.('[data-aiv-canvas-assumption-detail]') ?? [])]
    .find((element) => element.hidden !== true);
  if (!detail) return null;
  const tab = [...(detail.querySelectorAll?.('[data-aiv-detail-tab]') ?? [])]
    .find((element) => element.getAttribute?.('aria-selected') === 'true');
  const detailKey = text(detail.dataset?.aivCanvasAssumptionDetail);
  const tabId = text(tab?.dataset?.aivDetailTab);
  return detailKey && tabId ? Object.freeze({ detailKey, tabId }) : null;
}

export function captureAivUiContext(container, activeElement = globalThis.document?.activeElement ?? null) {
  const focusKey = container?.contains?.(activeElement) ? aivUiFocusKey(activeElement) : null;
  return Object.freeze({
    disclosures: Object.freeze(disclosureState(container)),
    scroll: Object.freeze(scrollState(container)),
    detailTab: detailTabState(container),
    focusKey,
  });
}

function findByDataset(container, selector, datasetKey, key) {
  return [...(container?.querySelectorAll?.(selector) ?? [])]
    .find((element) => text(element?.dataset?.[datasetKey]) === key) ?? null;
}

function restoreDisclosures(container, context) {
  for (const item of context?.disclosures ?? []) {
    const element = findByDataset(container, '[data-aiv-disclosure-key]', 'aivDisclosureKey', item.key);
    if (element) element.open = item.open === true;
  }
}

function restoreDetailTab(container, context) {
  const state = context?.detailTab;
  if (!state) return;
  const detail = findByDataset(
    container,
    '[data-aiv-canvas-assumption-detail]',
    'aivCanvasAssumptionDetail',
    state.detailKey,
  );
  if (!detail || detail.hidden === true) return;
  for (const tab of detail.querySelectorAll?.('[data-aiv-detail-tab]') ?? []) {
    const selected = text(tab.dataset?.aivDetailTab) === state.tabId;
    tab.setAttribute?.('aria-selected', selected ? 'true' : 'false');
    tab.setAttribute?.('tabindex', selected ? '0' : '-1');
  }
  for (const panel of detail.querySelectorAll?.('[data-aiv-detail-panel]') ?? []) {
    panel.hidden = text(panel.dataset?.aivDetailPanel) !== state.tabId;
  }
}

function findFocusElement(container, focusKey) {
  if (!focusKey) return null;
  return [...(container?.querySelectorAll?.('[data-aiv-table-cell],[data-aiv-assumption]') ?? [])]
    .find((element) => aivUiFocusKey(element) === focusKey) ?? null;
}

function restoreFocus(container, context) {
  const element = findFocusElement(container, context?.focusKey);
  if (!element?.focus) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function restoreScroll(container, context) {
  for (const item of context?.scroll ?? []) {
    const element = findByDataset(container, '[data-aiv-scroll-key]', 'aivScrollKey', item.key);
    if (!element) continue;
    element.scrollTop = item.top;
    element.scrollLeft = item.left;
  }
}

export function restoreAivUiContext(container, context) {
  if (!context) return;
  restoreDisclosures(container, context);
  restoreDetailTab(container, context);
  restoreFocus(container, context);
  restoreScroll(container, context);
}