import { createChapterIxMasterStore } from './master-store.js';

export const HP_MASTER_DOCS_INGESTION_VERSION = 'hp-piping-class-master-docs-ingestion/v1';

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function slug(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'UNKNOWN';
}

function record(recordId, payload = {}, migrationIssues = []) {
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
    reasons: [...new Set(reasons.filter(Boolean))],
    canUseForDesignAuthority: false,
  };
}

function catalogEntry(catalog, name) {
  const entry = catalog?.[name] ?? {};
  return {
    dataset: text(entry.dataset || name),
    relativePath: text(entry.relativePath ?? entry.relative_path),
    status: text(entry.status),
    sourceVersion: text(entry.sourceVersion ?? entry.source_version),
    dependencyPath: text(entry.dependencyPath ?? entry.dependency_path),
    dependencyVersion: text(entry.dependencyVersion ?? entry.dependency_version),
  };
}

function dimensionSourceId(standard) {
  return `SRC-HP-DIM-${slug(standard)}`;
}

function dimensionIdentity(row) {
  return `DIM-NPS-${slug(row.tag ?? row.nps)}-SCH-${slug(row.schedule)}`;
}

function sourceRecords(dimensionRows, dependency) {
  const standards = [...new Set(dimensionRows.map((row) => text(row.dimensionStandard)).filter(Boolean))];
  return standards.map((standard) => record(dimensionSourceId(standard), {
    sourceId: dimensionSourceId(standard),
    role: 'PIPE_DIMENSION',
    standard,
    edition: 'SOURCE_PENDING',
    documentHash: '',
    sourceLocator: dependency.dependencyPath || dependency.relativePath || null,
    legacyDependencyVersion: dependency.dependencyVersion || dependency.sourceVersion || null,
  }, [
    'CONTROLLED_STANDARD_EDITION_NOT_RECONCILED',
    'SOURCE_SHA256_NOT_ESTABLISHED',
    'DOCS_DEPENDENCY_IS_INGESTION_EVIDENCE_NOT_DESIGN_AUTHORITY',
  ]));
}

function dimensionRecords(rows) {
  const seen = new Set();
  const records = [];
  const rejected = [];
  rows.forEach((row, index) => {
    const id = dimensionIdentity(row);
    const nps = number(row.tag ?? row.nps);
    const odMm = number(row.referenceOdMm ?? row.odMm);
    const nominalWallMm = number(row.nominalWallMm);
    const standard = text(row.dimensionStandard);
    const schedule = text(row.schedule).toUpperCase();
    const reasons = [];
    if (!(nps > 0)) reasons.push('NPS_INVALID');
    if (!(odMm > 0)) reasons.push('OUTSIDE_DIAMETER_INVALID');
    if (!(nominalWallMm > 0)) reasons.push('NOMINAL_WALL_INVALID');
    if (!standard) reasons.push('DIMENSION_STANDARD_REQUIRED');
    if (!schedule) reasons.push('SCHEDULE_REQUIRED');
    if (seen.has(id)) reasons.push('DUPLICATE_DIMENSION_IDENTITY');
    if (reasons.length) {
      rejected.push(quarantine(`Q-DIM-${index + 1}-${id}`, 'pipeDimension', row, reasons));
      return;
    }
    seen.add(id);
    records.push(record(id, {
      dimensionId: id,
      nps,
      odMm,
      schedule,
      nominalWallMm,
      dimensionStandard: standard,
      dimensionEdition: 'SOURCE_PENDING',
      sourceId: dimensionSourceId(standard),
      sourceLocator: text(row.geometrySourceRef) || `ingestion:${id}`,
    }, [
      'CONTROLLED_STANDARD_EDITION_NOT_RECONCILED',
      'SOURCE_SHA256_NOT_ESTABLISHED',
    ]));
  });
  return { records, rejected };
}

