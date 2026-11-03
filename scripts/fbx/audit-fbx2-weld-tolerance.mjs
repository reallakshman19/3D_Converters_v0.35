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
  set onmessage(value) { this._onmessage = value; } get onmessage() { return this._onmessage; }
  set onerror(value) { this._onerror = value; } get onerror() { return this._onerror; }
  set onmessageerror(value) { this._onmessageerror = value; } get onmessageerror() { return this._onmessageerror; }
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
const { SOLID_FITTING_PORT_PROFILE } = await import(
  '../../tabs/model-converters/converters/fbx/solid-fitting-ports/profile.js');

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}
function increment(map, key) { map.set(String(key), (map.get(String(key)) || 0) + 1); }
function ordered(map) {
  return Object.fromEntries([...map].sort((a, b) => Number(a[0]) - Number(b[0])));
}
function selectZone(zones, label) {
  const matches = zones.filter((item) => item.label === label);
  assert.equal(matches.length, 1, `Expected exactly one zone ${label}.`);
  return matches[0];
}
async function summarizeTolerance(selections, tolerance) {
  const histogram = new Map(), shellRejections = new Map();
  let mergedVertices = 0, duplicateFaces = 0, oneCleanShell = 0;
  const profile = { ...SOLID_FITTING_PORT_PROFILE,
    vertexMergeAbsoluteMm: tolerance, vertexMergeRelativeTolerance: 0 };
  for (const selection of selections) {
    const raw = decodeExactPolygonTopology(selection);
    const projected = buildSolidFittingAnalysisTopology(raw, profile);
    const shells = await deriveConnectedShells(projected.topology);
    increment(histogram, shells.length);
    mergedVertices += projected.evidence.mergedVertexCount;
    duplicateFaces += projected.evidence.duplicateFaceIds.length;
    if (shells.length === 1 && !shells[0].rejectionReasons.length) oneCleanShell += 1;
    for (const shell of shells) for (const reason of shell.rejectionReasons) increment(shellRejections, reason);
  }
  return { toleranceMm: tolerance, shellHistogram: ordered(histogram), oneCleanShell,
    mergedVertices, duplicateFaces, shellRejections: ordered(shellRejections) };
}
async function main() {
  const fbxPath = argument('--fbx'), evidencePath = argument(
    '--evidence', 'artifacts/fbx2-weld-tolerance-sweep.json');
  const zoneLabel = argument('--zone', '/GLRD-1000-CU-PI-P');
  assert.ok(fbxPath, '--fbx is required.');
  const bytes = new Uint8Array(await readFile(fbxPath));
  const sourceGraph = await parseFbxInWorker(bytes, { timeoutMs: 300000 });
  const geometryBundle = await parseFbxGeometryBundleInWorker(bytes, { timeoutMs: 300000 });
  const zone = selectZone(listFbxZoneScopeSummaries(sourceGraph), zoneLabel);
  const prepared = await prepareZoneGeometryEvidence({
    sourceGraph, geometryBundle, zoneId: zone.zoneId,
  });
  const inheritance = new Map();
  for (const occurrence of prepared.scope.selectedOccurrences) increment(inheritance, occurrence.inheritMode);
  const tolerances = [1e-6, 2e-6, 3e-6, 5e-6, 1e-5, 3e-5, 1e-4];
  const results = [];
  for (const tolerance of tolerances) results.push(await summarizeTolerance(prepared.selections, tolerance));
  const evidence = { schema: 'Fbx2WeldToleranceSweep.v1', selectedZone: zone,
    inheritModeCounts: ordered(inheritance), results };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
}
await main();
