import { getConverterById } from './converter-registry.js?v=20260617-basic-glb-3';

const VERSION = '20260804-fbx-multifamily-release-1';
const OUTPUT_EVENT = 'model-converters:fbx-run-outputs';
const PATCH_MARKER = Symbol.for('model-converters.fbx-selected-zone-preview-bridge.v1');
const SELECTED_ZONE_PASS = 'STAGEDJSON_SELECTED_ZONE_PASS';

function selectedZoneOutput(outputs) {
  return outputs.find((output) => /\.selected-zone\.json$/i.test(String(output?.name || ''))
    && typeof output?.text === 'string');
}

function stagedAlias(output) {
  return {
    ...output,
    name: String(output.name).replace(/\.selected-zone\.json$/i, '.staged.json'),
  };
}

export function normalizeSelectedZonePreviewDetail(result) {
  if (result?.conversionStatus !== SELECTED_ZONE_PASS) return null;
  const outputs = Array.isArray(result.outputs) ? result.outputs : [];
  const selected = selectedZoneOutput(outputs);
  if (!selected) return null;
  try {
    const branches = JSON.parse(selected.text);
    if (!Array.isArray(branches)) return null;
  } catch {
    return null;
  }
  const alias = stagedAlias(selected);
  return {
    outputs: [alias, ...outputs],
    conversionStatus: 'STAGEDJSON_PASS',
    originalConversionStatus: SELECTED_ZONE_PASS,
    authority: result?.selectedZoneRelease?.authority || 'APPROVED_MAPPING_OUTPUT',
    releaseStatus: result?.selectedZoneRelease?.status || '',
  };
}

function publishPreviewCompatibleResult(result) {
  const detail = normalizeSelectedZonePreviewDetail(result);
  if (!detail || typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(OUTPUT_EVENT, { detail }));
}

export function installFbxSelectedZonePreviewBridge() {
  const converter = getConverterById('fbx_to_stagedjson');
  if (!converter || typeof converter.run !== 'function') return false;
  if (converter[PATCH_MARKER] === VERSION) return false;
  const original = converter.run;
  converter.run = async function runWithSelectedZonePreview(...args) {
    const result = await original.apply(this, args);
    publishPreviewCompatibleResult(result);
    return result;
  };
  Object.defineProperty(converter, PATCH_MARKER, {
    configurable: true,
    value: VERSION,
  });
  return true;
}

export const __FBX_SELECTED_ZONE_PREVIEW_BRIDGE_VERSION__ = VERSION;
