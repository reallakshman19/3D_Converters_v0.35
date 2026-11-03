const EPS = 1e-9;

export function resolveNonPrimitiveAutoBends(input = {}, options = {}) {
  const sourceKind = input.sourceKind || 'unknown';
  const segments = Array.isArray(input.segments) ? input.segments : [];
  const explicitBends = Array.isArray(input.explicitBends) ? input.explicitBends : [];
  const existingNodeKinds = normalizeNodeKindMap(input.existingNodeKinds);
  const settings = {
    enabled: options.enabled !== false,
    collinearToleranceDeg: options.collinearToleranceDeg ?? 3,
    minSegmentLengthMm: options.minSegmentLengthMm ?? 50,
    maxTurnAngleDeg: options.maxTurnAngleDeg ?? 150,
    defaultRadiusFactor: options.defaultRadiusFactor ?? 1.5,
  };

  const diagnostics = {
    autoBendEnabled: settings.enabled,
    sourceKind,
    candidateNodeCount: 0,
    emittedBendCount: 0,
    explicitBendCount: 0,
    explicitBendInvalidCount: 0,
    syntheticSuppressedByExplicitBendCount: 0,
    skippedCollinearCount: 0,
    skippedStraightContinuationCount: 0,
    skippedShortSegmentCount: 0,
    skippedAmbiguousBranchCount: 0,
    skippedExistingComponentCount: 0,
    skippedDegenerateCount: 0,
    warnings: [],
  };

  if (!settings.enabled) return { enabled: false, sourceKind, bends: [], trims: [], diagnostics };

  const explicit = buildExplicitBends(explicitBends, diagnostics);
  if (explicit.length) {
    diagnostics.explicitBendCount = explicit.length;
    diagnostics.syntheticSuppressedByExplicitBendCount = explicit.length;
    diagnostics.emittedBendCount = explicit.length;
    diagnostics.warnings.push({ code: 'explicitBendSourceOfTruth', message: 'Explicit staged/InputXML BEND records are used as source of truth; synthetic 1.5D endpoint trims are suppressed.' });
    return { enabled: true, sourceKind, bends: explicit, trims: [], diagnostics };
  }

  const pipeSegments = segments.filter(isPlainPipeSegment);
  const nodeMap = buildNodeIncidenceMap(pipeSegments);
  const bends = [];
  const trims = [];

  for (const [nodeId, incident] of nodeMap.entries()) {
    if (incident.length !== 2) continue;
    diagnostics.candidateNodeCount += 1;

    const existingKind = String(existingNodeKinds.get(nodeId) || '').toUpperCase();
    if (isExistingComponentNode(existingKind)) {
      diagnostics.skippedExistingComponentCount += 1;
      diagnostics.warnings.push({ nodeId, code: 'explicitComponentNode', message: `Existing ${existingKind} component blocks auto-bend generation.` });
      continue;
    }

    const [segA, segB] = incident;
    if (!sameBranchOrLine(segA, segB)) {
      diagnostics.skippedAmbiguousBranchCount += 1;
      diagnostics.warnings.push({ nodeId, code: 'ambiguousBranch', message: 'Pipe segments meet at node but branch/line ownership differs.' });
      continue;
    }

    const P = getSharedPoint(nodeId, segA, segB);
    const A = getOtherPoint(nodeId, segA);
    const B = getOtherPoint(nodeId, segB);
    if (!P || !A || !B) {
      diagnostics.skippedDegenerateCount += 1;
      diagnostics.warnings.push({ nodeId, code: 'degenerateCandidate', message: 'Candidate rejected because one or more endpoints are missing.' });
      continue;
    }

    const lenA = distance(P, A);
    const lenB = distance(P, B);
    if (lenA < settings.minSegmentLengthMm || lenB < settings.minSegmentLengthMm) {
      diagnostics.skippedShortSegmentCount += 1;
      diagnostics.warnings.push({ nodeId, code: 'shortAdjacentSegment', message: 'Candidate rejected because an adjacent pipe segment is too short.' });
      continue;
    }

    const dA = normalize(sub(A, P));
    const dB = normalize(sub(B, P));
    if (!dA || !dB) {
      diagnostics.skippedDegenerateCount += 1;
      diagnostics.warnings.push({ nodeId, code: 'zeroDirection', message: 'Candidate rejected because a direction vector is zero length.' });
      continue;
    }

    const turn = classifyRealTurn(dA, dB, settings);
    if (!turn.accepted) {
      if (turn.reason === 'collinear') diagnostics.skippedCollinearCount += 1;
      else if (turn.reason === 'straightContinuation') diagnostics.skippedStraightContinuationCount += 1;
      else diagnostics.skippedDegenerateCount += 1;
      diagnostics.warnings.push({ nodeId, code: turn.code, message: turn.message });
      continue;
    }

    const turnAngleRad = turn.angleRad;
    const turnAngleDeg = turn.angleDeg;
    const planeNormal = normalize(cross(dA, dB));
    if (!planeNormal) {
      diagnostics.skippedCollinearCount += 1;
      diagnostics.warnings.push({ nodeId, code: 'collinearNoPlane', message: 'Candidate rejected because collinear pipe vectors do not define a bend plane.' });
      continue;
    }

    const radiusResult = resolveBendRadiusMm({ segmentA: segA, segmentB: segB, lenA, lenB, turnAngleRad, defaultRadiusFactor: settings.defaultRadiusFactor });
    const radiusMm = radiusResult.radiusMm;
    const trimMm = radiusMm * Math.tan(turnAngleRad / 2);
    if (!Number.isFinite(trimMm) || trimMm <= 0 || trimMm > lenA * 0.45 || trimMm > lenB * 0.45) {
      diagnostics.skippedShortSegmentCount += 1;
      diagnostics.warnings.push({ nodeId, code: 'trimTooLarge', message: 'Auto-bend trim exceeds safe adjacent pipe span.' });
      continue;
    }

    const tangentA = add(P, scale(dA, trimMm));
    const tangentB = add(P, scale(dB, trimMm));
    const bisector = normalize(add(dA, dB));
    if (!bisector) {
      diagnostics.skippedDegenerateCount += 1;
      diagnostics.warnings.push({ nodeId, code: 'missingBisector', message: 'Candidate rejected because turn bisector could not be resolved.' });
      continue;
    }
    const centerDistance = radiusMm / Math.sin(turnAngleRad / 2);
    const center = add(P, scale(bisector, centerDistance));

    bends.push({
      id: `auto-bend:${nodeId}`,
      nodeId,
      segmentAId: segA.id,
      segmentBId: segB.id,
      center,
      tangentA,
      tangentB,
      radiusMm,
      turnAngleDeg,
      planeNormal,
      pipeOdMm: readPositiveNumber(segA.pipeOdMm) || readPositiveNumber(segB.pipeOdMm) || null,
      boreMm: readPositiveNumber(segA.boreMm) || readPositiveNumber(segB.boreMm) || null,
      source: radiusResult.source,
      warnings: radiusResult.warnings,
    });

    trims.push({ segmentId: segA.id, nodeId, trimFromNodeMm: trimMm, reason: 'auto-bend' });
    trims.push({ segmentId: segB.id, nodeId, trimFromNodeMm: trimMm, reason: 'auto-bend' });
    for (const warning of radiusResult.warnings) diagnostics.warnings.push({ nodeId, code: warning, message: warning });
    diagnostics.emittedBendCount += 1;
  }

  return { enabled: true, sourceKind, bends, trims, diagnostics };
}

