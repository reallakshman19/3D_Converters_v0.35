import { cleanMaterialText, cleanMaterialCode, mapMaterialTextToCiiCode } from './linelist-mapping.js';
import { findBestPipingClassRow, normalizePipingClass } from './piping-class-resolver.js';
import { toFiniteNumber } from './config.js';

function text(value) {
  return String(value ?? '').trim();
}

function headerKey(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function readAny(row, keys) {
  if (!row || typeof row !== 'object') return '';
  const wanted = (keys || []).map(headerKey).filter(Boolean);
  for (const source of [row, row._raw]) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys || []) {
      const direct = source[key];
      if (text(direct)) return text(direct);
    }
    for (const [key, value] of Object.entries(source)) {
      if (wanted.includes(headerKey(key)) && text(value)) return text(value);
    }
  }
  return '';
}

function numberAny(row, keys) {
  const raw = readAny(row, keys).replace(/,/g, '');
  const match = raw.match(/[-+]?\d*\.?\d+/);
  const numeric = match ? Number(match[0]) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function firstText(row, keys) {
  return readAny(row, keys);
}

function overrideValue(overrides, bucketName, keys = []) {
  const bucket = overrides?.[bucketName];
  if (bucket && typeof bucket === 'object' && !Array.isArray(bucket)) {
    for (const key of keys) {
      if (key && Object.prototype.hasOwnProperty.call(bucket, key) && text(bucket[key])) return text(bucket[key]);
    }
  }
  if (bucket !== undefined && (typeof bucket !== 'object' || bucket === null) && text(bucket)) return text(bucket);
  return '';
}

function numericOverrideValue(overrides, bucketName, keys = []) {
  const raw = overrideValue(overrides, bucketName, keys);
  const numeric = toFiniteNumber(raw);
  return numeric == null ? null : numeric;
}

function readClassRowRating(row) {
  return readAny(row, ['rating', 'Rating', 'RATING', 'Pressure Class', 'classRating', 'Class Rating', 'PRESSURE_CLASS']);
}

function classRowMaterial(row) {
  return readAny(row, ['materialName', 'Material_Name', 'Material Name', 'Material', 'material', 'MATERIAL', 'Mat', 'MAT', 'MOC']);
}

function materialMapRowCode(row) {
  return cleanMaterialCode(readAny(row, ['code', 'Code', 'materialCode', 'MaterialCode', 'Material Code', 'MAT_CODE', 'CII Code', 'CA3']));
}

function materialMapRowNames(row) {
  return [readAny(row, ['material', 'Material']), readAny(row, ['materialName', 'Material_Name', 'Material Name']), readAny(row, ['description', 'Description']), readAny(row, ['name', 'Name'])].map(text).filter(Boolean);
}

function materialComparable(value) {
  return cleanMaterialText(value)
    .replace(/\b(ASTM|ASME|API)\b/g, ' ')
    .replace(/\bA\s*\/\s*SA\b/g, ' ')
    .replace(/\bSA\b/g, ' ')
    .replace(/\bGR(?:ADE)?\.?\b/g, ' ')
    .replace(/\bCL(?:ASS)?\.?\b/g, 'CL')
    .replace(/[^A-Z0-9]/g, '');
}

function mapMaterialTextToCiiCodeRobust(materialText, materialMap) {
  const exact = mapMaterialTextToCiiCode(materialText, materialMap);
  if (exact) return exact;
  const key = materialComparable(materialText);
  if (!key) return null;
  const rows = Array.isArray(materialMap) ? materialMap : [];
  return rows.find((row) => {
    if (!materialMapRowCode(row)) return false;
    return materialMapRowNames(row).some((candidate) => {
      const cand = materialComparable(candidate);
      if (!cand) return false;
      return cand === key || (cand.length >= 4 && key.endsWith(cand)) || (key.length >= 4 && cand.endsWith(key));
    });
  }) || null;
}

function shouldUseNumericOverride(value, classValue, config) {
  if (value == null) return false;
  if (value !== 0) return true;
  if (config?.allowZeroWallCorrosionOverrides === true) return true;
  if (classValue != null && classValue !== 0) return false;
  return true;
}

function normalKey(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

export function xmlCiiClassKey(pipingClass) {
  const pc = normalKey(pipingClass);
  return pc ? `PC:${pc}` : '';
}

export function xmlCiiClassSizeKey(pipingClass, boreMm) {
  const pc = normalKey(pipingClass);
  const bore = Number(boreMm);
  if (!pc || !Number.isFinite(bore) || bore <= 0) return '';
  return `PC:${pc}|DN:${Math.round(bore)}`;
}

function smartOverrideKeys({ lineKey, branchName, requestedPipingClass, resolvedPipingClass, boreMm }) {
  return [
    lineKey,
    branchName,
    requestedPipingClass,
    resolvedPipingClass,
    xmlCiiClassSizeKey(resolvedPipingClass, boreMm),
    xmlCiiClassSizeKey(requestedPipingClass, boreMm),
    xmlCiiClassKey(resolvedPipingClass),
    xmlCiiClassKey(requestedPipingClass),
  ].map(text).filter(Boolean);
}

export function resolveMaterialCodeFromLineMaterial({ lineRow, materialMap, pipingClassRow, overrides = {}, overrideKeys = [], xmlNode, xmlBranch }) {
  const lineMaterialRaw = firstText(lineRow, ['material', 'Material', 'MATERIAL', 'Material_Name', 'Material Name', 'MOC']);
  const classMaterialRaw = classRowMaterial(pipingClassRow);
  const materialOverride = overrideValue(overrides, 'material', overrideKeys);
  const preferredMaterial = materialOverride || classMaterialRaw || lineMaterialRaw;
  const materialText = cleanMaterialText(preferredMaterial);
  const explicitMaterialCode = overrideValue(overrides, 'materialCode', [...overrideKeys, classMaterialRaw, lineMaterialRaw, materialText].filter(Boolean));
  if (explicitMaterialCode) return { material: materialText, materialCode: cleanMaterialCode(explicitMaterialCode), source: 'override' };
  const legacyMaterialCode = overrideValue(overrides, 'material', [classMaterialRaw, lineMaterialRaw, materialText].filter(Boolean));
  if (legacyMaterialCode && legacyMaterialCode !== materialOverride) return { material: materialText, materialCode: cleanMaterialCode(legacyMaterialCode), source: 'override' };
  const directClassCode = cleanMaterialCode(readAny(pipingClassRow, ['materialCode', 'Material Code', 'MATERIAL_CODE', 'MAT_CODE', 'Mat Code', 'MatID', 'MaterialCode', 'CA3']));
  if (directClassCode) return { material: materialText || cleanMaterialText(classMaterialRaw), materialCode: directClassCode, source: 'piping-class-material-code', matchedRow: pipingClassRow };
  const directLineCode = cleanMaterialCode(readAny(lineRow, ['materialCode', 'Material Code', 'MATERIAL_CODE', 'MAT_CODE', 'Mat Code', 'MatID', 'MaterialCode', 'CA3']));
  if (directLineCode) return { material: materialText || cleanMaterialText(lineMaterialRaw), materialCode: directLineCode, source: materialOverride ? 'override-material-code' : 'line-list-material-code', matchedRow: lineRow };
  const fromClassMaterial = mapMaterialTextToCiiCodeRobust(classMaterialRaw, materialMap);
  const fromClassCode = materialMapRowCode(fromClassMaterial);
  if (fromClassCode) return { material: cleanMaterialText(classMaterialRaw), materialCode: fromClassCode, source: 'piping-class-material-map', matchedRow: fromClassMaterial };
  const fromLineMaterial = mapMaterialTextToCiiCodeRobust(materialText || lineMaterialRaw, materialMap);
  const fromLineCode = materialMapRowCode(fromLineMaterial);
  if (fromLineCode) return { material: cleanMaterialText(materialText || lineMaterialRaw), materialCode: fromLineCode, source: materialOverride ? 'override-material-map' : 'line-list-material-map', matchedRow: fromLineMaterial };
  const xmlMaterial = cleanMaterialText(xmlNode?.material || xmlBranch?.material || '');
  return { material: materialText || cleanMaterialText(lineMaterialRaw) || cleanMaterialText(classMaterialRaw) || xmlMaterial, materialCode: '', source: xmlMaterial ? 'xml-fallback' : 'blank', matchedRow: null };
}

function classCorrosionValue(row) {
  return numberAny(row, ['corrosion', 'Corrosion', 'corrosionAllowance', 'Corrosion Allowance', 'CORROSION_ALLOWANCE', 'CORR_ALLOW', 'CORR', 'CA']);
}

function classWallValue(row) {
  return numberAny(row, ['wallThickness', 'WallThickness', 'Wall Thickness', 'Wall thickness', 'WALL_THICKNESS', 'WALL_THICK', 'WT', 'THK', 'Thickness']);
}

export function resolveCorrosionFromPipingClass({ lineRow, boreMm, componentType, rating, pipingClassIndex, overrides = {}, overrideKeys = [], xmlNode, xmlBranch, config = {} }) {
  const pipingClass = lineRow?.pipingClass || lineRow?.['Piping Class'] || '';
  const classMatch = findBestPipingClassRow({ pipingClass, boreMm, componentType, rating, pipingClassIndex, overrides, config });
  const classRow = classMatch?.row || null;
  const fromClass = classCorrosionValue(classRow);
  const overrideCorrosion = numericOverrideValue(overrides, 'corrosion', overrideKeys);
  if (shouldUseNumericOverride(overrideCorrosion, fromClass, config)) return { corrosionAllowanceMm: overrideCorrosion, source: 'override', matchedRow: null, needsReview: false };
  const legacyOverride = toFiniteNumber(overrides.corrosionAllowanceMm);
  if (shouldUseNumericOverride(legacyOverride, fromClass, config)) return { corrosionAllowanceMm: legacyOverride, source: 'override', matchedRow: null, needsReview: false };
  if (fromClass != null) return { corrosionAllowanceMm: fromClass, source: 'piping-class-master', matchedPipingClass: pipingClass, matchedRow: classRow, matchMethod: classMatch.method, matchScore: classMatch.score, matchReasons: classMatch.reasons, needsReview: classMatch.needsReview, candidates: classMatch.candidates };
  const fromXml = toFiniteNumber(xmlNode?.corrosionAllowance ?? xmlNode?.CorrosionAllowance ?? xmlBranch?.corrosionAllowance);
  if (fromXml != null) return { corrosionAllowanceMm: fromXml, source: 'xml-fallback', matchedPipingClass: pipingClass, matchedRow: classRow || null, matchMethod: classMatch?.method || 'none', matchScore: classMatch?.score || 0, matchReasons: classMatch?.reasons || [], needsReview: classMatch?.needsReview ?? true, candidates: classMatch?.candidates || [] };
  const fromConfig = toFiniteNumber(config.defaultCorrosionAllowance);
  return { corrosionAllowanceMm: fromConfig ?? 0, source: fromConfig != null ? 'config-default' : 'default-zero', matchedPipingClass: pipingClass, matchedRow: classRow || null, matchMethod: classMatch?.method || 'none', matchScore: classMatch?.score || 0, matchReasons: classMatch?.reasons || [], needsReview: classMatch?.needsReview ?? true, candidates: classMatch?.candidates || [] };
}

export function resolveWallThicknessFromPipingClass({ pipingClassRow, overrides = {}, overrideKeys = [], xmlNode, xmlBranch, config = {} }) {
  const fromClass = classWallValue(pipingClassRow);
  const overrideWall = numericOverrideValue(overrides, 'wallThickness', overrideKeys);
  // Overrides written by the DTXR button are tagged in __dtxrWallKeys.
  // Piping class is primary: DTXR-button overrides yield to piping class when it has data.
  // Manual cell overrides (not in __dtxrWallKeys) still take priority over piping class.
  const overrideIsDtxrApplied = overrideWall != null && overrideKeys.some((k) => overrides.__dtxrWallKeys?.[k]);
  if (!overrideIsDtxrApplied && shouldUseNumericOverride(overrideWall, fromClass, config)) return { valueMm: overrideWall, source: 'override' };
  if (fromClass != null) return { valueMm: fromClass, source: 'piping-class-master' };
  if (shouldUseNumericOverride(overrideWall, fromClass, config)) return { valueMm: overrideWall, source: 'override' };
  const fromXml = toFiniteNumber(xmlNode?.wallThickness ?? xmlNode?.WallThickness ?? xmlBranch?.wallThickness);
  if (fromXml != null) return { valueMm: fromXml, source: 'xml-fallback' };
  const fromConfig = toFiniteNumber(config.defaultWallThickness);
  return { valueMm: fromConfig ?? 0, source: fromConfig != null ? 'config-default' : 'default-zero' };
}

export function resolveBranchProcessData({ branchName, lineKey, lineRow, boreMm, componentType, rating, schedule, materialMap, pipingClassIndex, overrides = {}, xmlNode, xmlBranch, config = {} }) {
  const requestedPipingClass = firstText(lineRow, ['pipingClass', 'Piping Class', 'PIPING_CLASS']) || '';
  const classMatch = findBestPipingClassRow({ pipingClass: requestedPipingClass, boreMm, componentType, rating: rating || firstText(lineRow, ['rating', 'Rating', 'RATING']), schedule, pipingClassIndex, overrides, config });
  const pipingClassRow = classMatch?.row || null;
  const resolvedPipingClass = classMatch?.resolvedPipingClass || classMatch?.classMatch?.pipingClass || requestedPipingClass;
  const overrideKeys = smartOverrideKeys({ lineKey, branchName, requestedPipingClass, resolvedPipingClass, boreMm });
  const resolvedRating = overrideValue(overrides, 'rating', overrideKeys) || readClassRowRating(pipingClassRow) || text(rating || firstText(lineRow, ['rating', 'Rating', 'RATING']));
  const resolverLineRow = { ...(lineRow || {}), pipingClass: resolvedPipingClass };
  const material = resolveMaterialCodeFromLineMaterial({ lineRow: resolverLineRow, materialMap, pipingClassRow, overrides, overrideKeys, xmlNode, xmlBranch });
  const corrosion = resolveCorrosionFromPipingClass({ lineRow: resolverLineRow, boreMm, componentType, rating: resolvedRating, pipingClassIndex, overrides, overrideKeys, xmlNode, xmlBranch, config });
  const wallThicknessMm = resolveWallThicknessFromPipingClass({ pipingClassRow, overrides, overrideKeys, xmlNode, xmlBranch, config });
  return {
    branchName, lineKey, requestedPipingClass, resolvedPipingClass, normalizedPipingClass: normalizePipingClass(resolvedPipingClass), pipingClass: resolvedPipingClass, rating: resolvedRating,
    material: material.material, materialCode: material.materialCode, materialSource: material.source,
    corrosionAllowanceMm: corrosion.corrosionAllowanceMm, corrosionSource: corrosion.source,
    wallThicknessMm: wallThicknessMm.valueMm, wallThicknessSource: wallThicknessMm.source,
    wallThicknessKey: xmlCiiClassSizeKey(resolvedPipingClass || requestedPipingClass, boreMm) || lineKey || branchName,
    corrosionKey: xmlCiiClassKey(resolvedPipingClass || requestedPipingClass) || lineKey || branchName,
    materialCodeKey: xmlCiiClassKey(resolvedPipingClass || requestedPipingClass) || material.material || lineKey || branchName,
    pipingClassMatchedRow: pipingClassRow,
    pipingClassMatchMethod: classMatch.classMatch?.method || classMatch.method,
    pipingClassConfidence: classMatch.classMatch?.confidence ?? classMatch.confidence,
    pipingClassScore: classMatch.classMatch?.score ?? classMatch.score,
    pipingClassRowMethod: classMatch.method,
    pipingClassRowScore: classMatch.score,
    pipingClassRowReasons: classMatch.reasons,
    pipingClassNeedsReview: classMatch.classMatch?.needsReview || classMatch.needsReview,
    pipingClassCandidates: classMatch.classMatch?.candidates || classMatch.candidates || []
  };
}
