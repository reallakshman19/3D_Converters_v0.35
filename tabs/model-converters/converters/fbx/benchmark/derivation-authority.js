import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { verifyFbxBenchmarkSourceBinding } from './source-binding.js';
import { verifyProducerAuthority } from './producer-authority.js';
import {
  branchOwnerSiteClaim, directIdentityClaim, supportKindClaim, supportShapingClaim,
  syntheticPipeClaim, typeNormalizationClaim, unresolvedClaim,
} from './derivation-rules.js';

function assertInputs(loaded, binding, lineage) {
  if (loaded?.schema !== 'FbxBenchmarkLoaded.v1') throw new Error('Expected FbxBenchmarkLoaded.v1.');
  if (lineage?.schema !== 'FbxBenchmarkLineageAccounting.v1') throw new Error('Expected FbxBenchmarkLineageAccounting.v1.');
  if (lineage.executionIdentity?.sourceBindingSha256 !== binding.bindingSha256) throw new Error('Lineage source binding differs.');
  if (lineage.executionIdentity?.benchmarkContentSha256 !== loaded.identity?.contentSha256) throw new Error('Lineage benchmark digest differs.');
  if (lineage.executionIdentity?.benchmarkByteLength !== loaded.identity?.byteLength) throw new Error('Lineage benchmark length differs.');
}
function lineageLookups(lineage) {
  const branches = new Map();
  for (const group of lineage.branchLedger || []) {
    for (const id of group.benchmarkOccurrenceIds || []) branches.set(id, group);
  }
  const children = new Map((lineage.benchmarkChildLedger || []).map((item) => [item.benchmarkOccurrenceId, item]));
  return { branches, children };
}
function claimsForOccurrence(occurrence, lookups) {
  const stage2 = occurrence.recordRole === 'BRANCH_RECORD'
    ? lookups.branches.get(occurrence.occurrenceId) : lookups.children.get(occurrence.occurrenceId);
  const isDirect = stage2?.disposition === 'DIRECT_ENGINEERING_RECORD';
  const claims = [directIdentityClaim(isDirect)];
  if (occurrence.recordRole === 'BRANCH_RECORD') claims.push(branchOwnerSiteClaim(occurrence.record));
  else claims.push(typeNormalizationClaim(occurrence.record), syntheticPipeClaim(occurrence.record),
    supportShapingClaim(occurrence.record), supportKindClaim(occurrence.record));
  const filtered = claims.filter(Boolean);
  if (!filtered.length) filtered.push(unresolvedClaim());
  return { occurrence, stage2, claims: filtered };
}
function ledgerEntry(value) {
  return {
    benchmarkOccurrenceId: value.occurrence.occurrenceId,
    recordRole: value.occurrence.recordRole,
    recordType: String(value.occurrence.record?.type || ''),
    stage2Disposition: value.stage2?.disposition || 'UNRESOLVED',
    claims: value.claims,
  };
}
function claimCounts(ledger) {
  const counts = {};
  for (const entry of ledger) for (const claim of entry.claims) {
    const key = `${claim.claimType}:${claim.authorityState}:${claim.conformance}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
function summarize(ledger, expectedCount, producerAuthority) {
  const ids = new Set(ledger.map((item) => item.benchmarkOccurrenceId));
  const covered = ids.size === expectedCount && ledger.length === expectedCount;
  const claims = ledger.flatMap((item) => item.claims);
  const invalid = claims.filter((item) => item.conformance === 'FAIL').length;
  const unresolved = ledger.filter((item) => item.claims.some((claim) => claim.authorityState === 'UNRESOLVED')).length;
  const runUnbound = claims.filter((item) => item.authorityState === 'PINNED_RULE_RUN_UNBOUND').length;
  const configUnbound = claims.filter((item) => item.authorityState === 'PINNED_RULE_CONFIG_UNBOUND').length;
  const status = !covered || invalid ? 'FAIL' : (producerAuthority.status === 'BLOCKED' || unresolved || runUnbound || configUnbound) ? 'BLOCKED' : 'PASS';
  return { benchmarkRecordsCoveredExactlyOnce: covered, invalidClaimCount: invalid,
    unresolvedRecordCount: unresolved, runUnboundClaimCount: runUnbound,
    configUnboundClaimCount: configUnbound, countsByClaimState: claimCounts(ledger), status };
}
export async function buildFbxBenchmarkDerivationAuthority(options) {
  const binding = await verifyFbxBenchmarkSourceBinding(options.sourceBinding);
  const producer = await verifyProducerAuthority(options.producerAuthority);
  assertInputs(options.loadedBenchmark, binding, options.lineageAccounting);
  if (producer.benchmarkCommit !== binding.benchmark.commit) throw new Error('Producer authority benchmark commit differs.');
  const lookups = lineageLookups(options.lineageAccounting);
  const ledger = options.loadedBenchmark.occurrences.map((item) => ledgerEntry(claimsForOccurrence(item, lookups)));
  const expected = options.loadedBenchmark.occurrences.length;
  const artifact = {
    schema: 'FbxBenchmarkDerivationAuthority.v1',
    executionIdentity: {
      sourceBindingSha256: binding.bindingSha256,
      lineageAccountingSha256: await sha256Hex(canonicalJson(options.lineageAccounting)),
      benchmarkContentSha256: options.loadedBenchmark.identity.contentSha256,
      benchmarkByteLength: options.loadedBenchmark.identity.byteLength,
      producerAuthoritySha256: producer.authoritySha256,
    },
    producerStatus: producer.status,
    recordLedger: ledger,
    summary: summarize(ledger, expected, producer),
  };
  return deepFreeze(artifact);
}
