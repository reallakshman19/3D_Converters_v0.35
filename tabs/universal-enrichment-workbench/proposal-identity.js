import {
  canonicalComparisonJson, createComparisonIdentity, graphComparisonIdentity,
} from './comparison-identity.js';
import { sha256Hex } from './source-envelope.js';

function withoutIdentity(value, key) {
  const { [key]: omitted, ...evidence } = value;
  return evidence;
}

export function canonicalProposalValue(value) {
  return canonicalComparisonJson(value);
}

export async function createEnrichmentProposalId(reviewLedgerId, proposal, hashText = sha256Hex) {
  return createComparisonIdentity('enrichment-proposal', {
    reviewLedgerId, proposal: withoutIdentity(proposal, 'proposalId'),
  }, hashText);
}

export async function createEnrichmentExclusionId(reviewLedgerId, exclusion, hashText = sha256Hex) {
  return createComparisonIdentity('enrichment-exclusion', {
    reviewLedgerId, exclusion: withoutIdentity(exclusion, 'exclusionId'),
  }, hashText);
}

export async function createEnrichmentProposalGroupId(graph, group, distinctValues, hashText = sha256Hex) {
  return createComparisonIdentity('enrichment-proposal-group', {
    graph: graphComparisonIdentity(graph), group: withoutIdentity(group, 'proposalGroupId'), distinctValues,
  }, hashText);
}

export async function createEnrichmentProposalSetId(graph, proposalSet, hashText = sha256Hex) {
  return createComparisonIdentity('enrichment-proposal-set', {
    graph: graphComparisonIdentity(graph), ledgerId: proposalSet.ledgerId,
    bindingConfigId: proposalSet.bindingConfigId, comparisonRunId: proposalSet.comparisonRunId,
    reviewLedgerId: proposalSet.reviewLedgerId, attachmentSetIdentity: proposalSet.attachmentSetIdentity,
    proposals: proposalSet.proposals, exclusions: proposalSet.exclusions, groups: proposalSet.groups,
  }, hashText);
}
