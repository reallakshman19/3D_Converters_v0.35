export const DRY_GAS_RAPID_OPENING_METHOD_ID = 'EI.AVIFF.T2.8.DRY_GAS_RAPID_OPENING.v1';

export const TRANSIENT_SUPPORT_FACTOR = Object.freeze({
  STIFF: 4,
  MEDIUM_STIFF: 2,
  MEDIUM: 1,
  FLEXIBLE: 0.5,
});

function positive(value, field) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${field} must be > 0.`);
  return value;
}

export function calculateDryGasRapidOpening(input = {}) {
  const massFlowKgS = positive(input.massFlowKgS, 'massFlowKgS');
  const gamma = positive(input.gamma, 'gamma');
  if (gamma <= 1) throw new RangeError('gamma must be > 1.');
  const gasConstantJPerKmolK = positive(input.gasConstantJPerKmolK ?? 8314, 'gasConstantJPerKmolK');
  const upstreamTemperatureK = positive(input.upstreamTemperatureK, 'upstreamTemperatureK');
  const molecularWeightKgPerKmol = positive(input.molecularWeightKgPerKmol, 'molecularWeightKgPerKmol');
  const outsideDiameterMm = positive(input.outsideDiameterMm, 'outsideDiameterMm');
  const insideDiameterMm = positive(input.insideDiameterMm, 'insideDiameterMm');
  const wallThicknessMm = positive(input.wallThicknessMm, 'wallThicknessMm');
  const schedule40ThicknessMm = positive(input.schedule40ThicknessMm, 'schedule40ThicknessMm');
  const supportFactor = TRANSIENT_SUPPORT_FACTOR[input.supportStiffness];
  if (supportFactor === undefined) throw new RangeError(`Unsupported support stiffness: ${input.supportStiffness}.`);

  const peakForceKn = massFlowKgS / 1000 * Math.sqrt(
    2 * gamma * gasConstantJPerKmolK * upstreamTemperatureK
      / ((gamma + 1) * molecularWeightKgPerKmol),
  );
  const psi = wallThicknessMm / schedule40ThicknessMm;
  const polynomial = 16.8 * psi ** 3 - 1.81 * psi ** 2 + 525 * psi + 25.3;
  const limitForceKn = polynomial * outsideDiameterMm * supportFactor
    * Math.PI * insideDiameterMm ** 2 / (4e9);

  return Object.freeze({
    methodId: DRY_GAS_RAPID_OPENING_METHOD_ID,
    qualificationState: 'BENCHMARK_ONLY',
    engineeringAuthority: 'NONE',
    peakForceKn,
    psi,
    supportFactor,
    limitForceKn,
    lof: peakForceKn / limitForceKn,
  });
}
