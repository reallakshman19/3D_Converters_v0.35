import { AIV_DEFAULT_ASSUMPTION_PROFILE } from '../converters/vibration/aiv/aiv-assumption-profile.js';
import { parseAivInputCsv } from './vibration-aiv-input-model.js';
import { buildLoadedAivD23Benchmark } from './vibration-aiv-benchmarks.js';
import { importAivEitFileIntoState } from './vibration-aiv-eit-import-controller.js';
import { projectAivFlareNetworkIntoWorkspace } from './vibration-aiv-flare-network-state.js';
import {
  activateAivNetworkDrivenMode,
  markAivTableDrivenInputChanged,
} from './vibration-aiv-mode-transition.js';
import { prepareAivFlareNetworkEngineeringCommit } from './vibration-aiv-network-transaction.js';

function formatError(error) {
  return `${error?.code ? `${error.code}: ` : ''}${String(error?.message || error)}`;
}

export function createAivDatasetLoader({
  state,
  render,
  clearReadiness,
  clearMasterResolution,
  onDatasetLoaded = null,
}) {
  function markBenchmarkModified() {
    if (!state.benchmark.loaded || state.benchmark.loaded.modified) return;
    state.benchmark.loaded = Object.freeze({ ...state.benchmark.loaded, modified: true });
  }

  function notifyLoaded() {
    if (typeof onDatasetLoaded === 'function') onDatasetLoaded();
  }

  function applyFlareNetwork(network, options = {}) {
    try {
      const committedNetwork = prepareAivFlareNetworkEngineeringCommit(state, network, options);
      const projected = projectAivFlareNetworkIntoWorkspace(committedNetwork);
      clearMasterResolution();
      state.flareNetwork = projected.flareNetwork;
      state.generatedInputSet = projected.generatedInputSet;
      state.tables = projected.tables;
      state.topology = projected.topology;
      state.topologyInput = projected.topologyInput;
      state.files = { eit: null, ...projected.files };
      state.eitImport = null;
      state.benchmark.loaded = null;
      activateAivNetworkDrivenMode(state, projected.flareNetwork.revision);
      clearReadiness();
      state.error = null;
      notifyLoaded();
    } catch (error) {
      state.error = formatError(error);
    }
    render();
  }

  function loadBenchmark() {
    try {
      const loaded = buildLoadedAivD23Benchmark();
      clearMasterResolution();
      state.eitImport = null;
      state.benchmark.loaded = loaded.benchmark;
      state.tables = { ...loaded.tables };
      state.files = { eit: null, ...loaded.files };
      state.assumptionProfile = AIV_DEFAULT_ASSUMPTION_PROFILE;
      state.assumptionProfileModified = false;
      state.topology = loaded.topology;
      state.topologyInput = {
        format: 'PARSED_EXCHANGE', data: loaded.topology,
        sourceFileName: loaded.topology.sourceFileName,
      };
      markAivTableDrivenInputChanged(state);
      clearReadiness();
      state.error = null;
      notifyLoaded();
    } catch (error) {
      state.error = formatError(error);
    }
    render();
  }

  async function loadFile(target, file) {
    clearReadiness();
    clearMasterResolution();
    state.error = null;
    try {
      if (target === 'eit') await importAivEitFileIntoState(state, file, clearReadiness);
      else if (target === 'topology') {
        state.eitImport = null;
        state.files.eit = null;
        state.files.topology = { name: file.name, kind: 'Complete five-sheet XLSX' };
        state.topology = null;
        state.topologyInput = {
          format: 'XLSX', data: await file.arrayBuffer(), sourceFileName: file.name,
        };
      } else {
        state.eitImport = null;
        state.files.eit = null;
        const text = await file.text();
        state.tables[target] = parseAivInputCsv(target, text, { sourceName: file.name, sourceKind: 'CSV' });
        state.files[target] = { name: file.name, kind: state.tables[target].contract };
      }
      markAivTableDrivenInputChanged(state);
      markBenchmarkModified();
      notifyLoaded();
    } catch (error) {
      state.error = formatError(error);
    }
    render();
  }

  return Object.freeze({ applyFlareNetwork, loadBenchmark, loadFile, markBenchmarkModified });
}
