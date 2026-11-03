function _csvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function _rowsToCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const lines = rows.map((r) => keys.map((k) => _csvCell(r[k])).join(','));
  return [header, ...lines].join('\n');
}

export function downloadText(filename, text) {
  if (typeof document === 'undefined') return;
  // Use octet-stream for non-.txt extensions (e.g. .pcf) so Chrome
  // honours the exact filename instead of appending/replacing with .txt.
  const ext = String(filename).split('.').pop().toLowerCase();
  const mimeType = ext === 'txt' || ext === 'csv' ? 'text/plain;charset=utf-8' : 'application/octet-stream';
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
}

export function downloadJson(filename, obj) {
  downloadText(filename, JSON.stringify(obj, null, 2));
}

export function downloadCsv(filename, rows) {
  downloadText(filename, _rowsToCsv(rows));
}
