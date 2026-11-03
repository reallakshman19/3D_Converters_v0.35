/**
 * Vendored subset of third_party/pipe-component-data for use inside the
 * deployed viewer artifact (only viewer/ is published to GitHub Pages).
 *
 * Source: third_party/pipe-component-data/src/db/ and src/db/datasets/
 *
 * Keep in sync with third_party/pipe-component-data when that source changes.
 */

// ── matchers ──────────────────────────────────────────────────────────────────

function norm(value) { return String(value ?? '').trim().toUpperCase(); }
function same(a, b) { return norm(a) === norm(b); }

function miss(code, query) {
  return { ok: false, code, message: code, query: { ...(query || {}) } };
}

function hit(row, matchKey, provenance) {
  return { ok: true, row, matchKey, provenance };
}

// ── provenance ────────────────────────────────────────────────────────────────

const REQUIRED_PROVENANCE_FIELDS = Object.freeze([
  'standard', 'source', 'datasetVersion', 'dataStatus',
]);

function rowProvenance(row) {
  return REQUIRED_PROVENANCE_FIELDS.reduce((acc, field) => {
    acc[field] = row?.[field] ?? '';
    return acc;
  }, {});
}

export function validateDatasetProvenance(datasets) {
  const failures = [];
  for (const [datasetName, rows] of Object.entries(datasets || {})) {
    for (const [index, row] of (rows || []).entries()) {
      for (const field of REQUIRED_PROVENANCE_FIELDS) {
        if (!row?.[field]) failures.push({ datasetName, index, field });
      }
    }
  }
  return { ok: failures.length === 0, failures };
}

// ── datasets ──────────────────────────────────────────────────────────────────

const PIPE_SCHEDULES = Object.freeze([
  {
    standard: 'ASME B36.10M',
    source: 'published-spot-check:B36.10-4in-sch40',
    datasetVersion: 'pipedata-db/2026.06.phase4',
    dataStatus: 'VERIFIED_SCREENING',
    nps: '4', dn: '100', schedule: '40',
    odMm: 114.3, wallMm: 6.02, idMm: 102.26,
    weightKgPerM: 16.07, materialDensityKgM3: 7850,
  },
]);

const VALVES = Object.freeze([
  {
    standard: 'ASME B16.10',
    source: 'PipeData Vlfl/VLV1150.csv',
    datasetVersion: 'pipedata-db/2026.06.phase4',
    dataStatus: 'VERIFIED_SCREENING',
    componentCode: 'Vlfl1', valveType: 'GATE', endType: 'FLANGED',
    nps: '8', dn: '200', classRating: '150', facing: 'RF',
    ffRfMm: 292, ffRtjMm: 305, ffBwMm: 419, boreMm: 203,
    heightMm: 960, handwheelDiaMm: 350, weightKg: 144,
  },
  {
    standard: 'ASME B16.10',
    source: 'PipeData sketch-only Vlbw1',
    datasetVersion: 'pipedata-db/2026.06.phase5',
    dataStatus: 'SKETCH_ONLY',
    componentCode: 'Vlbw1', valveType: 'GATE', endType: 'BW',
    nps: '8', dn: '200', classRating: '150', facing: 'BW',
  },
]);

const FLANGES = Object.freeze([
  {
    standard: 'ASME B16.5',
    source: 'PipeData Flan/Flg300.csv',
    datasetVersion: 'pipedata-db/2026.06.phase4',
    dataStatus: 'VERIFIED_SCREENING',
    subtype: 'WN', nps: '4', dn: '100', classRating: '300', facing: 'RF',
    flangeOdMm: 255, flangeThicknessMm: 30.2, hubDiaMm: 146,
    weldDiaMm: 114.3, hubLengthMm: 84, rfDiaMm: 157.2, rfHeightMm: 2,
    pcdMm: 200, boltCount: 8, boltSize: 'M20', weightKg: 11.4,
  },
]);

const FITTINGS = Object.freeze([
  {
    standard: 'ASME B16.9',
    source: 'published-spot-check:B16.9-4in-lr90',
    datasetVersion: 'pipedata-db/2026.06.phase4',
    dataStatus: 'VERIFIED_SCREENING',
    subtype: 'ELBOW_90_LR', nps: '4', dn: '100', schedule: '40',
    angleDeg: 90, centerlineRadiusMm: 152.4, developedLengthMm: 239.39,
  },
]);

