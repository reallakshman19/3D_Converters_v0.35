import { createChapterIxMasterStore } from './master-store.js';

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function rec(recordId, payload = {}, migrationIssues = []) {
  return {
    recordId,
    recordState: 'SOURCE_PENDING',
    useAuthority: 'NONE',
    ...payload,
    ...(migrationIssues.length ? { migrationIssues } : {}),
  };
}

function quarantine(quarantineId, collection, candidate, reasons) {
  return {
    quarantineId,
    collection,
    candidate,
    reasons,
    canUseForDesignAuthority: false,
  };
}

function sourceRecord(row) {
  return rec(text(row.source_id), {
    sourceId: text(row.source_id),
    standard: text(row.standard),
    edition: text(row.edition),
    documentHash: text(row.document_hash),
    sourceLocator: text(row.source_locator),
    legacyStatus: text(row.status),
    legacyVerifiedBy: text(row.verified_by),
    legacyVerifiedAt: text(row.verified_at),
  }, ['SOURCE_ROLE_UNASSIGNED', 'INDEPENDENT_CHECK_CUSTODY_MISSING']);
}

function dimensionRecord(row) {
  return rec(text(row.dimension_id), {
    dimensionId: text(row.dimension_id),
    nps: number(row.nps),
    odMm: number(row.od_mm),
    schedule: text(row.schedule),
    nominalWallMm: number(row.nominal_wall_mm),
    dimensionStandard: text(row.dimension_standard),
    dimensionEdition: text(row.dimension_edition),
    sourceId: text(row.source_id),
    sourceLocator: `legacy:${text(row.dimension_id)}`,
  }, ['SOURCE_ROLE_RECONCILIATION_REQUIRED']);
}

function productRecord(row) {
  return rec(text(row.product_id), {
    productId: text(row.product_id),
    dimensionId: text(row.dimension_id),
    materialId: text(row.material_id),
    productSpec: text(row.product_spec),
    manufacturingProcess: text(row.manufacturing_process),
  }, ['TOLERANCE_RULE_UNRESOLVED']);
}

function materialCandidate(row) {
  return {
    materialId: text(row.material_id),
    b313Edition: null,
    temperatureC: number(row.temperature_c),
    allowableStressMpa: number(row.allowable_stress_mpa),
    sourceId: text(row.source_id),
    sourceLocator: text(row.source_locator),
    legacyQualificationState: text(row.qualification_state),
    mixedMechanicalProperties: {
      yieldStrengthMpa: number(row.yield_strength_mpa),
      tensileStrengthMpa: number(row.tensile_strength_mpa),
      elasticModulusMpa: number(row.elastic_modulus_mpa),
      poissonRatio: number(row.poisson_ratio),
      alphaPerC: number(row.alpha_per_c),
      densityKgM3: number(row.density_kg_m3),
    },
  };
}

function toleranceCandidate(row) {
  return {
    productId: text(row.product_id),
    productSpec: text(row.product_spec),
    manufacturingProcess: text(row.manufacturing_process),
    minusTolerancePct: number(row.minus_tolerance_pct),
    toleranceBasis: text(row.tolerance_basis),
    legacySourceId: text(row.source_id),
    legacySourceLocator: text(row.source_locator),
  };
}

function migrateMaterials(rows, quarantineRows) {
  for (const row of rows) {
    const id = `Q-MAT-${text(row.material_id)}-${text(row.temperature_c)}`;
    quarantineRows.push(quarantine(id, 'materialAllowable', materialCandidate(row), [
      'ALLOWABLE_STRESS_SOURCE_DOMAIN_REQUIRES_B313_RECONCILIATION',
      'MIXED_MATERIAL_PROPERTY_ROW_REQUIRES_PROVENANCE_SPLIT',
      'B313_EDITION_NOT_BOUND_TO_LEGACY_ROW',
    ]));
  }
}

function migrateProducts(rows, collections, quarantineRows) {
  for (const row of rows) {
    collections.pipeProduct.push(productRecord(row));
    const id = `Q-TOL-${text(row.product_id)}`;
    quarantineRows.push(quarantine(id, 'manufacturingTolerance', toleranceCandidate(row), [
      'LEGACY_PRODUCT_COLLAPSES_DIMENSION_AND_TOLERANCE_CUSTODY',
      'TOLERANCE_STANDARD_SOURCE_IDENTITY_NOT_SEPARATELY_CONTROLLED',
      'TOLERANCE_RULE_ID_NOT_ESTABLISHED',
    ]));
  }
}

export function migrateLegacyChapterIxMasters({
  sourceRef = '',
  sources = [],
  materialProperties = [],
  pipeDimensions = [],
  pipeProducts = [],
} = {}) {
  const collections = {
    sources: sources.filter((row) => text(row.source_id)).map(sourceRecord),
    materialAllowable: [],
    pipeProduct: [],
    pipeDimension: pipeDimensions.filter((row) => text(row.dimension_id)).map(dimensionRecord),
    manufacturingTolerance: [],
  };
  const quarantineRows = [];
  migrateMaterials(materialProperties, quarantineRows);
  migrateProducts(pipeProducts, collections, quarantineRows);
  const store = createChapterIxMasterStore({
    metadata: {
      libraryId: 'B313-CH9-PRODUCTION-MASTERS',
      revision: 'R1-SOURCE-PENDING',
      sourceRef: text(sourceRef),
      migrationState: 'SOURCE_PENDING',
      note: 'Legacy rows are staged or quarantined; no migrated record is design authority.',
    },
    collections,
    quarantine: quarantineRows,
  });
  return {
    ok: true,
    store,
    summary: {
      sourceRecords: collections.sources.length,
      dimensionRecords: collections.pipeDimension.length,
      productRecords: collections.pipeProduct.length,
      materialAllowableQuarantined: materialProperties.length,
      toleranceQuarantined: pipeProducts.length,
    },
    canUseForDesignAuthority: false,
  };
}
