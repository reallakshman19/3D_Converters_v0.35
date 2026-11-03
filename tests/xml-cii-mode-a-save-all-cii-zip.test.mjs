import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  collectModeASuccessfulCiiFiles,
  createModeAStoredZip,
  modeACiiZipFileName,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-cii-zip.js';

function batchResult() {
  return {
    sources: [
      {
        sourceId: 'SRC-A',
        fileName: 'SYS-0014.xml',
        status: 'SUCCEEDED',
        result: { ciiName: 'legacy-a.cii', ciiText: 'CII-A\nLINE-1' },
      },
      {
        sourceId: 'SRC-B',
        fileName: 'SYS-0015.XML',
        status: 'SUCCEEDED',
        result: { ciiName: 'legacy-b.cii', ciiText: 'CII-B\nLINE-2' },
      },
      {
        sourceId: 'SRC-C',
        fileName: 'SYS-FAILED.xml',
        status: 'FAILED',
        result: { ciiText: 'MUST-NOT-BE-IN-ZIP' },
      },
      {
        sourceId: 'SRC-D',
        fileName: 'SYS-BLOCKED.xml',
        status: 'BLOCKED',
        result: null,
      },
    ],
  };
}

test('Save All CII ZIP uses only successful exact batch CII outputs', () => {
  const files = collectModeASuccessfulCiiFiles(batchResult());
  assert.deepEqual(files.map((file) => file.name), ['SYS-0014.cii', 'SYS-0015.cii']);
  assert.deepEqual(files.map((file) => file.content), ['CII-A\nLINE-1', 'CII-B\nLINE-2']);
  assert.equal(files.some((file) => file.content.includes('MUST-NOT-BE-IN-ZIP')), false);
});

test('source filename collisions stay independent with deterministic suffixes', () => {
  const result = {
    sources: [
      { sourceId: '1', fileName: 'SYS-0014.xml', status: 'SUCCEEDED', result: { ciiText: 'A' } },
      { sourceId: '2', fileName: 'SYS-0014.XML', status: 'SUCCEEDED', result: { ciiText: 'B' } },
      { sourceId: '3', fileName: 'SYS:0014.xml', status: 'SUCCEEDED', result: { ciiText: 'C' } },
    ],
  };
  const files = collectModeASuccessfulCiiFiles(result);
  assert.deepEqual(files.map((file) => file.name), ['SYS-0014.cii', 'SYS-0014_2.cii', 'SYS_0014.cii']);
  assert.deepEqual(files.map((file) => file.sourceId), ['1', '2', '3']);
});

test('stored ZIP has valid local/end signatures and contains source-derived CII filenames', () => {
  const files = collectModeASuccessfulCiiFiles(batchResult());
  const zip = createModeAStoredZip(files, new Date(2026, 7, 14, 17, 35, 0));
  assert.ok(zip instanceof Uint8Array);
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...zip.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);
  const decoded = new TextDecoder().decode(zip);
  assert.match(decoded, /SYS-0014\.cii/);
  assert.match(decoded, /SYS-0015\.cii/);
  assert.match(decoded, /CII-A\nLINE-1/);
  assert.match(decoded, /CII-B\nLINE-2/);
  assert.doesNotMatch(decoded, /MUST-NOT-BE-IN-ZIP/);
});

test('ZIP download name is timestamped and Mode A specific', () => {
  assert.equal(
    modeACiiZipFileName(new Date(2026, 7, 14, 17, 35, 3)),
    'XML_CII_ModeA_20260814_173503.zip',
  );
});

test('Mode A run UI exposes Save All CII Files ZIP control', () => {
  const source = fs.readFileSync(
    new URL('../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-events-mode-a-cii-zip.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /Save All CII Files \(\.zip\)/);
  assert.match(source, /data\.modeAAction = 'download-all-cii-zip'/);
  assert.match(source, /successful independent CII model/);
});
