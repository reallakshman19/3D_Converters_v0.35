import { getConverterById } from './converter-registry.js?v=20260617-basic-glb-3';
import { runFbxWithReviewUi } from './fbx-review-ui-addon.js?v=20260804-fbx-multifamily-release-1';
import { run as runLiveFbxToStagedJson } from './converters/fbx-to-stagedjson.js?v=20260804-fbx-multifamily-release-1';

const VERSION = '20260804-fbx-multifamily-release-1';
const LIVE_TAG = `FBX_LIVE_UI_ACTIVE:${VERSION}`;
const PATCH_MARKER = Symbol.for('model-converters.fbx-live-runner.v1');
const SOURCE_GRAPH_PATTERN = /\.fbx-source-graph\.json$/i;

function inputFile(context, role) {
  return Array.isArray(context?.inputFiles)
    ? context.inputFiles.find((file) => file?.role === role && file?.bytes)
    : null;
}
function hasSecondaryInput(context) {
  return Boolean(inputFile(context, 'secondary'));
}
function selectedPreviewZoneId() {
  if (typeof document === 'undefined') return '';
  const select = document.querySelector('[data-fbx-preview-zone]');
  return String(select?.value || '').trim();
}

export function withFbxUiZoneSelection(context = {}) {
  const options = { ...(context.options || {}) };
  if (!options.fbxSelectedZoneId && !hasSecondaryInput(context)) {
    const selectedZoneId = selectedPreviewZoneId();
    if (selectedZoneId) options.fbxSelectedZoneId = selectedZoneId;
  }
  return { ...context, options };
}

export function prioritizeFbxSourceGraphOutputs(outputs) {
  const normalized = Array.isArray(outputs) ? outputs : [];
  const sourceGraphs = normalized.filter((output) => SOURCE_GRAPH_PATTERN.test(String(output?.name || '')));
  if (!sourceGraphs.length) return normalized;
  const sourceSet = new Set(sourceGraphs);
  return [...sourceGraphs, ...normalized.filter((output) => !sourceSet.has(output))];
}

function liveDiagnostics(context, outputs) {
  const primary = inputFile(context, 'primary');
  const secondary = inputFile(context, 'secondary');
  const sourceGraphFirst = SOURCE_GRAPH_PATTERN.test(String(outputs?.[0]?.name || ''));
  return [
    LIVE_TAG,
    `FBX_PRIMARY_INPUT:${primary?.name || 'ABSENT'}`,
    `FBX_SECONDARY_INPUT:${secondary?.name || 'ABSENT'}`,
    `FBX_PREVIEW_AUTHORITY:${sourceGraphFirst ? 'SOURCE_GRAPH' : 'FALLBACK'}`,
  ];
}

function appendLiveEvidence(result, context) {
  const logs = result?.logs || {};
  const outputs = prioritizeFbxSourceGraphOutputs(result?.outputs);
  const stdout = [
    ...liveDiagnostics(context, outputs),
    ...(Array.isArray(logs.stdout) ? logs.stdout : []),
  ];
  const hasSecondary = hasSecondaryInput(context);
  const contradictoryAbsent = hasSecondary && stdout.includes('OPTIONAL_MAPPING_ABSENT');
  if (contradictoryAbsent) {
    return {
      ...result,
      ok: false,
      blocked: true,
      conversionStatus: 'BLOCKED_SECONDARY_INPUT_HANDOFF',
      outputs,
      logs: {
        ...logs,
        stdout: [...new Set([...stdout, 'BLOCKED_SECONDARY_INPUT_HANDOFF'])],
        stderr: [...new Set([
          ...(Array.isArray(logs.stderr) ? logs.stderr : []),
          'A secondary file was supplied but the converter reported it absent.',
        ])],
      },
    };
  }
  return {
    ...result,
    outputs,
    logs: { ...logs, stdout: [...new Set(stdout)] },
  };
}

async function runLiveFbxWorkflow(context = {}) {
  const prepared = withFbxUiZoneSelection(context);
  const result = await runFbxWithReviewUi(prepared, runLiveFbxToStagedJson);
  return appendLiveEvidence(result, prepared);
}

export function installFbxLiveRunnerAddon() {
  const converter = getConverterById('fbx_to_stagedjson');
  if (!converter) return false;
  if (converter[PATCH_MARKER] === VERSION) return false;
  converter.run = runLiveFbxWorkflow;
  Object.defineProperty(converter, PATCH_MARKER, {
    configurable: true,
    value: VERSION,
  });
  converter.liveRunnerVersion = VERSION;
  return true;
}

export const __FBX_LIVE_RUNNER_VERSION__ = VERSION;
