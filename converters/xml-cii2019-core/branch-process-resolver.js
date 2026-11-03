import { cleanMaterialText, cleanMaterialCode } from './linelist-mapping.js';
import { findBestPipingClassRow, normalizePipingClass } from './piping-class-resolver.js';
import { resolveConfiguredMaterialCode } from './piping-class-material-code-resolver.js';
import {
  normalizeXmlCiiMaterialIdentity,
  resolveXmlCiiMaterialCodeFromMap,
} from './material-code-fuzzy-resolver.js';
import { resolveXmlCiiAutomaticRating } from './dtxr-rating-resolver.js';
import { selectXmlCiiRequestedPipingClass } from './piping-class-source-resolver.js';
import { toFiniteNumber } from './config.js';
import { buildXmlCiiServiceProcessFallback } from './service-process-fallback.js';

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function headerKey(value) { return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, ''); }

function readAny(row, keys) {
  if (!row || typeof row !== 'object') return '';
  const wanted = (keys || []).map(headerKey).filter(Boolean);
  for (const source of [row, row._raw]) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys || []) if (text(source[key])) return text(source[key]);
    for (const [key, value] of Object.entries(source)) {
      if (wanted.includes(headerKey(key)) && text(value)) return text(value);
    }
  }
  return '';
}

function numberAny(row, keys) {
  const match = readAny(row, keys).replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
  const value = match ? Number(match[0]) : NaN;
  return Number.isFinite(value) ? value : null;
}

function overrideRecord(overrides, bucketName, keys = []) {
  const bucket = overrides?.[bucketName];
  if (bucket && typeof bucket === 'object' && !Array.isArray(bucket)) {
    for (const key of keys) {
      if (key && Object.hasOwn(bucket, key) && text(bucket[key])) {
        return { key: text(key), value: text(bucket[key]) };
      }
    }
    return null;
  }
  const value = bucket !== undefined && (typeof bucket !== 'object' || bucket === null)
    ? text(bucket)
    : '';
  return value ? { key: '', value } : null;
}

function overrideValue(overrides, bucketName, keys = []) {
  return overrideRecord(overrides, bucketName, keys)?.value || '';
}

function numericOverrideValue(overrides, bucketName, keys = []) {
  const value = toFiniteNumber(overrideValue(overrides, bucketName, keys));
  return value == null ? null : value;
}

function readClassRowRating(row) {
  return readAny(row, ['rating', 'Rating', 'RATING', 'Pressure Class', 'classRating', 'Class Rating', 'PRESSURE_CLASS']);
}

function classRowMaterial(row) {
  return readAny(row, ['materialName', 'Material_Name', 'Material Name', 'Material', 'material', 'MATERIAL', 'Mat', 'MAT', 'MOC']);
}

function directMaterialCode(row) {
  return cleanMaterialCode(readAny(row, [
    'materialCode', 'Material Code', 'MATERIAL_CODE', 'MAT_CODE',
    'Mat Code', 'MatID', 'MaterialCode', 'CA3',
  ]));
}

function normalKey(value) { return text(value).toUpperCase().replace(/\s+/g, ''); }
export function xmlCiiClassKey(pipingClass) {
  const value = normalKey(pipingClass);
  return value ? `PC:${value}` : '';
}
export function xmlCiiClassSizeKey(pipingClass, boreMm) {
  const value = normalKey(pipingClass);
  const bore = Number(boreMm);
  return value && Number.isFinite(bore) && bore > 0 ? `PC:${value}|DN:${Math.round(bore)}` : '';
}

function smartOverrideKeys({ lineKey, branchName, requestedPipingClass, resolvedPipingClass, boreMm }) {
  return [
    lineKey, branchName, requestedPipingClass, resolvedPipingClass,
    xmlCiiClassSizeKey(resolvedPipingClass, boreMm),
    xmlCiiClassSizeKey(requestedPipingClass, boreMm),
    xmlCiiClassKey(resolvedPipingClass),
    xmlCiiClassKey(requestedPipingClass),
  ].map(text).filter(Boolean);
}

function materialScopedCodeOverride(record, material) {
  if (!record || !material) return false;
  const identity = normalizeXmlCiiMaterialIdentity(material);
  const key = normalKey(record.key).replace(/^MAT(?:ERIAL)?:/, '');
  return key === normalKey(material)
    || key === identity.compact
    || key === normalKey(identity.canonical);
}

