import { parsePcfText } from '../js/pcf2glb/pcf/parsePcfText.js';
import { normalizePcfModel } from '../js/pcf2glb/pcf/normalizePcfModel.js';

/**
 * RvmPcfContinuityChecker.js
 *
 * Full topology continuity checker + pipe-only auto fix.
 *
 * Fixes:
 * 1. TEE continuity:
 *    - checks ep1, ep2 and branch port.
 *    - branch may connect at bp or cp depending source/export style.
 *
 * 2. OLET continuity:
 *    - cp/header tap must land on a pipe/segment.
 *    - bp/branch end must connect to a branch pipe endpoint.
 *
 * 3. Auto Fix 25mm:
 *    - configurable up to 100mm.
 *    - fills pipe-to-fitting / pipe-to-pipe endpoint gaps.
 *    - trims clashes/overlaps only by modifying PIPE endpoints.
 *    - fittings are never moved or trimmed.
 */

const DEFAULT_TOLERANCE_MM = 6;
const DEFAULT_PIPE_FIX_MM = 25;
const MAX_PIPE_FIX_MM = 100;

const NON_TOPO_TYPES = new Set([
  'SUPPORT',
  'MESSAGE-SQUARE',
  'MESSAGE-CIRCLE',
  'ANNOTATION',
  'TEXT',
]);

const PIPE_TYPES = new Set(['PIPE', 'TUBI']);

const FITTING_TYPES = new Set([
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
  'REDUCER',
  'REDU',
  'REDUCER-CONCENTRIC',
  'REDUCER-ECCENTRIC',
  'COUPLING',
  'CAP',
]);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round3(value) {
  return Number(Number(value || 0).toFixed(3));
}

function isFinitePoint(point) {
  if (!point || typeof point !== 'object') return false;

  return (
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
    ...(Number.isFinite(Number(point.bore)) ? { bore: Number(point.bore) } : {}),
  };
}

function samePoint(a, b, toleranceMm = 1e-6) {
  const d = distance(a, b);
  return d != null && d <= toleranceMm;
}

function cloneComponent(component) {
  const clone = { ...component };

  clone.attributes =
    component && component.attributes && typeof component.attributes === 'object'
      ? JSON.parse(JSON.stringify(component.attributes))
      : {};

  for (const key of ['ep1', 'ep2', 'cp', 'bp', 'coOrds', 'supportCoor', 'circleCoord']) {
    if (component && component[key]) {
      clone[key] = clonePoint(component[key]) || null;
    }
  }

  if (Array.isArray(component?.points)) {
    clone.points = component.points.map(point => clonePoint(point) || point);
  }

  return clone;
}

function cloneItems(items) {
  return (Array.isArray(items) ? items : []).map(item => cloneComponent(item));
}

function componentType(component) {
  return upper(component?.type || component?.kind || component?.attributes?.TYPE || component?.attributes?.['COMPONENT-TYPE']);
}

function isPipe(componentOrType) {
  const type = typeof componentOrType === 'string' ? upper(componentOrType) : componentType(componentOrType);
  return PIPE_TYPES.has(type);
}

function isIgnored(componentOrType) {
  const type = typeof componentOrType === 'string' ? upper(componentOrType) : componentType(componentOrType);
  return !type || NON_TOPO_TYPES.has(type) || type.startsWith('MESSAGE-');
}

function componentId(component, fallbackIndex) {
  return (
    clean(
      component?.sourceCanonicalId ||
        component?.id ||
        component?.rowNo ||
        component?.name ||
        component?.attributes?.['COMPONENT-ATTRIBUTE97'] ||
        component?.attributes?.['PIPELINE-REFERENCE'] ||
        fallbackIndex
    ) || String(fallbackIndex)
  );
}

function pipelineRef(component, fallback = 'RVM-EXTRACT') {
  return (
    clean(
      component?.pipelineRef ||
        component?.attributes?.['PIPELINE-REFERENCE'] ||
        component?.attributes?.PIPELINE_REFERENCE ||
        component?.attributes?.PIPELINE ||
        fallback
    ) || 'RVM-EXTRACT'
  );
}