export function buildVisualTrimLookup(trims = []) {
  const lookup = new Map();
  for (const trim of trims) lookup.set(`${trim.segmentId}:${trim.nodeId}`, trim.trimFromNodeMm);
  return lookup;
}

export function isRealTurnDirection(directionA, directionB, toleranceDeg = 3, maxTurnAngleDeg = 150) {
  const turn = classifyRealTurn(directionA, directionB, { collinearToleranceDeg: toleranceDeg, maxTurnAngleDeg });
  return turn.accepted;
}

export function resolveBendRadiusMm({ segmentA, segmentB, lenA, lenB, turnAngleRad, defaultRadiusFactor = 1.5 }) {
  const explicit = readPositiveNumber(segmentA.bendRadiusMm)
    || readPositiveNumber(segmentB.bendRadiusMm)
    || readPositiveNumber(segmentA.attrs?.bendRadiusMm)
    || readPositiveNumber(segmentB.attrs?.bendRadiusMm)
    || readPositiveNumber(segmentA.attrs?.radius)
    || readPositiveNumber(segmentB.attrs?.radius);
  const pipeOdMm = readPositiveNumber(segmentA.pipeOdMm)
    || readPositiveNumber(segmentB.pipeOdMm)
    || readPositiveNumber(segmentA.boreMm)
    || readPositiveNumber(segmentB.boreMm)
    || 100;

  let radiusMm = explicit || pipeOdMm * defaultRadiusFactor;
  let source = explicit ? 'explicit-radius' : 'od-derived-radius';
  const warnings = [];
  const trimMm = radiusMm * Math.tan(turnAngleRad / 2);
  const maxTrimMm = Math.min(lenA, lenB) * 0.45;
  if (trimMm > maxTrimMm) {
    radiusMm = maxTrimMm / Math.tan(turnAngleRad / 2);
    source = 'segment-capped-radius';
    warnings.push('radiusCappedByShortSegment');
  }
  return { radiusMm, source, warnings };
}

