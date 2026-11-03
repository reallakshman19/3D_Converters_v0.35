const HASH_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const SOURCE_ID_PATTERN = /^\d+$/;
const OCCURRENCE_ID_PATTERN = /^occ:\d+$/;
const WORK_ITEM_ID_PATTERN = /^work-[0-9a-f]{64}$/;

const WORKLIST_KEYS = Object.freeze([
  'schema', 'worklistId', 'source', 'parser', 'sourceGraph',
  'scopePolicy', 'workItems', 'retainedEvidence',
]);
const WORK_ITEM_KEYS = Object.freeze([
  'workItemId', 'sourceModelObjectId', 'sourceOccurrenceId',
  'sourceGeometryObjectIds', 'typeEvidence', 'nameEvidence',
  'sourceRecordDisposition', 'geometryEvidence', 'reviewState',
]);
const TYPE_KEYS = Object.freeze([
  'ufbxElementId', 'ufbxTypedId', 'ufbxElementType', 'ufbxElementTypeValue',
  'nodeAttributeType', 'nodeAttributeTypeValue', 'sourceDocumentOrder',
]);

export class WorklistFailure extends Error {
  constructor(status, message, evidence = null) {
    super(`${status} ${message}`);
    this.name = 'WorklistFailure';
    this.status = status;
    this.evidence = evidence;
  }
}

export function failWorklist(status, message, evidence = null) {
  throw new WorklistFailure(status, message, evidence);
}

