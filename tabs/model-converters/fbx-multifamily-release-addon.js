import { getConverterById } from './converter-registry.js?v=20260617-basic-glb-3';
import { buildFbxSourceGraphZoneExport } from './fbx-source-graph-zone-export.js';
import { buildFbxStagedJsonZoneExport } from './fbx-staged-json-zone-export.js';
import { canonicalJson } from './converters/fbx/canonical-json.js';
import { resolveBrowserFbxSecondary } from './converters/fbx/fbx2-browser-inputs.js?v=20260804-fbx-multifamily-release-1';
import { scopeMappedStagedBranches } from './converters/fbx/zone-geometry/mapped-stage-scope.js';

export const FBX_MULTI_FAMILY_RELEASE_VERSION = '20260804-fbx-multifamily-release-1';
export const MANAGED_MULTI_FAMILY_STAGEDJSON_PASS = 'MANAGED_MULTI_FAMILY_STAGEDJSON_PASS';
export const BLOCKED_MANAGED_MULTI_FAMILY_RELEASE = 'BLOCKED_MANAGED_MULTI_FAMILY_RELEASE';

const PATCH_MARKER = Symbol.for('model-converters.fbx-multifamily-release.v1');
const SELECTED_ZONE_PASS = 'STAGEDJSON_SELECTED_ZONE_PASS';
const RELEASE_TAG = 'SELECTED_ZONE_RELEASE:MANAGED_MULTI_FAMILY';

function inputFor(context, role) {
  return context?.inputFiles?.find((file) => file.role === role) || null;
}

