import {
  canonicalKey, cloneJson, isObject, parseScalar, pointDistance,
} from './component-common.js';

function toleranceRule(profile, id) {
  if (!id) return null;
  const rule = profile?.rules?.[id];
  if (!isObject(rule)) return null;
  const absolute = Number(rule.absolute), relative = Number(rule.relative ?? 0);
  if (!Number.isFinite(absolute) || absolute < 0
    || !Number.isFinite(relative) || relative < 0) return null;
  return { absolute, relative };
}

function scalarWithin(reference, actual, rule) {
  const delta = Math.abs(reference - actual);
  const allowed = Math.max(
    rule.absolute,
    rule.relative * Math.max(Math.abs(reference), Math.abs(actual)),
  );
  return { delta, allowed, pass: delta <= allowed };
}

function comparison(
  fieldId,
  authorityClass,
  referenceValue,
  actualValue,
  outcome,
  options = {},
) {
  const normalizedReferenceValue = Object.hasOwn(options, 'normalizedReferenceValue')
    ? options.normalizedReferenceValue : referenceValue;
  const normalizedActualValue = Object.hasOwn(options, 'normalizedActualValue')
    ? options.normalizedActualValue : actualValue;
  return {
    fieldId,
    authorityClass,
    referenceValue: cloneJson(referenceValue),
    actualValue: cloneJson(actualValue),
    normalizedReferenceValue: cloneJson(normalizedReferenceValue),
    normalizedActualValue: cloneJson(normalizedActualValue),
    toleranceRuleId: options.toleranceRuleId ?? null,
    delta: cloneJson(options.delta ?? null),
    outcome,
    diagnosticCodes: [...(options.diagnosticCodes || [])].sort(),
  };
}

export function compareExact(
  fieldId,
  reference,
  actual,
  authorityClass = 'EXACT',
) {
  if (reference == null && actual == null) {
    return comparison(
      fieldId, authorityClass, reference, actual, 'NOT_APPLICABLE',
    );
  }
  const equal = Object.is(reference, actual);
  if (authorityClass === 'OBSERVATION') {
    return comparison(fieldId, authorityClass, reference, actual, 'OBSERVATION', {
      diagnosticCodes: equal ? [] : [`${fieldId.toUpperCase()}_OBSERVATION`],
    });
  }
  return comparison(fieldId, authorityClass, reference, actual, equal ? 'PASS' : 'FAIL', {
    diagnosticCodes: equal ? [] : [`${fieldId.toUpperCase()}_MISMATCH`],
  });
}

export function compareCanonical(
  fieldId,
  reference,
  actual,
  authorityClass = 'EXACT',
) {
  const normalizedReferenceValue = canonicalKey(reference);
  const normalizedActualValue = canonicalKey(actual);
  const equal = normalizedReferenceValue === normalizedActualValue;
  if (authorityClass === 'OBSERVATION') {
    return comparison(fieldId, authorityClass, reference, actual, 'OBSERVATION', {
      normalizedReferenceValue,
      normalizedActualValue,
      diagnosticCodes: equal ? [] : [`${fieldId.toUpperCase()}_OBSERVATION`],
    });
  }
  return comparison(fieldId, authorityClass, reference, actual, equal ? 'PASS' : 'FAIL', {
    normalizedReferenceValue,
    normalizedActualValue,
    diagnosticCodes: equal ? [] : [`${fieldId.toUpperCase()}_MISMATCH`],
  });
}

export function comparePoint(
  fieldId,
  reference,
  actual,
  toleranceProfile,
  toleranceRuleId,
) {
  if (reference == null && actual == null) {
    return comparison(fieldId, 'TOLERANT', reference, actual, 'NOT_APPLICABLE', {
      toleranceRuleId,
    });
  }
  if (reference == null || actual == null) {
    return comparison(fieldId, 'TOLERANT', reference, actual, 'FAIL', {
      toleranceRuleId,
      diagnosticCodes: [`${fieldId.toUpperCase()}_MISSING`],
    });
  }
  const rule = toleranceRule(toleranceProfile, toleranceRuleId);
  if (!rule) {
    return comparison(fieldId, 'BLOCKED', reference, actual, 'BLOCKED', {
      toleranceRuleId,
      diagnosticCodes: ['TOLERANCE_RULE_UNAVAILABLE'],
    });
  }
  const delta = pointDistance(reference, actual), allowed = rule.absolute;
  return comparison(fieldId, 'TOLERANT', reference, actual, delta <= allowed ? 'PASS' : 'FAIL', {
    toleranceRuleId,
    delta: { distance: delta, allowed },
    diagnosticCodes: delta <= allowed ? [] : [`${fieldId.toUpperCase()}_MISMATCH`],
  });
}

function blockedScalar(fieldId, reference, actual, normalizedReferenceValue, normalizedActualValue, toleranceRuleId, diagnosticCode) {
  return comparison(fieldId, 'BLOCKED', reference, actual, 'BLOCKED', {
    normalizedReferenceValue,
    normalizedActualValue,
    toleranceRuleId,
    diagnosticCodes: [diagnosticCode],
  });
}

