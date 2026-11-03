/**
 * RvmPcfTopologyModes.js
 *
 * Extract PCF topology mode constants.
 *
 * LEGACY:
 * - Existing topology/readiness logic.
 *
 * UXML_TOPOLOGY:
 * - Existing RVM/JSON extracted rows are converted to UXML for topology only.
 * - UXML topology evidence is pushed back into legacy state.
 * - Existing masters and PCF emitter continue unchanged.
 */

export const RVM_PCF_TOPOLOGY_MODES = Object.freeze({
  LEGACY: 'LEGACY',
  UXML_TOPOLOGY: 'UXML_TOPOLOGY',
});

export const DEFAULT_RVM_PCF_TOPOLOGY_MODE = (() => {
  try {
    const stored = localStorage.getItem('rvm_pcf_topology_mode');
    if (stored === RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY) return RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY;
    if (stored === RVM_PCF_TOPOLOGY_MODES.LEGACY) return RVM_PCF_TOPOLOGY_MODES.LEGACY;
  } catch {}
  return RVM_PCF_TOPOLOGY_MODES.LEGACY;
})();

export function normalizeRvmPcfTopologyMode(value) {
  const mode = String(value ?? '').trim().toUpperCase();

  if (mode === RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY) {
    return RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY;
  }

  return RVM_PCF_TOPOLOGY_MODES.LEGACY;
}

export function isUxmlTopologyMode(value) {
  return normalizeRvmPcfTopologyMode(value) === RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY;
}

export function topologyModeLabel(value) {
  const mode = normalizeRvmPcfTopologyMode(value);

  if (mode === RVM_PCF_TOPOLOGY_MODES.UXML_TOPOLOGY) {
    return 'UXML topology';
  }

  return 'Legacy topology';
}