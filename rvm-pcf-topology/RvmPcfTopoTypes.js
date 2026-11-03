/**
 * RvmPcfTopoTypes.js
 *
 * Shared primitives for PCF topology readiness, gap detection, overlap detection,
 * and future pipe-only fix transactions.
 *
 * Important:
 * - No PCF rows are mutated here.
 * - Only PIPE ep1/ep2 are allowed to move in later resolver stages.
 */

export const DEFAULT_PCF_TOPO_CONFIG = Object.freeze({
  connectToleranceMm: 6,
  defaultFixToleranceMm: 25,
  maxFixToleranceMm: 100,
  minPipeLengthMm: 1,
});

export const PIPE_TYPES = new Set(['PIPE', 'TUBI']);

export const SUPPORT_TYPES = new Set([
  'SUPPORT',
  'REST',
  'GUIDE',
  'LINESTOP',
  'LINE-STOP',
  'LIMIT',
  'ANCHOR',
]);

export const NON_TOPO_TYPES = new Set([
  'MESSAGE-SQUARE',
  'MESSAGE-CIRCLE',
  'ANNOTATION',
  'TEXT',
]);

export const FITTING_TYPES = new Set([
  'BEND',
  'ELBO',
  'ELBOW',
  'TEE',
  'OLET',
  'WELDOLET',
  'SOCKOLET',
  'VALVE',
  'VALV',
  'FLANGE',
  'FLAN',
  'FBLI',
  'GASK',
  'GASKET',
  'REDUCER',
  'REDU',
  'REDUCER-CONCENTRIC',
  'REDUCER-ECCENTRIC',
  'COUPLING',
  'CAP',
]);

export function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function upper(value) {
  return clean(value).toUpperCase();
}

