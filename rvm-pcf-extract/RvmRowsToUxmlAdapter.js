/**
 * RvmRowsToUxmlAdapter.js
 *
 * Converts existing RVM/JSON → PCF extracted rows into UXML.
 *
 * Important:
 * - This adapter is topology-only.
 * - It does not resolve masters.
 * - It does not emit PCF.
 * - It does not mutate source rows.
 */

import {
  ANCHOR_ROLES,
  COMPONENT_TYPES,
  CONFIDENCE_LEVELS,
  PORT_ROLES,
  SEGMENT_TYPES,
  SOURCE_FORMATS,
  UXML_PROFILES,
} from '../uxml/UxmlConstants.js';

import {
  createUxmlAnchor,
  createUxmlComponent,
  createUxmlDiagnostic,
  createUxmlDocument,
  createUxmlMapping,
  createUxmlPipeline,
  createUxmlPort,
  createUxmlSegment,
  createUxmlSource,
  createUxmlSupport,
} from '../uxml/UxmlTypes.js';

const ADAPTER_SCHEMA = 'rvm-rows-to-uxml-adapter/v1';

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pad(n) {
  return String(n).padStart(5, '0');
}

function safeId(value, fallback) {
  const raw = clean(value);

  if (!raw) return fallback;

  return raw.replace(/[^\w:.-]+/g, '-');
}

function rowNo(row, index) {
  return clean(row?.rowNo ?? row?.row ?? row?.index ?? index + 1);
}

function parsePointText(value) {
  const text = clean(value);

  if (!text) return null;

  const parts = text
    .split(/[,\s|/]+/)
    .map(v => Number(v))
    .filter(v => Number.isFinite(v));

  if (parts.length < 3) return null;

  return {
    x: parts[0],
    y: parts[1],
    z: parts[2],
  };
}

function pointFromObject(value) {
  if (!value || typeof value !== 'object') return null;

  const x = num(value.x ?? value.X ?? value.e ?? value.E ?? value.east ?? value.EAST);
  const y = num(value.y ?? value.Y ?? value.n ?? value.N ?? value.north ?? value.NORTH);
  const z = num(value.z ?? value.Z ?? value.elev ?? value.ELEV ?? value.elevation ?? value.ELEVATION);

  if (x == null || y == null || z == null) return null;

  return { x, y, z };
}

function pointFromTriplet(row, names) {
  for (const set of names) {
    const x = num(row?.[set[0]]);
    const y = num(row?.[set[1]]);
    const z = num(row?.[set[2]]);

    if (x != null && y != null && z != null) {
      return { x, y, z };
    }
  }

  return null;
}

