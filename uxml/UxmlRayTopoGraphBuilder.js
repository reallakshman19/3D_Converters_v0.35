/**
 * UxmlRayTopoGraphBuilder.js
 *
 * Agent 06: UXML RayTopoGraph Builder.
 *
 * This is intentionally adapted from the PCFStudio_Basic_Legacy Stage 1C
 * ray-shooter concept:
 *
 * - run after topology/readiness
 * - use face-proximity pass first
 * - shoot parametric rays
 * - collect hits in a tolerance tube
 * - pick shortest valid hit
 * - treat branch faces separately
 *
 * Legacy mutates rows / injects bridge pipes.
 * UXML does NOT mutate. It returns evidence and candidate actions only.
 */

import {
  COMPONENT_TYPES,
  DIAGNOSTIC_SEVERITIES,
  RAY_DECISIONS,
} from './UxmlConstants.js';

import {
  createUxmlDiagnostic,
} from './UxmlTypes.js';

import {
  buildUxmlFaceModel,
} from './UxmlFaceModelBuilder.js';

const RAY_TOPO_GRAPH_SCHEMA = 'uxml-ray-topo-graph/v2';

const DEFAULT_CONFIG = Object.freeze({
  maxRayLengthMm: 500,
  tubeToleranceMm: 50,
  perpendicularToleranceMm: 12,
  connectToleranceMm: 6,
  pass0MaxGapMm: 6,
  allowMediumConfidenceRay: true,
  allowGlobalAxisFallback: true,
  allowPartialFaceModel: false,
  skipValidation: false,
});

const AXIS_FALLBACK_DIRECTIONS = Object.freeze([
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
]);

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeConfig(options = {}) {
  const perpendicularToleranceMm = clampNumber(
    options.perpendicularToleranceMm ?? options.rayMissToleranceMm,
    0,
    1000,
    DEFAULT_CONFIG.perpendicularToleranceMm
  );

  const tubeToleranceMm = clampNumber(
    options.tubeToleranceMm,
    0,
    5000,
    options.perpendicularToleranceMm == null
      ? DEFAULT_CONFIG.tubeToleranceMm
      : perpendicularToleranceMm
  );

  return {
    maxRayLengthMm: clampNumber(
      options.maxRayLengthMm ?? options.rayMaxLengthMm,
      1,
      50000,
      DEFAULT_CONFIG.maxRayLengthMm
    ),
    tubeToleranceMm,
    perpendicularToleranceMm,
    connectToleranceMm: clampNumber(
      options.connectToleranceMm,
      0,
      1000,
      DEFAULT_CONFIG.connectToleranceMm
    ),
    pass0MaxGapMm: clampNumber(
      options.pass0MaxGapMm,
      0,
      1000,
      DEFAULT_CONFIG.pass0MaxGapMm
    ),
    allowMediumConfidenceRay: options.allowMediumConfidenceRay !== false,
    allowGlobalAxisFallback: options.allowGlobalAxisFallback !== false,
    allowPartialFaceModel: options.allowPartialFaceModel === true,
    skipValidation: options.skipValidation === true,
  };
}

function isFinitePoint(point) {
  return (
    point &&
    Number.isFinite(Number(point.x)) &&
    Number.isFinite(Number(point.y)) &&
    Number.isFinite(Number(point.z))
  );
}

function clonePoint(point) {
  if (!isFinitePoint(point)) return null;

  return {
    x: Number(point.x),
    y: Number(point.y),
    z: Number(point.z),
  };
}

function vector(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return null;

  return {
    x: Number(b.x) - Number(a.x),
    y: Number(b.y) - Number(a.y),
    z: Number(b.z) - Number(a.z),
  };
}

function vectorLength(v) {
  if (!v) return 0;

  return Math.sqrt(
    Number(v.x || 0) * Number(v.x || 0) +
      Number(v.y || 0) * Number(v.y || 0) +
      Number(v.z || 0) * Number(v.z || 0)
  );
}

function normalizeVector(v) {
  const len = vectorLength(v);
  if (len < 1e-9) return null;

  return {
    x: Number(v.x || 0) / len,
    y: Number(v.y || 0) / len,
    z: Number(v.z || 0) / len,
  };
}

