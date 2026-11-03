export const RVM_STAGE_SCHEMA = 'RvmStageModel.v1';
export const RVM_STAGE_DIAGNOSTICS_SCHEMA = 'RvmStageDiagnostics.v1';
export const RVM_STAGE_CONTRACT_VERSION = '20260630-rvm-stage-model-v1-hardening-1';

export const STAGE_RENDER_QUALITIES = Object.freeze([
  'full',
  'medium',
  'light',
  'skeleton',
  'hidden',
]);

export const STAGE_RENDER_KINDS = Object.freeze([
  'CYLINDER',
  'BOX',
  'SPHERE',
  'ELBOW',
  'TEE',
  'FLANGE',
  'VALVE_ASSEMBLY',
  'SUPPORT_ASSEMBLY',
  'FOUNDATION',
  'STRUCTURAL_MEMBER',
  'FACET_GROUP',
  'MESH_CHUNK',
  'UNKNOWN_DIAGNOSTIC',
]);

export const STAGE_SEMANTIC_TYPES = Object.freeze([
  'PIPE',
  'ELBOW',
  'TEE',
  'FLANGE',
  'VALVE',
  'SUPPORT',
  'FOUNDATION',
  'STRUCTURAL_MEMBER',
  'T_POST',
  'PLATE',
  'BRACKET',
  'UNKNOWN',
]);

export const STAGE_GEOMETRY_CONFIDENCE = Object.freeze([
  'native',
  'derived',
  'semantic-proxy',
  'diagnostic',
]);

export const STAGE_SEMANTIC_CONFIDENCE = Object.freeze([
  'attribute',
  'name-rule',
  'geometry-rule',
  'unknown',
]);

export const STAGE_DIAGNOSTIC_SEVERITIES = Object.freeze([
  'info',
  'warning',
  'error',
]);

export const STAGE_DIAGNOSTIC_CODES = Object.freeze([
  'STAGE_FALLBACK_UNKNOWN_NATIVE_CODE',
  'STAGE_FALLBACK_SEMANTIC_ONLY_GEOMETRY',
  'STAGE_INVALID_RENDER_KIND',
  'STAGE_INVALID_BBOX',
  'STAGE_MISSING_RENDER_POLICY',
  'STAGE_MISSING_ID',
  'STAGE_UNDECODED_NATIVE_PRIMITIVE',
]);
