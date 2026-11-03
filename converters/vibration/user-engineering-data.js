export const VIBRATION_USER_ENGINEERING_DATA_SCHEMA = 'VibrationUserEngineeringData.v1';
export const VIBRATION_USER_ENGINEERING_DATA_AUTHORITY = Object.freeze({
  evidenceClass: 'USER_SUPPLIED_PROJECT_INPUT',
  engineeringAuthority: 'NONE',
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
  masterDataAuthority: false,
});

export const VIBRATION_USER_DATA_BLOCKERS = Object.freeze([
  Object.freeze({
    blockerId: 'EI_AVIFF.T3.SBC.FIGURE_T3_1', mechanismId: 'smallBoreConnections',
    label: 'SBC T3-1 · main-line span with mass', valueType: 'NUMBER', valueLabel: 'Evaluated LOF',
  }),
  Object.freeze({
    blockerId: 'EI_AVIFF.T3.SBC.FIGURE_T3_2', mechanismId: 'smallBoreConnections',
    label: 'SBC T3-2 · main-line span without mass', valueType: 'NUMBER', valueLabel: 'Evaluated LOF',
  }),
  Object.freeze({
    blockerId: 'EI_AVIFF.T3.SBC.FIGURE_T3_3', mechanismId: 'smallBoreConnections',
    label: 'SBC T3-3 · subsequent span with mass', valueType: 'NUMBER', valueLabel: 'Evaluated LOF',
  }),
  Object.freeze({
    blockerId: 'EI_AVIFF.T3.SBC.FIGURE_T3_4', mechanismId: 'smallBoreConnections',
    label: 'SBC T3-4 · subsequent span without mass', valueType: 'NUMBER', valueLabel: 'Evaluated LOF',
  }),
  Object.freeze({
    blockerId: 'EI_AVIFF.T2_8.VALVE_CLOSURE_DATA', mechanismId: 'valveTransients',
    label: 'Valve-transient closure characteristic / phi data', valueType: 'NUMBER', valueLabel: 'User value',
  }),
  Object.freeze({
    blockerId: 'EI_AVIFF.T2_9.VALVE_FL', mechanismId: 'cavitationFlashing',
    label: 'Cavitation / flashing valve pressure-recovery factor FL', valueType: 'NUMBER', valueLabel: 'FL',
  }),
  Object.freeze({
    blockerId: 'EI_AVIFF.T4_1.THERMOWELL_FM', mechanismId: 'thermowells',
    label: 'Thermowell wall / schedule / gusset modifier FM', valueType: 'NUMBER', valueLabel: 'FM',
  }),
  Object.freeze({
    blockerId: 'EI_AVIFF.T4.THERMOWELL_GEOMETRY', mechanismId: 'thermowells',
    label: 'Thermowell geometry taxonomy / required dimensions', valueType: 'TEXT', valueLabel: 'User value',
  }),
  Object.freeze({
    blockerId: 'EI_AVIFF.T2_4.RECIP_PD_DECISION_DATA', mechanismId: 'reciprocatingPulsation',
    label: 'Reciprocating / PD decision-flow data', valueType: 'TEXT', valueLabel: 'User value',
  }),
  Object.freeze({
    blockerId: 'EI_AVIFF.T2_5.ROTATING_STALL_DATA', mechanismId: 'rotatingStall',
    label: 'Rotating-stall decision-flow data', valueType: 'TEXT', valueLabel: 'User value',
  }),
  Object.freeze({
    blockerId: 'EI_AVIFF.T2_6.DEADLEG_ADVANCED_DATA', mechanismId: 'deadlegPulsation',
    label: 'Advanced deadleg assessment data', valueType: 'TEXT', valueLabel: 'User value',
  }),
  Object.freeze({
    blockerId: 'EI_SUBSEA_AVIFF.E4_3.CORRUGATION_DATA', mechanismId: 'corrugationPulsation',
    label: 'Corrugation assessment data / curve point', valueType: 'TEXT', valueLabel: 'User value',
  }),
  Object.freeze({
    blockerId: 'SPECIALIST.SLUG_FLOW.DATA', mechanismId: 'slugFlow',
    label: 'Slug-flow specialist assessment data', valueType: 'TEXT', valueLabel: 'User value',
  }),
]);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizedUnit(value) {
  return text(value).toLowerCase();
}

function blockerFor(blockerId) {
  const key = text(blockerId);
  return VIBRATION_USER_DATA_BLOCKERS.find((item) => item.blockerId === key) ?? null;
}

function valueTypeFor(row, request = {}) {
  return text(request.valueType || blockerFor(row.blockerId)?.valueType || 'TEXT').toUpperCase();
}