function distance(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return null;

  const dx = Number(b.x) - Number(a.x);
  const dy = Number(b.y) - Number(a.y);
  const dz = Number(b.z) - Number(a.z);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function delta(fromPoint, toPoint) {
  if (!isFinitePoint(fromPoint) || !isFinitePoint(toPoint)) return null;

  return {
    x: Number(toPoint.x) - Number(fromPoint.x),
    y: Number(toPoint.y) - Number(fromPoint.y),
    z: Number(toPoint.z) - Number(fromPoint.z),
  };
}

function vectorLength(v) {
  if (!v) return null;
  const x = Number(v.x || 0);
  const y = Number(v.y || 0);
  const z = Number(v.z || 0);
  return Math.sqrt(x * x + y * y + z * z);
}

function projectPointToSegment(point, a, b) {
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
      point: clonePoint(a),
      distanceMm: distance(point, a),
      alongMm: 0,
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
    alongMm: Math.sqrt(lenSq) * t,
    segmentLengthMm: Math.sqrt(lenSq),
  };
}

function pointOnSegment(point, a, b, toleranceMm) {
  const projection = projectPointToSegment(point, a, b);
  if (!projection) return null;

  if (projection.distanceMm <= toleranceMm && projection.tRaw >= -0.001 && projection.tRaw <= 1.001) {
    return projection;
  }

  return null;
}

function setComponentPoint(component, pointKey, point) {
  if (!component || !isFinitePoint(point)) return false;

  component[pointKey] = {
    ...(component[pointKey] && typeof component[pointKey] === 'object' ? component[pointKey] : {}),
    x: Number(point.x),
    y: Number(point.y),
    z: Number(point.z),
  };

  return true;
}

function getPipeSegment(component) {
  if (!isPipe(component)) return null;
  if (!isFinitePoint(component.ep1) || !isFinitePoint(component.ep2)) return null;

  return {
    ep1: clonePoint(component.ep1),
    ep2: clonePoint(component.ep2),
  };
}

function normalizedOptions(rawOptions = {}) {
  const source = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};

  const toleranceMm = Number.isFinite(Number(source.continuityMismatchToleranceMm ?? source.mismatchToleranceMm))
    ? Number(source.continuityMismatchToleranceMm ?? source.mismatchToleranceMm)
    : DEFAULT_TOLERANCE_MM;

  const pipeFixMm = clamp(
    source.pipeGapClashFixToleranceMm ??
      source.autoFix25ToleranceMm ??
      source.largeGapFixToleranceMm ??
      DEFAULT_PIPE_FIX_MM,
    0,
    MAX_PIPE_FIX_MM
  );

  return {
    continuityMismatchToleranceMm: toleranceMm,
    pipeGapClashFixToleranceMm: pipeFixMm,
    continuityAutoAdjustEnabled: source.continuityAutoAdjustEnabled !== false,
    trimClashesEnabled: source.trimClashesEnabled !== false,
    fillGapsEnabled: source.fillGapsEnabled !== false,
  };
}

function makePort(component, componentIndex, key, role, point, extra = {}) {
  if (!isFinitePoint(point)) return null;

  const type = componentType(component);

  return {
    id: `${componentIndex}:${key}:${role}`,
    componentIndex,
    componentId: componentId(component, componentIndex),
    pipelineRef: pipelineRef(component),
    component,
    type,
    pointKey: key,
    role,
    point: clonePoint(point),
    isPipe: isPipe(type),
    isFitting: FITTING_TYPES.has(type) && !isPipe(type),
    canMovePoint: isPipe(type) && (key === 'ep1' || key === 'ep2'),
    allowSegmentConnection: !!extra.allowSegmentConnection,
    alternatePoints: Array.isArray(extra.alternatePoints)
      ? extra.alternatePoints.filter(isFinitePoint).map(clonePoint)
      : [],
    required: extra.required !== false,
    terminalAllowed: !!extra.terminalAllowed,
  };
}

