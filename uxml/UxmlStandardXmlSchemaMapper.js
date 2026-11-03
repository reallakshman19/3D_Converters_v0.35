/**
 * UxmlStandardXmlSchemaMapper.js
 *
 * Agent 19: Standard / Generic XML schema mapper.
 *
 * Purpose:
 * - Map STANDARD_XML and generic component XML into UXML components,
 *   anchors, ports, segments and supports.
 *
 * Supported XML patterns:
 * - <Project><Component ... /></Project>
 * - <Project><Pipe ... /></Project>
 * - <Pipeline><Valve ... /></Pipeline>
 * - <Components><Flange ... /></Components>
 * - nested endpoint/center/branch child tags.
 *
 * Out of scope:
 * - Topology solving.
 * - Ray casting.
 * - PCF emission.
 * - Master resolution.
 * - Coordinate mutation.
 */

import {
  ANCHOR_ROLES,
  COMPONENT_TYPES,
  CONFIDENCE_LEVELS,
  PORT_ROLES,
  SEGMENT_TYPES,
  XML_PROFILES,
} from './UxmlConstants.js';

import {
  createUxmlAnchor,
  createUxmlComponent,
  createUxmlDiagnostic,
  createUxmlLoss,
  createUxmlMapping,
  createUxmlPipeline,
  createUxmlPort,
  createUxmlSegment,
  createUxmlSupport,
} from './UxmlTypes.js';

export const UXML_STANDARD_XML_SCHEMA_MAPPER_SCHEMA =
  'uxml-standard-xml-schema-mapper/v1';

const COMPONENT_TAGS = Object.freeze([
  'Component',
  'Pipe',
  'PipeComponent',
  'Fitting',
  'Valve',
  'Flange',
  'BlindFlange',
  'Gasket',
  'Reducer',
  'ReducerConcentric',
  'ReducerEccentric',
  'Tee',
  'Olet',
  'Weldolet',
  'Sockolet',
  'Bend',
  'Elbow',
  'Cap',
  'Support',
  'PipeSupport',
  'PS',
]);

const POINT_TAGS = Object.freeze([
  'EndPoint',
  'Endpoint',
  'Point',
  'Pnt',
  'Coordinate',
  'Coord',
  'Position',
  'Pos',
  'CentrePoint',
  'CenterPoint',
  'BranchPoint',
  'SupportPoint',
]);

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function pad(num) {
  return String(num).padStart(5, '0');
}

