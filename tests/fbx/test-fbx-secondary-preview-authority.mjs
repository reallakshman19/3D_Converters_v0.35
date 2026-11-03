import assert from 'node:assert/strict';
import {
  configureManagedReferenceInputs,
  FBX_REVIEW_UI_BUILD,
} from '../../tabs/model-converters/fbx-review-ui-addon.js';
import {
  prioritizeFbxSourceGraphOutputs,
} from '../../tabs/model-converters/fbx-live-runner-addon.js';

const converter = {
  primaryAccept: '.fbx,.FBX',
  primaryLabel: 'FBX Input',
  secondaryAccept: '.fbxmap.json,.json,.JSON',
  secondaryLabel: 'Mapping Package, Manifest, or Decision Set (optional)',
  inputs: [
    { role: 'primary', label: 'FBX Input', accept: '.fbx,.FBX', required: true },
    { role: 'secondary', label: 'Mapping JSON', accept: '.json,.JSON', required: false },
  ],
};

configureManagedReferenceInputs(converter);
const primary = converter.inputs.find((input) => input.role === 'primary');
const secondary = converter.inputs.find((input) => input.role === 'secondary');
assert.ok(primary.accept.includes('.zip'));
assert.ok(primary.label.includes('source ZIP'));
assert.equal(primary.required, true);
assert.ok(secondary.accept.includes('.zip'));
assert.ok(secondary.label.includes('managed-stage JSON/ZIP'));
assert.equal(secondary.required, false);
assert.equal(FBX_REVIEW_UI_BUILD, '20260804-fbx-secondary-preview-1');

const selected = { name: 'sample.zone.selected-zone.json', text: '[]' };
const report = { name: 'sample.fbx-conversion-report.json', text: '{}' };
const graph = { name: 'sample.fbx-source-graph.json', text: '{}' };
const prioritized = prioritizeFbxSourceGraphOutputs([selected, report, graph]);
assert.equal(prioritized[0], graph);
assert.deepEqual(prioritized.slice(1), [selected, report]);
assert.deepEqual(prioritizeFbxSourceGraphOutputs([selected, report]), [selected, report]);

console.log('test-fbx-secondary-preview-authority: PASS');
