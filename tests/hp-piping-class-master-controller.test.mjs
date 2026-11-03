import assert from 'node:assert/strict';
import test from 'node:test';
import { createHpPipingClassWorkspaceController } from '../tabs/hp-piping-class-workspace-controller.js';

const REVIEW_AUTHORITY = Object.freeze({
  calculationMode: 'USER_CALCULATED_KD3',
  nativeCoreKd3Qualified: false,
  codeCompliance: false,
  canUseForDesignAuthority: false,
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function directProject() {
  return {
    schemaVersion: 'hp-piping-class-project/v2',
    metadata: { projectId: 'P1', classId: 'HP-CS-001', revision: 'A' },
    methodManifest: { b313Edition: '2024', calculationMode: 'USER_CALCULATED_KD3' },
    classBasis: { designPressureMpa: 20, internalAllowanceMm: 3, externalAllowanceMm: 0 },
    products: [{
      productId: 'DIRECT-1',
      calculationBasis: { mode: 'DIRECT_ENGINEERING_INPUT', outsideDiameterMm: 114.3, allowableStressMpa: 138, nominalWallMm: 13.49, minusTolerancePct: 12.5 },
      wallState: { fatigueWallBasis: 'END_OF_LIFE_EFFECTIVE' },
    }],
    transient: { spectrum: null, states: [], transitions: [] },
    fatigueEvidence: [],
  };
}

function reviewResult(productId = 'DIRECT-1') {
  return {
    ok: true,
    projectState: 'CALCULATED_NOT_AUTHORIZED',
    authority: { ...REVIEW_AUTHORITY },
    products: [{ productId, calculationOk: true, engineeringState: 'STATIC_EVALUATED_FATIGUE_NOT_SUPPLIED', authority: { ...REVIEW_AUTHORITY }, assessment: { staticPass: true, fatigueEvaluated: false } }],
  };
}

function masterRuntime() {
  return {
    ok: true,
    store: { schemaVersion: 'b313-ch9-master-store/v1', marker: 'CANONICAL' },
    choices: { materials: [{ materialId: 'MAT-A', editions: ['2024'] }], products: [{ productId: 'PROD-A', materialId: 'MAT-A' }] },
    authority: { runtimeMasterSource: 'B313_CH9_MASTER_STORE_V1', legacyDocsRuntimeAuthority: false, canUseForDesignAuthority: false },
  };
}

function packageFor(selection) {
  return {
    ok: true,
    basisPackage: {
      packageVersion: 'b313-ch9-basis-package/v1',
      query: { ...selection },
      masters: { marker: 'CANONICAL_PROJECTION' },
    },
    authority: { runtimeMasterSource: 'B313_CH9_MASTER_STORE_V1', legacyDocsRuntimeAuthority: false, canUseForDesignAuthority: false },
  };
}

test('controller loads canonical master runtime into transient workspace state only', async () => {
  const storage = memoryStorage();
  const controller = createHpPipingClassWorkspaceController({
    initialProject: directProject(), storage,
    masterLoader: async () => masterRuntime(),
  });
  const loaded = await controller.loadMasterStore();
  assert.equal(loaded.ok, true);
  assert.equal(controller.getSnapshot().masterRuntime.authority.runtimeMasterSource, 'B313_CH9_MASTER_STORE_V1');
  const project = controller.getSnapshot().project;
  assert.equal(Object.hasOwn(project, 'masterRuntime'), false);
});

test('governed binding fails closed before canonical master store is loaded', () => {
  const controller = createHpPipingClassWorkspaceController({ initialProject: directProject(), storage: memoryStorage() });
  const result = controller.bindGovernedBasis(0, { materialId: 'MAT-A', b313Edition: '2024', materialTemperatureC: 150, productId: 'PROD-A' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'MASTER_STORE_NOT_LOADED');
  assert.equal(controller.getSnapshot().project.products[0].calculationBasis.mode, 'DIRECT_ENGINEERING_INPUT');
});

test('governed binding uses canonical package factory and clears stale result', async () => {
  let received = null;
  const controller = createHpPipingClassWorkspaceController({
    initialProject: directProject(), storage: memoryStorage(), evaluator: () => reviewResult(),
    masterLoader: async () => masterRuntime(),
    basisPackageFactory: (input) => { received = input; return packageFor({ materialId: input.materialId, b313Edition: input.b313Edition, materialTemperatureC: input.materialTemperatureC, productId: input.productId }); },
  });
  controller.calculate();
  assert.ok(controller.getSnapshot().calculation);
  await controller.loadMasterStore();
  const bound = controller.bindGovernedBasis(0, { materialId: 'MAT-A', b313Edition: '2024', materialTemperatureC: 150, productId: 'PROD-A' });
  assert.equal(bound.ok, true);
  assert.equal(received.store.marker, 'CANONICAL');
  assert.equal(controller.getSnapshot().project.products[0].productId, 'PROD-A');
  assert.equal(controller.getSnapshot().project.products[0].calculationBasis.mode, 'GOVERNED_BASIS_PACKAGE');
  assert.equal(controller.getSnapshot().calculation, null);
  assert.equal(bound.canUseForDesignAuthority, false);
});

test('calculation blocks governed package when canonical store is not loaded', () => {
  const project = directProject();
  project.products[0] = {
    productId: 'PROD-A',
    calculationBasis: { mode: 'GOVERNED_BASIS_PACKAGE', basisPackage: packageFor({ materialId: 'MAT-A', b313Edition: '2024', materialTemperatureC: 150, productId: 'PROD-A' }).basisPackage },
    wallState: { fatigueWallBasis: 'END_OF_LIFE_EFFECTIVE' },
  };
  let calls = 0;
  const controller = createHpPipingClassWorkspaceController({ initialProject: project, storage: memoryStorage(), evaluator: () => { calls += 1; return reviewResult('PROD-A'); } });
  const result = controller.calculate();
  assert.equal(result.ok, false);
  assert.equal(result.projectState, 'MASTER_STORE_CUSTODY_BLOCKED');
  assert.equal(result.issues[0].code, 'MASTER_STORE_NOT_LOADED');
  assert.equal(calls, 0);
});

test('calculation rejects imported governed package that does not reproduce loaded canonical projection', async () => {
  const project = directProject();
  project.products[0] = {
    productId: 'PROD-A',
    calculationBasis: { mode: 'GOVERNED_BASIS_PACKAGE', basisPackage: packageFor({ materialId: 'MAT-A', b313Edition: '2024', materialTemperatureC: 150, productId: 'PROD-A' }).basisPackage },
    wallState: { fatigueWallBasis: 'END_OF_LIFE_EFFECTIVE' },
  };
  let calls = 0;
  const controller = createHpPipingClassWorkspaceController({
    initialProject: project, storage: memoryStorage(),
    evaluator: () => { calls += 1; return reviewResult('PROD-A'); },
    masterLoader: async () => masterRuntime(),
    basisCustodyValidator: () => ({ ok: false, code: 'GOVERNED_BASIS_CUSTODY_BLOCKED', message: 'mismatch' }),
  });
  await controller.loadMasterStore();
  const result = controller.calculate();
  assert.equal(result.projectState, 'MASTER_STORE_CUSTODY_BLOCKED');
  assert.equal(result.issues[0].code, 'GOVERNED_BASIS_CUSTODY_BLOCKED');
  assert.equal(calls, 0);
});

test('governed calculation reaches evaluator only after canonical custody validation passes', async () => {
  const project = directProject();
  project.products[0] = {
    productId: 'PROD-A',
    calculationBasis: { mode: 'GOVERNED_BASIS_PACKAGE', basisPackage: packageFor({ materialId: 'MAT-A', b313Edition: '2024', materialTemperatureC: 150, productId: 'PROD-A' }).basisPackage },
    wallState: { fatigueWallBasis: 'END_OF_LIFE_EFFECTIVE' },
  };
  let calls = 0;
  const controller = createHpPipingClassWorkspaceController({
    initialProject: project, storage: memoryStorage(), evaluator: () => { calls += 1; return reviewResult('PROD-A'); },
    masterLoader: async () => masterRuntime(), basisCustodyValidator: () => ({ ok: true, canUseForDesignAuthority: false }),
  });
  await controller.loadMasterStore();
  const result = controller.calculate();
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal(result.authority.canUseForDesignAuthority, false);
});
