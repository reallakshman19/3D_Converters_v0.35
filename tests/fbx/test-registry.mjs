import assert from 'node:assert/strict';
import { getConverterById } from '../../tabs/model-converters/converter-registry.js';

const converter = getConverterById('fbx_to_stagedjson');
assert.ok(converter);
assert.equal(converter.label, 'FBX -> StagedJSON');
assert.equal(converter.group, '3D Models');
assert.equal(converter.inputs[0].accept, '.fbx,.FBX');
assert.match(converter.inputs[1].accept, /fbxmap/);
assert.equal(typeof converter.run, 'function');
console.log('test-registry: PASS');
