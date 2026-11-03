import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  BUNDLED_MASTER_URLS,
  loadBundledAivMasterDatabase,
} from '../converters/vibration/aiv/aiv-master-db-bundled.js';
import {
  AIV_MASTER_DB_REFERENCE,
  calculateAivGitBlobSha1,
} from '../converters/vibration/aiv/aiv-master-db-reference.js';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

function exactArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function fileFetch(url) {
  const bytes = fs.readFileSync(url);
  return Object.freeze({
    ok: true,
    status: 200,
    arrayBuffer: async () => exactArrayBuffer(bytes),
  });
}

test('all bundled AIV master assets are byte-identical to the pinned Advanced_Analysis Git blobs', async () => {
  assert.deepEqual(Object.keys(BUNDLED_MASTER_URLS).sort(), Object.keys(AIV_MASTER_DB_REFERENCE.files).sort());
  for (const [filename, url] of Object.entries(BUNDLED_MASTER_URLS)) {
    const bytes = fs.readFileSync(url);
    assert.equal(
      await calculateAivGitBlobSha1(bytes),
      AIV_MASTER_DB_REFERENCE.files[filename],
      `${filename} drifted from the approved source blob`,
    );
  }
});

test('bundled AIV master auto-loader verifies, parses and exposes the controlled row counts', async () => {
  const db = await loadBundledAivMasterDatabase({ fetchImpl: fileFetch });
  assert.equal(db.status, 'PIN_VERIFIED_STRUCTURALLY_VALID');
  assert.deepEqual(db.rowCounts, {
    documents: 15,
    units: 27,
    materials: 17,
    components: 20,
    sourceDevices: 11,
    pipeDimensions: 137,
    pipingClasses: 34,
  });
  assert.equal(db.authority.screeningAuthorityConferred, false);
  assert.equal(db.authority.designAuthority, false);
});
