/**
 * Functionality: maps an element-aware stagedJson context into the existing
 * XML->CII resolver input, resolves line/spec/material/weight facts, sanitizes
 * legacy default-zero outputs, and emits the flat enrichment contract.
 * Parameters: context, resolver master context, and visible config.
 * Outputs: enrichedAttributes plus diagnostics and trace; no node mutation.
 */

import { resolveBranchProcessData } from '../../../converters/xml-cii2019-core/branch-process-resolver.js';
import { buildWeightCandidateRows } from '../xml-cii-weight-match.js';
import { STAGEDJSON_ENRICHMENT_SCHEMA, createStagedJsonDiagnostic } from './stagedjson-enrichment-contract.js';

const SUPPORT_TYPES = new Set(['SUPPORT', 'ATTA', 'REST', 'GUIDE', 'LINESTOP', 'LINE_STOP', 'ANCHOR', 'SPRING']);
const PURE_PIPE_TYPES = new Set(['PIPE']);
const DISTRIBUTED_TYPES = new Set(['PIPE', 'BEND', 'ELBOW', 'ELBO', 'REDUCER', 'REDU']);

const ASME_BORE_TO_OD_MM = Object.freeze({
  15: 21.3, 20: 26.7, 25: 33.4, 40: 48.3, 50: 60.3,
  80: 88.9, 100: 114.3, 150: 168.3, 200: 219.1, 250: 273.0,
  300: 323.8, 350: 355.6, 400: 406.4, 450: 457.2, 500: 508.0,
  600: 609.6, 700: 711.2, 750: 762.0, 800: 812.8, 900: 914.4,
  1000: 1016.0, 1200: 1219.2
});

const ASME_BORE_TO_STD_WALL_MM = Object.freeze({
  15: 2.77, 20: 2.87, 25: 3.38, 40: 3.68, 50: 3.91,
  80: 5.49, 100: 6.02, 150: 7.11, 200: 8.18, 250: 9.27,
  300: 9.53, 350: 9.53, 400: 9.53, 450: 9.53, 500: 9.53,
  600: 9.53, 700: 9.53, 750: 9.53, 800: 9.53, 900: 9.53,
  1000: 9.53, 1200: 9.53
});

export function resolveStagedJsonContext(context, masters, config) {
  const lineResolution = resolveLineRow(context, masters?.lineRows || [], config);
  const lineRow = lineResolution.row;
  const process = resolveBranchProcessData({
    branchName: context.branchName,
    lineKey: lineResolution.lineKey,
    lineRow,
    boreMm: context.nominalBoreMm,
    componentType: context.type,
    rating: context.rating,
    schedule: context.schedule,
    materialMap: masters?.materialMapRows || [],
    pipingClassIndex: masters?.pipingClassIndex,
    overrides: config?.overrides || {},
    config: config || {},
  });
  const flat = buildResolvedFields(context, lineResolution, process, masters, config);
  const missing = requiredMissing(context, flat);
  const diagnostics = missing.map((field) => missingDiagnostic(context, field));
  if (flat.fluidDensityHydKgM3 === null && context.nominalBoreMm >= 450 && flat.testMedium === null) {
    diagnostics.push(createStagedJsonDiagnostic({ nodeId: context.nodeId, severity: 'ENGINEERING_REVIEW_REQUIRED', category: 'MISSING_TEST_MEDIUM', field: 'testMedium', message: `Test Medium is required for hydro density default on large bore (>16") pipe.`, requiredFor: ['HydroWeight'] }));
  }
  const conflicts = lineResolution.conflict ? ['lineKey'] : [];
  if (lineResolution.conflict) diagnostics.push(conflictDiagnostic(context, lineResolution));
  const status = conflicts.length ? 'conflict' : missing.length ? (flat.lineNo ? 'partial' : 'missing') : 'resolved';
  return {
    ...flat,
    status,
    needsReview: status !== 'resolved',
    missing,
    conflicts,
    diagnostics,
  };
}

