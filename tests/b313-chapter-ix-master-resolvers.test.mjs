import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateEngineering,
  getEngineeringCalculationDefinition,
} from '../converters/engineering-calculations/index.js';
import { resolveChapterIxAllowableStress } from '../converters/b313-chapter-ix/material-allowable-resolver.js';
import { resolveChapterIxPipeProduct } from '../converters/b313-chapter-ix/pipe-product-resolver.js';
import {
  CHAPTER_IX_BASIS_PACKAGE_VERSION,
  resolveChapterIxBasis,
} from '../converters/b313-chapter-ix/basis-resolver.js';

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

const SOURCES = Object.freeze([
  checkedSource({
    sourceId: 'SRC-TEST-B313', role: 'B313_ALLOWABLE_STRESS',
    standard: 'ASME B31.3', edition: '2024', documentHash: HASH_A,
  }),
  checkedSource({
    sourceId: 'SRC-TEST-DIM', role: 'PIPE_DIMENSION',
    standard: 'TEST DIMENSION STANDARD', edition: 'R1', documentHash: HASH_B,
  }),
  checkedSource({
    sourceId: 'SRC-TEST-TOL', role: 'PRODUCT_TOLERANCE',
    standard: 'TEST TOLERANCE STANDARD', edition: 'R1', documentHash: HASH_C,
  }),
]);

const ALLOWABLE_ROWS = Object.freeze([
  {
    materialId: 'TEST-MAT', b313Edition: '2024', temperatureC: 100,
    allowableStressMpa: 150, sourceId: 'SRC-TEST-B313', sourceLocator: 'Synthetic point 100C',
    interpolationPolicy: 'LINEAR_NO_EXTRAPOLATION', qualificationState: 'INDEPENDENTLY_CHECKED',
  },
  {
    materialId: 'TEST-MAT', b313Edition: '2024', temperatureC: 200,
    allowableStressMpa: 130, sourceId: 'SRC-TEST-B313', sourceLocator: 'Synthetic point 200C',
    interpolationPolicy: 'LINEAR_NO_EXTRAPOLATION', qualificationState: 'INDEPENDENTLY_CHECKED',
  },
]);

const PRODUCTS = Object.freeze([{
  productId: 'TEST-PROD-NPS4', dimensionId: 'TEST-DIM-NPS4', materialId: 'TEST-MAT',
  productSpec: 'TEST PIPE SPEC', manufacturingProcess: 'TEST_PROCESS',
  toleranceRuleId: 'TEST-TOL-12.5', qualificationState: 'INDEPENDENTLY_CHECKED',
}]);

const DIMENSIONS = Object.freeze([{
  dimensionId: 'TEST-DIM-NPS4', nps: 4, odMm: 114.3, schedule: 'TEST_160', nominalWallMm: 13.49,
  dimensionStandard: 'TEST DIMENSION STANDARD', dimensionEdition: 'R1',
  sourceId: 'SRC-TEST-DIM', sourceLocator: 'Synthetic dimension row',
  qualificationState: 'INDEPENDENTLY_CHECKED',
}]);

const TOLERANCES = Object.freeze([{
  toleranceRuleId: 'TEST-TOL-12.5', productSpec: 'TEST PIPE SPEC', manufacturingProcess: 'TEST_PROCESS',
  minusTolerancePct: 12.5, toleranceStandard: 'TEST TOLERANCE STANDARD', toleranceEdition: 'R1',
  sourceId: 'SRC-TEST-TOL', sourceLocator: 'Synthetic tolerance row',
  qualificationState: 'INDEPENDENTLY_CHECKED',
}]);

function basisPackage(overrides = {}) {
  return {
    packageVersion: CHAPTER_IX_BASIS_PACKAGE_VERSION,
    query: {
      materialId: 'TEST-MAT', b313Edition: '2024', materialTemperatureC: 150,
      productId: 'TEST-PROD-NPS4',
    },
    masters: {
      materialAllowable: ALLOWABLE_ROWS,
      pipeProduct: PRODUCTS,
      pipeDimension: DIMENSIONS,
      manufacturingTolerance: TOLERANCES,
      sources: SOURCES,
    },
    ...overrides,
  };
}

