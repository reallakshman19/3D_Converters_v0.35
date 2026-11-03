import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { verifyFbxBenchmarkSourceBinding } from './source-binding.js';
import {
  benchmarkTokens, candidateComponents, compareText, groupBy, groupState, intersect, sourceTokens,
} from './lineage-common.js';

const BRANCH_PATTERN = /\/B\d+$/;
const DIRECT = 'DIRECT_ENGINEERING_RECORD';
const UNRESOLVED = 'UNRESOLVED';

async function assertInputs(sourceGraph, loadedBenchmark, binding, parserIdentity) {
  if (sourceGraph?.schema !== 'FbxSourceGraph.v2') throw new Error('Expected FbxSourceGraph.v2.');
  if (loadedBenchmark?.schema !== 'FbxBenchmarkLoaded.v1') throw new Error('Expected FbxBenchmarkLoaded.v1.');
  const verifiedBinding = await verifyFbxBenchmarkSourceBinding(binding);
  if (sourceGraph.file?.version !== verifiedBinding.source.fbx.version) throw new Error('Source graph FBX version differs from binding.');
  if (loadedBenchmark.identity?.benchmarkBlobSha !== verifiedBinding.benchmark.gitBlobSha1) throw new Error('Loaded benchmark blob differs from binding.');
  for (const key of ['provenanceSchema', 'upstreamRevision', 'sourceSha256', 'wasmSha256']) {
    if (typeof parserIdentity?.[key] !== 'string' || !parserIdentity[key]) throw new Error(`Parser identity lacks ${key}.`);
  }
  return verifiedBinding;
}

function sourceAccountingProjection(source) {
  const view = (item) => ({ sourceOccurrenceId: item.occurrence.sourceOccurrenceId,
    sourceModelObjectId: item.occurrence.sourceModelObjectId, parentOccurrenceId: item.occurrence.parentOccurrenceId,
    ufbxElementType: item.object.ufbxElementType, domClass: item.object.domClass,
    domSubtype: item.object.domSubtype, domSourceName: item.object.domSourceName,
    displayName: item.object.displayName, sourceDocumentOrder: item.object.sourceDocumentOrder });
  return { branches: source.branches.map(view), children: source.children.map(view) };
}

function sourceViews(sourceGraph) {
  const objects = new Map(sourceGraph.sourceObjects.map((item) => [item.sourceObjectId, item]));
  const occurrences = sourceGraph.occurrences.map((occurrence) => ({
    occurrence, object: objects.get(occurrence.sourceModelObjectId),
  }));
  if (occurrences.some((item) => !item.object)) throw new Error('Source occurrence lacks its source object.');
  const branches = occurrences.filter((item) => item.object.ufbxElementType === 'NODE'
    && item.object.domSubtype === 'Null'
    && sourceTokens(item.object).some((token) => BRANCH_PATTERN.test(token)))
    .sort((a, b) => compareText(a.occurrence.sourceOccurrenceId, b.occurrence.sourceOccurrenceId));
  const branchIds = new Set(branches.map((item) => item.occurrence.sourceOccurrenceId));
  const children = occurrences.filter((item) => branchIds.has(item.occurrence.parentOccurrenceId))
    .sort((a, b) => compareText(a.occurrence.sourceOccurrenceId, b.occurrence.sourceOccurrenceId));
  return { branches, children };
}

function benchmarkViews(loadedBenchmark) {
  const branches = loadedBenchmark.occurrences.filter((item) => item.recordRole === 'BRANCH_RECORD');
  const children = loadedBenchmark.occurrences.filter((item) => item.recordRole === 'CHILD_RECORD');
  return { branches, children };
}

function assertBoundPopulations(source, benchmark, binding) {
  const expected = binding.lineage;
  const checks = [
    [source.branches.length, expected.sourceBranchRootCount, 'source branch'],
    [source.children.length, expected.sourceDirectBranchChildCount, 'source child'],
    [benchmark.branches.length, expected.benchmarkBranchCount, 'benchmark branch'],
    [benchmark.children.length, expected.benchmarkChildCount, 'benchmark child'],
  ];
  for (const [actual, value, label] of checks) if (actual !== value) throw new Error(`${label} population differs from binding.`);
}

function branchItems(source, benchmark) {
  return {
    source: source.map((item) => ({ id: item.occurrence.sourceOccurrenceId, tokens: sourceTokens(item.object), item })).sort((a, b) => compareText(a.id, b.id)),
    benchmark: benchmark.map((item) => ({ id: item.occurrenceId, tokens: benchmarkTokens(item.record), item })).sort((a, b) => compareText(a.id, b.id)),
  };
}