function pointFromRow(row, role) {
  const r = upper(role);

  if (r === ANCHOR_ROLES.EP1) {
    return (
      pointFromObject(row?.ep1) ||
      pointFromObject(row?.EP1) ||
      parsePointText(row?.ep1) ||
      parsePointText(row?.EP1) ||
      parsePointText(row?.start) ||
      parsePointText(row?.startPoint) ||
      parsePointText(row?.END_POINT_1) ||
      pointFromTriplet(row, [
        ['ep1X', 'ep1Y', 'ep1Z'],
        ['EP1_X', 'EP1_Y', 'EP1_Z'],
        ['x1', 'y1', 'z1'],
        ['X1', 'Y1', 'Z1'],
        ['startX', 'startY', 'startZ'],
      ])
    );
  }

  if (r === ANCHOR_ROLES.EP2) {
    return (
      pointFromObject(row?.ep2) ||
      pointFromObject(row?.EP2) ||
      parsePointText(row?.ep2) ||
      parsePointText(row?.EP2) ||
      parsePointText(row?.end) ||
      parsePointText(row?.endPoint) ||
      parsePointText(row?.END_POINT_2) ||
      pointFromTriplet(row, [
        ['ep2X', 'ep2Y', 'ep2Z'],
        ['EP2_X', 'EP2_Y', 'EP2_Z'],
        ['x2', 'y2', 'z2'],
        ['X2', 'Y2', 'Z2'],
        ['endX', 'endY', 'endZ'],
      ])
    );
  }

  if (r === ANCHOR_ROLES.CP) {
    return (
      pointFromObject(row?.cp) ||
      pointFromObject(row?.CP) ||
      pointFromObject(row?.center) ||
      parsePointText(row?.cp) ||
      parsePointText(row?.CP) ||
      parsePointText(row?.center) ||
      parsePointText(row?.centre) ||
      parsePointText(row?.centerPoint) ||
      pointFromTriplet(row, [
        ['cpX', 'cpY', 'cpZ'],
        ['CP_X', 'CP_Y', 'CP_Z'],
        ['centerX', 'centerY', 'centerZ'],
      ])
    );
  }

  if (r === ANCHOR_ROLES.BP) {
    return (
      pointFromObject(row?.bp) ||
      pointFromObject(row?.BP) ||
      pointFromObject(row?.branchPoint) ||
      parsePointText(row?.bp) ||
      parsePointText(row?.BP) ||
      parsePointText(row?.branchPoint) ||
      parsePointText(row?.BRANCH_POINT) ||
      pointFromTriplet(row, [
        ['bpX', 'bpY', 'bpZ'],
        ['BP_X', 'BP_Y', 'BP_Z'],
        ['branchX', 'branchY', 'branchZ'],
      ])
    );
  }

  if (r === ANCHOR_ROLES.SUPPORT_POINT || r === ANCHOR_ROLES.POS) {
    return (
      pointFromObject(row?.supportCoord) ||
      pointFromObject(row?.supportPoint) ||
      pointFromObject(row?.pos) ||
      parsePointText(row?.supportCoord) ||
      parsePointText(row?.supportPoint) ||
      parsePointText(row?.pos) ||
      parsePointText(row?.POS) ||
      pointFromTriplet(row, [
        ['supportX', 'supportY', 'supportZ'],
        ['posX', 'posY', 'posZ'],
        ['x', 'y', 'z'],
        ['X', 'Y', 'Z'],
      ])
    );
  }

  return null;
}

function detectComponentType(row) {
  const raw = upper(row?.normalizedType || row?.componentType || row?.type || row?.name || row?.skey || row?.SKEY);

  if (!raw) return COMPONENT_TYPES.UNKNOWN;
  if (raw.includes('PIPE')) return COMPONENT_TYPES.PIPE;
  if (raw.includes('TEE')) return COMPONENT_TYPES.TEE;
  if (raw.includes('WELDOLET')) return COMPONENT_TYPES.WELDOLET;
  if (raw.includes('SOCKOLET')) return COMPONENT_TYPES.SOCKOLET;
  if (raw.includes('OLET')) return COMPONENT_TYPES.OLET;
  if (raw.includes('BEND')) return COMPONENT_TYPES.BEND;
  if (raw.includes('ELBOW')) return COMPONENT_TYPES.ELBOW;
  if (raw.includes('VALVE')) return COMPONENT_TYPES.VALVE;
  if (raw.includes('FLANGE') && raw.includes('BLIND')) return COMPONENT_TYPES.BLIND_FLANGE;
  if (raw.includes('FLANGE')) return COMPONENT_TYPES.FLANGE;
  if (raw.includes('GASK')) return COMPONENT_TYPES.GASKET;
  if (raw.includes('REDUCER') && raw.includes('ECC')) return COMPONENT_TYPES.REDUCER_ECCENTRIC;
  if (raw.includes('REDUCER')) return COMPONENT_TYPES.REDUCER_CONCENTRIC;
  if (raw.includes('SUPPORT') || raw.startsWith('PS-') || raw.startsWith('PS_')) return COMPONENT_TYPES.SUPPORT;
  if (raw.includes('CAP')) return COMPONENT_TYPES.CAP;

  return raw;
}

