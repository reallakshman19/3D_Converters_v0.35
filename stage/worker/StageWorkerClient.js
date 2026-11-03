import { runStageWorkerJob } from './StageWorkerRuntime.js';
import { validateStageWorkerJob } from './StageWorkerJob.js';

export function createStageWorkerClient(options = {}) {
  return {
    workerUrl: options.workerUrl || './stage-worker.js',
    workerFactory: typeof options.workerFactory === 'function' ? options.workerFactory : null,
    onMessage: typeof options.onMessage === 'function' ? options.onMessage : null,
    runtime: options.runtime || null,
    runJob: options.runJob || runStageWorkerJob,
    timeoutMs: Number(options.timeoutMs) || 0,
    worker: null,
    messages: [],
    disposed: false,
  };
}

export async function runStageWorkerClientJob(client, job) {
  if (!client || typeof client !== 'object') return failure('Stage worker client is required.', 'STAGE_WORKER_CLIENT_INVALID', {});
  if (client.disposed) return failure('Stage worker client is disposed.', 'STAGE_WORKER_CLIENT_DISPOSED', {});
  const jobResult = validateStageWorkerJob(job);
  if (!jobResult.valid) return failure('Stage worker job is invalid.', 'STAGE_WORKER_JOB_INVALID', { validationErrors: jobResult.errors }, []);
  client.messages = [];
  return client.runtime ? runDirectRuntimeJob(client, job) : runBrowserWorkerJob(client, job);
}

export function disposeStageWorkerClient(client) {
  if (!client || client.disposed) return;
  client.disposed = true;
  client.worker?.terminate?.();
  client.worker = null;
}

function runDirectRuntimeJob(client, job) {
  const runtime = wrapRuntime(client);
  const work = client.runJob(runtime, job);
  return withTimeout(work, client.timeoutMs, () => timeoutFailure(client.messages));
}

function runBrowserWorkerJob(client, job) {
  return new Promise((resolve) => {
    const worker = createBrowserWorker(client);
    client.worker = worker;
    const done = once(resolve, () => clearClientWorker(client, worker));
    const timer = createTimer(client.timeoutMs, () => done(timeoutFailure(client.messages)));
    wireWorker(worker, client, done, timer);
    worker.postMessage(job);
  });
}

function createBrowserWorker(client) {
  if (client.workerFactory) return client.workerFactory(client.workerUrl, { type: 'module' });
  const WorkerCtor = globalThis.Worker;
  if (typeof WorkerCtor !== 'function') throw new Error('Module Worker is not available in this environment');
  return new WorkerCtor(client.workerUrl, { type: 'module' });
}

function wireWorker(worker, client, done, timer) {
  worker.onmessage = (event) => {
    const data = event.data || {};
    if (data.kind === 'stage-worker-message') recordMessage(client, data.message);
    if (data.kind === 'stage-worker-result') {
      clearTimeout(timer);
      done(attachMessages(data.result, client.messages));
    }
  };
  worker.onerror = (event) => {
    clearTimeout(timer);
    done(failure(event.message || 'Stage worker client failed.', 'STAGE_WORKER_CLIENT_ERROR', {}, client.messages));
  };
}

function wrapRuntime(client) {
  const original = client.runtime?.onMessage;
  return {
    ...client.runtime,
    onMessage(message) {
      recordMessage(client, message);
      original?.(message);
    },
  };
}

function recordMessage(client, message) {
  client.messages.push(message);
  client.onMessage?.(message);
}

function withTimeout(work, timeoutMs, onTimeout) {
  if (!timeoutMs || timeoutMs <= 0) return work;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(onTimeout()), timeoutMs);
    Promise.resolve(work).then(finish, (error) => finish(failure(error.message || String(error), 'STAGE_WORKER_CLIENT_ERROR', {})));
  });
}

function createTimer(timeoutMs, onTimeout) {
  return timeoutMs > 0 ? setTimeout(onTimeout, timeoutMs) : null;
}

function once(resolve, cleanup) {
  let settled = false;
  return (value) => {
    if (settled) return;
    settled = true;
    cleanup?.();
    resolve(value);
  };
}

function clearClientWorker(client, worker) {
  if (client.worker === worker) client.worker = null;
  worker?.terminate?.();
}

function attachMessages(result, messages) {
  if (Array.isArray(result?.messages)) return result;
  return { ...result, messages };
}

function timeoutFailure(messages) {
  return failure('Stage worker client timed out.', 'STAGE_WORKER_CLIENT_TIMEOUT', {}, messages);
}

function failure(message, code, context = {}, messages = []) {
  return {
    ok: false,
    error: { message, code, context },
    messages,
    validationErrors: context.validationErrors || [],
  };
}
