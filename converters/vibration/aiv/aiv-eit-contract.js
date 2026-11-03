export const AIV_EIT_SCHEMA = 'EnergyInstituteEit.v5';
export const AIV_EIT_VERSION = 5;

export const AIV_EIT_REFERENCE = Object.freeze({
  repository: 'reallaksh19/Common',
  commit: '3c8ddb89044061dd26f593604d4b547438c006f0',
  path: 'Energy-Institute-AVIFF---Worked-Examples.eit',
  gitBlobSha1: 'aaf3afe262b19f927fe05e0c44f07f08167fbfa0',
  sizeBytes: 10414,
  expected: Object.freeze({ lines: 12, pipes: 7, streams: 15, aivLines: 3 }),
});

export const AIV_EIT_AUTHORITY_POLICY = Object.freeze({
  screeningResultScope: 'ASSESSMENT',
  lineCaseSummaryAuthoritativeForScreening: false,
  lineAivSource: 'MAX_AUTHORITATIVE_ASSESSMENT_LOF',
  configuredLineCaseTraceMayPopulateLineAiv: false,
  designAuthority: false,
});

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function assertAivEitV5Document(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('EI .eit v5 document must be an object.');
  }
  if (Number(value.options?.version) !== AIV_EIT_VERSION) {
    throw new TypeError('EI .eit compatibility requires options.version = 5.');
  }
  for (const key of ['lines', 'pipes', 'streams']) {
    if (!Array.isArray(value[key])) throw new TypeError(`EI .eit v5 requires ${key} array.`);
  }
  for (const line of value.lines) {
    if (String(line.modules ?? '').split(',').includes('aiv')) {
      if (typeof line.aiv_data !== 'string') {
        throw new TypeError('EI .eit AIV line requires stringified aiv_data.');
      }
      const parsed = JSON.parse(line.aiv_data);
      if (!Array.isArray(parsed)) throw new TypeError('EI .eit aiv_data must decode to an array.');
      if (finite(line.aiv) === null) throw new TypeError('EI .eit AIV line requires finite aiv.');
    }
  }
  return value;
}

export function verifyAivEitV5ReferenceShape(value) {
  assertAivEitV5Document(value);
  const aivLines = value.lines.filter((line) => String(line.modules ?? '').split(',').includes('aiv'));
  const observed = {
    lines: value.lines.length,
    pipes: value.pipes.length,
    streams: value.streams.length,
    aivLines: aivLines.length,
  };
  for (const [key, expected] of Object.entries(AIV_EIT_REFERENCE.expected)) {
    if (observed[key] !== expected) {
      throw new Error(`AIV_EIT_REFERENCE_DRIFT: expected ${key}=${expected}; observed ${observed[key]}.`);
    }
  }
  const aivValues = aivLines.map((line) => Number(line.aiv));
  if (!aivValues.some((value) => Math.abs(value - 0.29) < 1e-12)) {
    throw new Error('AIV_EIT_REFERENCE_DRIFT: historical AIV 0.29 anchor missing.');
  }
  if (!aivValues.some((value) => Math.abs(value - 1.48) < 1e-12)) {
    throw new Error('AIV_EIT_REFERENCE_DRIFT: historical AIV 1.48 anchor missing.');
  }
  return Object.freeze(observed);
}