function portRoleFor(type, role) {
  const t = upper(type);
  const r = upper(role);

  if (t === COMPONENT_TYPES.PIPE) {
    if (r === ANCHOR_ROLES.EP1) return PORT_ROLES.PIPE_END_1;
    if (r === ANCHOR_ROLES.EP2) return PORT_ROLES.PIPE_END_2;
  }

  if (t === COMPONENT_TYPES.TEE) {
    if (r === ANCHOR_ROLES.EP1) return PORT_ROLES.TEE_MAIN_1;
    if (r === ANCHOR_ROLES.EP2) return PORT_ROLES.TEE_MAIN_2;
    if (r === ANCHOR_ROLES.BP) return PORT_ROLES.TEE_BRANCH;
    if (r === ANCHOR_ROLES.CP) return 'TEE_CENTER';
  }

  if ([COMPONENT_TYPES.OLET, COMPONENT_TYPES.WELDOLET, COMPONENT_TYPES.SOCKOLET].includes(t)) {
    if (r === ANCHOR_ROLES.CP) return PORT_ROLES.OLET_HEADER_TAP;
    if (r === ANCHOR_ROLES.BP) return PORT_ROLES.OLET_BRANCH;
  }

  if (t === COMPONENT_TYPES.VALVE) {
    if (r === ANCHOR_ROLES.EP1) return PORT_ROLES.VALVE_END_1;
    if (r === ANCHOR_ROLES.EP2) return PORT_ROLES.VALVE_END_2;
  }

  if (t.includes('FLANGE')) {
    if (r === ANCHOR_ROLES.EP1) return PORT_ROLES.FLANGE_END_1;
    if (r === ANCHOR_ROLES.EP2) return PORT_ROLES.FLANGE_END_2;
  }

  if (t.includes('REDUCER')) {
    if (r === ANCHOR_ROLES.EP1) return PORT_ROLES.REDUCER_END_1;
    if (r === ANCHOR_ROLES.EP2) return PORT_ROLES.REDUCER_END_2;
  }

  if (t === COMPONENT_TYPES.SUPPORT) return PORT_ROLES.SUPPORT_POINT;

  if (r === ANCHOR_ROLES.EP1) return `${t}_END_1`;
  if (r === ANCHOR_ROLES.EP2) return `${t}_END_2`;

  return `${t}_${r}`;
}

function segmentTypeFor(type) {
  const t = upper(type);

  if (t === COMPONENT_TYPES.PIPE) return SEGMENT_TYPES.PIPE_RUN;
  if (t === COMPONENT_TYPES.TEE) return SEGMENT_TYPES.TEE_MAIN_RUN;
  if ([COMPONENT_TYPES.OLET, COMPONENT_TYPES.WELDOLET, COMPONENT_TYPES.SOCKOLET].includes(t)) return SEGMENT_TYPES.OLET_BRANCH_LEG;
  if (t === COMPONENT_TYPES.BEND || t === COMPONENT_TYPES.ELBOW) return SEGMENT_TYPES.BEND_CHORD;
  if (t === COMPONENT_TYPES.VALVE) return SEGMENT_TYPES.VALVE_AXIS;
  if (t.includes('FLANGE')) return SEGMENT_TYPES.FLANGE_AXIS;
  if (t.includes('REDUCER')) return SEGMENT_TYPES.REDUCER_AXIS;

  return '';
}

function rowComponentId(row, index) {
  return safeId(
    row?.componentId ||
    row?.id ||
    row?.canonicalId ||
    row?.rowId ||
    row?.refNo ||
    row?.CA97 ||
    `ROW-${rowNo(row, index)}`,
    `RVMROW-${pad(index + 1)}`
  );
}

function rowPipelineRef(row) {
  return clean(row?.pipelineRef || row?.pipeline || row?.lineNo || row?.lineKey || row?.LINE_NO || row?.lineNoKey);
}

function rowBore(row) {
  return num(row?.convertedBore ?? row?.bore ?? row?.size ?? row?.nps ?? row?.NPS);
}

function rowBranchBore(row) {
  return num(row?.branchConvertedBore ?? row?.branchBore ?? row?.branchSize ?? row?.branchNps);
}

function addDiagnostic(doc, overrides) {
  doc.diagnostics.push(createUxmlDiagnostic({
    id: `RVM-UXML-D-${pad(doc.diagnostics.length + 1)}`,
    ...overrides,
  }));
}

function ensurePipeline(doc, pipelineRef, row) {
  const ref = clean(pipelineRef);
  if (!ref) return '';

  const existing = doc.pipelines.find(p => p.pipelineRef === ref);
  if (existing) return existing.id;

  const id = `RVM-UXML-PL-${pad(doc.pipelines.length + 1)}`;

  doc.pipelines.push(createUxmlPipeline({
    id,
    pipelineRef: ref,
    lineKey: clean(row?.lineKey || row?.lineNo || row?.lineNoKey || ref),
    lineNo: clean(row?.lineNo || row?.lineNoKey || ''),
  }));

  return id;
}

