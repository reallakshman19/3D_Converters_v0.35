import { formatRestraintXml } from './sj-restraint-resolver.js';
import { resolveXmlEngineeringValues } from './sj-node-contract.js';
import { arrivePosition, leavePosition } from './sj-point-resolver.js';
import { rigidValue } from './sj-type-mapper.js';
import { DN_TO_OD_MM } from './sj-weight-db.js';

const DN_TO_NPS_INCH = Object.freeze({
  15: 0.5, 20: 0.75, 25: 1, 32: 1.25, 40: 1.5, 50: 2,
  65: 2.5, 80: 3, 90: 3.5, 100: 4, 125: 5, 150: 6,
  200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18,
  500: 20, 550: 22, 600: 24,
});

export function projectStrictPsiNodeContent({ occurrence, sourceRecord }) {
  if (!occurrence || occurrence.disposition !== 'EMITTED') {
    throw projectorError('RESERVED_OCCURRENCE_EMISSION_ATTEMPT');
  }
  if (!sourceRecord || typeof sourceRecord !== 'object') {
    throw projectorError('SOURCE_RECORD_MISSING');
  }
  const position = normalizePoint(occurrence.coordinateEvidence?.point);
  if (!position) throw projectorError('MISSING_EMITTED_COORDINATE');

  const type = text(occurrence.psiComponentType).toUpperCase();
  let content;
  if (type === 'ELBO') content = bendContent(occurrence, sourceRecord, position);
  else if (type === 'BRAN') content = teeContent(occurrence, sourceRecord, position);
  else if (type === 'REDU') content = reducerContent(occurrence, sourceRecord, position);
  else if (type === 'ATTA') content = supportContent(occurrence, sourceRecord, position);
  else if (['PIPE', 'OLET'].includes(type)) content = boundaryContent(occurrence, sourceRecord, position);
  else content = genericContent(occurrence, sourceRecord, position);
  return deepFreeze(content);
}

function bendContent(occurrence, record, position) {
  return commonContent(occurrence, record, position, {
    nodeName: '', includeRigid: false, connectionType: '', weight: 0,
    bendRadius: resolveBendRadius(record), bendType: 0,
    dtxrPos: text(record.dtxr), dtxrSource: '',
  });
}

function teeContent(occurrence, record, position) {
  return commonContent(occurrence, record, position, {
    nodeName: '', includeRigid: false, connectionType: 'TEE', weight: 0,
    bendRadius: 0, dtxrPos: text(record.dtxr), dtxrSource: '',
  });
}

function reducerContent(occurrence, record, position) {
  return commonContent(occurrence, record, position, {
    nodeName: '', includeRigid: false, connectionType: '', weight: 0,
    bendRadius: 0, alphaAngle: resolveReducerAlphaAngle(record),
    dtxrPos: text(record.dtxr), dtxrSource: '',
  });
}

function supportContent(occurrence, record, position) {
  const restraintRows = Array.isArray(record.resolved?.restraint)
    ? record.resolved.restraint : (record.resolved?.restraint ? [record.resolved.restraint] : []);
  const dtxrPs = text(record.cmpStressN || record.supportTag || record.dtxr);
  return commonContent(occurrence, record, position, {
    nodeName: text(record.supportTag || record.name), includeRigid: true, rigid: 0,
    connectionType: text(record.resolved?.connectionType || 'SUPPORT'), weight: 0,
    bendRadius: 0,
    restraintXml: restraintRows.filter(validRestraint).map(formatRestraintXml),
    dtxrPs, dtxrSource: dtxrPs ? 'staged-json-ps-fallback' : '',
  });
}

function boundaryContent(occurrence, record, position) {
  const first = occurrence.projectionRole === 'ARRIVE';
  return commonContent(occurrence, record, position, {
    nodeName: first ? text(record.name) : '', includeRigid: true,
    rigid: rigidValue(occurrence.psiComponentType),
    connectionType: first ? text(record.connectionType || record.resolved?.connectionType) : '',
    weight: 0, bendRadius: 0,
    alphaAngle: first ? finiteNumber(record.anglDeg) : null,
    dtxrPos: first ? text(record.dtxr) : '',
    dtxrSource: first && record.dtxr ? 'staged-json-position-group' : '',
  });
}