function buildPorts(components) {
  const ports = [];

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];

    if (!component || component.include === false) continue;

    const type = componentType(component);
    if (isIgnored(type)) continue;

    const ep1 = clonePoint(component.ep1);
    const ep2 = clonePoint(component.ep2);
    const cp = clonePoint(component.cp);
    const bp = clonePoint(component.bp);
    const coOrds = clonePoint(component.coOrds);

    if (isPipe(type)) {
      const p1 = makePort(component, index, 'ep1', 'PIPE_END_1', ep1, {
        terminalAllowed: true,
      });

      const p2 = makePort(component, index, 'ep2', 'PIPE_END_2', ep2, {
        terminalAllowed: true,
      });

      if (p1) ports.push(p1);
      if (p2) ports.push(p2);
      continue;
    }

    if (type === 'TEE') {
      const main1 = makePort(component, index, 'ep1', 'TEE_MAIN_1', ep1);
      const main2 = makePort(component, index, 'ep2', 'TEE_MAIN_2', ep2);

      const branchPoint = bp || cp || coOrds;
      const branch = makePort(component, index, bp ? 'bp' : cp ? 'cp' : 'coOrds', 'TEE_BRANCH', branchPoint, {
        alternatePoints: [bp, cp, coOrds].filter(Boolean),
      });

      if (main1) ports.push(main1);
      if (main2) ports.push(main2);
      if (branch) ports.push(branch);
      continue;
    }

    if (type === 'OLET' || type === 'WELDOLET' || type === 'SOCKOLET') {
      const headerTap = makePort(component, index, cp ? 'cp' : 'ep1', 'OLET_HEADER_TAP', cp || ep1 || coOrds, {
        allowSegmentConnection: true,
      });

      const branch = makePort(component, index, bp ? 'bp' : 'ep2', 'OLET_BRANCH', bp || ep2 || coOrds);

      if (headerTap) ports.push(headerTap);
      if (branch) ports.push(branch);
      continue;
    }

    const p1 = makePort(component, index, 'ep1', `${type}_END_1`, ep1);
    const p2 = makePort(component, index, 'ep2', `${type}_END_2`, ep2);

    if (p1) ports.push(p1);
    if (p2) ports.push(p2);
  }

  return ports;
}

function buildPipeSegments(components) {
  const segments = [];

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    if (!component || component.include === false) continue;
    if (!isPipe(component)) continue;

    const segment = getPipeSegment(component);
    if (!segment) continue;

    segments.push({
      componentIndex: index,
      componentId: componentId(component, index),
      pipelineRef: pipelineRef(component),
      component,
      ep1: segment.ep1,
      ep2: segment.ep2,
    });
  }

  return segments;
}

function findDirectConnection(port, ports, toleranceMm) {
  const probePoints = [port.point, ...port.alternatePoints].filter(isFinitePoint);

  let best = null;

  for (const other of ports) {
    if (other.id === port.id) continue;
    if (other.componentIndex === port.componentIndex) continue;
    if (other.pipelineRef !== port.pipelineRef) continue;

    const otherPoints = [other.point, ...other.alternatePoints].filter(isFinitePoint);

    for (const a of probePoints) {
      for (const b of otherPoints) {
        const d = distance(a, b);
        if (d == null) continue;

        if (!best || d < best.distanceMm) {
          best = {
            type: 'PORT',
            distanceMm: d,
            port,
            other,
            point: clonePoint(b),
          };
        }
      }
    }
  }

  return best && best.distanceMm <= toleranceMm ? best : null;
}

function findSegmentConnection(port, segments, toleranceMm) {
  if (!port.allowSegmentConnection) return null;

  let best = null;

  for (const segment of segments) {
    if (segment.componentIndex === port.componentIndex) continue;
    if (segment.pipelineRef !== port.pipelineRef) continue;

    const projection = pointOnSegment(port.point, segment.ep1, segment.ep2, toleranceMm);
    if (!projection) continue;

    if (!best || projection.distanceMm < best.distanceMm) {
      best = {
        type: 'SEGMENT',
        distanceMm: projection.distanceMm,
        port,
        segment,
        projection,
      };
    }
  }

  return best;
}

