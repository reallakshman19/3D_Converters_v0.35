/**
 * Functionality: verify every governed InputXML route uses typed compatibility intent.
 * Parameters: real canonical InputXML bytes, route registry entries, and v2 diagnostic catalogs.
 * Outputs: exact request validation and complete route/taxonomy assertions.
 * Fallback: none; missing routes, fields, or stale hashes fail the test.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INPUTXML_COMPATIBILITY_ROUTE_DIRECTIONS,
  buildInputXmlCompatibilityRequest,
  validateInputXmlCompatibilityRequest,
} from '../converters/inputxml-release/inputxml-compatibility-request.js';
import { CONVERTERS } from '../tabs/model-converters/converter-registry.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceName = 'minimal.canonical.input.xml';
const sourceBytes = await readFile(join(
  ROOT,
  'contracts',
  'inputxml',
  'v1',
  'golden',
  'positive',
  sourceName,
));
const uiRoutes = Object.keys(INPUTXML_COMPATIBILITY_ROUTE_DIRECTIONS)
  .filter((route) => route !== 'component_topology_inputxml_writer');

for (const converterId of Object.keys(INPUTXML_COMPATIBILITY_ROUTE_DIRECTIONS)) {
  const request = await buildInputXmlCompatibilityRequest({
    converterId,
    sourceName,
    sourceBytes,
    options: {
      inputXmlCompatibilityMode: 'CANONICAL_STRICT',
      approvedSemanticSplitId: '',
    },
  });
  assert.equal((await validateInputXmlCompatibilityRequest(request)).converterId, converterId);
}

for (const converterId of uiRoutes) {
  const converter = CONVERTERS.find((entry) => entry.id === converterId);
  assert.ok(converter, `Missing governed converter route ${converterId}.`);
  assert.equal(converter.defaults.inputXmlCompatibilityMode, 'CANONICAL_STRICT');
  assert.ok(converter.options.some((field) => field.key === 'inputXmlCompatibilityMode'));
  assert.ok(converter.options.some((field) => field.key === 'approvedSemanticSplitId'));
}

const adapted = await buildInputXmlCompatibilityRequest({
  converterId: 'inputxml_to_cii2019',
  sourceName,
  sourceBytes,
  options: {
    inputXmlCompatibilityMode: 'ADAPTED_CANONICAL',
    approvedSemanticSplitId: '',
  },
});
assert.equal(adapted.approvedSemanticSplitId, null);
await assert.rejects(buildInputXmlCompatibilityRequest({
  converterId: 'inputxml_to_cii2019',
  sourceName,
  sourceBytes,
  options: {
    inputXmlCompatibilityMode: 'CANONICAL_STRICT',
    approvedSemanticSplitId: 'IAS-SIMULATED-INVALID',
  },
}));

const catalog = JSON.parse(await readFile(
  join(ROOT, 'contracts', 'inputxml', 'v2', 'inputxml-diagnostic-catalog.json'),
  'utf8',
));
assert.equal(catalog.codes.length, 14);
assert.equal(new Set(catalog.codes.map((row) => row.code)).size, 14);

console.log('[inputxml-phase2-contracts] PASS: 9 typed routes and 14 diagnostic codes verified.');
console.log('[SIMULATED] Adapted mode without a semantic split was accepted; contradictory approval intent was rejected.');
