import {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  ENGINEERING_CALCULATION_RESULT_VERSION,
  ENGINEERING_CALCULATION_BATCH_VERSION,
  ENGINEERING_CALCULATION_FAMILIES,
  ENGINEERING_CALCULATION_FAMILY_LABELS,
  immutableEngineeringSnapshot,
} from './contracts.js';
import { createEngineeringCalculationRegistry } from './registry.js';
import { createEngineeringCalculationEngine } from './engine.js';
import {
  ACTIVE_ENGINEERING_CALCULATION_DEFINITIONS,
  DEFAULT_ENGINEERING_CALCULATION_DEFINITIONS,
  createDefaultEngineeringCalculationRegistry,
} from './default-registry.js';
import { PENDING_ENGINEERING_CALCULATION_DEFINITIONS } from './pending-definitions.js';
import { B313_ENGINEERING_CALCULATION_DEFINITIONS } from './adapters/b313.js';
import {
  B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ENGINEERING_CALCULATION_DEFINITION,
  B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID,
} from './adapters/b313-chapter-ix-user-calculated-fatigue.js';
import { EMPIRICAL_WEIGHT_ENGINEERING_CALCULATION_DEFINITION } from './adapters/empirical-weight.js';
import { VIBRATION_AIV_ENGINEERING_CALCULATION_DEFINITION } from './adapters/vibration-aiv.js';
import { VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION } from './adapters/vibration-fit.js';

const DEFAULT_REGISTRY = createDefaultEngineeringCalculationRegistry();
const DEFAULT_ENGINE = createEngineeringCalculationEngine({ registry: DEFAULT_REGISTRY });
const NON_AVAILABLE_STATES = new Set(['CONCEPT', 'SOURCE_INVENTORIED', 'METHOD_SPECIFIED', 'BLOCKED']);

function isAvailable(definition) {
  const state = definition.authority?.qualificationState ?? definition.authority?.calculationState ?? 'CONCEPT';
  return !NON_AVAILABLE_STATES.has(state);
}

export function listEngineeringCalculationFamilies() {
  return DEFAULT_REGISTRY.listFamilies();
}

export function listEngineeringCalculations(options = {}) {
  const definitions = DEFAULT_REGISTRY.list(options);
  const filtered = options.availableOnly === true || options.includeBlocked === false
    ? definitions.filter(isAvailable)
    : definitions;
  return Object.freeze([...filtered]);
}

export function getEngineeringCalculationDefinition(calculationId) {
  return DEFAULT_REGISTRY.get(calculationId);
}

export function getEngineeringCalculationQualification(calculationId) {
  const definition = DEFAULT_REGISTRY.get(calculationId);
  if (!definition) return null;
  return immutableEngineeringSnapshot({
    calculationId: definition.id,
    family: definition.family,
    calculationState: definition.authority?.calculationState ?? null,
    qualificationState: definition.authority?.qualificationState ?? null,
    codeCompliance: Boolean(definition.authority?.codeCompliance),
    methodRevision: definition.methodRevision,
    qualificationIssue: definition.qualificationIssue ?? null,
    limitations: definition.applicability?.limitations ?? [],
  });
}

export function validateEngineeringCalculationInput(calculationId, input = {}, options = {}) {
  return DEFAULT_ENGINE.validate(calculationId, input, options);
}

export function resolveEngineeringCalculationInputs(calculationId, input = {}, context = {}, options = {}) {
  return immutableEngineeringSnapshot(DEFAULT_ENGINE.resolve(calculationId, input, context, options));
}

export function calculateEngineering(request) {
  return DEFAULT_ENGINE.calculate(request);
}

export function calculateEngineeringBatch(batchRequest) {
  return DEFAULT_ENGINE.calculateBatch(batchRequest);
}

export {
  ENGINEERING_CALCULATION_CONTRACT_VERSION,
  ENGINEERING_CALCULATION_RESULT_VERSION,
  ENGINEERING_CALCULATION_BATCH_VERSION,
  ENGINEERING_CALCULATION_FAMILIES,
  ENGINEERING_CALCULATION_FAMILY_LABELS,
  createEngineeringCalculationRegistry,
  createEngineeringCalculationEngine,
  createDefaultEngineeringCalculationRegistry,
  ACTIVE_ENGINEERING_CALCULATION_DEFINITIONS,
  DEFAULT_ENGINEERING_CALCULATION_DEFINITIONS,
  PENDING_ENGINEERING_CALCULATION_DEFINITIONS,
  B313_ENGINEERING_CALCULATION_DEFINITIONS,
  B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ENGINEERING_CALCULATION_DEFINITION,
  B313_CHAPTER_IX_USER_CALCULATED_FATIGUE_ID,
  EMPIRICAL_WEIGHT_ENGINEERING_CALCULATION_DEFINITION,
  VIBRATION_AIV_ENGINEERING_CALCULATION_DEFINITION,
  VIBRATION_FIT_ENGINEERING_CALCULATION_DEFINITION,
};