function materialMapResult(material, materialMap, config) {
  if (!material) return null;
  const fuzzyConfig = config?.materialCodeFuzzy || config?.material?.fuzzy || {};
  const result = resolveXmlCiiMaterialCodeFromMap(material, materialMap, fuzzyConfig);
  return result.materialCode ? result : null;
}

function materialResolution({ material, source, mapped, codeRecord, directCode }) {
  const pinned = materialScopedCodeOverride(codeRecord, material);
  if (pinned) {
    const conflict = !!mapped && mapped.materialCode !== cleanMaterialCode(codeRecord.value);
    return {
      material,
      materialCode: cleanMaterialCode(codeRecord.value),
      source: conflict ? 'material-scoped-override-conflict' : 'material-scoped-override',
      confidence: conflict ? mapped.confidence : 1,
      matchMethod: 'override',
      needsReview: conflict,
      conflict: conflict ? {
        overrideCode: cleanMaterialCode(codeRecord.value),
        resolvedCode: mapped.materialCode,
        overrideKey: codeRecord.key,
      } : null,
      matchedRow: mapped?.matchedRow || null,
    };
  }
  if (mapped) {
    const overrideCode = cleanMaterialCode(codeRecord?.value);
    const conflict = !!overrideCode && overrideCode !== mapped.materialCode;
    return {
      material,
      materialCode: mapped.materialCode,
      source: conflict ? 'material-evidence-corrected' : source,
      confidence: mapped.confidence,
      matchMethod: mapped.method,
      needsReview: false,
      conflict: conflict ? {
        overrideCode,
        resolvedCode: mapped.materialCode,
        overrideKey: codeRecord?.key || '',
      } : null,
      matchedRow: mapped.matchedRow,
    };
  }
  if (directCode) {
    return {
      material,
      materialCode: directCode,
      source: 'line-list-material-code',
      confidence: 1,
      matchMethod: 'direct-line-code',
      needsReview: false,
      conflict: null,
      matchedRow: null,
    };
  }
  if (codeRecord) {
    return {
      material,
      materialCode: '',
      source: 'process-material-unresolved',
      confidence: 0,
      matchMethod: 'none',
      needsReview: true,
      conflict: {
        overrideCode: cleanMaterialCode(codeRecord.value),
        resolvedCode: '',
        overrideKey: codeRecord.key,
      },
      matchedRow: null,
    };
  }
  return {
    material,
    materialCode: '',
    source: 'process-material-unresolved',
    confidence: 0,
    matchMethod: 'none',
    needsReview: true,
    conflict: null,
    matchedRow: null,
  };
}

const SERVICE_FIELDS = Object.freeze(['p1', 'hydroPressure', 't1', 't2', 't3', 'density']);
function hasExactLineListEvidence(lineRow) {
  if (!lineRow || typeof lineRow !== 'object') return false;
  if (lineRow._raw && typeof lineRow._raw === 'object') return true;
  return Object.keys(lineRow).some((key) => !['pipingClass', 'Piping Class', 'PIPING_CLASS'].includes(key) && text(lineRow[key]));
}

function ensureServiceFallback({ branchName, lineKey, lineRow, requestedPipingClass, href, tref, config, overrides }) {
  if (hasExactLineListEvidence(lineRow) || !config || typeof config !== 'object') return null;
  const targetKey = text(lineKey) || text(branchName);
  if (!targetKey) return null;
  const fallback = buildXmlCiiServiceProcessFallback({
    branchName, lineRow, requestedPipingClass, href, tref, config, fields: SERVICE_FIELDS,
  });
  if (!fallback?.stats?.resolvedFields) return fallback;
  config.overrides = config.overrides && typeof config.overrides === 'object' ? config.overrides : (overrides || {});
  config.overrides.processData = config.overrides.processData && typeof config.overrides.processData === 'object'
    ? config.overrides.processData
    : {};
  const row = config.overrides.processData[targetKey] && typeof config.overrides.processData[targetKey] === 'object'
    ? config.overrides.processData[targetKey]
    : {};
  let appliedFields = 0;
  for (const [field, info] of Object.entries(fallback.fields || {})) {
    if (text(row[field])) continue;
    row[field] = info.value;
    appliedFields += 1;
  }
  if (appliedFields) {
    row.__source = row.__source || {};
    row.__source.serviceProcessFallback = {
      source: 'service-match',
      service: fallback.service,
      matchedRows: fallback.stats.matchedRows,
      appliedFields,
      needsReview: true,
    };
    config.overrides.processData[targetKey] = row;
  }
  return { ...fallback, appliedFields, targetKey };
}

