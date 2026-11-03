export function computeTableWidth(columns, widthMap = {}) {
  return columns.reduce((sum, col) => {
    return sum + (Number(widthMap[col.id]) || col.width || 100);
  }, 0);
}

export function loadColumnWidths(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveColumnWidths(storageKey, widths) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {}
}

export function renderColGroup(columns, widthMap = {}) {
  return `
    <colgroup>
      ${columns.map((col) => {
        const width = Number(widthMap[col.id]) || col.width;
        return `<col data-col-id="${col.id}" style="width:${width}px;">`;
      }).join('')}
    </colgroup>
  `;
}

export function attachColumnResizers(table, columns, { storageKey }) {
  if (!table) return;
  const widths = loadColumnWidths(storageKey);

  // Set initial table width
  table.style.width = `${computeTableWidth(columns, widths)}px`;

  table.querySelectorAll('[data-resize-col]').forEach((handle) => {
    const colId = handle.dataset.resizeCol;
    const colDef = columns.find((col) => col.id === colId);
    if (!colDef) return;

    // Double-click to reset width
    handle.addEventListener('dblclick', (e) => {
      e.preventDefault();
      delete widths[colId];
      saveColumnWidths(storageKey, widths);
      const colGroup = table.querySelector('colgroup');
      const colEl = colGroup?.querySelector(`col[data-col-id="${colId}"]`);
      if (colEl) colEl.style.width = `${colDef.width}px`;
      table.style.width = `${computeTableWidth(columns, widths)}px`;
    });

    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const colGroup = table.querySelector('colgroup');
      const colEl = colGroup?.querySelector(`col[data-col-id="${colId}"]`);
      if (!colEl) return;
      const startWidth = colEl.getBoundingClientRect().width || colDef.width;

      handle.setPointerCapture(event.pointerId);

      function onMove(moveEvent) {
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.max(colDef.minWidth || 60, Math.round(startWidth + delta));
        widths[colId] = nextWidth;
        colEl.style.width = `${nextWidth}px`;
        table.style.width = `${computeTableWidth(columns, widths)}px`;
      }

      function onUp() {
        saveColumnWidths(storageKey, widths);
        handle.releasePointerCapture(event.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
      }

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
  });
}
