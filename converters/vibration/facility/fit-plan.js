import { VIBRATION_INTEGRITY_DATASET_SCHEMA } from '../dataset/schema.js';
import {
  VIBRATION_FACILITY_FIT_CALCULATION_ID,
  VIBRATION_FACILITY_FIT_PLAN_SCHEMA,
  fitFacilityPlanError,
  normalizeFitFacilityQualificationMode,
} from './fit-plan-contract.js';
import { buildFitFacilityPlanContext } from './fit-plan-context.js';
import {
  buildFitFacilityNoCaseItem,
  buildFitFacilityPlanItem,
} from './fit-plan-item.js';

export {
  FIT_FACILITY_ENRICHMENT_PROPERTIES,
  FIT_FACILITY_QUALIFICATION_MODES,
  VIBRATION_FACILITY_FIT_CALCULATION_ID,
  VIBRATION_FACILITY_FIT_PLAN_SCHEMA,
} from './fit-plan-contract.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertDataset(dataset) {
  if (dataset?.schema !== VIBRATION_INTEGRITY_DATASET_SCHEMA) {
    throw fitFacilityPlanError(
      'FIT_FACILITY_DATASET_SCHEMA_MISMATCH',
      `FIT facility planning requires ${VIBRATION_INTEGRITY_DATASET_SCHEMA}.`,
      { actual: dataset?.schema ?? null },
    );
  }
  if (!Array.isArray(dataset.lines) || !Array.isArray(dataset.operatingCases) || !Array.isArray(dataset.enrichment)) {
    throw fitFacilityPlanError(
      'FIT_FACILITY_DATASET_INVALID',
      'Dataset lines, operatingCases and enrichment must be arrays.',
    );
  }
  return dataset;
}

function buildItems(context, qualificationMode) {
  const items = [];
  for (const point of context.points) {
    const cases = point.line ? context.casesByLine.get(point.line) ?? [] : [];
    if (!cases.length) {
      items.push(buildFitFacilityNoCaseItem(point));
      continue;
    }
    for (const operatingCase of cases) {
      items.push(buildFitFacilityPlanItem(point, operatingCase, context.index, qualificationMode));
    }
  }
  return items.sort((a, b) => String(a.line ?? '').localeCompare(String(b.line ?? ''))
    || a.canonicalId.localeCompare(b.canonicalId)
    || String(a.caseId ?? '').localeCompare(String(b.caseId ?? '')));
}

function planWarnings(dataset, assessmentPointCount) {
  return [
    ...(assessmentPointCount === 0 ? [{
      code: 'NO_FIT_ASSESSMENT_POINTS',
      message: 'No enrichment rows mark FIT_ASSESSMENT_POINT=true.',
    }] : []),
    ...(dataset.exchangeIntegrityStatus === 'LIMITED_ELEMENTS_ONLY' ? [{
      code: 'LIMITED_EXCHANGE_INPUT',
      message: 'FIT planning is based on an explicitly accepted limited Elements-only exchange.',
    }] : []),
  ];
}

export function buildVibrationFacilityFitPlan(datasetInput = {}, options = {}) {
  const dataset = assertDataset(datasetInput);
  const qualificationMode = normalizeFitFacilityQualificationMode(options.qualificationMode ?? 'benchmark');
  const context = buildFitFacilityPlanContext(dataset);
  const items = buildItems(context, qualificationMode);
  const ready = items.filter((item) => item.status === 'READY').length;
  const screening = qualificationMode === 'screening';

  return deepFreeze({
    schema: VIBRATION_FACILITY_FIT_PLAN_SCHEMA,
    authority: 'REQUEST_PLANNING_ONLY',
    engineeringAuthority: screening ? 'SCREENING' : 'NONE',
    screeningAuthorized: screening,
    calculationId: VIBRATION_FACILITY_FIT_CALCULATION_ID,
    qualificationMode,
    datasetSchema: dataset.schema,
    datasetExchangeIntegrityStatus: dataset.exchangeIntegrityStatus ?? null,
    items,
    counts: {
      assessmentPoints: context.points.length,
      items: items.length,
      ready,
      notReady: items.length - ready,
    },
    warnings: planWarnings(dataset, context.points.length),
  });
}
