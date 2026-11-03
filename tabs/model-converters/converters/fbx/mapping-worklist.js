import { canonicalJson, deepFreeze } from './canonical-json.js';
import {
  BindingFailure, canonicalDigest, observeSource,
  verifyParserBinding, verifySourceBinding, verifySourceGraphBinding,
} from './mapping-package.js';
import {
  WorklistFailure, failWorklist, validateMappingWorklistShape, validateParserEvidence,
} from './mapping-worklist-contract.js';
import { enforceSourceGraphPolicy } from './source-graph.js';

export { WorklistFailure, validateMappingWorklistShape };

function fail(status, message, evidence = null) {
  failWorklist(status, message, evidence);
}

function compareText(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

function canonicalSourceGraph(graph) {
  try { return enforceSourceGraphPolicy(graph); }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail('BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING', detail);
  }
}

function bindingDetail(error) {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof BindingFailure ? message.replace(`${error.status} `, '') : message;
}

async function observedSource(bytes) {
  try { return await observeSource(bytes); }
  catch (error) {
    if (error instanceof BindingFailure) {
      fail('BLOCKED_WORKLIST_SOURCE_BINDING', bindingDetail(error), error.evidence);
    }
    throw error;
  }
}

function typeEvidence(source) {
  return {
    ufbxElementId: source.ufbxElementId,
    ufbxTypedId: source.ufbxTypedId,
    ufbxElementType: source.ufbxElementType,
    ufbxElementTypeValue: source.ufbxElementTypeValue,
    nodeAttributeType: source.nodeAttributeType,
    nodeAttributeTypeValue: source.nodeAttributeTypeValue,
    sourceDocumentOrder: source.sourceDocumentOrder,
  };
}

function nameEvidence(source) {
  return {
    authority: 'NON_AUTHORITATIVE',
    domClass: source.domClass,
    domSubtype: source.domSubtype,
    domSourceName: source.domSourceName,
    displayName: source.displayName,
  };
}

function geometryEvidence(geometry) {
  if (!['MESH', 'NURBS_CURVE'].includes(geometry.kind)) {
    fail('BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING', `geometry ${geometry.geometryObjectId} has unsupported kind.`);
  }
  const mesh = geometry.kind === 'MESH';
  const points = mesh ? geometry.verticesMm : geometry.controlPointsMm;
  if (!Array.isArray(points)) {
    fail('BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING', `geometry ${geometry.geometryObjectId} lacks governed points.`);
  }
  return {
    geometryObjectId: geometry.geometryObjectId,
    kind: geometry.kind,
    pointAuthority: mesh ? 'MESH_VERTEX' : 'NURBS_CONTROL_POINT',
    governedPointCount: points.length,
  };
}

function scopePolicy() {
  return {
    id: 'SOURCE_GRAPH_SUPPORTED_OCCURRENCES_V1',
    authority: 'FbxSourceGraph.v2',
    requiredElementType: 'NODE',
    requiredDisposition: 'supported-occurrence',
    identityJoin: 'occurrence.sourceModelObjectId',
    namesAuthoritative: false,
    geometryAuthoritativeForClassification: false,
  };
}

function retainedEvidence(source) {
  return {
    sourceObjectId: source.sourceObjectId,
    typeEvidence: typeEvidence(source),
    nameEvidence: nameEvidence(source),
    sourceRecordDisposition: source.sourceRecordDisposition,
    evidenceRole: 'NON_OCCURRENCE_TRACE',
  };
}

function workItemPayload(source, occurrence, geometries) {
  const geometryIds = [...occurrence.geometryObjectIds].map(String).sort();
  return {
    sourceModelObjectId: source.sourceObjectId,
    sourceOccurrenceId: occurrence.sourceOccurrenceId,
    sourceGeometryObjectIds: geometryIds,
    typeEvidence: typeEvidence(source),
    nameEvidence: nameEvidence(source),
    sourceRecordDisposition: source.sourceRecordDisposition,
    geometryEvidence: geometryIds.map((id) => geometryEvidence(geometries.get(id))),
    reviewState: 'PENDING',
  };
}

async function buildWorkItem(source, occurrence, geometries) {
  const payload = workItemPayload(source, occurrence, geometries);
  return { workItemId: `work-${await canonicalDigest(payload)}`, ...payload };
}

function worklistPayload(value) {
  return {
    schema: value.schema,
    source: structuredClone(value.source),
    parser: structuredClone(value.parser),
    sourceGraph: structuredClone(value.sourceGraph),
    scopePolicy: structuredClone(value.scopePolicy),
    workItems: structuredClone(value.workItems),
    retainedEvidence: structuredClone(value.retainedEvidence),
  };
}

export async function calculateWorklistId(value) {
  return canonicalDigest(worklistPayload(value));
}