function exactKeys(value, keys, label, status = 'BLOCKED_WORKLIST_CONTRACT') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failWorklist(status, `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort().join('\0');
  const expected = [...keys].sort().join('\0');
  if (actual !== expected) failWorklist(status, `${label} has missing or unexpected fields.`);
  return value;
}

function requireText(value, label, status = 'BLOCKED_WORKLIST_CONTRACT') {
  if (typeof value !== 'string' || !value) failWorklist(status, `${label} is required.`);
  return value;
}

function requirePattern(value, pattern, label, status = 'BLOCKED_WORKLIST_CONTRACT') {
  const text = requireText(value, label, status);
  if (!pattern.test(text)) failWorklist(status, `${label} has invalid syntax.`);
  return text;
}

function requireInteger(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', `${label} must be an integer >= ${minimum}.`);
  }
}

function requireArray(value, label) {
  if (!Array.isArray(value)) failWorklist('BLOCKED_WORKLIST_CONTRACT', `${label} must be an array.`);
  return value;
}

function validateSource(value) {
  const source = exactKeys(value, ['sha256', 'byteLength', 'fbxVersion'], 'worklist.source');
  requirePattern(source.sha256, HASH_PATTERN, 'worklist.source.sha256');
  if (!Number.isSafeInteger(source.byteLength) || source.byteLength <= 0) {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', 'worklist.source.byteLength must be positive.');
  }
  if (!Number.isInteger(source.fbxVersion) || source.fbxVersion < 3000 || source.fbxVersion > 7700) {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', 'worklist.source.fbxVersion is unsupported.');
  }
}

function validateParser(value, label, status) {
  const keys = ['provenanceSchema', 'upstreamRevision', 'sourceSha256', 'wasmSha256'];
  const parser = exactKeys(value, keys, label, status);
  requireText(parser.provenanceSchema, `${label}.provenanceSchema`, status);
  requirePattern(parser.upstreamRevision, REVISION_PATTERN, `${label}.upstreamRevision`, status);
  requirePattern(parser.sourceSha256, HASH_PATTERN, `${label}.sourceSha256`, status);
  requirePattern(parser.wasmSha256, HASH_PATTERN, `${label}.wasmSha256`, status);
  return parser;
}

export function validateParserEvidence(value) {
  return validateParser(value, 'parserEvidence', 'BLOCKED_WORKLIST_PARSER_BINDING');
}

function validateSourceGraph(value) {
  const graph = exactKeys(value, ['schema', 'canonicalSha256'], 'worklist.sourceGraph');
  if (graph.schema !== 'FbxSourceGraph.v2') {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', 'worklist.sourceGraph.schema must be FbxSourceGraph.v2.');
  }
  requirePattern(graph.canonicalSha256, HASH_PATTERN, 'worklist.sourceGraph.canonicalSha256');
}

function validateScopePolicy(value) {
  const keys = [
    'id', 'authority', 'requiredElementType', 'requiredDisposition', 'identityJoin',
    'namesAuthoritative', 'geometryAuthoritativeForClassification',
  ];
  const policy = exactKeys(value, keys, 'worklist.scopePolicy');
  const expected = {
    id: 'SOURCE_GRAPH_SUPPORTED_OCCURRENCES_V1',
    authority: 'FbxSourceGraph.v2',
    requiredElementType: 'NODE',
    requiredDisposition: 'supported-occurrence',
    identityJoin: 'occurrence.sourceModelObjectId',
    namesAuthoritative: false,
    geometryAuthoritativeForClassification: false,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (policy[key] !== expectedValue) failWorklist('BLOCKED_WORKLIST_CONTRACT', `worklist.scopePolicy.${key} is invalid.`);
  }
}

function validateTypeEvidence(value, label) {
  const evidence = exactKeys(value, TYPE_KEYS, label);
  for (const key of ['ufbxElementId', 'ufbxTypedId', 'ufbxElementTypeValue', 'sourceDocumentOrder']) {
    requireInteger(evidence[key], `${label}.${key}`);
  }
  requireText(evidence.ufbxElementType, `${label}.ufbxElementType`);
  if (evidence.nodeAttributeType !== null && typeof evidence.nodeAttributeType !== 'string') {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', `${label}.nodeAttributeType must be string or null.`);
  }
  if (evidence.nodeAttributeTypeValue !== null) {
    requireInteger(evidence.nodeAttributeTypeValue, `${label}.nodeAttributeTypeValue`);
  }
}

function validateNameEvidence(value, label) {
  const keys = ['authority', 'domClass', 'domSubtype', 'domSourceName', 'displayName'];
  const evidence = exactKeys(value, keys, label);
  if (evidence.authority !== 'NON_AUTHORITATIVE') {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', `${label}.authority must be NON_AUTHORITATIVE.`);
  }
  requireText(evidence.domClass, `${label}.domClass`);
  for (const key of ['domSubtype', 'domSourceName', 'displayName']) {
    if (typeof evidence[key] !== 'string') failWorklist('BLOCKED_WORKLIST_CONTRACT', `${label}.${key} must be a string.`);
  }
}

function validateGeometryEvidence(value, label) {
  const keys = ['geometryObjectId', 'kind', 'pointAuthority', 'governedPointCount'];
  const evidence = exactKeys(value, keys, label);
  requirePattern(evidence.geometryObjectId, SOURCE_ID_PATTERN, `${label}.geometryObjectId`);
  if (!['MESH', 'NURBS_CURVE'].includes(evidence.kind)) {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', `${label}.kind is unsupported.`);
  }
  const expectedAuthority = evidence.kind === 'MESH' ? 'MESH_VERTEX' : 'NURBS_CONTROL_POINT';
  if (evidence.pointAuthority !== expectedAuthority) {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', `${label}.pointAuthority conflicts with kind.`);
  }
  requireInteger(evidence.governedPointCount, `${label}.governedPointCount`);
}

function requireUnique(values, label) {
  if (new Set(values).size !== values.length) failWorklist('BLOCKED_WORKLIST_CONTRACT', `${label} contains duplicates.`);
}

function sameIds(left, right) {
  return [...left].sort().join('\0') === [...right].sort().join('\0');
}

function validateWorkItem(item, index) {
  const label = `workItems[${index}]`;
  exactKeys(item, WORK_ITEM_KEYS, label);
  requirePattern(item.workItemId, WORK_ITEM_ID_PATTERN, `${label}.workItemId`);
  requirePattern(item.sourceModelObjectId, SOURCE_ID_PATTERN, `${label}.sourceModelObjectId`);
  requirePattern(item.sourceOccurrenceId, OCCURRENCE_ID_PATTERN, `${label}.sourceOccurrenceId`);
  const geometryIds = requireArray(item.sourceGeometryObjectIds, `${label}.sourceGeometryObjectIds`);
  geometryIds.forEach((id, offset) => requirePattern(id, SOURCE_ID_PATTERN, `${label}.sourceGeometryObjectIds[${offset}]`));
  requireUnique(geometryIds, `${label}.sourceGeometryObjectIds`);
  validateTypeEvidence(item.typeEvidence, `${label}.typeEvidence`);
  validateNameEvidence(item.nameEvidence, `${label}.nameEvidence`);
  if (item.sourceRecordDisposition !== 'supported-occurrence' || item.reviewState !== 'PENDING') {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', `${label} has invalid disposition or review state.`);
  }
  const evidence = requireArray(item.geometryEvidence, `${label}.geometryEvidence`);
  evidence.forEach((entry, offset) => validateGeometryEvidence(entry, `${label}.geometryEvidence[${offset}]`));
  const evidenceIds = evidence.map((entry) => entry.geometryObjectId);
  requireUnique(evidenceIds, `${label}.geometryEvidence`);
  if (!sameIds(geometryIds, evidenceIds)) {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', `${label} geometry identities disagree.`);
  }
}

function validateRetainedEvidence(item, index) {
  const label = `retainedEvidence[${index}]`;
  const keys = ['sourceObjectId', 'typeEvidence', 'nameEvidence', 'sourceRecordDisposition', 'evidenceRole'];
  exactKeys(item, keys, label);
  requirePattern(item.sourceObjectId, SOURCE_ID_PATTERN, `${label}.sourceObjectId`);
  validateTypeEvidence(item.typeEvidence, `${label}.typeEvidence`);
  validateNameEvidence(item.nameEvidence, `${label}.nameEvidence`);
  const dispositions = ['supported-occurrence', 'supported-geometry', 'retained-evidence', 'unresolved-unknown'];
  if (!dispositions.includes(item.sourceRecordDisposition) || item.evidenceRole !== 'NON_OCCURRENCE_TRACE') {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', `${label} has invalid retained-evidence policy.`);
  }
}

export function validateMappingWorklistShape(value) {
  const worklist = exactKeys(value, WORKLIST_KEYS, 'worklist');
  if (worklist.schema !== 'FbxMappingWorklist.v1') failWorklist('BLOCKED_WORKLIST_CONTRACT', 'unsupported worklist schema.');
  requirePattern(worklist.worklistId, HASH_PATTERN, 'worklist.worklistId');
  validateSource(worklist.source);
  validateParser(worklist.parser, 'worklist.parser', 'BLOCKED_WORKLIST_CONTRACT');
  validateSourceGraph(worklist.sourceGraph);
  validateScopePolicy(worklist.scopePolicy);
  requireArray(worklist.workItems, 'worklist.workItems').forEach(validateWorkItem);
  requireArray(worklist.retainedEvidence, 'worklist.retainedEvidence').forEach(validateRetainedEvidence);
  requireUnique(worklist.workItems.map((item) => item.workItemId), 'worklist workItemId');
  requireUnique(worklist.workItems.map((item) => item.sourceOccurrenceId), 'worklist sourceOccurrenceId');
  requireUnique(worklist.retainedEvidence.map((item) => item.sourceObjectId), 'worklist retained sourceObjectId');
  const governed = new Set(worklist.workItems.map((item) => item.sourceModelObjectId));
  for (const item of worklist.retainedEvidence) if (governed.has(item.sourceObjectId)) {
    failWorklist('BLOCKED_WORKLIST_CONTRACT', `source object ${item.sourceObjectId} is both governed and retained.`);
  }
  return worklist;
}