export function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clampNumber(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeTopoConfig(raw = {}) {
  const connectToleranceMm = clampNumber(
    raw.connectToleranceMm ?? raw.continuityMismatchToleranceMm,
    0,
    DEFAULT_PCF_TOPO_CONFIG.maxFixToleranceMm,
    DEFAULT_PCF_TOPO_CONFIG.connectToleranceMm
  );

  const fixToleranceMm = clampNumber(
    raw.fixToleranceMm ??
      raw.gapCandidateToleranceMm ??
      raw.overlapCandidateToleranceMm ??
      raw.pipeGapClashFixToleranceMm ??
      raw.defaultFixToleranceMm,
    0,
    DEFAULT_PCF_TOPO_CONFIG.maxFixToleranceMm,
    DEFAULT_PCF_TOPO_CONFIG.defaultFixToleranceMm
  );

  return {
    connectToleranceMm,
    fixToleranceMm,
    maxFixToleranceMm: DEFAULT_PCF_TOPO_CONFIG.maxFixToleranceMm,
    minPipeLengthMm: clampNumber(
      raw.minPipeLengthMm,
      0.001,
      1000,
      DEFAULT_PCF_TOPO_CONFIG.minPipeLengthMm
    ),
    allowCrossPipelineCandidates: raw.allowCrossPipelineCandidates === true,
    allowPartialExport: raw.allowPartialExport !== false,
  };
}

export function round3(value) {
  return Number(Number(value || 0).toFixed(3));
}

export function isFinitePoint(point) {
  return (
    !!point &&
    typeof point === 'object' &&
    Number.isFinite(Number(point.x)) &&
    Number.isFinite(Number(point.y)) &&
    Number.isFinite(Number(point.z))
  );
}

export function clonePoint(point) {
  if (!isFinitePoint(point)) return null;

  const out = {
    x: Number(point.x),
    y: Number(point.y),
    z: Number(point.z),
  };

  if (Number.isFinite(Number(point.bore))) {
    out.bore = Number(point.bore);
  }

  return out;
}

export function cloneRows(rows = []) {
  return JSON.parse(JSON.stringify(rows || []));
}

export function distance(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return null;

  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function vectorLength(v) {
  if (!v) return null;
  const x = Number(v.x || 0);
  const y = Number(v.y || 0);
  const z = Number(v.z || 0);
  return Math.sqrt(x * x + y * y + z * z);
}

export function componentType(row) {
  return upper(
    row?.type ||
      row?.kind ||
      row?.componentType ||
      row?.attributes?.TYPE ||
      row?.attributes?.['COMPONENT-TYPE']
  );
}

export function isPipe(rowOrType) {
  const type = typeof rowOrType === 'string' ? upper(rowOrType) : componentType(rowOrType);
  return PIPE_TYPES.has(type);
}

export function isSupport(rowOrType) {
  const type = typeof rowOrType === 'string' ? upper(rowOrType) : componentType(rowOrType);
  return SUPPORT_TYPES.has(type);
}

export function isIgnored(rowOrType) {
  const type = typeof rowOrType === 'string' ? upper(rowOrType) : componentType(rowOrType);
  return !type || NON_TOPO_TYPES.has(type) || type.startsWith('MESSAGE-');
}

export function isFitting(rowOrType) {
  const type = typeof rowOrType === 'string' ? upper(rowOrType) : componentType(rowOrType);
  return FITTING_TYPES.has(type) && !PIPE_TYPES.has(type);
}

export function pickFirstNonBlank(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return '';
}

export function rowCa(row, index) {
  const ca = row?.ca || row?.attributes || {};
  const direct = row?.[`ca${index}`] || row?.[`CA${index}`];

  return pickFirstNonBlank(
    direct,
    ca?.[String(index)],
    ca?.[`CA${index}`],
    ca?.[`COMPONENT-ATTRIBUTE${index}`],
    row?.attributes?.[`COMPONENT-ATTRIBUTE${index}`]
  );
}

export function rowRefNo(row, fallback = '') {
  return pickFirstNonBlank(
    row?.refNo,
    row?.ca97,
    row?.CA97,
    rowCa(row, 97),
    row?.sourceCanonicalId,
    row?.id,
    fallback
  );
}

export function rowSeqNo(row, fallback = '') {
  return pickFirstNonBlank(
    row?.seqNo,
    row?.ca98,
    row?.CA98,
    rowCa(row, 98),
    row?.rowNo,
    fallback
  );
}

export function rowLineNo(row, fallback = '') {
  return pickFirstNonBlank(
    row?.lineNo,
    row?.lineNoKey,
    row?.lineKey,
    row?.lineNoComposite,
    row?.attributes?.LINE_NO,
    row?.attributes?.LINENO,
    row?.attributes?.LINE_NO_KEY,
    fallback
  );
}

export function rowName(row, fallback = '') {
  return pickFirstNonBlank(
    row?.name,
    row?.tag,
    row?.componentName,
    row?.sourceName,
    row?.attributes?.NAME,
    row?.attributes?.TAG,
    fallback
  );
}

export function rowIdentity(row, fallback = {}) {
  const type = row ? componentType(row) : fallback.type;

  return {
    rowNo: row?.rowNo ?? fallback.rowNo ?? null,
    type: type || null,
    refNo: rowRefNo(row, fallback.refNo || ''),
    seqNo: rowSeqNo(row, fallback.seqNo || ''),
    lineNo: rowLineNo(row, fallback.lineNo || ''),
    name: rowName(row, fallback.name || ''),
    pipelineRef: row ? pipelineRef(row, fallback.pipelineRef || '') : (fallback.pipelineRef || ''),
    sourceCanonicalId: pickFirstNonBlank(
      row?.sourceCanonicalId,
      row?.id,
      fallback.sourceCanonicalId
    ),
  };
}

export function identityLabel(identity = {}) {
  const parts = [];

  if (identity.refNo) parts.push(`Ref ${identity.refNo}`);
  if (identity.seqNo) parts.push(`Seq ${identity.seqNo}`);
  if (identity.lineNo) parts.push(`Line ${identity.lineNo}`);
  if (identity.pipelineRef) parts.push(`Pipeline ${identity.pipelineRef}`);
  if (identity.name) parts.push(`Name ${identity.name}`);
  if (identity.rowNo != null) parts.push(`Row ${identity.rowNo}`);

  return parts.join(' | ') || 'Unknown element';
}

export function pointLabel(point) {
  if (!isFinitePoint(point)) return '';

  return `(${round3(point.x)}, ${round3(point.y)}, ${round3(point.z)})`;
}

export function componentId(row, index = 0) {
  return (
    clean(
      row?.sourceCanonicalId ||
        row?.id ||
        row?.rowNo ||
        row?.name ||
        row?.attributes?.['COMPONENT-ATTRIBUTE97'] ||
        row?.attributes?.['PIPELINE-REFERENCE'] ||
        index
    ) || String(index)
  );
}

export function pipelineRef(row, fallback = 'RVM-EXTRACT') {
  return (
    clean(
      row?.pipelineRef ||
        row?.attributes?.['PIPELINE-REFERENCE'] ||
        row?.attributes?.PIPELINE_REFERENCE ||
        row?.attributes?.PIPELINE ||
        fallback
    ) || fallback
  );
}

export function rowPoint(row, key) {
  return clonePoint(row?.[key] || row?.attributes?.[key] || row?.attributes?.[key?.toUpperCase?.()]);
}

export function setRowPoint(row, key, point) {
  if (!row || !isFinitePoint(point)) return false;

  row[key] = {
    ...(row[key] && typeof row[key] === 'object' ? row[key] : {}),
    x: Number(point.x),
    y: Number(point.y),
    z: Number(point.z),
  };

  return true;
}

export function pipeLength(row) {
  if (!isPipe(row)) return null;
  return distance(rowPoint(row, 'ep1'), rowPoint(row, 'ep2'));
}

export function pipeLengthAfterMove(row, pointKey, newPoint) {
  if (!isPipe(row)) return null;

  const ep1 = pointKey === 'ep1' ? clonePoint(newPoint) : rowPoint(row, 'ep1');
  const ep2 = pointKey === 'ep2' ? clonePoint(newPoint) : rowPoint(row, 'ep2');

  return distance(ep1, ep2);
}

export function projectPointToSegment(point, a, b) {
  if (!isFinitePoint(point) || !isFinitePoint(a) || !isFinitePoint(b)) return null;

  const ax = Number(a.x);
  const ay = Number(a.y);
  const az = Number(a.z);

  const bx = Number(b.x);
  const by = Number(b.y);
  const bz = Number(b.z);

  const px = Number(point.x);
  const py = Number(point.y);
  const pz = Number(point.z);

  const vx = bx - ax;
  const vy = by - ay;
  const vz = bz - az;

  const wx = px - ax;
  const wy = py - ay;
  const wz = pz - az;

  const lenSq = vx * vx + vy * vy + vz * vz;

  if (lenSq < 1e-9) {
    return {
      t: 0,
      tRaw: 0,
      point: clonePoint(a),
      distanceMm: distance(point, a),
      segmentLengthMm: 0,
    };
  }

  const tRaw = (wx * vx + wy * vy + wz * vz) / lenSq;
  const t = Math.max(0, Math.min(1, tRaw));

  const projected = {
    x: ax + t * vx,
    y: ay + t * vy,
    z: az + t * vz,
  };

  return {
    t,
    tRaw,
    point: projected,
    distanceMm: distance(point, projected),
    segmentLengthMm: Math.sqrt(lenSq),
  };
}

export function pointOnSegment(point, a, b, toleranceMm) {
  const projection = projectPointToSegment(point, a, b);
  if (!projection) return null;

  if (
    projection.distanceMm <= toleranceMm &&
    projection.tRaw >= -0.001 &&
    projection.tRaw <= 1.001
  ) {
    return projection;
  }

  return null;
}

export function topoDiagnostic({
  severity = 'INFO',
  code,
  message,
  row = null,
  port = null,
  candidate = null,
  details = {},
}) {
  const identity = row
    ? rowIdentity(row)
    : {
        rowNo: port?.rowNo ?? null,
        type: port?.componentType ?? null,
        refNo: port?.refNo ?? '',
        seqNo: port?.seqNo ?? '',
        lineNo: port?.lineNo ?? '',
        name: port?.name ?? '',
        pipelineRef: port?.pipelineRef ?? '',
        sourceCanonicalId: port?.sourceCanonicalId ?? '',
      };

  const roleText = port?.role ? ` ${port.role}` : '';
  const pointText = port?.point ? ` at ${pointLabel(port.point)}` : '';
  const identityText = identityLabel(identity);

  return {
    severity,
    code,
    message: message || `${identity.type || 'Component'}${roleText} is disconnected. ${identityText}${pointText}`,

    rowNo: identity.rowNo,
    type: identity.type,
    refNo: identity.refNo,
    seqNo: identity.seqNo,
    lineNo: identity.lineNo,
    name: identity.name,
    pipelineRef: identity.pipelineRef,
    sourceCanonicalId: identity.sourceCanonicalId,

    portId: port?.portId ?? null,
    portRole: port?.role ?? null,
    pointKey: port?.pointKey ?? null,
    point: port?.point ?? null,

    candidateId: candidate?.candidateId ?? null,

    identityLabel: identityText,
    ...details,
  };
}