function indexUnique(items, key, label) {
  const result = new Map();
  for (const item of items) {
    const id = String(item?.[key] ?? '');
    if (!id) fail('BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING', `${label} lacks ${key}.`);
    if (result.has(id)) fail('BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING', `duplicate ${label} ${id}.`);
    result.set(id, item);
  }
  return result;
}

function sourceIndexes(graph) {
  const sources = indexUnique(graph.sourceObjects, 'sourceObjectId', 'source object');
  const occurrences = indexUnique(graph.occurrences, 'sourceOccurrenceId', 'occurrence');
  const geometries = indexUnique(graph.geometries, 'geometryObjectId', 'geometry');
  for (const occurrence of occurrences.values()) {
    if (!sources.has(String(occurrence.sourceModelObjectId))) {
      fail('BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING', `occurrence ${occurrence.sourceOccurrenceId} has unknown source model.`);
    }
  }
  return { sources, occurrences, geometries };
}

function governedOccurrences(occurrences, sources) {
  return [...occurrences.values()].filter((occurrence) => {
    const source = sources.get(String(occurrence.sourceModelObjectId));
    return source.ufbxElementType === 'NODE' && source.sourceRecordDisposition === 'supported-occurrence';
  });
}

function assertOwnedGeometry(occurrences, geometries) {
  for (const occurrence of occurrences) for (const rawId of occurrence.geometryObjectIds) {
    const id = String(rawId);
    const geometry = geometries.get(id);
    if (!geometry) fail('BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING', `geometry ${id} is missing.`);
    if (!geometry.ownerOccurrenceIds.includes(occurrence.sourceOccurrenceId)) {
      fail('BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING', `geometry ${id} lacks occurrence ownership.`);
    }
  }
}

export async function buildMappingWorklist({ bytes, graph, parserEvidence }) {
  validateParserEvidence(parserEvidence);
  const canonicalGraph = canonicalSourceGraph(graph);
  const { sources, occurrences: allOccurrences, geometries } = sourceIndexes(canonicalGraph);
  const occurrences = governedOccurrences(allOccurrences, sources);
  for (const occurrence of occurrences) {
    occurrence.geometryObjectIds = occurrence.geometryObjectIds.filter(id => geometries.has(String(id)));
  }
  assertOwnedGeometry(occurrences, geometries);
  const workItems = [];
  for (const occurrence of occurrences) {
    workItems.push(await buildWorkItem(sources.get(String(occurrence.sourceModelObjectId)), occurrence, geometries));
  }
  workItems.sort((left, right) => compareText(left.workItemId, right.workItemId));
  const governedIds = new Set(workItems.map((item) => item.sourceModelObjectId));
  const draft = {
    schema: 'FbxMappingWorklist.v1',
    worklistId: '0'.repeat(64),
    source: await observedSource(bytes),
    parser: structuredClone(parserEvidence),
    sourceGraph: { schema: canonicalGraph.schema, canonicalSha256: await canonicalDigest(canonicalGraph) },
    scopePolicy: scopePolicy(),
    workItems,
    retainedEvidence: canonicalGraph.sourceObjects
      .filter((source) => !governedIds.has(source.sourceObjectId))
      .map(retainedEvidence),
  };
  draft.worklistId = await calculateWorklistId(draft);
  return deepFreeze(validateMappingWorklistShape(draft));
}

function mapBindingError(error, status) {
  if (error instanceof BindingFailure) fail(status, bindingDetail(error), error.evidence);
  throw error;
}

export async function verifyMappingWorklist({ bytes, graph, parserEvidence, worklist }) {
  validateMappingWorklistShape(worklist);
  const observedId = await calculateWorklistId(worklist);
  if (observedId !== worklist.worklistId) fail('BLOCKED_WORKLIST_CONTRACT', 'worklistId is stale or tampered.');
  try { verifySourceBinding(worklist, await observedSource(bytes)); }
  catch (error) {
    if (error instanceof WorklistFailure) throw error;
    mapBindingError(error, 'BLOCKED_WORKLIST_SOURCE_BINDING');
  }
  try { verifyParserBinding(worklist, parserEvidence); }
  catch (error) { mapBindingError(error, 'BLOCKED_WORKLIST_PARSER_BINDING'); }
  try { await verifySourceGraphBinding(worklist, canonicalSourceGraph(graph)); }
  catch (error) {
    if (error instanceof WorklistFailure) throw error;
    mapBindingError(error, 'BLOCKED_WORKLIST_SOURCE_GRAPH_BINDING');
  }
  const regenerated = await buildMappingWorklist({ bytes, graph, parserEvidence });
  if (canonicalJson(regenerated) !== canonicalJson(worklist)) {
    fail('BLOCKED_WORKLIST_CONTRACT', 'worklist does not match canonical source evidence.');
  }
  return worklist;
}
