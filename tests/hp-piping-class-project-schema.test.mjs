import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HP_PIPING_CLASS_PROJECT_VERSION,
  createHpPipingClassProject,
  validateHpPipingClassProject,
} from '../converters/b313-chapter-ix/hp-piping-class-project.js';

function baseProject() {
  return createHpPipingClassProject({
    metadata: { projectId: 'HP-PROJ-001', classId: 'HP-CS-001', revision: 'A' },
    methodManifest: {
      b313Edition: '2024',
      viii3Edition: '2025',
      calculationMode: 'USER_CALCULATED_KD3',
    },
    classBasis: { designPressureMpa: 20, internalAllowanceMm: 3, externalAllowanceMm: 0 },
    products: [{
      productId: 'NPS4-S160',
      calculationBasis: {
        mode: 'DIRECT_ENGINEERING_INPUT',
        outsideDiameterMm: 114.3,
        allowableStressMpa: 138,
        nominalWallMm: 13.49,
        minusTolerancePct: 12.5,
      },
      wallState: { fatigueWallBasis: 'END_OF_LIFE_EFFECTIVE' },
    }],
    transient: { spectrum: null, states: [], transitions: [] },
    fatigueEvidence: [],
  });
}

test('v2 project creates an explicit fail-closed authority envelope', () => {
  const project = baseProject();
  assert.equal(project.schemaVersion, HP_PIPING_CLASS_PROJECT_VERSION);
  assert.equal(project.methodManifest.calculationMode, 'USER_CALCULATED_KD3');
  assert.equal(project.methodManifest.nativeCoreKd3Qualified, false);
  assert.equal(project.methodManifest.codeCompliance, false);
  assert.equal(project.methodManifest.canUseForDesignAuthority, false);
  assert.equal(validateHpPipingClassProject(project).ok, true);
});

test('v2 rejects authority promotion attempts', () => {
  for (const field of ['nativeCoreKd3Qualified', 'codeCompliance', 'canUseForDesignAuthority']) {
    const project = baseProject();
    project.methodManifest[field] = true;
    const validation = validateHpPipingClassProject(project);
    assert.equal(validation.ok, false);
    assert(validation.issues.some((row) => row.path === `methodManifest.${field}` && row.code === 'AUTHORITY_PROMOTION_NOT_ALLOWED'));
  }
});

test('v2 requires explicit calculation basis and fatigue wall basis', () => {
  const project = baseProject();
  project.products[0].calculationBasis.mode = 'UNKNOWN';
  project.products[0].wallState.fatigueWallBasis = '';
  const validation = validateHpPipingClassProject(project);
  assert.equal(validation.ok, false);
  assert(validation.issues.some((row) => row.code === 'BASIS_MODE_INVALID'));
  assert(validation.issues.some((row) => row.code === 'WALL_BASIS_REQUIRED'));
});

test('v2 rejects unknown fatigue product identity and requires governed transient data', () => {
  const project = baseProject();
  project.fatigueEvidence = [{ productId: 'UNKNOWN', externalResults: [{}] }];
  const validation = validateHpPipingClassProject(project);
  assert.equal(validation.ok, false);
  assert(validation.issues.some((row) => row.code === 'FATIGUE_PRODUCT_UNKNOWN'));
  assert(validation.issues.some((row) => row.path === 'transient.spectrum'));
});

test('v2 brownfield projected wall basis requires complete future-loss custody', () => {
  const project = baseProject();
  project.products[0].wallState = {
    fatigueWallBasis: 'PROJECTED_END_OF_LIFE',
    measuredCurrentWallMm: 10.2,
    futureInternalLossMm: 1.2,
  };
  const validation = validateHpPipingClassProject(project);
  assert.equal(validation.ok, false);
  assert(validation.issues.some((row) => row.path.endsWith('futureExternalLossMm')));
});