function close(actual, expected, tolerance = 1e-12) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('allowable-stress resolver performs exact and controlled linear interpolation without extrapolation', () => {
  const exact = resolveChapterIxAllowableStress({
    query: { materialId: 'TEST-MAT', b313Edition: '2024', temperatureC: 100 },
    rows: ALLOWABLE_ROWS, sources: SOURCES,
  });
  assert.equal(exact.ok, true, JSON.stringify(exact));
  assert.equal(exact.allowableStressMpa, 150);
  assert.equal(exact.interpolation.type, 'EXACT_TABLE_POINT');
  assert.equal(exact.resolverState, 'RESOLVED_NOT_AUTHORIZED');
  assert.equal(exact.canUseForDesignAuthority, false);

  const interpolated = resolveChapterIxAllowableStress({
    query: { materialId: 'TEST-MAT', b313Edition: '2024', temperatureC: 150 },
    rows: ALLOWABLE_ROWS, sources: SOURCES,
  });
  assert.equal(interpolated.ok, true, JSON.stringify(interpolated));
  close(interpolated.allowableStressMpa, 140);
  assert.equal(interpolated.interpolation.type, 'LINEAR_NO_EXTRAPOLATION');

  const outside = resolveChapterIxAllowableStress({
    query: { materialId: 'TEST-MAT', b313Edition: '2024', temperatureC: 250 },
    rows: ALLOWABLE_ROWS, sources: SOURCES,
  });
  assert.equal(outside.ok, false);
  assert.equal(outside.code, 'INPUT_OUTSIDE_APPLICABILITY');
});

