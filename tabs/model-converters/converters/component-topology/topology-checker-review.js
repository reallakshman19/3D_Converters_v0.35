/**
 * Immutable issue-review state for the topology checker dashboard.
 * Review status is stored separately from evidence so checks remain repeatable.
 * Suppression requires a reason; unknown issue IDs and statuses raise.
 */

import { deterministicHash } from './topology-deterministic-hash.js';
import { cleanText } from './topology-values.js';

export const TOPOLOGY_REVIEW_STATUSES = Object.freeze(['OPEN', 'ACKNOWLEDGED', 'SUPPRESSED', 'RESOLVED']);

/** @param {Record<string,unknown>} state @returns {Readonly<Record<string,unknown>>} */
function finalizeReviewState(state) {
  const withoutHash = { ...state };
  delete withoutHash.topologyReviewStateHash;
  return Object.freeze({
    ...withoutHash,
    issueStates: Object.freeze({ ...withoutHash.issueStates }),
    topologyReviewStateHash: deterministicHash(withoutHash, { omitKeys: ['topologyReviewStateHash'] }),
  });
}

/** @param {Record<string,unknown>} report @returns {Readonly<Record<string,unknown>>} */
export function createTopologyReviewState(report) {
  if (report?.schema !== 'TopologyCheckReport.v1') throw new TypeError('Review state requires TopologyCheckReport.v1.');
  return finalizeReviewState({
    schema: 'TopologyReviewState.v1', canonicalTopologyHash: report.canonicalTopologyHash,
    issueStates: {},
  });
}

/**
 * @param {Record<string,unknown>} report
 * @param {Record<string,unknown>} state
 * @param {string} issueId
 * @param {string} status
 * @param {string} reason
 * @returns {Readonly<Record<string,unknown>>}
 */
export function setTopologyIssueStatus(report, state, issueId, status, reason) {
  if (state?.schema !== 'TopologyReviewState.v1') throw new TypeError('Expected TopologyReviewState.v1.');
  if (state.canonicalTopologyHash !== report.canonicalTopologyHash) throw new Error('Review state belongs to a different canonical topology hash.');
  if (!report.issues.some((issue) => issue.id === issueId)) throw new RangeError(`Unknown topology issue ${issueId}.`);
  const normalized = cleanText(status).toUpperCase();
  if (!TOPOLOGY_REVIEW_STATUSES.includes(normalized)) throw new RangeError(`Unsupported topology review status ${normalized}.`);
  const rationale = cleanText(reason);
  if (normalized === 'SUPPRESSED' && !rationale) throw new Error('Suppressing a topology issue requires a reason.');
  const issueStates = { ...state.issueStates };
  if (normalized === 'OPEN') delete issueStates[issueId];
  else issueStates[issueId] = Object.freeze({ status: normalized, reason: rationale });
  return finalizeReviewState({ ...state, issueStates });
}

/** @param {Record<string,unknown>} report @param {Record<string,unknown>} state @returns {Readonly<Record<string,number>>} */
export function topologyReviewSummary(report, state) {
  const statusFor = (issue) => state.issueStates?.[issue.id]?.status ?? 'OPEN';
  const count = (status) => report.issues.filter((issue) => statusFor(issue) === status).length;
  return Object.freeze({
    openCount: count('OPEN'), acknowledgedCount: count('ACKNOWLEDGED'),
    resolvedCount: count('RESOLVED'), suppressedCount: count('SUPPRESSED'),
  });
}

export const _test = Object.freeze({ finalizeReviewState });
