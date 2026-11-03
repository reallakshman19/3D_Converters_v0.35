/**
 * UxmlFaceModelBuilder.js
 *
 * Agent 04: UXML pre-topology face model builder.
 *
 * Purpose:
 * - Convert validated UXML evidence into component/fitting face records.
 * - Provide clean input for a future RayTopoBuilder.
 *
 * Out of scope:
 * - UniversalTopoGraph solving.
 * - Ray topology execution.
 * - Gap/overlap fixing.
 * - PCF/GLB/InputXML/CII emission.
 * - Master resolution.
 */

import {
  ANCHOR_ROLES,
  COMPONENT_TYPES,
  DIAGNOSTIC_SEVERITIES,
} from './UxmlConstants.js';

import {
  createUxmlDiagnostic,
} from './UxmlTypes.js';

import {
  validateUxmlDocument,
} from './UxmlValidationGate.js';

const FACE_MODEL_SCHEMA = 'uxml-face-model/v1';

const INLINE_TWO_END_TYPES = new Set([
  COMPONENT_TYPES.PIPE,
  COMPONENT_TYPES.BEND,
  COMPONENT_TYPES.ELBOW,
  COMPONENT_TYPES.VALVE,
  COMPONENT_TYPES.FLANGE,
  COMPONENT_TYPES.GASKET,
  COMPONENT_TYPES.REDUCER_CONCENTRIC,
  COMPONENT_TYPES.REDUCER_ECCENTRIC,
  COMPONENT_TYPES.BLIND_FLANGE,
  COMPONENT_TYPES.CAP,
]);

