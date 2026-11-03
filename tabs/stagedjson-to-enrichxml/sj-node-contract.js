/**
 * Component-specific PSI-116 node projection contracts.
 * A component may reserve two legacy numbering slots while emitting only the
 * engineering node required by the downstream XML -> CII converter.
 */

import { arrivePosition, leavePosition, bestPosition } from './sj-point-resolver.js';
import { rigidValue } from './sj-type-mapper.js';
import { authoritativeNumber } from './sj-enrichment-authority.js';
import { DN_TO_OD_MM } from './sj-weight-db.js';

const XML_BOUNDARY_TYPES = new Set(['PIPE', 'ELBO', 'BEND', 'TEE', 'OLET', 'REDU', 'REDUCER']);

const DN_TO_NPS_INCH = Object.freeze({
  15: 0.5, 20: 0.75, 25: 1, 32: 1.25, 40: 1.5, 50: 2,
  65: 2.5, 80: 3, 90: 3.5, 100: 4, 125: 5, 150: 6,
  200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18,
  500: 20, 550: 22, 600: 24,
});

export function isXmlBoundaryComponent(componentType) {
  return XML_BOUNDARY_TYPES.has(upper(componentType));
}

export function resolveXmlEngineeringValues(record) {
  return {
    odMm: authoritativeNumber(record, 'pipeOdMm', 'odMm'),
    wallMm: authoritativeNumber(record, 'wallThicknessMm', 'wallMm'),
    corrMm: authoritativeNumber(record, 'corrosionAllowanceMm', 'corrMm'),
    insulationMm: authoritativeNumber(record, 'insulationThicknessMm', 'insulationMm', record?.insuMm) ?? 0,
    weightKg: authoritativeNumber(record, 'componentWeightKg', 'weightKg', record?.sourceWeightKg),
  };
}

export function projectBoundaryNodeContract(record, startNodeNumber) {
  const componentType = normalizedType(record?.componentType);
  if (!isXmlBoundaryComponent(componentType)) {
    throw new TypeError(`No boundary-node contract for ${componentType || '(blank)'}.`);
  }

  const common = commonSpec(record);
  let nodes;

  if (componentType === 'ELBO') {
    nodes = [{
      ...common,
      nodeNumber: startNodeNumber,
      nodeName: '',
      endpoint: 0,
      includeRigid: false,
      componentType: 'ELBO',
      connectionType: '',
      position: arrivePosition(record.attrs) ?? bestPosition(record.attrs),
      bendRadius: resolveBendRadius(record),
      bendType: 0,
      alphaAngle: null,
      dtxrSource: '',
    }];
  } else if (componentType === 'TEE') {
    nodes = [{
      ...common,
      nodeNumber: startNodeNumber + 10,
      nodeName: '',
      endpoint: 1,
      includeRigid: false,
      componentType: 'BRAN',
      connectionType: 'TEE',
      position: leavePosition(record.attrs) ?? bestPosition(record.attrs),
      bendRadius: 0,
      alphaAngle: null,
      dtxrSource: '',
    }];
  } else if (componentType === 'REDU') {
    nodes = [{
      ...common,
      nodeNumber: startNodeNumber + 10,
      nodeName: '',
      endpoint: 2,
      includeRigid: false,
      componentType: 'REDU',
      connectionType: '',
      position: leavePosition(record.attrs) ?? bestPosition(record.attrs),
      bendRadius: 0,
      alphaAngle: resolveReducerAlphaAngle(record),
      dtxrSource: '',
    }];
  } else {
    nodes = genericBoundaryPair(record, startNodeNumber, common);
  }

  return Object.freeze({
    nodes: Object.freeze(nodes.map((node) => Object.freeze(node))),
    numberingSpan: 2,
    primaryNodeNumber: nodes[0].nodeNumber,
  });
}

function genericBoundaryPair(record, startNodeNumber, common) {
  const rigid = rigidValue(record.componentType);
  return [
    {
      ...common,
      nodeNumber: startNodeNumber,
      nodeName: record.name,
      endpoint: 1,
      includeRigid: true,
      rigid,
      componentType: normalizedType(record.componentType),
      connectionType: record.connectionType || record.resolved?.connectionType || '',
      position: arrivePosition(record.attrs),
      bendRadius: 0,
      alphaAngle: finiteNumber(record.anglDeg),
      dtxrSource: record.dtxr ? 'staged-json-position-group' : '',
    },
    {
      ...common,
      nodeNumber: startNodeNumber + 10,
      nodeName: '',
      endpoint: 2,
      includeRigid: true,
      rigid,
      componentType: normalizedType(record.componentType),
      connectionType: '',
      position: leavePosition(record.attrs),
      bendRadius: 0,
      alphaAngle: null,
      dtxrSource: '',
    },
  ];
}

function commonSpec(record) {
  return {
    weight: 0,
    componentRefNo: record.ref || record.name,
    dimensions: resolveXmlEngineeringValues(record),
    sif: 0,
    dtxrPos: record.dtxr || '',
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
  const description = upper(record?.dtxr);
  const factor = /\bSR\b|SHORT\s*RADIUS/.test(description) ? 1 : 1.5;
  return Math.round(nps * 25.4 * factor);
}

function resolveReducerAlphaAngle(record) {
  const explicit = firstPositive(record?.anglDeg, record?.attrs?.ANGL);
  if (explicit !== null) return explicit;

  const start = arrivePosition(record?.attrs);
  const end = leavePosition(record?.attrs);
  if (!start || !end) return null;
  const axialLength = Math.max(
    Math.abs(end.x - start.x),
    Math.abs(end.y - start.y),
    Math.abs(end.z - start.z),
  );
  if (!(axialLength > 0)) return null;

  const largeDn = firstPositive(
    record?.enrichedAttributes?.nominalBoreMm,
    record?.boreMm,
    record?.attrs?.ABORE,
    record?.attrs?.HBORE,
    record?.attrs?.HBOR,
  );
  const smallDn = firstPositive(
    record?.attrs?.LBORE,
    record?.attrs?.TBORE,
    record?.attrs?.TBOR,
  );
  const largeOd = resolveXmlEngineeringValues(record).odMm
    ?? DN_TO_OD_MM[Math.round(largeDn ?? NaN)];
  const smallOd = DN_TO_OD_MM[Math.round(smallDn ?? NaN)];
  if (!(largeOd > 0) || !(smallOd > 0) || largeOd === smallOd) return null;

  const radialChange = Math.abs(largeOd - smallOd) / 2;
  return Math.round((Math.atan2(radialChange, axialLength) * 180 / Math.PI) * 1000) / 1000;
}

function normalizedType(value) {
  const type = upper(value);
  if (type === 'BEND') return 'ELBO';
  if (type === 'REDUCER') return 'REDU';
  return type;
}

function firstPositive(...values) {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).replace(/,/g, '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function upper(value) {
  return String(value ?? '').trim().toUpperCase();
}
