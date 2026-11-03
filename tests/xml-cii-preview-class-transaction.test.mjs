import assert from 'node:assert/strict';
import test from 'node:test';

import {
  replaceJsonObject,
  runAtomicPreviewClassTransaction,
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-class-transaction.js';

test('commits class override only after authority hydration', async () => {
  const config = { overrides: {}, pipingClass: { masterRows: [] } };
  const order = [];

  const result = await runAtomicPreviewClassTransaction({
    config,
    applyOverride: async (next) => {
      order.push('apply');
      next.overrides.pipingClass = { '93834': '13421' };
      return { savedKey: '93834' };
    },
    hydrateAuthority: async (next) => {
      order.push('hydrate');
      next.pipingClass.masterRows.push({ pipingClass: '13421', convertedBore: '100', rating: '150' });
      return { loadedClasses: ['13421'], unmatched: [] };
    },
    persistConfig: async () => { order.push('persist'); },
    rebuildPreview: async ({ rollback }) => {
      order.push('rebuild');
      assert.equal(rollback, false);
      assert.equal(config.pipingClass.masterRows[0].rating, '150');
    },
  });

  assert.deepEqual(order, ['apply', 'hydrate', 'persist', 'rebuild']);
  assert.equal(config.overrides.pipingClass['93834'], '13421');
  assert.deepEqual(result.hydrationResult.loadedClasses, ['13421']);
  assert.equal(result.rollback, false);
});

test('restores the complete config when hydration fails', async () => {
  const config = {
    overrides: { pipingClass: { OLD: '93834' } },
    pipingClass: { masterRows: [{ pipingClass: '93834', rating: '900' }] },
  };
  const before = JSON.parse(JSON.stringify(config));
  const order = [];

  await assert.rejects(
    runAtomicPreviewClassTransaction({
      config,
      applyOverride: async (next) => {
        order.push('apply');
        next.overrides.pipingClass.NEW = '13421';
      },
      hydrateAuthority: async () => {
        order.push('hydrate');
        throw new Error('network unavailable');
      },
      persistConfig: async () => { order.push('persist-rollback'); },
      rebuildPreview: async ({ rollback }) => {
        order.push('rebuild-rollback');
        assert.equal(rollback, true);
        assert.deepEqual(config, before);
      },
    }),
    /network unavailable/,
  );

  assert.deepEqual(order, ['apply', 'hydrate', 'persist-rollback', 'rebuild-rollback']);
  assert.deepEqual(config, before);
});

test('rolls back when the committed Preview rebuild fails', async () => {
  const config = { value: 'before' };
  let rebuildCount = 0;

  await assert.rejects(
    runAtomicPreviewClassTransaction({
      config,
      applyOverride: async (next) => { next.value = 'after'; },
      hydrateAuthority: async () => ({ loadedClasses: [] }),
      persistConfig: async () => {},
      rebuildPreview: async ({ rollback }) => {
        rebuildCount += 1;
        if (!rollback) throw new Error('render failure');
        assert.equal(config.value, 'before');
      },
    }),
    /render failure/,
  );

  assert.equal(rebuildCount, 2);
  assert.equal(config.value, 'before');
});

test('replaceJsonObject removes stale top-level keys', () => {
  const target = { stale: true, retained: 'old' };
  replaceJsonObject(target, { retained: 'new', added: 1 });
  assert.deepEqual(target, { retained: 'new', added: 1 });
});
