import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const contracts = [
  '../../contracts/fbx/fbx-benchmark-coordinate-profile.v1.schema.json',
  '../../contracts/fbx/fbx-global-occurrence-index.v1.schema.json',
  '../../contracts/fbx/fbx-cross-zone-support-association-evidence.v1.schema.json',
  '../../contracts/fbx/fbx-selected-zone-branch-match-ledger.v1.schema.json',
  '../../contracts/fbx/fbx-selected-zone-package-audit.v1.schema.json',
];
const schemas = await Promise.all(contracts.map(async (relative) => ({
  relative,
  value: JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8')),
})));
const program = `
import json, sys
from jsonschema import Draft202012Validator
for schema in json.load(sys.stdin):
    Draft202012Validator.check_schema(schema)
print('PASS')
`;
const result = spawnSync(process.env.FBX_SCHEMA_PYTHON || 'python3', ['-c', program], {
  input: JSON.stringify(schemas.map((item) => item.value)),
  encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
if (result.error || result.status !== 0) {
  throw new Error(result.error?.message || result.stderr || 'Schema validation failed.');
}
assert.equal(result.stdout.trim(), 'PASS');

const expected = new Map([
  ['fbx-benchmark-coordinate-profile.v1.schema.json', 'FbxBenchmarkCoordinateProfile.v1'],
  ['fbx-global-occurrence-index.v1.schema.json', 'FbxGlobalOccurrenceIndex.v1'],
  ['fbx-cross-zone-support-association-evidence.v1.schema.json',
    'FbxCrossZoneSupportAssociationEvidence.v1'],
  ['fbx-selected-zone-branch-match-ledger.v1.schema.json',
    'FbxSelectedZoneBranchMatchLedger.v1'],
]);
for (const { relative, value } of schemas.slice(0, 4)) {
  const name = relative.split('/').at(-1);
  assert.equal(value.properties.schema.const, expected.get(name));
  assert.equal(value.additionalProperties, false);
}

const audit = schemas.at(-1).value;
const roles = [
  'BRANCH_MATCH_LEDGER', 'GLOBAL_OCCURRENCE_INDEX',
  'CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE', 'COORDINATE_PROFILE',
];
const roleEnum = audit.$defs.fileRecord.properties.role.enum;
const omissionEnum = audit.$defs.fileRecord.allOf.at(-1)
  .then.properties.role.enum;
for (const role of roles) {
  assert.ok(roleEnum.includes(role));
  assert.ok(omissionEnum.includes(role));
  const inventory = audit.properties.files.allOf.filter((item) => (
    item.contains?.properties?.role?.const === role
  ));
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].minContains, 1);
  assert.equal(inventory[0].maxContains, 1);
}

console.log('test-fbx2-selected-zone-package-contracts: PASS');
