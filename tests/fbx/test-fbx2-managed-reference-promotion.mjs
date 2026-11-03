import assert from 'node:assert/strict';
import {
  isSupersededMappingOutput, managedReferenceBindingOutput,
  promoteSelectedZoneReport, selectedZonePromotionLogs,
} from '../../tabs/model-converters/converters/fbx/selected-zone-promotion.js';

const reportOutput = {
  name: 'model.fbx-conversion-report.json',
  text: JSON.stringify({ status: 'BLOCKED_MAPPING', diagnostics: [
    'BLOCKED_MAPPING',
    'Mapping manifest is absent. StagedJSON conversion skipped. FBX Source Graph extracted successfully.',
    'PARSE_PASS',
  ] }),
};
const promoted = JSON.parse(promoteSelectedZoneReport(
  reportOutput, 'STAGEDJSON_SELECTED_ZONE_PASS', ['SELECTED_ZONE_AUTO_PIPE_PASS'],
).text);
assert.equal(promoted.status, 'STAGEDJSON_SELECTED_ZONE_PASS');
assert.equal(promoted.diagnostics.includes('BLOCKED_MAPPING'), false);
assert.equal(promoted.diagnostics.some((item) => item.startsWith('Mapping manifest is absent.')), false);
assert.equal(promoted.diagnostics.includes('SELECTED_ZONE_AUTO_PIPE_PASS'), true);

const logs = selectedZonePromotionLogs({ logs: {
  stdout: ['PARSE_PASS', 'WORKLIST_GENERATED', 'DRAFT_DECISIONS_GENERATED'],
  stderr: ['Mapping manifest is absent. StagedJSON conversion skipped. FBX Source Graph extracted successfully.'],
} }, ['STAGEDJSON_SELECTED_ZONE_PASS'], []);
assert.equal(logs.stdout.includes('WORKLIST_GENERATED'), false);
assert.equal(logs.stdout.includes('DRAFT_DECISIONS_GENERATED'), false);
assert.deepEqual(logs.stderr, []);
assert.equal(isSupersededMappingOutput({ name: 'x.fbx-mapping-worklist.json' }), true);
assert.equal(isSupersededMappingOutput({ name: 'x.fbx-source-graph.json' }), false);

const binding = managedReferenceBindingOutput({
  primaryName: 'STF.fbx', zoneLabel: '/GLRD-1000-CU-PI-P',
  profile: { profileId: 'P', archiveBound: true, source: {}, managed: {} },
}, 'STAGEDJSON_SELECTED_ZONE_PASS');
assert.equal(binding.length, 1);
const bindingValue = JSON.parse(binding[0].text);
assert.equal(bindingValue.selectedZoneLabel, '/GLRD-1000-CU-PI-P');
assert.equal(bindingValue.executionScope, 'BROWSER_SELECTED_ZONE_REFERENCE');
assert.equal(bindingValue.t0Qualified, false);
console.log('FBX2 managed-reference promotion cleanup: PASS');
