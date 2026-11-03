export const MECHANICAL_EXCITATION_METHOD_ID = 'EI.AVIFF.T2.3.MECHANICAL.v1';

export const MECHANICAL_EXCITATION_TYPES = Object.freeze({
  RECIPROCATING_PD: 'RECIPROCATING_PD_COMPRESSOR_PUMP',
  DIESEL_GAS_ENGINE: 'DIESEL_GAS_ENGINE',
  SCREW_COMPRESSOR_PUMP: 'SCREW_COMPRESSOR_PUMP',
  CENTRIFUGAL_PUMP: 'CENTRIFUGAL_PUMP',
  ELECTRIC_MOTOR_ALTERNATOR: 'ELECTRIC_MOTOR_ALTERNATOR',
  CENTRIFUGAL_COMPRESSOR: 'CENTRIFUGAL_COMPRESSOR',
  GAS_TURBINE: 'GAS_TURBINE',
  FAN: 'FAN',
  ADJACENT_PIPEWORK: 'ADJACENT_PIPEWORK',
});

const FIXED_LOF = Object.freeze({
  [MECHANICAL_EXCITATION_TYPES.RECIPROCATING_PD]: 0.9,
  [MECHANICAL_EXCITATION_TYPES.DIESEL_GAS_ENGINE]: 0.8,
  [MECHANICAL_EXCITATION_TYPES.SCREW_COMPRESSOR_PUMP]: 0.6,
  [MECHANICAL_EXCITATION_TYPES.CENTRIFUGAL_PUMP]: 0.4,
  [MECHANICAL_EXCITATION_TYPES.CENTRIFUGAL_COMPRESSOR]: 0.2,
  [MECHANICAL_EXCITATION_TYPES.GAS_TURBINE]: 0.2,
  [MECHANICAL_EXCITATION_TYPES.FAN]: 0.2,
});

function positive(value, field) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${field} must be > 0.`);
  return value;
}

function sourceLof(source) {
  if (!source || typeof source !== 'object') throw new TypeError('Mechanical source must be an object.');
  if (source.type === MECHANICAL_EXCITATION_TYPES.ELECTRIC_MOTOR_ALTERNATOR) {
    const powerKw = positive(source.powerKw, 'powerKw');
    return powerKw >= 15 ? 0.4 : 0.2;
  }
  if (source.type === MECHANICAL_EXCITATION_TYPES.ADJACENT_PIPEWORK) {
    const lof = positive(source.adjacentLof, 'adjacentLof');
    if (lof < 0.5) throw new RangeError('adjacentLof must be >= 0.5 for the T2.3 adjacent-pipework rule.');
    return lof;
  }
  const lof = FIXED_LOF[source.type];
  if (lof === undefined) throw new RangeError(`Unsupported mechanical excitation type: ${source.type}.`);
  return lof;
}

function applyDynamicAnalysisReduction(source, rawLof) {
  if (source.noCoincidenceDynamicAnalysis !== true) return rawLof;
  const reducible = source.type === MECHANICAL_EXCITATION_TYPES.RECIPROCATING_PD
    || source.type === MECHANICAL_EXCITATION_TYPES.DIESEL_GAS_ENGINE;
  if (!reducible) {
    throw new RangeError('T2.3 no-coincidence reduction is not controlled for this machinery type.');
  }
  return 0.4;
}

export function calculateMechanicalExcitation(input = {}) {
  const sources = Array.isArray(input.sources) ? input.sources : [];
  if (!sources.length) throw new RangeError('At least one mechanical excitation source is required.');
  const items = sources.map((source, index) => {
    const rawLof = sourceLof(source);
    return Object.freeze({
      index,
      type: source.type,
      rawLof,
      lof: applyDynamicAnalysisReduction(source, rawLof),
      methodId: MECHANICAL_EXCITATION_METHOD_ID,
    });
  });
  const governingLof = Math.max(...items.map((item) => item.lof));
  return Object.freeze({
    methodId: MECHANICAL_EXCITATION_METHOD_ID,
    qualificationState: 'BENCHMARK_ONLY',
    engineeringAuthority: 'NONE',
    items: Object.freeze(items),
    governingLof,
  });
}