function branchLedger(items) {
  return candidateComponents(items.source, items.benchmark).map((group, index) => {
    const source = group.left.map((value) => items.source[value]);
    const benchmark = group.right.map((value) => items.benchmark[value]);
    const state = groupState(group);
    return {
      lineageKey: `branch-group:${String(index).padStart(5, '0')}`,
      matchState: state,
      disposition: state === 'EXACT_ONE_TO_ONE' ? DIRECT : UNRESOLVED,
      sourceOccurrenceIds: source.map((item) => item.id).sort(compareText),
      benchmarkOccurrenceIds: benchmark.map((item) => item.id).sort(compareText),
      identityTokens: sharedTokens(source, benchmark),
    };
  });
}

function sharedTokens(source, benchmark) {
  const left = source.flatMap((item) => item.tokens), right = benchmark.flatMap((item) => item.tokens);
  return [...new Set(intersect(left, right))].sort(compareText);
}

function childGroups(sourceChildren, benchmarkChildren) {
  const left = sourceChildren.map((item) => ({ id: item.occurrence.sourceOccurrenceId,
    branchId: item.occurrence.parentOccurrenceId, tokens: sourceTokens(item.object) })).sort((a, b) => compareText(a.id, b.id));
  const right = benchmarkChildren.map((item) => ({ id: item.occurrenceId,
    branchId: item.branchOccurrenceId, tokens: benchmarkTokens(item.record) })).sort((a, b) => compareText(a.id, b.id));
  return { left, right, groups: candidateComponents(left, right) };
}

function childLedgers(sourceChildren, benchmarkChildren, branches) {
  const sourceByBranch = groupBy(sourceChildren, (item) => item.occurrence.parentOccurrenceId);
  const benchmarkByBranch = groupBy(benchmarkChildren, (item) => item.branchOccurrenceId);
  const sourceLedger = [], benchmarkLedger = [], ambiguous = [];
  for (const branch of branches.filter((item) => item.matchState === 'EXACT_ONE_TO_ONE')) {
    const values = childGroups(sourceByBranch.get(branch.sourceOccurrenceIds[0]) || [],
      benchmarkByBranch.get(branch.benchmarkOccurrenceIds[0]) || []);
    appendChildGroups(values, sourceLedger, benchmarkLedger, ambiguous);
  }
  appendUnmatchedBranches(branches, sourceByBranch, benchmarkByBranch, sourceLedger, benchmarkLedger);
  return { sourceLedger: sourceLedger.sort(bySourceId), benchmarkLedger: benchmarkLedger.sort(byBenchmarkId), ambiguous };
}

function appendChildGroups(values, sourceLedger, benchmarkLedger, ambiguous) {
  for (const [index, group] of values.groups.entries()) {
    const state = groupState(group), direct = state === 'EXACT_ONE_TO_ONE';
    const sourceIds = group.left.map((value) => values.left[value].id).sort(compareText);
    const benchmarkIds = group.right.map((value) => values.right[value].id).sort(compareText);
    const groupKey = `child-group:${values.left[0]?.branchId || values.right[0]?.branchId || 'none'}:${String(index).padStart(5, '0')}`;
    if (state === 'AMBIGUOUS') ambiguous.push(groupKey);
    for (const value of group.left) sourceLedger.push(sourceEntry(values.left[value], benchmarkIds, direct, state, groupKey));
    for (const value of group.right) benchmarkLedger.push(benchmarkEntry(values.right[value], sourceIds, direct, state, groupKey));
  }
}

function sourceEntry(item, candidates, direct, state, groupKey) {
  return { sourceOccurrenceId: item.id, sourceBranchOccurrenceId: item.branchId,
    disposition: direct ? DIRECT : UNRESOLVED, matchState: state,
    benchmarkOccurrenceIds: direct ? candidates : [], candidateBenchmarkOccurrenceIds: candidates,
    identityTokens: item.tokens, candidateGroupKey: groupKey };
}
function benchmarkEntry(item, candidates, direct, state, groupKey) {
  return { benchmarkOccurrenceId: item.id, benchmarkBranchOccurrenceId: item.branchId,
    disposition: direct ? DIRECT : UNRESOLVED, matchState: state,
    sourceOccurrenceIds: direct ? candidates : [], candidateSourceOccurrenceIds: candidates,
    identityTokens: item.tokens, candidateGroupKey: groupKey };
}

