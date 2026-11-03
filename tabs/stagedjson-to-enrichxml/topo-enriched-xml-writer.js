import { canonicalSemanticJson, deepFreeze } from '../../contracts/topo-enriched-xml/contract-core.js';
import { formatPosition } from './sj-point-resolver.js';
import { isSupportType, mapComponentType } from './sj-type-mapper.js';
import { projectStrictPsiNodeContent } from './psi-strict-node-projector.js';
import { buildPsiSerializationPlan, PsiSerializationPlanError, verifyPsiSerializationPlan } from './psi-serialization-plan.js';
const BUNDLE_SCHEMA = 'topo-enriched-xml-writer-bundle/v1';
const XML_NS = 'http://aveva.com/pipeStress116.xsd';
const NULL_TEMP = '-100000';
const MODES = new Set(['SHADOW', 'REVIEW', 'ENFORCED', 'LEGACY']);
export async function buildTopoEnrichedXml({
  occurrencePlan, nodePlan, serializationPlan = null, branchProjection,
  records, config = {}, evaluatedAt, operatingMode = 'SHADOW', profile = 'STRICT_PSI',
}) {
  const blockers = [], reviewItems = [], warnings = [];
  validateModeProfile(operatingMode, profile, blockers);
  const timestamp = parseEvaluatedAt(evaluatedAt, blockers);
  const plan = await resolveSerializationPlan({ occurrencePlan, nodePlan, serializationPlan, profile }, blockers);
  inheritPlanValidation(plan, blockers, reviewItems, warnings);
  const projection = validateBranchProjection(branchProjection, occurrencePlan, blockers);
  const recordMap = validateRecords(records, occurrencePlan, blockers);
  validateCoordinates(occurrencePlan, blockers);
  if (operatingMode === 'ENFORCED' && reviewItems.length) blockers.push(issue('ENFORCED_REVIEW_NOT_ALLOWED', { reviewItems }));
  let xmlText = '', trace = [];
  if (!blockers.length && plan && projection && recordMap && timestamp) {
    const rendered = renderXml({ occurrencePlan, plan, projection, recordMap, config, timestamp });
    const atomicBlockers = validateAtomicity(rendered.xmlText, rendered.trace, occurrencePlan);
    blockers.push(...atomicBlockers);
    if (!blockers.length) ({ xmlText, trace } = rendered);
  }
  const validation = makeValidation(blockers, reviewItems, warnings);
  const generated = Boolean(xmlText) && validation.status !== 'BLOCKED';
  const selectable = generated && operatingMode === 'ENFORCED' && validation.status === 'PASS';
  return buildBundle({
    occurrencePlan, nodePlan, plan, projection, operatingMode, profile,
    evaluatedAt: timestamp?.canonical ?? text(evaluatedAt), xmlText, trace,
    generated, selectable, validation,
  });
}
async function resolveSerializationPlan(input, blockers) {
  try {
    if (!input.serializationPlan) return await buildPsiSerializationPlan(input);
    const verified = await verifyPsiSerializationPlan(input);
    blockers.push(...verified.blockers);
    return verified.expected;
  } catch (error) {
    if (error instanceof PsiSerializationPlanError) blockers.push(...error.blockers);
    else blockers.push(issue('SERIALIZATION_PLAN_CONTRACT_INVALID', { message: error.message }));
    return null;
  }
}
function inheritPlanValidation(plan, blockers, reviewItems, warnings) {
  if (!plan) return;
  blockers.push(...array(plan.validation?.blockers));
  reviewItems.push(...array(plan.validation?.reviewItems));
  warnings.push(...array(plan.validation?.warnings));
}
function validateModeProfile(mode, profile, blockers) {
  if (!MODES.has(mode)) blockers.push(issue('OPERATING_MODE_INVALID', { mode }));
  if (mode === 'LEGACY') blockers.push(issue('STRICT_LEGACY_FALLBACK_PROHIBITED'));
  if (profile === 'AUDIT_EXTENDED') blockers.push(issue('AUDIT_EXTENDED_PROFILE_NOT_APPROVED'));
  else if (profile !== 'STRICT_PSI') blockers.push(issue('STRICT_PROFILE_REQUIRED', { profile }));
}
function validateBranchProjection(value, occurrencePlan, blockers) {
  if (!isObject(value)) { blockers.push(issue('BRANCH_PROJECTION_MISSING')); return null; }
  const local = [];
  if (value.schema !== 'PsiBranchProjection.v1' || !text(value.projectionId)) local.push('ROOT');
  if (!['CANONICAL', 'SOURCE_SEQUENTIAL'].includes(value.projectionKind)) local.push('KIND');
  if (!Array.isArray(value.branches)) local.push('BRANCHES');
  if (findNumberKeys(value).length) blockers.push(issue('BRANCH_PROJECTION_ALLOCATION_DRIFT', { fields: findNumberKeys(value) }));
  const ids = new Set(), names = new Set(), assigned = new Map();
  const projectionById = new Map(array(occurrencePlan?.componentProjection).map((row) => [text(row.componentProjectionId), row]));
  for (const [index, branch] of array(value.branches).entries()) validateProjectionBranch({ branch, index, value, ids, names, assigned, projectionById, local });
  const expected = [...projectionById.keys()], actual = [...assigned.keys()];
  if (expected.length !== actual.length || expected.some((id) => assigned.get(id) !== 1)) {
    blockers.push(issue('BRANCH_PROJECTION_COVERAGE_MISMATCH', { expected, actual }));
  }
  if (local.length) blockers.push(issue('BRANCH_PROJECTION_INVALID', { errors: local }));
  return local.length || blockers.some((row) => row.code.startsWith('BRANCH_PROJECTION_')) ? null : value;
}
function validateProjectionBranch(context) {
  const { branch, index, value, ids, names, assigned, projectionById, local } = context;
  const branchId = text(branch?.branchId), branchName = text(branch?.branchName);
  if (!branchId || ids.has(branchId)) local.push(`BRANCH_ID:${index}`); else ids.add(branchId);
  if (!branchName || names.has(branchName)) local.push(`BRANCH_NAME:${index}`); else names.add(branchName);
  if (!Array.isArray(branch?.sourceBranches) || !Array.isArray(branch?.componentProjectionIds)) local.push(`BRANCH_SHAPE:${index}`);
  for (const projectionId of array(branch?.componentProjectionIds).map(text)) {
    assigned.set(projectionId, (assigned.get(projectionId) || 0) + 1);
    const projection = projectionById.get(projectionId);
    if (!projection) { local.push(`UNKNOWN_COMPONENT:${projectionId}`); continue; }
    if (value.projectionKind === 'CANONICAL') validateCanonical(branch, projection, local);
    else validateSequential(branch, projection, local);
  }
}
function validateCanonical(branch, projection, errors) {
  if (text(branch.branchName) !== text(branch.canonicalMainLine)) errors.push(`CANONICAL_NAME:${text(branch.branchId)}`);
  if (text(projection.canonicalMainLine) !== text(branch.canonicalMainLine)) errors.push(`CANONICAL_MEMBER:${text(projection.componentProjectionId)}`);
}
function validateSequential(branch, projection, errors) {
  const sources = array(branch.sourceBranches).map(text);
  if (sources.length !== 1 || text(branch.branchName) !== sources[0]) errors.push(`SEQUENTIAL_SHAPE:${text(branch.branchId)}`);
  if (text(projection.sourceBranch) !== sources[0]) errors.push(`SEQUENTIAL_MEMBER:${text(projection.componentProjectionId)}`);
}
function validateRecords(records, occurrencePlan, blockers) {
  const map = new Map(), duplicates = new Set();
  for (const [index, record] of array(records).entries()) {
    const sourceEntityId = text(record?.sourceEntityId);
    if (!sourceEntityId) { blockers.push(issue('SOURCE_RECORD_MISSING', { index, reason: 'BLANK_SOURCE_ENTITY_ID' })); continue; }
    if (map.has(sourceEntityId)) { duplicates.add(sourceEntityId); blockers.push(issue('SOURCE_RECORD_DUPLICATE', { sourceEntityId })); }
    else map.set(sourceEntityId, record);
  }
  const projections = array(occurrencePlan?.componentProjection);
  const planned = new Set(projections.map((row) => text(row.sourceEntityId)));
  for (const projection of projections) {
    const sourceEntityId = text(projection.sourceEntityId), record = map.get(sourceEntityId);
    if (!record || duplicates.has(sourceEntityId)) blockers.push(issue('SOURCE_RECORD_MISSING', { sourceEntityId }));
    else if (normalizeRecordType(record) !== text(projection.normalizedComponentType)) blockers.push(issue('SOURCE_COMPONENT_TYPE_MISMATCH', {
      sourceEntityId, expected: text(projection.normalizedComponentType), actual: normalizeRecordType(record),
    }));
  }
  for (const sourceEntityId of map.keys()) if (!planned.has(sourceEntityId)) blockers.push(issue('SOURCE_RECORD_UNPLANNED', { sourceEntityId }));
  return blockers.some((row) => row.code.startsWith('SOURCE_RECORD_') || row.code === 'SOURCE_COMPONENT_TYPE_MISMATCH') ? null : map;
}
function normalizeRecordType(record) {
  const raw = text(record?.componentType ?? record?.rawType ?? record?.type ?? record?.attrs?.RAW_TYPE ?? record?.attributes?.RAW_TYPE).toUpperCase();
  if (isSupportType(raw)) return 'ATTA';
  if (raw === 'REDUCER') return 'REDU';
  return raw ? mapComponentType(raw) : '';
}
function validateCoordinates(occurrencePlan, blockers) {
  for (const row of array(occurrencePlan?.occurrences)) {
    if (row.disposition === 'EMITTED' && !validPoint(row.coordinateEvidence?.point)) blockers.push(issue('MISSING_EMITTED_COORDINATE', { occurrenceId: text(row.occurrenceId) }));
  }
}
function renderXml({ occurrencePlan, plan, projection, recordMap, config, timestamp }) {
  const lines = header(config, timestamp.xml), trace = [];
  const occurrenceById = new Map(array(occurrencePlan.occurrences).map((row) => [text(row.occurrenceId), row]));
  const projectionById = new Map(array(occurrencePlan.componentProjection).map((row) => [text(row.componentProjectionId), row]));
  const planById = new Map(array(plan.occurrences).map((row) => [text(row.occurrenceId), row]));
  for (const [branchIndex, branch] of projection.branches.entries()) {
    const records = branch.componentProjectionIds.map((id) => recordMap.get(text(projectionById.get(text(id)).sourceEntityId)));
    lines.push('<Branch>', `<Branchname>${esc(branch.branchName)}</Branchname>`, ...conditionLines(records));
    let nodeIndexInBranch = 0;
    for (const projectionId of branch.componentProjectionIds.map(text)) {
      for (const occurrenceId of projectionById.get(projectionId).occurrenceIds.map(text)) {
        const occurrence = occurrenceById.get(occurrenceId), allocated = planById.get(occurrenceId);
        if (occurrence.disposition === 'RESERVED') continue;
        const content = projectStrictPsiNodeContent({ occurrence, sourceRecord: recordMap.get(occurrence.sourceEntityId) });
        lines.push(...nodeLines(allocated.engineeringNodeNumber, content));
        trace.push(traceRow(trace.length, branchIndex, nodeIndexInBranch, projection, branch, occurrence, allocated));
        nodeIndexInBranch += 1;
      }
    }
    lines.push('</Branch>');
  }
  lines.push('</Pipe>', '</PipeStressExport>');
  return { xmlText: lines.join('\n'), trace };
}
function header(config, dateTime) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>', `<PipeStressExport xmlns="${XML_NS}">`,
    `<DateTime>${dateTime}</DateTime>`, '<Source>StagedJSON→EnrichXML</Source>', '<Version>1.0</Version>',
    '<Purpose>StagedJSON enrichment output</Purpose>', `<ProjectName>${esc(config.projectName || '')}</ProjectName>`,
    `<MDBName>${esc(config.mdbName || '/')}</MDBName>`, '<TitleLine>StagedJSON Enriched Export</TitleLine>',
    '<Units>', '  <DistanceUnits>mm</DistanceUnits>', '  <BoreUnits>mm</BoreUnits>',
    '  <PressureUnits>pascal</PressureUnits>', '  <TemperatureUnits>degC</TemperatureUnits>',
    '  <WeightUnits>kg</WeightUnits>', '  <ForceUnits>newton</ForceUnits>',
    '  <WallThicknessUnits>mm</WallThicknessUnits>', '  <FluidDensityUnits>kg/m3</FluidDensityUnits>',
    '</Units>', '<RestrainOpenEnds>Yes</RestrainOpenEnds>', '<AmbientTemperature>21</AmbientTemperature>',
    '<Pipe>', `<FullName>${esc(config.pipeName || '/STAGEDJSON-EXPORT')}</FullName>`,
  ];
}
function conditionLines(records) {
  let t1 = NULL_TEMP, t2 = NULL_TEMP, t3 = NULL_TEMP, p1 = '0', p2 = '0', p3 = '0';
  for (const record of records) {
    const ea = record.enrichedAttributes || {}, attrs = record.attrs || {};
    if (t1 === NULL_TEMP && (ea.designTemperatureC !== undefined || attrs.T1 !== undefined)) t1 = ea.designTemperatureC ?? attrs.T1 ?? attrs.T ?? NULL_TEMP;
    if (t2 === NULL_TEMP && (ea.operatingTemperatureC !== undefined || attrs.T2 !== undefined)) t2 = ea.operatingTemperatureC ?? attrs.T2 ?? NULL_TEMP;
    if (t3 === NULL_TEMP && (ea.minimumTemperatureC !== undefined || attrs.T3 !== undefined)) t3 = ea.minimumTemperatureC ?? attrs.T3 ?? NULL_TEMP;
    if (p1 === '0') p1 = ea.designPressureMpa != null ? ea.designPressureMpa * 1000000 : (attrs.P1 ?? attrs.P ?? '0');
    if (p2 === '0') p2 = attrs.P2 ?? '0'; if (p3 === '0') p3 = attrs.P3 ?? '0';
  }
  const lines = ['<Temperature>', `  <Temperature1>${t1}</Temperature1>`, `  <Temperature2>${t2}</Temperature2>`, `  <Temperature3>${t3}</Temperature3>`];
  for (let position = 4; position <= 9; position += 1) lines.push(`  <Temperature${position}>${NULL_TEMP}</Temperature${position}>`);
  lines.push('</Temperature>', '<Pressure>', `  <Pressure1>${p1}</Pressure1>`, `  <Pressure2>${p2}</Pressure2>`, `  <Pressure3>${p3}</Pressure3>`);
  for (let position = 4; position <= 9; position += 1) lines.push(`  <Pressure${position}>0</Pressure${position}>`);
  return [...lines, '</Pressure>', '<MaterialNumber>0</MaterialNumber>', '<InsulationDensity>0</InsulationDensity>', '<FluidDensity>0</FluidDensity>'];
}
function nodeLines(number, content) {
  const d = content.dimensions, lines = ['<Node>', `  <NodeNumber>${number}</NodeNumber>`, `  <NodeName>${esc(content.nodeName)}</NodeName>`, `  <Endpoint>${content.endpoint}</Endpoint>`];
  if (content.includeRigid !== false) lines.push(`  <Rigid>${content.rigid}</Rigid>`);
  lines.push(`  <ComponentType>${esc(content.componentType)}</ComponentType>`, `  <Weight>${weightText(content)}</Weight>`,
    `  <ComponentRefNo>${esc(content.componentRefNo)}</ComponentRefNo>`, `  <ConnectionType>${esc(content.connectionType)}</ConnectionType>`,
    `  <OutsideDiameter>${d.odMm}</OutsideDiameter>`, `  <WallThickness>${d.wallMm}</WallThickness>`,
    `  <CorrosionAllowance>${d.corrMm}</CorrosionAllowance>`, `  <InsulationThickness>${d.insulationMm}</InsulationThickness>`,
    `  <Position>${formatPosition(content.position)}</Position>`, `  <BendRadius>${content.bendRadius}</BendRadius>`);
  if (content.bendType !== null) lines.push(`  <BendType>${content.bendType}</BendType>`);
  if (content.alphaAngle !== null) lines.push(`  <AlphaAngle>${content.alphaAngle}</AlphaAngle>`);
  lines.push(`  <SIF>${content.sif}</SIF>`);
  for (const restraint of content.restraintXml) lines.push(`  ${restraint.split('\n').join('\n  ')}`);
  if (content.dtxrPos) lines.push(`  <DTXR_POS>${esc(content.dtxrPos)}</DTXR_POS>`);
  if (content.dtxrPs) lines.push(`  <DTXR_PS>${esc(content.dtxrPs)}</DTXR_PS>`);
  if (content.dtxrSource) lines.push(`  <DTXR_SOURCE>${esc(content.dtxrSource)}</DTXR_SOURCE>`);
  lines.push('</Node>'); return lines;
}
function traceRow(traceIndex, branchIndex, nodeIndexInBranch, projection, branch, occurrence, allocated) {
  return {
    traceIndex, branchIndex, nodeIndexInBranch, branchProjectionId: projection.projectionId,
    branchName: branch.branchName, projectionKind: projection.projectionKind,
    occurrenceId: occurrence.occurrenceId, componentProjectionId: occurrence.componentProjectionId,
    sourceEntityId: occurrence.sourceEntityId, logicalNodeId: allocated.logicalNodeId,
    engineeringNodeNumber: allocated.engineeringNodeNumber, psiComponentType: occurrence.psiComponentType,
    projectionRole: occurrence.projectionRole, endpoint: occurrence.endpoint,
  };
}
function validateAtomicity(xmlText, trace, occurrencePlan) {
  const blockers = [], numbers = [...xmlText.matchAll(/<NodeNumber>(\d+)<\/NodeNumber>/g)].map((row) => Number(row[1]));
  const types = [...xmlText.matchAll(/<ComponentType>([^<]*)<\/ComponentType>/g)].map((row) => row[1]);
  if (numbers.length !== trace.length) blockers.push(issue('TRACE_COVERAGE_MISMATCH', { xmlNodes: numbers.length, trace: trace.length }));
  for (const [index, row] of trace.entries()) if (numbers[index] !== row.engineeringNodeNumber || types[index] !== row.psiComponentType) blockers.push(issue('TRACE_XML_NUMBER_MISMATCH', { index }));
  const reserved = new Set(array(occurrencePlan?.occurrences).filter((row) => row.disposition === 'RESERVED').map((row) => row.occurrenceId));
  if (trace.some((row) => reserved.has(row.occurrenceId))) blockers.push(issue('RESERVED_OCCURRENCE_EMISSION_ATTEMPT'));
  return blockers;
}
async function buildBundle(context) {
  const xmlHash = await shaText(context.xmlText), traceHash = await shaSemantic(context.trace);
  const plan = context.plan;
  const base = {
    schema: BUNDLE_SCHEMA, generated: context.generated, selectable: context.selectable,
    operatingMode: context.operatingMode, profile: context.profile, evaluatedAt: context.evaluatedAt,
    projectId: text(context.occurrencePlan?.projectId || context.nodePlan?.projectId),
    zoneId: text(context.occurrencePlan?.zoneId || context.nodePlan?.zoneId),
    nodePlanHash: text(context.nodePlan?.nodePlanHash), occurrencePlanHash: text(context.occurrencePlan?.occurrencePlanHash),
    serializationPlanHash: text(plan?.serializationPlanHash), branchProjectionId: text(context.projection?.projectionId),
    projectionKind: text(context.projection?.projectionKind), xmlText: context.xmlText, xmlHash,
    trace: context.trace, traceHash, summary: summary(context.occurrencePlan, context.projection, context.trace),
    validation: context.validation,
  };
  const bundleHash = await shaSemantic(bundleSemantic(base));
  return deepFreeze({ ...base, bundleHash });
}
function summary(occurrencePlan, projection, trace) {
  const rows = array(occurrencePlan?.occurrences);
  return { branchCount: array(projection?.branches).length, emittedOccurrenceCount: rows.filter((row) => row.disposition === 'EMITTED').length,
    reservedOccurrenceCount: rows.filter((row) => row.disposition === 'RESERVED').length, xmlNodeCount: trace.length, traceCount: trace.length, writerSideAllocations: 0 };
}
function bundleSemantic(value) {
  const keys = ['schema', 'operatingMode', 'profile', 'evaluatedAt', 'projectId', 'zoneId', 'nodePlanHash', 'occurrencePlanHash', 'serializationPlanHash', 'branchProjectionId', 'projectionKind', 'xmlHash', 'traceHash'];
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
function parseEvaluatedAt(value, blockers) {
  if (!text(value)) { blockers.push(issue('EVALUATED_AT_MISSING')); return null; }
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) { blockers.push(issue('EVALUATED_AT_INVALID', { value })); return null; }
  const parts = match.slice(1, 7).map(Number), offset = parseOffset(match[7]);
  if (!validCivil(...parts) || offset === null) { blockers.push(issue('EVALUATED_AT_INVALID', { value })); return null; }
  const seconds = daysFromCivil(parts[0], parts[1], parts[2]) * 86400 + parts[3] * 3600 + parts[4] * 60 + parts[5] - offset;
  const day = floorDiv(seconds, 86400), time = seconds - day * 86400, civil = civilFromDays(day);
  const hh = floorDiv(time, 3600), mm = floorDiv(time - hh * 3600, 60), ss = time - hh * 3600 - mm * 60;
  const canonical = `${pad(civil.y, 4)}-${pad(civil.m)}-${pad(civil.d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}Z`;
  return { canonical, xml: `${pad(civil.d)}/${pad(civil.m)}/${pad(civil.y, 4)}, ${pad(hh)}:${pad(mm)}:${pad(ss)}` };
}
function daysFromCivil(year, month, day) {
  const y = year - (month <= 2 ? 1 : 0), era = floorDiv(y, 400), yoe = y - era * 400;
  const mp = month + (month > 2 ? -3 : 9), doy = floorDiv(153 * mp + 2, 5) + day - 1;
  return era * 146097 + yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy - 719468;
}
function civilFromDays(days) {
  const z = days + 719468, era = floorDiv(z, 146097), doe = z - era * 146097;
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365);
  let y = yoe + era * 400; const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153), d = doy - floorDiv(153 * mp + 2, 5) + 1, m = mp + (mp < 10 ? 3 : -9);
  y += m <= 2 ? 1 : 0; return { y, m, d };
}
function parseOffset(value) { if (value === 'Z') return 0; const match = value.match(/^([+-])(\d{2}):(\d{2})$/); if (!match) return null; const h = Number(match[2]), m = Number(match[3]); return h <= 23 && m <= 59 ? (match[1] === '+' ? 1 : -1) * (h * 3600 + m * 60) : null; }
function validCivil(y, m, d, hh, mm, ss) { return m >= 1 && m <= 12 && d >= 1 && d <= monthDays(y, m) && hh <= 23 && mm <= 59 && ss <= 59; }
function monthDays(y, m) { return [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
function leap(y) { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); }
function floorDiv(a, b) { return Math.floor(a / b); }
function pad(value, width = 2) { return String(value).padStart(width, '0'); }
function weightText(content) { return ['PIPE', 'OLET', 'ELBO', 'BRAN', 'REDU', 'ATTA'].includes(content.componentType) ? String(content.weight) : Number(content.weight).toFixed(2); }
function validPoint(value) { return ['x', 'y', 'z'].every((key) => Number.isFinite(Number(value?.[key]))); }
function findNumberKeys(value, found = []) { if (Array.isArray(value)) value.forEach((row) => findNumberKeys(row, found)); else if (isObject(value)) for (const [key, child] of Object.entries(value)) { if (/(number|counter|offset|allocation|span|lease|increment|range)/i.test(key)) found.push(key); findNumberKeys(child, found); } return [...new Set(found)]; }
function makeValidation(blockers, reviewItems, warnings) { const b = dedupe(blockers), r = dedupe(reviewItems); return { status: b.length ? 'BLOCKED' : (r.length ? 'REVIEW_REQUIRED' : 'PASS'), blockers: b, reviewItems: r, warnings: dedupe(warnings) }; }
function dedupe(rows) { const seen = new Set(); return array(rows).filter((row) => { const key = canonicalSemanticJson(row); if (seen.has(key)) return false; seen.add(key); return true; }); }
async function shaText(value) { const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return `sha256:${[...new Uint8Array(digest)].map(hex).join('')}`; }
async function shaSemantic(value) { return shaText(canonicalSemanticJson(value)); }
function hex(value) { return value.toString(16).padStart(2, '0'); }
function esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function issue(code, evidence = {}) { return { code, evidence }; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