export function resolveMaterialCodeFromLineMaterial({
  lineRow,
  materialMap,
  pipingClassRow,
  pipingClass,
  overrides = {},
  overrideKeys = [],
  xmlNode,
  xmlBranch,
  config = {},
}) {
  const lineMaterialRaw = readAny(lineRow, [
    'material', 'Material', 'MATERIAL', 'Material_Name', 'Material Name', 'MOC',
  ]);
  const materialOverride = overrideRecord(overrides, 'material', overrideKeys);
  const processMaterial = cleanMaterialText(materialOverride?.value || lineMaterialRaw);
  const codeRecord = overrideRecord(overrides, 'materialCode', [
    ...overrideKeys,
    processMaterial,
    lineMaterialRaw,
  ].filter(Boolean));
  const directLineCode = directMaterialCode(lineRow);

  // Process Line List Material is the governing automatic Material Code authority.
  // A nonblank unresolved Material blocks every Piping Class fallback.
  if (processMaterial) {
    return materialResolution({
      material: processMaterial,
      source: materialOverride ? 'override-material-map' : 'line-list-material-map',
      mapped: materialMapResult(processMaterial, materialMap, config),
      codeRecord,
      directCode: directLineCode,
    });
  }

  // Explicit code remains available when no Process Material exists, but is
  // review-required unless it is carried by the exact Process Line List row.
  if (directLineCode) {
    return {
      material: '', materialCode: directLineCode, source: 'line-list-material-code',
      confidence: 1, matchMethod: 'direct-line-code', needsReview: false,
      conflict: null, matchedRow: lineRow,
    };
  }
  if (codeRecord) {
    return {
      material: '', materialCode: cleanMaterialCode(codeRecord.value), source: 'override-unvalidated',
      confidence: 0, matchMethod: 'override', needsReview: true,
      conflict: null, matchedRow: null,
    };
  }

  // Material evidence from XML is preferred over Piping Class fallback when the
  // Process Line List does not publish Material.
  const xmlMaterial = cleanMaterialText(xmlNode?.material || xmlBranch?.material || '');
  const xmlMapped = materialMapResult(xmlMaterial, materialMap, config);
  if (xmlMapped) {
    return {
      material: xmlMaterial,
      materialCode: xmlMapped.materialCode,
      source: 'xml-material-map',
      confidence: xmlMapped.confidence,
      matchMethod: xmlMapped.method,
      needsReview: false,
      conflict: null,
      matchedRow: xmlMapped.matchedRow,
    };
  }

  // Piping Class is fallback-only. Wildcards are already gated by recognized
  // one- or two-character Rating prefix isolation in the shared class resolver.
  const directClassCode = directMaterialCode(pipingClassRow);
  const classMaterial = cleanMaterialText(classRowMaterial(pipingClassRow));
  if (directClassCode) {
    return {
      material: classMaterial,
      materialCode: directClassCode,
      source: 'piping-class-fallback',
      confidence: 1,
      matchMethod: 'exact-class-row',
      needsReview: false,
      conflict: null,
      matchedRow: pipingClassRow,
    };
  }

  const configured = resolveConfiguredMaterialCode({ pipingClass, config });
  if (configured) {
    return {
      material: cleanMaterialText(configured.materialName),
      materialCode: cleanMaterialCode(configured.materialCode),
      source: 'piping-class-fallback',
      confidence: Number(configured.confidence) / 100,
      matchMethod: configured.method,
      needsReview: configured.method === 'rating-prefix-family-wildcard',
      conflict: null,
      matchedRow: configured.matchedRow,
    };
  }

  const classMapped = materialMapResult(classMaterial, materialMap, config);
  if (classMapped) {
    return {
      material: classMaterial,
      materialCode: classMapped.materialCode,
      source: 'piping-class-fallback',
      confidence: classMapped.confidence,
      matchMethod: classMapped.method,
      needsReview: true,
      conflict: null,
      matchedRow: classMapped.matchedRow,
    };
  }

  return {
    material: xmlMaterial || classMaterial,
    materialCode: '',
    source: xmlMaterial ? 'xml-fallback' : 'blank',
    confidence: 0,
    matchMethod: 'none',
    needsReview: true,
    conflict: null,
    matchedRow: null,
  };
}

function shouldUseNumericOverride(value, classValue, config) {
  if (value == null) return false;
  if (value !== 0 || config?.allowZeroWallCorrosionOverrides === true) return true;
  return classValue == null || classValue === 0;
}

