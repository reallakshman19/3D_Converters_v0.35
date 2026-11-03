/**
 * RvmLineListUnitDetector.js
 *
 * Detects line-list units, normalizes values, emits CA values with unit text,
 * and produces diagnostics/fallback records.
 *
 * Important:
 * - Does NOT add new PCF fields.
 * - Does NOT add caUnitMeta/unitProfile.
 * - Does NOT trim unit text from CA values.
 * - Writes only existing row.ca['1'], row.ca['2'], row.ca['5'], row.ca['8'], row.ca['10'].
 *
 * CA convention used here:
 * - CA1  p1 pressure        -> kPa
 * - CA2  t1 temperature     -> C
 * - CA5  insulation thk     -> mm
 * - CA8  valve/flange weight -> kg
 * - CA10 hydro pressure     -> kPa
 */

const NPS_TO_DN_MM = Object.freeze({
  '1/8': 6,
  '1/4': 8,
  '3/8': 10,
  '1/2': 15,
  '3/4': 20,
  '1': 25,
  '1-1/4': 32,
  '1-1/2': 40,
  '2': 50,
  '2-1/2': 65,
  '3': 80,
  '4': 100,
  '5': 125,
  '6': 150,
  '8': 200,
  '10': 250,
  '12': 300,
  '14': 350,
  '16': 400,
  '18': 450,
  '20': 500,
  '24': 600,
  '28': 700,
  '30': 750,
  '32': 800,
  '36': 900,
  '40': 1000,
  '42': 1050,
  '48': 1200,
});

const FIELD_DEFAULTS = Object.freeze({
  p1: {
    ca: '1',
    type: 'PRESSURE',
    inputUnit: 'kPa',
    outputUnit: 'kPa',
    diagnosticName: 'CA1/p1',
  },
  t1: {
    ca: '2',
    type: 'TEMPERATURE',
    inputUnit: 'C',
    outputUnit: 'C',
    diagnosticName: 'CA2/t1',
  },
  insThk: {
    ca: '5',
    type: 'LENGTH',
    inputUnit: 'mm',
    outputUnit: 'mm',
    diagnosticName: 'CA5/insThk',
  },
  weight: {
    ca: '8',
    type: 'WEIGHT',
    inputUnit: 'kg',
    outputUnit: 'kg',
    diagnosticName: 'CA8/weight',
  },
  hp: {
    ca: '10',
    type: 'PRESSURE',
    inputUnit: 'kPa',
    outputUnit: 'kPa',
    diagnosticName: 'CA10/hp',
  },
  convertedBore: {
    ca: null,
    type: 'BORE',
    inputUnit: 'NPS_OR_DN',
    outputUnit: 'mm',
    diagnosticName: 'convertedBore',
  },
});

