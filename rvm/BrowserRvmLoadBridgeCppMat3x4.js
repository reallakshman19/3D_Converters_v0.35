import {
  loadRvmFileInBrowser as baseLoadRvmFileInBrowser,
  publishBrowserRvmLoadDiagnostics
} from './BrowserRvmLoadBridge.js?v=20260620-rvm-flat-tree-1';

export { publishBrowserRvmLoadDiagnostics };

const CPP_MAT3X4_WORKER_SPECIFIER = './browser-rvm-worker.js?v=20260620-rvm-cpp-mat3x4-1';

export async function loadRvmFileInBrowser(file, viewer, options = {}) {
  const OriginalWorker = globalThis.Worker;
  const canPatch = typeof OriginalWorker === 'function' && typeof URL === 'function';
  if (!canPatch) return baseLoadRvmFileInBrowser(file, viewer, options);

  function BrowserRvmCppMat3x4Worker(url, workerOptions) {
    let nextUrl = url;
    try {
      const text = String(url || '');
      if (/browser-rvm-worker\.js/i.test(text)) {
        nextUrl = new URL(CPP_MAT3X4_WORKER_SPECIFIER, import.meta.url);
      }
    } catch (_) {
      nextUrl = url;
    }
    return new OriginalWorker(nextUrl, workerOptions);
  }

  BrowserRvmCppMat3x4Worker.prototype = OriginalWorker.prototype;

  try {
    globalThis.Worker = BrowserRvmCppMat3x4Worker;
    return await baseLoadRvmFileInBrowser(file, viewer, {
      ...options,
      parserVersion: '20260620-rvm-cpp-mat3x4-1'
    });
  } finally {
    globalThis.Worker = OriginalWorker;
  }
}
