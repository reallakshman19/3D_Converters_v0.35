import { canonicalComparisonJson, graphComparisonIdentity } from './comparison-identity.js';
import { deepFreezeArtifact, findJsonSafetyErrors } from './extraction-rule.js';
import { sha256Hex } from './source-envelope.js';
import { validateEnrichmentProposalAuthority } from './proposal-authority.js';
import {
  canonicalProposalValue, createEnrichmentExclusionId, createEnrichmentProposalGroupId,
  createEnrichmentProposalId, createEnrichmentProposalSetId,
} from './proposal-identity.js';

export const ENRICHMENT_PROPOSAL_LIMITS = Object.freeze({
  reviewDecisions: 50000, proposals: 50000, exclusions: 50000, groups: 50000,
  proposalsPerGroup: 10000, csvRows: 50000,
});

export const ENRICHMENT_EXCLUSION_REASONS = Object.freeze({
  unreviewed: 'Review decision remains unreviewed.',
  'reject-result': 'Review decision explicitly rejected the comparison result.',
  defer: 'Review decision was deferred.',
});

export class EnrichmentProposalBuildError extends Error {
  constructor(code, message) { super(message); this.name = 'EnrichmentProposalBuildError'; this.code = code; }
}

function fail(code, message) { throw new EnrichmentProposalBuildError(code, message); }
function list(value) { return Array.isArray(value) ? value : []; }

function enforceDecisionLimit(reviewLedger) {
  const decisions = list(reviewLedger?.decisions); const groups = new Map();
  if (decisions.length > ENRICHMENT_PROPOSAL_LIMITS.reviewDecisions) {
    fail('REVIEW_DECISION_LIMIT', `Review-decision limit ${ENRICHMENT_PROPOSAL_LIMITS.reviewDecisions} exceeded.`);
  }
  const proposalCount = decisions.filter((item) => item.disposition === 'confirm-match').length;
  if (proposalCount > ENRICHMENT_PROPOSAL_LIMITS.proposals) fail('PROPOSAL_LIMIT', 'Proposal limit exceeded.');
  if (decisions.length - proposalCount > ENRICHMENT_PROPOSAL_LIMITS.exclusions) fail('EXCLUSION_LIMIT', 'Exclusion limit exceeded.');
  for (const decision of decisions.filter((item) => item.disposition === 'confirm-match')) {
    const key = `${decision.entityId}\u0000${decision.fieldKey}`; const count = (groups.get(key) || 0) + 1;
    if (count > ENRICHMENT_PROPOSAL_LIMITS.proposalsPerGroup) fail('GROUP_PROPOSAL_LIMIT', 'Proposal-per-group limit exceeded.');
    groups.set(key, count);
  }
  if (groups.size > ENRICHMENT_PROPOSAL_LIMITS.groups) fail('GROUP_LIMIT', 'Proposal-group limit exceeded.');
}

function comparisonMaps(upstream) {
  const results = new Map(list(upstream?.run?.results).map((item) => [item.comparisonResultId, item]));
  return { results };
}

function proposalBase(decision, result, sourceOrder) {
  const match = decision.selectedMatch;
  return {
    proposalId: '', sourceOrder, reviewDecisionId: decision.reviewDecisionId,
    comparisonResultId: decision.comparisonResultId, entryId: decision.entryId,
    candidateId: decision.candidateId, entityId: decision.entityId, fieldKey: decision.fieldKey,
    bindingId: decision.bindingId, datasetId: decision.datasetId, columnId: decision.columnId,
    matchId: match?.matchId || '', rowId: match?.rowId || '', rowSourceOrder: match?.rowSourceOrder ?? -1,
    candidateValue: result?.candidateValue, normalizedCandidate: result?.normalizedCandidate,
    proposedValue: match?.masterValue, normalizedProposedValue: match?.normalizedMasterValue,
    reviewNote: decision.note,
  };
}

function exclusionBase(decision, sourceOrder) {
  return {
    exclusionId: '', sourceOrder, reviewDecisionId: decision.reviewDecisionId,
    subjectKind: decision.subjectKind, comparisonResultId: decision.comparisonResultId,
    entryId: decision.entryId, candidateId: decision.candidateId, entityId: decision.entityId,
    fieldKey: decision.fieldKey, bindingId: decision.bindingId, datasetId: decision.datasetId,
    columnId: decision.columnId, disposition: decision.disposition,
    reason: ENRICHMENT_EXCLUSION_REASONS[decision.disposition] || '', reviewNote: decision.note,
  };
}

