import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { computeSemanticHash } from '../contracts/topo-enriched-xml/contract-core.js';
import { PSIWRITEROCCURRENCEPLAN_V1 } from '../contracts/topo-enriched-xml/contracts.js';
import { buildPsiWriterOccurrencePlan } from '../tabs/stagedjson-to-enrichxml/psi-writer-occurrence-planner.js';

const fixture = JSON.parse(readFileSync(new URL(
  './fixtures/topo-enriched-xml/writer-occurrences/component-matrix.json', import.meta.url,
), 'utf8'));
const forbidden = new Set([
  'engineeringNodeNumber', 'nodeNumber', 'startNodeNumber', 'nodeCounter',
  'numberingSpan', 'baseNodeNumber', 'numberOffset', 'nodeOffset', 'derivedFromOccurrenceId',
]);

const expected = {
  PIPE: ['ARRIVE|1|PIPE|APOS|EMITTED', 'LEAVE|2|PIPE|LPOS|EMITTED'],
  ELBO: ['ARRIVE|0|ELBO|APOS|EMITTED', 'RESERVED_AFTER|RESERVED|ELBO|NONE|RESERVED'],
  BEND: ['ARRIVE|0|ELBO|APOS|EMITTED', 'RESERVED_AFTER|RESERVED|ELBO|NONE|RESERVED'],
  TEE: ['RESERVED_BEFORE|RESERVED|BRAN|NONE|RESERVED', 'BRANCH_LEAVE|1|BRAN|LPOS|EMITTED'],
  OLET: ['ARRIVE|1|OLET|APOS|EMITTED', 'LEAVE|2|OLET|LPOS|EMITTED'],
  REDU: ['RESERVED_BEFORE|RESERVED|REDU|NONE|RESERVED', 'LEAVE|2|REDU|LPOS|EMITTED'],
  REDUCER: ['RESERVED_BEFORE|RESERVED|REDU|NONE|RESERVED', 'LEAVE|2|REDU|LPOS|EMITTED'],
  VALV: ['PRIMARY|1|VALV|BEST|EMITTED'],
  FLAN: ['PRIMARY|1|FLAN|BEST|EMITTED'],
  GASK: ['PRIMARY|1|GASK|BEST|EMITTED'],
  INST: ['PRIMARY|1|VALV|BEST|EMITTED'],
  FBLI: ['PRIMARY|1|FLAN|BEST|EMITTED'],
  ATTA: ['PRIMARY|1|ATTA|BEST|EMITTED'],
  SUPPORT: ['PRIMARY|1|ATTA|BEST|EMITTED'],
  ANCI: ['PRIMARY|1|ATTA|BEST|EMITTED'],
  RIGI: ['PRIMARY|1|RIGI|BEST|EMITTED'],
};

async function makeInput(mutate = () => {}) {
  const data = structuredClone(fixture);
  mutate(data);
  const sequencePlanHash = await computeSemanticHash(data.sequencePlan, 'sequencePlanHash');
  return {
    projectId: data.projectId,
    zoneId: data.zoneId,
    sourceInventoryHash: data.sourceInventoryHash,
    logicalTopologyHash: data.logicalTopologyHash,
    sequencePlanHash,
    sequencePlan: data.sequencePlan,
    records: data.records,
    logicalNodeBySourceEntityId: data.logicalNodeBySourceEntityId,
    evaluatedAt: '2026-07-19T00:00:00Z',
  };
}

function projectionMap(plan) {
  const occurrences = new Map(plan.occurrences.map((row) => [row.occurrenceId, row]));
  return Object.fromEntries(plan.componentProjection.map((projection) => [
    projection.sourceEntityId.replace('SE-', ''),
    projection.occurrenceIds.map((id) => signature(occurrences.get(id))),
  ]));
}

function signature(row) {
  return [row.projectionRole, row.endpoint, row.psiComponentType, row.coordinateRole, row.disposition].join('|');
}
function codes(plan) { return plan.validation.blockers.map((row) => row.code); }
function occurrenceIds(plan) { return plan.occurrences.map((row) => row.occurrenceId); }
function occurrence(plan, sourceEntityId, projectionRole) {
  return plan.occurrences.find((row) => row.sourceEntityId === sourceEntityId && row.projectionRole === projectionRole);
}
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
}
function findForbidden(value, found = []) {
  if (Array.isArray(value)) value.forEach((child) => findForbidden(child, found));
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) found.push(key);
    findForbidden(child, found);
  }
  return found;
}