function numericText(value) {
  if (!text(value)) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function selectorEquals(row, request, key) {
  const requested = text(request[key]);
  return !requested || text(row[key]) === requested;
}

function engineeringSelectorEquals(row, request, valueKey, unitKey) {
  const requested = text(request[valueKey]);
  if (!requested) return true;
  if (normalizedUnit(row[unitKey]) !== normalizedUnit(request[unitKey])) return false;
  const actualNumber = numericText(row[valueKey]);
  const requestedNumber = numericText(request[valueKey]);
  if (actualNumber !== null && requestedNumber !== null) return actualNumber === requestedNumber;
  return text(row[valueKey]) === requested;
}

function matchesRequest(row, request) {
  if (text(row.mechanismId) !== text(request.mechanismId)) return false;
  if (text(row.blockerId) !== text(request.blockerId)) return false;
  if (!selectorEquals(row, request, 'scopeId')) return false;
  if (!selectorEquals(row, request, 'recordKey')) return false;
  if (!engineeringSelectorEquals(row, request, 'xValue', 'xUnit')) return false;
  return engineeringSelectorEquals(row, request, 'yValue', 'yUnit');
}

export function validateVibrationUserEngineeringDataRow(row, request = {}) {
  const errors = [];
  if (!text(row?.mechanismId)) errors.push('MECHANISM_ID_REQUIRED');
  if (!text(row?.blockerId)) errors.push('BLOCKER_ID_REQUIRED');
  if (!text(row?.value)) errors.push('VALUE_REQUIRED');
  if (!text(row?.sourceReference)) errors.push('SOURCE_REFERENCE_REQUIRED');
  const expectedType = valueTypeFor(row ?? {}, request);
  if (expectedType === 'NUMBER' && text(row?.value) && numericText(row.value) === null) {
    errors.push('NUMERIC_VALUE_REQUIRED');
  }
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    valueType: expectedType,
  });
}

function resolvedUserValue(row, request) {
  const validation = validateVibrationUserEngineeringDataRow(row, request);
  if (!validation.ok) {
    return Object.freeze({ status: 'INVALID_USER_DATA', validation, row, authority: VIBRATION_USER_ENGINEERING_DATA_AUTHORITY });
  }
  const value = validation.valueType === 'NUMBER' ? Number(row.value) : text(row.value);
  return Object.freeze({
    status: 'RESOLVED_USER_INPUT',
    schema: VIBRATION_USER_ENGINEERING_DATA_SCHEMA,
    value,
    unit: text(row.unit) || null,
    row: Object.freeze({ ...row }),
    authority: VIBRATION_USER_ENGINEERING_DATA_AUTHORITY,
  });
}

export function resolveVibrationUserEngineeringData(rows, request) {
  if (!request || !text(request.mechanismId) || !text(request.blockerId)) {
    throw new TypeError('Vibration user-data request requires mechanismId and blockerId.');
  }
  const matches = (rows ?? []).filter((row) => matchesRequest(row, request));
  if (!matches.length) {
    return Object.freeze({ status: 'NOT_READY', reason: 'USER_ENGINEERING_DATA_NOT_FOUND', authority: VIBRATION_USER_ENGINEERING_DATA_AUTHORITY });
  }
  if (matches.length > 1) {
    return Object.freeze({ status: 'AMBIGUOUS', reason: 'MULTIPLE_EXACT_USER_ENGINEERING_DATA_ROWS', matchCount: matches.length, authority: VIBRATION_USER_ENGINEERING_DATA_AUTHORITY });
  }
  return resolvedUserValue(matches[0], request);
}

function governedValueAvailable(value) {
  return value !== undefined && value !== null && value !== '';
}

export function resolveBlockedVibrationData(options = {}) {
  if (governedValueAvailable(options.governedValue)) {
    return Object.freeze({
      status: 'RESOLVED_GOVERNED_MASTER',
      value: options.governedValue,
      unit: options.governedUnit ?? null,
      provenance: options.governedProvenance ?? null,
    });
  }
  return resolveVibrationUserEngineeringData(options.userRows ?? [], options.request);
}

export function createSbcT3UserEngineeringDataTemplate(scopeId = '') {
  return VIBRATION_USER_DATA_BLOCKERS.slice(0, 4).map((blocker) => Object.freeze({
    mechanismId: blocker.mechanismId,
    blockerId: blocker.blockerId,
    scopeId: text(scopeId),
    recordKey: 'DIRECT_EVALUATED_VALUE',
    xValue: '', xUnit: '', yValue: '', yUnit: '',
    value: '', unit: '1', sourceReference: '', notes: '',
  }));
}
