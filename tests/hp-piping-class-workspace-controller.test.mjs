import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HP_PIPING_CLASS_WORKSPACE_STORAGE_KEY,
  createHpPipingClassWorkspaceController,
  parseHpPipingClassWorkspaceProject,
  serializeHpPipingClassWorkspaceProject,
} from '../tabs/hp-piping-class-workspace-controller.js';

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
    values,
  };
}

function validProject() {
  return {
    schemaVersion: 'hp-piping-class-project/v2',
    metadata: { projectId: 'P1', classId: 'HP-CS-001', revision: 'A' },
    methodManifest: { b313Edition: '2024', calculationMode: 'USER_CALCULATED_KD3' },
    classBasis: { designPressureMpa: 20, internalAllowanceMm: 3, externalAllowanceMm: 0 },
    products: [{
      productId: 'NPS4-S160',
      calculationBasis: {
        mode: 'DIRECT_ENGINEERING_INPUT', outsideDiameterMm: 114.3,
        allowableStressMpa: 138, nominalWallMm: 13.49, minusTolerancePct: 12.5,
      },
      wallState: { fatigueWallBasis: 'END_OF_LIFE_EFFECTIVE' },
    }],
    transient: { spectrum: null, states: [], transitions: [] },
    fatigueEvidence: [],
  };
}

function successfulReviewResult() {
  return {
    ok: true,
    projectState: 'CALCULATED_NOT_AUTHORIZED',
    authority: { ...REVIEW_AUTHORITY },
    products: [{
      productId: 'NPS4-S160', calculationOk: true, engineeringState: 'STATIC_EVALUATED_FATIGUE_NOT_SUPPLIED',
      authority: { ...REVIEW_AUTHORITY }, assessment: { staticPass: true, fatigueEvaluated: false },
    }],
  };
}

test('workspace persists v2 draft state and restores it without persisting calculation results', () => {
  const storage = memoryStorage();
  const evaluator = () => successfulReviewResult();
  const first = createHpPipingClassWorkspaceController({ initialProject: validProject(), storage, evaluator });
  const result = first.calculate();
  assert.equal(result.ok, true);
  first.mutateProject((draft) => { draft.metadata.revision = 'B'; });
  const saved = JSON.parse(storage.values.get(HP_PIPING_CLASS_WORKSPACE_STORAGE_KEY));
  assert.equal(saved.metadata.revision, 'B');
  assert.equal(Object.hasOwn(saved, 'calculation'), false);

  const restored = createHpPipingClassWorkspaceController({ storage, evaluator });
  assert.equal(restored.getSnapshot().project.metadata.revision, 'B');
  assert.equal(restored.getSnapshot().calculation, null);
});

test('workspace blocks calculation before evaluator when project schema is incomplete', () => {
  let calls = 0;
  const controller = createHpPipingClassWorkspaceController({
    initialProject: {}, storage: memoryStorage(), evaluator: () => { calls += 1; return successfulReviewResult(); },
  });
  const result = controller.calculate();
  assert.equal(result.ok, false);
  assert.equal(result.projectState, 'INVALID_PROJECT');
  assert.equal(calls, 0);
  assert(result.issues.length > 0);
  assert.deepEqual(result.authority, REVIEW_AUTHORITY);
});

test('workspace sends a schema-valid project to the injected canonical evaluator', () => {
  let received = null;
  const controller = createHpPipingClassWorkspaceController({
    initialProject: validProject(), storage: memoryStorage(), evaluator: (project, options) => {
      received = { project, options };
      return successfulReviewResult();
    },
  });
  const result = controller.calculate({ includeEvidence: true });
  assert.equal(result.ok, true);
  assert.equal(received.project.metadata.classId, 'HP-CS-001');
  assert.equal(received.options.includeEvidence, true);
  assert.equal(result.authority.canUseForDesignAuthority, false);
});

test('workspace rejects top-level or per-product authority promotion from evaluator', () => {
  for (const promoted of [
    { ...successfulReviewResult(), authority: { ...REVIEW_AUTHORITY, canUseForDesignAuthority: true } },
    { ...successfulReviewResult(), products: [{ ...successfulReviewResult().products[0], authority: { ...REVIEW_AUTHORITY, codeCompliance: true } }] },
  ]) {
    const controller = createHpPipingClassWorkspaceController({
      initialProject: validProject(), storage: memoryStorage(), evaluator: () => promoted,
    });
    const result = controller.calculate();
    assert.equal(result.ok, false);
    assert.equal(result.projectState, 'AUTHORITY_PROMOTION_BLOCKED');
    assert.equal(result.authority.canUseForDesignAuthority, false);
  }
});

test('editing the project clears stale calculation custody', () => {
  const controller = createHpPipingClassWorkspaceController({
    initialProject: validProject(), storage: memoryStorage(), evaluator: () => successfulReviewResult(),
  });
  controller.calculate();
  assert.ok(controller.getSnapshot().calculation);
  controller.mutateProject((draft) => { draft.classBasis.designPressureMpa = 21; });
  assert.equal(controller.getSnapshot().calculation, null);
});

test('workspace JSON round-trip preserves v2 state and rejects unsupported schema', () => {
  const serialized = serializeHpPipingClassWorkspaceProject(validProject());
  const parsed = parseHpPipingClassWorkspaceProject(serialized);
  assert.equal(parsed.schemaVersion, 'hp-piping-class-project/v2');
  assert.equal(parsed.products[0].productId, 'NPS4-S160');
  assert.throws(() => parseHpPipingClassWorkspaceProject(JSON.stringify({ schemaVersion: 'hp-piping-class-project/v99' })), /Unsupported HP Piping Class project schema/);
});
