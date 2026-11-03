import {
  createStageWorkerMessage,
  createStageWorkerProgress,
} from '../contracts/RvmStageModelContract.js';
import { buildStageRenderPlan } from '../render/StageRenderPlan.js';
import { createSampleRvmStageModelV1 } from './sample-rvm-stage-model-v1.js';
import { createSampleStagePackageManifestV1 } from './sample-stage-package-manifest-v1.js';

export function createSampleWorkerAcceptanceOutputV1() {
  const stageModel = createSampleRvmStageModelV1();
  const manifest = createSampleStagePackageManifestV1();
  const renderPlan = buildStageRenderPlan(stageModel, 'full');
  return {
    source: {
      fileName: stageModel.source.fileName,
      fileSize: stageModel.source.fileSize,
      fileHash: stageModel.source.fileHash,
    },
    messages: createSampleMessages(stageModel, manifest),
    manifest,
    stageModel,
    diagnostics: stageModel.diagnostics,
    renderPlan,
  };
}

function createSampleMessages(stageModel, manifest) {
  return [
    createStageWorkerMessage('STAGE_WORKER_READY', { phase: 'idle' }),
    createStageWorkerMessage('STAGE_WORKER_START', { fileName: stageModel.source.fileName }),
    createStageWorkerProgress('hashing-source', { loaded: 1, total: 2, percent: 50, message: 'Hashing staged source bytes' }),
    createStageWorkerProgress('decoding-primitives', { loaded: 8, total: 8, percent: 100, message: 'Decoding native primitive records' }),
    createStageWorkerMessage('STAGE_WORKER_STAGE_READY', { schema: stageModel.schema, primitiveCount: stageModel.primitives.length }),
    createStageWorkerMessage('STAGE_WORKER_PACKAGE_READY', { schema: manifest.schema, artifactCount: manifest.artifacts.length }),
  ];
}
