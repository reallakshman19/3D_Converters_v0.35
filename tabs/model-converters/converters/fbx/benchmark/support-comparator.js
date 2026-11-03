import { validateToleranceProfile } from './support-policy.js';
import { classComparison } from './support-classification.js';
import { compareExactField, compareSupportOrientation, compareSupportPosition, compareSupportProperty, firstFieldFailure } from './support-field-comparator.js';
import { compareSupportHost } from './support-host-comparator.js';

function matchState(fieldResults, classResult, hostResult, identityAuthority) {
  const blocked = classResult.state === 'BLOCKED' || hostResult.state === 'BLOCKED'
    || fieldResults.some((item) => item.state === 'BLOCKED');
  if (blocked) return 'BLOCKED';
  if (hostResult.state === 'ORPHAN') return 'ORPHAN_SUPPORT';
  if (hostResult.state === 'FAIL') return 'HOST_MISMATCH';
  if (firstFieldFailure(fieldResults, 'rawType') || classResult.state === 'FAIL') return 'TYPE_MISMATCH';
  if (firstFieldFailure(fieldResults, 'ownerBranch')) return 'PROPERTY_MISMATCH';
  if (firstFieldFailure(fieldResults, 'position')) return 'POSITION_MISMATCH';
  if (firstFieldFailure(fieldResults, 'orientation')) return 'ORIENTATION_MISMATCH';
  if (fieldResults.some((item) => item.state === 'FAIL')) return 'PROPERTY_MISMATCH';
  return identityAuthority === 'APPROVED_EQUIVALENT' ? 'APPROVED_EQUIVALENT' : 'EXACT_MATCH';
}

function baseFields(referenceRecord, actualRecord, toleranceProfile, orientationComparator) {
  return [
    compareExactField('rawType', referenceRecord.rawType, actualRecord.rawType),
    compareExactField('ownerBranch', referenceRecord.ownerBranch, actualRecord.ownerBranch),
    compareSupportPosition(referenceRecord.position, actualRecord.position, toleranceProfile.supportPositionTolerance),
    compareSupportOrientation(referenceRecord, actualRecord, orientationComparator, toleranceProfile.orientationAngularTolerance),
  ];
}

export function compareMatchedSupport(referenceRecord, actualRecord, options) {
  const toleranceProfile = validateToleranceProfile(options.toleranceProfile);
  const classResult = classComparison(referenceRecord, actualRecord, options.identityPolicy.classAuthority, options.classResolver);
  const fieldResults = baseFields(referenceRecord, actualRecord, toleranceProfile, options.orientationComparator);
  for (const rule of options.propertyRules || []) fieldResults.push(compareSupportProperty(
    rule,
    referenceRecord,
    actualRecord,
    classResult.referenceClass,
    toleranceProfile.scalarEngineeringTolerance,
    options.normalizers,
  ));
  const hostResult = compareSupportHost(referenceRecord, actualRecord, options.hostResolver, options.hostRequired === true);
  return Object.freeze({
    matchState: matchState(fieldResults, classResult, hostResult, options.identityAuthority),
    classResult,
    hostResult,
    fieldResults: Object.freeze(fieldResults),
  });
}
