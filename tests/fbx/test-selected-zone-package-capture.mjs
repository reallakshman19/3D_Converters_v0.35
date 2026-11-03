import assert from 'node:assert/strict';
import {
  extractMappedEngineeringAttributeLedger,
  extractMappedStagedBranches,
} from '../../tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-output.js';

const ledger = { schema: 'FbxEngineeringAttributeLedger.v1', status: 'PASS', components: [] };
const result = {
  conversionStatus: 'STAGEDJSON_PASS',
  outputs: [
    { name: 'model.staged.json', text: JSON.stringify([{ type: 'BRANCH', children: [] }]) },
    { name: 'model.FbxEngineeringAttributeLedger.v1.json', text: JSON.stringify(ledger) },
  ],
};
assert.equal(extractMappedStagedBranches(result).status, 'MAPPED_STAGE_AVAILABLE');
assert.equal(extractMappedEngineeringAttributeLedger(result).status,
  'ENGINEERING_ATTRIBUTE_LEDGER_AVAILABLE');
assert.deepEqual(extractMappedEngineeringAttributeLedger(result).ledger, ledger);
const missing = extractMappedEngineeringAttributeLedger({ conversionStatus: 'STAGEDJSON_PASS', outputs: [] });
assert.equal(missing.status, 'ENGINEERING_ATTRIBUTE_LEDGER_MISSING');
const invalid = extractMappedEngineeringAttributeLedger({
  conversionStatus: 'STAGEDJSON_PASS',
  outputs: [{ name: 'model.FbxEngineeringAttributeLedger.v1.json', text: '{}' }],
});
assert.equal(invalid.status, 'ENGINEERING_ATTRIBUTE_LEDGER_INVALID');
console.log('test-selected-zone-package-capture: PASS');