async function blocked(mutate) {
  return buildPsiWriterOccurrencePlan(await makeInput(mutate));
}

test('implements the exact component matrix with stable IDs and exact ownership', async () => {
  const input = await makeInput();
  const first = await buildPsiWriterOccurrencePlan(input);
  const second = await buildPsiWriterOccurrencePlan(input);
  assert.equal(first.validation.status, 'PASS');
  assert.deepEqual(projectionMap(first), expected);
  assert.deepEqual(first.componentProjection.map((row) => row.sourceEntityId), input.sequencePlan.components.map((row) => row.sourceEntityId));
  assert.deepEqual(occurrenceIds(first), occurrenceIds(second));
  assert.ok(first.occurrences.every((row) => /^(WO)-[a-f0-9]{24}$/.test(row.occurrenceId)));
  assert.ok(first.componentProjection.every((row) => /^(CP)-[a-f0-9]{24}$/.test(row.componentProjectionId)));
  const owned = first.componentProjection.flatMap((row) => row.occurrenceIds);
  assert.equal(new Set(owned).size, first.occurrences.length);
  assert.equal(occurrence(first, 'SE-PIPE', 'ARRIVE').logicalNodeId, 'LN-1');
  assert.equal(occurrence(first, 'SE-ATTA', 'PRIMARY').logicalNodeId, 'LN-2');
});

test('reproduces accepted TE-001 number-free emitted and reserved cardinality', async () => {
  const plan = await buildPsiWriterOccurrencePlan(await makeInput());
  const expectedCounts = {
    PIPE: [2, 0], ELBO: [1, 1], BEND: [1, 1], TEE: [1, 1], OLET: [2, 0],
    REDU: [1, 1], REDUCER: [1, 1], VALV: [1, 0], FLAN: [1, 0], ATTA: [1, 0],
  };
  for (const [type, counts] of Object.entries(expectedCounts)) {
    const projection = plan.componentProjection.find((row) => row.sourceEntityId === `SE-${type}`);
    const rows = plan.occurrences.filter((row) => projection.occurrenceIds.includes(row.occurrenceId));
    assert.deepEqual([rows.filter((row) => row.disposition === 'EMITTED').length, rows.filter((row) => row.disposition === 'RESERVED').length], counts, type);
  }
});

test('is deterministic across record shuffle, object-key order and audit timestamps', async () => {
  const baseInput = await makeInput();
  const base = await buildPsiWriterOccurrencePlan(baseInput);
  const repeat = await buildPsiWriterOccurrencePlan(structuredClone(baseInput));
  const shuffled = await buildPsiWriterOccurrencePlan(await makeInput((data) => data.records.reverse()));
  const reorderedInput = reverseKeys(await makeInput());
  const reordered = await buildPsiWriterOccurrencePlan(reorderedInput);
  const later = await buildPsiWriterOccurrencePlan({ ...baseInput, evaluatedAt: '2099-01-01T00:00:00Z' });
  assert.equal(JSON.stringify(base), JSON.stringify(repeat));
  assert.equal(JSON.stringify(base), JSON.stringify(shuffled));
  assert.deepEqual(occurrenceIds(base), occurrenceIds(reordered));
  assert.equal(base.occurrencePlanHash, reordered.occurrencePlanHash);
  assert.deepEqual(occurrenceIds(base), occurrenceIds(later));
  assert.equal(base.occurrencePlanHash, later.occurrencePlanHash);
});

test('keeps IDs stable while coordinate evidence changes the semantic plan hash', async () => {
  const base = await buildPsiWriterOccurrencePlan(await makeInput());
  const changed = await buildPsiWriterOccurrencePlan(await makeInput((data) => {
    data.records.find((row) => row.sourceEntityId === 'SE-PIPE').attrs.APOS.x = 999;
  }));
  assert.deepEqual(occurrenceIds(base), occurrenceIds(changed));
  assert.notEqual(base.occurrencePlanHash, changed.occurrencePlanHash);
});

