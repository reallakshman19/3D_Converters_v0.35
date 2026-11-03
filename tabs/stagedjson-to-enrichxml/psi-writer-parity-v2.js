import { canonicalSemanticJson } from '../../contracts/topo-enriched-xml/contract-core.js';
import { verifyPsiWriterBundle } from './psi-writer-parity-bundle.js';
import { buildPsiWriterParityReport } from './psi-writer-parity-report.js';
import { inspectPsiWriterParityPlans } from './psi-writer-parity-plans.js';

export async function comparePsiWriterBundles({ canonicalBundle, sequentialBundle, occurrencePlan, nodePlan }) {
  const state = createState(occurrencePlan, nodePlan);
  const [canonical, sequential] = await Promise.all([
    verifyPsiWriterBundle(canonicalBundle, 'CANONICAL'),
    verifyPsiWriterBundle(sequentialBundle, 'SEQUENTIAL'),
  ]);
  state.differences.push(...await inspectPsiWriterParityPlans({
    occurrencePlan, nodePlan, canonicalBundle, sequentialBundle,
  }));
  addBundleIssues(state, canonical, sequential);
  compareValidation(state, canonicalBundle, sequentialBundle);
  compareTraceCoverage(state, canonical, sequential);
  compareOccurrenceRows(state, canonical, sequential);
  compareSourceBoundaries(state, canonical, sequential);
  compareBranchConditions(state, canonical, sequential);
  compareReservedOccurrences(state, canonical, sequential);
  compareBundleCoherence(state, canonicalBundle, sequentialBundle);
  const gates = buildGates(state, canonicalBundle, sequentialBundle);
  return buildPsiWriterParityReport({ state, canonicalBundle, sequentialBundle, gates });
}

function createState(occurrencePlan, nodePlan) {
  const occurrences = array(occurrencePlan?.occurrences);
  const emitted = occurrences.filter((row) => row?.disposition === 'EMITTED');
  const reserved = occurrences.filter((row) => row?.disposition === 'RESERVED');
  return {
    occurrencePlan, nodePlan, differences: [], warnings: [],
    occurrenceById: uniqueIndex(occurrences, 'occurrenceId'),
    nodeById: uniqueIndex([...array(nodePlan?.emittedOccurrences), ...array(nodePlan?.reservedOccurrences)], 'occurrenceId'),
    emittedIds: new Set(emitted.map((row) => text(row?.occurrenceId))),
    reservedIds: new Set(reserved.map((row) => text(row?.occurrenceId))),
    emittedCount: emitted.length, reservedCount: reserved.length, unplanned: new Set(),
  };
}

function addBundleIssues(state, canonical, sequential) {
  for (const verified of [canonical, sequential]) {
    for (const row of verified.issues) addDifference(state, dimensionFor(row.code), row.code,
      `${row.side}:${row.reason}`, null, null, row.evidence);
    for (const duplicate of verified.duplicateGroups) addDifference(state, 'TRACE_IDENTITY',
      'TRACE_IDENTITY_MISMATCH', `${rowSide(verified)}:${duplicate.occurrenceId}`, null, null, duplicate);
  }
}

function compareValidation(state, canonicalBundle, sequentialBundle) {
  const statuses = {
    occurrencePlan: text(state.occurrencePlan?.validation?.status),
    nodePlan: text(state.nodePlan?.validation?.status),
    canonical: text(canonicalBundle?.validation?.status),
    sequential: text(sequentialBundle?.validation?.status),
  };
  for (const [owner, status] of Object.entries(statuses)) {
    if (status !== 'PASS') addDifference(state, 'OUTPUT_VALIDATION', 'OUTPUT_VALIDATION_NOT_PASS', owner, 'PASS', status);
  }
}

