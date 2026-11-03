// Validate transferred FBX worker graphs; only external root "0" may be unresolved.
export const FBX_WORKER_JOB_SCHEMA = 'FbxWorkerJob.v1';
export const FBX_WORKER_MESSAGE_SCHEMA = 'FbxWorkerMessage.v1';
export const FBX_WORKER_OPERATION = 'PARSE_SOURCE_GRAPH';
export const FBX_WORKER_TYPES = Object.freeze({
  ACCEPTED: 'FBX_WORKER_ACCEPTED',
  PROGRESS: 'FBX_WORKER_PROGRESS',
  COMPLETE: 'FBX_WORKER_COMPLETE',
  ERROR: 'FBX_WORKER_ERROR',
});
export const FBX_WORKER_STAGES = Object.freeze(['preflight', 'loading-wasm', 'copying-input', 'parsing-fbx', 'decoding-result', 'enforcing-source-policy', 'preparing-transfer', 'complete']);
export const FBX_WORKER_ERROR_CODES = Object.freeze({
  JOB_INVALID: 'FBX_WORKER_JOB_INVALID',
  PREFLIGHT_EMPTY_INPUT: 'FBX_PREFLIGHT_EMPTY_INPUT',
  PREFLIGHT_SIZE_MISMATCH: 'FBX_PREFLIGHT_SIZE_MISMATCH',
  PREFLIGHT_UNSUPPORTED_HEADER: 'FBX_PREFLIGHT_UNSUPPORTED_HEADER',
  PREFLIGHT_UNSUPPORTED_VERSION: 'FBX_PREFLIGHT_UNSUPPORTED_VERSION',
  ABORTED: 'FBX_WORKER_ABORTED',
  TIMEOUT: 'FBX_WORKER_TIMEOUT',
  RUNTIME_ERROR: 'FBX_WORKER_RUNTIME_ERROR',
  WASM_LOAD_FAILED: 'FBX_WASM_LOAD_FAILED',
  PARSE_REJECTED: 'FBX_PARSE_REJECTED',
  RESULT_DECODE_FAILED: 'FBX_RESULT_DECODE_FAILED',
  SOURCE_GRAPH_POLICY_FAILED: 'FBX_SOURCE_GRAPH_POLICY_FAILED',
});
const KNOWN_TYPES = new Set(Object.values(FBX_WORKER_TYPES));
const KNOWN_CODES = new Set(Object.values(FBX_WORKER_ERROR_CODES));
const ERROR_STAGE_BY_CODE = Object.freeze({
  [FBX_WORKER_ERROR_CODES.PREFLIGHT_EMPTY_INPUT]: 'preflight',
  [FBX_WORKER_ERROR_CODES.PREFLIGHT_SIZE_MISMATCH]: 'preflight',
  [FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_HEADER]: 'preflight',
  [FBX_WORKER_ERROR_CODES.PREFLIGHT_UNSUPPORTED_VERSION]: 'preflight',
  [FBX_WORKER_ERROR_CODES.WASM_LOAD_FAILED]: 'loading-wasm',
  [FBX_WORKER_ERROR_CODES.PARSE_REJECTED]: 'parsing-fbx',
  [FBX_WORKER_ERROR_CODES.RESULT_DECODE_FAILED]: 'decoding-result',
  [FBX_WORKER_ERROR_CODES.SOURCE_GRAPH_POLICY_FAILED]: 'enforcing-source-policy',
});
const SOURCE_GRAPH_KEYS = Object.freeze([
  'schema', 'file', 'documentMetadata', 'globalSettings',
  'sourceObjects', 'occurrences', 'geometries', 'hierarchyEdges',
  'connectionEdges', 'warnings', 'unsupportedRecords',
  'unresolvedReferences', 'duplicateSourceObjectIds',
]);
const SOURCE_GRAPH_ARRAY_KEYS = Object.freeze(SOURCE_GRAPH_KEYS.slice(4));
const SOURCE_ID_PATTERN = /^\d+$/;
const OCCURRENCE_ID_PATTERN = /^occ:\d+$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ELEMENT_TYPE_VALUES = Object.freeze({ UNKNOWN: 0, NODE: 1, MESH: 2, LIGHT: 3, CAMERA: 4, BONE: 5, EMPTY: 6, LINE_CURVE: 7, NURBS_CURVE: 8, NURBS_SURFACE: 9, NURBS_TRIM_SURFACE: 10, NURBS_TRIM_BOUNDARY: 11, PROCEDURAL_GEOMETRY: 12, STEREO_CAMERA: 13, CAMERA_SWITCHER: 14, MARKER: 15, LOD_GROUP: 16, SKIN_DEFORMER: 17, SKIN_CLUSTER: 18, BLEND_DEFORMER: 19, BLEND_CHANNEL: 20, BLEND_SHAPE: 21, CACHE_DEFORMER: 22, CACHE_FILE: 23, MATERIAL: 24, TEXTURE: 25, VIDEO: 26, SHADER: 27, SHADER_BINDING: 28, ANIM_STACK: 29, ANIM_LAYER: 30, ANIM_VALUE: 31, ANIM_CURVE: 32, DISPLAY_LAYER: 33, SELECTION_SET: 34, SELECTION_NODE: 35, CHARACTER: 36, CONSTRAINT: 37, AUDIO_LAYER: 38, AUDIO_CLIP: 39, POSE: 40, METADATA_OBJECT: 41 });
const GRAPH_SHAPES = Object.freeze({
  file: ['version', 'ascii', 'creator'], document: ['originalApplication', 'latestApplication'], axes: ['right', 'up', 'front'], global: ['unitMeters', 'axes'],
  source: ['sourceObjectId', 'ufbxElementId', 'ufbxTypedId', 'ufbxElementType', 'ufbxElementTypeValue', 'domClass', 'domSubtype', 'domSourceName', 'displayName', 'customProperties', 'sourceRecordDisposition', 'nodeAttributeType', 'nodeAttributeTypeValue', 'objectPropertyPath', 'connectionPropertyNames', 'sourceDocumentOrder'],
  property: ['name', 'type', 'flags', 'valueInt', 'valueReal', 'valueVec4', 'valueString'], occurrence: ['sourceOccurrenceId', 'sourceModelObjectId', 'parentOccurrenceId', 'geometryObjectIds', 'inheritMode', 'originalInheritMode', 'hasGeometryTransform', 'localTransformSource', 'geometryTransformSource', 'worldMatrixSource', 'geometryMatrixSource', 'worldMatrixMm', 'geometryMatrixMm'],
  transform: ['translation', 'rotation', 'scale'], mesh: ['geometryObjectId', 'sourceObjectId', 'kind', 'verticesSource', 'verticesMm', 'ownerOccurrenceIds'], curve: ['geometryObjectId', 'sourceObjectId', 'kind', 'controlPointsSource', 'controlPointsMm', 'ownerOccurrenceIds'], hierarchy: ['parentOccurrenceId', 'childOccurrenceId'], connection: ['sourceObjectId', 'destinationObjectId', 'sourceProperty', 'destinationProperty'], warning: ['type', 'description', 'elementId', 'count'], unsupported: ['sourceObjectId', 'ufbxElementType', 'ufbxElementTypeValue', 'domClass', 'domSubtype', 'domSourceName', 'sourceRecordDisposition'], unresolved: ['sourceObjectId', 'reason'],
});
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function boundedText(value, max = 1024) {
  return typeof value === 'string' && value.length <= max;
}
function graphError(detail) {
  throw protocolError(`Completion graph ${detail}`);
}
function exactRecord(value, keys, label) {
  if (!isRecord(value)) graphError(`${label} must be an object.`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) graphError(`${label} fields are invalid.`);
  return value;
}
function finiteArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) graphError(`${label} is invalid.`);
}
function idArray(value, pattern, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !pattern.test(item))) graphError(`${label} is invalid.`);
}
function elementPair(name, value, label) {
  const expected = ELEMENT_TYPE_VALUES[name];
  const valid = name === 'UNRECOGNIZED_ELEMENT_TYPE'
    ? Number.isInteger(value) && value >= 42
    : expected !== undefined && value === expected;
  if (!valid) graphError(`${label} element-type evidence is invalid.`);
}
function assertTransform(value, label) {
  exactRecord(value, GRAPH_SHAPES.transform, label);
  finiteArray(value.translation, 3, `${label}.translation`);
  finiteArray(value.rotation, 4, `${label}.rotation`);
  finiteArray(value.scale, 3, `${label}.scale`);
}
function assertSourceObject(value, index) {
  const label = `sourceObjects[${index}]`;
  exactRecord(value, GRAPH_SHAPES.source, label);
  if (!SOURCE_ID_PATTERN.test(value.sourceObjectId) || !Number.isInteger(value.ufbxElementId) || value.ufbxElementId < 0 || !Number.isInteger(value.ufbxTypedId) || value.ufbxTypedId < 0 || !Number.isInteger(value.sourceDocumentOrder) || value.sourceDocumentOrder < 0) graphError(`${label} identity is invalid.`);
  elementPair(value.ufbxElementType, value.ufbxElementTypeValue, label);
  for (const key of ['domClass', 'domSubtype', 'domSourceName', 'displayName', 'sourceRecordDisposition']) if (typeof value[key] !== 'string') graphError(`${label}.${key} is invalid.`);
  if (!value.domClass || value.objectPropertyPath !== null) graphError(`${label} DOM evidence is invalid.`);
  const expectedDisposition = value.ufbxElementType === 'NODE' ? 'supported-occurrence' : ['MESH', 'NURBS_CURVE'].includes(value.ufbxElementType) ? 'supported-geometry' : ['UNKNOWN', 'UNRECOGNIZED_ELEMENT_TYPE'].includes(value.ufbxElementType) ? 'unresolved-unknown' : 'retained-evidence';
  if (value.sourceRecordDisposition !== expectedDisposition) graphError(`${label} disposition is invalid.`);
  if ((value.nodeAttributeType === null) !== (value.nodeAttributeTypeValue === null) || (value.ufbxElementType !== 'NODE' && value.nodeAttributeType !== null)) graphError(`${label} node-attribute evidence is invalid.`);
  if (value.nodeAttributeType !== null) elementPair(value.nodeAttributeType, value.nodeAttributeTypeValue, `${label}.nodeAttribute`);
  if (!Array.isArray(value.customProperties) || !Array.isArray(value.connectionPropertyNames) || value.connectionPropertyNames.some((item) => typeof item !== 'string')) graphError(`${label} nested evidence is invalid.`);
  value.customProperties.forEach((item, propertyIndex) => assertCustomProperty(item, `${label}.customProperties[${propertyIndex}]`));
}
function assertCustomProperty(value, label) {
  exactRecord(value, GRAPH_SHAPES.property, label);
  if (typeof value.name !== 'string' || !Number.isInteger(value.type) || value.type < 0 || !Number.isInteger(value.flags) || value.flags < 0 || !Number.isInteger(value.valueInt) || typeof value.valueReal !== 'number' || !Number.isFinite(value.valueReal) || typeof value.valueString !== 'string') graphError(`${label} values are invalid.`);
  finiteArray(value.valueVec4, 4, `${label}.valueVec4`);
}
function assertOccurrence(value, index) {
  const label = `occurrences[${index}]`;
  exactRecord(value, GRAPH_SHAPES.occurrence, label);
  if (!OCCURRENCE_ID_PATTERN.test(value.sourceOccurrenceId) || !SOURCE_ID_PATTERN.test(value.sourceModelObjectId) || (value.parentOccurrenceId !== null && !OCCURRENCE_ID_PATTERN.test(value.parentOccurrenceId))) graphError(`${label} identity is invalid.`);
  idArray(value.geometryObjectIds, SOURCE_ID_PATTERN, `${label}.geometryObjectIds`);
  if (!Number.isInteger(value.inheritMode) || !Number.isInteger(value.originalInheritMode) || typeof value.hasGeometryTransform !== 'boolean') graphError(`${label} transform flags are invalid.`);
  assertTransform(value.localTransformSource, `${label}.localTransformSource`);
  assertTransform(value.geometryTransformSource, `${label}.geometryTransformSource`);
  for (const key of ['worldMatrixSource', 'geometryMatrixSource', 'worldMatrixMm', 'geometryMatrixMm']) finiteArray(value[key], 12, `${label}.${key}`);
}
function assertGeometry(value, index) {
  const label = `geometries[${index}]`, keys = value?.kind === 'MESH' ? GRAPH_SHAPES.mesh : value?.kind === 'NURBS_CURVE' ? GRAPH_SHAPES.curve : null;
  if (!keys) graphError(`${label}.kind is invalid.`);
  exactRecord(value, keys, label);
  if (!SOURCE_ID_PATTERN.test(value.geometryObjectId) || !SOURCE_ID_PATTERN.test(value.sourceObjectId)) graphError(`${label} identity is invalid.`);
  idArray(value.ownerOccurrenceIds, OCCURRENCE_ID_PATTERN, `${label}.ownerOccurrenceIds`);
  const arrays = value.kind === 'MESH' ? [['verticesSource', 3], ['verticesMm', 3]] : [['controlPointsSource', 4], ['controlPointsMm', 4]];
  for (const [key, length] of arrays) {
    if (!Array.isArray(value[key])) graphError(`${label}.${key} is invalid.`);
    value[key].forEach((item, itemIndex) => finiteArray(item, length, `${label}.${key}[${itemIndex}]`));
  }
}
function assertSimpleRecords(graph) {
  graph.hierarchyEdges.forEach((value, index) => { exactRecord(value, GRAPH_SHAPES.hierarchy, `hierarchyEdges[${index}]`); if (!OCCURRENCE_ID_PATTERN.test(value.parentOccurrenceId) || !OCCURRENCE_ID_PATTERN.test(value.childOccurrenceId)) graphError(`hierarchyEdges[${index}] identity is invalid.`); });
  graph.connectionEdges.forEach((value, index) => { exactRecord(value, GRAPH_SHAPES.connection, `connectionEdges[${index}]`); if (!SOURCE_ID_PATTERN.test(value.sourceObjectId) || !SOURCE_ID_PATTERN.test(value.destinationObjectId) || typeof value.sourceProperty !== 'string' || typeof value.destinationProperty !== 'string') graphError(`connectionEdges[${index}] is invalid.`); });
  graph.warnings.forEach((value, index) => { exactRecord(value, GRAPH_SHAPES.warning, `warnings[${index}]`); if (!Number.isInteger(value.type) || value.type < 0 || typeof value.description !== 'string' || !Number.isInteger(value.elementId) || value.elementId < 0 || !Number.isInteger(value.count) || value.count < 1) graphError(`warnings[${index}] is invalid.`); });
  graph.unsupportedRecords.forEach((value, index) => { const label = `unsupportedRecords[${index}]`; exactRecord(value, GRAPH_SHAPES.unsupported, label); elementPair(value.ufbxElementType, value.ufbxElementTypeValue, label); const expectedDisposition = ['UNKNOWN', 'UNRECOGNIZED_ELEMENT_TYPE'].includes(value.ufbxElementType) ? 'unresolved-unknown' : 'retained-evidence'; if (!SOURCE_ID_PATTERN.test(value.sourceObjectId) || ['NODE', 'MESH', 'NURBS_CURVE'].includes(value.ufbxElementType) || value.sourceRecordDisposition !== expectedDisposition || typeof value.domClass !== 'string' || !value.domClass || typeof value.domSubtype !== 'string' || typeof value.domSourceName !== 'string') graphError(`${label} is invalid.`); });
  graph.unresolvedReferences.forEach((value, index) => { exactRecord(value, GRAPH_SHAPES.unresolved, `unresolvedReferences[${index}]`); if (!SOURCE_ID_PATTERN.test(value.sourceObjectId) || value.reason !== 'unknown-element-type') graphError(`unresolvedReferences[${index}] is invalid.`); });
}
function assertGraphReferences(graph) {
  const sourceIds = new Set(graph.sourceObjects.map((item) => item.sourceObjectId));
  const occurrenceIds = new Set(graph.occurrences.map((item) => item.sourceOccurrenceId));
  const geometryIds = new Set(graph.geometries.map((item) => item.geometryObjectId));
  if (occurrenceIds.size !== graph.occurrences.length || geometryIds.size !== graph.geometries.length) graphError('contains duplicate occurrence or geometry identities.');
  for (const item of graph.occurrences) {
    if (!sourceIds.has(item.sourceModelObjectId) || (item.parentOccurrenceId && !occurrenceIds.has(item.parentOccurrenceId)) || item.geometryObjectIds.some((id) => !geometryIds.has(id))) graphError(`occurrence ${item.sourceOccurrenceId} has unresolved references.`);
  }
  for (const item of graph.geometries) if (!sourceIds.has(item.sourceObjectId) || item.ownerOccurrenceIds.some((id) => !occurrenceIds.has(id))) graphError(`geometry ${item.geometryObjectId} has unresolved references.`);
  for (const item of graph.hierarchyEdges) if (!occurrenceIds.has(item.parentOccurrenceId) || !occurrenceIds.has(item.childOccurrenceId)) graphError('hierarchy edge has unresolved references.');
  for (const item of graph.connectionEdges) {
    const destinationKnown = item.destinationObjectId === '0' || sourceIds.has(item.destinationObjectId);
    if (!sourceIds.has(item.sourceObjectId) || !destinationKnown) graphError('connection edge has unresolved references.');
  }
  for (const item of [...graph.unsupportedRecords, ...graph.unresolvedReferences]) if (!sourceIds.has(item.sourceObjectId)) graphError('retained evidence has an unresolved source identity.');
  const seen = new Set(), duplicates = new Set();
  for (const id of graph.sourceObjects.map((item) => item.sourceObjectId)) { if (seen.has(id)) duplicates.add(id); seen.add(id); }
  const declared = [...graph.duplicateSourceObjectIds];
  if (new Set(declared).size !== declared.length || declared.some((id) => !SOURCE_ID_PATTERN.test(id)) || JSON.stringify([...duplicates].sort()) !== JSON.stringify([...declared].sort())) graphError('duplicateSourceObjectIds is inconsistent.');
}
export class FbxWorkerRuntimeError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'FbxWorkerRuntimeError';
    this.code = code;
    this.stage = options.stage ?? null;
    this.detail = options.detail ?? null;
    this.progressStages = Object.freeze([...(options.progressStages || [])]);
    this.diagnostics = options.diagnostics ?? null;
  }
}
export function trustedJobId(value) {
  return typeof value === 'string' && JOB_ID_PATTERN.test(value) ? value : null;
}
export function assertFbxWorkerJob(value) {
  if (!isRecord(value)) throw invalidJob('Worker job must be an object.');
  if (value.schema !== FBX_WORKER_JOB_SCHEMA) throw invalidJob('Unsupported worker job schema.');
  if (value.operation !== FBX_WORKER_OPERATION) throw invalidJob('Unsupported worker operation.');
  if (!trustedJobId(value.jobId)) throw invalidJob('Worker jobId is malformed.');
  if (!(value.bytes instanceof ArrayBuffer)) throw invalidJob('Worker bytes must be an ArrayBuffer.');
  if (!Number.isSafeInteger(value.inputByteLength) || value.inputByteLength < 0) {
    throw invalidJob('Worker inputByteLength must be a non-negative safe integer.');
  }
  return value;
}
function invalidJob(detail) {
  return new FbxWorkerRuntimeError(
    FBX_WORKER_ERROR_CODES.JOB_INVALID,
    'The FBX worker job is invalid.',
    { detail },
  );
}
export function assertWorkerEnvelope(value, expectedJobId) {
  if (!isRecord(value)) throw protocolError('Worker message must be an object.');
  if (value.schema !== FBX_WORKER_MESSAGE_SCHEMA) throw protocolError('Unsupported worker message schema.');
  if (!KNOWN_TYPES.has(value.type)) throw protocolError('Unsupported worker message type.');
  if (value.jobId !== expectedJobId) throw protocolError('Worker message jobId does not match the active job.');
  return value;
}
export function assertAcceptedMessage(value, expectedLength) {
  if (value.operation !== FBX_WORKER_OPERATION) throw protocolError('Accepted message operation is invalid.');
  if (value.inputByteLength !== expectedLength) throw protocolError('Accepted message length is invalid.');
  return value;
}
export function assertProgressMessage(value, receivedStages) {
  const ordinal = receivedStages.length;
  const expected = FBX_WORKER_STAGES[ordinal];
  if (ordinal >= FBX_WORKER_STAGES.length - 1) throw protocolError('Progress cannot follow preparing-transfer.');
  if (value.ordinal !== ordinal || value.stage !== expected) throw protocolError('Worker progress ordering is invalid.');
  return value;
}
function assertSourceGraphEnvelope(graph) {
  exactRecord(graph, SOURCE_GRAPH_KEYS, 'top-level');
  if (graph.schema !== 'FbxSourceGraph.v2') graphError('schema is invalid.');
  exactRecord(graph.file, GRAPH_SHAPES.file, 'file');
  if (!Number.isInteger(graph.file.version) || graph.file.version < 3000 || graph.file.version > 7700 || graph.file.ascii !== false || typeof graph.file.creator !== 'string') graphError('file metadata is invalid.');
  exactRecord(graph.documentMetadata, GRAPH_SHAPES.document, 'documentMetadata');
  if (typeof graph.documentMetadata.originalApplication !== 'string' || typeof graph.documentMetadata.latestApplication !== 'string') graphError('documentMetadata is invalid.');
  exactRecord(graph.globalSettings, GRAPH_SHAPES.global, 'globalSettings');
  exactRecord(graph.globalSettings.axes, GRAPH_SHAPES.axes, 'globalSettings.axes');
  if (typeof graph.globalSettings.unitMeters !== 'number' || !Number.isFinite(graph.globalSettings.unitMeters) || !['right', 'up', 'front'].every((key) => Number.isInteger(graph.globalSettings.axes[key]))) graphError('globalSettings is invalid.');
  for (const key of SOURCE_GRAPH_ARRAY_KEYS) if (!Array.isArray(graph[key])) graphError(`${key} must be an array.`);
  graph.sourceObjects.forEach(assertSourceObject);
  graph.occurrences.forEach(assertOccurrence);
  graph.geometries.forEach(assertGeometry);
  assertSimpleRecords(graph);
  assertGraphReferences(graph);
}
export function assertCompleteMessage(value, receivedStages) {
  const required = FBX_WORKER_STAGES.slice(0, -1);
  if (value.stage !== 'complete') throw protocolError('Completion stage is invalid.');
  if (receivedStages.length !== required.length) throw protocolError('Completion arrived before all required stages.');
  assertSourceGraphEnvelope(value.graph);
  if (!isRecord(value.diagnostics)) throw protocolError('Completion diagnostics are invalid.');
  return value;
}
export function assertErrorMessage(value, receivedStages) {
  if (!KNOWN_CODES.has(value.code)) throw protocolError('Worker error code is invalid.');
  if (!boundedText(value.message, 2048)) throw protocolError('Worker error message is invalid.');
  if (value.detail !== null && !boundedText(value.detail, 4096)) throw protocolError('Worker error detail is invalid.');
  if (value.diagnostics !== null && !isRecord(value.diagnostics)) throw protocolError('Worker error diagnostics are invalid.');
  if (!Array.isArray(value.progressStages)) throw protocolError('Worker error progress history is invalid.');
  if (value.progressStages.length !== receivedStages.length) throw protocolError('Worker error progress history is inconsistent.');
  for (let i = 0; i < receivedStages.length; i += 1) {
    if (value.progressStages[i] !== receivedStages[i]) throw protocolError('Worker error progress history is inconsistent.');
  }
  const currentStage = receivedStages.at(-1) ?? null;
  if (value.stage !== currentStage) throw protocolError('Worker error stage is inconsistent with progress history.');
  const requiredStage = ERROR_STAGE_BY_CODE[value.code];
  if (requiredStage && value.stage !== requiredStage) throw protocolError('Worker error code is invalid for the current stage.');
  return value;
}
export function protocolError(detail, progressStages = []) {
  return new FbxWorkerRuntimeError(
    FBX_WORKER_ERROR_CODES.RUNTIME_ERROR,
    'The FBX worker protocol was violated.',
    { detail, progressStages },
  );
}
export function makeAccepted(job) {
  return {
    schema: FBX_WORKER_MESSAGE_SCHEMA,
    type: FBX_WORKER_TYPES.ACCEPTED,
    jobId: job.jobId,
    operation: job.operation,
    inputByteLength: job.inputByteLength,
  };
}
export function makeProgress(jobId, stage, ordinal) {
  return {
    schema: FBX_WORKER_MESSAGE_SCHEMA,
    type: FBX_WORKER_TYPES.PROGRESS,
    jobId,
    stage,
    ordinal,
  };
}
export function makeComplete(jobId, graph, diagnostics) {
  return {
    schema: FBX_WORKER_MESSAGE_SCHEMA,
    type: FBX_WORKER_TYPES.COMPLETE,
    jobId,
    stage: 'complete',
    graph,
    diagnostics,
  };
}
export function makeWorkerError(jobId, error, progressStages, diagnostics = null) {
  const code = KNOWN_CODES.has(error?.code) ? error.code : FBX_WORKER_ERROR_CODES.RUNTIME_ERROR;
  const message = boundedText(error?.message, 2048) ? error.message : 'The FBX worker failed.';
  const detail = boundedText(error?.detail, 4096) ? error.detail : boundedText(error?.message, 4096) ? error.message : null;
  return {
    schema: FBX_WORKER_MESSAGE_SCHEMA,
    type: FBX_WORKER_TYPES.ERROR,
    jobId,
    code,
    stage: error?.stage ?? progressStages.at(-1) ?? null,
    message,
    detail,
    progressStages: [...progressStages],
    diagnostics,
  };
}
