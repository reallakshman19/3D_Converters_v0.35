import { deepFreezeVibrationMaster } from './canonical.js';
import { buildVibrationMasterRegistry, inspectVibrationMasterCandidate } from './registry.js';

const SOURCE = Object.freeze({
  repository: 'reallaksh19/Advanced_Analysis',
  commit: '6111ddbc0f27dd95b50a80c569a2c4daba3b3921',
  path: 'docs/EI data/P0_SBC_Master_Data.md',
  gitBlobSha1: '5312c9e2cf86af9e940ba722fcbee64702aeccd3',
  sizeBytes: 21154,
});

const COMMON = Object.freeze({
  schema: 'VibrationMaster.v1', methodId: 'VIB.SBC.T3.TYPE3',
  edition: 'EI AVIFF 2nd Edition (2008)', revision: 'AA-6111DDBC-STAGE1',
  authorityClass: 'EI_METHOD_MASTER', publicationState: 'CANDIDATE',
  applicability: { sbcNominalSizeInMin: 0.25, sbcNominalSizeInMax: 2.0 },
});

export const EI_AVIFF_SBC_T3_MASTER_IDS = Object.freeze({
  fittingSpanFactors: 'EI_AVIFF.T3.TABLE_T3_1.FITTING_SPAN_FACTORS',
  firstSpanLimits: 'EI_AVIFF.T3.TABLE_T3_2.FIRST_SPAN_LIMITS',
  betweenMainLinesLimits: 'EI_AVIFF.T3.TABLE_T3_3.BETWEEN_MAIN_LINES_LIMITS',
});

const FITTING_ROWS = Object.freeze([
  ['SHORT_CONTOURED_BODY', 1.0], ['CONTOURED_BODY', 0.85], ['FORGED_REDUCING_TEE', 0.85],
  ['WELDED_TEE', 0.85], ['WELDOLET', 0.7], ['THREADOLET_FULLY_BACK_WELDED', 0.7],
  ['SCREWED_FULLY_BACK_WELDED', 0.7], ['THREADOLET', 0.65], ['SCREWED', 0.65],
  ['SOCKOLET', 0.65], ['THREADOLET_PARTIALLY_BACK_WELDED', 0.6],
  ['SCREWED_PARTIALLY_BACK_WELDED', 0.6], ['SET_ON', 0.55], ['SET_IN', 0.55], ['SET_THRU', 0.55],
].map(([fittingKey, fittingSpanFactor], index) => Object.freeze({
  rowId: `T3-FSF-${String(index + 1).padStart(3, '0')}`, fittingKey, fittingSpanFactor,
})));

const FIRST_SPAN_ROWS = Object.freeze([
  [0.25, 0.7], [0.375, 0.8], [0.5, 0.8], [0.75, 0.9],
  [1.0, 1.1], [1.25, 1.2], [1.5, 1.3], [2.0, 1.4],
].map(([sbcSizeIn, minimumAllowableFirstSpanM], index) => Object.freeze({
  rowId: `T3-FSL-${String(index + 1).padStart(3, '0')}`, sbcSizeIn, minimumAllowableFirstSpanM,
})));

const BETWEEN_ROWS = Object.freeze([
  [0.25, 1.0], [0.375, 1.1], [0.5, 1.1], [0.75, 1.3],
  [1.0, 1.6], [1.25, 1.7], [1.5, 1.8], [2.0, 2.0],
].map(([sbcSizeIn, minimumSpanBetweenMainLinesM], index) => Object.freeze({
  rowId: `T3-BML-${String(index + 1).padStart(3, '0')}`, sbcSizeIn, minimumSpanBetweenMainLinesM,
})));

function source(locator) {
  return { ...SOURCE, locator };
}

