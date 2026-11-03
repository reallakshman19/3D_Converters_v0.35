import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { canonicalSemanticJson, computeSemanticHash } from '../contracts/topo-enriched-xml/contract-core.js';
import { PSISERIALIZATIONPLAN_V1 } from '../contracts/topo-enriched-xml/contracts.js';
import { buildPsiWriterOccurrencePlan } from '../tabs/stagedjson-to-enrichxml/psi-writer-occurrence-planner.js';
import {
  buildPsiSerializationPlan,
  computeSerializationPlanHash,
} from '../tabs/stagedjson-to-enrichxml/psi-serialization-plan.js';
import { buildTopoEnrichedXml } from '../tabs/stagedjson-to-enrichxml/topo-enriched-xml-writer.js';

const fixture = JSON.parse(readFileSync(new URL(
  './fixtures/topo-enriched-xml/strict-serializer/component-matrix.json', import.meta.url,
), 'utf8'));
const productionFiles = [
  '../tabs/stagedjson-to-enrichxml/psi-serialization-plan.js',
  '../tabs/stagedjson-to-enrichxml/psi-strict-node-projector.js',
  '../tabs/stagedjson-to-enrichxml/topo-enriched-xml-writer.js',
];

async function makeArtifacts() {
  const data = structuredClone(fixture);
  const sequencePlanHash = await computeSemanticHash(data.sequencePlan, 'sequencePlanHash');
  const occurrencePlan = await buildPsiWriterOccurrencePlan({
    projectId: data.projectId,
    zoneId: data.zoneId,
    sourceInventoryHash: data.sourceInventoryHash,
    logicalTopologyHash: data.logicalTopologyHash,
    sequencePlanHash,
    sequencePlan: data.sequencePlan,
    records: data.records,
    logicalNodeBySourceEntityId: data.logicalNodeBySourceEntityId,
    evaluatedAt: data.evaluatedAt,
  });
  const nodePlan = await makeNodePlan(data, occurrencePlan);
  const serializationPlan = await buildPsiSerializationPlan({ occurrencePlan, nodePlan });
  const canonical = materializeProjection(data.branchProjectionBlueprints.canonical, occurrencePlan);
  const sequential = materializeProjection(data.branchProjectionBlueprints.sourceSequential, occurrencePlan);
  return { data, occurrencePlan, nodePlan, serializationPlan, canonical, sequential };
}

async function makeNodePlan(data, occurrencePlan) {
  const allocation = new Map(data.explicitAllocations.map((row) => [allocationKey(row), row]));
  const emittedOccurrences = [], reservedOccurrences = [];
  for (const occurrence of occurrencePlan.occurrences) {
    const fixed = allocation.get(allocationKey(occurrence));
    assert.ok(fixed, `missing explicit fixture allocation for ${allocationKey(occurrence)}`);
    const row = {
      occurrenceId: occurrence.occurrenceId,
      logicalNodeId: fixed.logicalNodeId,
      componentProjectionId: occurrence.componentProjectionId,
      engineeringNodeNumber: fixed.engineeringNodeNumber,
      sourceEntityId: occurrence.sourceEntityId,
      sourceBranch: occurrence.sourceBranch,
      canonicalMainLine: occurrence.canonicalMainLine,
      projectionRole: occurrence.projectionRole,
      endpoint: occurrence.endpoint,
      psiComponentType: occurrence.psiComponentType,
    };
    (occurrence.disposition === 'RESERVED' ? reservedOccurrences : emittedOccurrences).push(row);
  }
  const componentProjection = occurrencePlan.componentProjection.map((projection) => {
    const rows = occurrencePlan.occurrences.filter((row) => row.componentProjectionId === projection.componentProjectionId);
    return {
      componentProjectionId: projection.componentProjectionId,
      sourceEntityId: projection.sourceEntityId,
      emittedOccurrenceIds: rows.filter((row) => row.disposition === 'EMITTED').map((row) => row.occurrenceId),
      reservedOccurrenceIds: rows.filter((row) => row.disposition === 'RESERVED').map((row) => row.occurrenceId),
    };
  });
  const logicalNodes = [...new Set(data.explicitAllocations.map((row) => row.logicalNodeId))].map((logicalNodeId) => ({ logicalNodeId }));
  const plan = {
    schema: 'TopoNodePlan.v1',
    projectId: data.projectId,
    zoneId: data.zoneId,
    sourceInventoryHash: data.sourceInventoryHash,
    logicalTopologyHash: data.logicalTopologyHash,
    sequencePlanHash: occurrencePlan.sequencePlanHash,
    baseRegistrySnapshotHash: data.baseRegistrySnapshotHash,
    configHash: data.configHash,
    logicalNodes,
    emittedOccurrences,
    reservedOccurrences,
    rawPortMappings: [],
    componentProjection,
    validation: passValidation(),
  };
  plan.nodePlanHash = await computeSemanticHash(plan, 'nodePlanHash');
  return plan;
}