const UNIT_PATTERNS = [
  // Pressure. Keep BARG before BAR.
  { type: 'PRESSURE', unit: 'barg', rx: /\bBAR\s*\(?\s*G\s*\)?\b|\bBARG\b|\bBAR\s*G\b/i },
  { type: 'PRESSURE', unit: 'bar', rx: /\bBAR\b/i },
  { type: 'PRESSURE', unit: 'kPa', rx: /\bKPA\b|\bKILO\s*PASCAL(?:S)?\b/i },
  { type: 'PRESSURE', unit: 'MPa', rx: /\bMPA\b|\bMEGA\s*PASCAL(?:S)?\b/i },
  { type: 'PRESSURE', unit: 'kg/cm2', rx: /\bKG\s*\/\s*CM\s*(?:2|\^2)\b|\bKGF\s*\/\s*CM\s*(?:2|\^2)\b/i },
  { type: 'PRESSURE', unit: 'psi', rx: /\bPSIG\b|\bPSI\b/i },

  // Temperature.
  { type: 'TEMPERATURE', unit: 'C', rx: /\bDEG\s*C\b|\bDEGC\b|°\s*C\b|\bCELSIUS\b|\bCENTIGRADE\b/i },
  { type: 'TEMPERATURE', unit: 'F', rx: /\bDEG\s*F\b|\bDEGF\b|°\s*F\b|\bFAHRENHEIT\b/i },
  { type: 'TEMPERATURE', unit: 'K', rx: /\bKELVIN\b/i },

  // Single C/F/K for temperature only, handled with expected type.
  { type: 'TEMPERATURE', unit: 'C', rx: /(^|[^A-Z])C([^A-Z]|$)/i, expectedOnly: true },
  { type: 'TEMPERATURE', unit: 'F', rx: /(^|[^A-Z])F([^A-Z]|$)/i, expectedOnly: true },
  { type: 'TEMPERATURE', unit: 'K', rx: /(^|[^A-Z])K([^A-Z]|$)/i, expectedOnly: true },

  // Length / thickness.
  { type: 'LENGTH', unit: 'mm', rx: /\bMM\b|\bMILLIMET(?:ER|RE)S?\b/i },
  { type: 'LENGTH', unit: 'inch', rx: /\bINCH(?:ES)?\b|\bIN\b|["″]/i },
  { type: 'LENGTH', unit: 'm', rx: /\bMET(?:ER|RE)S?\b|\bMTRS?\b|\bMETER\b|\bMETRE\b/i },

  // Weight.
  { type: 'WEIGHT', unit: 'kg', rx: /\bKGS?\b|\bKILOGRAMS?\b/i },
  { type: 'WEIGHT', unit: 'lb', rx: /\bLBS?\b|\bPOUNDS?\b/i },
  { type: 'WEIGHT', unit: 'tonne', rx: /\bTONNES?\b|\bMETRIC\s*TON(?:NE)?S?\b/i },

  // Bore.
  { type: 'BORE', unit: 'NPS', rx: /\bNPS\b|\bSIZE\s*\(\s*NPS\s*\)\b|\bPIPE\s*SIZE\b|\bINCH(?:ES)?\b|["″]/i },
  { type: 'BORE', unit: 'DN', rx: /\bDN\b|\bNB\b|\bBORE\s*\(\s*MM\s*\)\b/i },
];

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function safeNumber(value) {
  if (value == null || value === '') return null;

  const text = clean(value)
    .replace(/,/g, '')
    .replace(/[−–—]/g, '-');

  const match = text.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return null;

  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function normalizeUnitToken(unit) {
  const text = upper(unit).replace(/\s+/g, '');

  if (['KPA', 'KILOPASCAL', 'KILOPASCALS'].includes(text)) return 'kPa';
  if (['MPA', 'MEGAPASCAL', 'MEGAPASCALS'].includes(text)) return 'MPa';
  if (['BAR'].includes(text)) return 'bar';
  if (['BARG', 'BAR(G)', 'BARGA', 'BARGUAGE', 'BARGAUGE'].includes(text)) return 'barg';
  if (['PSI', 'PSIG'].includes(text)) return 'psi';
  if (['KG/CM2', 'KG/CM^2', 'KGFCM2', 'KGF/CM2', 'KGF/CM^2'].includes(text)) return 'kg/cm2';

  if (['C', 'DEGC', 'DEG_C', 'CELSIUS', 'CENTIGRADE'].includes(text)) return 'C';
  if (['F', 'DEGF', 'DEG_F', 'FAHRENHEIT'].includes(text)) return 'F';
  if (['K', 'KELVIN'].includes(text)) return 'K';

  if (['MM', 'MILLIMETER', 'MILLIMETERS', 'MILLIMETRE', 'MILLIMETRES'].includes(text)) return 'mm';
  if (['M', 'MTR', 'MTRS', 'METER', 'METERS', 'METRE', 'METRES'].includes(text)) return 'm';
  if (['IN', 'INCH', 'INCHES'].includes(text)) return 'inch';

  if (['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS'].includes(text)) return 'kg';
  if (['LB', 'LBS', 'POUND', 'POUNDS'].includes(text)) return 'tonne';
  if (['TON', 'TONNE', 'TONNES', 'METRICTON', 'METRICTONS'].includes(text)) return 'tonne';

  if (['NPS'].includes(text)) return 'NPS';
  if (['DN', 'NB'].includes(text)) return 'DN';

  return clean(unit);
}

function diag({
  severity = 'INFO',
  code,
  message,
  fieldName = null,
  ca = null,
  rowNo = null,
  pipelineRef = null,
  sourceCanonicalId = null,
  details = {},
}) {
  return {
    severity,
    code,
    message,
    fieldName,
    ca,
    rowNo,
    pipelineRef,
    sourceCanonicalId,
    ...details,
  };
}

function rowContext(row = {}) {
  return {
    rowNo: row.rowNo ?? null,
    pipelineRef: row.pipelineRef ?? null,
    sourceCanonicalId: row.sourceCanonicalId ?? null,
  };
}

function hasExplicitUnitText(text) {
  const value = clean(text);
  if (!value) return false;

  return UNIT_PATTERNS.some(pattern => pattern.rx.test(value));
}

function detectUnitFromText(text, expectedType = null, source = 'TEXT') {
  const value = clean(text);
  if (!value) return null;

  for (const pattern of UNIT_PATTERNS) {
    if (expectedType && pattern.type !== expectedType) continue;
    if (pattern.expectedOnly && !expectedType) continue;

    if (pattern.rx.test(value)) {
      return {
        type: pattern.type,
        unit: pattern.unit,
        normalizedUnit: normalizeUnitToken(pattern.unit),
        source,
        evidence: value,
      };
    }
  }

  return null;
}

function detectUnitFromHeader(header, fieldName) {
  const defaults = FIELD_DEFAULTS[fieldName] || null;
  const expectedType = defaults?.type || null;
  const text = clean(header);

  if (!text) return null;

  const bracketParts = [];
  const bracketRx = /[\[(]([^\])]+)[\])]/g;
  let match;

  while ((match = bracketRx.exec(text)) !== null) {
    bracketParts.push(match[1]);
  }

  for (const part of bracketParts) {
    const unit = detectUnitFromText(part, expectedType, 'HEADER_BRACKET');
    if (unit) return unit;
  }

  return detectUnitFromText(text, expectedType, 'HEADER_TEXT');
}

function detectUnitFromUnitRow(unitRowValue, fieldName) {
  const defaults = FIELD_DEFAULTS[fieldName] || null;
  const expectedType = defaults?.type || null;

  return detectUnitFromText(unitRowValue, expectedType, 'UNIT_ROW');
}

function detectUnitFromSamples(sampleValues = [], fieldName) {
  const defaults = FIELD_DEFAULTS[fieldName] || null;
  const expectedType = defaults?.type || null;
  const hits = new Map();

  for (const value of sampleValues || []) {
    const detected = detectUnitFromText(value, expectedType, 'CELL_VALUE');
    if (!detected) continue;

    const key = `${detected.type}:${detected.normalizedUnit}`;
    const existing = hits.get(key) || {
      ...detected,
      count: 0,
      examples: [],
    };

    existing.count += 1;
    if (existing.examples.length < 5) existing.examples.push(clean(value));
    hits.set(key, existing);
  }

  const sorted = [...hits.values()].sort((a, b) => b.count - a.count);

  return {
    best: sorted[0] || null,
    all: sorted,
    mixed: sorted.length > 1,
  };
}

function valuesDiffer(a, b) {
  if (!a || !b) return false;
  return upper(normalizeUnitToken(a)) !== upper(normalizeUnitToken(b));
}

function unitLabelForOutput(unit) {
  const normalized = normalizeUnitToken(unit);

  if (normalized === 'kPa') return 'kPa';
  if (normalized === 'MPa') return 'MPa';
  if (normalized === 'bar') return 'bar';
  if (normalized === 'barg') return 'barg';
  if (normalized === 'kg/cm2') return 'kg/cm2';
  if (normalized === 'psi') return 'psi';

  if (normalized === 'C') return 'C';
  if (normalized === 'F') return 'F';
  if (normalized === 'K') return 'K';

  if (normalized === 'mm') return 'mm';
  if (normalized === 'm') return 'm';
  if (normalized === 'inch') return 'inch';

  if (normalized === 'kg') return 'kg';
  if (normalized === 'lb') return 'lb';
  if (normalized === 'tonne') return 'tonne';

  return clean(unit);
}

function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '';

  const rounded = Number(Number(value).toFixed(4));
  return String(rounded);
}

function formatValueWithUnit(value, unit) {
  if (value == null || !Number.isFinite(Number(value))) return '';

  const label = unitLabelForOutput(unit);
  return `${formatNumber(value)} ${label}`;
}

function normalizeNpsKey(value) {
  const text = clean(value)
    .replace(/[“”″]/g, '"')
    .replace(/"/g, '')
    .replace(/^NPS/i, '')
    .trim();

  const whole = text.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (whole) {
    return `${Number(whole[1])}-${Number(whole[2])}/${Number(whole[3])}`;
  }

  const frac = text.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    return `${frac[1]}/${frac[2]}`;
  }

  const integer = text.match(/^(\d+(?:\.\d+)?)$/);
  if (integer) {
    const n = Number(integer[1]);
    return Number.isInteger(n) ? String(n) : null;
  }

  return null;
}

function detectBoreSourceLooksNps(header, unitInfo, rawValue) {
  const headerText = upper(header);
  const rawText = clean(rawValue);

  if (unitInfo?.normalizedUnit === 'NPS') return true;
  if (/NPS|SIZE\s*\(\s*NPS\s*\)|PIPE\s*SIZE|INCH|["″]/i.test(headerText)) return true;
  if (/["″]/.test(rawText)) return true;

  return false;
}

function normalizeBoreToMm(rawValue, header = '', unitInfo = null) {
  const raw = clean(rawValue);

  if (!raw) {
    return {
      value: null,
      unit: 'mm',
      status: 'EMPTY',
      rawValue,
    };
  }

  const dnMatch = raw.match(/^DN\s*(\d+(?:\.\d+)?)$/i);
  if (dnMatch) {
    return {
      value: Number(dnMatch[1]),
      unit: 'mm',
      status: 'DN_STRING',
      rawValue,
    };
  }

  const looksNps = detectBoreSourceLooksNps(header, unitInfo, rawValue);
  const npsKey = normalizeNpsKey(raw);

  if (looksNps && npsKey && NPS_TO_DN_MM[npsKey] != null) {
    return {
      value: NPS_TO_DN_MM[npsKey],
      unit: 'mm',
      status: 'NPS_TO_DN_MM',
      rawValue,
    };
  }

  const numeric = safeNumber(raw);

  if (numeric != null) {
    if (looksNps) {
      const numericKey = normalizeNpsKey(String(numeric));
      if (numericKey && NPS_TO_DN_MM[numericKey] != null) {
        return {
          value: NPS_TO_DN_MM[numericKey],
          unit: 'mm',
          status: 'NPS_NUMERIC_TO_DN_MM',
          rawValue,
        };
      }
    }

    return {
      value: numeric,
      unit: 'mm',
      status: 'DN_NUMERIC',
      rawValue,
    };
  }

  return {
    value: null,
    unit: 'mm',
    status: 'UNRESOLVED',
    rawValue,
  };
}

function normalizePressure(value, inputUnit, outputUnit = 'kPa') {
  const n = safeNumber(value);
  if (n == null) return null;

  const unit = normalizeUnitToken(inputUnit);

  let kPa;

  if (unit === 'kPa') kPa = n;
  else if (unit === 'MPa') kPa = n * 1000;
  else if (unit === 'bar') kPa = n * 100;
  else if (unit === 'barg') kPa = n * 100;
  else if (unit === 'kg/cm2') kPa = n * 98.0665;
  else if (unit === 'psi') kPa = n * 6.89476;
  else kPa = n;

  const out = normalizeUnitToken(outputUnit);

  if (out === 'kPa') return kPa;
  if (out === 'MPa') return kPa / 1000;
  if (out === 'bar') return kPa / 100;
  if (out === 'barg') return kPa / 100;
  if (out === 'kg/cm2') return kPa / 98.0665;
  if (out === 'psi') return kPa / 6.89476;

  return kPa;
}

function normalizeTemperature(value, inputUnit, outputUnit = 'C') {
  const n = safeNumber(value);
  if (n == null) return null;

  const unit = normalizeUnitToken(inputUnit);

  let c;

  if (unit === 'C') c = n;
  else if (unit === 'F') c = (n - 32) * 5 / 9;
  else if (unit === 'K') c = n - 273.15;
  else c = n;

  const out = normalizeUnitToken(outputUnit);

  if (out === 'C') return c;
  if (out === 'F') return c * 9 / 5 + 32;
  if (out === 'K') return c + 273.15;

  return c;
}

function normalizeLength(value, inputUnit, outputUnit = 'mm') {
  const n = safeNumber(value);
  if (n == null) return null;

  const unit = normalizeUnitToken(inputUnit);

  let mm;

  if (unit === 'mm') mm = n;
  else if (unit === 'm') mm = n * 1000;
  else if (unit === 'inch') mm = n * 25.4;
  else mm = n;

  const out = normalizeUnitToken(outputUnit);

  if (out === 'mm') return mm;
  if (out === 'm') return mm / 1000;
  if (out === 'inch') return mm / 25.4;

  return mm;
}

function normalizeWeight(value, inputUnit, outputUnit = 'kg') {
  const n = safeNumber(value);
  if (n == null) return null;

  const unit = normalizeUnitToken(inputUnit);

  let kg;

  if (unit === 'kg') kg = n;
  else if (unit === 'lb') kg = n * 0.45359237;
  else if (unit === 'tonne') kg = n * 1000;
  else kg = n;

  const out = normalizeUnitToken(outputUnit);

  if (out === 'kg') return kg;
  if (out === 'lb') return kg / 0.45359237;
  if (out === 'tonne') return kg / 1000;

  return kg;
}

function addSuspiciousMagnitudeDiagnostics({
  diagnostics,
  fieldName,
  inputUnit,
  outputUnit,
  rawValue,
  normalizedValue,
  row,
}) {
  const ctx = rowContext(row);
  const defaults = FIELD_DEFAULTS[fieldName] || {};
  const ca = defaults.ca || null;
  const rawNum = safeNumber(rawValue);
  const input = normalizeUnitToken(inputUnit);
  const output = normalizeUnitToken(outputUnit);

  if (rawNum == null || normalizedValue == null) return;

  if (defaults.type === 'PRESSURE') {
    if (output === 'kPa' && normalizedValue > 0 && normalizedValue < 100) {
      diagnostics.push(
        diag({
          severity: 'WARNING',
          code: 'UNIT-SUSPICIOUS-MAGNITUDE',
          message: `${defaults.diagnosticName} is ${normalizedValue} kPa; check if source was barg/MPa or unit is missing.`,
          fieldName,
          ca,
          ...ctx,
          details: { rawValue, inputUnit: input, outputUnit: output, normalizedValue },
        })
      );
    }

    if ((input === 'bar' || input === 'barg') && rawNum > 500) {
      diagnostics.push(
        diag({
          severity: 'WARNING',
          code: 'UNIT-SUSPICIOUS-MAGNITUDE',
          message: `${defaults.diagnosticName} is ${rawNum} ${input}; value is unusually high.`,
          fieldName,
          ca,
          ...ctx,
          details: { rawValue, inputUnit: input, outputUnit: output, normalizedValue },
        })
      );
    }

    if (input === 'MPa' && rawNum > 100) {
      diagnostics.push(
        diag({
          severity: 'WARNING',
          code: 'UNIT-SUSPICIOUS-MAGNITUDE',
          message: `${defaults.diagnosticName} is ${rawNum} MPa; value is unusually high.`,
          fieldName,
          ca,
          ...ctx,
          details: { rawValue, inputUnit: input, outputUnit: output, normalizedValue },
        })
      );
    }
  }

  if (defaults.type === 'TEMPERATURE') {
    if (output === 'C' && normalizedValue > 700) {
      diagnostics.push(
        diag({
          severity: 'WARNING',
          code: 'UNIT-SUSPICIOUS-MAGNITUDE',
          message: `${defaults.diagnosticName} is ${normalizedValue} C; value is unusually high.`,
          fieldName,
          ca,
          ...ctx,
          details: { rawValue, inputUnit: input, outputUnit: output, normalizedValue },
        })
      );
    }

    if (input === 'K' && rawNum < 100) {
      diagnostics.push(
        diag({
          severity: 'WARNING',
          code: 'UNIT-SUSPICIOUS-MAGNITUDE',
          message: `${defaults.diagnosticName} is ${rawNum} K; value is unusually low.`,
          fieldName,
          ca,
          ...ctx,
          details: { rawValue, inputUnit: input, outputUnit: output, normalizedValue },
        })
      );
    }
  }

  if (defaults.type === 'LENGTH') {
    if (output === 'mm' && normalizedValue > 500) {
      diagnostics.push(
        diag({
          severity: 'WARNING',
          code: 'UNIT-SUSPICIOUS-MAGNITUDE',
          message: `${defaults.diagnosticName} is ${normalizedValue} mm; check insulation thickness.`,
          fieldName,
          ca,
          ...ctx,
          details: { rawValue, inputUnit: input, outputUnit: output, normalizedValue },
        })
      );
    }
  }

  if (defaults.type === 'WEIGHT') {
    if (output === 'kg' && normalizedValue <= 0) {
      diagnostics.push(
        diag({
          severity: 'ERROR',
          code: 'UNIT-SUSPICIOUS-MAGNITUDE',
          message: `${defaults.diagnosticName} is ${normalizedValue} kg; weight must be positive.`,
          fieldName,
          ca,
          ...ctx,
          details: { rawValue, inputUnit: input, outputUnit: output, normalizedValue },
        })
      );
    }
  }
}

function outputUnitForField(fieldName, overrideOutputUnit = null) {
  if (overrideOutputUnit) return normalizeUnitToken(overrideOutputUnit);
  return FIELD_DEFAULTS[fieldName]?.outputUnit || 'UNKNOWN';
}

function readRowValue(row, fieldSpec = {}, fallbackKeys = []) {
  if (!row || typeof row !== 'object') return undefined;

  const keys = [
    fieldSpec.valueKey,
    fieldSpec.key,
    fieldSpec.header,
    fieldSpec.field,
    ...fallbackKeys,
  ].filter(Boolean);

  const rowKeys = Object.keys(row);

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];

    const ci = rowKeys.find(k => upper(k) === upper(key));
    if (ci) return row[ci];
  }

  if (row._raw && typeof row._raw === 'object') {
    const rawKeys = Object.keys(row._raw);

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row._raw, key)) return row._raw[key];

      const ci = rawKeys.find(k => upper(k) === upper(key));
      if (ci) return row._raw[ci];
    }
  }

  return undefined;
}

function resolveUnitForCell({
  fieldName,
  header,
  unitRowValue,
  cellValue,
  sampleValues = [],
  manualUnit = null,
  outputUnit = null,
  diagnostics = [],
  row = {},
}) {
  const defaults = FIELD_DEFAULTS[fieldName] || null;
  const expectedType = defaults?.type || null;
  const ctx = rowContext(row);

  if (manualUnit) {
    const normalized = normalizeUnitToken(manualUnit);

    diagnostics.push(
      diag({
        severity: 'INFO',
        code: 'UNIT-MANUAL-OVERRIDE',
        message: `${defaults?.diagnosticName || fieldName} unit manually set to ${normalized}.`,
        fieldName,
        ca: defaults?.ca || null,
        ...ctx,
        details: { unit: normalized, evidence: manualUnit },
      })
    );

    return {
      type: expectedType || 'UNKNOWN',
      unit: normalized,
      outputUnit: outputUnitForField(fieldName, outputUnit),
      source: 'MANUAL_OVERRIDE',
      evidence: manualUnit,
      confidence: 1,
    };
  }

  const fromHeader = detectUnitFromHeader(header, fieldName);
  const fromUnitRow = detectUnitFromUnitRow(unitRowValue, fieldName);
  const fromCell = detectUnitFromText(cellValue, expectedType, 'CELL_VALUE');
  const fromSamples = detectUnitFromSamples(sampleValues, fieldName);

  if (fromSamples.mixed) {
    diagnostics.push(
      diag({
        severity: 'WARNING',
        code: 'UNIT-MIXED-COLUMN',
        message: `${defaults?.diagnosticName || fieldName} has mixed units in sample values.`,
        fieldName,
        ca: defaults?.ca || null,
        ...ctx,
        details: {
          units: fromSamples.all.map(item => ({
            unit: item.normalizedUnit,
            count: item.count,
            examples: item.examples,
          })),
        },
      })
    );
  }

  if (fromCell) {
    const columnUnit = fromHeader || fromUnitRow || fromSamples.best;

    if (columnUnit && valuesDiffer(columnUnit.normalizedUnit, fromCell.normalizedUnit)) {
      diagnostics.push(
        diag({
          severity: 'WARNING',
          code: 'UNIT-CELL-OVERRIDES-COLUMN',
          message: `${defaults?.diagnosticName || fieldName} cell unit ${fromCell.normalizedUnit} overrides column unit ${columnUnit.normalizedUnit}.`,
          fieldName,
          ca: defaults?.ca || null,
          ...ctx,
          details: {
            cellUnit: fromCell.normalizedUnit,
            columnUnit: columnUnit.normalizedUnit,
            cellEvidence: fromCell.evidence,
            columnEvidence: columnUnit.evidence,
          },
        })
      );
    } else {
      diagnostics.push(
        diag({
          severity: 'INFO',
          code: 'UNIT-CELL-DETECTED',
          message: `${defaults?.diagnosticName || fieldName} unit detected from cell value: ${fromCell.normalizedUnit}.`,
          fieldName,
          ca: defaults?.ca || null,
          ...ctx,
          details: { unit: fromCell.normalizedUnit, evidence: fromCell.evidence },
        })
      );
    }

    return {
      ...fromCell,
      unit: fromCell.normalizedUnit,
      outputUnit: outputUnitForField(fieldName, outputUnit),
      confidence: 0.98,
    };
  }

  if (fromHeader) {
    diagnostics.push(
      diag({
        severity: 'INFO',
        code: 'UNIT-HEADER-DETECTED',
        message: `${defaults?.diagnosticName || fieldName} unit detected from header: ${fromHeader.normalizedUnit}.`,
        fieldName,
        ca: defaults?.ca || null,
        ...ctx,
        details: { unit: fromHeader.normalizedUnit, evidence: fromHeader.evidence },
      })
    );

    return {
      ...fromHeader,
      unit: fromHeader.normalizedUnit,
      outputUnit: outputUnitForField(fieldName, outputUnit),
      confidence: 0.95,
    };
  }

  if (fromUnitRow) {
    diagnostics.push(
      diag({
        severity: 'INFO',
        code: 'UNIT-ROW-DETECTED',
        message: `${defaults?.diagnosticName || fieldName} unit detected from unit row: ${fromUnitRow.normalizedUnit}.`,
        fieldName,
        ca: defaults?.ca || null,
        ...ctx,
        details: { unit: fromUnitRow.normalizedUnit, evidence: fromUnitRow.evidence },
      })
    );

    return {
      ...fromUnitRow,
      unit: fromUnitRow.normalizedUnit,
      outputUnit: outputUnitForField(fieldName, outputUnit),
      confidence: 0.9,
    };
  }

  if (fromSamples.best) {
    diagnostics.push(
      diag({
        severity: 'INFO',
        code: 'UNIT-CELL-DETECTED',
        message: `${defaults?.diagnosticName || fieldName} unit inferred from sample cell values: ${fromSamples.best.normalizedUnit}.`,
        fieldName,
        ca: defaults?.ca || null,
        ...ctx,
        details: {
          unit: fromSamples.best.normalizedUnit,
          count: fromSamples.best.count,
          examples: fromSamples.best.examples,
        },
      })
    );

    return {
      ...fromSamples.best,
      unit: fromSamples.best.normalizedUnit,
      outputUnit: outputUnitForField(fieldName, outputUnit),
      confidence: 0.8,
    };
  }

  if (defaults) {
    diagnostics.push(
      diag({
        severity: 'WARNING',
        code: 'UNIT-FIELD-DEFAULT',
        message: `${defaults.diagnosticName} unit not found; using RMSS default ${defaults.inputUnit}.`,
        fieldName,
        ca: defaults.ca,
        ...ctx,
        details: {
          unit: defaults.inputUnit,
          outputUnit: outputUnitForField(fieldName, outputUnit),
        },
      })
    );

    return {
      type: defaults.type,
      unit: defaults.inputUnit,
      outputUnit: outputUnitForField(fieldName, outputUnit),
      source: 'FIELD_DEFAULT',
      evidence: fieldName,
      confidence: 0.6,
    };
  }

  diagnostics.push(
    diag({
      severity: 'ERROR',
      code: 'UNIT-UNRESOLVED',
      message: `Unit cannot be resolved for unknown field ${fieldName}.`,
      fieldName,
      ca: null,
      ...ctx,
      details: { header, unitRowValue, cellValue },
    })
  );

  return {
    type: 'UNKNOWN',
    unit: 'UNKNOWN',
    outputUnit: 'UNKNOWN',
    source: 'UNRESOLVED',
    evidence: '',
    confidence: 0,
  };
}

function normalizeFieldValue({
  fieldName,
  rawValue,
  unitInfo,
  diagnostics = [],
  row = {},
}) {
  const defaults = FIELD_DEFAULTS[fieldName] || null;
  const ctx = rowContext(row);

  if (!defaults) {
    diagnostics.push(
      diag({
        severity: 'ERROR',
        code: 'UNIT-CONVERSION-FAILED',
        message: `No unit default exists for field ${fieldName}.`,
        fieldName,
        ca: null,
        ...ctx,
        details: { rawValue, unitInfo },
      })
    );

    return null;
  }

  const inputUnit = unitInfo?.unit || defaults.inputUnit;
  const outputUnit = unitInfo?.outputUnit || defaults.outputUnit;

  let value = null;

  if (defaults.type === 'PRESSURE') {
    value = normalizePressure(rawValue, inputUnit, outputUnit);
  } else if (defaults.type === 'TEMPERATURE') {
    value = normalizeTemperature(rawValue, inputUnit, outputUnit);
  } else if (defaults.type === 'LENGTH') {
    value = normalizeLength(rawValue, inputUnit, outputUnit);
  } else if (defaults.type === 'WEIGHT') {
    value = normalizeWeight(rawValue, inputUnit, outputUnit);
  } else if (defaults.type === 'BORE') {
    const bore = normalizeBoreToMm(rawValue, unitInfo?.header || '', unitInfo);
    value = bore.value;
  }

  if (value == null) {
    diagnostics.push(
      diag({
        severity: 'ERROR',
        code: 'UNIT-CONVERSION-FAILED',
        message: `${defaults.diagnosticName} value could not be converted.`,
        fieldName,
        ca: defaults.ca,
        ...ctx,
        details: {
          rawValue,
          inputUnit,
          outputUnit,
          unitSource: unitInfo?.source || 'UNKNOWN',
        },
      })
    );

    return null;
  }

  addSuspiciousMagnitudeDiagnostics({
    diagnostics,
    fieldName,
    inputUnit,
    outputUnit,
    rawValue,
    normalizedValue: value,
    row,
  });

  return value;
}

function ensureRowCa(row) {
  if (!row.ca || typeof row.ca !== 'object') row.ca = {};
  return row.ca;
}

function pushRowDiagnostics(row, diagnostics) {
  if (!row || !diagnostics?.length) return;

  if (!Array.isArray(row.diagnostics)) row.diagnostics = [];

  for (const item of diagnostics) {
    if (item?.code) row.diagnostics.push(item.code);
  }
}

/**
 * Applies CA1/CA2/CA5/CA10 from line-list values.
 *
 * `fieldMap` example:
 * {
 *   p1:     { header: 'P1 (kPa)', valueKey: 'P1', unitRowValue: '', manualUnit: '' },
 *   t1:     { header: 'T1 (C)', valueKey: 'T1' },
 *   insThk: { header: 'Ins Thk (mm)', valueKey: 'InsThk' },
 *   hp:     { header: 'HP (kPa)', valueKey: 'HP' }
 * }
 */
export function applyLineListCaUnitsToRow({
  row,
  lineListRow,
  fieldMap = {},
  diagnostics = [],
} = {}) {
  if (!row || !lineListRow) {
    diagnostics.push(
      diag({
        severity: 'ERROR',
        code: 'UNIT-LINELIST-ROW-MISSING',
        message: 'Cannot apply line-list CA units because row or lineListRow is missing.',
      })
    );

    return { appliedCount: 0, diagnostics };
  }

  const ca = ensureRowCa(row);
  let appliedCount = 0;

  const fields = [
    { fieldName: 'p1', fallbackKeys: ['p1', 'P1', 'CA1', 'Design Pressure', 'Pressure'] },
    { fieldName: 't1', fallbackKeys: ['t1', 'T1', 'CA2', 'Design Temperature', 'Temperature'] },
    { fieldName: 'insThk', fallbackKeys: ['insThk', 'InsThk', 'CA5', 'Insulation Thickness', 'Ins Thk'] },
    { fieldName: 'hp', fallbackKeys: ['hp', 'HP', 'CA10', 'Hydro Pressure', 'Hydrotest Pressure'] },
  ];

  for (const item of fields) {
    const fieldName = item.fieldName;
    const spec = fieldMap[fieldName] || {};
    const rawValue = readRowValue(lineListRow, spec, item.fallbackKeys);

    if (rawValue == null || clean(rawValue) === '') continue;

    const localDiagnostics = [];
    const unitInfo = resolveUnitForCell({
      fieldName,
      header: spec.header || spec.sourceHeader || spec.name || item.fallbackKeys[0],
      unitRowValue: spec.unitRowValue,
      cellValue: rawValue,
      sampleValues: spec.sampleValues || [],
      manualUnit: spec.manualUnit || null,
      outputUnit: spec.outputUnit || null,
      diagnostics: localDiagnostics,
      row,
    });

    const normalizedValue = normalizeFieldValue({
      fieldName,
      rawValue,
      unitInfo,
      diagnostics: localDiagnostics,
      row,
    });

    if (normalizedValue != null) {
      ca[FIELD_DEFAULTS[fieldName].ca] = formatValueWithUnit(normalizedValue, unitInfo.outputUnit);
      appliedCount += 1;
    }

    diagnostics.push(...localDiagnostics);
    pushRowDiagnostics(row, localDiagnostics);
  }

  return { appliedCount, diagnostics };
}

/**
 * Applies CA8 from weight master value.
 *
 * Keeps the unit in the CA field:
 * row.ca['8'] = '125.5 kg'
 */
export function applyWeightCa8UnitsToRow({
  row,
  weightValue,
  header = 'Weight',
  unitRowValue = '',
  sampleValues = [],
  manualUnit = null,
  diagnostics = [],
} = {}) {
  if (!row) {
    diagnostics.push(
      diag({
        severity: 'ERROR',
        code: 'UNIT-WEIGHT-ROW-MISSING',
        message: 'Cannot apply CA8 weight because row is missing.',
      })
    );

    return { applied: false, diagnostics };
  }

  if (weightValue == null || clean(weightValue) === '') {
    diagnostics.push(
      diag({
        severity: 'WARNING',
        code: 'UNIT-WEIGHT-VALUE-MISSING',
        message: 'CA8 weight value is missing.',
        fieldName: 'weight',
        ca: '8',
        ...rowContext(row),
      })
    );

    return { applied: false, diagnostics };
  }

  const ca = ensureRowCa(row);
  const localDiagnostics = [];

  const unitInfo = resolveUnitForCell({
    fieldName: 'weight',
    header,
    unitRowValue,
    cellValue: weightValue,
    sampleValues,
    manualUnit,
    outputUnit: 'kg',
    diagnostics: localDiagnostics,
    row,
  });

  const normalizedValue = normalizeFieldValue({
    fieldName: 'weight',
    rawValue: weightValue,
    unitInfo,
    diagnostics: localDiagnostics,
    row,
  });

  if (normalizedValue != null) {
    ca['8'] = formatValueWithUnit(normalizedValue, 'kg');
    diagnostics.push(...localDiagnostics);
    pushRowDiagnostics(row, localDiagnostics);
    return { applied: true, diagnostics };
  }

  diagnostics.push(...localDiagnostics);
  pushRowDiagnostics(row, localDiagnostics);
  return { applied: false, diagnostics };
}

/**
 * Converts pipe size / bore to DN mm.
 *
 * Does not write CA fields.
 * Writes row.convertedBore only.
 */
export function applyConvertedBoreUnitsToRow({
  row,
  lineListRow,
  fieldSpec = {},
  diagnostics = [],
} = {}) {
  if (!row || !lineListRow) {
    diagnostics.push(
      diag({
        severity: 'ERROR',
        code: 'BORE-LINELIST-ROW-MISSING',
        message: 'Cannot apply converted bore because row or lineListRow is missing.',
      })
    );

    return { applied: false, diagnostics };
  }

  const rawValue = readRowValue(lineListRow, fieldSpec, [
    'convertedBore',
    'Pipe Size',
    'SIZE',
    'NPS',
    'DN',
    'NB',
    'BORE',
  ]);

  if (rawValue == null || clean(rawValue) === '') {
    diagnostics.push(
      diag({
        severity: 'WARNING',
        code: 'BORE-VALUE-MISSING',
        message: 'Pipe size / bore value is missing.',
        fieldName: 'convertedBore',
        ...rowContext(row),
      })
    );

    return { applied: false, diagnostics };
  }

  const localDiagnostics = [];

  const unitInfo = resolveUnitForCell({
    fieldName: 'convertedBore',
    header: fieldSpec.header || fieldSpec.sourceHeader || 'Pipe Size',
    unitRowValue: fieldSpec.unitRowValue,
    cellValue: rawValue,
    sampleValues: fieldSpec.sampleValues || [],
    manualUnit: fieldSpec.manualUnit || null,
    outputUnit: 'mm',
    diagnostics: localDiagnostics,
    row,
  });

  unitInfo.header = fieldSpec.header || fieldSpec.sourceHeader || 'Pipe Size';

  const bore = normalizeBoreToMm(rawValue, unitInfo.header, unitInfo);

  if (bore.status.includes('NPS') && safeNumber(rawValue) != null) {
    localDiagnostics.push(
      diag({
        severity: 'WARNING',
        code: 'BORE-NPS-DN-AMBIGUOUS',
        message: `Bore value ${rawValue} interpreted as NPS and converted to DN ${bore.value} mm.`,
        fieldName: 'convertedBore',
        ...rowContext(row),
        details: {
          rawValue,
          convertedBore: bore.value,
          status: bore.status,
        },
      })
    );
  }

  if (bore.value == null) {
    localDiagnostics.push(
      diag({
        severity: 'ERROR',
        code: 'BORE-CONVERSION-FAILED',
        message: `Pipe size / bore value ${rawValue} could not be converted to DN mm.`,
        fieldName: 'convertedBore',
        ...rowContext(row),
        details: {
          rawValue,
          unitInfo,
        },
      })
    );

    diagnostics.push(...localDiagnostics);
    pushRowDiagnostics(row, localDiagnostics);
    return { applied: false, diagnostics };
  }

  row.convertedBore = bore.value;

  diagnostics.push(...localDiagnostics);
  pushRowDiagnostics(row, localDiagnostics);

  return { applied: true, diagnostics };
}

function caHasUnit(value, expectedUnitRx) {
  const text = clean(value);
  return !!text && expectedUnitRx.test(text);
}

/**
 * Audits already-built rows for CA unit presence and unit fallback diagnostics.
 */
export function auditCaUnits(rows = []) {
  const summary = {
    rowCount: rows.length,

    unitManualOverrideCount: 0,
    unitHeaderDetectedCount: 0,
    unitRowDetectedCount: 0,
    unitCellDetectedCount: 0,
    unitCellOverrideCount: 0,
    unitMixedColumnCount: 0,
    unitDefaultFallbackCount: 0,
    unitUnresolvedCount: 0,
    unitConversionFailedCount: 0,
    unitSuspiciousMagnitudeCount: 0,
    boreNpsDnAmbiguousCount: 0,
    pcfUnitsMapRequiredCount: 0,

    ca1WithUnitCount: 0,
    ca2WithUnitCount: 0,
    ca5WithUnitCount: 0,
    ca8WithUnitCount: 0,
    ca10WithUnitCount: 0,

    ca1MissingUnitCount: 0,
    ca2MissingUnitCount: 0,
    ca5MissingUnitCount: 0,
    ca8MissingUnitCount: 0,
    ca10MissingUnitCount: 0,

    nps8WrongRows: 0,
    nps10WrongRows: 0,
    nps14WrongRows: 0,
  };

  const diagnostics = [];

  const incrementByCode = (code) => {
    if (code === 'UNIT-MANUAL-OVERRIDE') summary.unitManualOverrideCount += 1;
    if (code === 'UNIT-HEADER-DETECTED') summary.unitHeaderDetectedCount += 1;
    if (code === 'UNIT-ROW-DETECTED') summary.unitRowDetectedCount += 1;
    if (code === 'UNIT-CELL-DETECTED') summary.unitCellDetectedCount += 1;
    if (code === 'UNIT-CELL-OVERRIDES-COLUMN') summary.unitCellOverrideCount += 1;
    if (code === 'UNIT-MIXED-COLUMN') summary.unitMixedColumnCount += 1;
    if (code === 'UNIT-FIELD-DEFAULT') summary.unitDefaultFallbackCount += 1;
    if (code === 'UNIT-UNRESOLVED') summary.unitUnresolvedCount += 1;
    if (code === 'UNIT-CONVERSION-FAILED') summary.unitConversionFailedCount += 1;
    if (code === 'UNIT-SUSPICIOUS-MAGNITUDE') summary.unitSuspiciousMagnitudeCount += 1;
    if (code === 'BORE-NPS-DN-AMBIGUOUS') summary.boreNpsDnAmbiguousCount += 1;
    if (code === 'PCF-UNITS-MAP-REQUIRED') summary.pcfUnitsMapRequiredCount += 1;
  };

  for (const row of rows || []) {
    const ca = row?.ca || {};
    const rowDiags = Array.isArray(row?.diagnostics) ? row.diagnostics : [];

    for (const code of rowDiags) {
      incrementByCode(String(code));
    }

    if (ca['1'] != null) {
      if (caHasUnit(ca['1'], /\bkPa\b|\bMPa\b|\bbar\b|\bbarg\b|\bpsi\b|\bkg\s*\/\s*cm2\b/i)) {
        summary.ca1WithUnitCount += 1;
      } else {
        summary.ca1MissingUnitCount += 1;
        diagnostics.push(
          diag({
            severity: 'ERROR',
            code: 'CA1-MISSING-UNIT',
            message: `CA1 exists but has no pressure unit: ${ca['1']}`,
            fieldName: 'p1',
            ca: '1',
            ...rowContext(row),
          })
        );
      }
    }

    if (ca['2'] != null) {
      if (caHasUnit(ca['2'], /\bC\b|\bF\b|\bK\b|°\s*C|°\s*F/i)) {
        summary.ca2WithUnitCount += 1;
      } else {
        summary.ca2MissingUnitCount += 1;
        diagnostics.push(
          diag({
            severity: 'ERROR',
            code: 'CA2-MISSING-UNIT',
            message: `CA2 exists but has no temperature unit: ${ca['2']}`,
            fieldName: 't1',
            ca: '2',
            ...rowContext(row),
          })
        );
      }
    }

    if (ca['5'] != null) {
      if (caHasUnit(ca['5'], /\bmm\b|\bm\b|\binch\b|\bin\b|["″]/i)) {
        summary.ca5WithUnitCount += 1;
      } else {
        summary.ca5MissingUnitCount += 1;
        diagnostics.push(
          diag({
            severity: 'ERROR',
            code: 'CA5-MISSING-UNIT',
            message: `CA5 exists but has no length unit: ${ca['5']}`,
            fieldName: 'insThk',
            ca: '5',
            ...rowContext(row),
          })
        );
      }
    }

    if (ca['8'] != null) {
      if (caHasUnit(ca['8'], /\bkg\b|\bkgs\b|\blb\b|\blbs\b|\btonne\b/i)) {
        summary.ca8WithUnitCount += 1;
      } else {
        summary.ca8MissingUnitCount += 1;
        diagnostics.push(
          diag({
            severity: 'ERROR',
            code: 'CA8-MISSING-UNIT',
            message: `CA8 exists but has no weight unit: ${ca['8']}`,
            fieldName: 'weight',
            ca: '8',
            ...rowContext(row),
          })
        );
      }
    }

    if (ca['10'] != null) {
      if (caHasUnit(ca['10'], /\bkPa\b|\bMPa\b|\bbar\b|\bbarg\b|\bpsi\b|\bkg\s*\/\s*cm2\b/i)) {
        summary.ca10WithUnitCount += 1;
      } else {
        summary.ca10MissingUnitCount += 1;
        diagnostics.push(
          diag({
            severity: 'ERROR',
            code: 'CA10-MISSING-UNIT',
            message: `CA10 exists but has no pressure unit: ${ca['10']}`,
            fieldName: 'hp',
            ca: '10',
            ...rowContext(row),
          })
        );
      }
    }

    const rawBore = clean(row?.rawBore || row?.bore || row?.attributes?.BORE || row?.attributes?.NPS || '');
    const convertedBore = Number(row?.convertedBore);

    if (/^8["″]?$/.test(rawBore) && convertedBore === 8) summary.nps8WrongRows += 1;
    if (/^10["″]?$/.test(rawBore) && convertedBore === 10) summary.nps10WrongRows += 1;
    if (/^14["″]?$/.test(rawBore) && convertedBore === 14) summary.nps14WrongRows += 1;
  }

  const pass =
    summary.unitUnresolvedCount === 0 &&
    summary.unitConversionFailedCount === 0 &&
    summary.ca1MissingUnitCount === 0 &&
    summary.ca2MissingUnitCount === 0 &&
    summary.ca5MissingUnitCount === 0 &&
    summary.ca8MissingUnitCount === 0 &&
    summary.ca10MissingUnitCount === 0 &&
    summary.nps8WrongRows === 0 &&
    summary.nps10WrongRows === 0 &&
    summary.nps14WrongRows === 0;

  return {
    schema: 'rvm-pcf-ca-unit-audit/v1',
    pass,
    summary,
    diagnostics,
  };
}

export {
  detectUnitFromText,
  detectUnitFromHeader,
  detectUnitFromUnitRow,
  detectUnitFromSamples,
  resolveUnitForCell,
  normalizePressure,
  normalizeTemperature,
  normalizeLength,
  normalizeWeight,
  normalizeBoreToMm,
  formatNumber,
  formatValueWithUnit,
};