function addAnchorPort(doc, component, row, role, point, options = {}) {
  if (!point) return null;

  const portRole = options.portRole || portRoleFor(component.normalizedType, role);
  const anchorId = `A-${component.id}-${role}`;
  const portId = `P-${component.id}-${portRole}`;

  const anchor = createUxmlAnchor({
    id: anchorId,
    componentId: component.id,
    role,
    point,
    sourceField: options.sourceField || role,
    confidence: CONFIDENCE_LEVELS.ALIASED_SOURCE,
  });

  const isPipeEndpoint =
    component.normalizedType === COMPONENT_TYPES.PIPE &&
    [ANCHOR_ROLES.EP1, ANCHOR_ROLES.EP2].includes(role);

  const port = createUxmlPort({
    id: portId,
    componentId: component.id,
    anchorId,
    role: portRole,
    point,
    bore: component.bore,
    branchBore: component.branchBore,
    fixed: !isPipeEndpoint,
    futureMovable: isPipeEndpoint,
    mutableNow: false,
    connectsTo: options.connectsTo || 'ENDPOINT',
    maxDegree: 1,
  });

  doc.anchors.push(anchor);
  doc.ports.push(port);

  component.anchorIds.push(anchorId);
  component.portIds.push(portId);

  return { anchor, port };
}

function addSegmentIfPossible(doc, component, startRole = ANCHOR_ROLES.EP1, endRole = ANCHOR_ROLES.EP2) {
  const startAnchorId = `A-${component.id}-${startRole}`;
  const endAnchorId = `A-${component.id}-${endRole}`;

  const hasStart = doc.anchors.some(a => a.id === startAnchorId);
  const hasEnd = doc.anchors.some(a => a.id === endAnchorId);

  if (!hasStart || !hasEnd) return null;

  const type = segmentTypeFor(component.normalizedType);
  if (!type) return null;

  const segment = createUxmlSegment({
    id: `S-${component.id}-001`,
    componentId: component.id,
    type,
    startAnchorId,
    endAnchorId,
    bore: component.bore,
  });

  doc.segments.push(segment);
  component.segmentIds.push(segment.id);

  return segment;
}

function addSupportIfNeeded(doc, component) {
  if (component.normalizedType !== COMPONENT_TYPES.SUPPORT) return;

  const supportAnchorId =
    component.anchorIds.find(id => id.includes(ANCHOR_ROLES.SUPPORT_POINT)) ||
    component.anchorIds.find(id => id.includes(ANCHOR_ROLES.POS)) ||
    '';

  doc.supports.push(createUxmlSupport({
    id: `SUP-${component.id}`,
    componentId: component.id,
    type: clean(component.rawAttributes?.supportType || component.rawAttributes?.type || 'SUPPORT'),
    supportAnchorId,
    pipelineRef: component.pipelineRef,
  }));
}

