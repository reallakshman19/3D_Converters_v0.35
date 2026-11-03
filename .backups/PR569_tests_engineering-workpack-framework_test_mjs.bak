import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateEngineeringWorkpack } from '../engineering/workpacks/framework/workpack-loader.mjs';
import {
  verifyEngineeringWorkpack,
  verifyEngineeringWorkpackDefinition,
} from '../scripts/verify-engineering-workpack.mjs';

function secondConsumer(checks) {
  return {
    schema: 'EngineeringWorkPack.v1',
    workpackId: 'EWP-SECOND-CONSUMER',
    capabilityId: 'TEST.SECOND.CONSUMER',
    capabilityLifecycle: { state: 'UNMAPPED_LEGACY', inferred: false },
    authority: { state: 'BLOCKED' },
    checks,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function fitWorkpack() {
  return JSON.parse(await readFile(new URL('../engineering/workpacks/VIB-FIT.json', import.meta.url), 'utf8'));
}

test('generic engine preserves FIT check order and historical gate IDs', async () => {
  const result = await verifyEngineeringWorkpack('VIB-FIT');
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.checks.map((entry) => entry.id), [
    'FIT-WP-001', 'FIT-WP-002', 'FIT-WP-003', 'FIT-WP-004',
    'FIT-WP-005', 'FIT-WP-006', 'FIT-WP-007', 'FIT-WP-008',
    'FIT-WP-009', 'FIT-WP-010', 'FIT-WP-011', 'FIT-WP-012',
  ]);
});

test('a second consumer verifies without mechanism logic in the generic engine', async () => {
  const workpack = {
    ...secondConsumer([]),
    sourceRules: [{ path: 'package.json', requiredStrings: ['\"workpack:verify\"'], forbiddenStrings: [] }],
    checks: [{ id: 'SECOND-001', type: 'SOURCE_RULES', severity: 'ERROR', config: { rulesRef: 'sourceRules' } }],
  };
  const result = await verifyEngineeringWorkpackDefinition(workpack);
  assert.equal(result.status, 'PASS');
});

test('unknown check type fails closed', async () => {
  await assert.rejects(
    verifyEngineeringWorkpackDefinition(secondConsumer([
      { id: 'SECOND-001', type: 'UNKNOWN_CHECK_TYPE', severity: 'ERROR', config: {} },
    ])),
    /BLOCKED_UNSUPPORTED_CHECK_TYPE:UNKNOWN_CHECK_TYPE/u,
  );
});

test('missing declared probe fails closed', async () => {
  await assert.rejects(
    verifyEngineeringWorkpackDefinition(secondConsumer([
      {
        id: 'SECOND-001', type: 'CUSTOM_DECLARED_PROBE', severity: 'ERROR',
        config: { probeModule: 'missing', exportName: 'missing' },
      },
    ])),
    /MISSING_DECLARED_PROBE:missing/u,
  );
});

test('malformed, duplicate and unsupported-schema work packs fail closed', () => {
  assert.throws(() => validateEngineeringWorkpack({}), /UNSUPPORTED_SCHEMA_VERSION/u);
  assert.throws(() => validateEngineeringWorkpack({
    schema: 'EngineeringWorkPack.v2', workpackId: 'X', capabilityId: 'X', checks: [{ id: 'A', type: 'FILE_EXISTS' }],
  }), /UNSUPPORTED_SCHEMA_VERSION/u);
  assert.throws(() => validateEngineeringWorkpack({
    schema: 'EngineeringWorkPack.v1', workpackId: 'X', capabilityId: 'X',
    checks: [{ id: 'A', type: 'FILE_EXISTS' }, { id: 'A', type: 'FILE_EXISTS' }],
  }), /DUPLICATE_CHECK_ID:A/u);
});

test('unknown workpack id fails closed', async () => {
  await assert.rejects(verifyEngineeringWorkpack('NO-SUCH-WORKPACK'), /UNKNOWN_WORKPACK_ID:NO-SUCH-WORKPACK/u);
});

test('declared probe cannot mutate workpack authority', async () => {
  const workpack = {
    ...secondConsumer([]),
    probeModules: {
      mutation: {
        path: 'tests/fixtures/engineering-workpack-mutation-probe.mjs',
        exports: ['attemptWorkpackMutation'],
      },
    },
    checks: [{
      id: 'SECOND-001', type: 'CUSTOM_DECLARED_PROBE', severity: 'ERROR',
      config: { probeModule: 'mutation', exportName: 'attemptWorkpackMutation' },
    }],
  };
  const result = await verifyEngineeringWorkpackDefinition(workpack);
  assert.equal(result.status, 'PASS');
  assert.equal(workpack.authority.state, 'BLOCKED');
  assert.equal(workpack.capabilityLifecycle.state, 'UNMAPPED_LEGACY');
});

test('legacy lifecycle stays explicit rather than inferred from registry state', () => {
  assert.doesNotThrow(() => validateEngineeringWorkpack(secondConsumer([
    { id: 'SECOND-001', type: 'FILE_EXISTS', severity: 'ERROR', config: { paths: ['package.json'] } },
  ])));
  assert.throws(() => validateEngineeringWorkpack({
    ...secondConsumer([{ id: 'SECOND-001', type: 'FILE_EXISTS', severity: 'ERROR', config: { paths: [] } }]),
    capabilityLifecycle: { state: 'UNMAPPED_LEGACY', inferred: true },
  }), /LEGACY_LIFECYCLE_MUST_BE_EXPLICITLY_UNMAPPED/u);
});

test('FIT authority projection drift fails', async () => {
  const workpack = clone(await fitWorkpack());
  workpack.authority.screeningAuthority = 'NOT_AUTHORIZED';
  await assert.rejects(verifyEngineeringWorkpackDefinition(workpack), /FIT-WP-004/u);
});

test('FIT code compliance cannot drift true in both work pack and adapter contract', async () => {
  const workpack = clone(await fitWorkpack());
  workpack.authority.codeCompliance = true;
  await assert.rejects(verifyEngineeringWorkpackDefinition(workpack), /FIT-WP-006/u);
});

test('FIT QST-003 protection cannot be removed silently', async () => {
  const workpack = clone(await fitWorkpack());
  workpack.probes.qst003.expectedPublicErrorCode = 'NOT_THE_PUBLIC_ERROR';
  await assert.rejects(verifyEngineeringWorkpackDefinition(workpack), /FIT-WP-007/u);
});

test('FIT required benchmark identity drift fails', async () => {
  const workpack = clone(await fitWorkpack());
  workpack.benchmarkSets[0].requiredCaseIds.push('MISSING-BENCHMARK-CASE');
  await assert.rejects(verifyEngineeringWorkpackDefinition(workpack), /FIT-WP-008/u);
});

test('FIT Product Freeze cannot be declared FROZEN without protocol receipt', async () => {
  const workpack = clone(await fitWorkpack());
  workpack.productFreeze.state = 'FROZEN';
  workpack.productFreeze.frozen = true;
  workpack.productFreeze.receiptPath = 'artifacts/vibration-production-freeze/missing-receipt.json';
  await assert.rejects(verifyEngineeringWorkpackDefinition(workpack), /FIT-WP-012/u);
});

test('generic core contains no mechanism-specific engineering names or rules', async () => {
  const paths = [
    '../scripts/verify-engineering-workpack.mjs',
    '../engineering/workpacks/framework/workpack-loader.mjs',
    '../engineering/workpacks/framework/check-handlers.mjs',
    '../engineering/workpacks/framework/probe-runner.mjs',
  ];
  const forbiddenRule = /QST-003|D\.2\.3|T2\.9|if\s*\([^)]*(?:FIT|AIV|SBC)/u;
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, forbiddenRule, path);
  }
});
