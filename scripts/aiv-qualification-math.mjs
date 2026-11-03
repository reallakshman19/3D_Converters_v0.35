export const AIV_QUALIFICATION_MATH_SCHEMA = 'AivQualificationMath.v1';

export const AIV_QUALIFICATION_MATH_AUTHORITY = Object.freeze({
  evidenceClass: 'QUALIFICATION_ONLY_NUMERICAL_HELPER',
  productionEquationAuthorized: false,
  screeningAuthority: 'NOT_AUTHORIZED',
  designAuthority: false,
});

export function qualificationSourcePwlDb({
  p1PaAbs,
  p2PaAbs,
  massFlowKgS,
  temperatureK,
  molecularWeightGPerMol,
  sffDb = 0,
}) {
  return 10 * Math.log10(
    (((p1PaAbs - p2PaAbs) / p1PaAbs) ** 3.6)
    * (massFlowKgS ** 2)
    * ((temperatureK / molecularWeightGPerMol) ** 1.2),
  ) + 126.1 + sffDb;
}

export function qualificationAttenuationDb({ distanceM, insideDiameterMm }) {
  return 60 * distanceM / insideDiameterMm;
}

export function qualificationCombinePwlDb(contributionPwlDb) {
  if (!Array.isArray(contributionPwlDb) || contributionPwlDb.length === 0) {
    throw new TypeError('Qualification PWL combination requires at least one point-level contribution.');
  }
  const energySum = contributionPwlDb.reduce((sum, value) => {
    if (!Number.isFinite(value)) throw new TypeError('Qualification PWL contributions must be finite dB values.');
    return sum + (10 ** (value / 10));
  }, 0);
  return 10 * Math.log10(energySum);
}

export function qualificationErrataLog10N(B, coefficients) {
  if (!Number.isFinite(B) || B <= 0) throw new TypeError('Qualification errata B must be finite and positive.');
  return coefficients.c0
    + coefficients.cLog10B * Math.log10(B)
    + coefficients.cInvSqrtB / Math.sqrt(B)
    + coefficients.cInvBPower / (B ** 0.1);
}

export function qualificationFlm1(diameterRatio) {
  return -0.07
    + 0.91 * diameterRatio
    + 1.32 / diameterRatio
    - 0.48 * (diameterRatio ** 1.5)
    + 0.065 * (diameterRatio ** 2);
}

export function qualificationFlm2(pointPwlDb) {
  return 0.29 + 0.09 * Math.tanh((pointPwlDb - 172) / 2.9);
}

export function qualificationFatigueFactor(N) {
  return -0.1303 * Math.log(N) + 3.1;
}

export function qualificationFinalLofFromLf(Lf) {
  return Lf < 0.5 ? 0.29 : Math.min(1, Math.max(0, Lf));
}