function safeId(value, fallback) {
  const raw = clean(value);
  if (!raw) return fallback;
  return raw.replace(/[^\w:.-]+/g, '-');
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function attrValue(attrs, ...names) {
  for (const name of names) {
    if (attrs[name] != null && clean(attrs[name])) return clean(attrs[name]);

    const key = Object.keys(attrs).find(
      k => k.toLowerCase() === String(name).toLowerCase()
    );

    if (key && clean(attrs[key])) return clean(attrs[key]);
  }

  return '';
}

function parseAttrs(attrText = '') {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;

  while ((match = re.exec(attrText))) {
    attrs[match[1]] = match[3] ?? match[4] ?? '';
  }

  return attrs;
}

function findElements(xmlText, tagName) {
  const tag = String(tagName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const results = [];

  const pair = new RegExp(
    `<\\s*(?:[\\w.-]+:)?${tag}\\b([^>]*)>([\\s\\S]*?)<\\s*\\/\\s*(?:[\\w.-]+:)?${tag}\\s*>`,
    'gi'
  );

  let match;

  while ((match = pair.exec(xmlText))) {
    results.push({
      tagName,
      attrs: parseAttrs(match[1] || ''),
      inner: match[2] || '',
      raw: match[0],
      selfClosing: false,
    });
  }

  const self = new RegExp(
    `<\\s*(?:[\\w.-]+:)?${tag}\\b([^>]*)\\/\\s*>`,
    'gi'
  );

  while ((match = self.exec(xmlText))) {
    results.push({
      tagName,
      attrs: parseAttrs(match[1] || ''),
      inner: '',
      raw: match[0],
      selfClosing: true,
    });
  }

  return results;
}

function findAnyElements(xmlText, tags) {
  const seen = new Set();
  const out = [];

  for (const tag of tags) {
    for (const item of findElements(xmlText, tag)) {
      if (seen.has(item.raw)) continue;
      seen.add(item.raw);
      out.push(item);
    }
  }

  return out;
}

function parsePointText(value) {
  const text = clean(value);
  if (!text) return null;

  const parts = text
    .split(/[,\s|/]+/)
    .map(v => Number(v))
    .filter(v => Number.isFinite(v));

  if (parts.length < 3) return null;

  return { x: parts[0], y: parts[1], z: parts[2] };
}

function parsePointAttrs(attrs) {
  const x = numberOrNull(attrValue(attrs, 'x', 'X', 'e', 'E', 'east', 'EAST'));
  const y = numberOrNull(attrValue(attrs, 'y', 'Y', 'n', 'N', 'north', 'NORTH'));
  const z = numberOrNull(attrValue(attrs, 'z', 'Z', 'elev', 'ELEV', 'elevation', 'ELEVATION'));

  if (x == null || y == null || z == null) return null;

  return { x, y, z };
}

function parsePointFromAttrs(attrs, ...names) {
  for (const name of names) {
    const value = attrValue(attrs, name);
    const point = parsePointText(value);
    if (point) return point;
  }

  return null;
}

function parseTriplet(attrs, sets) {
  for (const [xName, yName, zName] of sets) {
    const x = numberOrNull(attrValue(attrs, xName));
    const y = numberOrNull(attrValue(attrs, yName));
    const z = numberOrNull(attrValue(attrs, zName));

    if (x != null && y != null && z != null) {
      return { x, y, z };
    }
  }

  return null;
}

function roleMatches(wanted, role) {
  const w = upper(wanted);
  const r = upper(role);

  if (!r) return false;
  if (r === w) return true;

  if (w === ANCHOR_ROLES.EP1) return ['END1', 'END_1', 'START', 'FROM', 'A'].includes(r);
  if (w === ANCHOR_ROLES.EP2) return ['END2', 'END_2', 'END', 'TO', 'B'].includes(r);
  if (w === ANCHOR_ROLES.CP) return ['CENTER', 'CENTRE', 'CENTERPOINT', 'CENTREPOINT', 'CENTER_POINT', 'CENTRE_POINT'].includes(r);
  if (w === ANCHOR_ROLES.BP) return ['BRANCH', 'BRANCHPOINT', 'BRANCH_POINT'].includes(r);
  if (w === ANCHOR_ROLES.SUPPORT_POINT) return ['SUPPORT', 'SUPPORTPOINT', 'SUPPORT_POINT', 'POS', 'POSITION'].includes(r);

  return false;
}

function childPoint(inner, role) {
  for (const tagName of POINT_TAGS) {
    for (const tag of findElements(inner, tagName)) {
      const attrs = tag.attrs;
      const tagRole = attrValue(attrs, 'role', 'name', 'key', 'type', 'kind');
      const point = parsePointAttrs(attrs) || parsePointText(tag.inner);

      if (!point) continue;

      if (roleMatches(role, tagRole)) {
        return point;
      }

      const tagUpper = upper(tag.tagName);

      if (role === ANCHOR_ROLES.CP && ['CENTREPOINT', 'CENTERPOINT'].includes(tagUpper)) return point;
      if (role === ANCHOR_ROLES.BP && tagUpper === 'BRANCHPOINT') return point;
      if (role === ANCHOR_ROLES.SUPPORT_POINT && ['SUPPORTPOINT', 'POS', 'POSITION'].includes(tagUpper)) return point;
    }
  }

  return null;
}

function detectComponentType(rawType, tagName = '') {
  const t = upper(`${rawType} ${tagName}`);

  if (!t) return COMPONENT_TYPES.UNKNOWN;
  if (t.includes('PIPE') && t.includes('SUPPORT')) return COMPONENT_TYPES.SUPPORT;
  if (t.includes('SUPPORT') || t === 'PS' || t.startsWith('PS-') || t.startsWith('PS_')) return COMPONENT_TYPES.SUPPORT;
  if (t.includes('TEE')) return COMPONENT_TYPES.TEE;
  if (t.includes('WELDOLET')) return COMPONENT_TYPES.WELDOLET;
  if (t.includes('SOCKOLET')) return COMPONENT_TYPES.SOCKOLET;
  if (t.includes('OLET')) return COMPONENT_TYPES.OLET;
  if (t.includes('BEND')) return COMPONENT_TYPES.BEND;
  if (t.includes('ELBOW')) return COMPONENT_TYPES.ELBOW;
  if (t.includes('VALVE')) return COMPONENT_TYPES.VALVE;
  if (t.includes('BLIND') && t.includes('FLANGE')) return COMPONENT_TYPES.BLIND_FLANGE;
  if (t.includes('FLANGE')) return COMPONENT_TYPES.FLANGE;
  if (t.includes('GASKET') || t.includes('GASK')) return COMPONENT_TYPES.GASKET;
  if (t.includes('REDUCER') && t.includes('ECC')) return COMPONENT_TYPES.REDUCER_ECCENTRIC;
  if (t.includes('REDUCER')) return COMPONENT_TYPES.REDUCER_CONCENTRIC;
  if (t.includes('CAP')) return COMPONENT_TYPES.CAP;
  if (t.includes('PIPE')) return COMPONENT_TYPES.PIPE;

  return clean(rawType || tagName || COMPONENT_TYPES.UNKNOWN).toUpperCase();
}

function portRoleFor(type, role) {
  const t = upper(type);
  const r = upper(role);

  if (t === COMPONENT_TYPES.PIPE) {
    if (r === ANCHOR_ROLES.EP1) return PORT_ROLES.PIPE_END_1;
    if (r === ANCHOR_ROLES.EP2) return PORT_ROLES.PIPE_END_2;
  }

  if (t === COMPONENT_TYPES.BEND || t === COMPONENT_TYPES.ELBOW) {
    if (r === ANCHOR_ROLES.EP1) return PORT_ROLES.BEND_END_1;
    if (r === ANCHOR_ROLES.EP2) return PORT_ROLES.BEND_END_2;
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

  if (t === COMPONENT_TYPES.GASKET) {
    if (r === ANCHOR_ROLES.EP1) return PORT_ROLES.GASKET_END_1;
    if (r === ANCHOR_ROLES.EP2) return PORT_ROLES.GASKET_END_2;
  }

  if (r === ANCHOR_ROLES.SUPPORT_POINT || r === ANCHOR_ROLES.POS) {
    return PORT_ROLES.SUPPORT_POINT;
  }

  if (r === ANCHOR_ROLES.EP1) return `${t}_END_1`;
  if (r === ANCHOR_ROLES.EP2) return `${t}_END_2`;

  return `${t}_${r}`;
}

function segmentTypeFor(type) {
  const t = upper(type);

  if (t === COMPONENT_TYPES.PIPE) return SEGMENT_TYPES.PIPE_RUN;
  if (t === COMPONENT_TYPES.TEE) return SEGMENT_TYPES.TEE_MAIN_RUN;
  if ([COMPONENT_TYPES.OLET, COMPONENT_TYPES.WELDOLET, COMPONENT_TYPES.SOCKOLET].includes(t)) {
    return SEGMENT_TYPES.OLET_BRANCH_LEG;
  }
  if (t === COMPONENT_TYPES.BEND || t === COMPONENT_TYPES.ELBOW) return SEGMENT_TYPES.BEND_CHORD;
  if (t === COMPONENT_TYPES.VALVE) return SEGMENT_TYPES.VALVE_AXIS;
  if (t.includes('FLANGE')) return SEGMENT_TYPES.FLANGE_AXIS;
  if (t.includes('REDUCER')) return SEGMENT_TYPES.REDUCER_AXIS;

  return '';
}

function ensurePipeline(doc, pipelineRef, lineNo = '', rawAttributes = {}) {
  const ref = clean(pipelineRef);
  if (!ref) return '';

  const existing = doc.pipelines.find(p => p.pipelineRef === ref);
  if (existing) return existing.id;

  const id = `SX-PL-${pad(doc.pipelines.length + 1)}`;

  doc.pipelines.push(createUxmlPipeline({
    id,
    pipelineRef: ref,
    lineKey: clean(lineNo || ref),
    lineNo: clean(lineNo),
    rawAttributes,
  }));

  return id;
}

function addDiagnostic(doc, overrides) {
  const diagnostic = createUxmlDiagnostic({
    id: `SX-D-${pad(doc.diagnostics.length + 1)}`,
    ...overrides,
  });

  doc.diagnostics.push(diagnostic);
  return diagnostic;
}

function addLoss(doc, overrides) {
  const loss = createUxmlLoss({
    id: `SX-L-${pad(doc.lossContract.length + 1)}`,
    ...overrides,
  });

  doc.lossContract.push(loss);
  return loss;
}

function addMapping(doc, sourceField, targetField) {
  doc.mappings.push(createUxmlMapping({
    id: `SX-MAP-${pad(doc.mappings.length + 1)}`,
    profile: XML_PROFILES.STANDARD_XML,
    sourceFormat: XML_PROFILES.STANDARD_XML,
    sourceField,
    targetField,
    confidence: CONFIDENCE_LEVELS.ALIASED_SOURCE,
  }));
}

function componentId(tag, index) {
  const attrs = tag.attrs;

  return safeId(
    attrValue(
      attrs,
      'id',
      'componentId',
      'component-id',
      'uid',
      'guid',
      'refNo',
      'ref-no',
      'ref',
      'tag',
      'name'
    ),
    `SX-C-${pad(index + 1)}`
  );
}

function makeComponent(tag, index, sourceId) {
  const attrs = tag.attrs;

  const explicitType = attrValue(
    attrs,
    'type',
    'componentType',
    'component-type',
    'kind',
    'class',
    'skey',
    'SKEY'
  ) || tag.tagName;

  const normalizedType = detectComponentType(explicitType, tag.tagName);

  const pipelineRef = attrValue(
    attrs,
    'pipelineRef',
    'pipeline-ref',
    'pipeline',
    'lineRef',
    'line-ref',
    'line',
    'lineNo',
    'line-no'
  );

  const lineNo = attrValue(
    attrs,
    'lineNo',
    'line-no',
    'lineKey',
    'line-key',
    'line'
  );

  return createUxmlComponent({
    id: componentId(tag, index),
    sourceRefs: [sourceId],
    type: clean(explicitType),
    normalizedType,
    pipelineRef,
    lineKey: clean(lineNo),
    refNo: attrValue(attrs, 'refNo', 'ref-no', 'CA97', 'ca97', 'ref'),
    seqNo: attrValue(attrs, 'seqNo', 'seq-no', 'CA98', 'ca98', 'sequence', 'number'),
    name: attrValue(attrs, 'name', 'tag', 'label'),
    bore: numberOrNull(attrValue(attrs, 'bore', 'convertedBore', 'diameter', 'size', 'nps', 'NPS')),
    branchBore: numberOrNull(attrValue(attrs, 'branchBore', 'branchConvertedBore', 'branchSize', 'branch-size')),
    skey: attrValue(attrs, 'skey', 'SKEY'),
    rawAttributes: {
      ...attrs,
      sourceTagName: tag.tagName,
    },
    confidence: CONFIDENCE_LEVELS.ALIASED_SOURCE,
  });
}

function extractPoints(tag) {
  const attrs = tag.attrs;
  const inner = tag.inner || '';

  return {
    ep1:
      parsePointFromAttrs(attrs, 'ep1', 'EP1', 'start', 'startPoint', 'start-point', 'fromPoint', 'from-point') ||
      parseTriplet(attrs, [
        ['ep1X', 'ep1Y', 'ep1Z'],
        ['EP1_X', 'EP1_Y', 'EP1_Z'],
        ['x1', 'y1', 'z1'],
        ['X1', 'Y1', 'Z1'],
        ['startX', 'startY', 'startZ'],
        ['fromX', 'fromY', 'fromZ'],
      ]) ||
      childPoint(inner, ANCHOR_ROLES.EP1),

    ep2:
      parsePointFromAttrs(attrs, 'ep2', 'EP2', 'end', 'endPoint', 'end-point', 'toPoint', 'to-point') ||
      parseTriplet(attrs, [
        ['ep2X', 'ep2Y', 'ep2Z'],
        ['EP2_X', 'EP2_Y', 'EP2_Z'],
        ['x2', 'y2', 'z2'],
        ['X2', 'Y2', 'Z2'],
        ['endX', 'endY', 'endZ'],
        ['toX', 'toY', 'toZ'],
      ]) ||
      childPoint(inner, ANCHOR_ROLES.EP2),

    cp:
      parsePointFromAttrs(attrs, 'cp', 'CP', 'center', 'centre', 'centerPoint', 'centrePoint', 'center-point', 'centre-point') ||
      parseTriplet(attrs, [
        ['cpX', 'cpY', 'cpZ'],
        ['CP_X', 'CP_Y', 'CP_Z'],
        ['centerX', 'centerY', 'centerZ'],
        ['centreX', 'centreY', 'centreZ'],
      ]) ||
      childPoint(inner, ANCHOR_ROLES.CP),

    bp:
      parsePointFromAttrs(attrs, 'bp', 'BP', 'branch', 'branchPoint', 'branch-point') ||
      parseTriplet(attrs, [
        ['bpX', 'bpY', 'bpZ'],
        ['BP_X', 'BP_Y', 'BP_Z'],
        ['branchX', 'branchY', 'branchZ'],
      ]) ||
      childPoint(inner, ANCHOR_ROLES.BP),

    supportPoint:
      parsePointFromAttrs(attrs, 'supportCoord', 'supportPoint', 'support-point', 'pos', 'POS', 'position') ||
      parseTriplet(attrs, [
        ['supportX', 'supportY', 'supportZ'],
        ['posX', 'posY', 'posZ'],
        ['x', 'y', 'z'],
        ['X', 'Y', 'Z'],
      ]) ||
      childPoint(inner, ANCHOR_ROLES.SUPPORT_POINT),
  };
}

function addAnchorPort(doc, component, role, point, sourceField, connectsTo = 'ENDPOINT') {
  if (!point) return null;

  const anchorId = `SX-A-${component.id}-${role}`;
  const portRole = portRoleFor(component.normalizedType || component.type, role);
  const portId = `SX-P-${component.id}-${portRole}`;

  const isPipeEndpoint =
    component.normalizedType === COMPONENT_TYPES.PIPE &&
    [ANCHOR_ROLES.EP1, ANCHOR_ROLES.EP2].includes(role);

  const anchor = createUxmlAnchor({
    id: anchorId,
    componentId: component.id,
    role,
    point,
    sourceField,
    confidence: CONFIDENCE_LEVELS.ALIASED_SOURCE,
  });

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
    connectsTo,
    maxDegree: 1,
  });

  doc.anchors.push(anchor);
  doc.ports.push(port);

  component.anchorIds.push(anchorId);
  component.portIds.push(portId);

  return { anchor, port };
}

function addSegmentIfPossible(doc, component, startRole = ANCHOR_ROLES.EP1, endRole = ANCHOR_ROLES.EP2) {
  const startAnchorId = `SX-A-${component.id}-${startRole}`;
  const endAnchorId = `SX-A-${component.id}-${endRole}`;

  const hasStart = doc.anchors.some(a => a.id === startAnchorId);
  const hasEnd = doc.anchors.some(a => a.id === endAnchorId);

  if (!hasStart || !hasEnd) return null;

  const type = segmentTypeFor(component.normalizedType || component.type);
  if (!type) return null;

  const segment = createUxmlSegment({
    id: `SX-S-${component.id}-001`,
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

  const support = createUxmlSupport({
    id: `SX-SUP-${component.id}`,
    componentId: component.id,
    type: clean(component.rawAttributes.supportType || component.rawAttributes.type || component.type || 'SUPPORT'),
    skey: component.skey,
    supportAnchorId,
  });

  doc.supports.push(support);
  component.supportId = support.id;
}

function mapComponent(doc, tag, index, sourceId) {
  const component = makeComponent(tag, index, sourceId);
  const points = extractPoints(tag);

  ensurePipeline(doc, component.pipelineRef, component.lineKey, component.rawAttributes);

  if (component.normalizedType === COMPONENT_TYPES.SUPPORT) {
    addAnchorPort(
      doc,
      component,
      ANCHOR_ROLES.SUPPORT_POINT,
      points.supportPoint || points.ep1 || points.cp,
      `${tag.tagName}:supportPoint`,
      'SEGMENT'
    );

    addSupportIfNeeded(doc, component);
    doc.components.push(component);

    if (!component.anchorIds.length) {
      addLoss(doc, {
        severity: 'WARNING',
        code: 'UXML-STANDARDXML-SUPPORT-POINT-MISSING',
        componentId: component.id,
        sourceId,
        message: `Support ${component.id} has no support coordinate.`,
        details: component.rawAttributes,
      });
    }

    return component;
  }

  addAnchorPort(doc, component, ANCHOR_ROLES.EP1, points.ep1, `${tag.tagName}:EP1`);
  addAnchorPort(doc, component, ANCHOR_ROLES.EP2, points.ep2, `${tag.tagName}:EP2`);

  const cpConnectsTo =
    [COMPONENT_TYPES.OLET, COMPONENT_TYPES.WELDOLET, COMPONENT_TYPES.SOCKOLET].includes(component.normalizedType)
      ? 'SEGMENT'
      : 'ENDPOINT';

  addAnchorPort(doc, component, ANCHOR_ROLES.CP, points.cp, `${tag.tagName}:CP`, cpConnectsTo);
  addAnchorPort(doc, component, ANCHOR_ROLES.BP, points.bp, `${tag.tagName}:BP`, 'ENDPOINT');

  addSegmentIfPossible(doc, component);

  if (!component.anchorIds.length) {
    addLoss(doc, {
      severity: 'WARNING',
      code: 'UXML-STANDARDXML-COMPONENT-ANCHORS-MISSING',
      componentId: component.id,
      sourceId,
      message: `Standard XML component ${component.id} was extracted but no coordinates were mapped.`,
      details: component.rawAttributes,
    });
  }

  if (component.normalizedType === COMPONENT_TYPES.TEE && !points.bp) {
    addLoss(doc, {
      severity: 'WARNING',
      code: 'UXML-STANDARDXML-TEE-BP-MISSING',
      componentId: component.id,
      sourceId,
      message: `TEE ${component.id} has no branch point.`,
      details: component.rawAttributes,
    });
  }

  if (
    [COMPONENT_TYPES.OLET, COMPONENT_TYPES.WELDOLET, COMPONENT_TYPES.SOCKOLET].includes(component.normalizedType) &&
    (!points.cp || !points.bp)
  ) {
    addLoss(doc, {
      severity: 'WARNING',
      code: 'UXML-STANDARDXML-OLET-CP-BP-INCOMPLETE',
      componentId: component.id,
      sourceId,
      message: `OLET ${component.id} requires CP and BP for robust branch topology.`,
      details: component.rawAttributes,
    });
  }

  doc.components.push(component);
  return component;
}

function mapperStats(doc, before) {
  return {
    componentCount: doc.components.length - before.components,
    anchorCount: doc.anchors.length - before.anchors,
    portCount: doc.ports.length - before.ports,
    segmentCount: doc.segments.length - before.segments,
    supportCount: doc.supports.length - before.supports,
    diagnosticCount: doc.diagnostics.length - before.diagnostics,
    lossCount: doc.lossContract.length - before.lossContract,
  };
}

export function mapStandardXmlToUxml(xmlText, doc, sourceId, options = {}) {
  const text = String(xmlText ?? '');

  const before = {
    components: doc.components.length,
    anchors: doc.anchors.length,
    ports: doc.ports.length,
    segments: doc.segments.length,
    supports: doc.supports.length,
    diagnostics: doc.diagnostics.length,
    lossContract: doc.lossContract.length,
  };

  addMapping(doc, 'STANDARD_XML.Component/Pipe/Fitting', 'components[]');
  addMapping(doc, 'STANDARD_XML.EP1/EP2/CP/BP', 'anchors[]');
  addMapping(doc, 'STANDARD_XML.Component anchors', 'ports[]/segments[]');

  const componentTags = findAnyElements(text, COMPONENT_TAGS);

  addDiagnostic(doc, {
    severity: 'INFO',
    code: 'UXML-STANDARDXML-MAPPER-STARTED',
    sourceId,
    message: `Started Standard XML mapper. Candidate component tags=${componentTags.length}.`,
    details: {
      fileName: options.fileName || options.name || '',
      selectedSourceType: options.selectedSourceType || '',
    },
  });

  componentTags.forEach((tag, index) => {
    mapComponent(doc, tag, index, sourceId);
  });

  if (!componentTags.length) {
    addLoss(doc, {
      severity: 'WARNING',
      code: 'UXML-STANDARDXML-MAPPER-NO-COMPONENT-TAGS',
      sourceId,
      message: 'Standard XML mapper did not find known component tags. Add schema-specific mapping for this source.',
      details: {
        knownTags: COMPONENT_TAGS,
      },
    });
  }

  const stats = mapperStats(doc, before);

  if (stats.componentCount === 0) {
    addDiagnostic(doc, {
      severity: 'WARNING',
      code: 'UXML-STANDARDXML-MAPPER-ZERO-COMPONENTS',
      sourceId,
      message: 'Standard XML profile was accepted, but no components were mapped.',
      details: stats,
    });
  } else {
    addDiagnostic(doc, {
      severity: 'INFO',
      code: 'UXML-STANDARDXML-MAPPER-COMPLETED',
      sourceId,
      message: `Mapped Standard XML components=${stats.componentCount}, anchors=${stats.anchorCount}, ports=${stats.portCount}, segments=${stats.segmentCount}.`,
      details: stats,
    });
  }

  return {
    schema: UXML_STANDARD_XML_SCHEMA_MAPPER_SCHEMA,
    ok: stats.componentCount > 0,
    candidateTagCount: componentTags.length,
    stats: mapperStats(doc, before),
    doc,
  };
}

export const mapGenericXmlToUxml = mapStandardXmlToUxml;
export const mapStandardXmlSchemaToUxml = mapStandardXmlToUxml;