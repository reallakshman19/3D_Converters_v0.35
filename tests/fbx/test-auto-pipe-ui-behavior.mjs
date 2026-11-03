import assert from 'node:assert/strict';
import {
  extractFbxAutoPipeRun, extractFbxStagedRun,
} from '../../tabs/model-converters/fbx-preview-zone-selector.js';

const branches = [{ type: 'BRANCH', id: 'B1', children: [] }];
const output = { name: 'model.zone.auto-pipe.staged.json', text: JSON.stringify(branches) };
const external = extractFbxStagedRun({ conversionStatus: 'STAGEDJSON_PASS', outputs: [output] });
assert.deepEqual(external.branches, branches);
assert.equal(external.outputName, output.name);
const internal = extractFbxAutoPipeRun({
  conversionStatus: 'STAGEDJSON_PASS', zoneId: 'zone:1', outputs: [output],
});
assert.equal(internal.zoneId, 'zone:1');
assert.equal(internal.authority, 'internal-auto-pipe');
assert.deepEqual(internal.branches, branches);
assert.equal(extractFbxAutoPipeRun({
  conversionStatus: 'STAGEDJSON_PASS', zoneId: '', outputs: [output],
}), null);
assert.equal(extractFbxAutoPipeRun({
  conversionStatus: 'BLOCKED_AUTO_PIPE_CLASSIFICATION', zoneId: 'zone:1', outputs: [output],
}), null);
assert.equal(extractFbxStagedRun({
  conversionStatus: 'STAGEDJSON_PASS', outputs: [{ ...output, text: 'not-json' }],
}), null);
console.log('PASS test-auto-pipe-ui-behavior');