function buildResolvedFields(context, lineResolution, process, masters, config) {
  const classRow = process.pipingClassMatchedRow || {};
  const materialRow = materialRowFor(process, masters?.materialMapRows || []);
  const rawWall = safeResolverNumber(process.wallThicknessMm, process.wallThicknessSource);
  const wall = (rawWall === null || rawWall <= 0) ? (ASME_BORE_TO_STD_WALL_MM[context.nominalBoreMm] ?? null) : rawWall;
  const corrosion = safeResolverNumber(process.corrosionAllowanceMm, process.corrosionSource);
  
  const classOd = numberAny(classRow, ['pipeOdMm', 'OD_MM', 'Outside Diameter', 'OD', 'outsideDiameter']);
  const od = classOd ?? ASME_BORE_TO_OD_MM[context.nominalBoreMm] ?? null;
  
  let materialDensity = firstNumber(numberAny(materialRow, densityAliases()), numberAny(classRow, densityAliases()), numberAny(lineResolution.row, densityAliases()));
  if (materialDensity === null) {
     const mat = (process.material || '').toUpperCase();
     if (mat.includes('SS') || mat.includes('DSS') || mat.includes('SDSS')) materialDensity = 8050;
     else materialDensity = 7850;
  }
  
  const directPipeWeight = firstNumber(numberAny(classRow, pipeWeightAliases()), numberAny(lineResolution.row, pipeWeightAliases()));
  const pipeWeight = directPipeWeight ?? calculatedPipeWeight(od, wall, materialDensity);
  const component = componentWeight(context, masters?.weightMasterRows || [], config);
  const processData = (config?.overrides?.processData || {})[lineResolution.lineKey || context.branchName] || {};
  
  const fluidPhase = textAny(processData, ['phase', 'PHASE']) || textAny(lineResolution.row, ['phase', 'PHASE']) || null;
  let opeDensity = firstNumber(numberAny(processData, ['density', 'fluidDensityOpeKgM3', 'FLUID_DENSITY_OPE_KG_M3', 'DENSITY']), numberAny(lineResolution.row, ['density', 'fluidDensityOpeKgM3', 'FLUID_DENSITY_OPE_KG_M3', 'DENSITY']), numberAny(context.attributes, ['FLUID_DENSITY_OPE_KG_M3']));
  if (opeDensity === null && fluidPhase) {
    opeDensity = fluidPhase.toUpperCase() === 'L' ? 1000 : 300;
  }
  
  const testMedium = textAny(processData, ['testMedium', 'TEST_MEDIUM']) || textAny(lineResolution.row, ['testMedium', 'TEST_MEDIUM']) || null;
  let hydDensity = firstNumber(numberAny(processData, ['fluidDensityHydKgM3', 'HYD_DENSITY_KG_M3', 'Hydro Density']), numberAny(lineResolution.row, ['fluidDensityHydKgM3', 'HYD_DENSITY_KG_M3', 'Hydro Density']), numberAny(context.attributes, ['FLUID_DENSITY_HYD_KG_M3']));
  if (hydDensity === null && context.nominalBoreMm != null) {
    if (context.nominalBoreMm <= 400) {
      hydDensity = 1000;
    } else if (testMedium) {
      const tm = testMedium.toUpperCase();
      if (tm === 'WATER' || tm === 'W' || tm === 'HYDRO') hydDensity = 1000;
      else hydDensity = opeDensity;
    }
  }

  let insulationThickness = firstNumber(numberAny(processData, ['insThk', 'INSULATION_THICKNESS_MM', 'Insulation Thickness']), numberAny(lineResolution.row, ['insThk', 'INSULATION_THICKNESS_MM', 'Insulation Thickness']), numberAny(context.attributes, ['INSULATION_THICKNESS_MM']));
  let insulationDensity = firstNumber(numberAny(processData, ['INSULATION_DENSITY_KG_M3', 'Insulation Density']), numberAny(lineResolution.row, ['INSULATION_DENSITY_KG_M3', 'Insulation Density']), numberAny(context.attributes, ['INSULATION_DENSITY_KG_M3']));
  
  if (insulationThickness === null) insulationThickness = 0;
  if (insulationDensity === null) {
      if (insulationThickness > 0) insulationDensity = 250;
      else insulationDensity = 0;
  }
  const id = od !== null && wall !== null && od > 2 * wall ? od - 2 * wall : null;
  return {
    schema: STAGEDJSON_ENRICHMENT_SCHEMA,
    lineNo: lineResolution.row?.lineNo || null,
    lineKey: lineResolution.lineKey || null,
    branchName: context.branchName || null,
    sourceBranchPath: context.hierarchyPath,
    nodeId: context.nodeId,
    componentType: context.type,
    pipingClass: process.pipingClass || null,
    pressureRating: process.rating || null,
    nominalBoreMm: context.nominalBoreMm,
    pipeOdMm: od,
    schedule: textAny(classRow, ['schedule', 'Schedule', 'SCH']) || context.schedule || null,
    wallThicknessMm: wall,
    corrosionAllowanceMm: corrosion,
    material: process.material || null,
    materialCode: process.materialCode || null,
    materialDensityKgM3: materialDensity,
    designPressure: valueAny(processData, ['p1', 'P1', 'DESIGN_PRESSURE']) ?? valueAny(lineResolution.row, ['p1', 'P1', 'DESIGN_PRESSURE']) ?? null,
    designPressureMpa: firstNumber(numberAny(processData, ['p1', 'P1', 'DESIGN_PRESSURE']), numberAny(lineResolution.row, ['p1', 'P1', 'DESIGN_PRESSURE'])),
    designTemperatureC: firstNumber(numberAny(processData, ['t1', 'T1', 'DESIGN_TEMPERATURE']), numberAny(lineResolution.row, ['t1', 'T1', 'DESIGN_TEMPERATURE'])),
    operatingTemperatureC: firstNumber(numberAny(processData, ['t2', 'T2', 'OPERATING_TEMPERATURE']), numberAny(lineResolution.row, ['t2', 'T2', 'OPERATING_TEMPERATURE'])),
    minimumTemperatureC: firstNumber(numberAny(processData, ['t3', 'T3', 'MINIMUM_TEMPERATURE']), numberAny(lineResolution.row, ['t3', 'T3', 'MINIMUM_TEMPERATURE'])),
    hydroPressure: valueAny(processData, ['hydroPressure', 'HYDRO_PRESSURE']) ?? valueAny(lineResolution.row, ['hydroPressure', 'HYDRO_PRESSURE']) ?? null,
    fluidService: textAny(processData, ['service', 'Service', 'FLUID_SERVICE']) || textAny(lineResolution.row, ['service', 'Service', 'FLUID_SERVICE']) || null,
    fluidPhase,
    testMedium,
    fluidDensityOpeKgM3: opeDensity,
    fluidDensityHydKgM3: hydDensity,
    insulationThicknessMm: insulationThickness,
    insulationDensityKgM3: insulationDensity,
    pipeWeightKgPerM: pipeWeight,
    componentWeightKg: component.value,
    componentWeightMethod: component.method,
    weightMasterMatchedRowId: component.rowId,
    sources: { lineList: lineResolution.source, pipingClass: process.pipingClassRowMethod || null, material: process.materialSource || null, weight: component.source, pipeWeight: directPipeWeight !== null ? 'master' : pipeWeight !== null ? 'calculated' : null },
    trace: { lineKeyResolver: lineResolution.trace, pipingClassResolver: { method: process.pipingClassRowMethod, score: process.pipingClassRowScore, reasons: process.pipingClassRowReasons }, weightResolver: component.trace, pipeWeightFormula: pipeWeight !== null && directPipeWeight === null ? 'pi/4 * (OD^2 - ID^2) * 1e-6 * materialDensity' : null, insideDiameterMm: id },
  };
}

