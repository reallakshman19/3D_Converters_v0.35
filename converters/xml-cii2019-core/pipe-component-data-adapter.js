/**
 * pipe-component-data-adapter.js
 * Bridges the vendored pipe-component-data package into the XML→CII(2019)
 * weight/dimension pipelines without changing any existing master row shape.
 */

import { createPipeDataDb } from '../../vendor/create-pipe-data-db.js';

function _text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function _numberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function _provenance(row) {
  return {
    standard: _text(row?.standard),
    source: _text(row?.source),
    datasetVersion: _text(row?.datasetVersion),
    dataStatus: _text(row?.dataStatus),
  };
}

function _weightForValve(valveRow, weightRows) {
  const direct = Number(valveRow?.weightKg);
  if (Number.isFinite(direct)) return direct;

  const match = (weightRows || []).find((row) =>
    _text(row.componentType).toUpperCase() === 'VALVE'
    && _text(row.subtype).toUpperCase() === _text(valveRow?.valveType).toUpperCase()
    && _text(row.nps) === _text(valveRow?.nps)
    && _text(row.classRating) === _text(valveRow?.classRating));
  return match ? _numberOr(match.weightKg, null) : null;
}

/**
 * Build weight-master rows in the same shape as docs/Masters/wtValveweights.json,
 * sourced from the vendored pipe-component-data datasets (valves + componentWeights).
 */
export function buildPipeDataWeightRows(db = createPipeDataDb()) {
  const valves = Array.isArray(db?.datasets?.valves) ? db.datasets.valves : [];
  const weights = Array.isArray(db?.datasets?.componentWeights) ? db.datasets.componentWeights : [];
  const rows = [];

  for (const valve of valves) {
    const weightKg = _weightForValve(valve, weights);
    const ffRfMm = _numberOr(valve.ffRfMm, null);
    if (weightKg === null || ffRfMm === null) continue;

    const valveType = _text(valve.valveType).toUpperCase();
    rows.push({
      Type: valveType,
      TypeDesc: `${valveType} VALVE`,
      NSfraction: _text(valve.nps),
      NS: _numberOr(valve.nps, null),
      DN: _numberOr(valve.dn, null),
      'RF-F/F': ffRfMm,
      'RTJ F/F': _numberOr(valve.ffRtjMm, 0),
      'BW-F/F': _numberOr(valve.ffBwMm, 0),
      'RF/RTJ KG': weightKg,
      'BW KG': 0,
      Rating: _numberOr(valve.classRating, null),
      TypeNum: '',
      boreMm: _numberOr(valve.boreMm, null),
      __source: 'pipe-component-data',
      __provenance: _provenance(valve),
    });
  }

  return rows;
}

function _normalizeRating(value) {
  return _text(value).trim().replace(/#+$/, '').trim();
}

function _normalizeFacing(value) {
  const facing = _text(value).trim().toUpperCase();
  if (!facing) return undefined;
  if (facing === 'RAISED' || facing === 'RAISED FACE') return 'RF';
  if (facing === 'RING' || facing === 'RING JOINT') return 'RTJ';
  return facing;
}

function _queryKind(query) {
  const explicit = _text(query?.type || query?.componentType).trim().toUpperCase();
  if (explicit) return explicit;
  if (_text(query?.valveType).trim()) return 'VALVE';
  if (_text(query?.subtype).trim() && _text(query?.classRating || query?.rating).trim()) return 'FLANGE';
  return 'PIPE';
}

/**
 * Wrap the pipe-component-data dimension lookups behind a single query shape.
 * Returns { ok: true, row, provenance } on hit, or the miss object (ok: false).
 */
export function pipeDataDimensionCandidates(query, db = createPipeDataDb()) {
  const safe = query && typeof query === 'object' ? query : {};
  const nps = safe.nps === undefined || safe.nps === null || safe.nps === '' ? undefined : safe.nps;
  const classRating = _normalizeRating(safe.classRating ?? safe.rating) || undefined;
  const facing = _normalizeFacing(safe.facing);
  const kind = _queryKind(safe);

  let result;
  if (kind === 'FLANGE') {
    result = db.lookupFlange({ subtype: safe.subtype, nps, classRating, facing });
  } else if (kind === 'VALVE') {
    result = db.lookupValve({ valveType: safe.valveType || safe.subtype, nps, classRating, facing });
  } else {
    result = db.lookupPipe({ nps, schedule: safe.schedule });
  }

  if (!result?.ok) return result;
  return { ok: true, row: result.row, matchKey: result.matchKey, provenance: result.provenance };
}
