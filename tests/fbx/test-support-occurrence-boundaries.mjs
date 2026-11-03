import assert from 'node:assert/strict';
import { collectSupportRecords } from '../../tabs/model-converters/converters/fbx/benchmark/support-records.js';
import { loadedBenchmarkFixture } from './support-benchmark-fixtures.mjs';

const valid = loadedBenchmarkFixture();
assert.equal((await collectSupportRecords(valid)).length, 3);

const omitted = structuredClone(valid);
const omittedRecord = omitted.occurrences.pop();
delete omitted.occurrenceById[omittedRecord.occurrenceId];
await assert.rejects(
  () => collectSupportRecords(omitted),
  /do not exactly cover branch records and children/,
);

const forged = structuredClone(valid);
const child = forged.occurrences.find((item) => item.childIndex === 0);
delete forged.occurrenceById[child.occurrenceId];
child.occurrenceId = 'branch:0/child:999';
forged.occurrenceById[child.occurrenceId] = child;
await assert.rejects(
  () => collectSupportRecords(forged),
  /not a valid Agent E child occurrence/,
);

const reordered = Object.freeze({
  ...valid,
  occurrences: Object.freeze([...valid.occurrences].reverse()),
});
assert.deepEqual(
  (await collectSupportRecords(reordered)).map((item) => item.recordId),
  (await collectSupportRecords(valid)).map((item) => item.recordId),
);

console.log('test-support-occurrence-boundaries: PASS');
