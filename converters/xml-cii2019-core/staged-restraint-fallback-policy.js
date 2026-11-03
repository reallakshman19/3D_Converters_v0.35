const RESTRAINT_CARRIER_TYPES = new Set(['ANCI', 'ATTA']);
const IMPLICIT_REST_COMPONENT_TYPES = new Set(['ATTA']);
const PLACEHOLDER_LIMIT_TYPES = new Set(['LIM', 'LIMIT', 'LINESTOP']);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizedKinds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => text(value).toUpperCase().replace(/\s+/g, ''))
    .filter(Boolean))];
}

function zeroOrBlank(value) {
  const raw = text(value);
  if (!raw) return true;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric === 0;
}

function hasText(value) {
  return text(value) !== '';
}

export function isZeroInformationLimitPlaceholder(restraint = {}) {
  const type = text(restraint.type).toUpperCase().replace(/\s+/g, '');
  if (!PLACEHOLDER_LIMIT_TYPES.has(type)) return false;
  if (!zeroOrBlank(restraint.stiffness) || !zeroOrBlank(restraint.gap)) return false;
  if ([restraint.directionCosineX, restraint.directionCosineY, restraint.directionCosineZ].some(hasText)) return false;
  return ![
    restraint.source,
    restraint.basis,
    restraint.resolvedKey,
    restraint.originalText,
    restraint.resolvedFrom,
    restraint.sideloadRow,
  ].some(hasText);
}

function existingRestraintState(existingRestraints, legacyFlag) {
  const rows = Array.isArray(existingRestraints) ? existingRestraints : [];
  const hasExisting = legacyFlag === true || rows.length > 0;
  const placeholderOnly = rows.length > 0 && rows.every(isZeroInformationLimitPlaceholder);
  return { rows, hasExisting, placeholderOnly };
}

export function decideMissingStagedRestRestraint({
  componentType = '',
  hasExistingRestraint = false,
  existingRestraints = [],
  ledgerSupportTypes = [],
  stagedSupportTypes = [],
  jsonRestraintsEnabled = true,
} = {}) {
  const normalizedComponentType = text(componentType).toUpperCase();
  const observedSupportTypes = normalizedKinds([
    ...normalizedKinds(ledgerSupportTypes),
    ...normalizedKinds(stagedSupportTypes),
  ]);
  const existing = existingRestraintState(existingRestraints, hasExistingRestraint);
  const stagedRest = observedSupportTypes.includes('REST');
  const implicitAttaRest = IMPLICIT_REST_COMPONENT_TYPES.has(normalizedComponentType)
    && observedSupportTypes.length === 0;
  const supportTypes = implicitAttaRest ? ['REST'] : observedSupportTypes;

  if (!jsonRestraintsEnabled) {
    return {
      apply: false,
      replaceExisting: false,
      reason: 'json-restraints-disabled',
      componentType: normalizedComponentType,
      supportTypes,
      authority: 'disabled',
    };
  }
  if (!RESTRAINT_CARRIER_TYPES.has(normalizedComponentType)) {
    return {
      apply: false,
      replaceExisting: false,
      reason: 'unsupported-component-type',
      componentType: normalizedComponentType,
      supportTypes,
      authority: 'none',
    };
  }
  if (existing.hasExisting) {
    if (existing.placeholderOnly && (stagedRest || implicitAttaRest)) {
      return {
        apply: true,
        replaceExisting: true,
        reason: stagedRest
          ? 'zero-information-limit-placeholder-replaced-with-staged-rest'
          : 'zero-information-limit-placeholder-replaced-with-atta-default-rest',
        componentType: normalizedComponentType,
        supportTypes,
        authority: stagedRest ? 'staged-json-rest' : 'component-default-rest',
      };
    }
    return {
      apply: false,
      replaceExisting: false,
      reason: 'existing-restraint-preserved',
      componentType: normalizedComponentType,
      supportTypes,
      authority: 'existing-restraint',
    };
  }
  if (stagedRest) {
    return {
      apply: true,
      replaceExisting: false,
      reason: 'missing-restraint-with-staged-rest',
      componentType: normalizedComponentType,
      supportTypes,
      authority: 'staged-json-rest',
    };
  }
  if (implicitAttaRest) {
    return {
      apply: true,
      replaceExisting: false,
      reason: 'missing-restraint-with-atta-default-rest',
      componentType: normalizedComponentType,
      supportTypes,
      authority: 'component-default-rest',
    };
  }
  return {
    apply: false,
    replaceExisting: false,
    reason: 'rest-not-derived',
    componentType: normalizedComponentType,
    supportTypes,
    authority: 'none',
  };
}