const COMPONENT_WEIGHTS = Object.freeze([
  {
    standard: 'PROJECT_WEIGHT_MASTER',
    source: 'PipeData Vlfl/VLV1150.csv',
    datasetVersion: 'pipedata-db/2026.06.phase4',
    dataStatus: 'VERIFIED_SCREENING',
    componentType: 'VALVE', subtype: 'GATE', nps: '8',
    classRating: '150', weightKg: 144,
  },
]);

const SUPPORT_DEFAULTS = Object.freeze([
  {
    standard: 'PROJECT_SUPPORT_DEFAULTS',
    source: 'adapter-default:support-shoe',
    datasetVersion: 'pipedata-db/2026.06.phase5',
    dataStatus: 'SCREENING_SAMPLE',
    supportKind: 'SHOE', shoeHeightMm: 150, baseLengthMm: 300, baseWidthMm: 120,
  },
  {
    standard: 'PROJECT_SUPPORT_DEFAULTS',
    source: 'adapter-default:support-guide',
    datasetVersion: 'pipedata-db/2026.06.phase5',
    dataStatus: 'SCREENING_SAMPLE',
    supportKind: 'GUIDE', guideGapMm: 5, guidePlateHeightMm: 180,
  },
]);

export const PHASE4_DATASETS = Object.freeze({
  pipeSchedules: PIPE_SCHEDULES,
  valves: VALVES,
  flanges: FLANGES,
  fittings: FITTINGS,
  componentWeights: COMPONENT_WEIGHTS,
  supportDefaults: SUPPORT_DEFAULTS,
});

// ── createPipeDataDb ──────────────────────────────────────────────────────────

function findPipe(rows, q) {
  return rows.find((r) => same(r.nps, q.nps) && same(r.schedule, q.schedule));
}
function findFlange(rows, q) {
  return rows.find((r) => same(r.subtype, q.subtype || 'WN')
    && same(r.nps, q.nps) && same(r.classRating, q.classRating)
    && same(r.facing, q.facing || 'RF'));
}
function findValve(rows, q) {
  return rows.find((r) => same(r.valveType, q.valveType)
    && same(r.nps, q.nps) && same(r.classRating, q.classRating)
    && same(r.facing, q.facing || 'RF'));
}
function findFitting(rows, q) {
  return rows.find((r) => same(r.subtype, q.subtype)
    && same(r.nps, q.nps) && same(r.schedule, q.schedule));
}
function findWeight(rows, q) {
  return rows.find((r) => same(r.componentType, q.componentType)
    && same(r.subtype, q.subtype) && same(r.nps, q.nps)
    && same(r.classRating, q.classRating));
}

function wrap(row, code, query, keyFn) {
  return row ? hit(row, keyFn(row), rowProvenance(row)) : miss(code, query);
}

const pipeKey = (r) => `PIPE|NPS${r.nps}|SCH${r.schedule}`;
const flangeKey = (r) => `FLANGE|${r.subtype}|NPS${r.nps}|CL${r.classRating}|${r.facing}`;
const valveKey = (r) => `VALVE|${r.valveType}|NPS${r.nps}|CL${r.classRating}|${r.facing}`;
const fittingKey = (r) => `FITTING|${r.subtype}|NPS${r.nps}|SCH${r.schedule}`;
const weightKey = (r) => `WEIGHT|${r.componentType}|${r.subtype}|NPS${r.nps}|CL${r.classRating}`;

export function createPipeDataDb(datasets = PHASE4_DATASETS) {
  return {
    datasets,
    validateProvenance: () => validateDatasetProvenance(datasets),
    lookupPipe: (q) => wrap(findPipe(datasets.pipeSchedules, q), 'PIPE_LOOKUP_MISS', q, pipeKey),
    lookupFlange: (q) => wrap(findFlange(datasets.flanges, q), 'FLANGE_LOOKUP_MISS', q, flangeKey),
    lookupValve: (q) => wrap(findValve(datasets.valves, q), 'VALVE_LOOKUP_MISS', q, valveKey),
    lookupFitting: (q) => wrap(findFitting(datasets.fittings, q), 'FITTING_LOOKUP_MISS', q, fittingKey),
    lookupWeight: (q) => wrap(findWeight(datasets.componentWeights, q), 'WEIGHT_LOOKUP_MISS', q, weightKey),
  };
}
