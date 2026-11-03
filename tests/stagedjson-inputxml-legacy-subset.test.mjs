import assert from 'node:assert/strict';
import fs from 'node:fs';

import { run } from '../tabs/model-converters/converters/stagedjson-to-inputxml.js';

const sourcePath = new URL('../Benchmarks/1885Sjson/Sjson.json', import.meta.url);
const sourceBuffer = fs.readFileSync(sourcePath);
const bytes = sourceBuffer.buffer.slice(
  sourceBuffer.byteOffset,
  sourceBuffer.byteOffset + sourceBuffer.byteLength,
);

const result = await run({
  converterId: 'stagedjson_to_inputxml',
  inputFiles: [{ role: 'primary', name: 'Sjson.json', bytes }],
  options: {},
  workerRunner: {
    async runJob(job) {
      structuredClone(job, { transfer: [job.inputFiles[0].bytes] });
      return { outputs: [{ name: 'Sjson_stagedjson_to_inputxml.xml', text: '<CAESARII />' }] };
    },
  },
});

assert.equal(bytes.byteLength, 0, 'test worker must detach the transferred benchmark buffer');
assert(result.outputs.some((output) => output.name === 'Sjson_stagedjson_to_inputxml.xml'));
assert(!result.outputs.some((output) => output.name.endsWith('.topology.input.xml')));
const issueOutput = result.outputs.find((output) => output.name === 'Sjson.topology-build-issues.json');
assert(issueOutput, 'incomplete legacy subsets must return an explicit topology issue artifact');
const issueReport = JSON.parse(issueOutput.text);
assert.equal(issueReport.outputReady, false);
assert.equal(issueReport.buildIssues.filter((issue) => issue.code === 'CREF_TARGET_UNRESOLVED').length, 8);

console.log('legacy staged JSON subset conversion regression passed.');