const OLET_TYPES = new Set([
  COMPONENT_TYPES.OLET,
  COMPONENT_TYPES.WELDOLET,
  COMPONENT_TYPES.SOCKOLET,
]);

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function componentType(component) {
  return upper(component?.normalizedType || component?.type || COMPONENT_TYPES.UNKNOWN);
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

function midpoint(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return null;

  return {
    x: (Number(a.x) + Number(b.x)) / 2,
    y: (Number(a.y) + Number(b.y)) / 2,
    z: (Number(a.z) + Number(b.z)) / 2,
  };
}

function makeDiagnosticFactory(out) {
  return function addDiagnostic({
    severity = DIAGNOSTIC_SEVERITIES.INFO,
    code,
    message,
    componentId = '',
    anchorId = '',
    portId = '',
    details = {},
  }) {
    const diagnostic = createUxmlDiagnostic({
      id: `FD-${String(out.diagnostics.length + 1).padStart(5, '0')}`,
      severity,
      code,
      message,
      componentId,
      anchorId,
      portId,
      details,
    });

    out.diagnostics.push(diagnostic);
    return diagnostic;
  };
}

function anchorsForComponent(uxml, componentId) {
  return (uxml.anchors || []).filter(anchor => clean(anchor.componentId) === clean(componentId));
}

function portsForComponent(uxml, componentId) {
  return (uxml.ports || []).filter(port => clean(port.componentId) === clean(componentId));
}

function anchorByRole(uxml, componentId, role) {
  return anchorsForComponent(uxml, componentId).find(anchor => upper(anchor.role) === role) || null;
}

function portByAnchorId(uxml, componentId, anchorId) {
  return portsForComponent(uxml, componentId).find(port => clean(port.anchorId) === clean(anchorId)) || null;
}

function portByRole(uxml, componentId, role) {
  return portsForComponent(uxml, componentId).find(port => upper(port.role) === role) || null;
}

function anchorRolePoint(uxml, componentId, role) {
  const anchor = anchorByRole(uxml, componentId, role);
  return anchor ? clonePoint(anchor.point) : null;
}

function createFace({
  component,
  anchor,
  port,
  role,
  faceKind = 'ENDPOINT',
  point,
  connectsTo = 'ENDPOINT',
  fixed = true,
  futureMovable = false,
  mutableNow = false,
  source = 'ANCHOR',
}) {
  const type = componentType(component);

  return {
    id: `F-${component.id}-${role}`,
    componentId: component.id,
    type,
    pipelineRef: component.pipelineRef || '',
    lineKey: component.lineKey || '',
    role,
    faceKind,
    point: clonePoint(point || anchor?.point || port?.point),
    anchorId: anchor?.id || port?.anchorId || '',
    portId: port?.id || '',
    portRole: port?.role || '',
    connectsTo,
    fixed,
    futureMovable,
    mutableNow,
    bore: component.bore ?? null,
    branchBore: component.branchBore ?? null,
    source,
  };
}

function addRoleFace(faceHost, uxml, component, anchorRole, faceOptions = {}) {
  const anchor = anchorByRole(uxml, component.id, anchorRole);
  const port = anchor
    ? portByAnchorId(uxml, component.id, anchor.id)
    : portByRole(uxml, component.id, faceOptions.portRole || '');

  const point = anchor?.point || port?.point || null;

  if (!isFinitePoint(point)) {
    return null;
  }

  const face = createFace({
    component,
    anchor,
    port,
    point,
    ...faceOptions,
  });

  faceHost.faces.push(face);
  return face;
}

function buildAxisVector(ep1, ep2) {
  const axis = normalizeVector(vector(ep1, ep2));

  if (!axis) {
    return {
      vector: null,
      confidence: 'NONE',
      method: 'UNAVAILABLE',
    };
  }

  return {
    vector: axis,
    confidence: 'HIGH',
    method: 'EP2_MINUS_EP1',
  };
}

function buildTeeBranchVector(uxml, component) {
  const cp = anchorRolePoint(uxml, component.id, ANCHOR_ROLES.CP);
  const bp = anchorRolePoint(uxml, component.id, ANCHOR_ROLES.BP);

  if (!bp) {
    return {
      vector: null,
      confidence: 'NONE',
      method: 'TEE_BP_MISSING',
      origin: null,
      referencePoint: null,
    };
  }

  if (cp) {
    const direct = normalizeVector(vector(cp, bp));

    if (direct) {
      return {
        vector: direct,
        confidence: 'HIGH',
        method: 'TEE_BP_MINUS_CP',
        origin: bp,
        referencePoint: cp,
      };
    }
  }

  const ep1 = anchorRolePoint(uxml, component.id, ANCHOR_ROLES.EP1);
  const ep2 = anchorRolePoint(uxml, component.id, ANCHOR_ROLES.EP2);
  const mid = midpoint(ep1, ep2);

  if (mid) {
    const fallback = normalizeVector(vector(mid, bp));

    if (fallback) {
      return {
        vector: fallback,
        confidence: 'MEDIUM',
        method: 'TEE_BP_MINUS_MAIN_MIDPOINT',
        origin: bp,
        referencePoint: mid,
      };
    }
  }

  return {
    vector: null,
    confidence: 'NONE',
    method: cp ? 'TEE_VECTOR_ZERO' : 'TEE_CP_AND_MAIN_MIDPOINT_MISSING',
    origin: bp,
    referencePoint: cp || mid || null,
  };
}

function buildOletBranchVector(uxml, component) {
  const cp = anchorRolePoint(uxml, component.id, ANCHOR_ROLES.CP);
  const bp = anchorRolePoint(uxml, component.id, ANCHOR_ROLES.BP);

  if (!cp || !bp) {
    return {
      vector: null,
      confidence: 'NONE',
      method: !cp ? 'OLET_CP_MISSING' : 'OLET_BP_MISSING',
      origin: bp || null,
      referencePoint: cp || null,
    };
  }

  const branch = normalizeVector(vector(cp, bp));

  if (!branch) {
    return {
      vector: null,
      confidence: 'NONE',
      method: 'OLET_BP_MINUS_CP_ZERO',
      origin: bp,
      referencePoint: cp,
    };
  }

  return {
    vector: branch,
    confidence: 'HIGH',
    method: 'OLET_BP_MINUS_CP',
    origin: bp,
    referencePoint: cp,
  };
}

function createComponentFaceRecord(component) {
  return {
    componentId: component.id,
    type: componentType(component),
    pipelineRef: component.pipelineRef || '',
    lineKey: component.lineKey || '',
    refNo: component.refNo || '',
    seqNo: component.seqNo || '',
    name: component.name || '',
    bore: component.bore ?? null,
    branchBore: component.branchBore ?? null,
    faces: [],
    axisVector: null,
    axisVectorConfidence: 'NONE',
    axisVectorMethod: 'UNAVAILABLE',
    branchVector: null,
    branchVectorConfidence: 'NONE',
    branchVectorMethod: 'UNAVAILABLE',
    branchOrigin: null,
    branchReferencePoint: null,
    supportAssociationOnly: false,
    sourceComponent: component,
  };
}

function pushComponentRecord(out, record) {
  out.components.push(record);
  out.faces.push(...record.faces);
}

function buildPipeLikeFaces(uxml, component, record, add) {
  const type = componentType(component);
  const isPipe = type === COMPONENT_TYPES.PIPE;

  const ep1Face = addRoleFace(record, uxml, component, ANCHOR_ROLES.EP1, {
    role: isPipe ? 'PIPE_END_1' : `${type}_END_1`,
    faceKind: 'ENDPOINT',
    connectsTo: 'ENDPOINT',
    fixed: !isPipe,
    futureMovable: isPipe,
  });

  const ep2Face = addRoleFace(record, uxml, component, ANCHOR_ROLES.EP2, {
    role: isPipe ? 'PIPE_END_2' : `${type}_END_2`,
    faceKind: 'ENDPOINT',
    connectsTo: 'ENDPOINT',
    fixed: !isPipe,
    futureMovable: isPipe,
  });

  const axis = buildAxisVector(ep1Face?.point || null, ep2Face?.point || null);

  record.axisVector = axis.vector;
  record.axisVectorConfidence = axis.confidence;
  record.axisVectorMethod = axis.method;

  if (!ep1Face || !ep2Face) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-FACE-INLINE-END-FACE-INCOMPLETE',
      message: `Component ${component.id} type ${type} does not have both EP1/EP2 faces.`,
      componentId: component.id,
      details: {
        hasEp1Face: !!ep1Face,
        hasEp2Face: !!ep2Face,
      },
    });
  }
}

