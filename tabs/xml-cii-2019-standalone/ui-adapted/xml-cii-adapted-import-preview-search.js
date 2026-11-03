import { normalizeLineListRow } from '../../../converters/xml-cii2019-core/linelist-mapping.js';
import { MASTER_FIELDS } from './xml-cii-adapted-fields-config.js';

function text(value, fallback = '') {
  const out = String(value ?? '').trim();
  return out || fallback;
}

function mappedFieldMap(masterKey, state) {
  let config = {};
  try {
    config = JSON.parse(state.supportConfigJson || '{}');
  } catch {}
  const configKey = MASTER_FIELDS[masterKey]?.configKey;
  return config[configKey]?.fieldMap || {};
}

function readMappedValue(row, keys) {
  for (const key of keys) {
    const value = key ? row?.[key] : '';
    if (text(value)) return text(value);
  }
  return '';
}

function normalizePreviewSearchRow(row, masterKey, state, index) {
  if (masterKey !== 'lineList') return row;
  const fieldMap = mappedFieldMap(masterKey, state);
  const normalized = row?.lineNoKey || row?.lineNo || row?.lineKey || row?.lineSeqNo
    ? row : normalizeLineListRow(row, fieldMap, index);
  const raw = normalized?._raw || row;
  return {
    ...normalized,
    lineKey1: text(normalized?.lineKey1) || readMappedValue(raw, [fieldMap.lineKey1, 'lineKey1', 'Service', 'SERVICE']),
    lineKey2: text(normalized?.lineKey2) || readMappedValue(raw, [fieldMap.lineKey2, 'lineKey2', 'Line number', 'Line Number']),
    lineSeqNo: text(normalized?.lineSeqNo) || readMappedValue(raw, [fieldMap.lineSeqNo, 'lineSeqNo', 'Line number', 'Line Number']),
  };
}

export function buildPreviewSearchRows(master, state) {
  const rows = Array.isArray(master.rows)
    ? master.rows.map((row, index) => normalizePreviewSearchRow(row, master.key, state, index)) : [];
  const rawRows = Array.isArray(state.masterContext?.rawRows?.[master.key])
    ? state.masterContext.rawRows[master.key] : [];
  const normalizedRawRows = rawRows.map((row, index) => normalizePreviewSearchRow(row, master.key, state, index));
  return rows.length ? rows : normalizedRawRows;
}

export function previewSearchText(row) {
  const values = Object.entries(row || {})
    .filter(([key]) => !key.startsWith('_'))
    .map(([, value]) => text(value));
  const composites = [
    `${text(row?.lineKey1)}${text(row?.lineSeqNo)}`,
    `${text(row?.lineKey1)}${text(row?.lineNoKey)}`,
    `${text(row?.lineKey1)}${text(row?.lineKey2)}`,
    text(row?.lineNoKey),
    text(row?.lineNo),
    text(row?.lineKey),
  ];
  return [...values, ...composites].join(' ').toLowerCase();
}