test('uses the approved arrive and leave resolver fallback precedence', async () => {
  const arrive = await buildPsiWriterOccurrencePlan(await makeInput((data) => {
    const attrs = data.records.find((row) => row.sourceEntityId === 'SE-PIPE').attrs;
    delete attrs.APOS;
    attrs.HPOS = { x: 101, y: 0, z: 0 };
    attrs.POS = { x: 102, y: 0, z: 0 };
  }));
  const arriveOccurrence = occurrence(arrive, 'SE-PIPE', 'ARRIVE');
  assert.equal(arriveOccurrence.coordinateRole, 'BEST');
  assert.equal(arriveOccurrence.coordinateEvidence.sourceField, 'attrs.HPOS');
  assert.deepEqual(arriveOccurrence.coordinateEvidence.point, { x: 101, y: 0, z: 0 });

  const leave = await buildPsiWriterOccurrencePlan(await makeInput((data) => {
    const attrs = data.records.find((row) => row.sourceEntityId === 'SE-PIPE').attrs;
    delete attrs.LPOS;
    attrs.TPOS = { x: 201, y: 0, z: 0 };
    attrs.POS = { x: 202, y: 0, z: 0 };
  }));
  const leaveOccurrence = occurrence(leave, 'SE-PIPE', 'LEAVE');
  assert.equal(leaveOccurrence.coordinateRole, 'BEST');
  assert.equal(leaveOccurrence.coordinateEvidence.sourceField, 'attrs.TPOS');
  assert.deepEqual(leaveOccurrence.coordinateEvidence.point, { x: 201, y: 0, z: 0 });
});

test('does not mutate inputs and returns a deeply immutable valid contract', async () => {
  const input = await makeInput();
  const before = structuredClone(input);
  const plan = await buildPsiWriterOccurrencePlan(input);
  assert.deepEqual(input, before);
  assert.deepEqual(PSIWRITEROCCURRENCEPLAN_V1.validate(plan), []);
  assert.equal(Object.isFrozen(plan), true);
  assert.ok(plan.occurrences.every(Object.isFrozen));
  assert.ok(plan.componentProjection.every(Object.isFrozen));
  assert.ok(plan.occurrences.every((row) => Object.isFrozen(row.coordinateEvidence)));
  assert.equal(Object.isFrozen(plan.validation.blockers), true);
  assert.deepEqual(findForbidden(plan), []);
  assert.ok(input.records.every((row) => !Object.hasOwn(row, 'xmlNodeNum')));
});

test('blocks missing, blank and duplicate source identities and absent records', async () => {
  const cases = [
    [data => { delete data.records[0].sourceEntityId; }, 'MISSING_SOURCE_ENTITY_ID'],
    [data => { data.records[0].sourceEntityId = ' '; }, 'MISSING_SOURCE_ENTITY_ID'],
    [data => { data.records[1].sourceEntityId = data.records[0].sourceEntityId; }, 'DUPLICATE_SOURCE_ENTITY_ID'],
    [data => { data.records = data.records.slice(1); }, 'MISSING_SEQUENCE_RECORD'],
  ];
  for (const [mutate, code] of cases) {
    const plan = await blocked(mutate);
    assert.equal(plan.validation.status, 'BLOCKED');
    assert.ok(codes(plan).includes(code), code);
  }
});

test('detects duplicate generated identities and contradictory projection ownership', async () => {
  const plan = await blocked((data) => data.sequencePlan.components.push(structuredClone(data.sequencePlan.components[0])));
  assert.ok(codes(plan).includes('DUPLICATE_COMPONENT_PROJECTION_ID'));
  assert.ok(codes(plan).includes('DUPLICATE_OCCURRENCE_ID'));
});

test('blocks blank component semantics and missing emitted coordinates', async () => {
  const blank = await blocked((data) => { data.records[0].componentType = ' '; });
  assert.ok(codes(blank).includes('UNSUPPORTED_COMPONENT_SEMANTICS'));
  for (const type of ['PIPE', 'ELBO', 'TEE', 'REDU', 'ATTA', 'RIGI']) {
    const plan = await blocked((data) => { data.records.find((row) => row.sourceEntityId === `SE-${type}`).attrs = {}; });
    assert.ok(codes(plan).includes('MISSING_EMITTED_COORDINATE'), type);
  }
});

test('blocks sequence-chain and sequence-hash mismatches without allocating', async () => {
  const input = await makeInput();
  const chain = await buildPsiWriterOccurrencePlan({ ...input, projectId: 'OTHER' });
  const hash = await buildPsiWriterOccurrencePlan({ ...input, sequencePlanHash: 'sha256:stale' });
  assert.ok(codes(chain).includes('SEQUENCE_PLAN_CHAIN_MISMATCH'));
  assert.ok(codes(hash).includes('SEQUENCE_PLAN_HASH_MISMATCH'));
  assert.deepEqual(findForbidden(chain), []);
  assert.deepEqual(findForbidden(hash), []);
});