function buildTeeFaces(uxml, component, record, add) {
  addRoleFace(record, uxml, component, ANCHOR_ROLES.EP1, {
    role: 'TEE_MAIN_1',
    faceKind: 'TEE_MAIN',
    connectsTo: 'ENDPOINT',
    fixed: true,
  });

  addRoleFace(record, uxml, component, ANCHOR_ROLES.EP2, {
    role: 'TEE_MAIN_2',
    faceKind: 'TEE_MAIN',
    connectsTo: 'ENDPOINT',
    fixed: true,
  });

  const branchFace = addRoleFace(record, uxml, component, ANCHOR_ROLES.BP, {
    role: 'TEE_BRANCH',
    faceKind: 'TEE_BRANCH',
    connectsTo: 'ENDPOINT',
    fixed: true,
  });

  const axis = buildAxisVector(
    anchorRolePoint(uxml, component.id, ANCHOR_ROLES.EP1),
    anchorRolePoint(uxml, component.id, ANCHOR_ROLES.EP2)
  );

  record.axisVector = axis.vector;
  record.axisVectorConfidence = axis.confidence;
  record.axisVectorMethod = axis.method;

  const branch = buildTeeBranchVector(uxml, component);

  record.branchVector = branch.vector;
  record.branchVectorConfidence = branch.confidence;
  record.branchVectorMethod = branch.method;
  record.branchOrigin = branch.origin;
  record.branchReferencePoint = branch.referencePoint;

  if (!branchFace) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-FACE-TEE-BRANCH-FACE-MISSING',
      message: `TEE component ${component.id} has no branch face.`,
      componentId: component.id,
    });
  }

  if (!record.branchVector) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-FACE-TEE-BRANCH-VECTOR-MISSING',
      message: `TEE component ${component.id} branch vector could not be derived.`,
      componentId: component.id,
      details: {
        method: record.branchVectorMethod,
      },
    });
  }
}