function compareTraceCoverage(state, canonical, sequential) {
  const canonicalIds = traceIdSet(canonical.trace, state), sequentialIds = traceIdSet(sequential.trace, state);
  const expected = [...state.emittedIds].sort();
  const setMismatch = !sameArray([...canonicalIds].sort(), expected) || !sameArray([...sequentialIds].sort(), expected);
  if (setMismatch) {
    const evidence = { canonical: [...canonicalIds].sort(), sequential: [...sequentialIds].sort() };
    addDifference(state, 'EMITTED_OCCURRENCE_SET', 'EMITTED_OCCURRENCE_SET_MISMATCH', 'EMITTED', expected, evidence);
    addDifference(state, 'TRACE_IDENTITY', 'TRACE_IDENTITY_MISMATCH', 'EMITTED', expected, evidence);
  }
  const cardinalityMismatch = canonical.trace.length !== state.emittedCount
    || sequential.trace.length !== state.emittedCount || canonical.trace.length !== sequential.trace.length;
  if (cardinalityMismatch) addDifference(state, 'NODE_CARDINALITY', 'NODE_CARDINALITY_MISMATCH',
    'EMITTED', state.emittedCount, { canonical: canonical.trace.length, sequential: sequential.trace.length });
  if (cardinalityMismatch || hasTraceIdentityDefect(canonical) || hasTraceIdentityDefect(sequential)) {
    addDifference(state, 'TRACE_CARDINALITY', 'TRACE_CARDINALITY_MISMATCH', 'TRACE', state.emittedCount,
      { canonical: canonical.trace.length, sequential: sequential.trace.length });
  }
}

function traceIdSet(trace, state) {
  const ids = new Set();
  for (const row of trace) {
    const occurrenceId = text(row?.occurrenceId);
    if (!occurrenceId || !state.emittedIds.has(occurrenceId)) state.unplanned.add(occurrenceId || '(blank)');
    if (occurrenceId) ids.add(occurrenceId);
  }
  return ids;
}

function compareOccurrenceRows(state, canonical, sequential) {
  const left = uniqueTraceRows(canonical), right = uniqueTraceRows(sequential);
  for (const occurrenceId of [...state.emittedIds].sort()) {
    const expectedOccurrence = state.occurrenceById.get(occurrenceId);
    const expectedNode = state.nodeById.get(occurrenceId);
    const canonicalRow = left.get(occurrenceId), sequentialRow = right.get(occurrenceId);
    if (!canonicalRow || !sequentialRow || !expectedOccurrence || !expectedNode) continue;
    compareNumber(state, occurrenceId, expectedNode, canonicalRow.trace, sequentialRow.trace);
    compareProjection(state, occurrenceId, expectedOccurrence, expectedNode, canonicalRow.trace, sequentialRow.trace);
    compareEndpoint(state, occurrenceId, expectedOccurrence, canonicalRow.trace, sequentialRow.trace);
    compareEngineering(state, occurrenceId, canonicalRow.node, sequentialRow.node);
  }
}

function compareNumber(state, id, expected, canonical, sequential) {
  const values = [expected?.engineeringNodeNumber, canonical?.engineeringNodeNumber, sequential?.engineeringNodeNumber];
  if (!allSame(values)) addDifference(state, 'NODE_NUMBER', 'NODE_NUMBER_MISMATCH', id, values[0], {
    canonical: values[1], sequential: values[2],
  });
}

function compareProjection(state, id, occurrence, node, canonical, sequential) {
  const fields = ['componentProjectionId', 'sourceEntityId', 'logicalNodeId', 'psiComponentType', 'projectionRole'];
  for (const field of fields) {
    const expected = field === 'logicalNodeId' ? node?.[field] : occurrence?.[field];
    if (!allSame([expected, canonical?.[field], sequential?.[field]])) addDifference(state,
      'COMPONENT_PROJECTION', 'COMPONENT_PROJECTION_MISMATCH', `${id}:${field}`, expected,
      { canonical: canonical?.[field] ?? null, sequential: sequential?.[field] ?? null });
  }
}

function compareEndpoint(state, id, occurrence, canonical, sequential) {
  if (!allSame([occurrence?.endpoint, canonical?.endpoint, sequential?.endpoint])) addDifference(state,
    'ENDPOINT_SEMANTICS', 'ENDPOINT_SEMANTICS_MISMATCH', id, occurrence?.endpoint,
    { canonical: canonical?.endpoint ?? null, sequential: sequential?.endpoint ?? null });
}

function compareEngineering(state, id, canonicalNode, sequentialNode) {
  if (canonicalSemanticJson(canonicalNode?.engineering) !== canonicalSemanticJson(sequentialNode?.engineering)) {
    addDifference(state, 'ENGINEERING_CONTENT', 'ENGINEERING_CONTENT_MISMATCH', id,
      canonicalNode?.engineering ?? null, sequentialNode?.engineering ?? null);
  }
}