function classCorrosion(row) {
  return numberAny(row, [
    'corrosion', 'Corrosion', 'corrosionAllowance', 'Corrosion Allowance',
    'CORROSION_ALLOWANCE', 'CORR_ALLOW', 'CORR', 'CA',
  ]);
}
function classWall(row) {
  return numberAny(row, [
    'wallThickness', 'WallThickness', 'Wall Thickness', 'Wall thickness',
    'WALL_THICKNESS', 'WALL_THICK', 'WT', 'THK', 'Thickness',
  ]);
}

export function resolveCorrosionFromPipingClass({
  lineRow, boreMm, componentType, rating, pipingClassIndex,
  overrides = {}, overrideKeys = [], xmlNode, xmlBranch, config = {},
}) {
  const pipingClass = readAny(lineRow, ['pipingClass', 'Piping Class', 'PIPING_CLASS']);
  const match = findBestPipingClassRow({
    pipingClass, boreMm, componentType, rating, pipingClassIndex, overrides, config,
  });
  const fromClass = classCorrosion(match?.row);
  const override = numericOverrideValue(overrides, 'corrosion', overrideKeys);
  if (shouldUseNumericOverride(override, fromClass, config)) {
    return { corrosionAllowanceMm: override, source: 'override', matchedRow: null, needsReview: false };
  }
  const legacyOverride = toFiniteNumber(overrides.corrosionAllowanceMm);
  if (shouldUseNumericOverride(legacyOverride, fromClass, config)) {
    return { corrosionAllowanceMm: legacyOverride, source: 'override', matchedRow: null, needsReview: false };
  }
  if (fromClass != null) {
    return {
      corrosionAllowanceMm: fromClass,
      source: 'piping-class-master',
      matchedPipingClass: pipingClass,
      matchedRow: match.row,
      matchMethod: match.method,
      matchScore: match.score,
      matchReasons: match.reasons,
      needsReview: match.needsReview,
      candidates: match.candidates,
    };
  }
  const fromXml = toFiniteNumber(
    xmlNode?.corrosionAllowance ?? xmlNode?.CorrosionAllowance ?? xmlBranch?.corrosionAllowance,
  );
  if (fromXml != null) {
    return {
      corrosionAllowanceMm: fromXml,
      source: 'xml-fallback',
      matchedPipingClass: pipingClass,
      matchedRow: match?.row || null,
      matchMethod: match?.method || 'none',
      matchScore: match?.score || 0,
      matchReasons: match?.reasons || [],
      needsReview: match?.needsReview ?? true,
      candidates: match?.candidates || [],
    };
  }
  const fallback = toFiniteNumber(config.defaultCorrosionAllowance);
  return {
    corrosionAllowanceMm: fallback ?? 0,
    source: fallback != null ? 'config-default' : 'default-zero',
    matchedPipingClass: pipingClass,
    matchedRow: match?.row || null,
    matchMethod: match?.method || 'none',
    matchScore: match?.score || 0,
    matchReasons: match?.reasons || [],
    needsReview: match?.needsReview ?? true,
    candidates: match?.candidates || [],
  };
}

export function resolveWallThicknessFromPipingClass({
  pipingClassRow, overrides = {}, overrideKeys = [], xmlNode, xmlBranch, config = {},
}) {
  const fromClass = classWall(pipingClassRow);
  const override = numericOverrideValue(overrides, 'wallThickness', overrideKeys);
  const dtxrApplied = override != null && overrideKeys.some((key) => overrides.__dtxrWallKeys?.[key]);
  if (!dtxrApplied && shouldUseNumericOverride(override, fromClass, config)) {
    return { valueMm: override, source: 'override' };
  }
  if (fromClass != null) return { valueMm: fromClass, source: 'piping-class-master' };
  if (shouldUseNumericOverride(override, fromClass, config)) return { valueMm: override, source: 'override' };
  const fromXml = toFiniteNumber(xmlNode?.wallThickness ?? xmlNode?.WallThickness ?? xmlBranch?.wallThickness);
  if (fromXml != null) return { valueMm: fromXml, source: 'xml-fallback' };
  const fallback = toFiniteNumber(config.defaultWallThickness);
  return { valueMm: fallback ?? 0, source: fallback != null ? 'config-default' : 'default-zero' };
}

