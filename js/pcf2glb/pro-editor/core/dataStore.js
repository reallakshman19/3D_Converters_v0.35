const listeners = new Set();
let table = {};

export function loadDataTable(rows = []) {
  const newTable = {};
  for (const row of rows) {
    if (!row || row.id === undefined || row.id === null) continue;
    newTable[String(row.id)] = { ...row };
  }
  table = newTable;
  listeners.forEach((fn) => {
    try { fn(); } catch (err) { console.warn('DataStore listener error', err); }
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
  listeners.forEach((fn) => {
    try { fn(); } catch (err) { console.warn('DataStore listener error', err); }
  });
}

export function onChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.ProGlbDataStore = {
    loadDataTable,
    getRow,
    setRowField,
    onChange,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadDataTable,
    getRow,
    setRowField,
    onChange,
  };
}
