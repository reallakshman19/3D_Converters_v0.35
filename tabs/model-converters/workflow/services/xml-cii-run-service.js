import { xmlCiiWorkflowRequestFinalRun } from '../../xml-cii-workflow-runner.js?v=20260624-workflow1-workflow2-1';

/**
 * Service boundary for XML->CII final-run handoff.
 * Inputs: workflow root, mode, and optional bridge close callback.
 * Outputs: final run request using the existing behavior-preserving runner.
 * Fallback: the runner keeps the current hidden-button handoff until a later
 * direct runXmlCiiConversion extraction replaces it.
 */

export function createXmlCiiRunService(getBridge) {
  const bridge = () => getBridge?.() || null;

  return {
    closePopup() {
      return bridge()?.closePopup?.() || null;
    },
    setRunOption(key, value, type) {
      return bridge()?.setPopupRunOption?.(key, value, type) || null;
    },
    requestFinalRun(root, mode) {
      bridge()?.closePopup?.();
      return xmlCiiWorkflowRequestFinalRun(root, mode);
    },
  };
}
