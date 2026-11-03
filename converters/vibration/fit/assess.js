import {
  FIT_REFERENCE_AUTHORITY,
  FIT_REFERENCE_LIMITS,
  fitReferenceLofBand,
} from './method.js';

export function assessFit(calculation) {
  if (!calculation?.ok) {
    return Object.freeze({
      status: 'NOT_ASSESSED',
      authority: FIT_REFERENCE_AUTHORITY,
      referenceThresholdExceeded: null,
      referenceBand: null,
      reasons: Object.freeze(['CALCULATION_UNAVAILABLE']),
    });
  }

  const threshold = FIT_REFERENCE_LIMITS.referenceLofThreshold;
  if (calculation.standard.lof < threshold) {
    return Object.freeze({
      status: 'REFERENCE_BELOW_THRESHOLD',
      authority: FIT_REFERENCE_AUTHORITY,
      referenceThreshold: threshold,
      referenceThresholdExceeded: false,
      referenceBand: fitReferenceLofBand(calculation.standard.lof),
      evaluatedLof: calculation.standard.lof,
      reasons: Object.freeze(['STANDARD_LOF_BELOW_1']),
    });
  }

  if (calculation.advancedEligibility.eligible && calculation.advanced) {
    const exceeded = calculation.advanced.lof >= threshold;
    return Object.freeze({
      status: exceeded
        ? 'REFERENCE_FURTHER_ENGINEERING_ASSESSMENT_REQUIRED'
        : 'REFERENCE_BELOW_THRESHOLD_AFTER_ADVANCED',
      authority: FIT_REFERENCE_AUTHORITY,
      referenceThreshold: threshold,
      referenceThresholdExceeded: exceeded,
      referenceBand: fitReferenceLofBand(calculation.advanced.lof),
      evaluatedLof: calculation.advanced.lof,
      reasons: Object.freeze(['ADVANCED_REFERENCE_LOF_EVALUATED']),
    });
  }

  return Object.freeze({
    status: 'REFERENCE_FURTHER_ENGINEERING_ASSESSMENT_REQUIRED',
    authority: FIT_REFERENCE_AUTHORITY,
    referenceThreshold: threshold,
    referenceThresholdExceeded: true,
    referenceBand: fitReferenceLofBand(calculation.standard.lof),
    evaluatedLof: calculation.standard.lof,
    reasons: Object.freeze([
      'STANDARD_LOF_AT_OR_ABOVE_1',
      calculation.advancedEligibility.reason,
    ]),
  });
}