function nearestDirectCandidate(port, ports) {
  const probePoints = [port.point, ...port.alternatePoints].filter(isFinitePoint);
  let best = null;

  for (const other of ports) {
    if (other.id === port.id) continue;
    if (other.componentIndex === port.componentIndex) continue;
    if (other.pipelineRef !== port.pipelineRef) continue;

    const otherPoints = [other.point, ...other.alternatePoints].filter(isFinitePoint);

    for (const a of probePoints) {
      for (const b of otherPoints) {
        const d = distance(a, b);
        if (d == null) continue;

        if (!best || d < best.distanceMm) {
          best = {
            type: 'PORT',
            distanceMm: d,
            port,
            other,
            point: clonePoint(b),
          };
        }
      }
    }
  }

  return best;
}

function nearestSegmentCandidate(port, segments) {
  if (!port.allowSegmentConnection) return null;

  let best = null;

  for (const segment of segments) {
    if (segment.componentIndex === port.componentIndex) continue;
    if (segment.pipelineRef !== port.pipelineRef) continue;

    const projection = projectPointToSegment(port.point, segment.ep1, segment.ep2);
    if (!projection) continue;

    if (projection.tRaw < -0.001 || projection.tRaw > 1.001) continue;

    if (!best || projection.distanceMm < best.distanceMm) {
      best = {
        type: 'SEGMENT',
        distanceMm: projection.distanceMm,
        port,
        segment,
        projection,
      };
    }
  }

  return best;
}

function analyzeTopology(components, options) {
  const toleranceMm = Number(options.continuityMismatchToleranceMm);
  const ports = buildPorts(components);
  const segments = buildPipeSegments(components);

  const connections = [];
  const issues = [];
  const terminals = [];

  for (const port of ports) {
    const direct = findDirectConnection(port, ports, toleranceMm);
    const segment = direct ? null : findSegmentConnection(port, segments, toleranceMm);
    const connection = direct || segment;

    if (connection) {
      connections.push({
        portId: port.id,
        componentIndex: port.componentIndex,
        componentId: port.componentId,
        type: port.type,
        role: port.role,
        connectionType: connection.type,
        distanceMm: round3(connection.distanceMm),
        otherComponentIndex: connection.other?.componentIndex ?? connection.segment?.componentIndex ?? null,
        otherComponentId: connection.other?.componentId ?? connection.segment?.componentId ?? null,
        otherType: connection.other?.type ?? 'PIPE-SEGMENT',
        projectionT: connection.projection ? round3(connection.projection.t) : null,
      });
      continue;
    }

    const nearestDirect = nearestDirectCandidate(port, ports);
    const nearestSegment = nearestSegmentCandidate(port, segments);
    const candidates = [nearestDirect, nearestSegment].filter(Boolean);
    const nearest = candidates.sort((a, b) => a.distanceMm - b.distanceMm)[0] || null;

    if (port.isPipe && port.terminalAllowed && !nearest) {
      terminals.push({
        portId: port.id,
        componentIndex: port.componentIndex,
        componentId: port.componentId,
        role: port.role,
        point: port.point,
        reason: 'PIPE_TERMINAL',
      });
      continue;
    }

    if (port.isPipe && port.terminalAllowed && nearest && nearest.distanceMm > options.pipeGapClashFixToleranceMm) {
      terminals.push({
        portId: port.id,
        componentIndex: port.componentIndex,
        componentId: port.componentId,
        role: port.role,
        point: port.point,
        nearestDistanceMm: round3(nearest.distanceMm),
        reason: 'PIPE_TERMINAL_FAR_FROM_NETWORK',
      });
      continue;
    }

    issues.push({
      severity: port.isPipe ? 'WARNING' : 'ERROR',
      code:
        port.role === 'OLET_HEADER_TAP'
          ? 'OLET-HEADER-TAP-DISCONNECTED'
          : port.role === 'OLET_BRANCH'
            ? 'OLET-BRANCH-DISCONNECTED'
            : port.role === 'TEE_BRANCH'
              ? 'TEE-BRANCH-DISCONNECTED'
              : 'PORT-DISCONNECTED',
      pipelineRef: port.pipelineRef,
      componentIndex: port.componentIndex,
      componentId: port.componentId,
      type: port.type,
      role: port.role,
      pointKey: port.pointKey,
      point: port.point,
      nearestDistanceMm: nearest ? round3(nearest.distanceMm) : null,
      nearestType: nearest?.other?.type ?? nearest?.segment ? 'PIPE-SEGMENT' : null,
      fixableByPipeOnly: nearest ? nearest.distanceMm <= options.pipeGapClashFixToleranceMm : false,
      message: `${port.type} ${port.role} is not connected within ${toleranceMm}mm.`,
    });
  }

  const teeIssues = issues.filter(issue => issue.code.startsWith('TEE-'));
  const oletIssues = issues.filter(issue => issue.code.startsWith('OLET-'));

  return {
    ports,
    segments,
    connections,
    issues,
    terminals,
    teeIssues,
    oletIssues,
  };
}

