import {
  RVM_STAGE_CONTRACT_VERSION,
  RVM_STAGE_SCHEMA,
} from './StageConstants.js';
import { createEmptyStageDiagnostics } from './StageDiagnostics.js';

export function createEmptyRvmStageModel(source = {}) {
  return {
    schema: RVM_STAGE_SCHEMA,
    generator: {
      name: '3D_Viewer browser stage worker',
      version: RVM_STAGE_CONTRACT_VERSION,
    },
    source: {
      fileName: source.fileName || '',
      fileSize: Number(source.fileSize) || 0,
      fileHash: source.fileHash || '',
      units: source.units || 'm',
      coordinateBasis: source.coordinateBasis || 'rvm-native',
    },
    hierarchy: {
      rootId: 'node-root',
      nodes: [],
    },
    materials: [],
    components: [],
    primitives: [],
    geometryChunks: [],
    diagnostics: createEmptyStageDiagnostics(),
  };
}
