import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Worker as ThreadWorker } from 'node:worker_threads';

class NodeWorkerAdapter {
  constructor(url, options) {
    this.worker = new ThreadWorker(url, options);
    this._onmessage = null; this._onerror = null; this._onmessageerror = null;
    this.worker.on('message', (data) => this._onmessage?.({ data }));
    this.worker.on('error', (error) => this._onerror?.({ message: error.message, error }));
    this.worker.on('messageerror', (error) => this._onmessageerror?.({ error }));
  }
  set onmessage(value) { this._onmessage = value; }
  get onmessage() { return this._onmessage; }
  set onerror(value) { this._onerror = value; }
  get onerror() { return this._onerror; }
  set onmessageerror(value) { this._onmessageerror = value; }
  get onmessageerror() { return this._onmessageerror; }
  postMessage(value, transfer) { this.worker.postMessage(value, transfer); }
  terminate() { return this.worker.terminate(); }
}
globalThis.Worker = NodeWorkerAdapter;

const { parseFbxInWorker } = await import('../../tabs/model-converters/converters/fbx/parser-client.js');
const { parseFbxGeometryBundleInWorker } = await import('../../tabs/model-converters/converters/fbx/geometry-transport.js');
const { listFbxZoneScopeSummaries } = await import('../../tabs/model-converters/converters/fbx/zone-geometry/zone-scope.js');
const { prepareZoneGeometryEvidence } = await import('../../tabs/model-converters/converters/fbx/zone-geometry/zone-evidence.js');
const { decodeExactPolygonTopology } = await import('../../tabs/model-converters/converters/fbx/zone-geometry/polygon-topology.js');
const { deriveConnectedShells } = await import('../../tabs/model-converters/converters/fbx/zone-geometry/shells.js');
const { buildSolidFittingAnalysisTopology } = await import(
  '../../tabs/model-converters/converters/fbx/solid-fitting-ports/analysis-topology.js');
const { projectFaceFeatures } = await import(
  '../../tabs/model-converters/converters/fbx/solid-fitting-ports/topology-projection.js');
const { deriveCapRegions } = await import(
  '../../tabs/model-converters/converters/fbx/solid-fitting-ports/cap-clustering.js');
const { evaluateCapRegions } = await import(
  '../../tabs/model-converters/converters/fbx/solid-fitting-ports/candidate-evaluation.js');
const { classifyPortTopology } = await import(
  '../../tabs/model-converters/converters/fbx/solid-fitting-ports/port-topology-disposition.js');
