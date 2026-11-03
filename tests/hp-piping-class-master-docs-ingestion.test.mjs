import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HP_MASTER_DOCS_INGESTION_VERSION,
  ingestHpPipingClassDocsMasters,
} from '../converters/b313-chapter-ix/master-docs-ingestion.js';
import {
  projectChapterIxResolverMasters,
  validateChapterIxMasterStore,
} from '../converters/b313-chapter-ix/master-store.js';

function catalog() {
  return {
    material: {
      dataset: 'material', relativePath: 'material-properties.csv', status: 'HEADER_ONLY', sourceVersion: 'TEMPLATE-V1',
    },
    product_overlay: {
      dataset: 'product_overlay', relativePath: 'pipe-product-overrides.csv', status: 'HEADER_ONLY', sourceVersion: 'TEMPLATE-V1',
      dependencyPath: '../NPS_OD_BORE_SCHEDULE_MASTER.tsv', dependencyVersion: '7e83f7283b4ca9f35a86a45c008ca0b52a053fcc',
    },
  };
}

function dimensionRows() {
  return [
    { tag: '4', schedule: '160', dimensionStandard: 'ASME B36.10M', referenceOdMm: '114', nominalWallMm: '13.4874', geometrySourceRef: 'pipe master row 11 / 160' },
    { tag: '4', schedule: '40S', dimensionStandard: 'ASME B36.19M', referenceOdMm: '114', nominalWallMm: '6.0198', geometrySourceRef: 'pipe master row 11 / 40S' },
  ];
}

test('docs ingestion stages dimension geometry but creates no governed material/product/tolerance records', () => {
  const result = ingestHpPipingClassDocsMasters({
    sourceRef: 'docs/Masters/HP_Piping_Class',
    catalog: catalog(),
    dimensionRows: dimensionRows(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.ingestionVersion, HP_MASTER_DOCS_INGESTION_VERSION);
  assert.equal(result.canUseForDesignAuthority, false);
  assert.equal(result.store.metadata.runtimeRole, 'CANONICAL_RUNTIME_MASTER_STORE');
  assert.equal(result.store.metadata.legacyDocsPolicy, 'CSV_TSV_ARE_INGESTION_AUTHORING_ONLY');
  assert.equal(result.store.collections.pipeDimension.length, 2);
  assert.equal(result.store.collections.sources.length, 2);
  assert.equal(result.store.collections.materialAllowable.length, 0);
  assert.equal(result.store.collections.pipeProduct.length, 0);
  assert.equal(result.store.collections.manufacturingTolerance.length, 0);
  assert.equal(result.summary.governedProductsCreated, 0);
  assert.equal(result.summary.allowableRowsCreated, 0);
  assert.equal(result.summary.toleranceRowsCreated, 0);
  assert.equal(validateChapterIxMasterStore(result.store).ok, true);
});

test('header-only material and product overlay datasets remain explicit quarantined blockers', () => {
  const result = ingestHpPipingClassDocsMasters({ catalog: catalog(), dimensionRows: dimensionRows() });
  const ids = result.store.quarantine.map((row) => row.quarantineId);
  assert(ids.includes('Q-MATERIAL-DATASET-PENDING'));
  assert(ids.includes('Q-PRODUCT-OVERLAY-PENDING'));
  const material = result.store.quarantine.find((row) => row.quarantineId === 'Q-MATERIAL-DATASET-PENDING');
  assert(material.reasons.includes('B313_ALLOWABLE_STRESS_SOURCE_REQUIRED'));
  const product = result.store.quarantine.find((row) => row.quarantineId === 'Q-PRODUCT-OVERLAY-PENDING');
  assert(product.reasons.includes('SEPARATE_PRODUCT_TOLERANCE_SOURCE_REQUIRED'));
  assert.equal(material.canUseForDesignAuthority, false);
  assert.equal(product.canUseForDesignAuthority, false);
});

test('legacy material rows are quarantined rather than projected as B31.3 allowable authority', () => {
  const result = ingestHpPipingClassDocsMasters({
    catalog: catalog(),
    materialRows: [{ materialSpec: 'SA-106', grade: 'B', temperatureC: '100', allowableStressMpa: '100', yieldStrengthMpa: '240', sourceRef: 'legacy row' }],
    dimensionRows: dimensionRows(),
  });
  assert.equal(result.store.collections.materialAllowable.length, 0);
  assert(result.store.quarantine.some((row) => row.collection === 'materialAllowable'
    && row.reasons.includes('B313_EDITION_NOT_BOUND_TO_ROW')));
});

test('legacy product overlay rows are quarantined because product and tolerance custody are collapsed', () => {
  const result = ingestHpPipingClassDocsMasters({
    catalog: catalog(),
    dimensionRows: dimensionRows(),
    productOverlayRows: [{ nps: '4', schedule: '160', productSpec: 'A106-B', designDiameterMm: '114.3', minusTolerancePct: '12.5', sourceRef: 'legacy overlay' }],
  });
  assert.equal(result.store.collections.pipeProduct.length, 0);
  assert.equal(result.store.collections.manufacturingTolerance.length, 0);
  assert(result.store.quarantine.some((row) => row.reasons.includes('LEGACY_OVERLAY_COLLAPSES_PRODUCT_AND_TOLERANCE_CUSTODY')));
});

test('staged dimensions project to resolver masters as SOURCE_PENDING and never gain design authority', () => {
  const result = ingestHpPipingClassDocsMasters({ catalog: catalog(), dimensionRows: dimensionRows() });
  const projected = projectChapterIxResolverMasters(result.store);
  assert.equal(projected.ok, true);
  assert.equal(projected.canUseForDesignAuthority, false);
  assert.equal(projected.masters.pipeDimension.length, 2);
  assert(projected.masters.pipeDimension.every((row) => row.qualificationState === 'SOURCE_PENDING'));
  assert(projected.masters.sources.every((row) => row.qualificationState === 'SOURCE_PENDING'));
});

test('invalid or duplicate dimension identities are quarantined instead of silently overwritten', () => {
  const rows = [...dimensionRows(), { ...dimensionRows()[0] }, { tag: '0', schedule: '', dimensionStandard: '', referenceOdMm: '', nominalWallMm: '' }];
  const result = ingestHpPipingClassDocsMasters({ catalog: catalog(), dimensionRows: rows });
  assert.equal(result.store.collections.pipeDimension.length, 2);
  assert(result.store.quarantine.some((row) => row.reasons.includes('DUPLICATE_DIMENSION_IDENTITY')));
  assert(result.store.quarantine.some((row) => row.reasons.includes('NPS_INVALID')));
});
