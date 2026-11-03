import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createChapterIxMasterStore,
  projectChapterIxResolverMasters,
  summarizeChapterIxMasterStore,
  validateChapterIxMasterStore,
} from '../converters/b313-chapter-ix/master-store.js';
import { migrateLegacyChapterIxMasters } from '../converters/b313-chapter-ix/legacy-master-migration.js';
import { calculateChapterIxStraightPressureFromBasis } from '../converters/b313-chapter-ix/straight-pipe-pipeline.js';
import { B313_CHAPTER_IX_STRAIGHT_PIPELINE_ENGINEERING_CALCULATION_DEFINITION } from '../converters/engineering-calculations/adapters/b313-chapter-ix-straight-pipeline.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

function checkedSource(overrides = {}) {
  return {
    qualificationState: 'INDEPENDENTLY_CHECKED',
    verifiedBy: 'ENGINEER_A',
    independentCheckBy: 'ENGINEER_B',
    verifiedAt: '2026-08-15T10:00:00Z',
    independentCheckedAt: '2026-08-15T11:00:00Z',
    ...overrides,
  };
}

function basisPackage(sourceState = 'INDEPENDENTLY_CHECKED') {
  const sources = [
    checkedSource({
      sourceId: 'SRC-B313', role: 'B313_ALLOWABLE_STRESS',
      standard: 'ASME B31.3', edition: '2024', documentHash: HASH_A,
      qualificationState: sourceState,
    }),
    checkedSource({
      sourceId: 'SRC-DIM', role: 'PIPE_DIMENSION',
      standard: 'TEST DIMENSION STANDARD', edition: 'R1', documentHash: HASH_B,
    }),
    checkedSource({
      sourceId: 'SRC-TOL', role: 'PRODUCT_TOLERANCE',
      standard: 'TEST TOLERANCE STANDARD', edition: 'R1', documentHash: HASH_C,
    }),
  ];
  return {
    packageVersion: 'b313-ch9-basis-package/v1',
    query: {
      materialId: 'TEST-MAT', b313Edition: '2024',
      materialTemperatureC: 100, productId: 'TEST-PROD-NPS4',
    },
    masters: {
      sources,
      materialAllowable: [{
        materialId: 'TEST-MAT', b313Edition: '2024', temperatureC: 100,
        allowableStressMpa: 138, sourceId: 'SRC-B313', sourceLocator: 'Synthetic',
        interpolationPolicy: 'LINEAR_NO_EXTRAPOLATION',
        qualificationState: 'INDEPENDENTLY_CHECKED',
      }],
      pipeProduct: [{
        productId: 'TEST-PROD-NPS4', dimensionId: 'TEST-DIM-NPS4',
        materialId: 'TEST-MAT', productSpec: 'TEST PIPE SPEC',
        manufacturingProcess: 'TEST_PROCESS', toleranceRuleId: 'TEST-TOL',
        qualificationState: 'INDEPENDENTLY_CHECKED',
      }],
      pipeDimension: [{
        dimensionId: 'TEST-DIM-NPS4', nps: 4, odMm: 114.3,
        schedule: 'TEST_160', nominalWallMm: 13.49,
        dimensionStandard: 'TEST DIMENSION STANDARD', dimensionEdition: 'R1',
        sourceId: 'SRC-DIM', sourceLocator: 'Synthetic dimension',
        qualificationState: 'INDEPENDENTLY_CHECKED',
      }],
      manufacturingTolerance: [{
        toleranceRuleId: 'TEST-TOL', productSpec: 'TEST PIPE SPEC',
        manufacturingProcess: 'TEST_PROCESS', minusTolerancePct: 12.5,
        toleranceStandard: 'TEST TOLERANCE STANDARD', toleranceEdition: 'R1',
        sourceId: 'SRC-TOL', sourceLocator: 'Synthetic tolerance',
        qualificationState: 'INDEPENDENTLY_CHECKED',
      }],
    },
  };
}

function close(actual, expected, tolerance = 1e-12) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('master store validates R1 authority ceiling and rejects design-authority records', () => {
  const store = createChapterIxMasterStore({
    metadata: { libraryId: 'TEST', revision: 'R1' },
  });
  assert.equal(validateChapterIxMasterStore(store).ok, true);
  assert.equal(summarizeChapterIxMasterStore(store).quarantineCount, 0);

  store.collections.sources.push({
    recordId: 'BAD', recordState: 'QUALIFIED', useAuthority: 'DESIGN_AUTHORITY',
  });
  const invalid = validateChapterIxMasterStore(store);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors[0], /authority ceiling/i);
});

