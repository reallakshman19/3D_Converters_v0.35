import { enrichInputXmlDocument } from '../xml-cii-2019-standalone/xml-cii-inputxml-enrichment.js';
import { normalizeBranchesForTopology } from './xml-cii-node-to-inputxml-topology-normalizer.js?v=20260709-cross-branch-1';
import { buildNodeToInputXmlDiagnosticRecords } from './xml-cii-node-to-inputxml-audit.js?v=20260713-xml-builder-audit-1';
import { restraintTypeToCaesarCode } from '../../converters/xml-cii2019-core/restraint-type-codes.js';

const SENTINEL = -1.0101;
const POS_TOL_MM = 0.5;
const SHORT_FILLER_MM = 50;
const DEFAULT_FILLER_SEARCH_FACTOR = 5;
const DEFAULT_TEE_OLET_RAY_SEARCH_FACTOR = 10;
const DEFAULT_FILLER_NODE_BASE = 900000;
const DEFAULT_PERP_DOT_TOL = 0.05;
const DEFAULT_RAY_HIT_TOL_MM = 1;
const CONTEXT_DEFAULTS = Object.freeze({
  MODULUS: 203401168,
  HOT_MOD1: 199396464,
  HOT_MOD2: 200711984,
  HOT_MOD3: 204228544,
  HOT_MOD4: 203401168,
  HOT_MOD5: 203401168,
  HOT_MOD6: 203401168,
  HOT_MOD7: 203401168,
  HOT_MOD8: 203401168,
  HOT_MOD9: 203401168,
  POISSONS: 0.292,
  PIPE_DENSITY: 0.007833,
});

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function localName(node) { return text(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function children(node, name) { return Array.from(node?.children || []).filter((child) => localName(child).toUpperCase() === String(name).toUpperCase()); }
function childText(node, name) { return text(children(node, name)[0]?.textContent); }
function maybeNum(value) { const raw = text(value); if (!raw) return null; const n = Number(raw); return Number.isFinite(n) ? n : null; }
function escAttr(value) { return text(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function f(value) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(6) : SENTINEL.toFixed(6); }
function sentinelIfZero(value) { return Math.abs(value) >= POS_TOL_MM ? value : SENTINEL; }
function dist(a, b) { return Math.hypot((b?.x || 0) - (a?.x || 0), (b?.y || 0) - (a?.y || 0), (b?.z || 0) - (a?.z || 0)); }
function vecSub(a, b) { return { x: (a?.x || 0) - (b?.x || 0), y: (a?.y || 0) - (b?.y || 0), z: (a?.z || 0) - (b?.z || 0) }; }
function vecAdd(a, b) { return { x: (a?.x || 0) + (b?.x || 0), y: (a?.y || 0) + (b?.y || 0), z: (a?.z || 0) + (b?.z || 0) }; }
function vecScale(a, s) { return { x: (a?.x || 0) * s, y: (a?.y || 0) * s, z: (a?.z || 0) * s }; }
function vecDot(a, b) { return (a?.x || 0) * (b?.x || 0) + (a?.y || 0) * (b?.y || 0) + (a?.z || 0) * (b?.z || 0); }
function vecLen(a) { return Math.hypot(a?.x || 0, a?.y || 0, a?.z || 0); }
function vecNorm(a) { const len = vecLen(a); return len > POS_TOL_MM ? vecScale(a, 1 / len) : null; }
function parsePos(value) {
  const parts = text(value).split(/\s+/).map(Number);
  return parts.length >= 3 && parts.every(Number.isFinite) ? { x: parts[0], y: parts[1], z: parts[2] } : null;
}
function findChildren(root, name) {
  const out = [];
  const wanted = String(name).toUpperCase();
  const visit = (node) => {
    for (const child of Array.from(node?.children || [])) {
      if (localName(child).toUpperCase() === wanted) out.push(child);
      visit(child);
    }
  };
  visit(root);
  return out;
}
function parseNumberedChildren(parent, prefix, count) {
  const out = [];
  for (let i = 1; i <= count; i += 1) out.push(childText(parent, `${prefix}${i}`));
  return out;
}
function branchContext(branchEl) {
  const temperature = children(branchEl, 'Temperature')[0];
  const pressure = children(branchEl, 'Pressure')[0];
  return {
    branchName: childText(branchEl, 'Branchname'),
    lineId: firstValue(childText(branchEl, 'LineNo'), childText(branchEl, 'LINE_ID')),
    temperatures: temperature ? parseNumberedChildren(temperature, 'Temperature', 9) : [],
    pressures: pressure ? parseNumberedChildren(pressure, 'Pressure', 9) : [],
    hydroPressure: pressure ? childText(pressure, 'HydroPressure') : '',
    materialNumber: childText(branchEl, 'MaterialNumber'),
    insulationDensity: childText(branchEl, 'InsulationDensity'),
    fluidDensity: childText(branchEl, 'FluidDensity'),
  };
}
function resolvedRestraintType(typeText, directionText) {
  const direct = restraintTypeToCaesarCode(typeText);
  if (direct !== null && direct !== undefined) return { typeCode: direct, resolution: 'type' };
  const directional = restraintTypeToCaesarCode(directionText);
  if (directional !== null && directional !== undefined) return { typeCode: directional, resolution: 'direction' };
  return { typeCode: SENTINEL, resolution: 'unresolved' };
}
function parseRestraints(nodeEl) {
  const restraintEls = [...children(nodeEl, 'Restraint'), ...children(nodeEl, 'CustomRestraint')];
  return restraintEls.map((restraintEl) => {
    const sourceType = childText(restraintEl, 'Type').toUpperCase();
    const sourceDirection = childText(restraintEl, 'Direction').toUpperCase();
    const resolved = resolvedRestraintType(sourceType, sourceDirection);
    return {
      sourceElementName: localName(restraintEl),
      sourceType,
      sourceDirection,
      typeResolution: resolved.resolution,
      typeCode: resolved.typeCode,
      stiffness: maybeNum(childText(restraintEl, 'Stiffness')) ?? SENTINEL,
      gap: maybeNum(childText(restraintEl, 'Gap')) ?? SENTINEL,
      friction: maybeNum(childText(restraintEl, 'Friction')) ?? SENTINEL,
      xcosine: maybeNum(childText(restraintEl, 'DirectionCosineX')) ?? SENTINEL,
      ycosine: maybeNum(childText(restraintEl, 'DirectionCosineY')) ?? SENTINEL,
      zcosine: maybeNum(childText(restraintEl, 'DirectionCosineZ')) ?? SENTINEL,
    };
  });
}
function parseNode(branch, nodeEl, index) {
  const componentType = childText(nodeEl, 'ComponentType').toUpperCase();
  const connectionType = childText(nodeEl, 'ConnectionType').toUpperCase();
  const nodeNumberRaw = childText(nodeEl, 'NodeNumber');
  return {
    branch,
    index,
    nodeNumberRaw,
    nodeNumber: maybeNum(nodeNumberRaw),
    nodeName: childText(nodeEl, 'NodeName'),
    endpoint: childText(nodeEl, 'Endpoint'),
    componentType,
    connectionType,
    componentRefNo: childText(nodeEl, 'ComponentRefNo'),
    position: parsePos(childText(nodeEl, 'Position')),
    rigid: childText(nodeEl, 'Rigid'),
    weight: maybeNum(childText(nodeEl, 'Weight')),
    od: maybeNum(childText(nodeEl, 'OutsideDiameter')),
    wallThickness: maybeNum(childText(nodeEl, 'WallThickness')),
    corrosionAllowance: maybeNum(childText(nodeEl, 'CorrosionAllowance')),
    insulationThickness: maybeNum(childText(nodeEl, 'InsulationThickness')),
    bendRadius: maybeNum(childText(nodeEl, 'BendRadius')),
    sif: maybeNum(childText(nodeEl, 'SIF')),
    pipingClass: childText(nodeEl, 'PipingClass'),
    rating: childText(nodeEl, 'Rating'),
    boreMm: childText(nodeEl, 'BoreMm'),
    materialName: childText(nodeEl, 'MaterialName'),
    materialCode: childText(nodeEl, 'MaterialCode'),
    dtxrPos: childText(nodeEl, 'DTXR_POS'),
    dtxrPs: childText(nodeEl, 'DTXR_PS'),
    restraints: parseRestraints(nodeEl),
  };
}
function isRouteNode(row) {
  return row.position && Number(row.nodeNumber) > 0 && row.componentType !== 'GASK';
}
function hasRigidEvidence(row) {
  return row?.componentType === 'RIGID' || Number(row?.rigid) > 0 || (row?.componentType === 'FBLI' && Number(row?.weight) > 0);
}
function hasBendEvidence(row) {
  return Number(row?.bendRadius) > 0 || ['ELBO', 'BEND'].includes(row?.componentType);
}
function hasSifEvidence(row) {
  const type = row?.componentType || '';
  const conn = row?.connectionType || '';
  return Number(row?.sif) > 0 || ['TEE', 'OLET'].includes(type) || (type === 'BRAN' && ['TEE', 'OLET'].includes(conn));
}
function isTeeOrOletNode(row) {
  const type = row?.componentType || '';
  const conn = row?.connectionType || '';
  return ['TEE', 'OLET'].includes(type) || (type === 'BRAN' && ['TEE', 'OLET'].includes(conn));
}
function deltaToCaesar(from, to) {
  const sourceDx = to.x - from.x;
  const sourceDy = to.y - from.y;
  const sourceDz = to.z - from.z;
  return {
    dx: sentinelIfZero(sourceDx),
    dy: sentinelIfZero(sourceDz),
    dz: sentinelIfZero(-sourceDy),
    sourceDx,
    sourceDy,
    sourceDz,
  };
}
function pointToCaesarCoordinate(point) {
  if (!point) return null;
  return {
    x: point.x,
    y: point.z,
    z: -point.y,
  };
}
function firstValue(...values) {
  for (const value of values) if (text(value) !== '') return value;
  return '';
}
function numericAttrFromRow(row, key, fallback = SENTINEL) {
  const value = row?.[key];
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
function fluidDensityForInputXml(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n / 1000000 : SENTINEL;
}
function pressureValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n + 100000) < 1e-9 || Math.abs(n) < 1e-12) return SENTINEL;
  return n;
}
function temperatureValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n + 100000) < 1e-9) return SENTINEL;
  return n;
}
function createElementAttributes(element, includeFullContext) {
  const { from, to, fromRow, toRow, branch, delta } = element;
  const fromCoordinate = pointToCaesarCoordinate(fromRow.position);
  const toCoordinate = pointToCaesarCoordinate(toRow.position);
  const attrs = {
    FROM_NODE: from,
    TO_NODE: to,
    DELTA_X: delta.dx,
    DELTA_Y: delta.dy,
    DELTA_Z: delta.dz,
    DIAMETER: includeFullContext ? numericAttrFromRow(toRow, 'od', numericAttrFromRow(fromRow, 'od')) : SENTINEL,
    WALL_THICK: includeFullContext ? numericAttrFromRow(toRow, 'wallThickness', numericAttrFromRow(fromRow, 'wallThickness')) : SENTINEL,
    INSUL_THICK: includeFullContext ? numericAttrFromRow(toRow, 'insulationThickness', SENTINEL) : SENTINEL,
    CORR_ALLOW: includeFullContext ? numericAttrFromRow(toRow, 'corrosionAllowance', SENTINEL) : SENTINEL,
  };
  if (fromCoordinate) {
    attrs.FROM_X = fromCoordinate.x;
    attrs.FROM_Y = fromCoordinate.y;
    attrs.FROM_Z = fromCoordinate.z;
  }
  if (toCoordinate) {
    attrs.TO_X = toCoordinate.x;
    attrs.TO_Y = toCoordinate.y;
    attrs.TO_Z = toCoordinate.z;
  }
  for (let i = 1; i <= 9; i += 1) attrs[`TEMP_EXP_C${i}`] = includeFullContext ? temperatureValue(branch.context.temperatures[i - 1]) : SENTINEL;
  for (let i = 1; i <= 9; i += 1) attrs[`PRESSURE${i}`] = includeFullContext ? pressureValue(branch.context.pressures[i - 1]) : SENTINEL;
  attrs.HYDRO_PRESSURE = includeFullContext ? pressureValue(branch.context.hydroPressure) : SENTINEL;
  Object.assign(attrs, {
    MODULUS: CONTEXT_DEFAULTS.MODULUS,
    HOT_MOD1: CONTEXT_DEFAULTS.HOT_MOD1,
    HOT_MOD2: CONTEXT_DEFAULTS.HOT_MOD2,
    HOT_MOD3: CONTEXT_DEFAULTS.HOT_MOD3,
    HOT_MOD4: CONTEXT_DEFAULTS.HOT_MOD4,
    HOT_MOD5: CONTEXT_DEFAULTS.HOT_MOD5,
    HOT_MOD6: CONTEXT_DEFAULTS.HOT_MOD6,
    HOT_MOD7: CONTEXT_DEFAULTS.HOT_MOD7,
    HOT_MOD8: CONTEXT_DEFAULTS.HOT_MOD8,
    HOT_MOD9: CONTEXT_DEFAULTS.HOT_MOD9,
    POISSONS: CONTEXT_DEFAULTS.POISSONS,
    PIPE_DENSITY: CONTEXT_DEFAULTS.PIPE_DENSITY,
    INSUL_DENSITY: includeFullContext ? (maybeNum(branch.context.insulationDensity) ?? SENTINEL) : SENTINEL,
    FLUID_DENSITY: includeFullContext ? fluidDensityForInputXml(branch.context.fluidDensity) : SENTINEL,
    REFRACTORY_DENSITY: SENTINEL,
    REFRACTORY_THK: SENTINEL,
    CLADDING_DEN: SENTINEL,
    CLADDING_THK: SENTINEL,
    INSUL_CLAD_UNIT_WEIGHT: SENTINEL,
    MATERIAL_NUM: includeFullContext ? Number(firstValue(toRow.materialCode, branch.context.materialNumber, 1)) || 1 : SENTINEL,
    MATERIAL_NAME: firstValue(toRow.materialName, ''),
    MILL_TOL_PLUS: SENTINEL,
    MILL_TOL_MINUS: SENTINEL,
    SEAM_WELD: SENTINEL,
    NAME: firstValue(toRow.nodeName, ''),
    LINE_ID: firstValue(branch.context.lineId, branch.branchName),
    FROM_NAME: firstValue(fromRow.nodeName, ''),
    TO_NAME: firstValue(toRow.nodeName, ''),
  });
  return attrs;
}
function attrsToText(attrs) {
  return Object.entries(attrs).map(([key, value]) => {
    const out = typeof value === 'number' ? f(value) : escAttr(value);
    return ` ${key}="${out}"`;
  }).join('');
}
function rigidWeight(row) {
  const weight = Number(row?.weight);
  return Number.isFinite(weight) && weight > 0 ? weight * 10 : SENTINEL;
}
function emitSifSlots(node, typeCode) {
  return [
    `<SIF NODE="${f(node)}" TYPE="${f(typeCode)}" SIF1="${f(SENTINEL)}" SIF2="${f(SENTINEL)}"/>`,
    `<SIF NODE="${f(SENTINEL)}" TYPE="${f(SENTINEL)}" SIF1="${f(SENTINEL)}" SIF2="${f(SENTINEL)}"/>`,
  ];
}
function emitRestraintSlots(node, restraints) {
  if (!restraints?.length) return [];
  const lines = [];
  for (let i = 0; i < 6; i += 1) {
    const r = restraints[i];
    if (r) {
      lines.push(`<RESTRAINT NUM="${i + 1}" NODE="${f(node)}" TYPE="${f(r.typeCode)}" STIFFNESS="${f(r.stiffness)}" GAP="${f(r.gap)}" FRIC_COEF="${f(r.friction)}" CNODE="${f(SENTINEL)}" XCOSINE="${f(r.xcosine)}" YCOSINE="${f(r.ycosine)}" ZCOSINE="${f(r.zcosine)}" TAG="" GUID=""/>`);
    } else {
      lines.push(`<RESTRAINT NUM="${i + 1}" NODE="${f(SENTINEL)}" TYPE="${f(SENTINEL)}" STIFFNESS="${f(SENTINEL)}" GAP="${f(SENTINEL)}" FRIC_COEF="${f(SENTINEL)}" CNODE="${f(SENTINEL)}" XCOSINE="${f(SENTINEL)}" YCOSINE="${f(SENTINEL)}" ZCOSINE="${f(SENTINEL)}" TAG="" GUID=""/>`);
    }
  }
  return lines;
}
function elementToXml(element, options) {
  const includeFullContext = element.isFirstInBranch || options?.repeatContextOnEveryElement === true;
  const attrs = createElementAttributes(element, includeFullContext);
  const lines = [`<PIPINGELEMENT${attrsToText(attrs)}>`];
  if (!element.isRayFiller && hasBendEvidence(element.toRow)) {
    const radius = Number(element.toRow.bendRadius) > 0 ? Number(element.toRow.bendRadius) : SENTINEL;
    const midNode = Number(element.to) - 1;
    lines.push(`<BEND RADIUS="${f(radius)}" TYPE="${f(SENTINEL)}" ANGLE1="-2.020200" NODE1="${f(midNode)}" ANGLE2="${f(SENTINEL)}" NODE2="${f(SENTINEL)}" ANGLE3="${f(SENTINEL)}" NODE3="${f(SENTINEL)}" NUM_MITER="${f(SENTINEL)}" FITTINGTHICKNESS="${f(SENTINEL)}" KFACTOR="${f(SENTINEL)}"/>`);
  }
  if (!element.isRayFiller && hasRigidEvidence(element.toRow)) lines.push(`<RIGID WEIGHT="${f(rigidWeight(element.toRow))}" TYPE="Unspecified"/>`);
  if (!element.isRayFiller && hasSifEvidence(element.toRow)) lines.push(...emitSifSlots(element.to, Number(options?.defaultTeeSifType ?? 5)));
  if (!element.isRayFiller) lines.push(...emitRestraintSlots(element.to, element.toRow.restraints));
  lines.push('</PIPINGELEMENT>');
  return lines.join('\n');
}
function elementSideLoadBlock(element) {
  const row = element.toRow;
  const fields = {
    LINE_ID: firstValue(element.branch.context.lineId, element.branch.branchName),
    FROM_NAME: element.fromRow.nodeName,
    TO_NAME: row.nodeName,
    DTXR_POS: row.dtxrPos,
    DTXR_PS: row.dtxrPs,
    ComponentType: row.componentType,
    PipingClass: row.pipingClass,
    Rating: row.rating,
    FromPosition: element.fromRow.position ? `${element.fromRow.position.x} ${element.fromRow.position.y} ${element.fromRow.position.z}` : '',
    ToPosition: row.position ? `${row.position.x} ${row.position.y} ${row.position.z}` : '',
    Position: row.position ? `${row.position.x} ${row.position.y} ${row.position.z}` : '',
    TopologyReason: element.topologyReason,
    FillerType: element.fillerType || '',
  };
  const lines = [`ELEMENT ${element.from}->${element.to}`];
  for (const [key, value] of Object.entries(fields)) if (text(value)) lines.push(`${key}=${value}`);
  return lines.join('\n');
}
function parseNodeXml(xmlText) {
  const doc = new DOMParser().parseFromString(text(xmlText), 'application/xml');
  if (doc.getElementsByTagName?.('parsererror')?.length) throw new Error('Node XML parse failed.');
  const branchEls = findChildren(doc, 'Branch');
  const branches = branchEls.map((branchEl, branchIndex) => {
    const context = branchContext(branchEl);
    const branch = { branchIndex, branchName: context.branchName || `(branch ${branchIndex + 1})`, context, nodes: [] };
    branch.nodes = children(branchEl, 'Node').map((nodeEl, index) => parseNode(branch, nodeEl, index));
    return branch;
  });
  return { doc, branches };
}
function nodeKey(node) { return String(Number(node)); }
function endpointDiameter(row, oppositeRow) {
  const direct = Number(row?.od);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const opposite = Number(oppositeRow?.od);
  return Number.isFinite(opposite) && opposite > 0 ? opposite : null;
}
function closestRaySegmentHit(origin, rayDir, a, b, options) {
  const seg = vecSub(b, a);
  const segLen = vecLen(seg);
  if (segLen <= POS_TOL_MM) return null;
  const segDir = vecScale(seg, 1 / segLen);
  const perpDot = Math.abs(vecDot(rayDir, segDir));
  if (perpDot > (options.perpendicularDotTolerance ?? DEFAULT_PERP_DOT_TOL)) return null;
  const w = vecSub(origin, a);
  const bDot = vecDot(rayDir, segDir);
  const dDot = vecDot(rayDir, w);
  const eDot = vecDot(segDir, w);
  const denom = 1 - bDot * bDot;
  if (Math.abs(denom) < 1e-9) return null;
  const tRay = (bDot * eDot - dDot) / denom;
  const uSeg = (eDot - bDot * dDot) / denom;
  if (tRay <= POS_TOL_MM || uSeg < -POS_TOL_MM || uSeg > segLen + POS_TOL_MM) return null;
  const rayPoint = vecAdd(origin, vecScale(rayDir, tRay));
  const segPoint = vecAdd(a, vecScale(segDir, Math.max(0, Math.min(segLen, uSeg))));
  const miss = dist(rayPoint, segPoint);
  if (miss > (options.rayHitToleranceMm ?? DEFAULT_RAY_HIT_TOL_MM)) return null;
  return { point: segPoint, lengthMm: tRay, perpendicularDot: perpDot, missDistanceMm: miss };
}
function closestPointOnSegment(point, a, b) {
  const seg = vecSub(b, a);
  const segLen = vecLen(seg);
  if (segLen <= POS_TOL_MM) return null;
  const segDir = vecScale(seg, 1 / segLen);
  const along = Math.max(0, Math.min(segLen, vecDot(vecSub(point, a), segDir)));
  return {
    point: vecAdd(a, vecScale(segDir, along)),
    segDir,
    lengthAlongSegmentMm: along,
    segmentLengthMm: segLen,
  };
}
function closestTeeOletPerpendicularHit(origin, runDir, a, b, options) {
  const closest = closestPointOnSegment(origin, a, b);
  if (!closest) return null;
  const ray = vecSub(closest.point, origin);
  const lengthMm = vecLen(ray);
  if (lengthMm <= POS_TOL_MM) return null;
  const rayDir = vecScale(ray, 1 / lengthMm);
  const runPerpendicularDot = runDir ? Math.abs(vecDot(rayDir, runDir)) : 0;
  if (runDir && runPerpendicularDot > (options.perpendicularDotTolerance ?? DEFAULT_PERP_DOT_TOL)) return null;
  const perpendicularDot = Math.abs(vecDot(rayDir, closest.segDir));
  if (perpendicularDot > (options.perpendicularDotTolerance ?? DEFAULT_PERP_DOT_TOL)) return null;
  return {
    point: closest.point,
    lengthMm,
    perpendicularDot,
    runPerpendicularDot,
    missDistanceMm: 0,
    lengthAlongSegmentMm: closest.lengthAlongSegmentMm,
  };
}
function existingEndpointAtHit(candidate, point, options) {
  const toleranceMm = Math.max(POS_TOL_MM, Number(options.rayHitToleranceMm ?? DEFAULT_RAY_HIT_TOL_MM));
  if (candidate.fromRow?.position && dist(candidate.fromRow.position, point) <= toleranceMm) {
    return { node: Number(candidate.from), row: candidate.fromRow, endpoint: 'from' };
  }
  if (candidate.toRow?.position && dist(candidate.toRow.position, point) <= toleranceMm) {
    return { node: Number(candidate.to), row: candidate.toRow, endpoint: 'to' };
  }
  return null;
}
function createSyntheticRayFillerRow(sourceRow, point, syntheticNodeNumber) {
  return {
    ...sourceRow,
    nodeNumberRaw: String(syntheticNodeNumber),
    nodeNumber: syntheticNodeNumber,
    nodeName: `TOPO_RAY_FILLER_${sourceRow.nodeNumber}_${syntheticNodeNumber}`,
    endpoint: '',
    componentType: 'TOPO_RAY_FILLER',
    connectionType: '',
    componentRefNo: '',
    position: point,
    rigid: '',
    weight: null,
    bendRadius: null,
    sif: null,
    dtxrPos: '',
    dtxrPs: '',
    restraints: [],
  };
}
function createRaySplitRow(candidate, point, syntheticNodeNumber) {
  const baseRow = candidate.toRow || candidate.fromRow || {};
  return {
    ...baseRow,
    nodeNumberRaw: String(syntheticNodeNumber),
    nodeNumber: syntheticNodeNumber,
    nodeName: `TOPO_RAY_SPLIT_${candidate.from}_${candidate.to}_${syntheticNodeNumber}`,
    endpoint: '',
    componentType: 'TOPO_RAY_SPLIT',
    connectionType: '',
    componentRefNo: '',
    position: point,
    rigid: '',
    weight: null,
    bendRadius: null,
    sif: null,
    dtxrPos: '',
    dtxrPs: '',
    restraints: [],
  };
}
function splitElementAtRayHit(elements, candidate, splitRow) {
  const index = elements.indexOf(candidate);
  if (index < 0) return null;
  if (!candidate.fromRow?.position || !candidate.toRow?.position || !splitRow?.position) return null;
  const upstreamLengthMm = dist(candidate.fromRow.position, splitRow.position);
  const downstreamLengthMm = dist(splitRow.position, candidate.toRow.position);
  if (upstreamLengthMm <= POS_TOL_MM || downstreamLengthMm <= POS_TOL_MM) return null;
  const upstream = {
    ...candidate,
    to: Number(splitRow.nodeNumber),
    toRow: splitRow,
    lengthMm: upstreamLengthMm,
    delta: deltaToCaesar(candidate.fromRow.position, splitRow.position),
    isRaySplitSegment: true,
    splitSourceElement: candidate,
    topologyReason: 'TOPO_RAY_MIDSPAN_SPLIT_UPSTREAM',
  };
  const downstream = {
    ...candidate,
    from: Number(splitRow.nodeNumber),
    fromRow: splitRow,
    lengthMm: downstreamLengthMm,
    delta: deltaToCaesar(splitRow.position, candidate.toRow.position),
    isFirstInBranch: false,
    isRaySplitSegment: true,
    splitSourceElement: candidate,
    topologyReason: 'TOPO_RAY_MIDSPAN_SPLIT_DOWNSTREAM',
  };
  elements.splice(index, 1, upstream, downstream);
  return { upstream, downstream };
}
function buildNodeRefs(elements) {
  const refs = new Map();
  const push = (node, row, otherRow, element, isFrom) => {
    const key = nodeKey(node);
    if (!refs.has(key)) refs.set(key, []);
    refs.get(key).push({ node, row, otherRow, element, isFrom });
  };
  for (const element of elements) {
    if (element.isRayFiller) continue;
    push(element.from, element.fromRow, element.toRow, element, true);
    push(element.to, element.toRow, element.fromRow, element, false);
  }
  return refs;
}
function nextSyntheticNode(elements, options) {
  const base = Number(options.fillerNodeBase ?? DEFAULT_FILLER_NODE_BASE);
  const used = new Set(elements.flatMap((element) => [nodeKey(element.from), nodeKey(element.to)]));
  let candidate = Number.isFinite(base) ? base : DEFAULT_FILLER_NODE_BASE;
  while (used.has(nodeKey(candidate))) candidate += 1;
  return candidate;
}
function pushFillerDiagnostic(diagnostics, row) {
  diagnostics.fillers.push(row);
  if (row.fillerType === 'short') diagnostics.shortFillers.push(row);
  if (row.fillerType === 'ray') diagnostics.rayFillers.push(row);
}
// Ray fillers run after the base topology is built; only Tee/Olet center nodes are eligible.
// Existing hit endpoints are reused; optional mid-span splitting turns the hit into a real shared topology node.
function teeOletRayGroupForRefs(refs) {
  const teeRef = refs.find((ref) => isTeeOrOletNode(ref.row));
  if (!teeRef || refs.length > 2) return null;
  const runDir = refs.length === 2
    ? vecNorm(vecSub(refs[0].otherRow?.position, refs[1].otherRow?.position))
    : vecNorm(vecSub(teeRef.row?.position, teeRef.otherRow?.position));
  if (!runDir) return null;
  return {
    node: teeRef.node,
    row: teeRef.row,
    branch: teeRef.element.branch,
    refs,
    runDir,
    sourceKind: refs.length === 2 ? 'tee-olet-degree-2' : 'tee-olet-degree-1',
    connectedElements: refs.map((item) => item.element),
  };
}
function applySecondPassRayFillers(elements, diagnostics, options = {}) {
  const teeOletSearchFactor = Number(options.teeOletRaySearchFactor ?? options.teeOletFillerSearchFactor ?? DEFAULT_TEE_OLET_RAY_SEARCH_FACTOR);
  const splitMidspanHits = options.splitRayMidspanHits !== false;
  diagnostics.fillerRule = {
    shortFillerEnabled: options.enableShortFillers !== false,
    shortFillerPass: 'first-pass route segment length < 50mm',
    rayFillerEnabled: options.enableSecondPassFillers !== false && options.enableRayFillers !== false,
    rayFillerPass: 'second-pass Tee/Olet center perpendicular shoot after full topology route build',
    rayDegreeRule: 'only Tee/Olet degree-1 or degree-2 nodes are eligible; normal degree-1/degree-2 nodes are immune',
    rayMidspanSplitEnabled: splitMidspanHits,
    rayMaxSearchFactorDiameter: Number(options.fillerSearchFactor ?? DEFAULT_FILLER_SEARCH_FACTOR),
    teeOletRayMaxSearchFactorDiameter: teeOletSearchFactor,
    perpendicularDotTolerance: Number(options.perpendicularDotTolerance ?? DEFAULT_PERP_DOT_TOL),
    rayHitToleranceMm: Number(options.rayHitToleranceMm ?? DEFAULT_RAY_HIT_TOL_MM),
  };
  if (options.enableSecondPassFillers === false || options.enableRayFillers === false) return;
  const nodeRefs = buildNodeRefs(elements);
  let syntheticNodeNumber = nextSyntheticNode(elements, options);
  for (const refs of nodeRefs.values()) {
    const rayGroup = teeOletRayGroupForRefs(refs);
    if (!rayGroup) continue;
    let best = null;
    let sawDiameter = false;
    const maxSearchMmForRejects = [];
    for (const source of rayGroup.refs) {
      const diameter = endpointDiameter(rayGroup.row, source.otherRow);
      if (!diameter) continue;
      sawDiameter = true;
      const maxSearchMm = teeOletSearchFactor * diameter;
      maxSearchMmForRejects.push(maxSearchMm);
      const connectedElements = new Set(rayGroup.connectedElements);
      for (const candidate of elements) {
        if (candidate.isRayFiller || connectedElements.has(candidate) || connectedElements.has(candidate.splitSourceElement)) continue;
        if (candidate.isShortFiller) continue;
        if (!candidate.fromRow?.position || !candidate.toRow?.position) continue;
        const hit = closestTeeOletPerpendicularHit(rayGroup.row.position, rayGroup.runDir, candidate.fromRow.position, candidate.toRow.position, options);
        if (!hit) continue;
        if (hit.lengthMm > maxSearchMm + POS_TOL_MM) continue;
        if (!best || hit.lengthMm < best.hit.lengthMm) best = { candidate, hit, source, diameter, maxSearchMm };
      }
    }
    if (!sawDiameter) {
      diagnostics.fillerRejected.push({ node: rayGroup.node, fillerType: 'ray', reason: 'NO_DIAMETER_FOR_10D_LIMIT' });
      continue;
    }
    if (!best) {
      diagnostics.fillerRejected.push({ node: rayGroup.node, fillerType: 'ray', reason: 'NO_TEE_OLET_CENTER_PERPENDICULAR_HIT_WITHIN_10D', maxSearchMm: Math.max(...maxSearchMmForRejects) });
      continue;
    }
    const existingEndpoint = existingEndpointAtHit(best.candidate, best.hit.point, options);
    let splitResult = null;
    let targetNode = existingEndpoint?.node ?? syntheticNodeNumber;
    let targetRow = existingEndpoint?.row ?? null;
    let hitEndpoint = existingEndpoint?.endpoint ?? '';
    if (!existingEndpoint && splitMidspanHits) {
      targetRow = createRaySplitRow(best.candidate, best.hit.point, syntheticNodeNumber);
      splitResult = splitElementAtRayHit(elements, best.candidate, targetRow);
      if (!splitResult) throw new Error(`Unable to split ray hit element ${best.candidate.from}->${best.candidate.to} at generated node ${syntheticNodeNumber}.`);
      hitEndpoint = 'midspan-split';
      diagnostics.raySplitNodes.push({
        node: targetNode,
        splitElement: `${best.candidate.from}->${best.candidate.to}`,
        upstreamElement: `${splitResult.upstream.from}->${splitResult.upstream.to}`,
        downstreamElement: `${splitResult.downstream.from}->${splitResult.downstream.to}`,
        sourceDeadEndNode: Number(rayGroup.node),
        sourceRayKind: rayGroup.sourceKind,
        position: `${f(best.hit.point.x)} ${f(best.hit.point.y)} ${f(best.hit.point.z)}`,
        lengthAlongSegmentMm: best.hit.lengthAlongSegmentMm,
      });
    }
    if (!targetRow) targetRow = createSyntheticRayFillerRow(rayGroup.row, best.hit.point, syntheticNodeNumber);
    const rayFiller = {
      branch: rayGroup.branch,
      from: Number(rayGroup.node),
      to: targetNode,
      fromRow: rayGroup.row,
      toRow: targetRow,
      lengthMm: best.hit.lengthMm,
      delta: deltaToCaesar(rayGroup.row.position, best.hit.point),
      isFirstInBranch: false,
      isRayFiller: true,
      isShortFiller: false,
      fillerType: 'ray',
      topologyReason: 'TOPO_RAY_FILLER_TEE_OLET_CENTER_PERPENDICULAR_10D_HIT',
      filler: {
        sourceDeadEndNode: Number(rayGroup.node),
        sourceRayKind: rayGroup.sourceKind,
        hitElement: `${best.candidate.from}->${best.candidate.to}`,
        hitNode: existingEndpoint || splitResult ? targetNode : '',
        hitEndpoint,
        midspanSplit: !!splitResult,
        maxSearchMm: best.maxSearchMm,
        diameterMm: best.diameter,
        perpendicularDot: best.hit.perpendicularDot,
        runPerpendicularDot: best.hit.runPerpendicularDot,
        missDistanceMm: best.hit.missDistanceMm,
      },
    };
    elements.push(rayFiller);
    pushFillerDiagnostic(diagnostics, {
      from: rayFiller.from,
      to: rayFiller.to,
      lengthMm: rayFiller.lengthMm,
      branchName: rayFiller.branch.branchName,
      reason: rayFiller.topologyReason,
      fillerType: 'ray',
      sourceDeadEndNode: Number(rayGroup.node),
      sourceRayKind: rayGroup.sourceKind,
      hitElement: rayFiller.filler.hitElement,
      hitNode: rayFiller.filler.hitNode,
      hitEndpoint: rayFiller.filler.hitEndpoint,
      midspanSplit: rayFiller.filler.midspanSplit,
      maxSearchMm: best.maxSearchMm,
      diameterMm: best.diameter,
      perpendicularDot: best.hit.perpendicularDot,
      runPerpendicularDot: best.hit.runPerpendicularDot,
      missDistanceMm: best.hit.missDistanceMm,
    });
    if (!existingEndpoint) syntheticNodeNumber += 1;
  }
}
function buildElements(branches, options = {}) {
  const normalized = normalizeBranchesForTopology(branches, options);
  const workingBranches = normalized.branches || branches;
  const elements = [];
  const diagnostics = { branches: [], duplicateNodes: normalized.diagnostics || null, fillers: [], shortFillers: [], rayFillers: [], raySplitNodes: [], fillerRejected: [], rigid: [], sif: [], bend: [], restraints: [] };
  const enableShortFillers = options.enableShortFillers !== false;
  for (const branch of workingBranches) {
    const routeRows = branch.nodes.filter(isRouteNode);
    diagnostics.branches.push({ branchName: branch.branchName, nodeRows: branch.nodes.length, routeRows: routeRows.length });
    for (let i = 0; i < routeRows.length - 1; i += 1) {
      const fromRow = routeRows[i];
      const toRow = routeRows[i + 1];
      if (fromRow.nodeNumber === toRow.nodeNumber) continue;
      const lengthMm = dist(fromRow.position, toRow.position);
      if (lengthMm <= POS_TOL_MM) continue;
      const isShortFiller = enableShortFillers && lengthMm < SHORT_FILLER_MM;
      const element = {
        branch,
        from: Number(fromRow.nodeNumber),
        to: Number(toRow.nodeNumber),
        fromRow,
        toRow,
        lengthMm,
        delta: deltaToCaesar(fromRow.position, toRow.position),
        isFirstInBranch: i === 0,
        isRayFiller: false,
        isShortFiller,
        fillerType: isShortFiller ? 'short' : '',
        topologyReason: isShortFiller ? 'TOPO_FILLER_SHORT_FIRST_PASS' : 'SEQUENTIAL_POS_ROUTE',
      };
      elements.push(element);
      if (isShortFiller) {
        pushFillerDiagnostic(diagnostics, { from: element.from, to: element.to, lengthMm, branchName: branch.branchName, reason: element.topologyReason, fillerType: 'short' });
      }
      if (hasRigidEvidence(toRow)) diagnostics.rigid.push({ from: element.from, to: element.to, sourceNode: toRow.nodeNumber, branchName: branch.branchName, componentType: toRow.componentType, weight: toRow.weight, mergedDuplicateNodes: toRow.mergedDuplicateNodes || [] });
      if (hasSifEvidence(toRow)) diagnostics.sif.push({ from: element.from, to: element.to, sourceNode: toRow.nodeNumber, componentType: toRow.componentType, connectionType: toRow.connectionType, mergedDuplicateNodes: toRow.mergedDuplicateNodes || [] });
      if (hasBendEvidence(toRow)) diagnostics.bend.push({ from: element.from, to: element.to, sourceNode: toRow.nodeNumber, bendRadius: toRow.bendRadius, componentType: toRow.componentType, mergedDuplicateNodes: toRow.mergedDuplicateNodes || [] });
      if (toRow.restraints.length) diagnostics.restraints.push({ from: element.from, to: element.to, sourceNode: toRow.nodeNumber, count: toRow.restraints.length, mergedDuplicateNodes: toRow.mergedDuplicateNodes || [] });
    }
  }
  applySecondPassRayFillers(elements, diagnostics, options);
  diagnostics.topologyOptions = {
    duplicateCoordinateCoalescing: normalized.diagnostics?.enabled === true,
    duplicateCoordinateToleranceMm: normalized.diagnostics?.enabled === true ? normalized.diagnostics.toleranceMm : 0,
    shortFillers: enableShortFillers,
    shortFillerThresholdMm: SHORT_FILLER_MM,
    rayFillers: diagnostics.fillerRule?.rayFillerEnabled === true,
  };
  return { elements, diagnostics };
}
function createCoreInputXml(elements, options = {}) {
  const numBend = elements.filter((e) => !e.isRayFiller && hasBendEvidence(e.toRow)).length;
  const numRigid = elements.filter((e) => !e.isRayFiller && hasRigidEvidence(e.toRow)).length;
  const numRest = elements.filter((e) => !e.isRayFiller && e.toRow.restraints.length).length;
  const numSif = elements.filter((e) => !e.isRayFiller && hasSifEvidence(e.toRow)).length;
  const jobName = escAttr(options.jobName || 'XML_NODE_TO_INPUTXML_CORE');
  const header = `<CAESARII xmlns="COADE" VERSION="11.00" XML_TYPE="Input">\n<PIPINGMODEL xmlns="" JOBNAME="${jobName}" TIME="" ISSUE_NO="" NUMELT="${elements.length}" NUMNOZ="0" NOHGRS="0" NUMBEND="${numBend}" NUMRIGID="${numRigid}" NUMEXPJNT="0" NUMREST="${numRest}" NUMFORCMNT="0" NUMUNFLOAD="0" NUMWIND="0" NUMELEOFF="0" NUMALLOW="0" NUMISECT="${numSif}" NORTH_Z="-1" NORTH_Y="0" NORTH_X="0">`;
  const body = elements.map((element) => elementToXml(element, options)).join('\n');
  return `${header}\n${body}\n</PIPINGMODEL></CAESARII>`;
}
function createSummary(elements, diagnostics) {
  return {
    elementCount: elements.length,
    routeElementCount: elements.filter((element) => !element.isRayFiller).length,
    rigidCount: diagnostics.rigid.length,
    sifCount: diagnostics.sif.length,
    bendCount: diagnostics.bend.length,
    restraintNodeCount: diagnostics.restraints.length,
    duplicateNodeDroppedCount: diagnostics.duplicateNodes?.droppedCount || 0,
    fillerCount: diagnostics.fillers.length,
    shortFillerCount: diagnostics.shortFillers.length,
    rayFillerCount: diagnostics.rayFillers.length,
    raySplitNodeCount: diagnostics.raySplitNodes?.length || 0,
    fillerRejectedCount: diagnostics.fillerRejected?.length || 0,
  };
}
export function buildInputXmlFromNodeXml(xmlText, options = {}) {
  const parsed = parseNodeXml(xmlText);
  const { elements, diagnostics } = buildElements(parsed.branches, options);
  const coreInputXmlText = createCoreInputXml(elements, options);
  const elementSideLoadText = elements.map(elementSideLoadBlock).join('\n\n');
  const summary = createSummary(elements, diagnostics);
  const buildProfile = text(options.buildProfile) || 'inputxml';
  const diagnosticRecords = buildNodeToInputXmlDiagnosticRecords({
    branches: parsed.branches,
    elements,
    topologyDiagnostics: diagnostics,
    options,
  });
  let finalInputXmlText = coreInputXmlText;
  let enrichment = null;
  const warnings = [];
  if (options.applyEnrichment !== false) {
    try {
      enrichment = enrichInputXmlDocument({
        sourceText: coreInputXmlText,
        sourceName: options.sourceName || 'node-based.xml',
        elementSideLoadText,
        supportConfigJson: options.supportConfigJson || '{}',
        options: {
          inputXmlOutputMode: options.inputXmlOutputMode || 'full-document',
          inputXmlRestraintPolicy: options.inputXmlRestraintPolicy || 'merge-existing-and-dtxr-derived-restraints',
          fillSentinelFromLineContext: options.fillSentinelFromLineContext !== false,
          normalizePressureCaseNames: options.normalizePressureCaseNames !== false,
          pointPropertiesBasis: options.pointPropertiesBasis || 'TO',
        },
      });
      if (enrichment?.ok && enrichment.enrichedText) finalInputXmlText = enrichment.enrichedText;
      else warnings.push(enrichment?.error || 'InputXML enrichment returned no enriched text.');
    } catch (error) {
      warnings.push(`InputXML enrichment failed: ${error?.message || String(error)}`);
    }
  }
  return {
    ok: true,
    sourceKind: 'xml',
    outputKind: 'inputxml',
    coreInputXmlText,
    finalInputXmlText,
    elementSideLoadText,
    elements,
    diagnostics: { ...diagnostics, summary, buildProfile, enrichment: enrichment?.diagnostics || null, records: diagnosticRecords, warnings },
    warnings,
    error: null,
  };
}

export const __xmlCiiNodeToInputXmlCoreInternals = Object.freeze({ parseNodeXml, buildElements, createCoreInputXml, deltaToCaesar, closestRaySegmentHit, applySecondPassRayFillers, normalizeBranchesForTopology });
