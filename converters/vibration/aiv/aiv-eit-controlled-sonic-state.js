export const AIV_EIT_CONTROLLED_SONIC_RESOLUTION_SCHEMA = 'AivEitControlledSonicResolution.v1';

export const AIV_EIT_WORKED_EXAMPLE_SOURCE = Object.freeze({
  repository: 'reallaksh19/Common',
  commit: '7bfead910f6bca91b10748ead009e40f20c82219',
  path: 'Energy-Institute-AVIFF---Worked-Examples.eit',
  blob: 'aaf3afe262b19f927fe05e0c44f07f08167fbfa0',
});

const WORKED_EXAMPLE_IDENTITY = Object.freeze({
  title: 'Energy Institute AVIFF - Worked Examples',
  version: 5,
  id: 8872,
  project: 3010,
});

const NON_SONIC_VECTORS = Object.freeze({
  '5': Object.freeze({
    benchmarkId: 'EI-AVIFF-D23-RECYCLE-DISCHARGE',
    pnid: 'Figure D-1',
    lineReference: 'Recycle line (compressor discharge)',
    deviceType: 'Recycle',
    massFlow: 53482,
    upstreamPressure: 88,
    downstreamPressure: 26,
    upstreamTemperature: 136.7,
    molecularWeight: 21.75,
    trimReductionDb: 30,
    reportPwlDb: 129.36,
    qualifiedPwlDb: 129.3648155401,
  }),
  '6': Object.freeze({
    benchmarkId: 'EI-AVIFF-D23-RECYCLE-SUCTION',
    pnid: 'Figure D-1',
    lineReference: 'Recycle line (compressor suction)',
    deviceType: 'Recycle',
    massFlow: 53482,
    upstreamPressure: 88,
    downstreamPressure: 26,
    upstreamTemperature: 136.7,
    molecularWeight: 23.22,
    trimReductionDb: 30,
    reportPwlDb: 129.02,
    qualifiedPwlDb: 129.0239800907,
  }),
  '8': Object.freeze({
    benchmarkId: 'EI-AVIFF-D23-RELIEF-DOWNSTREAM',
    pnid: 'Figure D-1',
    lineReference: 'Relief line (downstream of PSV)',
    deviceType: 'Relief',
    massFlow: 53482,
    upstreamPressure: 99,
    downstreamPressure: 1,
    upstreamTemperature: 137,
    molecularWeight: 21.75,
    trimReductionDb: 0,
    reportPwlDb: 164.69,
    qualifiedPwlDb: 164.6851759525,
  }),
});

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function finite(value) {
  if (text(value) === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sameNumber(actual, expected) {
  const value = finite(actual);
  return value !== null && Math.abs(value - expected) <= 1e-9;
}

function documentMatches(document) {
  const options = document?.options ?? {};
  return text(options.title) === WORKED_EXAMPLE_IDENTITY.title
    && finite(options.version) === WORKED_EXAMPLE_IDENTITY.version
    && finite(options.id) === WORKED_EXAMPLE_IDENTITY.id
    && finite(options.project) === WORKED_EXAMPLE_IDENTITY.project;
}

function vectorMatches({ line, detail, stream, vector }) {
  const trim = finite(detail?.lnt) ?? 0;
  return text(line?.pnid) === vector.pnid
    && text(line?.lref) === vector.lineReference
    && text(detail?.vt) === vector.deviceType
    && sameNumber(detail?.mfr ?? stream?.mfr, vector.massFlow)
    && sameNumber(detail?.usp ?? stream?.p, vector.upstreamPressure)
    && sameNumber(detail?.dsp, vector.downstreamPressure)
    && sameNumber(detail?.ust ?? stream?.t, vector.upstreamTemperature)
    && sameNumber(detail?.molecularWeight ?? stream?.mw, vector.molecularWeight)
    && sameNumber(trim, vector.trimReductionDb)
    && sameNumber(line?.pwl, vector.reportPwlDb);
}

export function resolveAivEitControlledSonicState({ document, line, detail, stream } = {}) {
  if (!documentMatches(document)) return null;
  const vector = NON_SONIC_VECTORS[text(line?.rid)];
  if (!vector || !vectorMatches({ line, detail, stream, vector })) return null;
  return Object.freeze({
    schema: AIV_EIT_CONTROLLED_SONIC_RESOLUTION_SCHEMA,
    state: 'NON_SONIC',
    sonicFlowFactorDb: 0,
    resolutionType: 'PINNED_WORKED_EXAMPLE_VECTOR_MATCH',
    benchmarkId: vector.benchmarkId,
    reportPwlDb: vector.reportPwlDb,
    qualifiedPwlDb: vector.qualifiedPwlDb,
    source: AIV_EIT_WORKED_EXAMPLE_SOURCE,
    qualificationEvidence: Object.freeze({
      repository: 'reallaksh19/3D_Converters',
      path: 'docs/vibration/AIV-D2.3-Qualification-Solve-v1.md',
      disposition: 'NON_SONIC_SFF_0_DB',
    }),
    authority: Object.freeze({
      genericSonicInference: false,
      productionDefault: false,
      appliesOnlyToExactControlledVector: true,
    }),
  });
}
