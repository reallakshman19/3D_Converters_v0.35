import assert from 'node:assert/strict';

import { run } from '../tabs/model-converters/converters/stagedjson-to-inputxml.js';

const sourceText = JSON.stringify([{
  name: '/TEST/B1',
  type: 'BRANCH',
  attributes: {},
  children: [{
    name: 'PIPE =1/1',
    type: 'PIPE',
    attributes: {
      NAME: '=1/1',
      TYPE: 'PIPE',
      OWNER: '/TEST/B1',
      APOS: { x: 0, y: 0, z: 0 },
      LPOS: { x: 1000, y: 0, z: 0 },
      POS: { x: 500, y: 0, z: 0 },
      OUTSIDE_DIAMETER: '114.3mm',
      WALL_THICKNESS: '6.02mm',
    },
  }],
}]);
const encoded = new TextEncoder().encode(sourceText);
const bytes = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);

const result = await run({
  converterId: 'stagedjson_to_inputxml',
  inputFiles: [{ role: 'primary', name: 'fixture.json', bytes }],
  options: {},
  workerRunner: {
    async runJob(job) {
      structuredClone(job, { transfer: [job.inputFiles[0].bytes] });
      return { outputs: [{ name: 'worker.xml', text: '<CAESARII />' }] };
    },
  },
});

assert.equal(bytes.byteLength, 0, 'test worker must detach the transferred source buffer');
const preview = result.outputs.find((output) => output.name === 'fixture_managed_stage_preview.json');
assert.equal(preview?.text, sourceText, 'preview must use source text retained before transfer');
assert(result.outputs.some((output) => output.name === 'worker.xml'), 'worker output must remain available');

console.log('staged JSON worker-transfer regression passed.');
