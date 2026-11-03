import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { calculateFragmentId } from '../../tabs/model-converters/converters/fbx/mapping-decision-fragment.js';
import {
  appendCanonicalArrayItem, closeWritable, digestWorklistPayload, writeWorklistFile,
} from '../../tabs/model-converters/converters/fbx/review-execution/canonical-spool.js';

export const SCALE_COUNTS = Object.freeze({ L1: 10_000, L2: 100_000, L3: 1_000_000 });
const DISPLAY_NAMES = ['2', '10', 'namespace:name', 'namespace-name', 'é', 'é'];
const WORKER = fileURLToPath(new URL('../../scripts/fbx/review-scale/operation-worker.mjs', import.meta.url));

function fixedFields(count) {
  return {
    schema: 'FbxMappingWorklist.v1',
    worklistId: '0'.repeat(64),
    source: { sha256: '1'.repeat(64), byteLength: Math.max(1, count), fbxVersion: 7400 },
    parser: {
      provenanceSchema: 'FbxParserProvenance.v1', upstreamRevision: '7'.repeat(40),
      sourceSha256: '3'.repeat(64), wasmSha256: '4'.repeat(64),
    },
    sourceGraph: { schema: 'FbxSourceGraph.v2', canonicalSha256: '2'.repeat(64) },
    scopePolicy: {
      id: 'SOURCE_GRAPH_SUPPORTED_OCCURRENCES_V1', authority: 'FbxSourceGraph.v2',
      requiredElementType: 'NODE', requiredDisposition: 'supported-occurrence',
      identityJoin: 'occurrence.sourceModelObjectId', namesAuthoritative: false,
      geometryAuthoritativeForClassification: false,
    },
  };
}

function paddedWorkItemId(value) {
  return `work-${value.toString(16).padStart(64, '0')}`;
}

function syntheticWorkItem(index) {
  const identity = index + 1;
  const objectId = String(identity);
  const geometryId = String(identity + 2_000_000);
  return {
    workItemId: paddedWorkItemId(identity),
    sourceModelObjectId: objectId,
    sourceOccurrenceId: `occ:${identity}`,
    sourceGeometryObjectIds: [geometryId],
    typeEvidence: {
      ufbxElementId: index, ufbxTypedId: index, ufbxElementType: 'NODE',
      ufbxElementTypeValue: 1, nodeAttributeType: 'MESH',
      nodeAttributeTypeValue: 1, sourceDocumentOrder: index,
    },
    nameEvidence: {
      authority: 'NON_AUTHORITATIVE', domClass: 'Model', domSubtype: '',
      domSourceName: `synthetic-${identity}`, displayName: DISPLAY_NAMES[index % DISPLAY_NAMES.length],
    },
    sourceRecordDisposition: 'supported-occurrence',
    geometryEvidence: [{
      geometryObjectId: geometryId, kind: 'MESH',
      pointAuthority: 'MESH_VERTEX', governedPointCount: 3,
    }],
    reviewState: 'PENDING',
  };
}

export async function createSyntheticWorklist(root, count) {
  const spool = join(root, 'corpus-spool');
  await mkdir(spool, { recursive: true });
  const workItemsPath = join(spool, 'work-items.canonical');
  const retainedPath = join(spool, 'retained.canonical');
  const stream = createWriteStream(workItemsPath, { encoding: 'utf8', flags: 'wx' });
  for (let index = 0; index < count; index++) {
    await appendCanonicalArrayItem(stream, syntheticWorkItem(count - index - 1), index);
  }
  await closeWritable(stream);
  await writeFile(retainedPath, '', { encoding: 'utf8', flag: 'wx' });
  const fields = fixedFields(count);
  const paths = { workItems: workItemsPath, retainedEvidence: retainedPath };
  const counts = { workItems: count, retainedEvidence: 0 };
  fields.worklistId = await digestWorklistPayload(fields, paths, counts);
  const worklistPath = join(root, `worklist-${count}.json`);
  await writeWorklistFile(worklistPath, fields, paths, counts);
  await rm(spool, { recursive: true, force: true });
  return { worklistPath, canonicalBytes: (await stat(worklistPath)).size, workItemCount: count };
}