test('legacy migration stages dimensions/products but quarantines mixed allowable and tolerance custody', () => {
  const migrated = migrateLegacyChapterIxMasters({
    sourceRef: 'Advanced_Analysis@9517988/docs/High Pr',
    sources: [{
      source_id: 'SRC-SEC2D-2025', standard: 'ASME BPVC Section II Part D',
      edition: '2025', document_hash: HASH_A, source_locator: 'Table 2A',
      verified_by: 'LEAD_PE', verified_at: '2026-01-25T13:00:00Z', status: 'ACTIVE',
    }],
    materialProperties: [{
      material_id: 'MAT-CS-A106-B', temperature_c: '100',
      allowable_stress_mpa: '138', yield_strength_mpa: '228',
      tensile_strength_mpa: '414', elastic_modulus_mpa: '199000',
      poisson_ratio: '0.30', alpha_per_c: '1.25e-05', density_kg_m3: '7850',
      source_id: 'SRC-SEC2D-2025', source_locator: 'Table 2A Line 15',
      qualification_state: 'APPROVED',
    }],
    pipeDimensions: [{
      dimension_id: 'DIM-NPS4-SCH160', nps: '4.0', od_mm: '114.30',
      schedule: 'SCH_160', nominal_wall_mm: '13.49',
      dimension_standard: 'ASME B36.10M', dimension_edition: '2022',
      source_id: 'SRC-B3610M-2022',
    }],
    pipeProducts: [{
      product_id: 'PROD-CS-NPS4-SCH160-12.5', dimension_id: 'DIM-NPS4-SCH160',
      material_id: 'MAT-CS-A106-B', product_spec: 'ASTM A106 Gr B',
      manufacturing_process: 'SEAMLESS_HOT_FINISHED',
      minus_tolerance_pct: '12.50', tolerance_basis: 'ASME_B3610M',
      source_id: 'SRC-B3610M-2022', source_locator: 'Table 2-1',
    }],
  });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.summary.dimensionRecords, 1);
  assert.equal(migrated.summary.productRecords, 1);
  assert.equal(migrated.summary.materialAllowableQuarantined, 1);
  assert.equal(migrated.summary.toleranceQuarantined, 1);
  assert.equal(migrated.store.collections.materialAllowable.length, 0);
  assert.equal(migrated.store.collections.manufacturingTolerance.length, 0);
  assert.equal(migrated.store.quarantine.length, 2);
  assert.equal(migrated.canUseForDesignAuthority, false);
  assert.equal(validateChapterIxMasterStore(migrated.store).ok, true);
});

test('projected source-pending store preserves non-authority metadata', () => {
  const store = createChapterIxMasterStore({
    collections: {
      sources: [{
        recordId: 'SRC-DRAFT', recordState: 'SOURCE_PENDING', useAuthority: 'NONE',
        sourceId: 'SRC-DRAFT', standard: 'TEST', edition: 'R1',
      }],
    },
  });
  const projected = projectChapterIxResolverMasters(store);
  assert.equal(projected.ok, true);
  assert.equal(projected.masters.sources[0].qualificationState, 'SOURCE_PENDING');
  assert.equal(projected.canUseForDesignAuthority, false);
});

test('governed basis-to-pressure pipeline reproduces frozen NPS4 software reference', () => {
  const result = calculateChapterIxStraightPressureFromBasis({
    basisPackage: basisPackage(),
    designPressureMpa: 20,
    internalAllowanceMm: 3,
    externalAllowanceMm: 0,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.resolverState, 'RESOLVED_NOT_AUTHORIZED');
  close(result.pressure.pressureDesignThicknessMm, 7.7103934983403475);
  close(result.pressure.requiredNominalThicknessMm, 12.240449712388969);
  close(result.pressure.minimumAsManufacturedThicknessMm, 11.80375);
  close(result.pressure.pressureRatingMpa, 23.086120852009273);
  assert.equal(result.referenceStatus, 'REFERENCE_PASS');
  assert.equal(result.canUseForDesignAuthority, false);
});

test('source-pending masters may calculate only as a non-authorizing reference', () => {
  const result = calculateChapterIxStraightPressureFromBasis({
    basisPackage: basisPackage('SOURCE_PENDING'),
    designPressureMpa: 20,
    internalAllowanceMm: 3,
    externalAllowanceMm: 0,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.resolverState, 'SOURCE_PENDING');
  assert.equal(result.referenceStatus, 'REFERENCE_PASS');
  assert.equal(result.canUseForDesignAuthority, false);
});

test('central governed pipeline blocks strict mode and exposes benchmark-only reference', () => {
  const definition = B313_CHAPTER_IX_STRAIGHT_PIPELINE_ENGINEERING_CALCULATION_DEFINITION;
  assert.equal(definition.id, 'PIPE.B313.CH9.STRAIGHT_PRESSURE_FROM_BASIS');
  assert.equal(definition.authority.qualificationState, 'BENCHMARK_ONLY');
  const input = {
    basisPackage: basisPackage(), designPressure: 20,
    internalAllowance: 3, externalAllowance: 0,
  };
  const strict = definition.calculate(input, { options: { qualificationMode: 'strict' } });
  assert.equal(strict.ok, false);
  assert.equal(strict.errors[0].code, 'ENGINEERING_METHOD_NOT_QUALIFIED');

  const benchmark = definition.calculate(input, { options: { qualificationMode: 'benchmark' } });
  assert.equal(benchmark.ok, true, JSON.stringify(benchmark));
  assert.equal(benchmark.outputs.staticReferencePass, true);
  assert.equal(benchmark.assessment.pass, null);
  assert.equal(benchmark.assessment.canUseForDesignAuthority, false);
  assert.equal(benchmark.qualification.effective, 'BENCHMARK_ONLY');
  assert.equal(benchmark.qualification.designAuthority, false);
});
