/**
 * Contract tests for stagedjson-contract.js
 * Verifies that normalizeStagedJson handles all known StagedJson variants.
 */

import assert from 'node:assert/strict';
import { normalizeStagedJson, isStagedJsonEnvelope, STAGEDJSON_CANONICAL_SCHEMA } from '../contracts/stagedjson-contract.js';

// ---- Fixtures ----------------------------------------------------------------

const BRANCH_NODE = { type: 'BRANCH', name: '/TEST/B1', attributes: { HBOR: '20mm' }, children: [] };

const BARE_ARRAY = [BRANCH_NODE];

const HIERARCHY_ENVELOPE = {
  schema: 'inputxml-managed-stage/v1',
  profile: 'AVEVA_JSON_FOR_3D_RVM_VIEWER',
  source: 'test.xml',
  converter: 'INPUTXML->STAGEDJSON',
  generatedAt: '2026-07-15T00:00:00.000Z',
  units: { length: 'mm' },
  stats: { components: 1 },
  audit: { conversionPolicy: 'direct InputXML parse' },
  hierarchy: [BRANCH_NODE],
};

const OBJECTS_ENVELOPE = {
  schema: 'inputxml-managed-stage/v1',
  objects: [BRANCH_NODE],
};

// ---- normalizeStagedJson -----------------------------------------------------

// Case 1: Bare array
{
  const result = normalizeStagedJson(BARE_ARRAY);
  assert.equal(result.envelope, null, 'bare array: envelope should be null');
  assert.deepEqual(result.branches, BARE_ARRAY, 'bare array: branches should equal input');
  console.log('PASS: bare array');
}

// Case 2: Hierarchy envelope
{
  const result = normalizeStagedJson(HIERARCHY_ENVELOPE);
  assert.deepEqual(result.branches, [BRANCH_NODE], 'hierarchy envelope: branches extracted');
  assert.ok(result.envelope, 'hierarchy envelope: envelope is present');
  assert.equal(result.envelope.schema, 'inputxml-managed-stage/v1', 'hierarchy envelope: schema preserved');
  assert.equal(result.envelope.stats?.components, 1, 'hierarchy envelope: stats preserved');
  assert.equal(result.envelope.audit?.conversionPolicy, 'direct InputXML parse', 'hierarchy envelope: audit preserved');
  assert.ok(!('hierarchy' in result.envelope), 'hierarchy envelope: payload key excluded from envelope');
  console.log('PASS: hierarchy envelope');
}

// Case 3: Objects envelope (legacy back-compat)
{
  const result = normalizeStagedJson(OBJECTS_ENVELOPE);
  assert.deepEqual(result.branches, [BRANCH_NODE], 'objects envelope: branches extracted');
  assert.ok(result.envelope, 'objects envelope: envelope is present');
  assert.ok(!('objects' in result.envelope), 'objects envelope: payload key excluded from envelope');
  console.log('PASS: objects envelope (legacy)');
}

// Case 4: Single branch object
{
  const result = normalizeStagedJson(BRANCH_NODE);
  assert.deepEqual(result.branches, [BRANCH_NODE], 'single object: wrapped in array');
  assert.equal(result.envelope, null, 'single object: envelope is null');
  console.log('PASS: single branch object');
}

// Case 5: JSON string (bare array)
{
  const result = normalizeStagedJson(JSON.stringify(BARE_ARRAY));
  assert.deepEqual(result.branches, BARE_ARRAY, 'json string: parsed and normalized');
  console.log('PASS: json string input');
}

// Case 6: JSON string (envelope)
{
  const result = normalizeStagedJson(JSON.stringify(HIERARCHY_ENVELOPE));
  assert.equal(result.branches.length, 1, 'json string envelope: branches extracted');
  assert.ok(result.envelope?.stats, 'json string envelope: metadata preserved');
  console.log('PASS: json string envelope input');
}

// Case 7: Invalid input throws
{
  assert.throws(() => normalizeStagedJson(null), TypeError, 'null throws TypeError');
  assert.throws(() => normalizeStagedJson(42), TypeError, 'number throws TypeError');
  assert.throws(
    () => normalizeStagedJson({ schema: 'unknown/v1', metadata: 'only' }),
    TypeError,
    'unrecognized envelope throws TypeError'
  );
  console.log('PASS: invalid inputs throw TypeError');
}

// ---- isStagedJsonEnvelope ----------------------------------------------------

{
  assert.equal(isStagedJsonEnvelope(HIERARCHY_ENVELOPE), true, 'hierarchy envelope detected');
  assert.equal(isStagedJsonEnvelope(OBJECTS_ENVELOPE), true, 'objects envelope detected');
  assert.equal(isStagedJsonEnvelope(BARE_ARRAY), false, 'bare array not an envelope');
  assert.equal(isStagedJsonEnvelope(BRANCH_NODE), false, 'branch node not an envelope');
  assert.equal(isStagedJsonEnvelope(null), false, 'null not an envelope');
  console.log('PASS: isStagedJsonEnvelope');
}

// ---- Schema constant ---------------------------------------------------------

{
  assert.equal(typeof STAGEDJSON_CANONICAL_SCHEMA, 'string', 'STAGEDJSON_CANONICAL_SCHEMA is a string');
  assert.match(STAGEDJSON_CANONICAL_SCHEMA, /^stagedjson-canonical\/v\d+$/, 'schema follows version pattern');
  console.log('PASS: STAGEDJSON_CANONICAL_SCHEMA');
}

console.log('\nAll stagedjson-contract tests passed.');
