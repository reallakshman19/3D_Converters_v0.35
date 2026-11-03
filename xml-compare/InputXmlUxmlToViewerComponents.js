/**
 * InputXmlUxmlToViewerComponents.js
 *
 * Converts UXML components into the viewer-component shape used by the normal
 * 3D Viewer. The conversion is conservative and must not throw on incomplete
 * input.
 */

function clean(value) {
  return String(value ?? '').trim();
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clonePoint(point) {
  if (!point) return null;

  const x = numberOrNull(point.x);
  const y = numberOrNull(point.y);
  const z = numberOrNull(point.z);

  if (x == null || y == null || z == null) {
    return null;
  }

  const bore = numberOrNull(point.bore);

  return {
    x,
    y,
    z,
    bore,
  };
}

function pointFromValue(value) {
  if (!value) return null;

  if (Array.isArray(value) && value.length >= 3) {
    return clonePoint({
      x: value[0],
      y: value[1],
      z: value[2],
      bore: value[3],
    });
  }

  if (typeof value === 'string') {
    const parts = value.split(/[\s,]+/).filter(Boolean).map((part) => Number(part));
    if (parts.length >= 3 && parts.slice(0, 3).every((part) => Number.isFinite(part))) {
      return clonePoint({
        x: parts[0],
        y: parts[1],
        z: parts[2],
        bore: parts[3],
      });
    }
    return null;
  }

  if (typeof value === 'object') {
    const source = value.point || value.coord || value.position || value;
    return clonePoint(source);
  }

  return null;
}

function emitDiagnostic(options, diagnostic) {
  if (!Array.isArray(options?.diagnostics)) return;
  options.diagnostics.push(diagnostic);
}

function upper(value) {
  return clean(value).toUpperCase();
}

function viewerTypeForComponent(componentType) {
  const type = upper(componentType);

  if (type === 'ELBOW') return 'BEND';
  if (type === 'REDUCER-CONCENTRIC' || type === 'REDUCER-ECCENTRIC') return 'REDUCER';

  return type || 'UNKNOWN';
}

function collectAnchors(uxml, component) {
  const local = asArray(component?.anchors);
  if (local.length) return local;

  const componentId = clean(component?.id);
  return asArray(uxml?.anchors).filter((anchor) => clean(anchor?.componentId) === componentId);
}

function collectPorts(uxml, component) {
  const local = asArray(component?.ports);
  if (local.length) return local;

  const componentId = clean(component?.id);
  return asArray(uxml?.ports).filter((port) => clean(port?.componentId) === componentId);
}

function pointFromAnchorsAndPorts(anchors, ports, roles) {
  const wanted = new Set(roles.map((role) => upper(role)));

  for (const item of [...anchors, ...ports]) {
    const role = upper(item?.role);
    if (!wanted.has(role)) continue;

    const point = pointFromValue(item?.point || item?.coord || item?.position || item);
    if (point) return point;
  }

  return null;
}

function firstPointFromItems(items) {
  for (const item of items) {
    const point = pointFromValue(item?.point || item?.coord || item?.position || item);
    if (point) return point;
  }

  return null;
}

function selectPrimaryPoints(type, anchors, ports, component) {
  const normalizedType = upper(type);
  const componentPoints = asArray(component?.points).map((item) => pointFromValue(item)).filter(Boolean);

  const ep1 = pointFromAnchorsAndPorts(anchors, ports, ['EP1', 'PIPE_END_1', 'TEE_MAIN_1', 'VALVE_END_1', 'REDUCER_END_1', 'FLANGE_END_1']);
  const ep2 = pointFromAnchorsAndPorts(anchors, ports, ['EP2', 'PIPE_END_2', 'TEE_MAIN_2', 'VALVE_END_2', 'REDUCER_END_2', 'FLANGE_END_2']);
  const cp = pointFromAnchorsAndPorts(anchors, ports, ['CP', 'CENTER', 'CENTRE', 'CENTERPOINT', 'CENTREPOINT', 'OLET_HEADER_TAP']);
  const bp = pointFromAnchorsAndPorts(anchors, ports, ['BP', 'BRANCH', 'BRANCHPOINT', 'TEE_BRANCH', 'OLET_BRANCH']);

  const supportPoint = pointFromAnchorsAndPorts(anchors, ports, ['SUPPORT', 'SUPPORT_POINT', 'POS', 'POSITION']);
  const firstAnchorPoint = firstPointFromItems(anchors);
  const firstPortPoint = firstPointFromItems(ports);
  const firstComponentPoint = componentPoints[0] || null;

  const isSupportLike = normalizedType === 'SUPPORT' || normalizedType === 'ANCI';
  const isBranchType = normalizedType === 'TEE' || normalizedType === 'OLET';

  const points = [];

  if (!isSupportLike) {
    if (ep1) points.push(ep1);
    if (ep2) points.push(ep2);

    if (!points.length && componentPoints.length) {
      points.push(...componentPoints.slice(0, 2));
    }
  }

  const centrePoint = pointFromValue(component?.centrePoint || cp);
  const branch1Point = pointFromValue(component?.branch1Point || bp);

  let coOrds = null;
  if (isSupportLike) {
    coOrds =
      pointFromValue(component?.coOrds) ||
      supportPoint ||
      firstAnchorPoint ||
      firstPortPoint ||
      firstComponentPoint;
  }

  if (!points.length && !isSupportLike && componentPoints.length) {
    points.push(...componentPoints.slice(0, 2));
  }

  if (isBranchType && branch1Point && !points.some((point) => point && point.x === branch1Point.x && point.y === branch1Point.y && point.z === branch1Point.z)) {
    // Keep the branch point available on the component while preserving the
    // normal viewer-compatible end-point array.
  }

  return {
    points,
    centrePoint,
    branch1Point,
    coOrds,
  };
}

function buildAttributes(component, type) {
  const sourceAttributes = {
    ...(component?.attributes && typeof component.attributes === 'object' ? component.attributes : {}),
    ...(component?.rawAttributes && typeof component.rawAttributes === 'object' ? component.rawAttributes : {}),
  };

  return {
    ...sourceAttributes,
    id: clean(component?.id),
    componentId: clean(component?.id),
    refNo: clean(component?.refNo || component?.attributes?.refNo || sourceAttributes.refNo || ''),
    seqNo: clean(component?.seqNo || component?.attributes?.seqNo || sourceAttributes.seqNo || ''),
    lineKey: clean(component?.lineKey || sourceAttributes.lineKey || ''),
    pipelineRef: clean(component?.pipelineRef || sourceAttributes.pipelineRef || ''),
    name: clean(component?.name || sourceAttributes.name || ''),
    type: clean(component?.type || type || ''),
    normalizedType: clean(component?.normalizedType || ''),
    SKEY: clean(component?.skey || sourceAttributes.SKEY || ''),
    SUPPORT_KIND: clean(component?.supportKind || sourceAttributes.SUPPORT_KIND || ''),
    SUPPORT_NAME: clean(component?.supportName || sourceAttributes.SUPPORT_NAME || ''),
    SUPPORT_DIRECTION: clean(component?.supportDirection || sourceAttributes.SUPPORT_DIRECTION || ''),
    'PIPELINE-REFERENCE': clean(component?.pipelineRef || sourceAttributes['PIPELINE-REFERENCE'] || ''),
    'COMPONENT-ATTRIBUTE97': clean(component?.refNo || sourceAttributes['COMPONENT-ATTRIBUTE97'] || ''),
    'COMPONENT-ATTRIBUTE98': clean(component?.seqNo || sourceAttributes['COMPONENT-ATTRIBUTE98'] || ''),
  };
}

function pushMissingPointsDiagnostics(options, componentId, type, points, isSupportLike) {
  if (!Array.isArray(options?.diagnostics)) return;

  if (isSupportLike) {
    if (!points.coOrds) {
      emitDiagnostic(options, {
        severity: 'WARNING',
        code: 'INPUTXML-UXML-SUPPORT-COORDS-MISSING',
        message: `Support component ${componentId || '(missing id)'} has no coOrds/support anchor.`,
        componentId,
      });
    }
    return;
  }

  if (points.points.length < 2) {
    emitDiagnostic(options, {
      severity: 'WARNING',
      code: 'INPUTXML-UXML-ENDPOINTS-MISSING',
      message: `Component ${componentId || '(missing id)'} type ${type} does not provide both primary endpoints.`,
      componentId,
    });
  }
}

export function uxmlToViewerComponents(uxml, options = {}) {
  const components = [];
  const uxmlComponents = asArray(uxml?.components);

  for (const component of uxmlComponents) {
    const type = viewerTypeForComponent(component?.normalizedType || component?.type);
    const anchors = collectAnchors(uxml, component);
    const ports = collectPorts(uxml, component);
    const pointsAndOffsets = selectPrimaryPoints(type, anchors, ports, component);
    const bore = numberOrNull(component?.bore) ?? numberOrNull(pointsAndOffsets.points[0]?.bore) ?? numberOrNull(pointsAndOffsets.points[1]?.bore) ?? 0;
    const isSupportLike = type === 'SUPPORT' || type === 'ANCI';

    pushMissingPointsDiagnostics(options, clean(component?.id), type, pointsAndOffsets, isSupportLike);

    components.push({
      id: clean(component?.id),
      type,
      points: pointsAndOffsets.points,
      centrePoint: pointsAndOffsets.centrePoint,
      branch1Point: pointsAndOffsets.branch1Point,
      coOrds: pointsAndOffsets.coOrds,
      bore,
      fixingAction: clean(component?.fixingAction || ''),
      attributes: buildAttributes(component, type),
      source: component,
    });
  }

  return components;
}