const MASTERS = Object.freeze([
  Object.freeze({
    ...COMMON,
    masterId: EI_AVIFF_SBC_T3_MASTER_IDS.fittingSpanFactors,
    source: source({ sourceType: 'TABLE', identifier: 'Table T3-1', section: 'T3', printedPage: 81, pdfPage: 89 }),
    dataSchema: 'SbcT3FittingSpanFactorTable.v1', data: FITTING_ROWS,
  }),
  Object.freeze({
    ...COMMON,
    masterId: EI_AVIFF_SBC_T3_MASTER_IDS.firstSpanLimits,
    source: source({ sourceType: 'TABLE', identifier: 'Table T3-2', section: 'T3', printedPage: 81, pdfPage: 89 }),
    dataSchema: 'SbcT3FirstSpanLimitTable.v1', data: FIRST_SPAN_ROWS,
  }),
  Object.freeze({
    ...COMMON,
    masterId: EI_AVIFF_SBC_T3_MASTER_IDS.betweenMainLinesLimits,
    source: source({ sourceType: 'TABLE', identifier: 'Table T3-3', section: 'T3', printedPage: 82, pdfPage: 90 }),
    dataSchema: 'SbcT3BetweenMainLinesLimitTable.v1', data: BETWEEN_ROWS,
  }),
]);

export const EI_AVIFF_SBC_T3_CURVE_QUARANTINE = deepFreezeVibrationMaster({
  schema: 'SbcT3CurveQuarantine.v1',
  source: SOURCE,
  status: 'BLOCKED_SOURCE_DATA_CONFLICT',
  figures: ['T3-1', 'T3-2', 'T3-3', 'T3-4'],
  failingWorkedExampleProbes: [
    { figure: 'T3-1', diameterIn: 1.5, spanM: 1.2857142857142858, expectedLof: 0.2, suppliedLof: 0.4 },
    { figure: 'T3-3', diameterIn: 1.5, spanM: 2.3, expectedLof: 0.6, suppliedLof: 0.7 },
    { figure: 'T3-4', diameterIn: 1.5, spanM: 1.4, expectedLof: 0.2, suppliedLof: 0.3 },
  ],
  runtimeCurveActivation: false,
  masterPublicationAuthorized: false,
  authority: {
    engineeringAuthority: 'NONE', screeningAuthority: 'NOT_AUTHORIZED',
    designAuthority: false, masterDataAuthority: false,
  },
});

export async function buildEiAviffSbcT3CandidateRegistry() {
  return buildVibrationMasterRegistry(MASTERS);
}

function exactNumericRow(rows, field, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError('SBC_T3_MASTER_SELECTOR_INVALID');
  return rows.find((row) => row[field] === number) ?? null;
}

function lookupRow(master, selector = {}) {
  if (master.masterId === EI_AVIFF_SBC_T3_MASTER_IDS.fittingSpanFactors) {
    const key = String(selector.fittingKey ?? '').trim();
    if (!key) throw new TypeError('SBC_T3_FITTING_KEY_REQUIRED');
    return master.data.find((row) => row.fittingKey === key) ?? null;
  }
  return exactNumericRow(master.data, 'sbcSizeIn', selector.sbcSizeIn);
}

export async function inspectEiAviffSbcT3TableCandidate(masterId, selector) {
  const registry = await buildEiAviffSbcT3CandidateRegistry();
  const inspected = await inspectVibrationMasterCandidate(registry, masterId);
  const row = lookupRow(inspected.master, selector);
  if (!row) throw new Error('SBC_T3_MASTER_GRID_MISS');
  return deepFreezeVibrationMaster({
    schema: 'SbcT3CandidateTableResolution.v1', status: 'CANDIDATE_ONLY', row,
    provenance: inspected.provenance, authority: inspected.authority,
  });
}

export function resolveEiAviffSbcT3CurveCandidate(figureId) {
  const figure = String(figureId ?? '').trim();
  if (!EI_AVIFF_SBC_T3_CURVE_QUARANTINE.figures.includes(figure)) {
    throw new Error('SBC_T3_CURVE_UNKNOWN');
  }
  return deepFreezeVibrationMaster({
    schema: 'SbcT3CurveCandidateResolution.v1', figureId: figure,
    status: 'BLOCKED_SOURCE_DATA_CONFLICT', value: null,
    quarantine: EI_AVIFF_SBC_T3_CURVE_QUARANTINE,
  });
}