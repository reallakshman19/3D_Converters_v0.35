/**
 * Functionality: download helpers for XML, JSON and CSV artifacts.
 * Parameters: explicit. Outputs: browser file download. No side effects.
 */

/**
 * Trigger a browser download of a text file.
 * @param {string} filename
 * @param {string} content
 * @param {string} mimeType
 */
export function downloadText(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download enriched XML file.
 * @param {string} stem  — base filename without extension
 * @param {string} xmlText
 */
export function downloadXml(stem, xmlText) {
  downloadText(`${stem}_enriched.xml`, xmlText, 'application/xml;charset=utf-8');
}

/**
 * Download audit as JSON.
 * @param {string} stem
 * @param {Object} audit
 */
export function downloadAudit(stem, audit) {
  downloadText(`${stem}_audit.json`, JSON.stringify(audit, null, 2), 'application/json;charset=utf-8');
}

/**
 * Convert audit issues to CSV string and download.
 * @param {string} stem
 * @param {Object} audit
 */
export function downloadTraceCsv(stem, records) {
  const COLS = ['XML_NODE', 'TYPE', 'NAME', 'POS', 'BORE', 'RATING', 'WALL', 'CORR', 'WEIGHT', 'RESTRAINT', 'DTXR_POS', 'CONCAT'];
  const headers = ['BRANCH', ...COLS];
  
  const rows = (records || []).map(rec => {
    const res = rec.resolved || {};
    const dtxrPos = String(rec.attrs?.DTXR_POS || rec.dtxr || '');
    const concatVals = [rec.attrs?.DTXR_POS, rec.dtxr, rec.attrs?.RAW_TYPE].filter(Boolean).join('|');
    let fmtRestraint = '';
    if (Array.isArray(res.restraint)) {
      fmtRestraint = res.restraint.map(r => typeof r === 'object' && r !== null ? (r.type || r.kind) : r).join(' + ');
    } else {
      fmtRestraint = typeof res.restraint === 'object' && res.restraint !== null ? (res.restraint.type || res.restraint.kind) : res.restraint;
    }
    
    let posStr = '';
    if (rec.attrs && (rec.attrs.POS || rec.attrs.APOS || rec.attrs.LPOS)) {
      const p = rec.attrs.POS || rec.attrs.APOS || rec.attrs.LPOS;
      if (typeof p === 'object') {
        posStr = `${p.x?.toFixed(1)}, ${p.y?.toFixed(1)}, ${p.z?.toFixed(1)}`;
      } else {
        posStr = String(p);
      }
    }

    return [
      rec.branchName || '/UNMAPPED',
      rec.xmlNodeNum != null ? rec.xmlNodeNum : '',
      rec.componentType || '',
      rec.name || '',
      posStr,
      rec.boreMm != null ? `${rec.boreMm}mm` : '',
      res.rating || '',
      res.wallMm || '',
      res.corrMm || '',
      res.weightKg || '',
      fmtRestraint || '',
      dtxrPos,
      concatVals
    ];
  });

  const csvLines = [
    headers.join(','),
    ...rows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')),
  ];
  downloadText(`${stem}_trace.csv`, csvLines.join('\n'), 'text/csv;charset=utf-8');
}

/**
 * Derive a safe filename stem from a file name.
 * @param {string} fileName
 * @returns {string}
 */
export function safeStem(fileName) {
  return String(fileName || 'stagedjson')
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    || 'stagedjson';
}
