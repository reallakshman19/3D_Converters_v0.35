import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildRegistrySnapshotManifest,
  computeLineHistoryHash,
  computeZoneRegistryHash,
} from '../../../../node-history/registry/registry-hash.js';

const fixture = JSON.parse(readFileSync(new URL('./foundation.json', import.meta.url), 'utf8'));

function schema(name) {
  return JSON.parse(readFileSync(new URL(
    `../../../../node-history/schemas/${name}.schema.json`, import.meta.url,
  ), 'utf8'));
}

async function materialize() {
  const data = structuredClone(fixture);
  for (const history of data.lineHistories) history.lineHistoryHash = await computeLineHistoryHash(history);
  for (const reference of data.zoneRegistry.lineHistoryRefs) {
    reference.lineHistoryHash = data.lineHistories.find(
      (history) => history.mainLineKey === reference.mainLineKey,
    ).lineHistoryHash;
  }
  data.zoneRegistry.zoneRegistryHash = await computeZoneRegistryHash(data.zoneRegistry);
  data.manifest = await buildRegistrySnapshotManifest({
    zoneRegistry: data.zoneRegistry,
    lineHistories: data.lineHistories,
    pathsByMainLine: Object.fromEntries(data.zoneRegistry.lineHistoryRefs.map(
      (reference) => [reference.mainLineKey, reference.path],
    )),
  });
  return data;
}

function validate(cases) {
  const script = String.raw`
import json, sys
from jsonschema import Draft202012Validator
payload = json.load(sys.stdin)
results = []
for case in payload['cases']:
    Draft202012Validator.check_schema(case['schema'])
    validator = Draft202012Validator(case['schema'])
    errors = [error.message for error in validator.iter_errors(case['artifact'])]
    results.append({'id': case['id'], 'valid': not errors, 'errors': errors})
json.dump(results, sys.stdout)
`;
  const result = spawnSync('python3', ['-c', script], {
    input: JSON.stringify({ cases }), encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('validates positive registry artifacts against Draft 2020-12 schemas', async () => {
  const data = await materialize();
  const results = validate([
    { id: 'zone', schema: schema('PsiNodeZoneRegistry.v1'), artifact: data.zoneRegistry },
    ...data.lineHistories.map((artifact, index) => ({
      id: `line-${index}`, schema: schema('PsiNodeLineHistory.v1'), artifact,
    })),
    { id: 'manifest', schema: schema('RegistrySnapshotManifest.v1'), artifact: data.manifest },
  ]);
  assert.ok(results.every((row) => row.valid), JSON.stringify(results));
});

test('rejects malformed lease evidence, lifecycle evidence and manifest pool structure', async () => {
  const data = await materialize();
  const badZone = structuredClone(data.zoneRegistry);
  delete badZone.leases[0].evidence.authority;
  const badLine = structuredClone(data.lineHistories[0]);
  const retired = badLine.historyNodes.find((row) => row.lifecycleStatus === 'RETIRED');
  retired.retirementEvidence = {};
  const badManifest = structuredClone(data.manifest);
  delete badManifest.pool.namespace;
  const results = validate([
    { id: 'zone-negative', schema: schema('PsiNodeZoneRegistry.v1'), artifact: badZone },
    { id: 'line-negative', schema: schema('PsiNodeLineHistory.v1'), artifact: badLine },
    { id: 'manifest-negative', schema: schema('RegistrySnapshotManifest.v1'), artifact: badManifest },
  ]);
  assert.ok(results.every((row) => !row.valid), JSON.stringify(results));
});