export function resolveBranchProcessData({
  branchName, lineKey, lineRow, boreMm, componentType, schedule, href, tref,
  materialMap, pipingClassIndex, overrides = {}, xmlNode, xmlBranch, config = {},
}) {
  const lineListPipingClass = readAny(lineRow, ['pipingClass', 'Piping Class', 'PIPING_CLASS']);
  const classSource = selectXmlCiiRequestedPipingClass({ branchName, lineListPipingClass, config });
  const requestedPipingClass = classSource.requestedPipingClass;
  const classMatch = findBestPipingClassRow({
    pipingClass: requestedPipingClass,
    boreMm,
    componentType,
    rating: '',
    schedule,
    pipingClassIndex,
    overrides,
    config,
  });
  const pipingClassRow = classMatch?.row || null;
  const resolvedPipingClass = classMatch?.resolvedPipingClass
    || classMatch?.classMatch?.pipingClass
    || requestedPipingClass;
  const overrideKeys = smartOverrideKeys({
    lineKey, branchName, requestedPipingClass, resolvedPipingClass, boreMm,
  });
  const serviceProcessFallback = ensureServiceFallback({
    branchName, lineKey, lineRow, requestedPipingClass, href, tref, config, overrides,
  });
  const ratingAuthority = resolveXmlCiiAutomaticRating({
    manualRating: overrideValue(overrides, 'rating', overrideKeys),
    pipingClassRating: readClassRowRating(pipingClassRow),
    pipingClass: resolvedPipingClass,
    branchName,
    config,
  });
  const resolverLineRow = { ...(lineRow || {}), pipingClass: resolvedPipingClass };
  const material = resolveMaterialCodeFromLineMaterial({
    lineRow: resolverLineRow,
    materialMap,
    pipingClassRow,
    pipingClass: resolvedPipingClass,
    overrides,
    overrideKeys,
    xmlNode,
    xmlBranch,
    config,
  });
  const corrosion = resolveCorrosionFromPipingClass({
    lineRow: resolverLineRow,
    boreMm,
    componentType,
    rating: ratingAuthority.rating,
    pipingClassIndex,
    overrides,
    overrideKeys,
    xmlNode,
    xmlBranch,
    config,
  });
  const wall = resolveWallThicknessFromPipingClass({
    pipingClassRow, overrides, overrideKeys, xmlNode, xmlBranch, config,
  });
  return {
    branchName,
    lineKey,
    requestedPipingClass,
    branchPipingClass: classSource.branchPipingClass,
    lineListPipingClass: classSource.lineListPipingClass,
    pipingClassSource: classSource.source,
    resolvedPipingClass,
    normalizedPipingClass: normalizePipingClass(resolvedPipingClass),
    pipingClass: resolvedPipingClass,
    rating: ratingAuthority.rating,
    ratingSource: ratingAuthority.source,
    material: material.material,
    materialCode: material.materialCode,
    materialSource: material.source,
    materialCodeConfidence: material.confidence ?? null,
    materialCodeMatchMethod: material.matchMethod || null,
    materialCodeNeedsReview: material.needsReview ?? !material.materialCode,
    materialCodeConflict: material.conflict || null,
    corrosionAllowanceMm: corrosion.corrosionAllowanceMm,
    corrosionSource: corrosion.source,
    wallThicknessMm: wall.valueMm,
    wallThicknessSource: wall.source,
    wallThicknessKey: xmlCiiClassSizeKey(resolvedPipingClass || requestedPipingClass, boreMm)
      || lineKey
      || branchName,
    corrosionKey: xmlCiiClassKey(resolvedPipingClass || requestedPipingClass)
      || lineKey
      || branchName,
    materialCodeKey: material.material
      || xmlCiiClassKey(resolvedPipingClass || requestedPipingClass)
      || lineKey
      || branchName,
    serviceProcessFallback,
    pipingClassMatchedRow: pipingClassRow,
    pipingClassMatchMethod: classMatch.classMatch?.method || classMatch.method,
    pipingClassConfidence: classMatch.classMatch?.confidence ?? classMatch.confidence,
    pipingClassScore: classMatch.classMatch?.score ?? classMatch.score,
    pipingClassRowMethod: classMatch.method,
    pipingClassRowScore: classMatch.score,
    pipingClassRowReasons: classMatch.reasons,
    pipingClassNeedsReview: classMatch.classMatch?.needsReview || classMatch.needsReview,
    pipingClassCandidates: classMatch.classMatch?.candidates || classMatch.candidates || [],
  };
}
