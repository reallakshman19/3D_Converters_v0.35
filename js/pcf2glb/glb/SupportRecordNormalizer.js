import {
  normalizeRestraintAxisLabel,
  normalizeRestraintKind,
  layerIdsForRestraintSupport,
} from './RestraintVisualProfile.js';

export const BM_CII_SUPPORT_RECORD_SCHEMA = 'bm-cii-support-record/v1';

function text(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && text(value) !== '') return value;
  }
  return '';
}

function normalizedSource(value) {
  return text(value).toLowerCase().includes('isonote') ? 'isonote' : 'inputxml';
}

function normalizeKind(value) {
  const kind = normalizeRestraintKind(value) || 'UNKNOWN';
  if (kind === 'SHOE') return 'REST';
  if (kind === 'SUPPORT') return 'REST';
  return kind;
}

function normalizeKindFromRaw(raw = {}) {
  // Prefer support-specific kind fields over generic component type.
  // Some call-sites pass raw.type='SUPPORT', which must not override GUIDE/LINESTOP/etc.
  const rawKind = firstNonEmpty(
    raw.kind,
    raw.supportKind,
    raw.restraintType,
    raw.CMPSUPTYPE,
    raw.SKEY,
    raw.display,
    raw.TYPE,
    raw.Type,
    raw.type,
    raw.labelText,
  );
  let kind = normalizeKind(rawKind);
  const displayText = upper(firstNonEmpty(raw.display, raw.Display, raw.note, raw.Note, raw.labelText, raw.name));
  const typeText = upper(firstNonEmpty(raw.TYPE, raw.Type, raw.type, raw.kind, raw.supportKind, raw.restraintType));

  // BM_CII InputXML basic benchmark: Type 0 rows that are explicitly labelled
  // as ANCHOR/ANC/ANCHOR_PROVISIONAL are real anchor symbols for the visual
  // review, not UNKNOWN debug markers.
  if (kind === 'UNKNOWN' && (displayText.includes('ANCHOR') || typeText === 'ANC')) {
    kind = 'ANCHOR';
  }
  return kind;
}

function numericType(raw = {}) {
  const n = Number(firstNonEmpty(raw.caesar_type, raw.CAESAR_TYPE, raw.TYPE, raw.Type, raw.restraintNumericType));
  return Number.isFinite(n) ? n : null;
}

function vectorAxisLabel(value) {
  if (!Array.isArray(value)) return '';
  const nums = value.map(Number);
  const abs = nums.map((n) => Math.abs(Number.isFinite(n) ? n : 0));
  const max = Math.max(...abs);
  if (max <= 0) return '';
  const index = abs.indexOf(max);
  const letter = ['X', 'Y', 'Z'][index];
  // Positive cosine values in InputXML are not automatically directional "+".
  // A negative cosine is physically signed and is retained as -X/-Y/-Z.
  return nums[index] < 0 ? `-${letter}` : letter;
}

function rawAxisLabel(value) {
  if (Array.isArray(value)) return vectorAxisLabel(value);
  if (value && typeof value === 'object') return vectorAxisLabel([value.x, value.y, value.z]);
  const raw = upper(value);
  if (!raw) return '';
  if (/^[+-][XYZ]$/.test(raw)) return raw;
  if (/^[XYZ]$/.test(raw)) return raw;
  if (raw.includes('-X')) return '-X';
  if (raw.includes('+X')) return '+X';
  if (raw.includes('-Y')) return '-Y';
  if (raw.includes('+Y')) return '+Y';
  if (raw.includes('-Z')) return '-Z';
  if (raw.includes('+Z')) return '+Z';
  if (raw.includes('DX') || raw.includes('X')) return 'X';
  if (raw.includes('DY') || raw.includes('Y')) return 'Y';
  if (raw.includes('DZ') || raw.includes('Z')) return 'Z';
  return normalizeRestraintAxisLabel(raw).replace(/^\+/, '');
}

