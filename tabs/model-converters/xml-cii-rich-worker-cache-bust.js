/**
 * Functionality: redirects stale model-converter worker URLs to the current local Pyodide worker cache key.
 * Parameters: Worker constructor specifiers are inspected when the browser creates a converter worker.
 * Outputs: an equivalent Worker using the current py-worker.js query token.
 * Fallback: none; only known stale worker tokens are rewritten.
 */
const FLAG = '__xmlCiiRichWorkerCacheBust_v1';
const STALE_WORKER_TOKEN = 'py-worker.js?v=20260515-cii-compat-check2';
const FRESH_WORKER_TOKEN = 'py-worker.js?v=20260729-inputxml-live-release-1';

function canPatchWorker() {
  return typeof window !== 'undefined' && typeof window.Worker === 'function';
}

function rewriteWorkerSpecifier(specifier) {
  const raw = String(specifier || '');
  if (!raw.includes(STALE_WORKER_TOKEN)) return specifier;
  const rewritten = raw.replace(STALE_WORKER_TOKEN, FRESH_WORKER_TOKEN);
  return specifier instanceof URL ? new URL(rewritten) : rewritten;
}

export function installXmlCiiRichWorkerCacheBust() {
  if (!canPatchWorker()) return;
  const current = window[FLAG];
  if (current?.installed) return;

  const NativeWorker = window.Worker;
  function XmlCiiWorker(specifier, options) {
    return new NativeWorker(rewriteWorkerSpecifier(specifier), options);
  }

  Object.setPrototypeOf(XmlCiiWorker, NativeWorker);
  XmlCiiWorker.prototype = NativeWorker.prototype;
  window.Worker = XmlCiiWorker;
  window[FLAG] = {
    installed: true,
    staleToken: STALE_WORKER_TOKEN,
    freshToken: FRESH_WORKER_TOKEN,
  };
}

installXmlCiiRichWorkerCacheBust();