async function projectDecisions(upstream, hashText) {
  const proposals = []; const exclusions = []; const maps = comparisonMaps(upstream);
  for (const decision of list(upstream?.reviewLedger?.decisions)) {
    if (decision.disposition === 'confirm-match') {
      if (proposals.length >= ENRICHMENT_PROPOSAL_LIMITS.proposals) fail('PROPOSAL_LIMIT', 'Proposal limit exceeded.');
      const proposal = proposalBase(decision, maps.results.get(decision.comparisonResultId), proposals.length);
      proposal.proposalId = await createEnrichmentProposalId(upstream.reviewLedger.reviewLedgerId, proposal, hashText);
      proposals.push(proposal);
    } else {
      if (exclusions.length >= ENRICHMENT_PROPOSAL_LIMITS.exclusions) fail('EXCLUSION_LIMIT', 'Exclusion limit exceeded.');
      const exclusion = exclusionBase(decision, exclusions.length);
      exclusion.exclusionId = await createEnrichmentExclusionId(upstream.reviewLedger.reviewLedgerId, exclusion, hashText);
      exclusions.push(exclusion);
    }
  }
  return { proposals, exclusions };
}

function orderedDistinctValues(proposals) {
  const seen = new Set(); const values = [];
  for (const proposal of proposals) {
    const canonical = canonicalProposalValue(proposal.proposedValue);
    if (!seen.has(canonical)) { seen.add(canonical); values.push(canonical); }
  }
  return values;
}

function groupStatus(proposals, distinctValues) {
  if (proposals.length === 1) return 'single-proposal';
  return distinctValues.length === 1 ? 'equivalent-proposals' : 'conflicting-proposals';
}

async function buildGroups(graph, proposals, hashText) {
  const buckets = new Map();
  for (const proposal of proposals) {
    const key = `${proposal.entityId}\u0000${proposal.fieldKey}`;
    if (!buckets.has(key)) buckets.set(key, []);
    const bucket = buckets.get(key); bucket.push(proposal);
    if (bucket.length > ENRICHMENT_PROPOSAL_LIMITS.proposalsPerGroup) fail('GROUP_PROPOSAL_LIMIT', 'Proposal-per-group limit exceeded.');
  }
  if (buckets.size > ENRICHMENT_PROPOSAL_LIMITS.groups) fail('GROUP_LIMIT', 'Proposal-group limit exceeded.');
  const groups = [];
  for (const bucket of buckets.values()) {
    const distinctValues = orderedDistinctValues(bucket); const group = {
      proposalGroupId: '', sourceOrder: groups.length, entityId: bucket[0].entityId,
      fieldKey: bucket[0].fieldKey, status: groupStatus(bucket, distinctValues),
      proposalIds: bucket.map((item) => item.proposalId), proposalCount: bucket.length,
      distinctValueCount: distinctValues.length,
    };
    group.proposalGroupId = await createEnrichmentProposalGroupId(graph, group, distinctValues, hashText);
    groups.push(group);
  }
  return groups;
}

export function summarizeEnrichmentProposalSet(proposalSet) {
  const proposals = list(proposalSet?.proposals); const exclusions = list(proposalSet?.exclusions);
  const groups = list(proposalSet?.groups);
  return {
    reviewDecisionCount: proposals.length + exclusions.length, proposalCount: proposals.length,
    excludedCount: exclusions.length, groupCount: groups.length,
    singleProposalGroupCount: groups.filter((item) => item.status === 'single-proposal').length,
    equivalentProposalGroupCount: groups.filter((item) => item.status === 'equivalent-proposals').length,
    conflictingProposalGroupCount: groups.filter((item) => item.status === 'conflicting-proposals').length,
    entityCount: new Set(proposals.map((item) => item.entityId)).size,
    fieldCount: new Set(proposals.map((item) => item.fieldKey)).size,
  };
}

async function buildProposalSet(upstream, hashText) {
  enforceDecisionLimit(upstream?.reviewLedger); const projected = await projectDecisions(upstream, hashText);
  const groups = await buildGroups(upstream.graph, projected.proposals, hashText);
  const base = {
    schema: 'EnrichmentProposalSet.v1', proposalSetId: '', ...graphComparisonIdentity(upstream.graph),
    ledgerId: upstream.ledger.ledgerId, bindingConfigId: upstream.config.bindingConfigId,
    comparisonRunId: upstream.run.comparisonRunId, reviewLedgerId: upstream.reviewLedger.reviewLedgerId,
    attachmentSetIdentity: upstream.run.attachmentSetIdentity, proposals: projected.proposals,
    exclusions: projected.exclusions, groups, summary: null,
    validation: { ok: false, errors: [], warnings: [] },
  };
  base.summary = summarizeEnrichmentProposalSet(base);
  base.proposalSetId = await createEnrichmentProposalSetId(upstream.graph, base, hashText);
  return base;
}

