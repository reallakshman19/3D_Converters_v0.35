export function valueState(value, hasValue = true) {
  if (!hasValue) return 'MISSING_ATTRIBUTE';
  if (value === null) return 'EXPLICIT_NULL';
  if (value === '') return 'EMPTY_STRING';
  return 'VALUE_PRESENT';
}

function tolerancePass(reference, actual, tolerance) {
  const residual = Math.abs(actual - reference);
  const scale = Math.max(Math.abs(reference), Math.abs(actual));
  const limit = Math.max(tolerance.absolute, tolerance.relative * scale);
  return { pass: residual <= limit, residual, limit };
}

export function compareExactField(fieldId, referenceValue, actualValue) {
  const pass = Object.is(referenceValue, actualValue);
  return { fieldId, comparison: 'EXACT', referenceValueState: valueState(referenceValue), actualValueState: valueState(actualValue), referenceValue, actualValue, state: pass ? 'PASS' : 'FAIL' };
}

export function compareSupportPosition(reference, actual, tolerance) {
  if (!reference || !actual) return unavailablePosition(reference, actual);
  const residual = Math.hypot(actual.x - reference.x, actual.y - reference.y, actual.z - reference.z);
  const scale = Math.max(Math.hypot(reference.x, reference.y, reference.z), Math.hypot(actual.x, actual.y, actual.z));
  const limit = Math.max(tolerance.absolute, tolerance.relative * scale);
  return { fieldId: 'position', comparison: 'TOLERANCED', referenceValueState: 'VALUE_PRESENT', actualValueState: 'VALUE_PRESENT', referenceValue: reference, actualValue: actual, absoluteResidual: residual, toleranceLimit: limit, state: residual <= limit ? 'PASS' : 'FAIL' };
}

function unavailablePosition(reference, actual) {
  return { fieldId: 'position', comparison: 'TOLERANCED', referenceValueState: valueState(reference, reference !== undefined), actualValueState: valueState(actual, actual !== undefined), referenceValue: reference, actualValue: actual, state: 'BLOCKED', reason: 'POSITION_VALUE_UNAVAILABLE' };
}

function blockedOrientation(reference, actual, reason) {
  return { ...compareExactField('orientation', reference, actual), state: 'BLOCKED', reason };
}

function validateOrientationResult(result) {
  return result && typeof result === 'object'
    && typeof result.authorityId === 'string' && result.authorityId
    && Number.isFinite(result.angularResidual) && result.angularResidual >= 0;
}

export function compareSupportOrientation(referenceRecord, actualRecord, comparator, tolerance) {
  const reference = referenceRecord.orientation; const actual = actualRecord.orientation;
  if (reference === actual) return compareExactField('orientation', reference, actual);
  if (typeof comparator !== 'function') return blockedOrientation(reference, actual, 'ORIENTATION_COMPARATOR_REQUIRED');
  let result;
  try { result = comparator({ reference, actual, referenceRecord, actualRecord }); }
  catch (error) { return blockedOrientation(reference, actual, `ORIENTATION_COMPARATOR_ERROR:${error instanceof Error ? error.message : String(error)}`); }
  if (!validateOrientationResult(result)) return blockedOrientation(reference, actual, 'ORIENTATION_COMPARATOR_INVALID_RESULT');
  return { fieldId: 'orientation', comparison: 'TOLERANCED', authorityId: result.authorityId, referenceValueState: valueState(reference), actualValueState: valueState(actual), referenceValue: reference, actualValue: actual, angularResidual: result.angularResidual, toleranceLimit: tolerance.absolute, state: result.angularResidual <= tolerance.absolute ? 'PASS' : 'FAIL' };
}

function getAttribute(record, attribute) {
  return Object.hasOwn(record.attributes, attribute)
    ? { present: true, value: record.attributes[attribute] }
    : { present: false, value: undefined };
}

function propertyApplicable(rule, supportClass) {
  return !Array.isArray(rule.requiredForClasses) || !rule.requiredForClasses.length || rule.requiredForClasses.includes(supportClass);
}

function unavailableProperty(rule, reference, actual) {
  const referenceState = valueState(reference.value, reference.present);
  const actualState = valueState(actual.value, actual.present);
  return { fieldId: rule.fieldId, comparison: rule.comparison || 'TOLERANCED', referenceValueState: referenceState, actualValueState: actualState, referenceValue: reference.value, actualValue: actual.value, state: referenceState === actualState ? 'PASS' : 'FAIL' };
}

function blockedProperty(rule, reference, actual, reason, valueStateId = 'VALUE_PRESENT') {
  return { fieldId: rule.fieldId, comparison: rule.comparison || 'TOLERANCED', referenceValueState: valueStateId, actualValueState: valueStateId, referenceValue: reference.value, actualValue: actual.value, state: 'BLOCKED', reason };
}

function normalizeProperty(rule, reference, actual, normalizers) {
  const normalizer = normalizers?.[rule.normalizerId];
  if (typeof normalizer !== 'function') return { blocked: blockedProperty(rule, reference, actual, `NORMALIZER_REQUIRED:${rule.normalizerId}`) };
  try { return { reference: normalizer(reference.value), actual: normalizer(actual.value) }; }
  catch (error) { return { blocked: blockedProperty(rule, reference, actual, `NORMALIZER_ERROR:${error instanceof Error ? error.message : String(error)}`, 'UNPARSEABLE_VALUE') }; }
}

export function compareSupportProperty(rule, referenceRecord, actualRecord, supportClass, tolerance, normalizers) {
  if (!propertyApplicable(rule, supportClass)) return { fieldId: rule.fieldId, comparison: 'NOT_APPLICABLE', state: 'NOT_APPLICABLE' };
  const reference = getAttribute(referenceRecord, rule.attribute); const actual = getAttribute(actualRecord, rule.attribute);
  if (!reference.present || !actual.present || reference.value === null || actual.value === null || reference.value === '' || actual.value === '') return unavailableProperty(rule, reference, actual);
  const normalized = normalizeProperty(rule, reference, actual, normalizers);
  if (normalized.blocked) return normalized.blocked;
  if (!Number.isFinite(normalized.reference) || !Number.isFinite(normalized.actual)) return blockedProperty(rule, reference, actual, 'UNPARSEABLE_PROPERTY', 'UNPARSEABLE_VALUE');
  const result = tolerancePass(normalized.reference, normalized.actual, tolerance);
  return { fieldId: rule.fieldId, comparison: 'TOLERANCED', referenceValueState: 'VALUE_PRESENT', actualValueState: 'VALUE_PRESENT', referenceValue: reference.value, actualValue: actual.value, normalizedReferenceValue: normalized.reference, normalizedActualValue: normalized.actual, absoluteResidual: result.residual, toleranceLimit: result.limit, state: result.pass ? 'PASS' : 'FAIL' };
}

export function firstFieldFailure(fieldResults, fieldId) {
  return fieldResults.some((item) => item.fieldId === fieldId && item.state === 'FAIL');
}
