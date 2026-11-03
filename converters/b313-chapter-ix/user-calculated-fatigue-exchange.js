export const USER_CALCULATED_FATIGUE_EXCHANGE_SCHEMA = 'b313-ch9-user-calculated-fatigue-exchange/v1';

export const USER_CALCULATED_FATIGUE_CSV_COLUMNS = Object.freeze([
  'cycleId',
  'locationId',
  'fromStateId',
  'toStateId',
  'userAlternatingStressIntensityMpa',
  'equivalentAlternatingStressMpa',
  'permissibleCycles',
  'code',
  'edition',
  'methodRef',
  'calculationRef',
  'calculatedBy',
  'checkedBy',
  'checkedAt',
  'associatedMeanStressMpa',
  'beta',
  'saPrimeMpa',
]);

function text(value) {
  return String(value ?? '').trim();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function optionalNumber(value, field, rowNumber) {
  if (value === undefined || value === null || text(value) === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`CSV row ${rowNumber}: ${field} must be numeric when supplied.`);
  return number;
}

function requiredNumber(value, field, rowNumber) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`CSV row ${rowNumber}: ${field} must be numeric.`);
  return number;
}

function encodeCsvCell(value) {
  if (value === undefined || value === null) return '';
  const raw = String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function parseCsvRows(csvText) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(csvText ?? '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (quoted) throw new TypeError('CSV contains an unterminated quoted field.');
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => text(value) !== ''));
}

function externalResultFromRecord(record, rowNumber) {
  const result = {
    cycleId: text(record.cycleId),
    locationId: text(record.locationId),
    fromStateId: text(record.fromStateId),
    toStateId: text(record.toStateId),
    equivalentAlternatingStressMpa: requiredNumber(record.equivalentAlternatingStressMpa, 'equivalentAlternatingStressMpa', rowNumber),
    calculationBasis: {
      code: text(record.code),
      edition: text(record.edition),
      methodRef: text(record.methodRef),
      calculationRef: text(record.calculationRef),
      calculatedBy: text(record.calculatedBy),
    },
  };
  const optional = {
    userAlternatingStressIntensityMpa: optionalNumber(record.userAlternatingStressIntensityMpa, 'userAlternatingStressIntensityMpa', rowNumber),
    permissibleCycles: optionalNumber(record.permissibleCycles, 'permissibleCycles', rowNumber),
    associatedMeanStressMpa: optionalNumber(record.associatedMeanStressMpa, 'associatedMeanStressMpa', rowNumber),
    beta: optionalNumber(record.beta, 'beta', rowNumber),
    saPrimeMpa: optionalNumber(record.saPrimeMpa, 'saPrimeMpa', rowNumber),
  };
  for (const [key, value] of Object.entries(optional)) if (value !== undefined) result[key] = value;
  if (text(record.checkedBy)) result.calculationBasis.checkedBy = text(record.checkedBy);
  if (text(record.checkedAt)) result.calculationBasis.checkedAt = text(record.checkedAt);
  return result;
}

function recordFromExternalResult(row) {
  return {
    cycleId: row.cycleId ?? '',
    locationId: row.locationId ?? '',
    fromStateId: row.fromStateId ?? '',
    toStateId: row.toStateId ?? '',
    userAlternatingStressIntensityMpa: row.userAlternatingStressIntensityMpa ?? '',
    equivalentAlternatingStressMpa: row.equivalentAlternatingStressMpa ?? '',
    permissibleCycles: row.permissibleCycles ?? '',
    code: row.calculationBasis?.code ?? '',
    edition: row.calculationBasis?.edition ?? '',
    methodRef: row.calculationBasis?.methodRef ?? '',
    calculationRef: row.calculationBasis?.calculationRef ?? '',
    calculatedBy: row.calculationBasis?.calculatedBy ?? '',
    checkedBy: row.calculationBasis?.checkedBy ?? '',
    checkedAt: row.calculationBasis?.checkedAt ?? '',
    associatedMeanStressMpa: row.associatedMeanStressMpa ?? '',
    beta: row.beta ?? '',
    saPrimeMpa: row.saPrimeMpa ?? '',
  };
}

