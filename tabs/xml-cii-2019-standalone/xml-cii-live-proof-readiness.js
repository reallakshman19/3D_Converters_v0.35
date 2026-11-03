export const XML_CII_LIVE_PROOF_SCHEMA = 'xml-cii-2019-standalone-live-proof/v1';

export function hasLiveProofEvidence(input = {}) {
  return Boolean(
    input.appTabRegistered
    && input.modelConvertersTabRegistered
    && input.xmlCaseOk
    && input.inputXmlCaseOk
    && input.outputPanelWired
    && input.forbiddenTokensAbsent
    && input.productionSwitchAbsent,
  );
}

export function selectSwitchReadinessStatus(input = {}) {
  if (!hasLiveProofEvidence(input)) return 'blocked';
  if (input.liveBrowserExecuted === true && input.pyodideExecuted === true) return 'ready-for-controlled-switch-proposal';
  return 'needs-more-proof';
}

export function createXmlCiiLiveProofDecision(input = {}) {
  const status = selectSwitchReadinessStatus(input);
  const blockers = createBlockers(input);
  return {
    schema: XML_CII_LIVE_PROOF_SCHEMA,
    ok: status !== 'blocked',
    status,
    checkedAt: new Date().toISOString(),
    evidence: {
      appTabRegistered: Boolean(input.appTabRegistered),
      modelConvertersTabRegistered: Boolean(input.modelConvertersTabRegistered),
      xmlCaseOk: Boolean(input.xmlCaseOk),
      inputXmlCaseOk: Boolean(input.inputXmlCaseOk),
      outputPanelWired: Boolean(input.outputPanelWired),
      forbiddenTokensAbsent: Boolean(input.forbiddenTokensAbsent),
      productionSwitchAbsent: Boolean(input.productionSwitchAbsent),
      liveBrowserExecuted: Boolean(input.liveBrowserExecuted),
      pyodideExecuted: Boolean(input.pyodideExecuted),
    },
    limitations: createLimitations(input),
    nextAction: nextActionForStatus(status),
    blockers,
  };
}

function createBlockers(input = {}) {
  const checks = [
    ['appTabRegistered', 'Standalone app-level tab is not registered.'],
    ['modelConvertersTabRegistered', 'Existing Model Converters tab registration is missing.'],
    ['xmlCaseOk', 'PSI116 XML standalone case did not produce enrichedXML evidence.'],
    ['inputXmlCaseOk', 'InputXML standalone case did not produce enrichedInputXML evidence.'],
    ['outputPanelWired', 'Output/log/diagnostics panel wiring evidence is missing.'],
    ['forbiddenTokensAbsent', 'Forbidden old popup handoff token was detected.'],
    ['productionSwitchAbsent', 'Production switch absence was not proven.'],
  ];
  return checks.filter(([key]) => !input[key]).map(([, message]) => message);
}

function createLimitations(input = {}) {
  const limitations = [];
  if (input.liveBrowserExecuted !== true) limitations.push('Manual live browser execution is still required.');
  if (input.pyodideExecuted !== true) limitations.push('Real browser/Pyodide compatibility execution is still required.');
  if (input.liveOldRouteParityExecuted !== true) limitations.push('Live old-route parity remains outside this proof.');
  return limitations;
}

function nextActionForStatus(status) {
  if (status === 'ready-for-controlled-switch-proposal') return 'Prepare a separate controlled production switch proposal.';
  if (status === 'needs-more-proof') return 'Complete the manual live browser/Pyodide checklist before any switch proposal.';
  return 'Resolve blockers and rerun the standalone live smoke proof.';
}
