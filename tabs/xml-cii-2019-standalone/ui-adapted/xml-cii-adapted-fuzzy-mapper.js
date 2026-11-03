import {
  readXmlCiiExplicitBoreMm,
  resolveXmlCiiBoreMmFromNps,
} from '../../../converters/xml-cii2019-core/nps-bore-resolver.js';

function _toText(value) { return String(value ?? '').trim(); }
function _xmlCiiNormalizeHeader(value) { return _toText(value).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function _xmlCiiWordTokens(value) { return _toText(value).toUpperCase().split(/[^A-Z0-9]+/).map((token) => token.trim()).filter(Boolean); }

function _xmlCiiHeaderScore(header, aliases) {
  const headerText = _toText(header);
  const normalizedHeader = _xmlCiiNormalizeHeader(headerText);
  if (!normalizedHeader) return 0;
  let bestScore = 0;
  for (let aliasIndex = 0; aliasIndex < (aliases || []).length; aliasIndex += 1) {
    const aliasText = _toText(aliases[aliasIndex]);
    const normalizedAlias = _xmlCiiNormalizeHeader(aliasText);
    const exactScore = aliasIndex === 0 ? 120 : 100;
    if (!normalizedAlias) continue;
    if (normalizedHeader === normalizedAlias) bestScore = Math.max(bestScore, exactScore);
    else if (normalizedHeader.startsWith(normalizedAlias) || normalizedAlias.startsWith(normalizedHeader)) bestScore = Math.max(bestScore, 78);
    else if (normalizedHeader.includes(normalizedAlias) || normalizedAlias.includes(normalizedHeader)) bestScore = Math.max(bestScore, 68);
    const aliasTokens = _xmlCiiWordTokens(aliasText);
    const headerTokens = _xmlCiiWordTokens(headerText);
    const matches = aliasTokens.filter((token) => headerTokens.includes(token)).length;
    if (aliasTokens.length && matches) bestScore = Math.max(bestScore, Math.round((matches / aliasTokens.length) * 62));
  }
  return bestScore;
}

const _XML_CII_LABEL_ROW_KEYWORDS = Object.freeze({
  lineSeqNo: ['line number', 'line no', 'line no.', 'seq', 'sequence', 'lineno'],
  lineKey1: ['service', 'line key', 'key 1', 'key1', 'area'],
  lineKey2: ['line number', 'line no', 'key 2', 'key2'],
  pipingClass: ['piping class', 'piping_class', 'class', 'spec', 'pipe class'],
  rating: ['rating', 'pressure class', 'class rating', 'pressure rating', 'press rating', 'press. rating', 'class/rating', 'rating/class'],
  material: ['material', 'material_name', 'material name'],
  nps: ['nps', 'nps in', 'nominal pipe size', 'size nps', 'nominal size'],
  convertedBore: ['bore mm', 'converted bore', 'dn', 'nb', 'nominal bore'],
  p1: ['p1', 'design pr', 'design pressure', 'operating pressure', 'design cond', 'p1 / design pressure', 'pressure max'],
  t1: ['t1', 'design temp', 'design temperature', 'operating temp', 't1 (c)', 't1 (ºc)', 'temp max', 'temp max c', 'temp max ºc'],
  t2: ['t2', 'temp', 'temperature', 't2 (c)', 't2 (ºc)', 'temp. c', 'temp. ºc'],
  t3: ['t3', 'temp min', 'minimum temp', 'min temp', 'temperature min', 'min', 't3 (c)', 't3 (ºc)', 'temp min c', 'temp min ºc'],
  insThk: ['insulation', 'ins thk', 'insthk', 'insulation thickness'],
  densityMixed: ['mixed', 'density mixed', 'mixed kg', 'mixed density', 'mixed kg/m3', 'mixed kg/m³'],
  densityGas: ['gas kg', 'density gas', 'gas density', 'gas kg/m3', 'gas kg/m³'],
  densityLiquid: ['liquid kg', 'density liquid', 'liquid kg/m3', 'liquid kg/m³'],
  phase: ['phase', 'fluid phase', 'medium phase'],
  hydroPressure: ['hydropressure', 'hydro test pressure', 'hydrotest pressure', 'hydro pressure', 'test pressure', 'hydro/test pressure'],
});

function _xmlCiiLabelRowHint(header, rawRows) {
  if (!_toText(header).startsWith('__EMPTY')) return {};
  const scores = {};
  for (let rowIndex = 0; rowIndex < Math.min(3, rawRows.length); rowIndex += 1) {
    const cellText = _toText(rawRows[rowIndex]?.[header]).toLowerCase();
    if (!cellText || cellText.length > 60) continue;
    for (const [fieldName, keywords] of Object.entries(_XML_CII_LABEL_ROW_KEYWORDS)) {
      for (const keyword of keywords) {
        if (cellText !== keyword && !cellText.includes(keyword) && !keyword.includes(cellText)) continue;
        let score = rowIndex === 0 ? 110 : (rowIndex === 1 ? 90 : 75);
        score += cellText === keyword ? 30 : Math.min(keyword.length, 30);
        if (!scores[fieldName] || score > scores[fieldName]) scores[fieldName] = score;
      }
    }
  }
  return scores;
}

function _xmlCiiDataValueScore(header, fieldName, rawRows) {
  if (!_toText(header).startsWith('__EMPTY')) return 0;
  const values = [];
  for (const row of rawRows) {
    if (values.length >= 8) break;
    const value = _toText(row?.[header]);
    if (value && value !== header) values.push(value);
  }
  if (!values.length) return 0;
  const inRange = (value, low, high) => {
    const numeric = Number(String(value).replace(/"$/, ''));
    return Number.isFinite(numeric) && numeric >= low && numeric <= high;
  };
  const passRate = (test) => values.filter(test).length / values.length;
  switch (fieldName) {
    case 'lineSeqNo': return Math.round(passRate((value) => /^\d[A-Z0-9]{3,11}$/i.test(value)) * 70);
    case 'lineKey1': return Math.round(passRate((value) => /^[A-Z]{1,6}$/.test(value)) * 72);
    case 'lineKey2': return Math.round(passRate((value) => /^\d{5,10}$/.test(value)) * 72);
    case 'pipingClass': return Math.round(passRate((value) => /^[A-Z0-9]{1,4}[/-]?[A-Z0-9]{0,6}$/i.test(value) && value.length >= 2 && value.length <= 10 && Number.isNaN(Number(value))) * 68);
    case 'material': return Math.round(passRate((value) => /^[A-Z]{1,4}[A-Z0-9]{0,8}$/i.test(value) && Number.isNaN(Number(value)) && value.length >= 2) * 65);
    case 'nps': return Math.round(passRate((value) => inRange(value, 0.25, 80)) * 68);
    case 'convertedBore': return Math.round(passRate((value) => inRange(value, 6, 2000)) * 65);
    case 'p1': return Math.round(passRate((value) => inRange(value, 0, 1000)) * 62);
    case 't1':
    case 't2':
    case 't3': return Math.round(passRate((value) => inRange(value, -200, 800)) * 62);
    case 'insThk': return Math.round(passRate((value) => inRange(value, 0, 500)) * 60);
    case 'densityMixed':
    case 'densityGas':
    case 'densityLiquid': return Math.round(passRate((value) => inRange(value, 0.01, 2000)) * 60);
    case 'phase': {
      const phases = new Set(['g', 'l', 'm', 'gas', 'liquid', 'mixed', '2p', 'liq', 'vap', 'vapour', 'vapor']);
      const rate = passRate((value) => phases.has(value.toLowerCase()));
      return rate >= 0.8 ? Math.round(rate * 75) : 0;
    }
    case 'rating': {
      const known = new Set(['150', '300', '600', '900', '1500', '2500']);
      return Math.round(passRate((value) => known.has(value.replace(/cl|pn|#/gi, '').trim()) || /^(cl|pn)?\s*(\d{2,4})$/i.test(value)) * 62);
    }
    default: return 0;
  }
}

function preparePipingClassBoreColumns(headers, fields, rawRows) {
  const workingHeaders = [...(headers || [])];
  const isPipingClass = fields.some((field) => field.name === 'nps') && fields.some((field) => field.name === 'convertedBore');
  if (!isPipingClass || !rawRows.length) return workingHeaders;
  const npsField = fields.find((field) => field.name === 'nps');
  const npsHeader = workingHeaders
    .map((header) => ({ header, score: _xmlCiiHeaderScore(header, npsField?.aliases || []) }))
    .sort((left, right) => right.score - left.score)[0];
  if (!npsHeader || npsHeader.score < 60) return workingHeaders;
  for (const row of rawRows) {
    const rawNps = _toText(row?.[npsHeader.header]);
    if (rawNps && !_toText(row['NPS (in)'])) row['NPS (in)'] = rawNps;
    const explicit = readXmlCiiExplicitBoreMm(row);
    const derived = explicit ?? resolveXmlCiiBoreMmFromNps(rawNps);
    if (derived != null) row['Bore (mm)'] = derived;
  }
  if (!workingHeaders.includes('NPS (in)')) workingHeaders.push('NPS (in)');
  if (!workingHeaders.includes('Bore (mm)')) workingHeaders.push('Bore (mm)');
  return workingHeaders;
}

export function fuzzyAutoMapFields(headers, fields, rawRows) {
  const safeRows = Array.isArray(rawRows) ? rawRows : [];
  const workingHeaders = preparePipingClassBoreColumns(headers, fields, safeRows);
  const mapped = {};
  const claimed = new Set();
  const canShare = (fieldName, header) => fieldName === 'lineKey2' && mapped.lineSeqNo === header;
  for (const field of fields) {
    let bestHeader = '';
    let bestScore = 0;
    for (const header of workingHeaders) {
      const headerText = _toText(header).toUpperCase();
      if (field.name === 'pipingClass' && headerText === 'CONSTRUCTION CLASS') continue;
      const score = _xmlCiiHeaderScore(header, field.aliases);
      if (score > bestScore) { bestHeader = header; bestScore = score; }
    }
    mapped[field.name] = bestScore >= 60 ? bestHeader : '';
    if (mapped[field.name]) claimed.add(mapped[field.name]);
  }
  if (!safeRows.length) return mapped;
  const labelHints = {};
  for (const header of workingHeaders) if (_toText(header).startsWith('__EMPTY')) labelHints[header] = _xmlCiiLabelRowHint(header, safeRows);
  for (const field of fields) {
    if (mapped[field.name]) continue;
    let bestHeader = '';
    let bestScore = 0;
    for (const header of workingHeaders) {
      if (!_toText(header).startsWith('__EMPTY') || (claimed.has(header) && !canShare(field.name, header))) continue;
      const score = labelHints[header]?.[field.name] || 0;
      if (score > bestScore) { bestHeader = header; bestScore = score; }
    }
    if (bestScore >= 60) { mapped[field.name] = bestHeader; claimed.add(bestHeader); }
  }
  for (const field of fields) {
    if (mapped[field.name]) continue;
    let bestHeader = '';
    let bestScore = 0;
    for (const header of workingHeaders) {
      if (!_toText(header).startsWith('__EMPTY') || (claimed.has(header) && !canShare(field.name, header))) continue;
      const score = _xmlCiiDataValueScore(header, field.name, safeRows);
      if (score > bestScore) { bestHeader = header; bestScore = score; }
    }
    if (bestScore >= 60) { mapped[field.name] = bestHeader; claimed.add(bestHeader); }
  }
  return mapped;
}
