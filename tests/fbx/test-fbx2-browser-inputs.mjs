import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readUniqueZipEntry } from '../../tabs/model-converters/converters/fbx/browser-zip.js';
import {
  bindFbx2BrowserProfile, isManagedStageHierarchy,
  resolveBrowserFbxPrimary, resolveBrowserFbxSecondary,
} from '../../tabs/model-converters/converters/fbx/fbx2-browser-inputs.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; }
function zipEntry(name, input, method = 8) {
  const raw = Buffer.from(input), compressed = method === 8 ? deflateRawSync(raw) : raw;
  const file = Buffer.from(name), crc = crc32(raw);
  const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0x0800), u16(method),
    u16(0), u16(0), u32(crc), u32(compressed.length), u32(raw.length),
    u16(file.length), u16(0), file, compressed]);
  const central = Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800),
    u16(method), u16(0), u16(0), u32(crc), u32(compressed.length), u32(raw.length),
    u16(file.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(0), file]);
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(1), u16(1),
    u32(central.length), u32(local.length), u16(0)]);
  return new Uint8Array(Buffer.concat([local, central, eocd]));
}

const fbxBytes = new TextEncoder().encode('Kaydara FBX Binary  TEST');
const fbxZip = zipEntry('folder/model.fbx', fbxBytes);
const primary = await resolveBrowserFbxPrimary({ name: 'model.zip', bytes: fbxZip });
assert.equal(primary.name, 'model.fbx');
assert.deepEqual([...primary.bytes], [...fbxBytes]);

const managed = [{ type: 'BRANCH', name: '/A', children: [{ type: 'PIPE' }] }];
assert.equal(isManagedStageHierarchy(managed), true);
const managedBytes = new TextEncoder().encode(JSON.stringify(managed));
const managedZip = zipEntry('ATTRIBUTE_managed_stage.json', managedBytes, 0);
const secondary = await resolveBrowserFbxSecondary({ name: 'managed.zip', bytes: managedZip });
assert.equal(secondary.kind, 'managed-stage');
assert.equal(secondary.value[0].name, '/A');
assert.equal(bindFbx2BrowserProfile(primary, secondary), null);
const governedNamedPrimary = { ...primary, archive: { ...primary.archive,
  fileName: 'STF_2026Jul23-1554_binary.zip' } };
assert.throws(() => bindFbx2BrowserProfile(governedNamedPrimary, secondary),
  /FBX2_BROWSER_SOURCE_IDENTITY_MISMATCH/);

const mapping = await resolveBrowserFbxSecondary({
  name: 'mapping.json', bytes: new TextEncoder().encode('{"schema":"FbxMappingDecisionSet.v1"}'),
});
assert.equal(mapping.kind, 'mapping');
const malformed = await resolveBrowserFbxSecondary({
  name: 'mapping.json', bytes: new TextEncoder().encode('{bad'),
});
assert.equal(malformed.kind, 'mapping-error');

await assert.rejects(
  resolveBrowserFbxSecondary({
    name: 'bad_managed_stage.json', bytes: new TextEncoder().encode('{"schema":"mapping"}'),
  }),
  /MANAGED_STAGE_HIERARCHY_INVALID/,
);

await assert.rejects(
  readUniqueZipEntry(zipEntry('../escape.fbx', fbxBytes), (name) => /\.fbx$/i.test(name)),
  /ZIP_UNSAFE_PATH/,
);
await assert.rejects(
  resolveBrowserFbxSecondary({ name: 'managed.zip', bytes: zipEntry('wrong.json', '{}') }),
  /MANAGED_STAGE_HIERARCHY_INVALID/,
);
console.log('FBX2 browser input and ZIP qualification: PASS');
