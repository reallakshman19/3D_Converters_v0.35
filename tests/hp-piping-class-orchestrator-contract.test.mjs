import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHpPipingClassProject,
  evaluateHpPipingClassProject,
} from '../converters/b313-chapter-ix/hp-piping-class.js';

function directProject({ withFatigue = true } = {}) {
  return createHpPipingClassProject({
    metadata: { projectId: 'P1', classId: 'HP-CS-001', revision: 'A' },
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
    transient: withFatigue ? {
      spectrum: { spectrumId: 'S1' },
      states: [
        { spectrumId: 'S1', stateId: 'LOW', pressureMpa: 2, materialTemperatureC: 40, structuralTemperatureC: 40 },
        { spectrumId: 'S1', stateId: 'HIGH', pressureMpa: 20, materialTemperatureC: 200, structuralTemperatureC: 200 },
      ],
      transitions: [{ spectrumId: 'S1', cycleId: 'C1', fromStateId: 'LOW', toStateId: 'HIGH', totalCycles: 500 }],
    } : { spectrum: null, states: [], transitions: [] },
    fatigueEvidence: withFatigue ? [{
      productId: 'NPS4-S160',
      externalResults: [{ cycleId: 'C1' }],
    }] : [],
  });
}

function governedProject() {
  const project = directProject({ withFatigue: false });
  project.products[0].calculationBasis = {
    mode: 'GOVERNED_BASIS_PACKAGE',
    basisPackage: { packageVersion: 'b313-ch9-basis-package/v1', query: {}, masters: {} },
  };
  return project;
}

function requestRecorder({ staticPass = true, fatigueOk = true } = {}) {
  const requests = [];
  return {
    requests,
    calculate(request) {
      requests.push(request);
      switch (request.calculationId) {
        case 'PIPE.B313.CH9.RESOLVE_BASIS':
          return {
            ok: true,
            outputs: {
              resolverState: 'RESOLVED_NOT_AUTHORIZED',
              outsideDiameterMm: 114.3,
              allowableStressMpa: 138,
              nominalWallMm: 13.49,
              minusTolerancePct: 12.5,
            },
          };
        case 'PIPE.B313.CH9.STRAIGHT_PRESSURE':
          return { ok: true, outputs: { staticPass } };
        case 'PIPE.B313.CH9.STRAIGHT_PRESSURE_FROM_BASIS':
          return { ok: true, outputs: { staticReferencePass: staticPass } };
        case 'PIPE.B313.CH9.WALL_STATE':
          return { ok: true, outputs: { endOfLifeEffectiveWallMm: 8.80375 } };
        case 'PIPE.B313.CH9.FATIGUE_USER_CALCULATED':
          return fatigueOk
            ? { ok: true, outputs: { usageWithinUnity: true, cumulativeUsage: 0.05 } }
            : { ok: false, errors: [{ code: 'USER_FATIGUE_BLOCKED' }] };
        default:
          return { ok: false, errors: [{ code: 'UNEXPECTED_CALCULATION_ID' }] };
      }
    },
  };
}

test('direct product maps only through central calculation IDs', () => {
  const engine = requestRecorder();
  const result = evaluateHpPipingClassProject(directProject(), { engine });
  assert.equal(result.ok, true);
  assert.deepEqual(engine.requests.map((row) => row.calculationId), [
    'PIPE.B313.CH9.STRAIGHT_PRESSURE',
    'PIPE.B313.CH9.WALL_STATE',
    'PIPE.B313.CH9.FATIGUE_USER_CALCULATED',
  ]);
  assert.equal(engine.requests[0].options.qualificationMode, 'benchmark');
  assert.equal(engine.requests[1].options.qualificationMode, 'benchmark');
  assert.equal(engine.requests[2].options.qualificationMode, undefined);
  assert.equal(engine.requests[2].inputs.effectiveWall, 8.80375);
  assert.equal(result.products[0].engineeringState, 'REVIEW_COMPLETE_NOT_AUTHORIZED');
});

test('governed product resolves basis before governed static and wall-state calculations', () => {
  const engine = requestRecorder();
  const result = evaluateHpPipingClassProject(governedProject(), { engine });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(engine.requests.map((row) => row.calculationId), [
    'PIPE.B313.CH9.RESOLVE_BASIS',
    'PIPE.B313.CH9.STRAIGHT_PRESSURE_FROM_BASIS',
    'PIPE.B313.CH9.WALL_STATE',
  ]);
  assert.equal(result.products[0].basisMode, 'GOVERNED_BASIS_PACKAGE');
  assert.equal(result.products[0].engineeringState, 'STATIC_EVALUATED_FATIGUE_NOT_SUPPLIED');
});

test('engineering reference FAIL remains a successful calculation', () => {
  const engine = requestRecorder({ staticPass: false });
  const result = evaluateHpPipingClassProject(directProject({ withFatigue: false }), { engine });
  assert.equal(result.ok, true);
  assert.equal(result.products[0].calculationOk, true);
  assert.equal(result.products[0].assessment.staticPass, false);
  assert.equal(result.products[0].engineeringState, 'STATIC_REFERENCE_FAIL');
  assert.equal(result.summary.staticReferenceFailed, 1);
});

test('provided fatigue evidence that fails evaluation blocks the product calculation', () => {
  const engine = requestRecorder({ fatigueOk: false });
  const result = evaluateHpPipingClassProject(directProject(), { engine });
  assert.equal(result.ok, false);
  assert.equal(result.projectState, 'CALCULATION_BLOCKED');
  assert.equal(result.products[0].calculationOk, false);
  assert.equal(result.products[0].engineeringState, 'FATIGUE_BLOCKED');
});

test('orchestration never promotes native KD-3, Code compliance or design authority', () => {
  const engine = requestRecorder();
  const result = evaluateHpPipingClassProject(directProject(), { engine });
  for (const scope of [result.authority, result.products[0].authority]) {
    assert.equal(scope.nativeCoreKd3Qualified, false);
    assert.equal(scope.codeCompliance, false);
    assert.equal(scope.canUseForDesignAuthority, false);
  }
});
