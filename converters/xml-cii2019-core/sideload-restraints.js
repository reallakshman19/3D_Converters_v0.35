import {
  resolveXmlCiiNodeNumber,
  resolveXmlCiiPsToNode,
  resolveXmlCiiPositionToNode,
} from './sideload-resolver.js';
import { makeXmlCiiMatchedFact, makeXmlCiiRejectedFact } from './sideload-ledger.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

export function normalizeXmlCiiManualRestraint(value) {
  const key = text(value).toUpperCase().replace(/[\s_-]+/g, '');
  const map = {
    REST: 'REST',
    RESTRAINT: 'REST',
    GUIDE: 'GUIDE',
    GUID: 'GUIDE',
    LINESTOP: 'LINESTOP',
    LINSTOP: 'LINESTOP',
    LSTOP: 'LINESTOP',
    LS: 'LINESTOP',
    LIMIT: 'LINESTOP',
    ANCHOR: 'ANCHOR',
    ANC: 'ANCHOR',
    ANCI: 'ANCHOR',
    HANGER: 'HANGER',
    HANG: 'HANGER',
    SPRING: 'SPRING',
    SPR: 'SPRING',
    '+Y': '+Y',
    '-Y': '-Y',
    '+X': '+X',
    '-X': '-X',
    '+Z': '+Z',
    '-Z': '-Z',
    X: 'X',
    Y: 'Y',
    Z: 'Z',
    RX: 'RX',
    RY: 'RY',
    RZ: 'RZ',
  };
  return map[key] || '';
}

export function parseXmlCiiManualRestraintRows(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const rows = [];

  for (let i = 0; i < lines.length; i += 1) {
    const rowNo = i + 1;
    const rawLine = lines[i];
    if (/^node\s*\|/i.test(rawLine)) continue;

    if (rawLine.includes('|')) {
      const [nodeRaw = '', psRaw = '', posRaw = '', restraintRaw = '', note = ''] = rawLine.split('|').map((part) => part.trim());
      rows.push({ rowNo, rawLine, nodeRaw, psRaw, posRaw, restraintRaw, note });
      continue;
    }

    const coord = rawLine.match(/^((?:[-+]?\d+(?:\.\d+)?[\s,]+){2}[-+]?\d+(?:\.\d+)?)(?:\s+)(.+)$/);
    if (coord) {
      rows.push({ rowNo, rawLine, nodeRaw: '', psRaw: '', posRaw: coord[1], restraintRaw: coord[2] });
      continue;
    }

    const loose = rawLine.match(/^(\S+)\s+(.+)$/);
    if (!loose) {
      rows.push({ rowNo, rawLine, error: 'COULD_NOT_PARSE' });
      continue;
    }
    const key = loose[1];
    rows.push({
      rowNo,
      rawLine,
      nodeRaw: /^\d+$/.test(key) ? key : '',
      psRaw: /^\d+$/.test(key) ? '' : key,
      posRaw: '',
      restraintRaw: loose[2],
    });
  }

  return rows;
}

export function resolveManualRestraintRow(row, resolverIndex, options = {}) {
  if (row.error) {
    return makeXmlCiiRejectedFact({
      source: 'MANUAL_SIDELOAD',
      itemType: 'RESTRAINT',
      basis: '',
      key: row.rawLine,
      value: '',
      status: row.error,
      meta: { rowNo: row.rowNo, rawLine: row.rawLine },
    });
  }

  const value = normalizeXmlCiiManualRestraint(row.restraintRaw);
  if (!value) {
    return makeXmlCiiRejectedFact({
      source: 'MANUAL_SIDELOAD',
      itemType: 'RESTRAINT',
      basis: '',
      key: row.rawLine,
      value: row.restraintRaw,
      status: 'ERROR_UNKNOWN_RESTRAINT',
      errors: [`Unknown restraint: ${row.restraintRaw}`],
      meta: { rowNo: row.rowNo, rawLine: row.rawLine },
    });
  }

  let basis = '';
  let result = null;
  if (text(row.nodeRaw)) {
    basis = 'NODE';
    result = resolveXmlCiiNodeNumber(resolverIndex, row.nodeRaw);
  } else if (text(row.psRaw)) {
    basis = 'PS';
    result = resolveXmlCiiPsToNode(resolverIndex, row.psRaw);
  } else if (text(row.posRaw)) {
    basis = 'POS';
    result = resolveXmlCiiPositionToNode(resolverIndex, row.posRaw, options);
  } else {
    return makeXmlCiiRejectedFact({
      source: 'MANUAL_SIDELOAD',
      itemType: 'RESTRAINT',
      basis: '',
      key: row.rawLine,
      value,
      status: 'ERROR_NO_TARGET',
      meta: { rowNo: row.rowNo, rawLine: row.rawLine },
    });
  }

  if (!result?.resolvedNodeNumber || !String(result.status || '').startsWith('OK')) {
    return makeXmlCiiRejectedFact({
      source: 'MANUAL_SIDELOAD',
      itemType: 'RESTRAINT',
      basis,
      key: row.nodeRaw || row.psRaw || row.posRaw || row.rawLine,
      value,
      status: result?.status || 'UNRESOLVED',
      meta: { rowNo: row.rowNo, rawLine: row.rawLine, resolver: result },
    });
  }

  return makeXmlCiiMatchedFact({
    source: 'MANUAL_SIDELOAD',
    itemType: 'RESTRAINT',
    basis,
    key: row.nodeRaw || row.psRaw || row.posRaw,
    resolvedNodeNumber: result.resolvedNodeNumber,
    resolvedNodeName: result.resolvedNodeName,
    value,
    action: 'ADD_IF_MISSING',
    meta: { rowNo: row.rowNo, rawLine: row.rawLine, resolver: result },
  });
}

export function resolveManualRestraintRows(rawText, resolverIndex, options = {}) {
  const rows = parseXmlCiiManualRestraintRows(rawText);
  const facts = rows.map((row) => resolveManualRestraintRow(row, resolverIndex, options));
  return {
    rows,
    matchedFacts: facts.filter((fact) => fact.status === 'MATCHED'),
    rejectedFacts: facts.filter((fact) => fact.status !== 'MATCHED'),
  };
}