function resolveLineRow(context, rows, config) {
  const candidates = context.lineHints.map(normalizeKey).filter(Boolean);
  const exact = rows.filter((row) => candidates.includes(normalizeKey(row.lineNoKey || row.lineNo || row.lineKey)));
  if (exact.length === 1) return resolution(exact[0], 'exact-hint', false, context);
  if (exact.length > 1) return resolution(null, 'ambiguous-exact-hint', true, context, exact);
  if (config?.allowContainedLineKey !== true) return resolution(null, 'no-match', false, context);
  
  const contained = rows.filter((row) => candidates.some((hint) => hint.includes(normalizeKey(row.lineNoKey || row.lineNo || row.lineKey))));
  if (contained.length === 1) return resolution(contained[0], 'contained-line-key', false, context);
  if (contained.length > 1) {
    const scored = contained.map(row => {
      const rowKey = normalizeKey(row.lineNoKey || row.lineNo || row.lineKey);
      return { row, length: rowKey.length };
    }).sort((a, b) => b.length - a.length);
    
    // If the longest match is strictly longer than the second longest, it's unambiguous
    if (scored[0].length > scored[1].length) {
      return resolution(scored[0].row, 'longest-contained-line-key', false, context);
    }
  }
  
  return resolution(null, contained.length ? 'ambiguous-contained-line-key' : 'no-match', contained.length > 1, context, contained);
}

function resolution(row, method, conflict, context, candidates = []) {
  return { row, lineKey: row?.lineNoKey || row?.lineNo || row?.lineKey || null, source: row ? `line-list-row-${row._sourceRowIndex || ''}` : null, conflict, candidates, trace: { method, hints: context.lineHints, candidateCount: candidates.length || (row ? 1 : 0) } };
}