function compareSourceBoundaries(state, canonical, sequential) {
  for (const [side, verified] of [['CANONICAL', canonical], ['SEQUENTIAL', sequential]]) {
    for (const row of verified.trace) {
      const occurrence = state.occurrenceById.get(text(row?.occurrenceId));
      if (!occurrence) continue;
      const expected = side === 'CANONICAL' ? occurrence.canonicalMainLine : occurrence.sourceBranch;
      if (text(row?.branchName) !== text(expected)) addDifference(state, 'SOURCE_BOUNDARY',
        'SOURCE_BOUNDARY_MISMATCH', `${side}:${text(row?.occurrenceId)}`, expected, row?.branchName ?? null);
    }
    const names = verified.parsed.branches.map((branch) => branch.branchName);
    if (new Set(names).size !== names.length) addDifference(state, 'SOURCE_BOUNDARY',
      'SOURCE_BOUNDARY_MISMATCH', `${side}:DUPLICATE_BRANCH`, null, names);
  }
}

function compareBranchConditions(state, canonical, sequential) {
  const canonicalByName = branchIndex(canonical.parsed.branches), sequentialByName = branchIndex(sequential.parsed.branches);
  const pairs = uniqueBranchPairs(state.occurrencePlan);
  for (const pair of pairs) {
    const left = canonicalByName.get(pair.canonicalMainLine), right = sequentialByName.get(pair.sourceBranch);
    if (!left || !right || canonicalSemanticJson(left.conditions) !== canonicalSemanticJson(right.conditions)) {
      addDifference(state, 'BRANCH_CONDITION', 'BRANCH_CONDITION_MISMATCH',
        `${pair.canonicalMainLine}<-${pair.sourceBranch}`, left?.conditions ?? null, right?.conditions ?? null);
    }
  }
  if (canonical.parsed.branches.length !== sequential.parsed.branches.length) {
    state.warnings.push({ code: 'APPROVED_BRANCH_PRESENTATION_DIFFERENCE', evidence: {
      canonicalBranches: canonical.parsed.branches.length, sequentialBranches: sequential.parsed.branches.length,
    } });
  }
}

function compareReservedOccurrences(state, canonical, sequential) {
  for (const [side, verified] of [['CANONICAL', canonical], ['SEQUENTIAL', sequential]]) {
    const emittedReserved = verified.trace.filter((row) => state.reservedIds.has(text(row?.occurrenceId)));
    const summaryCount = verified.bundle?.summary?.reservedOccurrenceCount;
    if (emittedReserved.length || summaryCount !== state.reservedCount) addDifference(state,
      'RESERVED_OCCURRENCE', 'RESERVED_OCCURRENCE_MISMATCH', side, state.reservedCount,
      { summaryCount: summaryCount ?? null, emittedRows: emittedReserved });
  }
}

function compareBundleCoherence(state, canonical, sequential) {
  const values = {
    projectId: [state.occurrencePlan?.projectId, canonical?.projectId, sequential?.projectId],
    zoneId: [state.occurrencePlan?.zoneId, canonical?.zoneId, sequential?.zoneId],
    serializationPlanHash: [canonical?.serializationPlanHash, sequential?.serializationPlanHash],
    projectionKind: ['CANONICAL', canonical?.projectionKind, 'SOURCE_SEQUENTIAL', sequential?.projectionKind],
  };
  if (!allSame(values.projectId) || !allSame(values.zoneId) || !allSame(values.serializationPlanHash)
      || text(canonical?.projectionKind) !== 'CANONICAL' || text(sequential?.projectionKind) !== 'SOURCE_SEQUENTIAL') {
    addDifference(state, 'XML_TRACE_BUNDLE', 'XML_TRACE_BUNDLE_MISMATCH', 'ROOT_CHAIN', null, values);
  }
  const writerAllocations = Number(canonical?.summary?.writerSideAllocations || 0)
    + Number(sequential?.summary?.writerSideAllocations || 0);
  if (writerAllocations !== 0) addDifference(state, 'XML_TRACE_BUNDLE',
    'XML_TRACE_BUNDLE_MISMATCH', 'WRITER_SIDE_ALLOCATIONS', 0, writerAllocations);
}

