const READY_STATES = new Set(['INDEPENDENTLY_CHECKED', 'QUALIFIED', 'VERIFIED']);

function failure(code, message, details = {}) {
  return {
    ok: false,
    code,
    message,
    details,
    resolverState: 'SOURCE_PENDING',
    canUseForDesignAuthority: false,
  };
}

function text(value) {
  return String(value ?? '').trim();
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validHash(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(text(value));
}

function exactlyOne(rows, predicate, label) {
  const matches = rows.filter(predicate);
  if (matches.length !== 1) {
    return failure(
      matches.length ? 'MASTER_RECORD_AMBIGUOUS' : 'MASTER_RECORD_NOT_FOUND',
      `${label} must resolve to exactly one record.`,
      { matches: matches.length },
    );
  }
  return { ok: true, row: matches[0] };
}

function sourceRecord(sourceId, sources, label) {
  const resolved = exactlyOne(
    sources,
    (source) => text(source?.sourceId) === text(sourceId),
    `${label} source ${sourceId ?? '(missing)'}`,
  );
  return resolved.ok ? { ok: true, source: resolved.row } : resolved;
}

function sourceContract(source, expected) {
  if (text(source.role) !== expected.role) {
    return `${expected.label} source role must be ${expected.role}.`;
  }
  if (text(source.standard) !== text(expected.standard)) {
    return `${expected.label} source standard must equal ${expected.standard}.`;
  }
  if (text(source.edition) !== text(expected.edition)) {
    return `${expected.label} source edition must equal ${expected.edition}.`;
  }
  if (!validHash(source.documentHash)) {
    return `${expected.label} source requires an exact sha256 document hash.`;
  }
  return null;
}

function evidenceIssues(label, record, source) {
  const issues = [];
  if (!READY_STATES.has(text(record.qualificationState))) {
    issues.push(`${label}_RECORD_NOT_INDEPENDENTLY_CHECKED`);
  }
  if (!READY_STATES.has(text(source.qualificationState))) {
    issues.push(`${label}_SOURCE_NOT_INDEPENDENTLY_CHECKED`);
  }
  if (!text(source.verifiedBy) || !text(source.independentCheckBy)
      || text(source.verifiedBy) === text(source.independentCheckBy)) {
    issues.push(`${label}_SOURCE_CUSTODY_INCOMPLETE`);
  }
  if (!text(source.verifiedAt) || !text(source.independentCheckedAt)) {
    issues.push(`${label}_SOURCE_TIMESTAMPS_INCOMPLETE`);
  }
  return issues;
}

function validateProduct(product, query) {
  if (text(product.materialId) !== text(query.materialId)) {
    return failure('MASTER_RECORD_NOT_QUALIFIED', 'Selected product material does not match the requested material.', {
      productMaterialId: product.materialId ?? null,
      requestedMaterialId: query.materialId ?? null,
    });
  }
  for (const field of ['dimensionId', 'productSpec', 'manufacturingProcess', 'toleranceRuleId']) {
    if (!text(product[field])) {
      return failure('MASTER_RECORD_NOT_QUALIFIED', `Selected product requires ${field}.`, { field });
    }
  }
  if (product.minusTolerancePct !== undefined && !text(product.toleranceRuleId)) {
    return failure('MASTER_RECORD_NOT_QUALIFIED', 'Legacy collapsed tolerance on a product row is not accepted without a separate toleranceRuleId.');
  }
  return null;
}

function validateDimension(dimension, sources) {
  if (!finite(dimension.odMm) || !(dimension.odMm > 0)
      || !finite(dimension.nominalWallMm) || !(dimension.nominalWallMm > 0)) {
    return failure('MASTER_RECORD_NOT_QUALIFIED', 'Dimension row requires positive finite odMm and nominalWallMm.');
  }
  for (const field of ['dimensionStandard', 'dimensionEdition', 'sourceId', 'sourceLocator']) {
    if (!text(dimension[field])) {
      return failure('MASTER_RECORD_NOT_QUALIFIED', `Dimension row requires ${field}.`, { field });
    }
  }
  const resolved = sourceRecord(dimension.sourceId, sources, 'Dimension');
  if (!resolved.ok) return resolved;
  const error = sourceContract(resolved.source, {
    role: 'PIPE_DIMENSION',
    standard: dimension.dimensionStandard,
    edition: dimension.dimensionEdition,
    label: 'Dimension',
  });
  if (error) return failure('MASTER_RECORD_NOT_QUALIFIED', error, { sourceId: dimension.sourceId });
  return { ok: true, source: resolved.source, issues: evidenceIssues('DIMENSION', dimension, resolved.source) };
}

function validateTolerance(tolerance, product, sources) {
  if (!finite(tolerance.minusTolerancePct)
      || tolerance.minusTolerancePct < 0 || tolerance.minusTolerancePct >= 100) {
    return failure('MASTER_RECORD_NOT_QUALIFIED', 'Tolerance row requires minusTolerancePct >= 0 and < 100%.');
  }
  if (text(tolerance.productSpec) !== text(product.productSpec)
      || text(tolerance.manufacturingProcess) !== text(product.manufacturingProcess)) {
    return failure('MASTER_RECORD_NOT_QUALIFIED', 'Tolerance rule applicability does not match the selected product specification and manufacturing process.');
  }
  for (const field of ['toleranceStandard', 'toleranceEdition', 'sourceId', 'sourceLocator']) {
    if (!text(tolerance[field])) {
      return failure('MASTER_RECORD_NOT_QUALIFIED', `Tolerance row requires ${field}.`, { field });
    }
  }
  const resolved = sourceRecord(tolerance.sourceId, sources, 'Tolerance');
  if (!resolved.ok) return resolved;
  const error = sourceContract(resolved.source, {
    role: 'PRODUCT_TOLERANCE',
    standard: tolerance.toleranceStandard,
    edition: tolerance.toleranceEdition,
    label: 'Tolerance',
  });
  if (error) return failure('MASTER_RECORD_NOT_QUALIFIED', error, { sourceId: tolerance.sourceId });
  return { ok: true, source: resolved.source, issues: evidenceIssues('TOLERANCE', tolerance, resolved.source) };
}

function productEvidenceIssues(product) {
  return READY_STATES.has(text(product.qualificationState))
    ? []
    : ['PRODUCT_RECORD_NOT_INDEPENDENTLY_CHECKED'];
}

export function resolveChapterIxPipeProduct({
  query = {}, products = [], dimensions = [], tolerances = [], sources = [],
} = {}) {
  if (!text(query.productId) || !text(query.materialId)) {
    return failure('INPUT_INVALID', 'productId and materialId are required.');
  }
  const selectedProduct = exactlyOne(
    products,
    (row) => text(row?.productId) === text(query.productId),
    `Product ${query.productId}`,
  );
  if (!selectedProduct.ok) return selectedProduct;
  const product = selectedProduct.row;
  const productError = validateProduct(product, query);
  if (productError) return productError;

  const selectedDimension = exactlyOne(
    dimensions,
    (row) => text(row?.dimensionId) === text(product.dimensionId),
    `Dimension ${product.dimensionId}`,
  );
  if (!selectedDimension.ok) return selectedDimension;
  const dimension = selectedDimension.row;
  const dimensionCheck = validateDimension(dimension, sources);
  if (!dimensionCheck.ok) return dimensionCheck;

  const selectedTolerance = exactlyOne(
    tolerances,
    (row) => text(row?.toleranceRuleId) === text(product.toleranceRuleId),
    `Tolerance rule ${product.toleranceRuleId}`,
  );
  if (!selectedTolerance.ok) return selectedTolerance;
  const tolerance = selectedTolerance.row;
  const toleranceCheck = validateTolerance(tolerance, product, sources);
  if (!toleranceCheck.ok) return toleranceCheck;

  const issues = [...new Set([
    ...productEvidenceIssues(product),
    ...dimensionCheck.issues,
    ...toleranceCheck.issues,
  ])];
  const toleranceFactor = 1 - tolerance.minusTolerancePct / 100;
  return {
    ok: true,
    resolverState: issues.length ? 'SOURCE_PENDING' : 'RESOLVED_NOT_AUTHORIZED',
    canUseForDesignAuthority: false,
    productId: text(product.productId),
    materialId: text(product.materialId),
    productSpec: text(product.productSpec),
    manufacturingProcess: text(product.manufacturingProcess),
    dimensionId: text(dimension.dimensionId),
    nps: dimension.nps ?? null,
    schedule: dimension.schedule ?? null,
    outsideDiameterMm: dimension.odMm,
    nominalWallMm: dimension.nominalWallMm,
    toleranceRuleId: text(tolerance.toleranceRuleId),
    minusTolerancePct: tolerance.minusTolerancePct,
    minimumAsManufacturedWallMm: dimension.nominalWallMm * toleranceFactor,
    provenance: {
      dimension: {
        sourceId: dimension.sourceId,
        sourceLocator: dimension.sourceLocator,
        documentHash: dimensionCheck.source.documentHash,
      },
      tolerance: {
        sourceId: tolerance.sourceId,
        sourceLocator: tolerance.sourceLocator,
        documentHash: toleranceCheck.source.documentHash,
      },
    },
    issues,
  };
}