function componentWeight(context, weightRows, config) {
  if (PURE_PIPE_TYPES.has(context.type) || SUPPORT_TYPES.has(context.type) || context.type === 'BRANCH') return { value: null, method: 'not-applicable', rowId: null, source: 'not-applicable', trace: { candidateCount: 0 } };
  const direct = numberAny(context.attributes, ['COMPONENT_WEIGHT_KG', 'WEIGHT_KG', 'WEIGHT']);
  if (direct !== null) return { value: direct, method: 'source-attribute', rowId: null, source: 'sourceAttributes', trace: { candidateCount: 0 } };
  const issue = { id: context.nodeId, componentType: context.type, bore: context.nominalBoreMm, rating: context.rating, length: context.componentLengthMm };
  const candidates = buildWeightCandidateRows({ componentRows: [issue], masterContext: { weightMasterRows: weightRows } }).sort((left, right) => right.totalScore - left.totalScore);
  const best = candidates[0] || null;
  const ambiguous = best && candidates[1] && best.totalScore - candidates[1].totalScore < config.weightAmbiguityDelta;
  if (!best || best.totalScore < config.weightMinimumScore || ambiguous) return { value: null, method: '', rowId: null, source: null, trace: { candidateCount: candidates.length, bestScore: best?.totalScore ?? null, ambiguous: Boolean(ambiguous) } };
  return { value: best.candidateWeight, method: 'xml-cii-weight-candidate', rowId: best.candidateId, source: 'weightMaster', trace: { candidateCount: candidates.length, bestScore: best.totalScore, score: { bore: best.boreScore, rating: best.ratingScore, length: best.lengthScore, componentType: best.componentTypeScore } } };
}

function requiredMissing(context, fields) {
  if (SUPPORT_TYPES.has(context.type)) return context.center ? [] : ['supportPosition'];
  const required = ['lineNo', 'pipingClass', 'nominalBoreMm'];
  if (DISTRIBUTED_TYPES.has(context.type)) required.push('pipeOdMm', 'wallThicknessMm', 'pipeWeightKgPerM', 'fluidDensityOpeKgM3', 'fluidDensityHydKgM3', 'insulationThicknessMm', 'insulationDensityKgM3');
  if (!PURE_PIPE_TYPES.has(context.type) && context.type !== 'BRANCH') required.push('componentWeightKg');
  return required.filter((field) => fields[field] === null || fields[field] === undefined || fields[field] === '');
}

function missingDiagnostic(context, field) { return createStagedJsonDiagnostic({ nodeId: context.nodeId, severity: 'BLOCKED', category: field === 'componentWeightKg' ? 'MISSING_WEIGHT' : 'MISSING_ATTRIBUTE', field, message: `${field} is unresolved for ${context.name || context.nodeId}; no fallback was applied.`, requiredFor: ['ElementWeight', 'SupportVerticalLoad'], sourceExpected: expectedSource(field) }); }
function conflictDiagnostic(context, resolutionValue) { return createStagedJsonDiagnostic({ nodeId: context.nodeId, severity: 'ENGINEERING_REVIEW_REQUIRED', category: 'CONFLICT', field: 'lineKey', message: `Multiple line-list rows match ${context.name || context.nodeId}.`, requiredFor: ['AllEnrichedAttributes'], sourceExpected: `lineList (${resolutionValue.candidates.length} candidates)` }); }
function expectedSource(field) { if (field === 'componentWeightKg') return 'componentWeightMaster'; if (field.includes('fluid') || field.includes('insulation') || field === 'lineNo') return 'lineList'; return 'pipingClassMaster'; }
function safeResolverNumber(value, source) { return source === 'default-zero' || source === 'config-default' ? null : finite(value); }
function calculatedPipeWeight(od, wall, density) { if (od === null || wall === null || density === null || wall <= 0 || od <= 2 * wall) return null; const id = od - 2 * wall; return round6(Math.PI / 4 * (od ** 2 - id ** 2) * 1e-6 * density); }
function materialRowFor(process, rows) { const material = normalizeKey(process.material), code = normalizeKey(process.materialCode); return rows.find((row) => normalizeKey(textAny(row, ['materialCode', 'code', 'MAT_CODE'])) === code || normalizeKey(textAny(row, ['material', 'materialName', 'description'])) === material) || {}; }
function densityAliases() { return ['materialDensityKgM3', 'MATERIAL_DENSITY_KG_M3', 'Density kg/m3', 'DENSITY_KG_M3']; }
function pipeWeightAliases() { return ['pipeWeightKgPerM', 'unitPipeWeightKgPerM', 'PIPE_WEIGHT_KG_PER_M', 'Weight kg/m']; }
function numberAny(row, keys) { return finite(valueAny(row, keys)); }
function textAny(row, keys) { const value = valueAny(row, keys); return value === null ? '' : String(value).trim(); }
function valueAny(row, keys) { if (!row || typeof row !== 'object') return null; const wanted = keys.map(normalizeKey); for (const source of [row, row._raw]) for (const [key, value] of Object.entries(source || {})) if (wanted.includes(normalizeKey(key)) && value !== '') return value; return null; }
function firstNumber(...values) { return values.find((value) => value !== null && value !== undefined) ?? null; }
function finite(value) { if (value === null || value === undefined || value === '') return null; const match = String(value).replace(/,/g, '').match(/[-+]?\d*\.?\d+/); const parsed = match ? Number(match[0]) : NaN; return Number.isFinite(parsed) ? parsed : null; }
function normalizeKey(value) { return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ''); }
function round6(value) { return Math.round(value * 1e6) / 1e6; }