function buildExplicitBends(records = [], diagnostics) {
  const bends = [];
  for (const [index, record] of records.entries()) {
    const bend = buildExplicitBend(record, index, diagnostics);
    if (bend) bends.push(bend);
    else diagnostics.explicitBendInvalidCount += 1;
  }
  return bends;
}

function buildExplicitBend(record = {}, index, diagnostics) {
  const tangentA = toVec3(record.from || record.tangentA || record.apos || record.APOS);
  const tangentB = toVec3(record.to || record.tangentB || record.lpos || record.LPOS);
  const radiusMm = readPositiveNumber(record.radiusMm ?? record.bendRadiusMm ?? record.radius);
  const turnAngleDeg = readPositiveNumber(record.turnAngleDeg ?? record.angleDeg ?? record.angle);
  if (!tangentA || !tangentB || !radiusMm || !turnAngleDeg) return null;
  const chord = sub(tangentB, tangentA);
  const chordLength = length(chord);
  if (!(chordLength > EPS)) return null;
  const chordDir = normalize(chord);
  const planeNormal = choosePlaneNormal(chordDir, record.planeNormal);
  const radialDir = normalize(cross(planeNormal, chordDir)) || choosePerpendicular(chordDir);
  const halfChord = chordLength / 2;
  const centerOffset = Math.sqrt(Math.max(0, (radiusMm * radiusMm) - (halfChord * halfChord)));
  const center = add(midpoint(tangentA, tangentB), scale(radialDir, centerOffset));
  const expectedChord = 2 * radiusMm * Math.sin(degToRad(turnAngleDeg) / 2);
  const warnings = [...(record.warnings || [])];
  if (Number.isFinite(expectedChord) && expectedChord > EPS && Math.abs(expectedChord - chordLength) > Math.max(1, expectedChord * 0.05)) {
    warnings.push('explicitBendChordDoesNotMatchRadiusAngle');
    diagnostics.warnings.push({ nodeId: record.nodeId || `explicit:${index + 1}`, code: 'explicitBendChordDoesNotMatchRadiusAngle', message: 'Explicit BEND radius/angle do not match APOS/LPOS chord; preview keeps source radius/angle and suppresses synthetic 1.5D trim.' });
  }
  return {
    id: record.id || `explicit-bend:${index + 1}`,
    nodeId: record.nodeId || record.bendNode1 || `explicit:${index + 1}`,
    segmentAId: record.segmentAId || '',
    segmentBId: record.segmentBId || '',
    center,
    tangentA,
    tangentB,
    radiusMm,
    turnAngleDeg,
    planeNormal,
    pipeOdMm: readPositiveNumber(record.pipeOdMm) || null,
    boreMm: readPositiveNumber(record.boreMm) || null,
    source: record.source || 'explicit-staged-bend',
    bendNode1: record.bendNode1 || '',
    bendNode2: record.bendNode2 || '',
    sourcePath: record.id || record.sourcePath || '',
    warnings,
  };
}

function choosePlaneNormal(chordDir, explicitNormal) {
  const explicit = explicitNormal ? normalize(toVec3(explicitNormal)) : null;
  if (explicit) return explicit;
  return normalize(cross(chordDir, { x: 0, y: 1, z: 0 }))
    || normalize(cross(chordDir, { x: 0, y: 0, z: 1 }))
    || { x: 0, y: 1, z: 0 };
}