function materializeProjection(blueprint, occurrencePlan) {
  const bySource = new Map(occurrencePlan.componentProjection.map((row) => [row.sourceEntityId, row.componentProjectionId]));
  const projection = structuredClone(blueprint);
  for (const branch of projection.branches) {
    branch.componentProjectionIds = branch.componentSourceEntityIds.map((id) => bySource.get(id));
    delete branch.componentSourceEntityIds;
  }
  return projection;
}

async function bundle(artifacts, overrides = {}) {
  return buildTopoEnrichedXml({
    occurrencePlan: artifacts.occurrencePlan,
    nodePlan: artifacts.nodePlan,
    serializationPlan: artifacts.serializationPlan,
    branchProjection: artifacts.canonical,
    records: artifacts.data.records,
    config: artifacts.data.config,
    evaluatedAt: artifacts.data.evaluatedAt,
    operatingMode: 'SHADOW',
    profile: 'STRICT_PSI',
    ...overrides,
  });
}

async function rehashNodePlan(nodePlan, mutate) {
  const next = structuredClone(nodePlan);
  mutate(next);
  next.nodePlanHash = await computeSemanticHash(next, 'nodePlanHash');
  return next;
}

function allocationKey(row) { return `${row.sourceEntityId}|${row.projectionRole}`; }
function passValidation() { return { status: 'PASS', blockers: [], reviewItems: [], warnings: [] }; }
function reviewValidation() { return { status: 'REVIEW_REQUIRED', blockers: [], reviewItems: [{ code: 'FIXTURE_REVIEW', evidence: {} }], warnings: [] }; }
function blockedValidation() { return { status: 'BLOCKED', blockers: [{ code: 'FIXTURE_BLOCK', evidence: {} }], reviewItems: [], warnings: [] }; }
function codes(value) { return value.validation.blockers.map((row) => row.code); }
function occurrenceMap(plan) { return new Map(plan.occurrences.map((row) => [row.occurrenceId, row.engineeringNodeNumber])); }
function emitted(plan) { return plan.occurrences.filter((row) => row.disposition === 'EMITTED'); }
function reserved(plan) { return plan.occurrences.filter((row) => row.disposition === 'RESERVED'); }
function xmlNodes(xml) {
  return [...xml.matchAll(/<Node>\n([\s\S]*?)\n<\/Node>/g)].map((match) => ({
    number: Number(match[1].match(/<NodeNumber>(\d+)<\/NodeNumber>/)?.[1]),
    type: match[1].match(/<ComponentType>([^<]+)<\/ComponentType>/)?.[1],
    endpoint: match[1].match(/<Endpoint>([^<]+)<\/Endpoint>/)?.[1],
    body: match[1],
  }));
}
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
}
async function shaText(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
async function shaSemantic(value) { return shaText(canonicalSemanticJson(value)); }
function bundleSemantic(value) {
  const keys = ['schema', 'operatingMode', 'profile', 'evaluatedAt', 'projectId', 'zoneId', 'nodePlanHash', 'occurrencePlanHash', 'serializationPlanHash', 'branchProjectionId', 'projectionKind', 'xmlHash', 'traceHash'];
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

// A — serialization plan validity and immutability.
test('builds a valid immutable serialization plan with exact emitted and reserved coverage', async () => {
  const a = await makeArtifacts();
  assert.deepEqual(PSISERIALIZATIONPLAN_V1.validate(a.serializationPlan), []);
  assert.equal(a.serializationPlan.projectId, a.occurrencePlan.projectId);
  assert.equal(a.serializationPlan.nodePlanHash, a.nodePlan.nodePlanHash);
  assert.equal(a.serializationPlan.occurrencePlanHash, a.occurrencePlan.occurrencePlanHash);
  assert.deepEqual(a.serializationPlan.occurrences.map((row) => row.occurrenceId), a.occurrencePlan.occurrences.map((row) => row.occurrenceId));
  assert.ok(a.serializationPlan.occurrences.every((row) => Number.isInteger(row.engineeringNodeNumber)));
  assert.equal(emitted(a.serializationPlan).length, emitted(a.occurrencePlan).length);
  assert.equal(reserved(a.serializationPlan).length, reserved(a.occurrencePlan).length);
  assert.equal(Object.isFrozen(a.serializationPlan), true);
  assert.ok(a.serializationPlan.occurrences.every(Object.isFrozen));
  assert.equal(await computeSerializationPlanHash(a.serializationPlan), a.serializationPlan.serializationPlanHash);
});

// B, G and engineering-content checks.
test('serializes the complete strict component matrix and never emits reserved occurrences', async () => {
  const a = await makeArtifacts();
  const result = await bundle(a);
  const nodes = xmlNodes(result.xmlText);
  assert.equal(result.validation.status, 'PASS');
  assert.equal(result.generated, true);
  assert.equal(result.selectable, false);
  assert.equal(nodes.length, emitted(a.serializationPlan).length);
  assert.equal(result.trace.length, nodes.length);
  assert.deepEqual(nodes.map((row) => row.number), result.trace.map((row) => row.engineeringNodeNumber));
  assert.deepEqual(nodes.map((row) => row.type), result.trace.map((row) => row.psiComponentType));
  assert.ok(reserved(a.serializationPlan).every((row) => !result.trace.some((trace) => trace.occurrenceId === row.occurrenceId)));
  assert.match(result.xmlText, /<BendRadius>152\.4<\/BendRadius>/);
  assert.match(result.xmlText, /<BendType>0<\/BendType>/);
  assert.match(result.xmlText, /<AlphaAngle>7\.5<\/AlphaAngle>/);
  assert.match(result.xmlText, /<Restraint>/);
  assert.match(result.xmlText, /<DTXR_PS>PS-/);
  assert.ok(nodes.some((row) => row.type === 'VALV'));
  assert.ok(nodes.some((row) => row.type === 'FLAN'));
  for (const extension of ['OccurrenceId', 'LogicalNodeId', 'NodePlanHash', 'TopologyIndex', 'Registry']) assert.doesNotMatch(result.xmlText, new RegExp(`<${extension}`));
});

// C — missing, duplicate, extra and ownership coverage.
test('blocks missing, duplicate, extra, wrong-kind and ownership coverage defects', async () => {
  const base = await makeArtifacts();
  const cases = [
    [async () => rehashNodePlan(base.nodePlan, (p) => p.emittedOccurrences.shift()), 'EMITTED_OCCURRENCE_ALLOCATION_MISSING'],
    [async () => rehashNodePlan(base.nodePlan, (p) => p.reservedOccurrences.shift()), 'RESERVED_OCCURRENCE_ALLOCATION_MISSING'],
    [async () => rehashNodePlan(base.nodePlan, (p) => p.emittedOccurrences.push(structuredClone(p.emittedOccurrences[0]))), 'DUPLICATE_OCCURRENCE_ALLOCATION'],
    [async () => rehashNodePlan(base.nodePlan, (p) => p.emittedOccurrences.push({ ...structuredClone(p.emittedOccurrences[0]), occurrenceId: 'WO-UNKNOWN' })), 'UNPLANNED_ALLOCATION'],
    [async () => rehashNodePlan(base.nodePlan, (p) => p.reservedOccurrences.push(p.emittedOccurrences.shift())), 'OCCURRENCE_DISPOSITION_MISMATCH'],
    [async () => rehashNodePlan(base.nodePlan, (p) => p.componentProjection[0].emittedOccurrenceIds = []), 'COMPONENT_PROJECTION_COVERAGE_MISMATCH'],
    [async () => rehashNodePlan(base.nodePlan, (p) => p.componentProjection[1].emittedOccurrenceIds.push(p.componentProjection[0].emittedOccurrenceIds[0])), 'COMPONENT_PROJECTION_COVERAGE_MISMATCH'],
  ];
  for (const [make, code] of cases) {
    const nodePlan = await make();
    const result = await bundle(base, { nodePlan, serializationPlan: null });
    assert.equal(result.generated, false, code);
    assert.ok(codes(result).includes(code), `${code}: ${codes(result)}`);
  }
  const extraRecord = await bundle(base, { records: [...base.data.records, { sourceEntityId: 'EXTRA', componentType: 'PIPE' }] });
  assert.ok(codes(extraRecord).includes('SOURCE_RECORD_UNPLANNED'));
  const missingRecord = await bundle(base, { records: base.data.records.slice(1) });
  assert.ok(codes(missingRecord).includes('SOURCE_RECORD_MISSING'));
  const duplicateRecords = structuredClone(base.data.records);
  duplicateRecords.push(structuredClone(duplicateRecords[0]));
  const duplicateRecord = await bundle(base, { records: duplicateRecords });
  assert.ok(codes(duplicateRecord).includes('SOURCE_RECORD_DUPLICATE'));
});

// D — hash integrity and supplied-plan verification.
test('blocks stale occurrence, node and serialization hashes plus root-chain drift', async () => {
  const a = await makeArtifacts();
  const staleOccurrence = structuredClone(a.occurrencePlan);
  staleOccurrence.occurrencePlanHash = 'sha256:stale';
  const r1 = await bundle(a, { occurrencePlan: staleOccurrence, serializationPlan: null });
  assert.ok(codes(r1).includes('OCCURRENCE_PLAN_HASH_MISMATCH'));

  const staleNode = structuredClone(a.nodePlan);
  staleNode.nodePlanHash = 'sha256:stale';
  const r2 = await bundle(a, { nodePlan: staleNode, serializationPlan: null });
  assert.ok(codes(r2).includes('NODE_PLAN_HASH_MISMATCH'));

  const staleSerialization = structuredClone(a.serializationPlan);
  staleSerialization.serializationPlanHash = 'sha256:stale';
  const r3 = await bundle(a, { serializationPlan: staleSerialization });
  assert.ok(codes(r3).includes('SERIALIZATION_PLAN_HASH_MISMATCH'));

  const chainNode = await rehashNodePlan(a.nodePlan, (p) => { p.projectId = 'OTHER'; });
  const r4 = await bundle(a, { nodePlan: chainNode, serializationPlan: null });
  assert.ok(codes(r4).includes('PLAN_ROOT_CHAIN_MISMATCH'));

  const missingOccurrence = await bundle(a, { occurrencePlan: null, serializationPlan: null });
  assert.ok(codes(missingOccurrence).includes('OCCURRENCE_PLAN_MISSING'));
  const missingNode = await bundle(a, { nodePlan: null, serializationPlan: null });
  assert.ok(codes(missingNode).includes('NODE_PLAN_MISSING'));
});

// E — semantic contradictions.
test('blocks projection, logical-node, endpoint, PSI type and source-type contradictions', async () => {
  const a = await makeArtifacts();
  const mutations = [
    [(p) => { p.emittedOccurrences[0].componentProjectionId = 'CP-OTHER'; }, 'COMPONENT_PROJECTION_MISMATCH'],
    [(p) => { p.emittedOccurrences[0].logicalNodeId = 'LN-OTHER'; p.logicalNodes.push({ logicalNodeId: 'LN-OTHER' }); }, 'LOGICAL_NODE_ID_MISMATCH'],
    [(p) => { p.emittedOccurrences[0].endpoint = 9; }, 'ENDPOINT_SEMANTICS_MISMATCH'],
    [(p) => { p.emittedOccurrences[0].psiComponentType = 'VALV'; }, 'PSI_COMPONENT_TYPE_MISMATCH'],
  ];
  for (const [mutate, code] of mutations) {
    const nodePlan = await rehashNodePlan(a.nodePlan, mutate);
    const result = await bundle(a, { nodePlan, serializationPlan: null });
    assert.ok(codes(result).includes(code), code);
  }
  const records = structuredClone(a.data.records);
  records[0].componentType = 'VALV';
  const source = await bundle(a, { records });
  assert.ok(codes(source).includes('SOURCE_COMPONENT_TYPE_MISMATCH'));
});

// F — repeated and conflicting engineering numbers.
test('allows repeated numbers only for one explicit logical node', async () => {
  const a = await makeArtifacts();
  const shared = a.serializationPlan.occurrences.filter((row) => row.engineeringNodeNumber === 205);
  assert.equal(shared.length, 2);
  assert.equal(new Set(shared.map((row) => row.logicalNodeId)).size, 1);

  const conflict = await rehashNodePlan(a.nodePlan, (p) => {
    const row = p.emittedOccurrences.find((entry) => entry.engineeringNodeNumber === 205 && entry.logicalNodeId === 'LN-SHARED');
    row.logicalNodeId = 'LN-CONFLICT';
    p.logicalNodes.push({ logicalNodeId: 'LN-CONFLICT' });
  });
  const result = await bundle(a, { nodePlan: conflict, serializationPlan: null });
  assert.ok(codes(result).includes('DUPLICATE_ACTIVE_ZONE_NODE_NUMBER'));

  const different = await rehashNodePlan(a.nodePlan, (p) => {
    const rows = p.emittedOccurrences.filter((entry) => entry.logicalNodeId === 'LN-SHARED');
    rows[1].engineeringNodeNumber = 206;
  });
  const logicalConflict = await bundle(a, { nodePlan: different, serializationPlan: null });
  assert.ok(codes(logicalConflict).includes('LOGICAL_NODE_NUMBER_CONFLICT'));
});

// H — one serialization plan across branch projections.
test('uses identical occurrence allocations for canonical and source-sequential presentation', async () => {
  const a = await makeArtifacts();
  const canonical = await bundle(a, { branchProjection: a.canonical });
  const sequential = await bundle(a, { branchProjection: a.sequential });
  assert.equal(canonical.serializationPlanHash, sequential.serializationPlanHash);
  const plannedNumbers = occurrenceMap(a.serializationPlan);
  assert.equal((canonical.xmlText.match(/<Branch>/g) || []).length, 1);
  assert.equal((sequential.xmlText.match(/<Branch>/g) || []).length, 2);
  const canonicalNumbers = new Map(canonical.trace.map((row) => [row.occurrenceId, row.engineeringNodeNumber]));
  const sequentialNumbers = new Map(sequential.trace.map((row) => [row.occurrenceId, row.engineeringNodeNumber]));
  assert.deepEqual(canonicalNumbers, sequentialNumbers);
  assert.deepEqual(canonicalNumbers, new Map(emitted(a.serializationPlan).map((row) => [row.occurrenceId, row.engineeringNodeNumber])));
  assert.equal(plannedNumbers.size, a.serializationPlan.occurrences.length);
  assert.equal(canonical.trace.length, sequential.trace.length);
});

// I and J — determinism, presentation independence and timestamp rendering.
test('is byte-deterministic and renders the supplied timestamp in UTC', async () => {
  const a = await makeArtifacts();
  const first = await bundle(a);
  const repeat = await bundle(a);
  const shuffled = await bundle(a, { records: structuredClone(a.data.records).reverse() });
  const reordered = await bundle(a, { records: reverseKeys(a.data.records), config: reverseKeys(a.data.config) });
  assert.equal(first.xmlText, repeat.xmlText);
  assert.deepEqual(first.trace, repeat.trace);
  assert.equal(first.bundleHash, repeat.bundleHash);
  assert.equal(first.xmlText, shuffled.xmlText);
  assert.equal(first.xmlHash, reordered.xmlHash);
  assert.match(first.xmlText, /<DateTime>20\/07\/2026, 01:30:45<\/DateTime>/);

  const later = await bundle(a, { evaluatedAt: '2026-07-20T02:30:45+00:00' });
  assert.notEqual(first.xmlHash, later.xmlHash);
  assert.notEqual(first.bundleHash, later.bundleHash);
  assert.equal(first.serializationPlanHash, later.serializationPlanHash);
  assert.deepEqual(
    new Map(first.trace.map((row) => [row.occurrenceId, row.engineeringNodeNumber])),
    new Map(later.trace.map((row) => [row.occurrenceId, row.engineeringNodeNumber])),
  );

  for (const invalid of [undefined, '2026-07-20T01:30:45', 'not-a-date']) {
    const result = await bundle(a, { evaluatedAt: invalid });
    assert.equal(result.generated, false);
    assert.ok(codes(result).includes(invalid === undefined ? 'EVALUATED_AT_MISSING' : 'EVALUATED_AT_INVALID'));
  }
});

// K — no mutation.
test('does not mutate any plan, projection, record or configuration input', async () => {
  const a = await makeArtifacts();
  const input = {
    occurrencePlan: a.occurrencePlan,
    nodePlan: a.nodePlan,
    serializationPlan: a.serializationPlan,
    branchProjection: a.canonical,
    records: a.data.records,
    config: a.data.config,
  };
  const before = structuredClone(input);
  await bundle(a);
  assert.deepEqual(input, before);
  assert.ok(a.data.records.every((row) => !Object.hasOwn(row, 'xmlNodeNum')));
});

// L — trace/XML atomicity and hash coherence.
test('keeps XML, trace and bundle hashes atomically coherent', async () => {
  const a = await makeArtifacts();
  const result = await bundle(a);
  const nodes = xmlNodes(result.xmlText);
  assert.equal(nodes.length, result.trace.length);
  for (const [index, node] of nodes.entries()) {
    assert.equal(node.number, result.trace[index].engineeringNodeNumber);
    assert.equal(node.type, result.trace[index].psiComponentType);
  }
  const tamperedXmlHash = await shaText(result.xmlText.replace('<NodeNumber>', '<NodeNumber>9'));
  const tamperedTrace = structuredClone(result.trace);
  tamperedTrace[0].engineeringNodeNumber += 1;
  const tamperedTraceHash = await shaSemantic(tamperedTrace);
  assert.notEqual(tamperedXmlHash, result.xmlHash);
  assert.notEqual(tamperedTraceHash, result.traceHash);
  assert.notEqual(await shaSemantic(bundleSemantic({ ...result, xmlHash: tamperedXmlHash })), result.bundleHash);
  assert.notEqual(await shaSemantic(bundleSemantic({ ...result, traceHash: tamperedTraceHash })), result.bundleHash);
});

// M and N — mode/profile behavior.
test('enforces strict operating-mode and profile behavior without legacy fallback', async () => {
  const a = await makeArtifacts();
  const reviewOccurrence = structuredClone(a.occurrencePlan);
  reviewOccurrence.validation = reviewValidation();
  const reviewPlan = await buildPsiSerializationPlan({ occurrencePlan: reviewOccurrence, nodePlan: a.nodePlan });
  const blockedNode = structuredClone(a.nodePlan);
  blockedNode.validation = blockedValidation();

  const shadowPass = await bundle(a, { operatingMode: 'SHADOW' });
  const shadowReview = await bundle(a, { operatingMode: 'SHADOW', occurrencePlan: reviewOccurrence, serializationPlan: reviewPlan });
  const reviewPass = await bundle(a, { operatingMode: 'REVIEW' });
  const reviewReview = await bundle(a, { operatingMode: 'REVIEW', occurrencePlan: reviewOccurrence, serializationPlan: reviewPlan });
  const enforcedPass = await bundle(a, { operatingMode: 'ENFORCED' });
  const enforcedReview = await bundle(a, { operatingMode: 'ENFORCED', occurrencePlan: reviewOccurrence, serializationPlan: reviewPlan });
  const enforcedBlocked = await bundle(a, { operatingMode: 'ENFORCED', nodePlan: blockedNode, serializationPlan: null });
  const legacy = await bundle(a, { operatingMode: 'LEGACY' });
  const audit = await bundle(a, { profile: 'AUDIT_EXTENDED', serializationPlan: null });
  const unsupported = await bundle(a, { profile: 'UNKNOWN', serializationPlan: null });

  assert.deepEqual([shadowPass.generated, shadowPass.selectable], [true, false]);
  assert.deepEqual([shadowReview.generated, shadowReview.selectable, shadowReview.validation.status], [true, false, 'REVIEW_REQUIRED']);
  assert.deepEqual([reviewPass.generated, reviewPass.selectable], [true, false]);
  assert.deepEqual([reviewReview.generated, reviewReview.selectable], [true, false]);
  assert.deepEqual([enforcedPass.generated, enforcedPass.selectable], [true, true]);
  assert.deepEqual([enforcedReview.generated, enforcedReview.selectable], [false, false]);
  assert.ok(codes(enforcedReview).includes('ENFORCED_REVIEW_NOT_ALLOWED'));
  assert.deepEqual([enforcedBlocked.generated, enforcedBlocked.selectable], [false, false]);
  assert.deepEqual([legacy.generated, legacy.selectable], [false, false]);
  assert.ok(codes(legacy).includes('STRICT_LEGACY_FALLBACK_PROHIBITED'));
  assert.equal(audit.generated, false);
  assert.ok(codes(audit).includes('AUDIT_EXTENDED_PROFILE_NOT_APPROVED'));
  assert.equal(unsupported.generated, false);
  assert.ok(codes(unsupported).includes('STRICT_PROFILE_REQUIRED'));
});

// Branch projection contract and drift prevention.
test('blocks invalid, incomplete, duplicate and number-bearing branch projections', async () => {
  const a = await makeArtifacts();
  const missing = await bundle(a, { branchProjection: null });
  assert.ok(codes(missing).includes('BRANCH_PROJECTION_MISSING'));

  const incomplete = structuredClone(a.canonical);
  incomplete.branches[0].componentProjectionIds.pop();
  assert.ok(codes(await bundle(a, { branchProjection: incomplete })).includes('BRANCH_PROJECTION_COVERAGE_MISMATCH'));

  const duplicate = structuredClone(a.canonical);
  duplicate.branches[0].componentProjectionIds.push(duplicate.branches[0].componentProjectionIds[0]);
  assert.ok(codes(await bundle(a, { branchProjection: duplicate })).includes('BRANCH_PROJECTION_COVERAGE_MISMATCH'));

  const invalid = structuredClone(a.canonical);
  invalid.schema = 'OtherProjection.v1';
  assert.ok(codes(await bundle(a, { branchProjection: invalid })).includes('BRANCH_PROJECTION_INVALID'));

  const drift = structuredClone(a.canonical);
  drift.branches[0].engineeringNodeNumber = 999;
  assert.ok(codes(await bundle(a, { branchProjection: drift })).includes('BRANCH_PROJECTION_ALLOCATION_DRIFT'));
});

// O — executable-source authority scan.
test('contains no counters, relative allocation, mutation, wall-clock or legacy-writer authority', () => {
  const forbidden = [
    /nodeCounter/, /startNodeNumber/, /numberingSpan/, /allocationStart/, /baseNodeNumber/,
    /numberOffset/, /nodeOffset/, /derivedFromOccurrenceId/, /record\.xmlNodeNum\s*=/,
    /new\s+Date\s*\(/, /Date\.now\s*\(/, /buildEnrichedXml\s*\(/,
    /projectBoundaryNodeContract\s*\(/, /\+\s*10\b/, /\+=\s*10\b/, /\*\s*10\b/,
  ];
  for (const relative of productionFiles) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${relative}: ${pattern}`);
  }
});