function materialQuarantine(rows, catalog) {
  if (!rows.length) {
    return [quarantine('Q-MATERIAL-DATASET-PENDING', 'materialAllowable', {
      catalog,
    }, [
      'MATERIAL_DATASET_HAS_NO_CONTROLLED_ROWS',
      'B313_ALLOWABLE_STRESS_SOURCE_REQUIRED',
      'B313_EDITION_AND_SHA256_CUSTODY_REQUIRED',
    ])];
  }
  return rows.map((row, index) => quarantine(`Q-MATERIAL-${index + 1}`, 'materialAllowable', row, [
    'MATERIAL_ID_NOT_ESTABLISHED',
    'B313_EDITION_NOT_BOUND_TO_ROW',
    'ALLOWABLE_STRESS_SOURCE_ID_AND_SHA256_REQUIRED',
    'YIELD_STRENGTH_REQUIRES_SEPARATE_PROPERTY_PROVENANCE',
  ]));
}

function productOverlayQuarantine(rows, catalog) {
  if (!rows.length) {
    return [quarantine('Q-PRODUCT-OVERLAY-PENDING', 'pipeProduct', {
      catalog,
    }, [
      'PURCHASE_PRODUCT_DATASET_HAS_NO_CONTROLLED_ROWS',
      'PRODUCT_MATERIAL_AND_MANUFACTURING_PROCESS_REQUIRED',
      'SEPARATE_PRODUCT_TOLERANCE_SOURCE_REQUIRED',
    ])];
  }
  return rows.map((row, index) => quarantine(`Q-PRODUCT-OVERLAY-${index + 1}`, 'pipeProduct', row, [
    'PRODUCT_MATERIAL_ID_REQUIRED',
    'MANUFACTURING_PROCESS_REQUIRED',
    'DIMENSION_ID_RECONCILIATION_REQUIRED',
    'TOLERANCE_RULE_ID_REQUIRED',
    'TOLERANCE_STANDARD_EDITION_AND_SHA256_REQUIRED',
    'LEGACY_OVERLAY_COLLAPSES_PRODUCT_AND_TOLERANCE_CUSTODY',
  ]));
}

export function ingestHpPipingClassDocsMasters({
  sourceRef = '',
  catalog = {},
  materialRows = [],
  dimensionRows = [],
  productOverlayRows = [],
} = {}) {
  const materialCatalog = catalogEntry(catalog, 'material');
  const productCatalog = catalogEntry(catalog, 'product_overlay');
  const dimensions = dimensionRecords(Array.isArray(dimensionRows) ? dimensionRows : []);
  const collections = {
    sources: sourceRecords(dimensions.records, productCatalog),
    materialAllowable: [],
    pipeProduct: [],
    pipeDimension: dimensions.records,
    manufacturingTolerance: [],
  };
  const quarantineRows = [
    ...dimensions.rejected,
    ...materialQuarantine(Array.isArray(materialRows) ? materialRows : [], materialCatalog),
    ...productOverlayQuarantine(Array.isArray(productOverlayRows) ? productOverlayRows : [], productCatalog),
  ];
  const store = createChapterIxMasterStore({
    metadata: {
      libraryId: 'B313-CH9-PRODUCTION-MASTERS',
      revision: 'R2-CANONICAL-RUNTIME-SOURCE-PENDING',
      migrationState: 'SOURCE_PENDING',
      runtimeRole: 'CANONICAL_RUNTIME_MASTER_STORE',
      ingestionContract: HP_MASTER_DOCS_INGESTION_VERSION,
      sourceRef: text(sourceRef),
      legacyDocsPolicy: 'CSV_TSV_ARE_INGESTION_AUTHORING_ONLY',
      note: 'Dimensions may be staged from docs evidence; material/product/tolerance rows remain quarantined until controlled source identity and independent custody are established.',
    },
    collections,
    quarantine: quarantineRows,
  });
  return {
    ok: true,
    ingestionVersion: HP_MASTER_DOCS_INGESTION_VERSION,
    store,
    summary: {
      dimensionStaged: collections.pipeDimension.length,
      sourceStaged: collections.sources.length,
      dimensionQuarantined: dimensions.rejected.length,
      materialQuarantined: materialRows.length || 1,
      productOverlayQuarantined: productOverlayRows.length || 1,
      governedProductsCreated: 0,
      allowableRowsCreated: 0,
      toleranceRowsCreated: 0,
    },
    canUseForDesignAuthority: false,
  };
}
