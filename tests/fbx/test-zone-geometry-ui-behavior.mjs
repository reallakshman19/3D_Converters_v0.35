import assert from 'node:assert/strict';
import {
  bindFbxPrimaryInputInvalidation,
  invalidateFbxZoneGeometryInput,
  isFbxPrimaryInputChange,
} from '../../tabs/model-converters/converters/fbx/zone-geometry/zone-toolbar.js';

function fileTarget({ accept = '', name = null, type = 'file' } = {}) {
  return { type, accept, files: name ? [{ name }] : [] };
}

assert.equal(isFbxPrimaryInputChange({ target: fileTarget({ accept: '.fbx', name: 'a.fbx' }) }), true);
assert.equal(isFbxPrimaryInputChange({ target: fileTarget({ accept: '.fbx' }) }), true);
assert.equal(isFbxPrimaryInputChange({ target: fileTarget({ name: 'a.fbx' }) }), true);
assert.equal(isFbxPrimaryInputChange({ target: fileTarget({ accept: '.json', name: 'map.json' }) }), false);
assert.equal(isFbxPrimaryInputChange({ target: fileTarget({ type: 'text', name: 'a.fbx' }) }), false);

const listeners = new Map();
const container = {
  addEventListener(type, listener, capture) { listeners.set(type, { listener, capture }); },
  removeEventListener(type, listener) {
    if (listeners.get(type)?.listener === listener) listeners.delete(type);
  },
};
const received = [];
const dispose = bindFbxPrimaryInputInvalidation(container, (event) => received.push(event));
assert.equal(listeners.get('change').capture, true);
listeners.get('change').listener({ target: fileTarget({ accept: '.json', name: 'mapping.json' }) });
assert.equal(received.length, 0);
const fbxEvent = { target: fileTarget({ accept: '.fbx', name: 'new-source.fbx' }) };
listeners.get('change').listener(fbxEvent);
assert.deepEqual(received, [fbxEvent]);
dispose();
assert.equal(listeners.has('change'), false);

let state = { phase: 'complete', zoneGeometryJson: 'old-zone', derivedPortJson: 'old-ports' };
const invalidations = [];
const controller = {
  select: { value: 'occ:3' },
  project: { previewZones: [{ zoneId: 'occ:3', label: 'Zone A' }], selectedZoneLabel: 'Zone A' },
  graph: { schema: 'FbxSourceGraph.v2' },
  runInput: { sourceName: 'old.fbx', sourceBytes: new Uint8Array([1, 2, 3]) },
  analyse: { disabled: false }, zoneDownload: { disabled: false }, portDownload: { disabled: false },
  analysis: {
    snapshot: () => state,
    invalidate(message) {
      invalidations.push(message);
      state = { phase: 'cancelled', zoneGeometryJson: null, derivedPortJson: null };
    },
  },
};
assert.equal(invalidateFbxZoneGeometryInput(controller), true);
assert.equal(controller.runInput, null);
assert.equal(controller.project, null);
assert.equal(controller.graph, null);
assert.equal(controller.analyse.disabled, true);
assert.equal(controller.zoneDownload.disabled, true);
assert.equal(controller.portDownload.disabled, true);
assert.equal(state.zoneGeometryJson, null);
assert.equal(state.derivedPortJson, null);
assert.deepEqual(invalidations, ['A new FBX input was loaded; prior analysis was cleared.']);
assert.equal(invalidateFbxZoneGeometryInput(null), false);

console.log('test-zone-geometry-ui-behavior: PASS');