function appendUnmatchedBranches(branches, sourceByBranch, benchmarkByBranch, sourceLedger, benchmarkLedger) {
  for (const branch of branches.filter((item) => item.matchState !== 'EXACT_ONE_TO_ONE')) {
    for (const item of branch.sourceOccurrenceIds.flatMap((id) => sourceByBranch.get(id) || [])) {
      sourceLedger.push(sourceEntry({ id: item.occurrence.sourceOccurrenceId, branchId: item.occurrence.parentOccurrenceId,
        tokens: sourceTokens(item.object) }, [], false, 'BRANCH_UNRESOLVED', 'branch-unresolved'));
    }
    for (const item of branch.benchmarkOccurrenceIds.flatMap((id) => benchmarkByBranch.get(id) || [])) {
      benchmarkLedger.push(benchmarkEntry({ id: item.occurrenceId, branchId: item.branchOccurrenceId,
        tokens: benchmarkTokens(item.record) }, [], false, 'BRANCH_UNRESOLVED', 'branch-unresolved'));
    }
  }
}
function bySourceId(a, b) { return compareText(a.sourceOccurrenceId, b.sourceOccurrenceId); }
function byBenchmarkId(a, b) { return compareText(a.benchmarkOccurrenceId, b.benchmarkOccurrenceId); }

function duplicateConsumptionCount(ledger, key) {
  const counts = new Map();
  for (const item of ledger) for (const id of item[key]) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts.values()].filter((count) => count > 1).length;
}

function summary(sourceLedger, benchmarkLedger, branches, ambiguous, populations) {
  const sourceIds = new Set(sourceLedger.map((item) => item.sourceOccurrenceId));
  const benchmarkIds = new Set(benchmarkLedger.map((item) => item.benchmarkOccurrenceId));
  const sourceCovered = sourceIds.size === populations.sourceChildCount && sourceLedger.length === populations.sourceChildCount;
  const benchmarkCovered = benchmarkIds.size === populations.benchmarkChildCount
    && benchmarkLedger.length === populations.benchmarkChildCount;
  const duplicateSourceConsumptionCount = duplicateConsumptionCount(benchmarkLedger, 'sourceOccurrenceIds');
  const duplicateBenchmarkConsumptionCount = duplicateConsumptionCount(sourceLedger, 'benchmarkOccurrenceIds');
  const unresolvedSourceCount = sourceLedger.filter((item) => item.disposition === UNRESOLVED).length;
  const unresolvedBenchmarkCount = benchmarkLedger.filter((item) => item.disposition === UNRESOLVED).length;
  const unresolvedBranchCount = branches.filter((item) => item.disposition === UNRESOLVED).length;
  const blocked = !sourceCovered || !benchmarkCovered || duplicateSourceConsumptionCount
    || duplicateBenchmarkConsumptionCount || unresolvedSourceCount || unresolvedBenchmarkCount || unresolvedBranchCount;
  return { sourceChildrenCoveredExactlyOnce: sourceCovered, benchmarkChildrenCoveredExactlyOnce: benchmarkCovered,
    duplicateSourceConsumptionCount, duplicateBenchmarkConsumptionCount, unresolvedSourceCount,
    unresolvedBenchmarkCount, unresolvedBranchCount, ambiguousGroupCount: ambiguous.length
      + branches.filter((item) => item.matchState === 'AMBIGUOUS').length,
    status: blocked ? 'BLOCKED' : 'PASS' };
}

export async function buildFbxBenchmarkLineageAccounting(options) {
  const { sourceGraph, loadedBenchmark, sourceBinding, parserIdentity } = options;
  const verifiedBinding = await assertInputs(sourceGraph, loadedBenchmark, sourceBinding, parserIdentity);
  const source = sourceViews(sourceGraph), benchmark = benchmarkViews(loadedBenchmark);
  assertBoundPopulations(source, benchmark, verifiedBinding);
  const branches = branchLedger(branchItems(source.branches, benchmark.branches));
  const children = childLedgers(source.children, benchmark.children, branches);
  const populations = { sourceBranchCount: source.branches.length, sourceChildCount: source.children.length,
    benchmarkBranchCount: benchmark.branches.length, benchmarkChildCount: benchmark.children.length,
    netBenchmarkChildDifference: benchmark.children.length - source.children.length };
  const artifact = { schema: 'FbxBenchmarkLineageAccounting.v1',
    executionIdentity: { sourceBindingSha256: verifiedBinding.bindingSha256,
      sourceAccountingProjectionSha256: await sha256Hex(canonicalJson(sourceAccountingProjection(source))),
      benchmarkContentSha256: loadedBenchmark.identity.contentSha256,
      benchmarkByteLength: loadedBenchmark.identity.byteLength, parserIdentity: structuredClone(parserIdentity) },
    populations,
    branchLedger: branches, sourceChildLedger: children.sourceLedger,
    benchmarkChildLedger: children.benchmarkLedger,
    summary: summary(children.sourceLedger, children.benchmarkLedger, branches, children.ambiguous, populations) };
  return deepFreeze(artifact);
}