function genericContent(occurrence, record, position) {
  const engineering = resolveXmlEngineeringValues(record);
  return commonContent(occurrence, record, position, {
    nodeName: text(record.name), includeRigid: true,
    rigid: rigidValue(occurrence.psiComponentType),
    connectionType: '',
    weight: engineering.weightKg ?? record.sourceWeightKg ?? 0,
    bendRadius: 0,
    dtxrPos: text(record.dtxr),
    dtxrSource: record.dtxr ? 'staged-json-position-group' : '',
  });
}

function commonContent(occurrence, record, position, overrides) {
  const dimensions = resolveXmlEngineeringValues(record);
  return {
    nodeName: overrides.nodeName,
    endpoint: occurrence.endpoint,
    includeRigid: overrides.includeRigid,
    rigid: overrides.rigid ?? 0,
    componentType: text(occurrence.psiComponentType),
    weight: finiteNumber(overrides.weight) ?? 0,
    componentRefNo: text(record.ref || record.name),
    connectionType: overrides.connectionType,
    dimensions: {
      odMm: dimensions.odMm ?? 0,
      wallMm: dimensions.wallMm ?? 0,
      corrMm: dimensions.corrMm ?? 0,
      insulationMm: dimensions.insulationMm ?? 0,
    },
    position,
    bendRadius: overrides.bendRadius ?? 0,
    bendType: overrides.bendType ?? null,
    alphaAngle: overrides.alphaAngle ?? null,
    sif: 0,
    restraintXml: overrides.restraintXml ?? [],
    dtxrPos: overrides.dtxrPos ?? '',
    dtxrPs: overrides.dtxrPs ?? '',
    dtxrSource: overrides.dtxrSource ?? '',
  };
}

function resolveBendRadius(record) {
  const explicit = firstPositive(
    record?.enrichedAttributes?.bendRadiusMm,
    record?.resolved?.bendRadiusMm,
    record?.attrs?.RADI,
    record?.attrs?.BEND_RADIUS,
  );
  if (explicit !== null) return explicit;
  const nominalBore = firstPositive(record?.enrichedAttributes?.nominalBoreMm, record?.boreMm);
  const nps = DN_TO_NPS_INCH[Math.round(nominalBore ?? NaN)];
  if (!nps) return 0;
  const factor = /\bSR\b|SHORT\s*RADIUS/.test(text(record?.dtxr).toUpperCase()) ? 1 : 1.5;
  return Math.round(nps * 25.4 * factor);
}

function resolveReducerAlphaAngle(record) {
  const explicit = firstPositive(record?.anglDeg, record?.attrs?.ANGL);
  if (explicit !== null) return explicit;
  const start = arrivePosition(record?.attrs), end = leavePosition(record?.attrs);
  if (!start || !end) return null;
  const length = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y), Math.abs(end.z - start.z));
  if (!(length > 0)) return null;
  const largeDn = firstPositive(record?.enrichedAttributes?.nominalBoreMm, record?.boreMm, record?.attrs?.ABORE, record?.attrs?.HBORE, record?.attrs?.HBOR);
  const smallDn = firstPositive(record?.attrs?.LBORE, record?.attrs?.TBORE, record?.attrs?.TBOR);
  const largeOd = resolveXmlEngineeringValues(record).odMm ?? DN_TO_OD_MM[Math.round(largeDn ?? NaN)];
  const smallOd = DN_TO_OD_MM[Math.round(smallDn ?? NaN)];
  if (!(largeOd > 0) || !(smallOd > 0) || largeOd === smallOd) return null;
  const radialChange = Math.abs(largeOd - smallOd) / 2;
  return Math.round((Math.atan2(radialChange, length) * 180 / Math.PI) * 1000) / 1000;
}

function normalizePoint(value) {
  const x = finiteNumber(value?.x ?? value?.X);
  const y = finiteNumber(value?.y ?? value?.Y);
  const z = finiteNumber(value?.z ?? value?.Z);
  return x === null || y === null || z === null ? null : { x, y, z };
}

function firstPositive(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null && number > 0) return number;
  }
  return null;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).replace(/,/g, '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?/);
  const number = match ? Number(match[0]) : NaN;
  return Number.isFinite(number) ? number : null;
}

function validRestraint(value) { return Boolean(value && (value.type || value.kind)); }
function projectorError(code) { const error = new TypeError(code); error.code = code; return error; }
function text(value) { return String(value ?? '').trim(); }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value); Object.values(value).forEach(deepFreeze); return value;
}
