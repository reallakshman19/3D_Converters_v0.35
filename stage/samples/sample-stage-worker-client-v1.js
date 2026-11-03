import { createStageWorkerRuntime } from '../worker/StageWorkerRuntime.js';
import { createStageJsonWorkerJob } from '../worker/StageWorkerJob.js';
import { createSampleRvmStageModelV1 } from './sample-rvm-stage-model-v1.js';

export function createSampleStageWorkerClientRuntime() {
  return createStageWorkerRuntime();
}

export function createSampleStageWorkerClientJobV1() {
  const model = createSampleRvmStageModelV1();
  const text = JSON.stringify(model);
  return createStageJsonWorkerJob({
    jobId: 'job-sample-stage-client-v1',
    fileName: 'sample-rvm-stage-model-v1.json',
    fileSize: text.length,
    fileHash: model.source.fileHash,
    text,
  });
}