export function parseUserCalculatedFatigueCsv(csvText) {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) throw new TypeError('CSV must contain a header and at least one data row.');
  const headers = rows[0].map(text);
  for (const required of ['cycleId', 'locationId', 'fromStateId', 'toStateId', 'equivalentAlternatingStressMpa', 'code', 'edition', 'methodRef', 'calculationRef', 'calculatedBy']) {
    if (!headers.includes(required)) throw new TypeError(`CSV missing required column ${required}.`);
  }
  const records = rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
  return records.map((record, index) => externalResultFromRecord(record, index + 2));
}

export function serializeUserCalculatedFatigueCsv(externalResults = []) {
  if (!Array.isArray(externalResults)) throw new TypeError('externalResults must be an array.');
  const lines = [USER_CALCULATED_FATIGUE_CSV_COLUMNS.join(',')];
  for (const row of externalResults) {
    const record = recordFromExternalResult(row ?? {});
    lines.push(USER_CALCULATED_FATIGUE_CSV_COLUMNS.map((column) => encodeCsvCell(record[column])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function createUserCalculatedFatigueExchangePackage({
  outsideDiameterMm,
  effectiveWallMm,
  spectrum,
  states,
  transitions,
  externalResults,
  generatedAt = new Date().toISOString(),
} = {}) {
  return {
    schema: USER_CALCULATED_FATIGUE_EXCHANGE_SCHEMA,
    generatedAt,
    calculationMode: 'USER_CALCULATED_KD3',
    authority: {
      nativeCoreKd3Qualified: false,
      codeCompliance: false,
      canUseForDesignAuthority: false,
    },
    geometry: {
      outsideDiameterMm,
      effectiveWallMm,
    },
    spectrum: clone(spectrum),
    states: clone(states ?? []),
    transitions: clone(transitions ?? []),
    externalResults: clone(externalResults ?? []),
  };
}

export function validateUserCalculatedFatigueExchangePackage(pkg) {
  const errors = [];
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return { ok: false, errors: ['Exchange package must be an object.'] };
  if (pkg.schema !== USER_CALCULATED_FATIGUE_EXCHANGE_SCHEMA) errors.push(`Unsupported exchange schema ${pkg.schema || '(missing)'}.`);
  if (pkg.calculationMode !== 'USER_CALCULATED_KD3') errors.push('calculationMode must be USER_CALCULATED_KD3.');
  if (!(Number.isFinite(pkg.geometry?.outsideDiameterMm) && pkg.geometry.outsideDiameterMm > 0)) errors.push('geometry.outsideDiameterMm must be finite and > 0.');
  if (!(Number.isFinite(pkg.geometry?.effectiveWallMm) && pkg.geometry.effectiveWallMm > 0)) errors.push('geometry.effectiveWallMm must be finite and > 0.');
  if (!pkg.spectrum || typeof pkg.spectrum !== 'object' || Array.isArray(pkg.spectrum)) errors.push('spectrum must be an object.');
  if (!Array.isArray(pkg.states) || !pkg.states.length) errors.push('states must contain at least one operating state.');
  if (!Array.isArray(pkg.transitions) || !pkg.transitions.length) errors.push('transitions must contain at least one cycle transition.');
  if (!Array.isArray(pkg.externalResults) || !pkg.externalResults.length) errors.push('externalResults must contain at least one external KD-3 row.');
  if (pkg.authority?.nativeCoreKd3Qualified !== false) errors.push('authority.nativeCoreKd3Qualified must remain false.');
  if (pkg.authority?.codeCompliance !== false) errors.push('authority.codeCompliance must remain false.');
  if (pkg.authority?.canUseForDesignAuthority !== false) errors.push('authority.canUseForDesignAuthority must remain false.');
  return { ok: errors.length === 0, errors };
}

export function parseUserCalculatedFatigueJson(jsonText) {
  let pkg;
  try {
    pkg = JSON.parse(String(jsonText ?? ''));
  } catch (error) {
    throw new TypeError(`Invalid JSON: ${error.message}`);
  }
  const validation = validateUserCalculatedFatigueExchangePackage(pkg);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  return clone(pkg);
}

export function serializeUserCalculatedFatigueJson(pkg) {
  const validation = validateUserCalculatedFatigueExchangePackage(pkg);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  return `${JSON.stringify(pkg, null, 2)}\n`;
}
