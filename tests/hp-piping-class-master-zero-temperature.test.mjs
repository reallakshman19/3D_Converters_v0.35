import assert from 'node:assert/strict';
import test from 'node:test';
import { createChapterIxMasterStore } from '../converters/b313-chapter-ix/master-store.js';
import {
  createHpPipingClassGovernedBasisPackage,
  listHpPipingClassMasterChoices,
} from '../tabs/hp-piping-class-master-store-service.js';

function zeroStore() {
  return createChapterIxMasterStore({
    collections: {
      materialAllowable: [{
        recordId: 'MAT-ZERO-0', recordState: 'SOURCE_PENDING', useAuthority: 'NONE',
        materialId: 'MAT-ZERO', b313Edition: '2024', temperatureC: 0, allowableStressMpa: 100,
      }],
      pipeProduct: [{
        recordId: 'PROD-ZERO', recordState: 'SOURCE_PENDING', useAuthority: 'NONE',
        productId: 'PROD-ZERO', materialId: 'MAT-ZERO', dimensionId: 'DIM-ZERO',
        productSpec: 'TEST', manufacturingProcess: 'TEST', toleranceRuleId: 'TOL-ZERO',
      }],
    },
  });
}

test('canonical material choices preserve a legitimate zero Celsius table point', () => {
  const choices = listHpPipingClassMasterChoices(zeroStore());
  assert.equal(choices.ok, true);
  assert.deepEqual(choices.materials[0].temperaturesC, [0]);
});

test('zero Celsius is accepted as explicit selection but null or blank temperature is rejected', () => {
  const explicitZero = createHpPipingClassGovernedBasisPackage({
    store: zeroStore(), materialId: 'MAT-ZERO', b313Edition: '2024', materialTemperatureC: 0, productId: 'PROD-ZERO',
  });
  assert.equal(explicitZero.ok, true);
  assert.equal(explicitZero.basisPackage.query.materialTemperatureC, 0);

  for (const missing of [null, undefined, '']) {
    const blocked = createHpPipingClassGovernedBasisPackage({
      store: zeroStore(), materialId: 'MAT-ZERO', b313Edition: '2024', materialTemperatureC: missing, productId: 'PROD-ZERO',
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'MASTER_SELECTION_INCOMPLETE');
  }
});

test('typed product IDs not present in canonical store are rejected before package creation', () => {
  const blocked = createHpPipingClassGovernedBasisPackage({
    store: zeroStore(), materialId: 'MAT-ZERO', b313Edition: '2024', materialTemperatureC: 0, productId: 'NOT-IN-STORE',
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'MASTER_SELECTION_NOT_FOUND');
});
