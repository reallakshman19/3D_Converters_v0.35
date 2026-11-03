import { getConverterById } from '../../../converter-registry.js?v=20260617-basic-glb-3';
import {
  extractMappedEngineeringAttributeLedger,
  extractMappedStagedBranches,
} from './mapped-stage-output.js';

const PATCH_MARKER = Symbol.for('model-converters.fbx-zone-geometry-run.v2');

function bytesView(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(value || 0);
}

function primaryInput(context) {
  return context?.inputFiles?.find((file) => file.role === 'primary') || null;
}

function completedRunDetail(input, result) {
  const mapped = extractMappedStagedBranches(result);
  const engineering = extractMappedEngineeringAttributeLedger(result);
  return {
    phase: 'complete',
    sourceName: input?.name || 'model.fbx',
    sourceBytes: input?.bytes ? bytesView(input.bytes).slice() : null,
    conversionStatus: result?.conversionStatus || '',
    mappedStageStatus: mapped.status,
    mappedStageAuthority: mapped.authority,
    stagedBranches: mapped.stagedBranches,
    engineeringAttributeStatus: engineering.status,
    engineeringAttributeLedger: engineering.ledger,
  };
}

export function installMappedStageCapture(dispatchRun) {
  const converter = getConverterById('fbx_to_stagedjson');
  if (!converter || converter[PATCH_MARKER]) return false;
  const original = converter.run;
  converter.run = async function runWithMappedStageCapture(...args) {
    const input = primaryInput(args[0]);
    const sourceBytes = input?.bytes ? bytesView(input.bytes).slice() : null;
    dispatchRun({ phase: 'started', sourceName: input?.name || 'model.fbx', sourceBytes });
    try {
      const result = await original.apply(this, args);
      dispatchRun(completedRunDetail(input, result));
      return result;
    } catch (error) {
      dispatchRun({ phase: 'failed', sourceName: input?.name || 'model.fbx', sourceBytes: null });
      throw error;
    }
  };
  Object.defineProperty(converter, PATCH_MARKER, { value: true });
  return true;
}