function buildOletFaces(uxml, component, record, add) {
  const headerFace = addRoleFace(record, uxml, component, ANCHOR_ROLES.CP, {
    role: 'OLET_HEADER_TAP',
    faceKind: 'OLET_HEADER_TAP',
    connectsTo: 'SEGMENT',
    fixed: true,
  });

  const branchFace = addRoleFace(record, uxml, component, ANCHOR_ROLES.BP, {
    role: 'OLET_BRANCH',
    faceKind: 'OLET_BRANCH',
    connectsTo: 'ENDPOINT',
    fixed: true,
  });

  const branch = buildOletBranchVector(uxml, component);

  record.branchVector = branch.vector;
  record.branchVectorConfidence = branch.confidence;
  record.branchVectorMethod = branch.method;
  record.branchOrigin = branch.origin;
  record.branchReferencePoint = branch.referencePoint;

  if (!headerFace || !branchFace) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-FACE-OLET-FACE-INCOMPLETE',
      message: `OLET component ${component.id} requires CP header face and BP branch face.`,
      componentId: component.id,
      details: {
        hasHeaderFace: !!headerFace,
        hasBranchFace: !!branchFace,
      },
    });
  }

  if (!record.branchVector) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-FACE-OLET-BRANCH-VECTOR-MISSING',
      message: `OLET component ${component.id} branch vector could not be derived.`,
      componentId: component.id,
      details: {
        method: record.branchVectorMethod,
      },
    });
  }
}

function buildSupportFaces(uxml, component, record, add) {
  record.supportAssociationOnly = true;

  const supportAnchor =
    anchorByRole(uxml, component.id, ANCHOR_ROLES.SUPPORT_POINT) ||
    anchorByRole(uxml, component.id, ANCHOR_ROLES.POS);

  if (!supportAnchor || !isFinitePoint(supportAnchor.point)) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.WARNING,
      code: 'UXML-FACE-SUPPORT-POINT-MISSING',
      message: `Support component ${component.id} has no SUPPORT_POINT/POS face.`,
      componentId: component.id,
    });
    return;
  }

  const port = portByAnchorId(uxml, component.id, supportAnchor.id);

  record.faces.push(createFace({
    component,
    anchor: supportAnchor,
    port,
    role: 'SUPPORT_ASSOCIATION',
    faceKind: 'SUPPORT_ASSOCIATION',
    point: supportAnchor.point,
    connectsTo: 'SEGMENT',
    fixed: true,
    futureMovable: false,
    mutableNow: false,
  }));
}

function buildUnknownComponentFace(uxml, component, record, add) {
  const anchors = anchorsForComponent(uxml, component.id);

  for (const anchor of anchors) {
    if (!isFinitePoint(anchor.point)) continue;

    const port = portByAnchorId(uxml, component.id, anchor.id);

    record.faces.push(createFace({
      component,
      anchor,
      port,
      role: `UNKNOWN_${upper(anchor.role || 'ANCHOR')}`,
      faceKind: 'UNKNOWN',
      point: anchor.point,
      connectsTo: 'UNKNOWN',
      fixed: true,
    }));
  }

  add({
    severity: DIAGNOSTIC_SEVERITIES.WARNING,
    code: 'UXML-FACE-UNKNOWN-COMPONENT-TYPE',
    message: `Component ${component.id} has unknown/unhandled type ${componentType(component)}.`,
    componentId: component.id,
  });
}

function buildComponentRecord(uxml, component, add) {
  const record = createComponentFaceRecord(component);
  const type = componentType(component);

  if (type === COMPONENT_TYPES.TEE) {
    buildTeeFaces(uxml, component, record, add);
  } else if (OLET_TYPES.has(type)) {
    buildOletFaces(uxml, component, record, add);
  } else if (type === COMPONENT_TYPES.SUPPORT) {
    buildSupportFaces(uxml, component, record, add);
  } else if (INLINE_TWO_END_TYPES.has(type)) {
    buildPipeLikeFaces(uxml, component, record, add);
  } else {
    buildUnknownComponentFace(uxml, component, record, add);
  }

  return record;
}