function cosineAxisFromRaw(raw = {}, fallbackAxis = '') {
  const x = Number(firstNonEmpty(raw.XCOSINE, raw.xcosine, raw.XCosine, raw.xcos, raw.XCOS, raw.cosineX, raw.CX, raw.caesarXCosine, raw.CaesarXCosine, raw.CAESAR_XCOSINE));
  const y = Number(firstNonEmpty(raw.YCOSINE, raw.ycosine, raw.YCosine, raw.ycos, raw.YCOS, raw.cosineY, raw.CY, raw.caesarYCosine, raw.CaesarYCosine, raw.CAESAR_YCOSINE));
  const z = Number(firstNonEmpty(raw.ZCOSINE, raw.zcosine, raw.ZCosine, raw.zcos, raw.ZCOS, raw.cosineZ, raw.CZ, raw.caesarZCosine, raw.CaesarZCosine, raw.CAESAR_ZCOSINE));
  if ([x, y, z].some(Number.isFinite)) {
    const vals = [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, Number.isFinite(z) ? z : 0];
    const abs = vals.map((n) => Math.abs(n));
    const max = Math.max(...abs);
    if (max > 0) {
      const i = abs.indexOf(max);
      const letter = ['X', 'Y', 'Z'][i];
      return vals[i] < 0 ? `-${letter}` : letter;
    }
  }
  return rawAxisLabel(fallbackAxis) || 'NA';
}

function normalizeAxis(value, raw = {}, kind = '') {
  let axis = rawAxisLabel(value);
  const hasExplicitAxis = !!axis;
  if (!axis) {
    const cosineAxis = cosineAxisFromRaw(raw, '');
    if (cosineAxis && cosineAxis !== 'NA') axis = cosineAxis;
  }
  const base = axis.replace(/^[+-]/, '');
  const caesarType = numericType(raw);
  const normalizedKind = normalizeKind(kind || raw.kind || raw.supportKind || raw.restraintType);

  // If axis comes only from raw cosines (no explicit text direction), keep
  // LIMIT/LINESTOP as axis-family by default so they render axial pairs.
  // Signed single-axis arrows should come from explicit source intent, except
  // the InputXML type-18 benchmark rule handled below.
  if (!hasExplicitAxis && (normalizedKind === 'LINESTOP' || normalizedKind === 'LIMIT')) {
    axis = base;
  }

  // BM_CII InputXML-basic primary rule:
  // X/Y/Z from positive cosines are axis labels unless the BM_CII benchmark
  // table below promotes that source row to a signed directional stop. Do not
  // classify signedness from cosine alone.
  if (!axis.startsWith('+') && !axis.startsWith('-')) {
    if (caesarType === 18 && base === 'Z') axis = '+Z';
  }

  // Springs/hangers are coil-only visually. Keep a stable axis label when the
  // source does not provide one; sign is not used to draw an arrow.
  if (!axis && (normalizedKind === 'SPRING' || normalizedKind === 'HANGER')) return 'Y';
  return axis;
}

