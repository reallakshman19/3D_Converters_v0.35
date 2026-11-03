import { createAivFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network.js';
import { generateAivInputTablesFromFlareNetwork } from '../converters/vibration/aiv/aiv-flare-network-table-generator.js';
import { buildAivFlareNetworkTopologyExchange } from '../converters/vibration/aiv/aiv-flare-network-topology.js';

export function createEmptyAivFlareNetworkWorkspace() {
  return createAivFlareNetwork({
    networkId: 'AIV-FLARE-NETWORK', revision: '1', source: 'AIV_FLARE_NETWORK_UI', sourceRevision: '1',
    nodes: [], segments: [],
  });
}

export function projectAivFlareNetworkIntoWorkspace(network) {
  const generatedInputSet = generateAivInputTablesFromFlareNetwork(network);
  const exchange = buildAivFlareNetworkTopologyExchange(network);
  return Object.freeze({
    flareNetwork: network,
    generatedInputSet,
    tables: generatedInputSet.tables,
    topology: exchange,
    topologyInput: Object.freeze({
      format: 'FLARE_NETWORK',
      data: exchange,
      sourceFileName: exchange.sourceFileName,
    }),
    files: Object.freeze({
      topology: Object.freeze({ name: exchange.sourceFileName, kind: 'AivFlareNetworkTopologyExchange.v1' }),
      sources: null,
      assessments: null,
      relationships: null,
    }),
  });
}
