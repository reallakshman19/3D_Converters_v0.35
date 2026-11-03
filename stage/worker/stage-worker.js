import {
  createStageWorkerRuntime,
  runStageWorkerJob,
} from './StageWorkerRuntime.js';

const runtime = createStageWorkerRuntime({
  onMessage(message) {
    self.postMessage({ kind: 'stage-worker-message', message });
  },
});

self.onmessage = async (event) => {
  const result = await runStageWorkerJob(runtime, event.data);
  self.postMessage({ kind: 'stage-worker-result', result });
};