export function adaptRvmRowsToUxml(rows = [], options = {}) {
  const doc = createUxmlDocument({
    profile: UXML_PROFILES.TOPOLOGY_FULL,
  });

  const sourceId = 'SRC-RVM-ROWS-00001';

  doc.sources.push(createUxmlSource({
    id: sourceId,
    format: SOURCE_FORMATS.JSON || 'JSON',
    name: options.name || 'rvm-pcf-extract-rows',
    path: options.path || '',
    role: 'PRIMARY',
    hash: options.hash || `rows:${rows.length}`,
  }));

  doc.mappings.push(createUxmlMapping({
    id: 'MAP-RVM-ROWS-00001',
    profile: 'RVM_ROWS',
    sourceFormat: 'RVM_ROWS',
    sourceField: 'rows[]',
    targetField: 'components[]/anchors[]/ports[]/segments[]',
    confidence: CONFIDENCE_LEVELS.ALIASED_SOURCE,
  }));

  const rowIdentityByComponentId = {};

  rows.forEach((row, index) => {
    const componentId = rowComponentId(row, index);
    const type = detectComponentType(row);
    const pipelineRef = rowPipelineRef(row);

    ensurePipeline(doc, pipelineRef, row);

    const component = createUxmlComponent({
      id: componentId,
      sourceRefs: [sourceId],
      type: clean(row?.type || row?.componentType || type),
      normalizedType: type,
      pipelineRef,
      lineKey: clean(row?.lineKey || row?.lineNoKey || row?.lineNo || ''),
      refNo: clean(row?.refNo || row?.CA97 || row?.ca97 || row?.ref || ''),
      seqNo: clean(row?.seqNo || row?.CA98 || row?.ca98 || rowNo(row, index)),
      name: clean(row?.name || row?.tag || ''),
      bore: rowBore(row),
      branchBore: rowBranchBore(row),
      skey: clean(row?.skey || row?.SKEY || ''),
      rawAttributes: { ...row },
      confidence: CONFIDENCE_LEVELS.ALIASED_SOURCE,
    });

    rowIdentityByComponentId[component.id] = {
      rowNo: rowNo(row, index),
      sourceIndex: index,
      refNo: component.refNo,
      seqNo: component.seqNo,
      lineNo: clean(row?.lineNo || row?.lineNoKey || ''),
      pipelineRef,
      type,
      name: component.name,
    };

    if (type === COMPONENT_TYPES.SUPPORT) {
      addAnchorPort(
        doc,
        component,
        row,
        ANCHOR_ROLES.SUPPORT_POINT,
        pointFromRow(row, ANCHOR_ROLES.SUPPORT_POINT) || pointFromRow(row, ANCHOR_ROLES.POS),
        {
          sourceField: 'supportCoord/POS',
          portRole: PORT_ROLES.SUPPORT_POINT,
          connectsTo: 'SEGMENT',
        }
      );
      addSupportIfNeeded(doc, component);
      doc.components.push(component);
      return;
    }

    addAnchorPort(doc, component, row, ANCHOR_ROLES.EP1, pointFromRow(row, ANCHOR_ROLES.EP1));
    addAnchorPort(doc, component, row, ANCHOR_ROLES.EP2, pointFromRow(row, ANCHOR_ROLES.EP2));

    const cp = pointFromRow(row, ANCHOR_ROLES.CP);
    const bp = pointFromRow(row, ANCHOR_ROLES.BP);

    if (cp) {
      addAnchorPort(doc, component, row, ANCHOR_ROLES.CP, cp, {
        connectsTo: [COMPONENT_TYPES.OLET, COMPONENT_TYPES.WELDOLET, COMPONENT_TYPES.SOCKOLET].includes(type)
          ? 'SEGMENT'
          : 'ENDPOINT',
      });
    }

    if (bp) {
      addAnchorPort(doc, component, row, ANCHOR_ROLES.BP, bp, {
        connectsTo: 'ENDPOINT',
      });
    }

    addSegmentIfPossible(doc, component);

    if (type === COMPONENT_TYPES.TEE && !bp) {
      addDiagnostic(doc, {
        severity: 'WARNING',
        code: 'RVM-UXML-TEE-BP-MISSING',
        message: `TEE row ${rowNo(row, index)} has no branch point.`,
        componentId: component.id,
        details: rowIdentityByComponentId[component.id],
      });
    }

    if ([COMPONENT_TYPES.OLET, COMPONENT_TYPES.WELDOLET, COMPONENT_TYPES.SOCKOLET].includes(type) && (!cp || !bp)) {
      addDiagnostic(doc, {
        severity: 'WARNING',
        code: 'RVM-UXML-OLET-CP-BP-INCOMPLETE',
        message: `OLET row ${rowNo(row, index)} requires CP and BP for UXML topology.`,
        componentId: component.id,
        details: rowIdentityByComponentId[component.id],
      });
    }

    doc.components.push(component);
  });

  return {
    schema: ADAPTER_SCHEMA,
    ok: true,
    uxml: doc,
    rowIdentityByComponentId,
    stats: {
      rowCount: rows.length,
      componentCount: doc.components.length,
      anchorCount: doc.anchors.length,
      portCount: doc.ports.length,
      segmentCount: doc.segments.length,
      supportCount: doc.supports.length,
      diagnosticCount: doc.diagnostics.length,
    },
    diagnostics: doc.diagnostics,
  };
}

export const convertRvmRowsToUxml = adaptRvmRowsToUxml;