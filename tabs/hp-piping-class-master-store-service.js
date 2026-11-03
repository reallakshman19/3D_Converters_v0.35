import {
  projectChapterIxResolverMasters,
  summarizeChapterIxMasterStore,
  validateChapterIxMasterStore,
} from '../converters/b313-chapter-ix/master-store.js';
import { CHAPTER_IX_BASIS_PACKAGE_VERSION } from '../converters/b313-chapter-ix/basis-resolver.js';

export const HP_PIPING_CLASS_MASTER_STORE_URL = './engineering/hp-class-standardization/masters/b313-ch9-master-store.json';
export const HP_PIPING_CLASS_MASTER_RUNTIME_VERSION = 'hp-piping-class-master-runtime/v1';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value ?? '').trim();
}

function finiteSelectionNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function runtimeAuthority() {
  return {
    runtimeMasterSource: 'B313_CH9_MASTER_STORE_V1',
    legacyDocsRuntimeAuthority: false,
    canUseForDesignAuthority: false,
  };
}

function failed(code, message, details = {}) {
  return {
    ok: false,
    code,
    message,
    details,
    store: null,
    choices: { materials: [], products: [] },
    authority: runtimeAuthority(),
  };
}

function unique(values) {
  const present = values.filter((value) => value !== undefined && value !== null && value !== '');
  return [...new Set(present)].sort((a, b) => String(a).localeCompare(String(b)));
}

function selectionCheck(masters, { materialId, b313Edition, productId }) {
  const materialRows = masters.materialAllowable.filter((row) => text(row.materialId) === materialId && text(row.b313Edition) === b313Edition);
  if (!materialRows.length) {
    return failed('MASTER_SELECTION_NOT_FOUND', `No canonical allowable-stress rows exist for material ${materialId} and B31.3 edition ${b313Edition}.`);
  }
  const products = masters.pipeProduct.filter((row) => text(row.productId) === productId);
  if (products.length !== 1) {
    return failed(
      products.length ? 'MASTER_SELECTION_AMBIGUOUS' : 'MASTER_SELECTION_NOT_FOUND',
      `Canonical product ${productId} must resolve to exactly one master record.`,
      { matches: products.length },
    );
  }
  if (text(products[0].materialId) !== materialId) {
    return failed('MASTER_SELECTION_MISMATCH', `Canonical product ${productId} is not bound to material ${materialId}.`);
  }
  return { ok: true };
}

export function listHpPipingClassMasterChoices(store = {}) {
  const validation = validateChapterIxMasterStore(store);
  if (!validation.ok) return failed('MASTER_STORE_INVALID', validation.errors[0], { errors: validation.errors });
  const projected = projectChapterIxResolverMasters(store);
  if (!projected.ok) return failed(projected.code, projected.message, projected.details);
  const masters = projected.masters;
  const materials = unique(masters.materialAllowable.map((row) => text(row.materialId))).map((materialId) => ({
    materialId,
    editions: unique(masters.materialAllowable.filter((row) => text(row.materialId) === materialId).map((row) => text(row.b313Edition))),
    temperaturesC: unique(masters.materialAllowable.filter((row) => text(row.materialId) === materialId).map((row) => row.temperatureC)),
  }));
  const products = masters.pipeProduct.map((row) => ({
    productId: text(row.productId),
    materialId: text(row.materialId),
    dimensionId: text(row.dimensionId),
    productSpec: text(row.productSpec),
    manufacturingProcess: text(row.manufacturingProcess),
    toleranceRuleId: text(row.toleranceRuleId),
    qualificationState: text(row.qualificationState),
  })).filter((row) => row.productId);
  return {
    ok: true,
    materials,
    products,
    quarantineCount: store.quarantine.length,
    authority: runtimeAuthority(),
  };
}