function isPipeEndpointPort(port) {
  return port && port.isPipe && (port.pointKey === 'ep1' || port.pointKey === 'ep2');
}

function isFittingPort(port) {
  return port && !port.isPipe && port.isFitting;
}

function canSnapPipeToPort(pipePort, targetPort) {
  if (!isPipeEndpointPort(pipePort)) return false;
  if (!targetPort) return false;
  if (targetPort.componentIndex === pipePort.componentIndex) return false;

  // Do not trim/snap header pipe endpoint into an OLET header tap.
  // OLET header tap is connected by point-on-segment, not by cutting the header pipe.
  if (targetPort.role === 'OLET_HEADER_TAP') return false;

  return true;
}

function pipeLengthAfterEndpointMove(component, pointKey, newPoint) {
  if (!isPipe(component)) return null;

  const ep1 = pointKey === 'ep1' ? newPoint : component.ep1;
  const ep2 = pointKey === 'ep2' ? newPoint : component.ep2;

  return distance(ep1, ep2);
}

function trySnapPipeEndpoint(pipePort, targetPoint, reason, fixes, options) {
  if (!isPipeEndpointPort(pipePort)) return false;
  if (!isFinitePoint(targetPoint)) return false;

  const d = distance(pipePort.point, targetPoint);
  if (d == null || d > options.pipeGapClashFixToleranceMm) return false;

  const nextLength = pipeLengthAfterEndpointMove(pipePort.component, pipePort.pointKey, targetPoint);
  if (nextLength == null || nextLength < 1e-3) return false;

  const before = clonePoint(pipePort.point);
  setComponentPoint(pipePort.component, pipePort.pointKey, targetPoint);
  pipePort.point = clonePoint(targetPoint);

  fixes.push({
    action: reason,
    componentIndex: pipePort.componentIndex,
    componentId: pipePort.componentId,
    type: pipePort.type,
    pointKey: pipePort.pointKey,
    before,
    after: clonePoint(targetPoint),
    movementMm: round3(d),
    pipelineRef: pipePort.pipelineRef,
  });

  return true;
}

