import { aivEitMassFlowKgH, aivEitMolecularWeightGPerMol, aivEitPressureBarAbsolute, aivEitTemperatureC } from './aiv-eit-units.js';

function numberText(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError('AIV .eit export requires finite numerical result.');
  return String(n);
}

export function buildAivEitStream(source, streamId) {
  return {
    desc: source.sourceCanonicalId,
    phase: String(source.phase ?? '').toLowerCase(),
    si: streamId,
    mfr: numberText(aivEitMassFlowKgH(source.massFlow)),
    t: numberText(aivEitTemperatureC(source.upstreamTemperature)),
    p: numberText(aivEitPressureBarAbsolute(source, 'upstreamPressure')),
    mw: numberText(aivEitMolecularWeightGPerMol(source.molecularWeight)),
    sourceCanonicalId: source.sourceCanonicalId,
    caseId: source.caseId,
  };
}
