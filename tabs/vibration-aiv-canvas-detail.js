function detailTabs(button) {
  const detail = button?.closest?.('[data-aiv-canvas-assumption-detail]');
  const tabs = [...(detail?.querySelectorAll?.('[data-aiv-detail-tab]') ?? [])];
  return { detail, tabs };
}

export function activateAivCanvasDetailTab(button, focus = false) {
  const { detail, tabs } = detailTabs(button);
  const tab = button?.dataset?.aivDetailTab;
  if (!detail || !tab) return false;
  for (const item of tabs) {
    const selected = item.dataset.aivDetailTab === tab;
    item.setAttribute('aria-selected', selected ? 'true' : 'false');
    item.setAttribute('tabindex', selected ? '0' : '-1');
  }
  for (const panel of detail.querySelectorAll('[data-aiv-detail-panel]')) {
    panel.hidden = panel.dataset.aivDetailPanel !== tab;
  }
  if (focus) button.focus?.();
  return true;
}

export function moveAivCanvasDetailTab(button, key) {
  const { tabs } = detailTabs(button);
  const index = tabs.indexOf(button);
  if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return false;
  let next = index;
  if (key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
  if (key === 'ArrowRight') next = (index + 1) % tabs.length;
  if (key === 'Home') next = 0;
  if (key === 'End') next = tabs.length - 1;
  return activateAivCanvasDetailTab(tabs[next], true);
}