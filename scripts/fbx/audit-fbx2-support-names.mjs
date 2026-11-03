import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Worker as ThreadWorker } from 'node:worker_threads';
import { buildFbx2SupportNameInventory } from './fbx2-small-benchmark/support-name-authority.mjs';

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
const { parseFbxInWorker } = await import(
  '../../tabs/model-converters/converters/fbx/parser-client.js');
const { listFbxZoneScopeSummaries, resolveSelectedZoneScope } = await import(
  '../../tabs/model-converters/converters/fbx/zone-geometry/zone-scope.js');

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function selectZone(zones, requestedLabel) {
  const exact = zones.find((item) => item.label === requestedLabel);
  if (exact) return exact;
  const folded = requestedLabel.toUpperCase();
  const matches = zones.filter((item) => item.label.toUpperCase().includes(folded));
  assert.equal(matches.length, 1,
    `Expected one selected zone matching ${requestedLabel}, found ${matches.length}.`);
  return matches[0];
}

function reportPayload(source, archive, zone, inventory) {
  return {
    schema: 'Fbx2SupportNameAudit.v1',
    source: {
      file: source.path, byteLength: source.bytes.length, sha256: sha256(source.bytes),
      archive: archive?.path ?? null,
      archiveByteLength: archive?.bytes.length ?? null,
      archiveSha256: archive ? sha256(archive.bytes) : null,
    },
    selectedZone: {
      zoneId: zone.zoneId, label: zone.zoneLabel,
      selectedOccurrenceCount: zone.selectedOccurrences.length,
      selectedGeometryCount: zone.selectedGeometryIds.length,
    },
    candidateCount: inventory.candidateCount,
    structureContextCount: inventory.structureContextCount,
    supportTokenCounts: inventory.supportTokenCounts,
    structureTokenCounts: inventory.structureTokenCounts,
    candidates: inventory.candidates,
    authority: inventory.authority,
  };
}

async function main() {
  const fbxPath = argument('--fbx');
  const archivePath = argument('--input-zip');
  const zoneLabel = argument('--zone', '/GLRD-1000-CU-PI-P');
  const outputPath = argument('--output', 'artifacts/fbx2-support-name-audit.json');
  assert.ok(fbxPath, '--fbx is required.');
  const [fbxBytes, archiveBytes] = await Promise.all([
    readFile(fbxPath), archivePath ? readFile(archivePath) : null,
  ]);
  const sourceGraph = await parseFbxInWorker(new Uint8Array(fbxBytes), { timeoutMs: 300000 });
  const summary = selectZone(listFbxZoneScopeSummaries(sourceGraph), zoneLabel);
  const scope = resolveSelectedZoneScope(sourceGraph, summary.zoneId);
  const inventory = buildFbx2SupportNameInventory({
    sourceGraph,
    selectedOccurrenceIds: scope.selectedOccurrences.map((item) => item.sourceOccurrenceId),
  });
  const payload = reportPayload(
    { path: fbxPath, bytes: fbxBytes },
    archiveBytes ? { path: archivePath, bytes: archiveBytes } : null,
    scope,
    inventory,
  );
  const reportDigest = sha256(Buffer.from(JSON.stringify(payload)));
  const report = { ...payload, reportDigest,
    artifactId: `FBX2SUPNAME-${reportDigest.slice(0, 32)}` };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    candidateCount: report.candidateCount,
    structureContextCount: report.structureContextCount,
    supportTokenCounts: report.supportTokenCounts,
    structureTokenCounts: report.structureTokenCounts,
    outputPath,
  }, null, 2));
}

await main();