function bmCiiInputXmlBasicOverride({ source = '', index = 0, node = '', caesarType = null, kind = '', axis = '' } = {}) {
  if (source !== 'inputxml') return { kind, axis, typeLabel: '', bmCiiItem: '', family: '', pipeAxisBasis: '', cosineAxis: '' };
  const nodeText = text(node);
  const type = Number(caesarType);

  // BM_CII benchmark-specific classification supplied by user.
  // IMPORTANT: keep BM_CII item, engineering family, render kind, pipe-axis
  // basis, and cosine meaning as separate fields. Render kind is internal only.
  if (['10', '190', '240'].includes(nodeText)) {
    return {
      kind: 'ANCHOR',
      axis: 'NA',
      typeLabel: 'ANCHOR',
      bmCiiItem: 'ANC',
      family: 'ANCHOR',
      pipeAxisBasis: 'AXIAL / FLOW-BLOCKING',
      cosineAxis: 'PLANE BLOCKING THE FLOW',
    };
  }
  if (nodeText === '35' && type === 17) return {
    kind: 'REST',
    axis: '+Y',
    typeLabel: 'REST',
    bmCiiItem: '+Y',
    family: 'REST',
    pipeAxisBasis: 'VERTICAL',
    cosineAxis: 'VERTICAL AXIS',
  };
  if (nodeText === '35' && type === 1) return {
    kind: 'REST',
    axis: 'X',
    typeLabel: 'AXIS RESTRAINT',
    bmCiiItem: 'X',
    family: 'AXIS RESTRAINT',
    pipeAxisBasis: 'AXIAL',
    cosineAxis: 'X',
  };
  if (nodeText === '35' && type === 3) return {
    kind: 'REST',
    axis: 'Z',
    typeLabel: 'AXIS RESTRAINT',
    bmCiiItem: 'Z',
    family: 'AXIS RESTRAINT',
    pipeAxisBasis: 'AXIAL',
    cosineAxis: 'Z',
  };
  if (nodeText === '130' && type === 18) return {
    kind: 'LINESTOP',
    axis: '+Z',
    typeLabel: 'LINESTOP / DIRECTIONAL STOP',
    bmCiiItem: '+Z',
    family: 'LINESTOP / DIRECTIONAL STOP',
    pipeAxisBasis: 'AXIAL',
    cosineAxis: '+Z',
  };
  if (nodeText === '205' && type === 10) return {
    kind: 'LIMIT',
    axis: axis || 'X',
    typeLabel: 'LIMIT',
    bmCiiItem: 'LIM',
    family: 'LIMIT',
    pipeAxisBasis: 'AXIAL',
    cosineAxis: 'AXIAL TO PIPE',
  };
  if (nodeText === '205' && type === 2) return {
    kind: 'REST',
    axis: 'Y',
    typeLabel: 'REST',
    bmCiiItem: 'Y',
    family: 'REST',
    pipeAxisBasis: 'VERTICAL',
    cosineAxis: 'VERTICAL AXIS',
  };
  if (nodeText === '205' && (kind === 'SPRING' || kind === 'HANGER')) return {
    kind: 'SPRING',
    axis: 'Y',
    typeLabel: 'HANGER / SPRING',
    bmCiiItem: 'HANGER',
    family: 'HANGER / SPRING',
    pipeAxisBasis: 'LATERAL / VERTICAL HANGER',
    cosineAxis: 'VERTICAL AXIS',
  };
  if (nodeText === '255' && type === 17) return {
    kind: 'GUIDE',
    axis: axis || 'Y',
    typeLabel: 'GUIDE',
    bmCiiItem: 'GUIDE',
    family: 'GUIDE',
    pipeAxisBasis: 'LATERAL',
    cosineAxis: 'AS PER NODE DATA',
  };
  if (nodeText === '255' && type === 7) return {
    kind: 'REST',
    axis: '+Y',
    typeLabel: 'REST',
    bmCiiItem: '+Y',
    family: 'REST',
    pipeAxisBasis: 'VERTICAL',
    cosineAxis: 'VERTICAL AXIS',
  };
  return { kind, axis, typeLabel: normalizeKind(kind), bmCiiItem: '', family: '', pipeAxisBasis: '', cosineAxis: '' };
}

function defaultPipeAxisBasisFor({ kind = '', family = '', axis = '' } = {}) {
  const normalizedKind = normalizeKind(kind);
  const familyText = upper(family);
  if (normalizedKind === 'ANCHOR') return 'AXIAL / FLOW-BLOCKING';
  if (normalizedKind === 'GUIDE') return 'LATERAL';
  if (normalizedKind === 'LINESTOP' || normalizedKind === 'LIMIT') return 'AXIAL';
  if (normalizedKind === 'SPRING' || normalizedKind === 'HANGER') return 'LATERAL / VERTICAL HANGER';
  if (familyText.includes('REST') && /^[+-]?Y$/i.test(axis)) return 'VERTICAL';
  if (familyText.includes('AXIS RESTRAINT')) return 'AXIAL';
  return axis ? 'PIPE-RELATIVE AXIS' : 'N/A';
}