function fillEndpointGapsPipeOnly(components, options) {
  const fixes = [];
  const ports = buildPorts(components);

  const pipePorts = ports.filter(isPipeEndpointPort);
  const fittingPorts = ports.filter(isFittingPort);

  // Pipe endpoint to fitting port
  for (const fittingPort of fittingPorts) {
    if (fittingPort.role === 'OLET_HEADER_TAP') continue;

    let best = null;

    for (const pipePort of pipePorts) {
      if (!canSnapPipeToPort(pipePort, fittingPort)) continue;
      if (pipePort.pipelineRef !== fittingPort.pipelineRef) continue;

      const probePoints = [fittingPort.point, ...fittingPort.alternatePoints].filter(isFinitePoint);

      for (const targetPoint of probePoints) {
        const d = distance(pipePort.point, targetPoint);
        if (d == null) continue;

        if (d <= options.continuityMismatchToleranceMm) continue;

        if (!best || d < best.distanceMm) {
          best = {
            pipePort,
            targetPoint,
            distanceMm: d,
          };
        }
      }
    }

    if (best && best.distanceMm <= options.pipeGapClashFixToleranceMm) {
      trySnapPipeEndpoint(best.pipePort, best.targetPoint, 'PIPE_GAP_FILL_TO_FITTING', fixes, options);
    }
  }

  // Pipe endpoint to pipe endpoint
  const refreshedPorts = buildPorts(components).filter(isPipeEndpointPort);

  for (let i = 0; i < refreshedPorts.length; i += 1) {
    const a = refreshedPorts[i];

    let best = null;

    for (let j = i + 1; j < refreshedPorts.length; j += 1) {
      const b = refreshedPorts[j];
      if (a.componentIndex === b.componentIndex) continue;
      if (a.pipelineRef !== b.pipelineRef) continue;

      const d = distance(a.point, b.point);
      if (d == null) continue;
      if (d <= options.continuityMismatchToleranceMm) continue;

      if (!best || d < best.distanceMm) {
        best = { a, b, distanceMm: d };
      }
    }

    if (best && best.distanceMm <= options.pipeGapClashFixToleranceMm) {
      // Prefer to move second pipe endpoint to first. Both are pipe endpoints, no fittings moved.
      trySnapPipeEndpoint(best.b, best.a.point, 'PIPE_GAP_FILL_TO_PIPE', fixes, options);
    }
  }

  return fixes;
}

function trimPipeClashesOnly(components, options) {
  const fixes = [];
  const ports = buildPorts(components);
  const fittingPorts = ports.filter(port => isFittingPort(port) && port.role !== 'OLET_HEADER_TAP');

  const pipeSegments = buildPipeSegments(components);

  for (const segment of pipeSegments) {
    const pipe = segment.component;

    for (const fittingPort of fittingPorts) {
      if (segment.componentIndex === fittingPort.componentIndex) continue;
      if (segment.pipelineRef !== fittingPort.pipelineRef) continue;

      const probePoints = [fittingPort.point, ...fittingPort.alternatePoints].filter(isFinitePoint);

      for (const targetPoint of probePoints) {
        const projection = pointOnSegment(targetPoint, segment.ep1, segment.ep2, options.continuityMismatchToleranceMm);
        if (!projection) continue;

        const dToEp1 = distance(targetPoint, pipe.ep1);
        const dToEp2 = distance(targetPoint, pipe.ep2);

        const nearestKey = dToEp1 <= dToEp2 ? 'ep1' : 'ep2';
        const nearestDistance = Math.min(dToEp1, dToEp2);

        if (nearestDistance <= options.continuityMismatchToleranceMm) continue;
        if (nearestDistance > options.pipeGapClashFixToleranceMm) continue;

        const nextLength = pipeLengthAfterEndpointMove(pipe, nearestKey, targetPoint);
        if (nextLength == null || nextLength < 1e-3) continue;

        const before = clonePoint(pipe[nearestKey]);
        setComponentPoint(pipe, nearestKey, targetPoint);

        fixes.push({
          action: 'PIPE_CLASH_TRIM_TO_FITTING',
          componentIndex: segment.componentIndex,
          componentId: segment.componentId,
          type: 'PIPE',
          pointKey: nearestKey,
          before,
          after: clonePoint(targetPoint),
          movementMm: round3(nearestDistance),
          fittingComponentIndex: fittingPort.componentIndex,
          fittingComponentId: fittingPort.componentId,
          fittingType: fittingPort.type,
          fittingRole: fittingPort.role,
          pipelineRef: segment.pipelineRef,
        });

        // Refresh current segment endpoints after trim
        segment.ep1 = clonePoint(pipe.ep1);
        segment.ep2 = clonePoint(pipe.ep2);
      }
    }
  }

  return fixes;
}

