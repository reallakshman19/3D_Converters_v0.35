import { createComparisonIdentity, graphComparisonIdentity } from './comparison-identity.js';
import { sha256Hex } from './source-envelope.js';

function decisionEvidence(decision) {
  const { reviewDecisionId, ...evidence } = decision;
  return evidence;
}

export async function createComparisonReviewDecisionId(
  comparisonRunId, decision, hashText = sha256Hex,
) {
  return createComparisonIdentity('comparison-review-decision', {
    comparisonRunId, decision: decisionEvidence(decision),
  }, hashText);
}

export async function createComparisonReviewLedgerId(
  graph, ledgerId, bindingConfigId, comparisonRunId,
  attachmentSetIdentity, decisions, hashText = sha256Hex,
) {
  return createComparisonIdentity('comparison-review-ledger', {
    graph: graphComparisonIdentity(graph), ledgerId, bindingConfigId,
    comparisonRunId, attachmentSetIdentity, decisions,
  }, hashText);
}