function stdoutOf(result) {
  return Array.isArray(result?.logs?.stdout) ? result.logs.stdout : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function selectedZoneIdFromResult(result) {
  const line = stdoutOf(result).find((item) => String(item).startsWith('SELECTED_ZONE_ID:'));
  return line ? String(line).slice('SELECTED_ZONE_ID:'.length).trim() : '';
}

function sourceGraphOutput(result) {
  return (result?.outputs || []).find((output) => /\.fbx-source-graph\.json$/i.test(
    String(output?.name || ''),
  )) || null;
}

function selectedZoneOutputIndex(result) {
  return (result?.outputs || []).findIndex((output) => /\.selected-zone\.json$/i.test(
    String(output?.name || ''),
  ));
}

function parseSourceGraph(result) {
  const output = sourceGraphOutput(result);
  if (!output || typeof output.text !== 'string') {
    throw new Error('SELECTED_ZONE_SOURCE_GRAPH_OUTPUT_MISSING');
  }
  const graph = JSON.parse(output.text);
  if (!graph || !Array.isArray(graph.occurrences)) {
    throw new Error('SELECTED_ZONE_SOURCE_GRAPH_OUTPUT_INVALID');
  }
  return graph;
}

function familyName(child) {
  const raw = String(child?.type || child?.attributes?.TYPE || 'UNKNOWN').trim().toUpperCase();
  const aliases = {
    ELBO: 'ELBOW', VALV: 'VALVE', FLAN: 'FLANGE', REDU: 'REDUCER',
    GASK: 'GASKET', INST: 'INSTRUMENT', OLET: 'OLET', BRAN: 'BRANCH',
  };
  return aliases[raw] || raw || 'UNKNOWN';
}

export function countSelectedZoneFamilies(branches) {
  const counts = {};
  let componentCount = 0;
  for (const branch of branches || []) {
    for (const child of branch?.children || []) {
      const family = familyName(child);
      counts[family] = (counts[family] || 0) + 1;
      componentCount += 1;
    }
  }
  return Object.freeze({
    componentCount,
    familyCounts: Object.freeze(Object.fromEntries(Object.entries(counts).sort())),
  });
}

function selectedOccurrenceEvidence(graph, zoneId) {
  const subset = buildFbxSourceGraphZoneExport(graph, zoneId);
  return {
    selectedOccurrenceIds: subset.occurrences.map((item) => item.sourceOccurrenceId),
  };
}

function scopedManagedBranches(graph, managedBranches, zoneId) {
  const scoped = scopeMappedStagedBranches(
    managedBranches,
    selectedOccurrenceEvidence(graph, zoneId),
  );
  if (!scoped.length) throw new Error('SELECTED_ZONE_MANAGED_STAGE_SCOPE_EMPTY');
  return buildFbxStagedJsonZoneExport(graph, scoped, zoneId);
}

function releaseLogs(summary) {
  const counts = summary.familyCounts;
  return [
    RELEASE_TAG,
    `SELECTED_ZONE_RELEASE_STATUS:${MANAGED_MULTI_FAMILY_STAGEDJSON_PASS}`,
    `SELECTED_ZONE_RELEASE_COMPONENTS:${summary.componentCount}`,
    `SELECTED_ZONE_RELEASE_PIPES:${counts.PIPE || 0}`,
    `SELECTED_ZONE_RELEASE_ELBOWS:${counts.ELBOW || 0}`,
    `SELECTED_ZONE_RELEASE_TEES:${counts.TEE || 0}`,
    `SELECTED_ZONE_RELEASE_VALVES:${counts.VALVE || 0}`,
    `SELECTED_ZONE_RELEASE_FLANGES:${counts.FLANGE || 0}`,
  ];
}

function replaceSelectedOutput(result, branches, release) {
  const index = selectedZoneOutputIndex(result);
  if (index < 0) throw new Error('SELECTED_ZONE_STAGEDJSON_OUTPUT_MISSING');
  const outputs = [...result.outputs];
  outputs[index] = {
    ...outputs[index],
    text: canonicalJson(branches),
    mime: 'application/json;charset=utf-8',
  };
  return {
    ...result,
    outputs,
    selectedZoneRelease: release,
    logs: {
      ...(result.logs || {}),
      stdout: unique([...releaseLogs(release), ...stdoutOf(result)]),
      stderr: Array.isArray(result?.logs?.stderr) ? result.logs.stderr : [],
    },
  };
}

function blockedResult(result, error) {
  const message = error instanceof Error ? error.message : String(error);
  const outputs = (result?.outputs || []).filter((output) => !/\.selected-zone\.json$/i.test(
    String(output?.name || ''),
  ));
  return {
    ...result,
    ok: false,
    blocked: true,
    conversionStatus: BLOCKED_MANAGED_MULTI_FAMILY_RELEASE,
    outputs,
    selectedZoneRelease: Object.freeze({
      schema: 'FbxSelectedZoneRelease.v1',
      status: BLOCKED_MANAGED_MULTI_FAMILY_RELEASE,
      authority: 'APPROVED_MANAGED_STAGE',
      error: message,
    }),
    logs: {
      ...(result?.logs || {}),
      stdout: unique([
        RELEASE_TAG,
        `SELECTED_ZONE_RELEASE_STATUS:${BLOCKED_MANAGED_MULTI_FAMILY_RELEASE}`,
        ...stdoutOf(result),
      ]),
      stderr: unique([...(result?.logs?.stderr || []), message]),
    },
  };
}

export async function promoteManagedMultiFamilyResult(context, result) {
  if (result?.conversionStatus !== SELECTED_ZONE_PASS || stdoutOf(result).includes(RELEASE_TAG)) {
    return result;
  }
  const secondary = await resolveBrowserFbxSecondary(inputFor(context, 'secondary'));
  if (secondary.kind !== 'managed-stage') return result;
  try {
    const zoneId = selectedZoneIdFromResult(result);
    if (!zoneId) throw new Error('SELECTED_ZONE_ID_MISSING');
    const graph = parseSourceGraph(result);
    const branches = scopedManagedBranches(graph, secondary.value, zoneId);
    const summary = countSelectedZoneFamilies(branches);
    if (!summary.componentCount) throw new Error('SELECTED_ZONE_MANAGED_STAGE_COMPONENTS_EMPTY');
    const release = Object.freeze({
      schema: 'FbxSelectedZoneRelease.v1',
      status: MANAGED_MULTI_FAMILY_STAGEDJSON_PASS,
      authority: 'APPROVED_MANAGED_STAGE',
      zoneId,
      sourceName: String(inputFor(context, 'primary')?.name || ''),
      managedSourceName: String(inputFor(context, 'secondary')?.name || ''),
      componentCount: summary.componentCount,
      familyCounts: summary.familyCounts,
    });
    return replaceSelectedOutput(result, branches, release);
  } catch (error) {
    return blockedResult(result, error);
  }
}

export function installFbxMultiFamilyReleaseAddon() {
  const converter = getConverterById('fbx_to_stagedjson');
  if (!converter || typeof converter.run !== 'function') return false;
  if (converter[PATCH_MARKER] === FBX_MULTI_FAMILY_RELEASE_VERSION) return false;
  const original = converter.run;
  converter.run = async function runWithMultiFamilyRelease(context = {}, ...rest) {
    const result = await original.call(this, context, ...rest);
    return promoteManagedMultiFamilyResult(context, result);
  };
  Object.defineProperty(converter, PATCH_MARKER, {
    configurable: true,
    value: FBX_MULTI_FAMILY_RELEASE_VERSION,
  });
  return true;
}
