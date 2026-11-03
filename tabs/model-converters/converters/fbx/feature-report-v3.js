import { canonicalJson, deepFreeze } from './canonical-json.js';
import { validateFbxGeometryBundle } from './geometry-bundle.js';
import {
  getFbxFeatureCapabilityRegistryV3,
  validateFbxFeatureCapabilityRegistryV3,
} from './feature-capability-registry-v3.js';
import { buildFbxFeatureReportV2, validateFbxFeatureReportV2 } from './feature-report.js';
import { sha256Hex } from './sha256.js';
import { enforceSourceGraphPolicy } from './source-graph.js';

export const FBX_FEATURE_REPORT_V3_SCHEMA = 'FbxFeatureReport.v3';
const HASH = /^[0-9a-f]{64}$/;
const TOP_KEYS = ['schema', 'registryVersion', 'sourceGraphSchema', 'geometryBundleSchema',
  'geometryBundleDigest', 'sourceIdentity', 'parserIdentity', 'counts', 'features',
  'unknownElementTypes', 'warnings', 'blockedCapabilities', 'summary'];
const V2_COUNT_KEYS = ['sourceObjects', 'occurrences', 'geometries', 'meshGeometries',
  'nurbsCurveGeometries', 'meshPointValues', 'nurbsControlPointValues', 'hierarchyEdges',
  'connectionEdges', 'customProperties', 'warnings', 'unsupportedRecords',
  'unresolvedReferences', 'duplicateSourceObjectIds'];
const EXTRA_COUNT_KEYS = ['topologyGeometries', 'polygonCount', 'polygonVertexCount'];
const COUNT_KEYS = [...V2_COUNT_KEYS, ...EXTRA_COUNT_KEYS];
const SUMMARY_KEYS = ['presentFeatures', 'recognizedFeatures', 'parsedFeatures',
  'retainedEvidenceFeatures', 'renderableFeatures', 'exportableFeatures',
  'engineeringMappingEligibleFeatures', 'stagedJsonPublicationEligibleFeatures',
  'stagedJsonRequiresGovernedMappingFeatures', 'blockedCapabilities', 'unknownFeatures'];
const FEATURE_KEYS = ['featureId', 'recognized', 'parsed', 'retainedAsEvidence', 'evidenceCount',
  'evidenceStatus', 'renderStatus', 'exportStatus', 'engineeringMappingStatus',
  'stagedJsonStatus', 'limitations', 'futureWorkPack'];
const CAPABILITIES = ['evidence', 'render', 'export', 'engineering-mapping', 'stagedjson'];
const RUNTIME_KEYS = new Set(['jobId', 'workerId', 'workerMode', 'timestamp', 'timestamps',
  'inputByteLength', 'generatedAt', 'duration', 'durationMs', 'totalDurationMs',
  'stageTimingsMs', 'stageDurationsMs', 'memory', 'heapBeforeBytes', 'heapAfterBytes',
  'heapPeakBytes', 'heapDeltaBytes', 'browserCapabilities', 'runtimeEnvironment',
  'runConfiguration', 'runs', 'aggregate', 'progressStages', 'terminalCode',
  'workerCreated', 'workerTerminated', 'userAgent', 'platform', 'nodeVersion',
  'architecture', 'hardwareConcurrency', 'crossOriginIsolated']);