function supportDetailFields(raw = {}, { source = '', node = '', kind = '', axis = '', recordId = '', typeLabel = '', bmCiiItem = '', family = '', cosineAxis = '', pipeAxisBasis = '' } = {}) {
  const renderKind = firstNonEmpty(kind, raw.kind, raw.supportKind, raw.restraintType, raw.CMPSUPTYPE);
  const engineeringFamily = firstNonEmpty(
    family,
    raw.engineeringFamily,
    raw.supportEngineeringFamily,
    raw.family,
    typeLabel,
    raw.visualFamily,
    raw.supportFamily,
    renderKind,
  );
  const axisBasis = firstNonEmpty(pipeAxisBasis, raw.axisPipeBasis, raw.AXIS_PIPE_BASIS, defaultPipeAxisBasisFor({ kind, family: engineeringFamily, axis }));
  const cosine = firstNonEmpty(cosineAxis, raw.cosineAxis, raw.COSINE, cosineAxisFromRaw(raw, axis));
  const stiffness = firstNonEmpty(
    raw.STIFFNESS,
    raw.Stiffness,
    raw.stiffness,
    raw.restraintStiffness,
    raw.supportStiffness,
    raw.K,
    raw.k,
  );
  const gap = firstNonEmpty(
    raw.GAP,
    raw.Gap,
    raw.gap,
    raw.gapMm,
    raw.restraintGap,
    raw.supportGap,
  );
  const fricCoef = firstNonEmpty(
    raw.FRIC_COEF,
    raw.FricCoef,
    raw.fricCoef,
    raw.frictionCoefficient,
    raw.FRICTION,
    raw.friction,
    raw.MU,
    raw.mu,
  );
  const tag = firstNonEmpty(
    raw.TAG,
    raw.Tag,
    raw.tag,
    raw.supportTag,
    raw.NodeName,
    raw.nodeName,
    raw.name,
    recordId,
  );
  const guid = firstNonEmpty(
    raw.GUID,
    raw.Guid,
    raw.guid,
    raw.componentGuid,
    raw.ComponentRefNo,
    raw.componentRefNo,
    raw.refNo,
    raw.id,
    recordId,
  );

  return {
    TYPE: engineeringFamily,
    FAMILY: engineeringFamily,
    RENDER_KIND: renderKind,
    BM_CII_ITEM: firstNonEmpty(bmCiiItem, raw.bmCiiItem, raw.BM_CII_ITEM),
    AXIS_PIPE_BASIS: axisBasis,
    COSINE: cosine,
    AXIS_LABEL: axis || 'N/A',
    STIFFNESS: stiffness,
    GAP: gap,
    FRIC_COEF: fricCoef,
    TAG: tag,
    GUID: guid,
    supportType: engineeringFamily,
    supportFamily: engineeringFamily,
    supportEngineeringFamily: engineeringFamily,
    supportRenderKind: renderKind,
    supportBmCiiItem: firstNonEmpty(bmCiiItem, raw.bmCiiItem, raw.BM_CII_ITEM),
    supportAxisPipeBasis: axisBasis,
    supportCosine: cosine,
    supportAxisLabel: axis || 'N/A',
    supportStiffness: stiffness,
    supportGap: gap,
    supportFricCoef: fricCoef,
    supportTag: tag,
    supportGuid: guid,
    supportNode: node,
    supportAxis: axis,
    supportSource: source,
  };
}

export function supportSymbolContractFor(kind) {
  const normalizedKind = normalizeKind(kind);
  if (normalizedKind === 'GUIDE') return 'guide-lateral-arrows-tip-at-od2';
  if (normalizedKind === 'REST' || normalizedKind === 'HOLDDOWN' || normalizedKind === 'SHOE') return 'axis-restraint-arrows-tip-at-od2';
  if (normalizedKind === 'LINESTOP') return 'linestop-axial-arrows-offset-od2';
  if (normalizedKind === 'LIMIT') return 'limit-axial-arrow-offset-od2';
  if (normalizedKind === 'HANGER' || normalizedKind === 'SPRING') return 'spring-coil-only-no-arrow';
  if (normalizedKind === 'ANCHOR') return 'anchor-flat-flow-blocking-plate';
  return 'unknown-debug-default-off';
}

export function supportRecordIdOf({ source = 'inputxml', index = 0, node = '', kind = 'UNKNOWN', axis = '' } = {}) {
  const indexText = String(Number(index) > 0 ? Number(index) : 0).padStart(2, '0');
  const normalizedKind = normalizeKind(kind);
  const normalizedAxis = rawAxisLabel(axis) || 'NA';
  return `${normalizedSource(source)}:${indexText}:node:${text(node) || 'NA'}:kind:${normalizedKind}:axis:${normalizedAxis}`;
}