function metadataErrors(proposalSet, upstream) {
  const errors = []; const graphIdentity = graphComparisonIdentity(upstream?.graph);
  if (proposalSet?.schema !== 'EnrichmentProposalSet.v1') errors.push('Proposal-set schema must be EnrichmentProposalSet.v1.');
  for (const [key, value] of Object.entries(graphIdentity)) {
    if (proposalSet?.[key] !== value) errors.push(`Proposal-set graph metadata mismatch: ${key}.`);
  }
  if (proposalSet?.ledgerId !== upstream?.ledger?.ledgerId) errors.push('Proposal-set candidate-ledger identity mismatch.');
  if (proposalSet?.bindingConfigId !== upstream?.config?.bindingConfigId) errors.push('Proposal-set binding-config identity mismatch.');
  if (proposalSet?.comparisonRunId !== upstream?.run?.comparisonRunId) errors.push('Proposal-set comparison-run identity mismatch.');
  if (proposalSet?.reviewLedgerId !== upstream?.reviewLedger?.reviewLedgerId) errors.push('Proposal-set review-ledger identity mismatch.');
  if (proposalSet?.attachmentSetIdentity !== upstream?.run?.attachmentSetIdentity) errors.push('Proposal-set attachment identity mismatch.');
  return errors;
}

function orderedIdErrors(items, label, idKey) {
  const errors = []; const ids = new Set();
  items.forEach((item, index) => {
    if (item?.sourceOrder !== index) errors.push(`${label} ${index} sourceOrder mismatch.`);
    if (!item?.[idKey]) errors.push(`${label} ${index} identity is empty.`);
    else if (ids.has(item[idKey])) errors.push(`${label} contains duplicate identity ${item[idKey]}.`);
    if (item?.[idKey]) ids.add(item[idKey]);
  });
  return errors;
}

function structureErrors(proposalSet) {
  const errors = [];
  if (!Array.isArray(proposalSet?.proposals)) errors.push('Proposal entries must be an array.');
  else errors.push(...orderedIdErrors(proposalSet.proposals, 'Proposal', 'proposalId'));
  if (!Array.isArray(proposalSet?.exclusions)) errors.push('Exclusion entries must be an array.');
  else errors.push(...orderedIdErrors(proposalSet.exclusions, 'Exclusion', 'exclusionId'));
  if (!Array.isArray(proposalSet?.groups)) errors.push('Proposal groups must be an array.');
  else errors.push(...orderedIdErrors(proposalSet.groups, 'Proposal group', 'proposalGroupId'));
  return errors;
}

function evidenceWithoutValidation(value) {
  const { validation: omitted, ...evidence } = value || {}; return evidence;
}

export async function validateEnrichmentProposalSet(proposalSet, upstream, dependencies = {}) {
  const hashText = dependencies.hashText || sha256Hex;
  const authority = await validateEnrichmentProposalAuthority(upstream, dependencies);
  const errors = [...authority.errors, ...metadataErrors(proposalSet, upstream), ...structureErrors(proposalSet),
    ...findJsonSafetyErrors(proposalSet, 'Enrichment proposal set')];
  try {
    const expected = await buildProposalSet(upstream, hashText);
    if (canonicalComparisonJson(evidenceWithoutValidation(proposalSet))
      !== canonicalComparisonJson(evidenceWithoutValidation(expected))) {
      errors.push('Proposal set does not match complete authoritative projection.');
    }
  } catch (error) { errors.push(`${error.code || 'BUILD_ERROR'}: ${error.message}`); }
  const expectedSummary = summarizeEnrichmentProposalSet(proposalSet);
  if (JSON.stringify(proposalSet?.summary) !== JSON.stringify(expectedSummary)) errors.push('Proposal-set summary mismatch.');
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: authority.warnings };
}

export async function createEnrichmentProposalSet(upstream, dependencies = {}) {
  const authority = await validateEnrichmentProposalAuthority(upstream, dependencies);
  if (!authority.ok) fail('INVALID_AUTHORITY', authority.errors.join(' '));
  const hashText = dependencies.hashText || sha256Hex; const proposalSet = await buildProposalSet(upstream, hashText);
  proposalSet.validation = await validateEnrichmentProposalSet(proposalSet, upstream, { ...dependencies, hashText });
  return deepFreezeArtifact(proposalSet);
}

export function serializeEnrichmentProposalSet(proposalSet) {
  return `${JSON.stringify(proposalSet, null, 2)}\n`;
}
