function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function rowIsVisible(row) {
  return row && row.style?.display !== 'none' && row.hidden !== true;
}

export function selectAllModeASmartMapRows(dialog) {
  if (!dialog) return { selected: 0, withoutTarget: 0 };
  let selected = 0;
  let withoutTarget = 0;
  for (const checkbox of dialog.querySelectorAll('[data-smart-map-use]')) {
    const row = checkbox.closest('tr');
    if (!rowIsVisible(row)) continue;
    const target = row?.querySelector('[data-smart-map-value]');
    if (!text(target?.value)) withoutTarget += 1;
    if (!checkbox.checked) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    selected += 1;
  }
  return { selected, withoutTarget };
}

function enhanceDialog(dialog) {
  if (!dialog || dialog.dataset.modeASmartMapSelectAll === 'true') return false;
  const title = [...dialog.querySelectorAll('h3')].find((node) => /Smart Map — Unmapped Lines/i.test(text(node.textContent)));
  if (!title) return false;
  const reset = [...dialog.querySelectorAll('button')].find((button) => /Reset Suggestions/i.test(text(button.textContent)));
  const controls = reset?.parentElement;
  if (!controls) return false;

  const selectAll = document.createElement('button');
  selectAll.type = 'button';
  selectAll.textContent = 'Select All';
  selectAll.title = 'Select all currently visible Smart Map rows. This does not invent Map To values; selected unresolved rows must still be assigned before Apply.';
  Object.assign(selectAll.style, {
    padding: '5px 9px', border: '1px solid #475569', borderRadius: '5px',
    background: '#172033', color: '#e2e8f0', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap',
  });
  selectAll.addEventListener('click', () => selectAllModeASmartMapRows(dialog));
  controls.insertBefore(selectAll, reset);
  dialog.dataset.modeASmartMapSelectAll = 'true';
  return true;
}

export function installModeASmartMapSelectAll(panel) {
  if (!panel || panel.dataset.modeASmartMapSelectAllBound === 'true') return false;
  panel.dataset.modeASmartMapSelectAllBound = 'true';
  panel.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button');
    if (!button || !(/Smart Map/i.test(text(button.textContent)) || text(button.textContent) === '✨')) return;
    const install = () => {
      const dialogs = [...document.querySelectorAll('dialog')].reverse();
      const dialog = dialogs.find((item) => [...item.querySelectorAll('h3')].some((node) => /Smart Map — Unmapped Lines/i.test(text(node.textContent))));
      enhanceDialog(dialog);
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(install);
    else setTimeout(install, 0);
  });
  return true;
}