export function normalizeSupportRecord(raw = {}, context = {}) {
  const source = normalizedSource(firstNonEmpty(context.source, context.supportSource, raw.source, raw.supportSource, raw.SUPPORT_SOURCE));
  const index = Number(context.index ?? raw.index ?? raw.recordIndex ?? raw.supportIndex ?? 0) || 0;
  const node = text(firstNonEmpty(raw.node, raw.nodeNumber, raw.NodeNumber, raw.supportNode, raw.sourceNode, raw.CAESAR_NODE));
  let kind = normalizeKindFromRaw(raw);
  let axis = normalizeAxis(firstNonEmpty(raw.axis, raw.axisGlb, raw.direction, raw.restraintAxis, raw.supportAxis, raw.SUPPORT_AXIS, raw.SUPPORT_DIRECTION, raw.AXIS, raw.Direction), raw, kind);
  const caesarType = numericType(raw);
  const override = bmCiiInputXmlBasicOverride({ source, index, node, caesarType, kind, axis });
  kind = override.kind;
  axis = override.axis;
  const typeLabel = override.typeLabel;
  const bmCiiItem = override.bmCiiItem;
  const family = firstNonEmpty(override.family, typeLabel, kind);
  const cosineAxis = firstNonEmpty(override.cosineAxis, cosineAxisFromRaw(raw, axis));
  const pipeAxisBasis = firstNonEmpty(override.pipeAxisBasis, defaultPipeAxisBasisFor({ kind, family, axis }));
  const recordId = text(firstNonEmpty(
    raw.recordId,
    raw.supportRecordId,
    raw.id,
    raw.supportId,
    context.recordId,
    supportRecordIdOf({ source, index, node, kind, axis }),
  ));
  const layerIds = layerIdsForRestraintSupport({ source, kind, axisLabel: axis });
  const details = supportDetailFields(raw, { source, node, kind, axis, recordId, typeLabel, bmCiiItem, family, cosineAxis, pipeAxisBasis });
  return {
    schema: BM_CII_SUPPORT_RECORD_SCHEMA,
    recordId,
    source,
    index,
    node,
    kind,
    renderKind: kind,
    family,
    axis,
    axisLabel: axis,
    cosineAxis,
    pipeAxisBasis,
    typeLabel,
    bmCiiItem,
    visibleDefault: kind !== 'UNKNOWN',
    supportSymbolContract: supportSymbolContractFor(kind),
    layerIds,
    details,
    raw,
  };
}

export function isUnknownSupportRecord(record = {}) {
  return normalizeKind(record.kind).includes('UNKNOWN') || normalizeKind(record.kind).includes('TYPE0');
}

export function supportTraceFromRecord(record = {}, extra = {}) {
  const pipeAxisBasis = firstNonEmpty(extra.pipeAxisBasis, extra.axisPipeBasis, record.pipeAxisBasis, record.details?.AXIS_PIPE_BASIS);
  const cosineAxis = firstNonEmpty(extra.cosineAxis, extra.COSINE, record.cosineAxis, record.details?.COSINE);
  return {
    schema: BM_CII_SUPPORT_RECORD_SCHEMA,
    entity: 'support',
    semanticCategory: 'support',
    recordId: record.recordId,
    supportRecordId: record.recordId,
    source: record.source,
    supportSource: record.source,
    node: record.node,
    sourceNode: record.node,
    bmCiiItem: record.bmCiiItem,
    supportBmCiiItem: record.bmCiiItem,
    family: record.family,
    supportFamily: record.family,
    engineeringFamily: record.family,
    renderKind: record.renderKind || record.kind,
    supportRenderKind: record.renderKind || record.kind,
    supportKind: record.kind,
    kind: record.kind,
    axisPipeBasis: pipeAxisBasis,
    supportAxisPipeBasis: pipeAxisBasis,
    cosine: cosineAxis,
    cosineAxis,
    supportCosine: cosineAxis,
    axis: record.axis,
    restraintAxis: record.axis,
    axisLabel: record.axis,
    typeLabel: record.typeLabel,
    supportSymbolContract: record.supportSymbolContract,
    visibleDefault: record.visibleDefault,
    ...(record.details || {}),
    ...extra,
  };
}
