/**
 * UI runner for the CAESAR II neutral-file v11 <-> v14 adapter.
 * The engineering conversion stays in converters/scripts/cii_v11_v14.py.
 */
const WORKER_URL = new URL('../../../converters/cii-v11-v14-worker.js?v=20260816-cii-v11-v14-import-rca-1', import.meta.url);
let worker = null;
let sequence = 0;
const pending = new Map();

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(WORKER_URL, { type: 'module' });
  worker.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.type !== 'result') return;
    const entry = pending.get(message.jobId);
    if (!entry) return;
    pending.delete(message.jobId);
    if (message.ok) entry.resolve(message);
    else entry.reject(new Error(message.error || 'CAESAR v11/v14 conversion failed.'));
  });
  worker.addEventListener('error', (event) => {
    const error = new Error(event?.message || 'CAESAR v11/v14 worker failed.');
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

function runWorker(payload) {
  const active = ensureWorker();
  const jobId = `cii-v11-v14-${Date.now()}-${++sequence}`;
  return new Promise((resolve, reject) => {
    pending.set(jobId, { resolve, reject });
    active.postMessage({ type: 'run', jobId, ...payload });
  });
}

function stem(name) {
  const clean = String(name || 'model').replace(/[\\/:*?"<>|]/g, '_');
  return clean.replace(/\.[^.]+$/, '') || 'model';
}

function normalizedTarget(value) {
  const text = String(value ?? 'auto').trim().toLowerCase();
  return text === '11' || text === '14' ? text : 'auto';
}

export async function run(context) {
  const primary = context?.inputFiles?.find((file) => file.role === 'primary')
    || context?.inputFiles?.[0];
  if (!primary?.bytes) throw new Error('CII v11/v14 input file is required.');

  const targetVersion = normalizedTarget(context?.options?.targetVersion);
  context?.setStatus?.('Converting and validating CAESAR neutral-file version...', 'running');
  const response = await runWorker({
    inputName: primary.name,
    inputBytes: primary.bytes,
    targetVersion,
    allowLossy: context?.options?.allowLossy === true,
  });

  const audit = response.audit || JSON.parse(response.auditText || '{}');
  const resolvedTarget = String(audit.target_version || targetVersion || '').replace(/\D/g, '');
  if (resolvedTarget !== '11' && resolvedTarget !== '14') {
    throw new Error('Converter completed without a valid target-version audit value.');
  }
  const outputName = `${stem(primary.name)}_v${resolvedTarget}.cii`;
  const auditName = `${stem(primary.name)}_v${resolvedTarget}.audit.json`;
  const outputText = new TextDecoder('utf-8').decode(new Uint8Array(response.outputBytes));
  const lossCount = Array.isArray(audit.loss_events) ? audit.loss_events.length : 0;

  context?.logger?.log?.(
    `CAESAR CII v${audit.source_version} -> v${audit.target_version}; `
    + `${audit.source_bytes} -> ${audit.target_bytes} bytes; `
    + `loss events=${lossCount}; target structure validation=PASS.`,
  );
  if (lossCount) {
    context?.setStatus?.(
      `Converted CII v${audit.source_version} -> v${audit.target_version} with ${lossCount} explicitly allowed v14-only loss event(s).`,
      'warning',
    );
  } else {
    context?.setStatus?.(
      `Converted and structurally validated CII v${audit.source_version} -> v${audit.target_version}.`,
      'ok',
    );
  }

  return {
    ok: true,
    outputs: [
      { name: outputName, text: outputText, mime: 'text/plain;charset=utf-8' },
      { name: auditName, text: response.auditText, mime: 'application/json;charset=utf-8' },
    ],
    logs: {
      stdout: response.stdout || [],
      stderr: response.stderr || [],
      argv: response.argv || [],
      audit,
    },
  };
}
