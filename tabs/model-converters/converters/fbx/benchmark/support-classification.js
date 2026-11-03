const EXPLICIT_CLASS_ATTRIBUTES = ['SUPPORT_KIND', 'SUPPORT_MAPPER_KIND', 'SUPPORT_TYPE'];

function compareText(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizedText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function valueState(attributes, key) {
  if (!Object.hasOwn(attributes, key)) return 'MISSING_ATTRIBUTE';
  if (attributes[key] === null) return 'EXPLICIT_NULL';
  if (attributes[key] === '') return 'EMPTY_STRING';
  return 'VALUE_PRESENT';
}

function explicitResult(record) {
  const evidence = EXPLICIT_CLASS_ATTRIBUTES.map((attribute) => ({
    path: `attributes.${attribute}`,
    valueState: valueState(record.attributes, attribute),
    value: Object.hasOwn(record.attributes, attribute) ? record.attributes[attribute] : undefined,
    normalized: normalizedText(record.attributes[attribute]),
  }));
  const values = [...new Set(evidence.map((item) => item.normalized).filter(Boolean))].sort(compareText);
  return {
    authorityId: 'EXPLICIT_SUPPORT_CLASS_FIELDS',
    supportClass: values.length === 1 ? values[0] : null,
    conflicts: values.length > 1 ? values : [],
    hasExplicitEmpty: evidence.some((item) => item.valueState === 'EMPTY_STRING'),
    evidence,
  };
}

function validateResolverResult(result) {
  if (!result || typeof result !== 'object') throw new Error('SUPPORT_CLASS_RESOLVER_INVALID_RESULT');
  if (typeof result.authorityId !== 'string' || !result.authorityId) throw new Error('SUPPORT_CLASS_AUTHORITY_REQUIRED');
  const supportClass = result.supportClass === null ? null : normalizedText(result.supportClass);
  const conflicts = Array.isArray(result.conflicts) ? [...new Set(result.conflicts.map(normalizedText).filter(Boolean))].sort(compareText) : [];
  if (result.supportClass !== null && !supportClass) throw new Error('SUPPORT_CLASS_INVALID');
  return { authorityId: result.authorityId, supportClass, conflicts, hasExplicitEmpty: result.hasExplicitEmpty === true, evidence: Array.isArray(result.evidence) ? result.evidence : [] };
}

export function resolveSupportClass(record, resolver) {
  if (typeof resolver !== 'function') return Object.freeze(explicitResult(record));
  try {
    return Object.freeze(validateResolverResult(resolver({ record })));
  } catch (error) {
    return Object.freeze({ authorityId: null, supportClass: null, conflicts: [], hasExplicitEmpty: false, evidence: [], blockedReason: error instanceof Error ? error.message : String(error) });
  }
}

export function classComparison(referenceRecord, actualRecord, policy, resolver) {
  const reference = resolveSupportClass(referenceRecord, resolver);
  const actual = resolveSupportClass(actualRecord, resolver);
  const blocked = Boolean(reference.blockedReason || actual.blockedReason || reference.conflicts.length || actual.conflicts.length
    || ((reference.supportClass === null || actual.supportClass === null)
      && policy.emptyExplicitClassDisposition === 'BLOCKED_CLASSIFICATION'));
  return Object.freeze({
    referenceClass: reference.supportClass,
    actualClass: actual.supportClass,
    referenceAuthorityId: reference.authorityId,
    actualAuthorityId: actual.authorityId,
    referenceConflicts: reference.conflicts,
    actualConflicts: actual.conflicts,
    reasons: [reference.blockedReason, actual.blockedReason].filter(Boolean),
    state: blocked ? 'BLOCKED' : reference.supportClass === actual.supportClass ? 'PASS' : 'FAIL',
  });
}

export function buildSupportClassInventory(records, resolver) {
  const countsByClass = {};
  let classConflictCount = 0;
  for (const record of records) {
    const result = resolveSupportClass(record, resolver);
    const key = result.supportClass ?? '<UNCLASSIFIED>';
    countsByClass[key] = (countsByClass[key] || 0) + 1;
    if (result.conflicts.length) classConflictCount += 1;
  }
  return Object.freeze({ countsByClass, unclassifiedCount: countsByClass['<UNCLASSIFIED>'] || 0, classConflictCount });
}
