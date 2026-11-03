import { RuntimeEvents } from '../contracts/runtime-events.js';
import { on } from '../core/event-bus.js';
import { state } from '../core/state.js';
import { loadRvmSource } from './RvmLoadPipeline.js';
import { RvmStaticBundleLoader } from './RvmStaticBundleLoader.js';
import { RvmHelperBridge } from '../converters/rvm-helper-bridge.js';
import { RvmGitHubActionsBridge } from '../converters/rvm-github-bridge.js';
import { convertRevFileToAvevaHierarchy } from './RevLocalLoader.js?v=20260508-preview-geometry';

const INSTALL_KEY = Symbol.for('pcf-glb.rvm-file-loaded-bridge.v1');

function createStaticCtx(overrides = {}) {
  return {
    capabilities: state.rvm?.capabilities || {},
    staticBundleLoader: new RvmStaticBundleLoader(),
    assistedBridge: null,
    ...overrides,
  };
}

async function resolveAssistedBridge() {
  let caps = state.rvm?.capabilities;
  if (!caps || !caps.rawRvmImport) {
    caps = { rawRvmImport: true, deploymentMode: 'assisted' };
  }

  const localBridge = new RvmHelperBridge();
  const localProbe = await localBridge.probe();
  if (localProbe?.reachable) {
    console.log('[RVM] Using Local test_server RvmHelperBridge');
    return { caps, bridge: localBridge };
  }

  const ghBridge = new RvmGitHubActionsBridge();
  const ghProbe = await ghBridge.probe();
  if (ghProbe?.reachable) {
    console.log('[RVM] Using serverless RvmGitHubActionsBridge');
    return { caps, bridge: ghBridge };
  }

  const pat = window.prompt?.('No local conversion server found. Enter a GitHub Personal Access Token (PAT) to enable remote serverless conversion via GitHub Actions:');
  if (pat) {
    ghBridge.setPat(pat);
    console.log('[RVM] Configured serverless RvmGitHubActionsBridge with new PAT');
    return { caps, bridge: ghBridge };
  }

  throw new Error('No available RVM conversion backends. Start the local server or provide a GitHub PAT.');
}

async function handleRvmFileLoaded(payload) {
  if (!payload || payload.source !== 'rvm-tab') return;

  const kind = String(payload.kind || 'raw-rvm');
  const staticCtx = createStaticCtx();

  if (kind === 'bundle') {
    await loadRvmSource({ kind: 'bundle', bundle: payload.payload }, staticCtx);
    return;
  }

  if (kind === 'aveva-json') {
    await loadRvmSource({ kind: 'aveva-json', data: payload.payload }, staticCtx);
    return;
  }

  if (kind === 'raw-rev') {
    const hierarchy = await convertRevFileToAvevaHierarchy(payload.payload);
    await loadRvmSource({ kind: 'aveva-json', data: hierarchy }, staticCtx);
    return;
  }

  const { caps, bridge } = await resolveAssistedBridge();
  await loadRvmSource(
    { kind: 'raw-rvm', file: payload.payload, sidecars: payload.sidecars },
    createStaticCtx({ capabilities: caps, assistedBridge: bridge })
  );
}

export function installRvmFileLoadedBridge() {
  if (globalThis[INSTALL_KEY]) return;
  globalThis[INSTALL_KEY] = true;

  on(RuntimeEvents.FILE_LOADED, async (payload) => {
    try {
      await handleRvmFileLoaded(payload);
    } catch (err) {
      console.error('RVM Load Pipeline failed:', err);
      window.alert?.(err?.message || String(err));
    }
  });
}

installRvmFileLoadedBridge();
