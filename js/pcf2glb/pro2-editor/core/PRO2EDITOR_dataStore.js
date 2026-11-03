// PRO2 Editor canonical datatable store.
//
// This module is intentionally self-contained so the second-generation editor can
// evolve independently from the existing Pro GLB editor. The API is minimal and
// stable: loadDataTable(), getRow(), setRowField(), onChange().

const listeners = new Set();
let table = {};

export function loadDataTable(rows = []) {
  const next = {};
  for (const row of rows) {
    if (!row || row.id === undefined || row.id === null) continue;
    next[String(row.id)] = { ...row };
  }
  table = next;
  listeners.forEach(fn => {
    try { fn(); } catch (err) { console.warn('PRO2EDITOR_dataStore listener error', err); }
  });
}

export function getRow(id) {
  return table[String(id)];
}

export function setRowField(id, key, value) {
  const rowId = String(id);
  const row = table[rowId] || { id: rowId };
  row[key] = value;
  table[rowId] = row;
  listeners.forEach(fn => {
    try { fn(); } catch (err) { console.warn('PRO2EDITOR_dataStore listener error', err); }
  });
}

export function onChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.PRO2EDITOR_DataStore = {
    loadDataTable,
    getRow,
    setRowField,
    onChange,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadDataTable, getRow, setRowField, onChange };
}
