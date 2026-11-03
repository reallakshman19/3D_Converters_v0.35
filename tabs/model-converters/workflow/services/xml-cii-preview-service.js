/**
 * Service boundary for XML->CII preview, diagnostics, weight match, and support
 * mapping actions.
 * Inputs: a bridge provider and optional cache invalidator.
 * Outputs: phase action methods used directly by popup UI.
 * Fallback: unavailable bridge methods resolve to empty row arrays.
 */

export function createXmlCiiPreviewService(getBridge, invalidateSnapshot) {
  const bridge = () => getBridge?.() || null;
  const invalidate = () => invalidateSnapshot?.();

  return {
    async buildPreviewRows() {
      const rows = await bridge()?.buildPopupPreviewRows?.();
      return Array.isArray(rows) ? rows : [];
    },
    async runDiagnostics() {
      const rows = await bridge()?.runPopupDiagnostics?.();
      return Array.isArray(rows) ? rows : [];
    },
    async computeWeightRows() {
      const rows = await bridge()?.computePopupWeightRows?.();
      return Array.isArray(rows) ? rows : [];
    },
    applyPreferredWeights(rows) {
      const result = bridge()?.applyPopupPreferredWeights?.(Array.isArray(rows) ? rows : []) || null;
      invalidate();
      return result;
    },
    renderSupportTable(host) {
      return bridge()?.renderPopupSupportTable?.(host) || null;
    },
  };
}

