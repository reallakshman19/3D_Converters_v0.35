/**
 * RvmCapabilities — probes the deployment environment and returns a capability set.
 *
 * static mode: no server reachable, only pre-converted bundles.
 * assisted mode: rvmparser helper is reachable; raw .rvm upload enabled.
 */

const STATIC_CAPS = Object.freeze({
  deploymentMode: 'static',
  rawRvmImport: false,
  preconvertedBundleImport: true,
  localConversion: false,
  helperReachable: false,
  helperVersion: null,
  xmlTagging: true,
  search: true,
  sectioning: true,
  savedViews: true,
});

/**
 * Detect runtime capabilities.
 *
 * @param {Function|null} helperProbe  Optional async function that returns
 *   { reachable: boolean, version?: string }.  Pass null for static-only mode.
 * @returns {Promise<object>}  Resolved capability object (never throws).
 */
export async function detectRvmCapabilities(helperProbe) {
  if (typeof helperProbe !== 'function') {
    return { ...STATIC_CAPS };
  }
  try {
    const probe = await helperProbe();
    if (!probe?.reachable) {
      return { ...STATIC_CAPS };
    }
    return {
      ...STATIC_CAPS,
      deploymentMode: 'assisted',
      rawRvmImport: true,
      localConversion: true,
      helperReachable: true,
      helperVersion: probe.version || null,
    };
  } catch {
    return { ...STATIC_CAPS };
  }
}

export { STATIC_CAPS };