function reverseVector(v) {
  if (!v) return null;

  return {
    x: -Number(v.x || 0),
    y: -Number(v.y || 0),
    z: -Number(v.z || 0),
  };
}

function distance(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return Number.POSITIVE_INFINITY;

  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function dot(a, b) {
  return (
    Number(a.x || 0) * Number(b.x || 0) +
    Number(a.y || 0) * Number(b.y || 0) +
    Number(a.z || 0) * Number(b.z || 0)
  );
}

function pointFromRay(origin, direction, t) {
  return {
    x: Number(origin.x) + Number(direction.x) * t,
    y: Number(origin.y) + Number(direction.y) * t,
    z: Number(origin.z) + Number(direction.z) * t,
  };
}

function projectPointToRay(point, origin, direction) {
  if (!isFinitePoint(point) || !isFinitePoint(origin) || !direction) return null;

  const op = vector(origin, point);
  const distanceAlongRayMm = dot(op, direction);
  const projected = pointFromRay(origin, direction, distanceAlongRayMm);
  const perpendicularMissMm = distance(point, projected);

  return {
    distanceAlongRayMm,
    perpendicularMissMm,
    projected,
  };
}

function round3(value) {
  return Number(Number(value || 0).toFixed(3));
}

function makeDiagnosticFactory(out) {
  return function addDiagnostic({
    severity = DIAGNOSTIC_SEVERITIES.INFO,
    code,
    message,
    componentId = '',
    portId = '',
    details = {},
  }) {
    const diagnostic = createUxmlDiagnostic({
      id: `RTG-D-${String(out.diagnostics.length + 1).padStart(5, '0')}`,
      severity,
      code,
      message,
      componentId,
      portId,
      details,
    });

    out.diagnostics.push(diagnostic);
    return diagnostic;
  };
}

function isSupportFace(face) {
  return upper(face?.type) === COMPONENT_TYPES.SUPPORT ||
    upper(face?.faceKind) === 'SUPPORT_ASSOCIATION';
}

function isOletHeaderTap(face) {
  return upper(face?.role) === 'OLET_HEADER_TAP' ||
    upper(face?.faceKind) === 'OLET_HEADER_TAP';
}

function isBranchFace(face) {
  const role = upper(face?.role);
  return role === 'TEE_BRANCH' || role === 'OLET_BRANCH';
}

function isEndpointFace(face) {
  if (!face || !isFinitePoint(face.point)) return false;
  if (upper(face.connectsTo) !== 'ENDPOINT') return false;
  if (isSupportFace(face)) return false;
  if (isOletHeaderTap(face)) return false;
  return true;
}

function isPipeEndpointFace(face) {
  return upper(face?.type) === COMPONENT_TYPES.PIPE && face.futureMovable === true;
}

function isFittingEndpointFace(face) {
  return isEndpointFace(face) && !isPipeEndpointFace(face);
}

function isRequiredFace(face) {
  if (!isEndpointFace(face)) return false;

  const role = upper(face.role);

  if (role.includes('END_1') || role.includes('END_2')) return true;
  if (role === 'TEE_BRANCH') return true;
  if (role === 'OLET_BRANCH') return true;
  if (upper(face.type) === COMPONENT_TYPES.PIPE && role.startsWith('PIPE_END')) return true;

  return false;
}

function isGeneralEndpointTarget(face) {
  return isEndpointFace(face) && !isBranchFace(face);
}

function isBranchTarget(face) {
  return isEndpointFace(face) && isBranchFace(face);
}

function confidenceAllowed(component, config) {
  if (component.branchVectorConfidence === 'HIGH') return true;
  if (component.branchVectorConfidence === 'MEDIUM' && config.allowMediumConfidenceRay) return true;
  return false;
}

function facesSharePipeline(a, b) {
  if (!a?.pipelineRef || !b?.pipelineRef) return true;
  return a.pipelineRef === b.pipelineRef;
}

function sortById(items) {
  return [...items].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
}

function sortHits(hits) {
  return [...hits].sort((a, b) => {
    const d = Number(a.distanceAlongRayMm) - Number(b.distanceAlongRayMm);
    if (Math.abs(d) > 1e-9) return d;

    const m = Number(a.perpendicularMissMm) - Number(b.perpendicularMissMm);
    if (Math.abs(m) > 1e-9) return m;

    return String(a.targetFaceId).localeCompare(String(b.targetFaceId));
  });
}

function sourceDirectionForFace(component, face) {
  const role = upper(face.role);

  if (role.endsWith('END_1')) {
    return reverseVector(component.axisVector);
  }

  if (role.endsWith('END_2')) {
    return component.axisVector;
  }

  if (role === 'PIPE_END_1') {
    return reverseVector(component.axisVector);
  }

  if (role === 'PIPE_END_2') {
    return component.axisVector;
  }

  if (role === 'TEE_BRANCH' || role === 'OLET_BRANCH') {
    return component.branchVector;
  }

  return component.axisVector || component.branchVector || null;
}

function sourceMethodForFace(component, face) {
  const role = upper(face.role);

  if (role === 'TEE_BRANCH' || role === 'OLET_BRANCH') {
    return component.branchVectorMethod || 'BRANCH_VECTOR';
  }

  return component.axisVectorMethod || 'AXIS_VECTOR';
}

function sourceConfidenceForFace(component, face) {
  const role = upper(face.role);

  if (role === 'TEE_BRANCH' || role === 'OLET_BRANCH') {
    return component.branchVectorConfidence || 'NONE';
  }

  return component.axisVectorConfidence || 'NONE';
}

function resolveSourceDirections(component, face, config) {
  const primary = normalizeVector(sourceDirectionForFace(component, face));

  if (primary) {
    return [{
      direction: primary,
      method: sourceMethodForFace(component, face),
      confidence: sourceConfidenceForFace(component, face),
      fallback: false,
    }];
  }

  if (!config.allowGlobalAxisFallback) {
    return [];
  }

  return AXIS_FALLBACK_DIRECTIONS.map(direction => ({
    direction,
    method: 'GLOBAL_AXIS_FALLBACK',
    confidence: 'LOW',
    fallback: true,
  }));
}

function buildRayHit({
  out,
  pass,
  sourceComponent,
  sourceFace,
  targetFace,
  projection,
  rayDirectionInfo,
  config,
}) {
  const targetIsPipeEndpoint = isPipeEndpointFace(targetFace);
  const targetIsFittingEndpoint = isFittingEndpointFace(targetFace);

  const blockers = [];

  if (!targetIsPipeEndpoint) {
    blockers.push('TARGET_NOT_PIPE_ENDPOINT');
  }

  if (isBranchFace(sourceFace) && !confidenceAllowed(sourceComponent, config)) {
    blockers.push('RAY_CONFIDENCE_NOT_ALLOWED');
  }

  if (rayDirectionInfo.fallback) {
    blockers.push('GLOBAL_AXIS_FALLBACK_REQUIRES_REVIEW');
  }

  const safe = blockers.length === 0;

  return {
    id: `RTG-C-${String(out.rayCandidates.length + 1).padStart(5, '0')}`,
    pass,
    sourceComponentId: sourceComponent.componentId,
    sourceFaceId: sourceFace.id,
    sourceRole: sourceFace.role,
    targetComponentId: targetFace.componentId,
    targetFaceId: targetFace.id,
    targetRole: targetFace.role,
    pipelineRef: sourceFace.pipelineRef || targetFace.pipelineRef || '',
    origin: clonePoint(sourceFace.point),
    direction: rayDirectionInfo.direction,
    method: rayDirectionInfo.method,
    confidence: rayDirectionInfo.confidence,
    distanceAlongRayMm: round3(projection.distanceAlongRayMm),
    perpendicularMissMm: round3(projection.perpendicularMissMm),
    projectedPoint: clonePoint(projection.projected),
    targetPoint: clonePoint(targetFace.point),
    targetIsPipeEndpoint,
    targetIsFittingEndpoint,
    safe,
    blockers,
    decision: safe
      ? RAY_DECISIONS.PROMOTE_RAY_CANDIDATE
      : RAY_DECISIONS.MANUAL_REVIEW,
    recommendedAction: safe
      ? 'MOVE_PIPE_ENDPOINT_TO_SOURCE_FACE'
      : targetIsFittingEndpoint
        ? 'MANUAL_REVIEW_OR_BRIDGE_PIPE_CANDIDATE'
        : 'MANUAL_REVIEW',
  };
}

function collectRayHits({
  out,
  pass,
  sourceComponent,
  sourceFace,
  targetFaces,
  config,
  minT,
  maxT,
  maxMiss,
}) {
  const hits = [];
  const directions = resolveSourceDirections(sourceComponent, sourceFace, config);

  for (const rayDirectionInfo of directions) {
    for (const targetFace of targetFaces) {
      if (targetFace.id === sourceFace.id) continue;
      if (targetFace.componentId === sourceFace.componentId) continue;
      if (!facesSharePipeline(sourceFace, targetFace)) continue;

      const projection = projectPointToRay(
        targetFace.point,
        sourceFace.point,
        rayDirectionInfo.direction
      );

      if (!projection) continue;
      if (projection.distanceAlongRayMm <= minT) continue;
      if (projection.distanceAlongRayMm > maxT) continue;
      if (projection.perpendicularMissMm > maxMiss) continue;

      hits.push(buildRayHit({
        out,
        pass,
        sourceComponent,
        sourceFace,
        targetFace,
        projection,
        rayDirectionInfo,
        config,
      }));
    }
  }

  return sortHits(hits);
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const out = [];

  for (const candidate of sortHits(candidates)) {
    const key = `${candidate.pass}|${candidate.sourceFaceId}|${candidate.targetFaceId}|${candidate.method}`;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(candidate);
  }

  return out;
}

function disconnectedFaceIdsFromUniversalGraph(universalGraph) {
  const ids = new Set();

  for (const item of universalGraph?.disconnected || []) {
    const portId = clean(item.portId);
    if (!portId) continue;

    const faceId = portId.startsWith('UTG-P-')
      ? portId.slice('UTG-P-'.length)
      : '';

    if (faceId) ids.add(faceId);
  }

  return ids;
}

function selectSourceFaces(faceModel, options = {}) {
  const faces = sortById((faceModel.faces || []).filter(isRequiredFace));
  const disconnectedFaceIds = disconnectedFaceIdsFromUniversalGraph(options.universalGraph);

  if (disconnectedFaceIds.size > 0) {
    return faces.filter(face => disconnectedFaceIds.has(face.id));
  }

  return faces;
}

function componentForFace(faceModel, face) {
  return (faceModel.components || []).find(component => component.componentId === face.componentId) || null;
}

function runPass0FaceProximity(out, faceModel, config) {
  const sources = sortById((faceModel.faces || []).filter(face =>
    isEndpointFace(face) &&
    !isBranchFace(face) &&
    !isSupportFace(face)
  ));

  const targets = sortById((faceModel.faces || []).filter(face =>
    isEndpointFace(face) &&
    !isSupportFace(face)
  ));

  for (const sourceFace of sources) {
    const sourceComponent = componentForFace(faceModel, sourceFace);
    if (!sourceComponent) continue;

    const hits = collectRayHits({
      out,
      pass: 'P0-FACE-PROXIMITY',
      sourceComponent,
      sourceFace,
      targetFaces: targets,
      config,
      minT: 0.001,
      maxT: config.pass0MaxGapMm,
      maxMiss: config.tubeToleranceMm,
    });

    const best = hits[0];

    if (best) {
      out.faceSnapCandidates.push({
        ...best,
        id: `RTG-SNAP-${String(out.faceSnapCandidates.length + 1).padStart(5, '0')}`,
        decision: RAY_DECISIONS.PROMOTE_RAY_CANDIDATE,
        recommendedAction: 'SNAP_FACE_PROXIMITY_CANDIDATE_NO_MUTATION',
      });
    }
  }
}

function runGeneralEndpointPass(out, faceModel, config, options = {}) {
  const sourceFaces = selectSourceFaces(faceModel, options).filter(face =>
    isEndpointFace(face) &&
    !isBranchFace(face) &&
    !isSupportFace(face)
  );

  const targetFaces = sortById((faceModel.faces || []).filter(isGeneralEndpointTarget));

  for (const sourceFace of sourceFaces) {
    const sourceComponent = componentForFace(faceModel, sourceFace);
    if (!sourceComponent) continue;

    const hits = collectRayHits({
      out,
      pass: 'P1-GENERAL-ENDPOINT',
      sourceComponent,
      sourceFace,
      targetFaces,
      config,
      minT: config.connectToleranceMm,
      maxT: config.maxRayLengthMm,
      maxMiss: config.tubeToleranceMm,
    });

    out.rayCandidates.push(...hits);
  }
}

function runBranchTargetPass(out, faceModel, config, options = {}) {
  const sourceFaces = selectSourceFaces(faceModel, options).filter(face =>
    isEndpointFace(face) &&
    !isBranchFace(face) &&
    !isSupportFace(face)
  );

  const branchTargets = sortById((faceModel.faces || []).filter(isBranchTarget));

  for (const sourceFace of sourceFaces) {
    const sourceComponent = componentForFace(faceModel, sourceFace);
    if (!sourceComponent) continue;

    const hits = collectRayHits({
      out,
      pass: 'P2-BRANCH-TARGET',
      sourceComponent,
      sourceFace,
      targetFaces: branchTargets,
      config,
      minT: config.connectToleranceMm,
      maxT: config.maxRayLengthMm,
      maxMiss: config.tubeToleranceMm,
    });

    out.rayCandidates.push(...hits);
  }
}

function runBranchSourcePass(out, faceModel, config, options = {}) {
  const sourceFaces = selectSourceFaces(faceModel, options).filter(face =>
    isEndpointFace(face) &&
    isBranchFace(face) &&
    !isSupportFace(face)
  );

  const targets = sortById((faceModel.faces || []).filter(isGeneralEndpointTarget));

  for (const sourceFace of sourceFaces) {
    const sourceComponent = componentForFace(faceModel, sourceFace);
    if (!sourceComponent) continue;

    out.branchRaySources.push({
      id: `RTG-S-${String(out.branchRaySources.length + 1).padStart(5, '0')}`,
      componentId: sourceComponent.componentId,
      faceId: sourceFace.id,
      role: sourceFace.role,
      pipelineRef: sourceFace.pipelineRef || '',
      origin: clonePoint(sourceFace.point),
      direction: sourceComponent.branchVector,
      method: sourceComponent.branchVectorMethod,
      confidence: sourceComponent.branchVectorConfidence,
    });

    const hits = collectRayHits({
      out,
      pass: 'P2-BRANCH-SOURCE',
      sourceComponent,
      sourceFace,
      targetFaces: targets,
      config,
      minT: config.connectToleranceMm,
      maxT: config.maxRayLengthMm,
      maxMiss: config.tubeToleranceMm,
    });

    if (!hits.length) {
      out.orphans.push({
        id: `RTG-O-${String(out.orphans.length + 1).padStart(5, '0')}`,
        sourceFaceId: sourceFace.id,
        sourceComponentId: sourceComponent.componentId,
        reason: sourceComponent.branchVector
          ? 'NO_RAY_HIT'
          : 'RAY_ORIGIN_OR_DIRECTION_MISSING',
      });
    }

    out.rayCandidates.push(...hits);
  }
}

function selectBestRayConnections(out) {
  const bySource = new Map();

  for (const candidate of sortHits(out.rayCandidates)) {
    if (!bySource.has(candidate.sourceFaceId)) {
      bySource.set(candidate.sourceFaceId, []);
    }

    bySource.get(candidate.sourceFaceId).push(candidate);
  }

  for (const [sourceFaceId, candidates] of bySource.entries()) {
    const safeCandidates = candidates.filter(candidate => candidate.safe);

    if (!safeCandidates.length) {
      out.orphans.push({
        id: `RTG-O-${String(out.orphans.length + 1).padStart(5, '0')}`,
        sourceFaceId,
        reason: 'NO_SAFE_RAY_CANDIDATE',
        candidateCount: candidates.length,
      });
      continue;
    }

    const first = safeCandidates[0];
    const second = safeCandidates[1];

    if (
      second &&
      Math.abs(first.distanceAlongRayMm - second.distanceAlongRayMm) <= 1 &&
      Math.abs(first.perpendicularMissMm - second.perpendicularMissMm) <= 1
    ) {
      out.ambiguousHits.push({
        id: `RTG-A-${String(out.ambiguousHits.length + 1).padStart(5, '0')}`,
        sourceFaceId,
        candidateIds: safeCandidates.slice(0, 2).map(candidate => candidate.id),
        reason: 'AMBIGUOUS_EQUAL_RAY_HITS',
      });
      continue;
    }

    const connection = {
      id: `RTG-RC-${String(out.rayConnections.length + 1).padStart(5, '0')}`,
      ...first,
      decision: RAY_DECISIONS.PROMOTE_RAY_CANDIDATE,
    };

    out.rayConnections.push(connection);

    if (isBranchFace({ role: connection.sourceRole }) || isBranchFace({ role: connection.targetRole })) {
      out.branchConnections.push(connection);
    }
  }
}

function makeSummary(out) {
  return {
    componentCount: out.faceModel?.components?.length || 0,
    faceCount: out.faceModel?.faces?.length || 0,
    faceSnapCandidateCount: out.faceSnapCandidates.length,
    branchRaySourceCount: out.branchRaySources.length,
    rayCandidateCount: out.rayCandidates.length,
    rayConnectionCount: out.rayConnections.length,
    branchConnectionCount: out.branchConnections.length,
    safeCandidateCount: out.rayCandidates.filter(candidate => candidate.safe).length,
    blockedCandidateCount: out.rayCandidates.filter(candidate => !candidate.safe).length,
    orphanCount: out.orphans.length,
    ambiguousHitCount: out.ambiguousHits.length,
    rejectedHitCount: out.rejectedHits.length,
    highConfidenceRayCount: out.rayCandidates.filter(candidate => candidate.confidence === 'HIGH').length,
    mediumConfidenceRayCount: out.rayCandidates.filter(candidate => candidate.confidence === 'MEDIUM').length,
    fallbackRayCandidateCount: out.rayCandidates.filter(candidate => candidate.method === 'GLOBAL_AXIS_FALLBACK').length,
    diagnosticCount: out.diagnostics.length,
    maxRayLengthMm: out.config.maxRayLengthMm,
    tubeToleranceMm: out.config.tubeToleranceMm,
    pass0MaxGapMm: out.config.pass0MaxGapMm,
  };
}

export function buildUxmlRayTopoGraph(uxml, options = {}) {
  const config = normalizeConfig(options);

  const out = {
    schema: RAY_TOPO_GRAPH_SCHEMA,
    ok: true,
    blocked: false,
    config,
    faceModel: null,

    faceSnapCandidates: [],
    branchRaySources: [],
    rayCandidates: [],
    rayConnections: [],
    rayOnlyConnections: [],
    bridgePipeCandidates: [],
    branchConnections: [],
    oletPassthroughCandidates: [],
    orphans: [],
    ambiguousHits: [],
    rejectedHits: [],
    diagnostics: [],
    summary: {},
  };

  const add = makeDiagnosticFactory(out);

  if (!uxml && !options.faceModel) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.FATAL,
      code: 'UXML-RTG-NO-INPUT',
      message: 'Cannot build RayTopoGraph because neither UXML nor faceModel was provided.',
    });

    out.ok = false;
    out.blocked = true;
    out.summary = makeSummary(out);
    return out;
  }

  const faceModel = options.faceModel || buildUxmlFaceModel(uxml, {
    allowPartial: config.allowPartialFaceModel,
    skipValidation: config.skipValidation,
  });

  out.faceModel = faceModel;

  if (faceModel.ok !== true && options.allowBlockedFaceModel !== true) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.ERROR,
      code: 'UXML-RTG-FACE-MODEL-BLOCKED',
      message: 'Cannot build RayTopoGraph because face model is blocked.',
      details: {
        faceModelBlocked: faceModel.blocked,
        diagnosticCount: faceModel.diagnostics?.length || 0,
      },
    });

    out.ok = false;
    out.blocked = true;
    out.summary = makeSummary(out);
    return out;
  }

  runPass0FaceProximity(out, faceModel, config);
  runGeneralEndpointPass(out, faceModel, config, options);
  runBranchTargetPass(out, faceModel, config, options);
  runBranchSourcePass(out, faceModel, config, options);

  out.rayCandidates = uniqueCandidates(out.rayCandidates);
  selectBestRayConnections(out);

  out.summary = makeSummary(out);
  return out;
}

export const createUxmlRayTopoGraph = buildUxmlRayTopoGraph;