function buildGates(state, canonical, sequential) {
  const has = (code) => state.differences.some((row) => row.code === code);
  const canonicalIds = new Set(array(canonical?.trace).map((row) => text(row?.occurrenceId)));
  const sequentialIds = new Set(array(sequential?.trace).map((row) => text(row?.occurrenceId)));
  const missing = [...state.emittedIds].filter((id) => !canonicalIds.has(id) || !sequentialIds.has(id));
  return {
    nodePlanHashEquivalent: !has('NODE_PLAN_HASH_MISMATCH'),
    occurrencePlanHashEquivalent: !has('OCCURRENCE_PLAN_HASH_MISMATCH'),
    occurrenceIdentityEquivalent: !has('EMITTED_OCCURRENCE_SET_MISMATCH') && !has('TRACE_IDENTITY_MISMATCH'),
    componentProjectionEquivalent: !has('COMPONENT_PROJECTION_MISMATCH'),
    endpointSemanticsEquivalent: !has('ENDPOINT_SEMANTICS_MISMATCH'),
    engineeringContentEquivalent: !has('ENGINEERING_CONTENT_MISMATCH'),
    sourceBoundaryEquivalent: !has('SOURCE_BOUNDARY_MISMATCH'),
    branchConditionsEquivalent: !has('BRANCH_CONDITION_MISMATCH'),
    traceIdentityEquivalent: !has('TRACE_IDENTITY_MISMATCH'),
    traceCardinalityEquivalent: !has('TRACE_CARDINALITY_MISMATCH') && !has('NODE_CARDINALITY_MISMATCH'),
    reservedOccurrenceTreatmentEquivalent: !has('RESERVED_OCCURRENCE_MISMATCH'),
    numberingEquivalent: !has('NODE_NUMBER_MISMATCH'),
    atomicBundleCoherent: !has('XML_TRACE_BUNDLE_MISMATCH'),
    occurrenceCoverage: percentage(state.emittedCount - missing.length, state.emittedCount),
    reservedOccurrenceCoverage: has('RESERVED_OCCURRENCE_MISMATCH') ? 0 : 100,
    writerSideAllocations: Number(canonical?.summary?.writerSideAllocations || 0)
      + Number(sequential?.summary?.writerSideAllocations || 0),
    unplannedOccurrences: state.unplanned.size,
  };
}

function uniqueTraceRows(verified) {
  const result = new Map();
  for (const entry of verified.traceGroups) {
    if (entry.rows.length !== 1 || !entry.occurrenceId) continue;
    const trace = entry.rows[0], index = verified.trace.indexOf(trace);
    result.set(entry.occurrenceId, { trace, node: verified.parsed.nodes[index] });
  }
  return result;
}

function hasTraceIdentityDefect(verified) {
  return verified.duplicateGroups.length > 0 || verified.trace.some((row) => !text(row?.occurrenceId))
    || verified.issues.some((row) => ['TRACE_CARDINALITY_MISMATCH', 'TRACE_IDENTITY_MISMATCH'].includes(row.code));
}

function uniqueIndex(rows, field) {
  const result = new Map(), duplicates = new Set();
  for (const row of rows) {
    const key = text(row?.[field]);
    if (!key || result.has(key)) duplicates.add(key); else result.set(key, row);
  }
  for (const key of duplicates) result.delete(key);
  return result;
}

function uniqueBranchPairs(plan) {
  const pairs = new Map();
  for (const row of array(plan?.occurrences)) {
    const pair = { sourceBranch: text(row?.sourceBranch), canonicalMainLine: text(row?.canonicalMainLine) };
    pairs.set(`${pair.canonicalMainLine}\u0000${pair.sourceBranch}`, pair);
  }
  return [...pairs.values()].sort((a, b) => canonicalSemanticJson(a).localeCompare(canonicalSemanticJson(b)));
}

function branchIndex(branches) {
  const result = new Map();
  for (const branch of branches) if (!result.has(branch.branchName)) result.set(branch.branchName, branch);
  return result;
}

function addDifference(state, dimension, code, key, canonical = null, sequential = null, evidence = {}) {
  state.differences.push({ dimension, code, key: text(key), canonical, sequential, evidence });
}

function dimensionFor(code) { return code.replace(/_MISMATCH$|_NOT_PASS$/, ''); }
function rowSide(verified) { return text(verified?.bundle?.projectionKind) || 'UNKNOWN'; }
function percentage(value, total) { return total === 0 ? 100 : Math.floor((value / total) * 100); }
function allSame(values) { return values.every((value) => canonicalSemanticJson(value ?? null) === canonicalSemanticJson(values[0] ?? null)); }
function sameArray(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
