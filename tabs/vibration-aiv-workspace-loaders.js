import { AIV_DEFAULT_ASSUMPTION_PROFILE } from '../converters/vibration/aiv/aiv-assumption-profile.js';
import { createAivSmallFlareMockNetwork } from './vibration-aiv-mock-flare-network.js';

export function applyAivFlareNetworkPresentationState(state, network) {
  state.flareNetwork = network;
  state.error = null;
  return state;
}

export function loadAivSmallFlareMock(state, applyNetwork) {
  state.assumptionProfile = AIV_DEFAULT_ASSUMPTION_PROFILE;
  state.assumptionProfileModified = false;
  applyNetwork(createAivSmallFlareMockNetwork(), { preserveRevision: true });
}
