import assert from 'node:assert/strict';
import test from 'node:test';
import { createChapterIxMasterStore } from '../converters/b313-chapter-ix/master-store.js';
import {
  HP_PIPING_CLASS_MASTER_STORE_URL,
  createHpPipingClassGovernedBasisPackage,
  listHpPipingClassMasterChoices,
  loadHpPipingClassMasterStore,
  validateHpPipingClassGovernedBasisCustody,
} from '../tabs/hp-piping-class-master-store-service.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

function checked(recordId, payload) {
  return { recordId, recordState: 'INDEPENDENTLY_CHECKED', useAuthority: 'ENGINEERING_SANDBOX', ...payload };
}

function store() {
  return createChapterIxMasterStore({
    metadata: { runtimeRole: 'CANONICAL_RUNTIME_MASTER_STORE' },
    collections: {
      sources: [
        checked('SRC-B313', { sourceId: 'SRC-B313', role: 'B313_ALLOWABLE_STRESS', standard: 'ASME B31.3', edition: '2024', documentHash: HASH_A, verifiedBy: 'A', independentCheckBy: 'B', verifiedAt: '2026-08-16T00:00:00Z', independentCheckedAt: '2026-08-16T01:00:00Z' }),
        checked('SRC-DIM', { sourceId: 'SRC-DIM', role: 'PIPE_DIMENSION', standard: 'ASME B36.10M', edition: '2022', documentHash: HASH_B, verifiedBy: 'A', independentCheckBy: 'B', verifiedAt: '2026-08-16T00:00:00Z', independentCheckedAt: '2026-08-16T01:00:00Z' }),
        checked('SRC-TOL', { sourceId: 'SRC-TOL', role: 'PRODUCT_TOLERANCE', standard: 'TEST PRODUCT STANDARD', edition: 'R1', documentHash: HASH_C, verifiedBy: 'A', independentCheckBy: 'B', verifiedAt: '2026-08-16T00:00:00Z', independentCheckedAt: '2026-08-16T01:00:00Z' }),
      ],
      materialAllowable: [
        checked('MAT-A-100', { materialId: 'MAT-A', b313Edition: '2024', temperatureC: 100, allowableStressMpa: 150, sourceId: 'SRC-B313', sourceLocator: 'table point 100', interpolationPolicy: 'LINEAR_NO_EXTRAPOLATION' }),
        checked('MAT-A-200', { materialId: 'MAT-A', b313Edition: '2024', temperatureC: 200, allowableStressMpa: 130, sourceId: 'SRC-B313', sourceLocator: 'table point 200', interpolationPolicy: 'LINEAR_NO_EXTRAPOLATION' }),
      ],
      pipeProduct: [
        checked('PROD-4-160', { productId: 'PROD-4-160', dimensionId: 'DIM-4-160', materialId: 'MAT-A', productSpec: 'TEST PIPE', manufacturingProcess: 'SEAMLESS', toleranceRuleId: 'TOL-TEST' }),
      ],
      pipeDimension: [
        checked('DIM-4-160', { dimensionId: 'DIM-4-160', nps: 4, odMm: 114.3, schedule: '160', nominalWallMm: 13.49, dimensionStandard: 'ASME B36.10M', dimensionEdition: '2022', sourceId: 'SRC-DIM', sourceLocator: 'NPS4 Sch160' }),
      ],
      manufacturingTolerance: [
        checked('TOL-TEST', { toleranceRuleId: 'TOL-TEST', productSpec: 'TEST PIPE', manufacturingProcess: 'SEAMLESS', minusTolerancePct: 12.5, toleranceStandard: 'TEST PRODUCT STANDARD', toleranceEdition: 'R1', sourceId: 'SRC-TOL', sourceLocator: 'minus tolerance' }),
      ],
    },
  });
}

test('runtime choices come only from canonical master-store collections', () => {
  const result = listHpPipingClassMasterChoices(store());
  assert.equal(result.ok, true);
  assert.deepEqual(result.materials.map((row) => row.materialId), ['MAT-A']);
  assert.deepEqual(result.products.map((row) => row.productId), ['PROD-4-160']);
  assert.equal(result.authority.legacyDocsRuntimeAuthority, false);
  assert.equal(result.authority.canUseForDesignAuthority, false);
});

test('governed basis package is built from projected canonical masters with authority false', () => {
  const result = createHpPipingClassGovernedBasisPackage({
    store: store(), materialId: 'MAT-A', b313Edition: '2024', materialTemperatureC: 150, productId: 'PROD-4-160',
  });
  assert.equal(result.ok, true);
  assert.equal(result.basisPackage.packageVersion, 'b313-ch9-basis-package/v1');
  assert.equal(result.basisPackage.query.materialId, 'MAT-A');
  assert.equal(result.basisPackage.query.productId, 'PROD-4-160');
  assert.equal(result.basisPackage.masters.pipeProduct.length, 1);
  assert.equal(result.authority.canUseForDesignAuthority, false);
});

test('governed basis package rejects incomplete selection rather than inventing defaults', () => {
  const result = createHpPipingClassGovernedBasisPackage({ store: store(), materialId: '', b313Edition: '2024', materialTemperatureC: 150, productId: 'PROD-4-160' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'MASTER_SELECTION_INCOMPLETE');
});

test('custody validator accepts exact canonical projection and rejects changed master payload', () => {
  const built = createHpPipingClassGovernedBasisPackage({
    store: store(), materialId: 'MAT-A', b313Edition: '2024', materialTemperatureC: 150, productId: 'PROD-4-160',
  });
  const exact = validateHpPipingClassGovernedBasisCustody({ store: store(), basisPackage: built.basisPackage });
  assert.equal(exact.ok, true);
  assert.equal(exact.canUseForDesignAuthority, false);

  const changed = structuredClone(built.basisPackage);
  changed.masters.pipeDimension[0].nominalWallMm = 99;
  const blocked = validateHpPipingClassGovernedBasisCustody({ store: store(), basisPackage: changed });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'GOVERNED_BASIS_CUSTODY_BLOCKED');
});

test('custody validator rejects incomplete governed query', () => {
  const built = createHpPipingClassGovernedBasisPackage({
    store: store(), materialId: 'MAT-A', b313Edition: '2024', materialTemperatureC: 150, productId: 'PROD-4-160',
  });
  const changed = structuredClone(built.basisPackage);
  changed.query.materialId = '';
  const blocked = validateHpPipingClassGovernedBasisCustody({ store: store(), basisPackage: changed });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'GOVERNED_BASIS_CUSTODY_BLOCKED');
});

test('runtime loader fetches the canonical JSON store path and validates before exposing choices', async () => {
  let requested = null;
  const result = await loadHpPipingClassMasterStore({
    fetchImpl: async (url) => {
      requested = url;
      return { ok: true, status: 200, json: async () => store() };
    },
  });
  assert.equal(requested, HP_PIPING_CLASS_MASTER_STORE_URL);
  assert.equal(result.ok, true);
  assert.equal(result.choices.materials.length, 1);
  assert.equal(result.choices.products.length, 1);
  assert.equal(result.authority.runtimeMasterSource, 'B313_CH9_MASTER_STORE_V1');
});

test('runtime loader fails closed on invalid store', async () => {
  const result = await loadHpPipingClassMasterStore({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ schemaVersion: 'wrong' }) }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'MASTER_STORE_INVALID');
  assert.equal(result.authority.canUseForDesignAuthority, false);
});

test('runtime loader fails closed on fetch error', async () => {
  const result = await loadHpPipingClassMasterStore({ fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'MASTER_STORE_FETCH_FAILED');
});
