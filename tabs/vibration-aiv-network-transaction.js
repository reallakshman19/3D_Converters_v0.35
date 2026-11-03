import { currentAivInputRevision } from './vibration-aiv-engineering-revision.js';

export function nextAivFlareNetworkEngineeringRevision(state) {
  return `AIV-UI-${currentAivInputRevision(state) + 1}`;
}

export function prepareAivFlareNetworkEngineeringCommit(state, network, options = {}) {
  if (!network || typeof network !== 'object') {
    throw new TypeError('AIV flare-network engineering commit requires a network.');
  }
  if (options.preserveRevision === true) return network;
  return Object.freeze({
    ...network,
    revision: nextAivFlareNetworkEngineeringRevision(state),
  });
}