function makeSummary(out) {
  const faceCountByKind = {};

  for (const face of out.faces) {
    faceCountByKind[face.faceKind] = (faceCountByKind[face.faceKind] || 0) + 1;
  }

  const supportInlineFaceCount = out.faces.filter(face =>
    face.type === COMPONENT_TYPES.SUPPORT &&
    face.connectsTo === 'ENDPOINT' &&
    face.faceKind !== 'SUPPORT_ASSOCIATION'
  ).length;

  return {
    componentCount: out.components.length,
    faceCount: out.faces.length,
    faceCountByKind,
    pipeFaceCount: out.faces.filter(face => face.type === COMPONENT_TYPES.PIPE).length,
    teeBranchFaceCount: out.faces.filter(face => face.faceKind === 'TEE_BRANCH').length,
    oletHeaderFaceCount: out.faces.filter(face => face.faceKind === 'OLET_HEADER_TAP').length,
    oletBranchFaceCount: out.faces.filter(face => face.faceKind === 'OLET_BRANCH').length,
    supportAssociationFaceCount: out.faces.filter(face => face.faceKind === 'SUPPORT_ASSOCIATION').length,
    supportInlineFaceCount,
    branchVectorCount: out.components.filter(component => !!component.branchVector).length,
    highConfidenceBranchVectorCount: out.components.filter(
      component => component.branchVectorConfidence === 'HIGH'
    ).length,
    mediumConfidenceBranchVectorCount: out.components.filter(
      component => component.branchVectorConfidence === 'MEDIUM'
    ).length,
    diagnosticCount: out.diagnostics.length,
  };
}

export function buildUxmlFaceModel(uxml, options = {}) {
  const out = {
    schema: FACE_MODEL_SCHEMA,
    ok: true,
    blocked: false,
    source: {
      validationGateRun: options.skipValidation !== true,
    },
    components: [],
    faces: [],
    diagnostics: [],
    summary: {},
  };

  const add = makeDiagnosticFactory(out);

  if (!uxml || typeof uxml !== 'object') {
    add({
      severity: DIAGNOSTIC_SEVERITIES.FATAL,
      code: 'UXML-FACE-DOCUMENT-NOT-OBJECT',
      message: 'Cannot build face model because UXML input is not an object.',
    });

    out.ok = false;
    out.blocked = true;
    out.summary = makeSummary(out);
    return out;
  }

  if (options.skipValidation !== true) {
    const validation = validateUxmlDocument(uxml);
    out.source.validation = validation;

    if (validation.ready !== true && options.allowPartial !== true) {
      add({
        severity: DIAGNOSTIC_SEVERITIES.ERROR,
        code: 'UXML-FACE-VALIDATION-BLOCKED',
        message: 'UXML validation gate is not ready. Face model build blocked unless allowPartial=true.',
        details: {
          blockerCount: validation.blockers?.length || 0,
          errorCount: validation.stats?.errorCount || 0,
          fatalCount: validation.stats?.fatalCount || 0,
        },
      });

      out.ok = false;
      out.blocked = true;
      out.summary = makeSummary(out);
      return out;
    }

    if (validation.ready !== true && options.allowPartial === true) {
      add({
        severity: DIAGNOSTIC_SEVERITIES.WARNING,
        code: 'UXML-FACE-VALIDATION-PARTIAL',
        message: 'UXML validation gate is not ready. Building partial face model because allowPartial=true.',
        details: {
          blockerCount: validation.blockers?.length || 0,
          errorCount: validation.stats?.errorCount || 0,
          fatalCount: validation.stats?.fatalCount || 0,
        },
      });
    }
  }

  for (const component of uxml.components || []) {
    const record = buildComponentRecord(uxml, component, add);
    pushComponentRecord(out, record);
  }

  out.summary = makeSummary(out);

  if (out.summary.supportInlineFaceCount > 0) {
    add({
      severity: DIAGNOSTIC_SEVERITIES.ERROR,
      code: 'UXML-FACE-SUPPORT-INLINE-FACE-DETECTED',
      message: 'Support inline continuity face detected. Support must not create pipe continuity.',
      details: {
        supportInlineFaceCount: out.summary.supportInlineFaceCount,
      },
    });

    out.ok = false;
    out.blocked = true;
  }

  out.summary = makeSummary(out);
  return out;
}

export const createUxmlFaceModel = buildUxmlFaceModel;