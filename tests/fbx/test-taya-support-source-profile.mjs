import assert from 'node:assert/strict';
import {
  GOVERNED_TAYA_SOURCE_PROFILE,
  identifyGovernedTayaSource,
  validateGovernedTayaSourceIdentity,
} from '../../tabs/model-converters/converters/fbx/taya-qualification/source-profile.js';

assert.equal(GOVERNED_TAYA_SOURCE_PROFILE.fileName, 'fbxtaya.fbx');
assert.equal(GOVERNED_TAYA_SOURCE_PROFILE.byteLength, 71_486_048);
assert.equal(GOVERNED_TAYA_SOURCE_PROFILE.sha256,
  '0c2c0600a1232541a497aea05832b728569fefcf62ea86e71dea520247fe9ca8');
assert.equal(GOVERNED_TAYA_SOURCE_PROFILE.selectionPolicy,
  'FbxSelectedZoneAutoPipePolicy.v1');

const graph = {
  schema: 'FbxSourceGraph.v2',
  sourceObjects: [], occurrences: [], geometries: [],
};
const blocked = await identifyGovernedTayaSource({
  sourceName: 'fbxtaya.fbx', sourceBytes: new Uint8Array([1, 2, 3]), sourceGraph: graph,
});
assert.equal(blocked.status, 'BLOCKED');
assert.deepEqual(blocked.blockedReasons, [
  'SOURCE_BYTE_LENGTH_MISMATCH',
  'SOURCE_SHA256_MISMATCH',
  'SOURCE_GRAPH_COUNT_MISMATCH',
]);
assert.equal(blocked.authority.fileNameUsedAsAuthority, false);
validateGovernedTayaSourceIdentity(blocked);

const renamed = structuredClone(blocked);
renamed.suppliedFileName = 'renamed-source.fbx';
renamed.fileNameDisposition = 'RENAMED_OR_UNAVAILABLE';
validateGovernedTayaSourceIdentity(renamed);

const inconsistent = structuredClone(blocked);
inconsistent.status = 'PASS';
assert.throws(() => validateGovernedTayaSourceIdentity(inconsistent), /inconsistent/);
console.log('test-taya-support-source-profile: PASS');
