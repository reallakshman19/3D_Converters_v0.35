import { resolveChapterIxAllowableStress } from './material-allowable-resolver.js';
import { resolveChapterIxPipeProduct } from './pipe-product-resolver.js';

export const CHAPTER_IX_BASIS_PACKAGE_VERSION = 'b313-ch9-basis-package/v1';

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

function validateEnvelope(input) {
  if (input.packageVersion !== CHAPTER_IX_BASIS_PACKAGE_VERSION) {
    return failure('INPUT_INVALID', 'Unsupported or missing Chapter IX basis package version.');
  }
  const query = input.query ?? {};
  for (const field of ['materialId', 'b313Edition', 'productId']) {
    if (!text(query[field])) return failure('INPUT_INVALID', `query.${field} is required.`, { field });
  }
  if (typeof query.materialTemperatureC !== 'number' || !Number.isFinite(query.materialTemperatureC)) {
    return failure('INPUT_INVALID', 'query.materialTemperatureC must be a finite number.');
  }
  const masters = input.masters ?? {};
  for (const field of ['materialAllowable', 'pipeProduct', 'pipeDimension', 'manufacturingTolerance', 'sources']) {
    if (!Array.isArray(masters[field])) {
      return failure('MASTER_DATA_REQUIRED', `masters.${field} must be an array.`, { field });
    }
  }
  return null;
}

function failedStage(stage, result) {
  return failure(result.code ?? 'MASTER_RECORD_NOT_QUALIFIED', result.message ?? `${stage} resolution failed.`, {
    stage,
    resolverState: result.resolverState ?? null,
    ...(result.details ?? {}),
  });
}

export function resolveChapterIxBasis(input = {}) {
  const envelopeError = validateEnvelope(input);
  if (envelopeError) return envelopeError;
  const { query, masters } = input;

  const material = resolveChapterIxAllowableStress({
    query: {
      materialId: query.materialId,
      b313Edition: query.b313Edition,
      temperatureC: query.materialTemperatureC,
    },
    rows: masters.materialAllowable,
    sources: masters.sources,
  });
  if (!material.ok) return failedStage('MATERIAL_ALLOWABLE', material);

  const product = resolveChapterIxPipeProduct({
    query: { productId: query.productId, materialId: query.materialId },
    products: masters.pipeProduct,
    dimensions: masters.pipeDimension,
    tolerances: masters.manufacturingTolerance,
    sources: masters.sources,
  });
  if (!product.ok) return failedStage('PIPE_PRODUCT', product);

  const issues = [...new Set([...(material.issues ?? []), ...(product.issues ?? [])])];
  return {
    ok: true,
    resolverState: issues.length ? 'SOURCE_PENDING' : 'RESOLVED_NOT_AUTHORIZED',
    canUseForDesignAuthority: false,
    query: {
      materialId: text(query.materialId),
      b313Edition: text(query.b313Edition),
      materialTemperatureC: query.materialTemperatureC,
      productId: text(query.productId),
    },
    resolved: {
      allowableStressMpa: material.allowableStressMpa,
      outsideDiameterMm: product.outsideDiameterMm,
      nominalWallMm: product.nominalWallMm,
      minusTolerancePct: product.minusTolerancePct,
      minimumAsManufacturedWallMm: product.minimumAsManufacturedWallMm,
    },
    material,
    product,
    issues,
  };
}