export function compareScalar(
  fieldId,
  reference,
  actual,
  toleranceProfile,
  toleranceRuleId,
  unit,
) {
  if (reference == null && actual == null) {
    return comparison(fieldId, 'TOLERANT', reference, actual, 'NOT_APPLICABLE', {
      toleranceRuleId,
    });
  }
  const normalizedReferenceValue = parseScalar(reference, unit);
  const normalizedActualValue = parseScalar(actual, unit);
  if (normalizedReferenceValue == null || normalizedActualValue == null) {
    return blockedScalar(fieldId, reference, actual, normalizedReferenceValue, normalizedActualValue,
      toleranceRuleId, `${fieldId.toUpperCase()}_UNPARSEABLE`);
  }
  const rule = toleranceRule(toleranceProfile, toleranceRuleId);
  if (!rule) {
    return blockedScalar(fieldId, reference, actual, normalizedReferenceValue, normalizedActualValue,
      toleranceRuleId, 'TOLERANCE_RULE_UNAVAILABLE');
  }
  const result = scalarWithin(
    normalizedReferenceValue, normalizedActualValue, rule,
  );
  return comparison(fieldId, 'TOLERANT', reference, actual, result.pass ? 'PASS' : 'FAIL', {
    normalizedReferenceValue,
    normalizedActualValue,
    toleranceRuleId,
    delta: { absolute: result.delta, allowed: result.allowed },
    diagnosticCodes: result.pass ? [] : [`${fieldId.toUpperCase()}_MISMATCH`],
  });
}

function endpointLength(subject) {
  const { apos, lpos } = subject.geometry;
  return apos && lpos ? pointDistance(apos, lpos) : null;
}

export function commonComparisons(reference, actual, context) {
  return [
    compareExact('family', reference.family, actual.family),
    compareExact('rawType', reference.rawType, actual.rawType),
    compareExact(
      'zoneStatus', reference.zoneMembership.status, actual.zoneMembership.status,
    ),
    compareCanonical(
      'zoneIds', reference.zoneMembership.zoneIds, actual.zoneMembership.zoneIds,
    ),
    compareExact(
      'zoneAuthority', reference.zoneMembership.authority,
      actual.zoneMembership.authority, 'OBSERVATION',
    ),
    compareExact('owner', reference.owner, actual.owner),
    compareExact('branchId', reference.branchId, actual.branchId),
    comparePoint(
      'position', reference.geometry.position, actual.geometry.position,
      context.toleranceProfile, 'coordinate',
    ),
    comparePoint(
      'startPoint', reference.geometry.apos, actual.geometry.apos,
      context.toleranceProfile, 'endpoint',
    ),
    comparePoint(
      'endPoint', reference.geometry.lpos, actual.geometry.lpos,
      context.toleranceProfile, 'endpoint',
    ),
  ];
}

function pipeComparisons(reference, actual, context) {
  return [
    compareScalar(
      'bore',
      reference.attributes.ABORE ?? reference.attributes.LBORE,
      actual.attributes.ABORE ?? actual.attributes.LBORE,
      context.toleranceProfile, 'bore', 'mm',
    ),
    compareScalar(
      'length', endpointLength(reference), endpointLength(actual),
      context.toleranceProfile, 'length', 'mm',
    ),
    compareExact(
      'autoGeneratedPipe',
      reference.attributes.AUTO_GENERATED_PIPE ?? null,
      actual.attributes.AUTO_GENERATED_PIPE ?? null,
    ),
    compareScalar(
      'gap', reference.attributes.GAP_MM ?? null, actual.attributes.GAP_MM ?? null,
      context.toleranceProfile, 'length', 'mm',
    ),
    compareExact(
      'routeTier', reference.attributes.ROUTE_TIER ?? null,
      actual.attributes.ROUTE_TIER ?? null,
    ),
    compareExact(
      'routeSplit', reference.attributes.ROUTE_SPLIT ?? null,
      actual.attributes.ROUTE_SPLIT ?? null,
    ),
    compareExact(
      'boreSource', reference.attributes.BORE_SOURCE ?? null,
      actual.attributes.BORE_SOURCE ?? null, 'OBSERVATION',
    ),
  ];
}

function fittingComparisons(reference, actual, context) {
  return [
    compareScalar(
      'boreA', reference.attributes.ABORE ?? null, actual.attributes.ABORE ?? null,
      context.toleranceProfile, 'bore', 'mm',
    ),
    compareScalar(
      'boreL', reference.attributes.LBORE ?? null, actual.attributes.LBORE ?? null,
      context.toleranceProfile, 'bore', 'mm',
    ),
    compareScalar(
      'length', endpointLength(reference), endpointLength(actual),
      context.toleranceProfile, 'length', 'mm',
    ),
    compareScalar(
      'angle', reference.attributes.ANGL ?? null, actual.attributes.ANGL ?? null,
      context.toleranceProfile, 'angle', 'degree',
    ),
    compareExact(
      'branchReference', reference.attributes.CREF ?? null,
      actual.attributes.CREF ?? null,
    ),
    compareExact(
      'specification', reference.attributes.SPRE ?? null,
      actual.attributes.SPRE ?? null,
    ),
    compareExact(
      'orientation', reference.attributes.ORI ?? null,
      actual.attributes.ORI ?? null, 'OBSERVATION',
    ),
  ];
}

export const COMPONENT_COMPARATORS = Object.freeze({
  'PIPE.v1': pipeComparisons,
  'ELBOW.v1': fittingComparisons,
  'TEE.v1': fittingComparisons,
  'REDUCER.v1': fittingComparisons,
  'FLANGE.v1': fittingComparisons,
  'VALVE.v1': fittingComparisons,
  'GASKET.v1': fittingComparisons,
  'BRANCH_FITTING.v1': fittingComparisons,
  'INSTRUMENT.v1': fittingComparisons,
});