function reportFromTopology(topology, options, extra = {}) {
  const fatalIssues = topology.issues.filter(issue => issue.severity === 'ERROR');
  const warningIssues = topology.issues.filter(issue => issue.severity !== 'ERROR');

  const maxIssueDistance = topology.issues.reduce((max, issue) => {
    const d = Number(issue.nearestDistanceMm);
    return Number.isFinite(d) ? Math.max(max, d) : max;
  }, 0);

  return {
    ok: fatalIssues.length === 0,
    toleranceMm: Number(options.continuityMismatchToleranceMm),
    pipeGapClashFixToleranceMm: Number(options.pipeGapClashFixToleranceMm),
    maxDeviationMm: round3(maxIssueDistance),
    fatalCount: fatalIssues.length,
    warningCount: warningIssues.length,
    fixableCount: topology.issues.filter(issue => issue.fixableByPipeOnly).length,
    portCount: topology.ports.length,
    connectionCount: topology.connections.length,
    terminalCount: topology.terminals.length,
    teeIssueCount: topology.teeIssues.length,
    oletIssueCount: topology.oletIssues.length,
    issues: topology.issues,
    mismatches: topology.issues,
    unresolved: fatalIssues,
    warnings: warningIssues,
    connections: topology.connections,
    terminals: topology.terminals,
    teeIssues: topology.teeIssues,
    oletIssues: topology.oletIssues,
    adjustments: extra.adjustments || [],
    pipeGapFills: extra.pipeGapFills || [],
    pipeClashTrims: extra.pipeClashTrims || [],
    pipeOnlyFixApplied: !!extra.pipeOnlyFixApplied,
  };
}

export function analyzeContinuityComponents(components, rawOptions) {
  const options = normalizedOptions(rawOptions);
  const safeComponents = Array.isArray(components) ? components : [];
  const topology = analyzeTopology(safeComponents, options);

  return reportFromTopology(topology, options);
}

export function applyPipeOnlyGapClashFixComponents(components, rawOptions) {
  const options = normalizedOptions(rawOptions);
  const clonedComponents = cloneItems(Array.isArray(components) ? components : []);

  const pipeGapFills = options.fillGapsEnabled
    ? fillEndpointGapsPipeOnly(clonedComponents, options)
    : [];

  const pipeClashTrims = options.trimClashesEnabled
    ? trimPipeClashesOnly(clonedComponents, options)
    : [];

  const topology = analyzeTopology(clonedComponents, options);

  return {
    components: clonedComponents,
    report: reportFromTopology(topology, options, {
      pipeOnlyFixApplied: true,
      adjustments: [...pipeGapFills, ...pipeClashTrims],
      pipeGapFills,
      pipeClashTrims,
    }),
  };
}

/**
 * Backward-compatible name for existing <6mm gap auto-fix logic.
 * Now implemented as pipe-only gap/clash fix using the configured tolerance.
 */
export function applyContinuityAutoBalanceComponents(components, rawOptions) {
  return applyPipeOnlyGapClashFixComponents(components, {
    ...rawOptions,
    pipeGapClashFixToleranceMm:
      rawOptions?.pipeGapClashFixToleranceMm ??
      rawOptions?.continuityMismatchToleranceMm ??
      DEFAULT_TOLERANCE_MM,
  });
}

export function analyzePcfTextContinuity(pcfText, rawOptions) {
  const parsed = parsePcfText(String(pcfText || ''), null);
  const normalized = normalizePcfModel(parsed, null);

  return analyzeContinuityComponents(normalized.components || [], rawOptions);
}

export function applyPcfTextContinuityAutoBalance(pcfText, rawOptions) {
  const parsed = parsePcfText(String(pcfText || ''), null);
  const normalized = normalizePcfModel(parsed, null);
  const result = applyPipeOnlyGapClashFixComponents(normalized.components || [], rawOptions);

  return {
    ...result,
    parsed,
    normalized,
  };
}

export class RvmPcfContinuityChecker {
  analyzeComponents(components, options) {
    return analyzeContinuityComponents(components, options);
  }

  applyAutoBalanceComponents(components, options) {
    return applyContinuityAutoBalanceComponents(components, options);
  }

  applyPipeOnlyGapClashFixComponents(components, options) {
    return applyPipeOnlyGapClashFixComponents(components, options);
  }

  analyzePcfText(pcfText, options) {
    return analyzePcfTextContinuity(pcfText, options);
  }

  applyPcfTextAutoBalance(pcfText, options) {
    return applyPcfTextContinuityAutoBalance(pcfText, options);
  }
}
