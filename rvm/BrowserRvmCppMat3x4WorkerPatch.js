const PATCH_FLAG = Symbol.for('pcf-glb-rvm-cpp-mat3x4-worker-url-patch-v4-facetgroup');
const CPP_MAT3X4_WORKER_SPECIFIER = './browser-rvm-worker.js?v=20260620-rvm-facetgroup-1';

export function installBrowserRvmCppMat3x4WorkerPatch() {
  if (globalThis[PATCH_FLAG]) return;
  const OriginalWorker = globalThis.Worker;
  if (typeof OriginalWorker !== 'function' || typeof URL !== 'function') return;

  function BrowserRvmCppMat3x4Worker(url, options) {
    let nextUrl = url;
    try {
      const text = String(url || '');
      if (/browser-rvm-worker\.js/i.test(text)) {
        nextUrl = new URL(CPP_MAT3X4_WORKER_SPECIFIER, import.meta.url);
      }
    } catch (_) {
      nextUrl = url;
    }
    return new OriginalWorker(nextUrl, options);
  }

  BrowserRvmCppMat3x4Worker.prototype = OriginalWorker.prototype;
  Object.defineProperty(BrowserRvmCppMat3x4Worker, 'name', { value: 'BrowserRvmCppMat3x4Worker' });
  globalThis.Worker = BrowserRvmCppMat3x4Worker;
  globalThis[PATCH_FLAG] = {
    installed: true,
    workerSpecifier: CPP_MAT3X4_WORKER_SPECIFIER,
    installedAt: new Date().toISOString()
  };
}
