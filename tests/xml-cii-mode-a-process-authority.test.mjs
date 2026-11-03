import test from 'node:test';
import assert from 'node:assert/strict';

import { repairExactMappedLineServiceFallback } from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-mode-a-process-authority.js';

test('exact mapped line discards stale service-fallback process values', () => {
  const config = {
    overrides: {
      processData: {
        S8810371: {
          p1: '4140', t1: '260', t2: '151', t3: '5', density: '983',
          __source: { serviceProcessFallback: { source: 'service-match', service: 'CSS', appliedFields: 5 } },
        },
      },
    },
  };

  const result = repairExactMappedLineServiceFallback(config, 'S8810371');

  assert.equal(result.changed, true);
  assert.deepEqual(new Set(result.removedFields), new Set(['p1', 't1', 't2', 't3', 'density']));
  assert.equal(config.overrides.processData.S8810371, undefined);
});

test('Process From fields remain authoritative while stale service fallback is removed', () => {
  const config = {
    overrides: {
      processData: {
        S8810371: {
          p1: '4140', t1: '185',
          __source: {
            serviceProcessFallback: { source: 'service-match', service: 'CSS', appliedFields: 2 },
            processReference: { direction: 'from', sourceLineKey: 'S8810999', fields: ['t1'] },
          },
        },
      },
    },
  };

  repairExactMappedLineServiceFallback(config, 'S8810371');

  assert.equal(config.overrides.processData.S8810371.t1, '185');
  assert.equal(config.overrides.processData.S8810371.p1, undefined);
  assert.equal(config.overrides.processData.S8810371.__source.processReference.sourceLineKey, 'S8810999');
  assert.equal(config.overrides.processData.S8810371.__source.serviceProcessFallback, undefined);
});

test('manual Preview process field is protected from service-fallback migration', () => {
  const config = {
    overrides: {
      __previewFillDown: {
        processData: {
          S8810371: { t1: { fillState: 'manual', fillSource: null } },
        },
      },
      processData: {
        S8810371: {
          p1: '4140', t1: '195',
          __source: { serviceProcessFallback: { source: 'service-match', service: 'CSS', appliedFields: 2 } },
        },
      },
    },
  };

  repairExactMappedLineServiceFallback(config, 'S8810371');

  assert.equal(config.overrides.processData.S8810371.t1, '195');
  assert.equal(config.overrides.processData.S8810371.p1, undefined);
});

test('new provenance preserves a field changed after fallback application', () => {
  const config = {
    overrides: {
      processData: {
        S8810371: {
          t1: '205',
          __source: {
            serviceProcessFallback: {
              source: 'service-match',
              fields: ['t1'],
              appliedValues: { t1: '260' },
            },
          },
        },
      },
    },
  };

  repairExactMappedLineServiceFallback(config, 'S8810371');

  assert.equal(config.overrides.processData.S8810371.t1, '205');
  assert.equal(config.overrides.processData.S8810371.__source, undefined);
});