export function createHpPipingClassGovernedBasisPackage({
  store,
  materialId,
  b313Edition,
  materialTemperatureC,
  productId,
} = {}) {
  const validation = validateChapterIxMasterStore(store);
  if (!validation.ok) return failed('MASTER_STORE_INVALID', validation.errors[0], { errors: validation.errors });
  const projected = projectChapterIxResolverMasters(store);
  if (!projected.ok) return failed(projected.code, projected.message, projected.details);
  const selectedMaterialId = text(materialId);
  const selectedEdition = text(b313Edition);
  const selectedProductId = text(productId);
  const temperature = finiteSelectionNumber(materialTemperatureC);
  if (!selectedMaterialId || !selectedEdition || temperature === null || !selectedProductId) {
    return failed('MASTER_SELECTION_INCOMPLETE', 'materialId, b313Edition, finite materialTemperatureC and productId are required.');
  }
  const selected = selectionCheck(projected.masters, {
    materialId: selectedMaterialId,
    b313Edition: selectedEdition,
    productId: selectedProductId,
  });
  if (!selected.ok) return selected;
  return {
    ok: true,
    basisPackage: {
      packageVersion: CHAPTER_IX_BASIS_PACKAGE_VERSION,
      query: {
        materialId: selectedMaterialId,
        b313Edition: selectedEdition,
        materialTemperatureC: temperature,
        productId: selectedProductId,
      },
      masters: clone(projected.masters),
    },
    authority: runtimeAuthority(),
  };
}

export function validateHpPipingClassGovernedBasisCustody({ store, basisPackage } = {}) {
  const validation = validateChapterIxMasterStore(store);
  if (!validation.ok) return failed('MASTER_STORE_INVALID', validation.errors[0], { errors: validation.errors });
  if (!basisPackage || typeof basisPackage !== 'object' || Array.isArray(basisPackage)) {
    return failed('GOVERNED_BASIS_CUSTODY_BLOCKED', 'Governed basis package is required for canonical master-store custody validation.');
  }
  if (basisPackage.packageVersion !== CHAPTER_IX_BASIS_PACKAGE_VERSION) {
    return failed('GOVERNED_BASIS_CUSTODY_BLOCKED', `Governed basis package must use ${CHAPTER_IX_BASIS_PACKAGE_VERSION}.`);
  }
  const projected = projectChapterIxResolverMasters(store);
  if (!projected.ok) return failed(projected.code, projected.message, projected.details);
  if (stableJson(basisPackage.masters) !== stableJson(projected.masters)) {
    return failed(
      'GOVERNED_BASIS_CUSTODY_BLOCKED',
      'Governed basis masters do not reproduce the currently loaded canonical b313-ch9-master-store/v1 projection.',
    );
  }
  const query = basisPackage.query ?? {};
  const selectedMaterialId = text(query.materialId);
  const selectedEdition = text(query.b313Edition);
  const selectedProductId = text(query.productId);
  const temperature = finiteSelectionNumber(query.materialTemperatureC);
  if (!selectedMaterialId || !selectedEdition || temperature === null || !selectedProductId) {
    return failed('GOVERNED_BASIS_CUSTODY_BLOCKED', 'Governed basis query custody is incomplete.');
  }
  const selected = selectionCheck(projected.masters, {
    materialId: selectedMaterialId,
    b313Edition: selectedEdition,
    productId: selectedProductId,
  });
  if (!selected.ok) {
    return failed('GOVERNED_BASIS_CUSTODY_BLOCKED', selected.message, { selectionCode: selected.code, ...(selected.details ?? {}) });
  }
  return {
    ok: true,
    query: { ...clone(query), materialTemperatureC: temperature },
    authority: runtimeAuthority(),
    canUseForDesignAuthority: false,
  };
}

export async function loadHpPipingClassMasterStore({
  fetchImpl = globalThis.fetch,
  url = HP_PIPING_CLASS_MASTER_STORE_URL,
} = {}) {
  if (typeof fetchImpl !== 'function') return failed('MASTER_STORE_FETCH_UNAVAILABLE', 'A fetch implementation is required to load the canonical master store.');
  try {
    const response = await fetchImpl(url, { cache: 'no-store' });
    if (!response?.ok) return failed('MASTER_STORE_FETCH_FAILED', `Canonical master-store fetch failed with status ${response?.status ?? 'unknown'}.`, { url });
    const store = await response.json();
    const validation = validateChapterIxMasterStore(store);
    if (!validation.ok) return failed('MASTER_STORE_INVALID', validation.errors[0], { errors: validation.errors });
    const summary = summarizeChapterIxMasterStore(store);
    const choices = listHpPipingClassMasterChoices(store);
    if (!choices.ok) return choices;
    return {
      ok: true,
      runtimeVersion: HP_PIPING_CLASS_MASTER_RUNTIME_VERSION,
      url,
      store: clone(store),
      summary: clone(summary),
      choices: { materials: choices.materials, products: choices.products },
      authority: runtimeAuthority(),
    };
  } catch (error) {
    return failed('MASTER_STORE_FETCH_FAILED', error instanceof Error ? error.message : String(error));
  }
}
