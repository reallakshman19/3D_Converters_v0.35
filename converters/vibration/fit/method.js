export const FIT_REFERENCE_AUTHORITY = 'WORKBOOK_REFERENCE_ONLY';

export const FIT_WORKBOOK_SOURCE = Object.freeze({
  repository: 'reallaksh19/CRF-4-1',
  commit: '68dc8e1fa2ef67073c59b3afc56f1bf40953d535',
  path: 'Extended calc2/AIV FIV/FIT.xlsm',
  gitBlob: 'd7d4c1a773fe1b2e9791f258b2b7a07e95bdc41e',
  sheet: 'Flow Induced Turbulence',
  methodBasis: 'EI_PROCESS_PIPEWORK_2008_T2_2_PLUS_PROJECT_GUIDANCE',
});

export const FIT_PHASES = Object.freeze(['LIQUID', 'GAS', 'MULTIPHASE']);

export const FIT_SUPPORT_CATEGORIES = Object.freeze([
  'STIFF',
  'MEDIUM_STIFF',
  'MEDIUM_SMALL',
  'MEDIUM_LARGE',
  'FLEXIBLE_SMALL',
  'FLEXIBLE_LARGE',
]);

export const FIT_REFERENCE_LIMITS = Object.freeze({
  minOutsideDiameterMm: 60,
  smallFamilyMaxOutsideDiameterMm: 219.1,
  largeFamilyMinOutsideDiameterMm: 273,
  maxOutsideDiameterMm: 762,
  advancedNaturalFrequencyMinHz: 1,
  advancedNaturalFrequencyMinInclusive: false,
  advancedNaturalFrequencyMaxHz: 3,
  referenceLofThreshold: 1,
});

export const FIT_REFERENCE_ACTION_BANDS = Object.freeze({
  visualSurveyOnlyMaxExclusive: 0.3,
  sbcAndVisualReviewMaxExclusive: 0.5,
  detailedReviewMaxExclusive: 1,
});

export function fitReferenceLofBand(lof) {
  if (!Number.isFinite(lof)) return null;
  if (lof < FIT_REFERENCE_ACTION_BANDS.visualSurveyOnlyMaxExclusive) return 'LOF_LT_0_3';
  if (lof < FIT_REFERENCE_ACTION_BANDS.sbcAndVisualReviewMaxExclusive) return 'LOF_0_3_TO_LT_0_5';
  if (lof < FIT_REFERENCE_ACTION_BANDS.detailedReviewMaxExclusive) return 'LOF_0_5_TO_LT_1';
  return 'LOF_GE_1';
}

export function fitSpanBoundaries(diameterMm) {
  return Object.freeze({
    stiffMaxM: (-0.000012346 * diameterMm ** 2) + (0.02 * diameterMm) + 2.0563,
    mediumStiffMaxM: (-0.000011886 * diameterMm ** 2) + (0.025262 * diameterMm) + 3.3601,
    mediumMaxM: (-0.000015968 * diameterMm ** 2) + (0.033583 * diameterMm) + 4.429,
  });
}

export function classifyFitSupportStiffness(spanM, boundaries) {
  if (spanM <= boundaries.stiffMaxM) return 'STIFF';
  if (spanM <= boundaries.mediumStiffMaxM) return 'MEDIUM_STIFF';
  if (spanM <= boundaries.mediumMaxM) return 'MEDIUM';
  return 'FLEXIBLE';
}

function diameterFamily(diameterMm) {
  const limits = FIT_REFERENCE_LIMITS;
  if (diameterMm <= limits.smallFamilyMaxOutsideDiameterMm) return 'SMALL';
  if (diameterMm >= limits.largeFamilyMinOutsideDiameterMm) return 'LARGE';
  return null;
}

export function resolveFitSupportCategory(stiffness, diameterMm) {
  if (stiffness === 'STIFF') return 'STIFF';
  if (stiffness === 'MEDIUM_STIFF') return 'MEDIUM_STIFF';
  const family = diameterFamily(diameterMm);
  if (!family) return null;
  return `${stiffness}_${family}`;
}

export function fitStandardCorrelation(diameterMm, wallThicknessMm, category) {
  const ratio = diameterMm / wallThicknessMm;
  const { a, b, form } = standardCoefficients(diameterMm, category);
  const fv = form === 'EXPONENTIAL'
    ? Math.exp(a * ratio ** b)
    : a * ratio ** b;
  return Object.freeze({ a, b, fv, form, category });
}

function standardCoefficients(d, category) {
  if (category === 'STIFF') {
    return { a: 446187 + 646 * d + 0.000917 * d ** 3, b: 0.1 * Math.log(d) - 1.3739, form: 'POWER' };
  }
  if (category === 'MEDIUM_STIFF') {
    return { a: 283921 + 370 * d, b: 0.1106 * Math.log(d) - 1.501, form: 'POWER' };
  }
  if (category === 'MEDIUM_LARGE') {
    return { a: 150412 + 209 * d, b: 0.0815 * Math.log(d) - 1.3269, form: 'POWER' };
  }
  if (category === 'MEDIUM_SMALL') {
    return { a: 13.1 - 0.00475 * d + 0.0000141 * d ** 2, b: -0.132 + 0.000228 * d - 0.000000372 * d ** 2, form: 'EXPONENTIAL' };
  }
  if (category === 'FLEXIBLE_LARGE') {
    return { a: 41.21 * d + 49397, b: 0.0815 * Math.log(d) - 1.3842, form: 'POWER' };
  }
  if (category === 'FLEXIBLE_SMALL') {
    return { a: 0.0000132 * d ** 2 - 0.00442 * d + 12.22, b: 0.000284 * d - 0.000000462 * d ** 2 - 0.164, form: 'EXPONENTIAL' };
  }
  throw new RangeError(`Unsupported FIT support category: ${category}`);
}

export function fitAdvancedCorrelation(diameterMm, wallThicknessMm, naturalFrequencyHz, category) {
  if (category === 'FLEXIBLE_SMALL') {
    return advancedSmall(diameterMm, wallThicknessMm, naturalFrequencyHz);
  }
  if (category === 'FLEXIBLE_LARGE') {
    return advancedLarge(diameterMm, wallThicknessMm, naturalFrequencyHz);
  }
  throw new RangeError(`Advanced FIT reference correlation is not defined for ${category}.`);
}

function advancedSmall(d, t, fn) {
  const a = (0.000013175 * d ** 2 - 0.0044213 * d + 12.217) * (0.0529 * Math.log(fn) + 1);
  const b = (-0.0000004622 * d ** 2 + 0.0002835 * d - 0.164) * (-0.1407 * Math.log(fn) + 1);
  const fv = Math.exp(a * (d / t) ** b);
  return Object.freeze({ a, b, fv, form: 'EXPONENTIAL', category: 'FLEXIBLE_SMALL' });
}

function advancedLarge(d, t, fn) {
  const a = (41.21 * d + 49397) * fn ** (0.0001665 * d + 0.84615);
  const b = 0.0815 * Math.log(d) - 1.3842 + 0.0191 * (fn - 1);
  const fv = a * (d / t) ** b;
  return Object.freeze({ a, b, fv, form: 'POWER', category: 'FLEXIBLE_LARGE' });
}