test('allowable-stress resolver rejects Section II-D provenance presented as B31.3 allowable authority', () => {
  const sources = SOURCES.map((source) => source.sourceId === 'SRC-TEST-B313'
    ? { ...source, standard: 'ASME BPVC Section II Part D' }
    : source);
  const result = resolveChapterIxAllowableStress({
    query: { materialId: 'TEST-MAT', b313Edition: '2024', temperatureC: 100 },
    rows: ALLOWABLE_ROWS, sources,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'MASTER_RECORD_NOT_QUALIFIED');
  assert.match(result.message, /ASME B31\.3/);
});

test('allowable-stress resolver exposes source-pending values without design authority', () => {
  const sources = SOURCES.map((source) => source.sourceId === 'SRC-TEST-B313'
    ? { ...source, qualificationState: 'SOURCE_PENDING', independentCheckBy: '', independentCheckedAt: '' }
    : source);
  const result = resolveChapterIxAllowableStress({
    query: { materialId: 'TEST-MAT', b313Edition: '2024', temperatureC: 100 },
    rows: ALLOWABLE_ROWS, sources,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.resolverState, 'SOURCE_PENDING');
  assert.equal(result.canUseForDesignAuthority, false);
  assert(result.issues.includes('ALLOWABLE_SOURCE_NOT_INDEPENDENTLY_CHECKED'));
});

test('pipe-product resolver binds dimensions and tolerance to separate controlled sources', () => {
  const result = resolveChapterIxPipeProduct({
    query: { productId: 'TEST-PROD-NPS4', materialId: 'TEST-MAT' },
    products: PRODUCTS, dimensions: DIMENSIONS, tolerances: TOLERANCES, sources: SOURCES,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.resolverState, 'RESOLVED_NOT_AUTHORIZED');
  close(result.outsideDiameterMm, 114.3);
  close(result.nominalWallMm, 13.49);
  close(result.minusTolerancePct, 12.5);
  close(result.minimumAsManufacturedWallMm, 11.80375);
  assert.equal(result.provenance.dimension.sourceId, 'SRC-TEST-DIM');
  assert.equal(result.provenance.tolerance.sourceId, 'SRC-TEST-TOL');
  assert.notEqual(result.provenance.dimension.sourceId, result.provenance.tolerance.sourceId);
  assert.equal(result.canUseForDesignAuthority, false);
});

test('pipe-product resolver fails closed on legacy collapsed tolerance and applicability mismatch', () => {
  const legacy = resolveChapterIxPipeProduct({
    query: { productId: 'LEGACY', materialId: 'TEST-MAT' },
    products: [{
      productId: 'LEGACY', dimensionId: 'TEST-DIM-NPS4', materialId: 'TEST-MAT',
      productSpec: 'TEST PIPE SPEC', manufacturingProcess: 'TEST_PROCESS', minusTolerancePct: 12.5,
    }],
    dimensions: DIMENSIONS, tolerances: TOLERANCES, sources: SOURCES,
  });
  assert.equal(legacy.ok, false);
  assert.equal(legacy.code, 'MASTER_RECORD_NOT_QUALIFIED');

  const mismatched = resolveChapterIxPipeProduct({
    query: { productId: 'TEST-PROD-NPS4', materialId: 'TEST-MAT' },
    products: PRODUCTS, dimensions: DIMENSIONS,
    tolerances: [{ ...TOLERANCES[0], productSpec: 'OTHER SPEC' }], sources: SOURCES,
  });
  assert.equal(mismatched.ok, false);
  assert.match(mismatched.message, /applicability/i);
});

test('combined basis resolver preserves source state and never grants design authority', () => {
  const resolved = resolveChapterIxBasis(basisPackage());
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  assert.equal(resolved.resolverState, 'RESOLVED_NOT_AUTHORIZED');
  close(resolved.resolved.allowableStressMpa, 140);
  close(resolved.resolved.outsideDiameterMm, 114.3);
  close(resolved.resolved.minimumAsManufacturedWallMm, 11.80375);
  assert.equal(resolved.canUseForDesignAuthority, false);

  const pendingSources = SOURCES.map((source) => source.sourceId === 'SRC-TEST-TOL'
    ? { ...source, qualificationState: 'SOURCE_PENDING' }
    : source);
  const pending = resolveChapterIxBasis(basisPackage({
    masters: { ...basisPackage().masters, sources: pendingSources },
  }));
  assert.equal(pending.ok, true, JSON.stringify(pending));
  assert.equal(pending.resolverState, 'SOURCE_PENDING');
  assert.equal(pending.canUseForDesignAuthority, false);
});

test('central RESOLVE_BASIS is benchmark-only trace and fails closed on bad provenance', () => {
  const definition = getEngineeringCalculationDefinition('PIPE.B313.CH9.RESOLVE_BASIS');
  assert.equal(definition.authority.qualificationState, 'BENCHMARK_ONLY');
  assert.equal(definition.authority.codeCompliance, false);

  const strict = calculateEngineering({
    calculationId: definition.id,
    inputs: { basisPackage: basisPackage() },
    options: { qualificationMode: 'strict' },
  });
  assert.equal(strict.ok, false);
  assert.equal(strict.errors[0].code, 'ENGINEERING_METHOD_NOT_QUALIFIED');

  const benchmark = calculateEngineering({
    calculationId: definition.id,
    inputs: { basisPackage: basisPackage() },
    options: { qualificationMode: 'benchmark', includeEvidence: true },
  });
  assert.equal(benchmark.ok, true, JSON.stringify(benchmark));
  assert.equal(benchmark.outputs.resolverState, 'RESOLVED_NOT_AUTHORIZED');
  close(benchmark.outputs.allowableStressMpa, 140);
  close(benchmark.outputs.minimumAsManufacturedWallMm, 11.80375);
  assert.equal(benchmark.assessment.pass, null);
  assert.equal(benchmark.assessment.canUseForDesignAuthority, false);
  assert.equal(benchmark.qualification.effective, 'BENCHMARK_ONLY');
  assert.equal(benchmark.qualification.designAuthority, false);

  const badSources = SOURCES.map((source) => source.sourceId === 'SRC-TEST-B313'
    ? { ...source, standard: 'ASME BPVC Section II Part D' }
    : source);
  const blocked = calculateEngineering({
    calculationId: definition.id,
    inputs: { basisPackage: basisPackage({ masters: { ...basisPackage().masters, sources: badSources } }) },
    options: { qualificationMode: 'benchmark' },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors[0].code, 'MASTER_RECORD_NOT_QUALIFIED');
  assert.equal(Object.hasOwn(blocked, 'outputs'), false);
});