const { SOLID_FITTING_PORT_PROFILE } = await import(
  '../../tabs/model-converters/converters/fbx/solid-fitting-ports/profile.js');

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function increment(map, key) { map.set(String(key), (map.get(String(key)) || 0) + 1); }
function ordered(map) {
  return [...map].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))
    .map(([value, count]) => ({ value, count }));
}
function leadingFamily(value) {
  const name = String(value || '').trim().toUpperCase();
  if (name === 'CYLINDER') return name;
  if (name.startsWith('/')) return 'NAMED_ITEM';
  return name.match(/^[A-Z]+/)?.[0] || 'UNKNOWN';
}
function sourceName(sourceGraph, occurrence) {
  const source = sourceGraph.sourceObjects.find((item) =>
    item.sourceObjectId === occurrence.sourceModelObjectId);
  return source?.displayName || source?.domSourceName || occurrence.sourceModelObjectId;
}
function selectZone(zones, label) {
  const matches = zones.filter((item) => item.label === label);
  assert.equal(matches.length, 1, `Expected exactly one zone ${label}.`);
  return matches[0];
}
async function candidateDisposition(topology, shell, occurrence, geometryObjectId) {
  if (shell.rejectionReasons.length) return {
    disposition: 'REJECTED_SHELL', candidateCount: 0, admittedCandidateCount: 0,
    rejectionReasons: shell.rejectionReasons,
  };
  const features = projectFaceFeatures(topology);
  const regions = deriveCapRegions(topology, shell, features, SOLID_FITTING_PORT_PROFILE);
  const candidates = await evaluateCapRegions(
    occurrence, geometryObjectId, shell.shellId, regions, SOLID_FITTING_PORT_PROFILE);
  const admitted = candidates.filter((item) => item.admissionDisposition === 'ADMITTED');
  const classified = classifyPortTopology(admitted, SOLID_FITTING_PORT_PROFILE);
  return { disposition: classified.disposition, candidateCount: candidates.length,
    admittedCandidateCount: admitted.length,
    rejectionReasons: classified.reason ? [classified.reason] : [] };
}
async function inspectSelection(selection, scope, sourceGraph) {
  const raw = decodeExactPolygonTopology(selection);
  const projected = buildSolidFittingAnalysisTopology(raw, SOLID_FITTING_PORT_PROFILE);
  const rawShells = await deriveConnectedShells(raw);
  const analysisShells = await deriveConnectedShells(projected.topology);
  const occurrences = scope.selectedOccurrences.filter((item) =>
    item.geometryObjectIds.includes(raw.geometryObjectId));
  const occurrenceResults = [];
  for (const occurrence of occurrences) {
    const family = leadingFamily(sourceName(sourceGraph, occurrence));
    if (analysisShells.length !== 1) {
      occurrenceResults.push({ sourceOccurrenceId: occurrence.sourceOccurrenceId, family,
        disposition: 'MULTIPLE_ANALYSIS_SHELLS', shellCount: analysisShells.length });
      continue;
    }
    const result = await candidateDisposition(
      projected.topology, analysisShells[0], occurrence, raw.geometryObjectId);
    occurrenceResults.push({ sourceOccurrenceId: occurrence.sourceOccurrenceId, family,
      shellCount: 1, ...result });
  }
  return {
    geometryObjectId: raw.geometryObjectId, rawShellCount: rawShells.length,
    analysisShellCount: analysisShells.length, projection: projected.evidence,
    analysisShellRejections: analysisShells.flatMap((shell) => shell.rejectionReasons),
    occurrenceResults,
  };
}
function summaryFor(records) {
  const rawShells = new Map(), analysisShells = new Map(), dispositions = new Map();
  const familyDispositions = new Map();
  let mergedVertices = 0, duplicateFaces = 0, degenerateFaces = 0;
  for (const record of records) {
    increment(rawShells, record.rawShellCount); increment(analysisShells, record.analysisShellCount);
    mergedVertices += record.projection.mergedVertexCount;
    duplicateFaces += record.projection.duplicateFaceIds.length;
    degenerateFaces += record.projection.degenerateFaceIds.length;
    for (const result of record.occurrenceResults) {
      increment(dispositions, result.disposition);
      increment(familyDispositions, `${result.family}:${result.disposition}`);
    }
  }
  return { geometryCount: records.length, rawShellHistogram: ordered(rawShells),
    analysisShellHistogram: ordered(analysisShells), dispositionCounts: ordered(dispositions),
    familyDispositionCounts: ordered(familyDispositions), mergedVertices,
    duplicateFaces, degenerateFaces };
}
async function main() {
  const fbxPath = argument('--fbx'), evidencePath = argument(
    '--evidence', 'artifacts/fbx2-weld-projection.json');
  const zoneLabel = argument('--zone', '/GLRD-1000-CU-PI-P');
  assert.ok(fbxPath, '--fbx is required.');
  const bytes = new Uint8Array(await readFile(fbxPath));
  const sourceGraph = await parseFbxInWorker(bytes, { timeoutMs: 300000 });
  const geometryBundle = await parseFbxGeometryBundleInWorker(bytes, { timeoutMs: 300000 });
  const zone = selectZone(listFbxZoneScopeSummaries(sourceGraph), zoneLabel);
  const prepared = await prepareZoneGeometryEvidence({
    sourceGraph, geometryBundle, zoneId: zone.zoneId,
  });
  const records = [];
  for (const selection of prepared.selections) records.push(await inspectSelection(
    selection, prepared.scope, sourceGraph));
  records.sort((a, b) => compareText(a.geometryObjectId, b.geometryObjectId));
  const evidence = { schema: 'Fbx2WeldProjectionAudit.v1', selectedZone: zone,
    profile: SOLID_FITTING_PORT_PROFILE, summary: summaryFor(records), records };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ selectedZone: zone, summary: evidence.summary, evidencePath }, null, 2));
}
await main();