export async function createExclusionFragments(bundleDir, fragmentDir) {
  await mkdir(fragmentDir, { recursive: true });
  const bundle = JSON.parse(await readFile(join(bundleDir, 'manifest.json'), 'utf8'));
  for (const meta of bundle.shards) {
    const shard = JSON.parse(await readFile(join(bundleDir, meta.fileName), 'utf8'));
    const fragment = {
      schema: 'FbxMappingDecisionFragment.v1', bundleId: bundle.bundleId,
      worklistId: bundle.worklistId,
      sourceGraphCanonicalSha256: bundle.sourceGraphCanonicalSha256,
      shardId: shard.shardId, fragmentId: '0'.repeat(64),
      decisions: shard.workItems.map((item) => ({
        workItemId: item.workItemId,
        disposition: 'exclude-with-reason', reason: 'synthetic scale qualification',
      })).reverse(),
    };
    fragment.fragmentId = await calculateFragmentId(fragment);
    await writeFile(join(fragmentDir, `fragment-${meta.ordinal}.json`), canonicalJson(fragment), { flag: 'wx' });
  }
  return { bundle, fragmentCount: bundle.shards.length };
}

export async function assertFilesEqual(left, right) {
  assert.equal(Buffer.compare(await readFile(left), await readFile(right)), 0, `${left} differs from ${right}`);
}

export async function assertDirectoriesEqual(left, right) {
  const leftNames = (await readdir(left)).sort();
  const rightNames = (await readdir(right)).sort();
  assert.deepEqual(leftNames, rightNames);
  for (const name of leftNames) await assertFilesEqual(join(left, name), join(right, name));
}

function collectChild(child) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`worker exited ${code}: ${stderr}`));
      else resolve(JSON.parse(stdout.trim()));
    });
  });
}

export async function runMeasuredOperation(root, label, config) {
  const configPath = join(root, `${label}.config.json`);
  await writeFile(configPath, JSON.stringify({ ...config, monitorRoot: root }), { flag: 'wx' });
  const child = spawn(process.execPath, [WORKER, configPath], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, NODE_OPTIONS: config.nodeOptions || '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return collectChild(child);
}

async function missionWorkspaces(path) {
  const matches = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.name.includes('.f2s007-')) matches.push(child);
    if (entry.isDirectory()) matches.push(...await missionWorkspaces(child));
  }
  return matches;
}

export async function assertNoMissionWorkspaces(root) {
  assert.deepEqual(await missionWorkspaces(root), []);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function resourceSample(run) {
  const resources = run.resources;
  return {
    wallMs: resources.wallMs,
    cpuUserMs: resources.cpuUserMs,
    cpuSystemMs: resources.cpuSystemMs,
    cpuTotalMs: resources.cpuUserMs + resources.cpuSystemMs,
    peakRssBytes: resources.peakRssBytes,
    peakHeapBytes: resources.peakHeapBytes,
    temporaryDiskPeakBytes: resources.temporaryDiskPeakBytes,
    bytesRead: resources.bytesRead,
    bytesWritten: resources.bytesWritten,
    fileDescriptorPeak: resources.fileDescriptorPeak,
  };
}

export function runStatistics(runs) {
  const samples = runs.map(resourceSample);
  const wall = samples.map((sample) => sample.wallMs);
  const cpu = samples.map((sample) => sample.cpuTotalMs);
  return {
    runCount: runs.length,
    canonicalInputBytes: runs[0].canonicalInputBytes,
    canonicalOutputBytes: runs[0].canonicalOutputBytes,
    executionMetrics: runs[0].executionMetrics,
    runs: samples,
    medianWallMs: median(wall),
    worstWallMs: Math.max(...wall),
    medianCpuMs: median(cpu),
    worstCpuMs: Math.max(...cpu),
    peakRssBytes: Math.max(...samples.map((sample) => sample.peakRssBytes)),
    peakHeapBytes: Math.max(...samples.map((sample) => sample.peakHeapBytes)),
    temporaryDiskPeakBytes: Math.max(...samples.map((sample) => sample.temporaryDiskPeakBytes)),
    bytesRead: Math.max(...samples.map((sample) => sample.bytesRead || 0)),
    bytesWritten: Math.max(...samples.map((sample) => sample.bytesWritten || 0)),
    fileDescriptorPeak: Math.max(...samples.map((sample) => sample.fileDescriptorPeak || 0)),
  };
}
