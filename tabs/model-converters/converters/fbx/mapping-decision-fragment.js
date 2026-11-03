import { canonicalDigest } from './mapping-package.js';
import { failFragment, validateFragmentShape } from './mapping-review-contract.js';
import { deepFreeze } from './canonical-json.js';

function compareText(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

function fragmentPayload(fragment) {
  return {
    schema: fragment.schema,
    bundleId: fragment.bundleId,
    worklistId: fragment.worklistId,
    sourceGraphCanonicalSha256: fragment.sourceGraphCanonicalSha256,
    shardId: fragment.shardId,
    decisions: [...fragment.decisions].sort((a, b) => compareText(a.workItemId, b.workItemId)),
  };
}

export async function calculateFragmentId(fragment) {
  return canonicalDigest(fragmentPayload(fragment));
}

export async function parseDecisionFragment(fragment) {
  const safeFragment = validateFragmentShape(fragment);
  const observedId = await calculateFragmentId(safeFragment);
  if (observedId !== safeFragment.fragmentId) {
    failFragment('BLOCKED_FRAGMENT_CONTRACT', 'fragmentId is stale or tampered.');
  }

  const seenWorkItemIds = new Set();
  for (const decision of safeFragment.decisions) {
    if (seenWorkItemIds.has(decision.workItemId)) {
      failFragment('BLOCKED_FRAGMENT_CONTRACT', 'Duplicate workItemId found in decisions.');
    }
    seenWorkItemIds.add(decision.workItemId);
  }

  return deepFreeze(safeFragment);
}
