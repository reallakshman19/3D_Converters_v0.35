/**
 * RvmValveWeightMapper.js
 *
 * Maps CA8 weight using key:
 * component type + convertedBore + rating/pipingClass + length.
 *
 * Applies to:
 * - VALVE
 * - FLANGE
 *
 * Ambiguous/no-match cases are not guessed here. They are reported through
 * ambiguousWeightRequests and handled by RvmMasterResolutionWorkflow popup.
 */

const SUPPORTED_TYPES = new Set(['VALVE', 'FLANGE']);
const LENGTH_TOLERANCE_MM = 4;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeRating(value) {
  return upper(value).replace(/#/g, '');
}

function getWeightRows(masters) {
  if (Array.isArray(masters?.valveWeightMaster)) return masters.valveWeightMaster;
  if (Array.isArray(masters?.weight)) return masters.weight;
  if (Array.isArray(masters?.weight?.rows)) return masters.weight.rows;
  return [];
}

function getBore(row) {
  return (
    toNumber(row.boreMm) ??
    toNumber(row.convertedBore) ??
    toNumber(row['Converted Bore']) ??
    toNumber(row.bore) ??
    toNumber(row.Bore) ??
    toNumber(row.DN) ??
    toNumber(row.NB) ??
    toNumber(row._raw?.['Converted Bore']) ??
    toNumber(row._raw?.DN) ??
    toNumber(row._raw?.NB)
  );
}

function getRating(row) {
  return clean(
    row.ratingClass ??
    row.rating ??
    row.Rating ??
    row.RATING ??
    row.Class ??
    row.CLASS ??
    row['Pressure Class'] ??
    row._raw?.Rating ??
    row._raw?.RATING ??
    row._raw?.Class ??
    row._raw?.['Pressure Class'] ??
    ''
  );
}

function getLength(row) {
  return (
    toNumber(row.lengthMm) ??
    toNumber(row.length) ??
    toNumber(row.Length) ??
    toNumber(row['Length (RF-F/F)']) ??
    toNumber(row['RF-F/F']) ??
    toNumber(row.LEN) ??
    toNumber(row.faceToFace) ??
    toNumber(row._raw?.['Length (RF-F/F)']) ??
    toNumber(row._raw?.['RF-F/F']) ??
    toNumber(row._raw?.Length)
  );
}

function getWeight(row) {
  return (
    toNumber(row.valveWeight) ??
    toNumber(row.directWeight) ??
    toNumber(row.weight) ??
    toNumber(row.Weight) ??
    toNumber(row['RF/RTJ KG']) ??
    toNumber(row['Valve Weight']) ??
    toNumber(row._raw?.['RF/RTJ KG']) ??
    toNumber(row._raw?.['Valve Weight']) ??
    toNumber(row._raw?.Weight)
  );
}

function getDescription(row) {
  return clean(
    row.valveType ??
    row.componentType ??
    row.description ??
    row.Description ??
    row['Type Description'] ??
    row['Valve Type'] ??
    row.Type ??
    row._raw?.['Type Description'] ??
    row._raw?.['Valve Type'] ??
    row._raw?.Type ??
    ''
  );
}

import { applyWeightCa8UnitsToRow } from './RvmLineListUnitDetector.js';

export class RvmValveWeightMapper {
  constructor(masters = {}) {
    this._master = getWeightRows(masters);
  }

  _parsePoint(value) {
    if (!value) return null;

    if (Array.isArray(value) && value.length >= 3) {
      const [x, y, z] = value;
      if ([x, y, z].every(v => Number.isFinite(Number(v)))) {
        return { x: Number(x), y: Number(y), z: Number(z) };
      }
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      const x = value.x ?? value.X;
      const y = value.y ?? value.Y;
      const z = value.z ?? value.Z;

      if ([x, y, z].every(v => Number.isFinite(Number(v)))) {
        return { x: Number(x), y: Number(y), z: Number(z) };
      }
    }

    return null;
  }

  _resolveLength(row) {
    const attrs = row.attributes || {};

    const direct =
      toNumber(row.lengthMm) ??
      toNumber(row.length) ??
      toNumber(row.len) ??
      toNumber(attrs.lengthMm) ??
      toNumber(attrs.length) ??
      toNumber(attrs.len) ??
      toNumber(attrs.axisLength);

    if (direct != null) return direct;

    if (attrs.lenAxis) {
      const nested = toNumber(attrs.lenAxis.len1) ?? toNumber(attrs.lenAxis.length);
      if (nested != null) return nested;
    }

    const ep1 =
      this._parsePoint(row.ep1) ??
      this._parsePoint(attrs.ep1) ??
      this._parsePoint(attrs.EP1) ??
      this._parsePoint(attrs.APOS) ??
      this._parsePoint(attrs.A_POS) ??
      this._parsePoint(attrs.START);

    const ep2 =
      this._parsePoint(row.ep2) ??
      this._parsePoint(attrs.ep2) ??
      this._parsePoint(attrs.EP2) ??
      this._parsePoint(attrs.LPOS) ??
      this._parsePoint(attrs.L_POS) ??
      this._parsePoint(attrs.END);

    if (ep1 && ep2) {
      const dx = ep2.x - ep1.x;
      const dy = ep2.y - ep1.y;
      const dz = ep2.z - ep1.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    return null;
  }

  findWeightCandidates({ boreMm, ratingClass, lengthMm }) {
    const ratingNorm = normalizeRating(ratingClass);

    return this._master
      .map(row => {
        const bore = getBore(row);
        const rating = getRating(row);
        const length = getLength(row);
        const weight = getWeight(row);
        const description = getDescription(row);

        const boreOk = bore != null && Math.abs(bore - boreMm) < 1;
        const ratingOk = normalizeRating(rating) === ratingNorm;
        const lengthDelta = length == null ? Infinity : Math.abs(length - lengthMm);
        const lengthOk = lengthDelta <= LENGTH_TOLERANCE_MM;

        return {
          ...row,
          boreMm: bore,
          ratingClass: rating,
          lengthMm: length,
          valveWeight: weight,
          weight,
          description,
          lengthDelta,
          qualityOk: row.qualityOk !== false,
          _matchOk: boreOk && ratingOk && lengthOk && row.qualityOk !== false
        };
      })
      .filter(row => row._matchOk);
  }

  mapRow(row) {
    const result = {
      valveWeightSource: null,
      valveWeightLengthMm: null,
      ambiguousValveWeightRequests: [],
      weightCandidates: [],
      weightKey: null
    };

    const type = upper(row.type);

    if (!SUPPORTED_TYPES.has(type)) {
      return result;
    }

    const boreMm = toNumber(row.convertedBore);
    const ratingClass =
      row.rating ??
      row.ratingClass ??
      row.pipingClass ??
      row.attributes?.rating ??
      row.attributes?.RATING ??
      row.attributes?.ratingClass ??
      null;

    const lengthMm = this._resolveLength(row);

    result.valveWeightLengthMm = lengthMm;
    result.weightKey = `${type}|${normalizeRating(ratingClass)}|DN${boreMm ?? 'NA'}|L${lengthMm != null ? Math.round(lengthMm) : 'NA'}`;

    if (boreMm == null || ratingClass == null || clean(ratingClass) === '' || lengthMm == null) {
      result.valveWeightSource = 'WM-WEIGHT-KEY-INCOMPLETE';

      if (!Array.isArray(row.diagnostics)) row.diagnostics = [];
      row.diagnostics.push('WM-WEIGHT-KEY-INCOMPLETE');

      return result;
    }

    const candidates = this.findWeightCandidates({ boreMm, ratingClass, lengthMm });
    result.weightCandidates = candidates;

    if (candidates.length === 1) {
      const candidate = candidates[0];

      applyWeightCa8UnitsToRow({
        row,
        weightValue: candidate.valveWeight ?? candidate.directWeight ?? candidate.weight,
        header: 'Weight',
        diagnostics: row.diagnostics || []
      });

      result.valveWeightSource = 'WM-WEIGHT-CA8-MATCH';

      if (!Array.isArray(row.diagnostics)) row.diagnostics = [];
      row.diagnostics.push('WM-WEIGHT-CA8-MATCH');

      return result;
    }

    if (candidates.length > 1) {
      result.ambiguousValveWeightRequests.push({
        rowNo: row.rowNo,
        type,
        boreMm,
        ratingClass,
        lengthMm,
        weightKey: result.weightKey,
        candidates
      });

      result.valveWeightSource = 'WM-WEIGHT-CA8-AMBIGUOUS';

      if (!Array.isArray(row.diagnostics)) row.diagnostics = [];
      row.diagnostics.push('WM-WEIGHT-CA8-AMBIGUOUS');

      return result;
    }

    result.valveWeightSource = 'WM-WEIGHT-CA8-NO-MATCH';

    if (!Array.isArray(row.diagnostics)) row.diagnostics = [];
    row.diagnostics.push('WM-WEIGHT-CA8-NO-MATCH');

    return result;
  }
}