function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0')) throw new TypeError(`${label} fields are invalid.`);
}
function sameIdentity(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function validateIdentity(value) {
  exactKeys(value, ['sha256', 'byteLength', 'fbxVersion'], 'sourceIdentity');
  if (!HASH.test(value.sha256) || !Number.isSafeInteger(value.byteLength) || value.byteLength < 1
    || !Number.isInteger(value.fbxVersion) || value.fbxVersion < 3000 || value.fbxVersion > 7700) {
    throw new TypeError('Feature report v3 source identity is invalid.');
  }
}
function validateParser(value) {
  exactKeys(value, ['provenanceSchema', 'upstreamRevision', 'sourceSha256', 'wasmSha256'], 'parserIdentity');
  if (value.provenanceSchema !== 'UfbxWasmProvenance.v1'
    || !/^[0-9a-f]{40}$/.test(value.upstreamRevision)
    || !HASH.test(value.sourceSha256) || !HASH.test(value.wasmSha256)) {
    throw new TypeError('Feature report v3 parser identity is invalid.');
  }
}
function rejectRuntime(value) {
  if (Array.isArray(value)) { value.forEach(rejectRuntime); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (RUNTIME_KEYS.has(key)) throw new TypeError(`Runtime-only field ${key} is forbidden.`);
    rejectRuntime(child);
  }
}
function lifecycle(count, policy) {
  const present = count > 0;
  return { recognized: present, parsed: present, retainedAsEvidence: present,
    stagedJsonStatus: !present ? 'not-applicable'
      : policy.engineeringMappingStatus === 'supported'
        ? 'requires-governed-mapping' : policy.engineeringMappingStatus };
}
function featureRows(base, registry, topologyCount) {
  const baseById = new Map(base.features.map((item) => [item.featureId, item]));
  return registry.entries.map((policy) => {
    const prior = baseById.get(policy.featureId);
    const count = policy.featureId === 'mesh-topology' ? topologyCount : prior.evidenceCount;
    const state = policy.featureId === 'mesh-topology' ? lifecycle(count, policy) : {
      recognized: prior.recognized, parsed: prior.parsed,
      retainedAsEvidence: prior.retainedAsEvidence,
      stagedJsonStatus: !count ? 'not-applicable'
        : policy.engineeringMappingStatus === 'supported'
          ? 'requires-governed-mapping' : policy.engineeringMappingStatus,
    };
    return { featureId: policy.featureId, ...state, evidenceCount: count,
      evidenceStatus: policy.evidenceStatus, renderStatus: policy.renderStatus,
      exportStatus: policy.exportStatus,
      engineeringMappingStatus: policy.engineeringMappingStatus,
      limitations: [...policy.limitations], futureWorkPack: policy.futureWorkPack };
  });
}
function blockedRows(features) {
  const fields = [['evidence', 'evidenceStatus'], ['render', 'renderStatus'],
    ['export', 'exportStatus'], ['engineering-mapping', 'engineeringMappingStatus'],
    ['stagedjson', 'stagedJsonStatus']], rows = [];
  for (const feature of features.filter((item) => item.evidenceCount > 0)) {
    for (const [capability, field] of fields) {
      if (['supported', 'not-applicable', 'requires-governed-mapping'].includes(feature[field])) continue;
      rows.push({ featureId: feature.featureId, capability, status: feature[field],
        limitations: [...feature.limitations] });
    }
  }
  return rows.sort((left, right) => (left.featureId < right.featureId ? -1
    : left.featureId > right.featureId ? 1 : 0)
    || CAPABILITIES.indexOf(left.capability) - CAPABILITIES.indexOf(right.capability));
}
function summary(features, blockedCapabilities) {
  const present = features.filter((item) => item.evidenceCount > 0);
  const count = (predicate) => present.filter(predicate).length;
  return { presentFeatures: present.length, recognizedFeatures: count((item) => item.recognized),
    parsedFeatures: count((item) => item.parsed), retainedEvidenceFeatures: count((item) => item.retainedAsEvidence),
    renderableFeatures: count((item) => item.renderStatus === 'supported'),
    exportableFeatures: count((item) => item.exportStatus === 'supported'),
    engineeringMappingEligibleFeatures: count((item) => item.engineeringMappingStatus === 'supported'),
    stagedJsonPublicationEligibleFeatures: count((item) => item.stagedJsonStatus === 'supported'),
    stagedJsonRequiresGovernedMappingFeatures: count((item) => item.stagedJsonStatus === 'requires-governed-mapping'),
    blockedCapabilities: blockedCapabilities.length,
    unknownFeatures: count((item) => item.evidenceStatus === 'unknown') };
}
async function acceptedInputs(graph, geometryBundle) {
  const accepted = enforceSourceGraphPolicy(graph);
  await validateFbxGeometryBundle(geometryBundle);
  const manifest = geometryBundle.manifest;
  if (manifest.sourceGraphSchema !== accepted.schema
    || manifest.sourceGraphSha256 !== await sha256Hex(canonicalJson(accepted))
    || manifest.sourceIdentity.fbxVersion !== accepted.file.version) throw new TypeError('Geometry bundle does not match the accepted source graph.');
  return { accepted, manifest };
}
export async function buildFbxFeatureReportV3({ graph, geometryBundle,
  registry = getFbxFeatureCapabilityRegistryV3() }) {
  validateFbxFeatureCapabilityRegistryV3(registry);
  const { accepted, manifest } = await acceptedInputs(graph, geometryBundle);
  const base = buildFbxFeatureReportV2({ graph: accepted,
    sourceIdentity: manifest.sourceIdentity, parserIdentity: manifest.parserIdentity });
  validateFbxFeatureReportV2(base);
  const topologyGeometries = manifest.geometries.length;
  const counts = { ...structuredClone(base.counts), topologyGeometries,
    polygonCount: manifest.geometries.reduce((sum, item) => sum + item.polygonCount, 0),
    polygonVertexCount: manifest.geometries.reduce((sum, item) => sum + item.polygonVertexCount, 0) };
  const features = featureRows(base, registry, topologyGeometries);
  const blockedCapabilities = blockedRows(features);
  const report = { schema: FBX_FEATURE_REPORT_V3_SCHEMA,
    registryVersion: registry.registryVersion, sourceGraphSchema: accepted.schema,
    geometryBundleSchema: manifest.schema, geometryBundleDigest: manifest.bundleDigest,
    sourceIdentity: structuredClone(manifest.sourceIdentity),
    parserIdentity: structuredClone(manifest.parserIdentity), counts, features,
    unknownElementTypes: structuredClone(base.unknownElementTypes),
    warnings: structuredClone(base.warnings), blockedCapabilities,
    summary: summary(features, blockedCapabilities) };
  return deepFreeze(validateFbxFeatureReportV3(report));
}
function validateFeatureRows(value, registry) {
  if (!Array.isArray(value.features) || value.features.length !== registry.entries.length) {
    throw new TypeError('Feature report v3 rows are incomplete.');
  }
  value.features.forEach((item, index) => {
    exactKeys(item, FEATURE_KEYS, `features[${index}]`); const policy = registry.entries[index];
    if (item.featureId !== policy.featureId || !Number.isSafeInteger(item.evidenceCount)
      || item.evidenceCount < 0 || typeof item.recognized !== 'boolean'
      || typeof item.parsed !== 'boolean' || typeof item.retainedAsEvidence !== 'boolean'
      || item.evidenceStatus !== policy.evidenceStatus || item.renderStatus !== policy.renderStatus
      || item.exportStatus !== policy.exportStatus
      || item.engineeringMappingStatus !== policy.engineeringMappingStatus
      || JSON.stringify(item.limitations) !== JSON.stringify(policy.limitations)
      || item.futureWorkPack !== policy.futureWorkPack) throw new TypeError('Feature report v3 policy differs from registry.');
    const present = item.evidenceCount > 0, unknown = item.featureId === 'unknown-element-types';
    if (item.recognized !== (present && !unknown) || item.parsed !== (present && !unknown)
      || item.retainedAsEvidence !== present) throw new TypeError('Feature report v3 lifecycle is invalid.');
    const staged = !present ? 'not-applicable' : policy.engineeringMappingStatus === 'supported'
      ? 'requires-governed-mapping' : policy.engineeringMappingStatus;
    if (item.stagedJsonStatus !== staged) throw new TypeError('Feature report v3 staged JSON status is invalid.');
  });
}
function validateEvidenceArrays(value) {
  if (!Array.isArray(value.unknownElementTypes) || !Array.isArray(value.warnings)
    || !Array.isArray(value.blockedCapabilities)) throw new TypeError('Feature report v3 evidence arrays are invalid.');
  let previousUnknown = null;
  value.unknownElementTypes.forEach((item, index) => {
    exactKeys(item, ['elementType', 'elementTypeValue', 'count'], `unknownElementTypes[${index}]`);
    if (typeof item.elementType !== 'string' || !item.elementType
      || !Number.isInteger(item.elementTypeValue) || item.elementTypeValue < 0
      || !Number.isSafeInteger(item.count) || item.count < 1) throw new TypeError('Unknown element type evidence is invalid.');
    const key = `${String(item.elementTypeValue).padStart(12, '0')}:${item.elementType}`;
    if (previousUnknown !== null && previousUnknown >= key) throw new TypeError('Unknown element type evidence must be unique and ordered.');
    previousUnknown = key;
  });
  value.warnings.forEach((item, index) => {
    exactKeys(item, ['type', 'description', 'elementId', 'count'], `warnings[${index}]`);
    if (!Number.isInteger(item.type) || item.type < 0 || typeof item.description !== 'string'
      || !Number.isInteger(item.elementId) || item.elementId < 0
      || !Number.isSafeInteger(item.count) || item.count < 1) throw new TypeError('Warning evidence is invalid.');
    const prior = value.warnings[index - 1];
    if (prior && (prior.type > item.type || (prior.type === item.type
      && (prior.elementId > item.elementId || (prior.elementId === item.elementId
        && (prior.description > item.description || (prior.description === item.description
          && prior.count > item.count))))))) throw new TypeError('Warnings must be deterministically ordered.');
  });
}
function validateReportRelations(value) {
  const topology = value.features.find((item) => item.featureId === 'mesh-topology');
  if (!topology || topology.evidenceCount !== value.counts.topologyGeometries
    || value.counts.topologyGeometries !== value.counts.meshGeometries
    || topology.recognized !== (topology.evidenceCount > 0)
    || topology.parsed !== (topology.evidenceCount > 0)
    || topology.retainedAsEvidence !== (topology.evidenceCount > 0)) {
    throw new TypeError('Feature report v3 topology counts are inconsistent.');
  }
  const unknown = value.features.find((item) => item.featureId === 'unknown-element-types');
  const unknownCount = value.unknownElementTypes.reduce((sum, item) => sum + item.count, 0);
  if (unknownCount !== unknown.evidenceCount || value.counts.warnings !== value.warnings.length
    || value.counts.geometries !== value.counts.meshGeometries + value.counts.nurbsCurveGeometries) {
    throw new TypeError('Feature report v3 aggregate evidence is inconsistent.');
  }
}
export function validateFbxFeatureReportV3(value) {
  rejectRuntime(value); exactKeys(value, TOP_KEYS, 'featureReport');
  const registry = getFbxFeatureCapabilityRegistryV3();
  if (value.schema !== FBX_FEATURE_REPORT_V3_SCHEMA
    || value.registryVersion !== registry.registryVersion
    || value.sourceGraphSchema !== 'FbxSourceGraph.v2'
    || value.geometryBundleSchema !== 'FbxGeometryBundle.v1'
    || !HASH.test(value.geometryBundleDigest)) throw new TypeError('Feature report v3 identity is invalid.');
  validateIdentity(value.sourceIdentity); validateParser(value.parserIdentity);
  exactKeys(value.counts, COUNT_KEYS, 'featureReport.counts');
  if (Object.values(value.counts).some((item) => !Number.isSafeInteger(item) || item < 0)) {
    throw new TypeError('Feature report v3 counts are invalid.');
  }
  validateFeatureRows(value, registry); validateEvidenceArrays(value); validateReportRelations(value);
  exactKeys(value.summary, SUMMARY_KEYS, 'featureReport.summary');
  if (!sameIdentity(value.summary, summary(value.features, value.blockedCapabilities))
    || !sameIdentity(value.blockedCapabilities, blockedRows(value.features))) {
    throw new TypeError('Feature report v3 summary is inconsistent.');
  }
  return value;
}
