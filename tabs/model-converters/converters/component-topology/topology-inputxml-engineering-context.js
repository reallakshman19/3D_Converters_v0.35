/**
 * Resolves native CAESAR engineering values for canonical topology edges.
 * Inputs are immutable enrichment records and edge lineage. The first element
 * of each line is seeded from the full managed-stage line context and every
 * element receives that resolved context explicitly. Missing authority remains
 * null and is serialized as the sentinel.
 */

import { isSupportType } from '../../../stagedjson-to-enrichxml/sj-type-mapper.js';
import { fallbackStdWall } from '../../../stagedjson-to-enrichxml/sj-wall-resolver.js';
import { resolveMaterialCodeFromLineMaterial } from '../../../../converters/xml-cii2019-core/branch-process-resolver.js';
import { DEFAULT_MATERIAL_MAP_ROWS } from '../../../../converters/xml-cii2019-core/default-material-map-rows.js';
import { cleanText } from './topology-values.js';

const CONTEXT_FIELDS = Object.freeze([
  'diameter', 'wall', 'insulation', 'corrosion', 'temperature', 'pressure',
  'hydro', 'modulus', 'poisson', 'pipeDensity', 'insulationDensity',
  'fluidDensity', 'materialNumber', 'materialName',
]);

/** @param {unknown} value @returns {number|null} */
export function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value).trim().replaceAll(',', '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
  const number = match ? Number(match[0]) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

/** @param {number|null} diameter @param {unknown[]} candidates @returns {number|null} */
export function physicalWall(diameter, candidates) {
  return candidates.map(finiteNumber).find((wall) => (
    wall !== null && wall > 0 && diameter !== null && wall * 2 < diameter
  )) ?? null;
}

/** @param {Record<string, unknown>} edge @param {Map<string,Record<string,unknown>>} records @returns {Record<string,unknown>|null} */
export function engineeringRecord(edge, records) {
  return edge.sourceEntityIds.map((id) => records.get(id)).find((record) => (
    record && !isSupportType(record.componentType)
  )) ?? null;
}

/** @param {Record<string, unknown>|null} record @returns {Record<string,unknown>} */
export function engineeringValues(record) {
  const resolved = record?.resolved ?? {};
  const enriched = record?.enrichedAttributes ?? {};
  const attrs = record?.attrs ?? {};
  const diameter = finiteNumber(enriched.pipeOdMm ?? resolved.odMm);
  const bore = finiteNumber(enriched.nominalBoreMm ?? record?.boreMm ?? attrs.ABORE ?? attrs.BORE ?? attrs.HBORE);
  const directWall = physicalWall(diameter, [resolved.wallMm, enriched.wallThicknessMm, attrs.WTHK, attrs.WTXX]);
  const standardWall = directWall === null && bore !== null ? fallbackStdWall(bore)?.wallMm ?? null : null;
  const materialDensity = finiteNumber(enriched.materialDensityKgM3 ?? attrs.MDEN);
  const insulationDensity = finiteNumber(enriched.insulationDensityKgM3 ?? attrs.IDEN);
  const fluidDensity = finiteNumber(enriched.fluidDensityOpeKgM3 ?? attrs.FDENSITY ?? attrs.FLDEN);
  const directMaterialCode = enriched.materialCode ?? attrs.MESC;
  const mappedMaterial = directMaterialCode ? null : [enriched.material, attrs.MTXX].map((material) => (
    resolveMaterialCodeFromLineMaterial({
      lineRow: { material }, materialMap: DEFAULT_MATERIAL_MAP_ROWS, pipingClassRow: null,
      pipingClass: enriched.pipingClass ?? attrs.SPRE, overrides: {}, overrideKeys: [],
      xmlNode: null, xmlBranch: null, config: { useDefaultPipingClassMaterialCodeMap: true },
    })
  )).find((result) => result.materialCode) ?? null;
  return {
    diameter,
    wall: directWall ?? physicalWall(diameter, [standardWall]),
    insulation: finiteNumber(enriched.insulationThicknessMm ?? record?.insuMm) ?? 0,
    corrosion: finiteNumber(enriched.corrosionAllowanceMm ?? resolved.corrMm) ?? 0,
    temperature: enriched.designTemperatureC ?? attrs.ITEMTEMP1 ?? attrs.TEMP1,
    pressure: nativePressure(enriched.designPressureMpa ?? enriched.designPressure ?? attrs.ITEMPRES1 ?? attrs.PRES1),
    hydro: enriched.hydroPressure ?? attrs.HPRES,
    modulus: enriched.modulusMpa ?? attrs.YMOD ?? attrs.EMOD,
    poisson: enriched.poissonsRatio ?? attrs.PRAT,
    pipeDensity: materialDensity === null ? null : materialDensity / 1_000_000,
    insulationDensity: insulationDensity === null ? null : insulationDensity / 1_000_000,
    fluidDensity: fluidDensity === null ? null : fluidDensity / 1_000_000,
    materialNumber: directMaterialCode ?? mappedMaterial?.materialCode,
    materialName: mappedMaterial?.material ?? enriched.material ?? attrs.MTXX ?? attrs.MESC,
    lineId: enriched.lineNo ?? record?.branchName,
    name: record?.name,
  };
}

/** @param {unknown} value @returns {boolean} */
function missing(value) {
  return value === null || value === undefined || cleanText(value) === '';
}

/** @param {Record<string,unknown>} target @param {Record<string,unknown>} source @returns {Record<string,unknown>} */
function fillContext(target, source) {
  const result = { ...target };
  for (const field of CONTEXT_FIELDS) if (missing(result[field]) && !missing(source[field])) result[field] = source[field];
  return result;
}

/** @param {Map<string,Record<string,unknown>>} records @returns {Map<string,Record<string,unknown>>} */
function lineContextIndex(records) {
  const contexts = new Map();
  for (const record of records.values()) {
    const values = engineeringValues(record);
    const lineId = cleanText(values.lineId);
    if (!lineId) continue;
    contexts.set(lineId, fillContext(contexts.get(lineId) ?? values, values));
  }
  return contexts;
}

/** @param {unknown} value @returns {unknown} */
function nativePressure(value) {
  const text = cleanText(value).toUpperCase();
  return ['ATM', 'ATMOSPHERIC', 'ATMOSPHERE'].includes(text) ? 0 : value;
}

/** @param {Record<string,unknown>[]} edges @param {Map<string,Record<string,unknown>>} records @returns {Map<string,Record<string,unknown>>} */
export function buildEdgeEngineeringValues(edges, records) {
  const contexts = lineContextIndex(records), result = new Map();
  for (const edge of edges) {
    const values = engineeringValues(engineeringRecord(edge, records));
    const lineId = cleanText(values.lineId);
    result.set(edge.id, lineId ? fillContext(values, contexts.get(lineId) ?? {}) : values);
  }
  return result;
}

export const _test = Object.freeze({ missing, fillContext, lineContextIndex, nativePressure });
