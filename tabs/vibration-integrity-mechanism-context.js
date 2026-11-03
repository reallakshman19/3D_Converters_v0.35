import {
  buildFitMechanismBenchmarkComparison,
  buildFitVibrationMechanismAssessmentSet,
} from '../converters/vibration/mechanisms/index.js';
import {
  buildVibrationEngineeringBasisProjection,
  vibrationEngineeringBasisSourceCellId,
} from './vibration-integrity-engineering-basis.js';

const FIT_FIELD_BINDINGS = Object.freeze({
  phase: ['process', 'phase'],
  massFlow: ['process', 'massFlow'],
  density: ['process', 'density'],
  gasDynamicViscosity: ['process', 'viscosity'],
  fluidVelocity: ['process', 'velocity'],
  outsideDiameter: ['fit', 'outsideDiameter'],
  wallThickness: ['fit', 'wallThickness'],
  insideDiameter: ['fit', 'insideDiameter'],
  maximumUnsupportedSpan: ['fit', 'span'],
  naturalFrequency: ['fit', 'naturalFrequency'],
});

function sameIdentity(row, detail) {
  return row.line === detail.line
    && row.caseId === (detail.caseId ?? null)
    && row.canonicalId === detail.canonicalId;
}

function boundField(row, binding) {
  return row?.[binding[0]]?.[binding[1]] ?? null;
}

function cellTrace(field) {
  if (!field?.valueRef) return null;
  return Object.freeze({
    valueRef: field.valueRef,
    unitRef: field.unitRef ?? null,
    sourceSelection: field.sourceSelection ?? null,
    sourceAnchorId: vibrationEngineeringBasisSourceCellId(field.valueRef),
  });
}

export function buildFitWorkingCellTrace(state, detailSummary) {
  if (!state?.tables || !detailSummary) return Object.freeze({});
  const projection = buildVibrationEngineeringBasisProjection(state.tables);
  const row = projection.rows.find((candidate) => sameIdentity(candidate, detailSummary));
  if (!row) return Object.freeze({});
  const trace = {};
  for (const [inputKey, binding] of Object.entries(FIT_FIELD_BINDINGS)) {
    const value = cellTrace(boundField(row, binding));
    if (value) trace[inputKey] = value;
  }
  return Object.freeze(trace);
}

export function buildSelectedFitMechanismAssessmentSet(state) {
  const detail = state?.workspace?.detail;
  if (!detail?.summary) return null;
  const benchmark = buildFitMechanismBenchmarkComparison({
    benchmark: state.benchmark?.loaded ?? null,
    actual: detail.summary,
    resultState: state.resultState,
  });
  return buildFitVibrationMechanismAssessmentSet({
    row: detail.summary,
    fitDetail: detail.fitMechanism ?? null,
    resultState: state.resultState ?? null,
    benchmark,
    workingCells: buildFitWorkingCellTrace(state, detail.summary),
  });
}