function choosePerpendicular(direction) {
  return normalize(cross(direction, { x: 0, y: 1, z: 0 }))
    || normalize(cross(direction, { x: 0, y: 0, z: 1 }))
    || { x: 1, y: 0, z: 0 };
}

function classifyRealTurn(directionA, directionB, settings = {}) {
  const dA = normalize(directionA);
  const dB = normalize(directionB);
  if (!dA || !dB) return { accepted: false, reason: 'degenerate', code: 'zeroDirection', message: 'Candidate rejected because a direction vector is zero length.' };
  const angleDeg = angleBetweenDeg(dA, dB);
  const tolerance = settings.collinearToleranceDeg ?? 3;
  const maxTurn = settings.maxTurnAngleDeg ?? 150;
  if (!Number.isFinite(angleDeg)) return { accepted: false, reason: 'degenerate', code: 'invalidAngle', message: 'Candidate rejected because turn angle could not be computed.' };
  if (angleDeg <= tolerance) return { accepted: false, reason: 'collinear', code: 'collinear', message: 'Candidate rejected: straight collinear continuation.' };
  if (Math.abs(180 - angleDeg) <= tolerance || angleDeg > maxTurn) return { accepted: false, reason: 'straightContinuation', code: 'straightContinuation', message: `Candidate rejected: ${angleDeg.toFixed(1)}° is a straight or near-straight continuation, not a bend.` };
  return { accepted: true, angleDeg, angleRad: degToRad(angleDeg) };
}

function angleBetweenDeg(a, b) { return radToDeg(Math.acos(clamp(-dot(a, b), -1, 1))); }
function isPlainPipeSegment(segment) { const type = String(segment.componentType || segment.type || 'PIPE').toUpperCase(); return type === 'PIPE'; }
function isExistingComponentNode(kind) { return ['ELBOW', 'BEND', 'TEE', 'VALVE', 'FLANGE', 'SUPPORT', 'OLET', 'BRANCH', 'ATTA', 'ANCI'].includes(kind); }
function sameBranchOrLine(a, b) { if (a.branchId && b.branchId && a.branchId !== b.branchId) return false; if (a.lineNo && b.lineNo && a.lineNo !== b.lineNo) return false; return true; }
function buildNodeIncidenceMap(segments) { const map = new Map(); for (const segment of segments) { addNodeSegment(map, segment.fromNode, segment); addNodeSegment(map, segment.toNode, segment); } return map; }
function addNodeSegment(map, nodeId, segment) { if (!nodeId) return; if (!map.has(nodeId)) map.set(nodeId, []); map.get(nodeId).push(segment); }
function getSharedPoint(nodeId, a, b) { const pa = a.fromNode === nodeId ? a.from : a.toNode === nodeId ? a.to : null; const pb = b.fromNode === nodeId ? b.from : b.toNode === nodeId ? b.to : null; if (!pa || !pb) return null; return distance(pa, pb) > 1e-4 ? midpoint(pa, pb) : toVec3(pa); }
function getOtherPoint(nodeId, segment) { if (segment.fromNode === nodeId) return toVec3(segment.to); if (segment.toNode === nodeId) return toVec3(segment.from); return null; }
function normalizeNodeKindMap(value) { if (value instanceof Map) return value; return new Map(Object.entries(value || {})); }
function readPositiveNumber(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
function toVec3(value = {}) { if (!value && value !== 0) return null; if (Array.isArray(value)) return { x: Number(value[0]) || 0, y: Number(value[1]) || 0, z: Number(value[2]) || 0 }; return { x: Number(value.x) || 0, y: Number(value.y) || 0, z: Number(value.z) || 0 }; }
function sub(a, b) { const av = toVec3(a); const bv = toVec3(b); return { x: av.x - bv.x, y: av.y - bv.y, z: av.z - bv.z }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(a, k) { return { x: a.x * k, y: a.y * k, z: a.z * k }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function length(a) { return Math.sqrt(dot(a, a)); }
function normalize(a) { const len = length(a || {}); return len > EPS ? scale(a, 1 / len) : null; }
function distance(a, b) { return length(sub(a, b)); }
function midpoint(a, b) { return scale(add(toVec3(a), toVec3(b)), 0.5); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function radToDeg(rad) { return rad * 180 / Math.PI; }
function degToRad(deg) { return deg * Math.PI / 180; }
