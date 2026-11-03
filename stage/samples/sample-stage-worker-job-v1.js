import {
  createRvmBinaryWorkerJob,
  createStageJsonWorkerJob,
} from '../worker/StageWorkerJob.js';
import { createSampleRvmStageModelV1 } from './sample-rvm-stage-model-v1.js';

export function createSampleStageJsonWorkerJobV1() {
  const model = createSampleRvmStageModelV1();
  const text = JSON.stringify(model);
  return createStageJsonWorkerJob({
    jobId: 'job-000001',
    fileName: 'sample-rvm-stage-model-v1.json',
    fileSize: text.length,
    fileHash: model.source.fileHash,
    text,
  });
}

export function createSampleRvmBinaryWorkerJobV1() {
  const arrayBuffer = new ArrayBuffer(8);
  return createRvmBinaryWorkerJob({
    jobId: 'job-000002',
    fileName: 'sample-unparsed.rvm',
    fileSize: arrayBuffer.byteLength,
    fileHash: 'sha256-sample-unparsed-rvm',
    arrayBuffer,
  });
}
