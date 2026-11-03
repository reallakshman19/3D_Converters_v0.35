export const STAGE_JSON_INPUT_CLASSIFIER_VERSION = '20260702-stage-json-input-classifier-v1';

export function classifyStageJsonInput(value) {
  if (isAttManagedHierarchy(value)) return { kind: 'att-managed-hierarchy', code: 'STAGE_JSON_ATT_MANAGED_HIERARCHY_NOT_STAGE_MODEL', message: 'This JSON is an ATT-managed hierarchy export, not RvmStageModel.v1. Load a valid RvmStageModel.v1 JSON, or import the RVM binary through the RVM evidence pipeline.' };
  return { kind: 'unknown-or-stage-model' };
}

export function isAttManagedHierarchy(value) {
  return Array.isArray(value) && value.some((item) => item && typeof item === 'object' && typeof item.name === 'string' && typeof item.type === 'string' && Array.isArray(item.children));
}
