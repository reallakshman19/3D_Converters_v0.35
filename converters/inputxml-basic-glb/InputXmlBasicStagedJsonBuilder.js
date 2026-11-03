function clean(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const raw = typeof value === 'object' && value ? value.value : value;
  const n = Number(String(raw ?? '').replace(/,/g, '').replace(/mm/gi, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const x = num(value.x, NaN);
  const y = num(value.y, NaN);
  const z = num(value.z, NaN);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function formatMm(value, fallback = 100) {
  const n = num(value, fallback);
  if (!Number.isFinite(n) || n <= 0) return `${fallback}mm`;
  return `${Number.isInteger(n) ? n : Number(n.toFixed(3))}mm`;
}

function directionalPoint(p) {
  const coord = point(p);
  if (!coord) return '';
  const ew = coord.x >= 0 ? `E ${coord.x}` : `W ${Math.abs(coord.x)}`;
  const ns = coord.y >= 0 ? `N ${coord.y}` : `S ${Math.abs(coord.y)}`;
  const ud = coord.z >= 0 ? `U ${coord.z}` : `D ${Math.abs(coord.z)}`;
  return `${ew}mm ${ns}mm ${ud}mm`;
}

function normalizeType(element = {}) {
  const raw = clean(element.rawType || element.type || element.props?.type || 'PIPE').toUpperCase().replace(/\s+/g, '_');
  const rigid = clean(element.props?.rigidType || '').toUpperCase();
  const text = `${raw} ${rigid}`;
  if (/BEND|ELBO/.test(text)) return 'BEND';
  if (/VALVE|VALV/.test(text)) return 'VALV';
  if (/FLANGE|FLAN/.test(text)) return 'FLAN';
  if (/GASK/.test(text)) return 'GASK';
  if (/REDU/.test(text)) return 'REDU';
  if (/TEE/.test(text)) return 'TEE';
  if (/OLET/.test(text)) return 'OLET';
  if (/INST|INSTRUMENT/.test(text)) return 'INST';
  return 'PIPE';
}

function branchNameForModel(sourceName = '') {
  const stem = clean(sourceName).replace(/\.[^.]+$/, '') || 'InputXML';
  return `/INPUTXML/${stem}/BRANCH-001`;
}

function tangentForElement(element = {}) {
  const dx = num(element.dx, 0);
  const dy = num(element.dy, 0);
  const dz = num(element.dz, 0);
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length <= 1e-9) return { x: 1, y: 0, z: 0 };
  return { x: dx / length, y: dy / length, z: dz / length };
}

function axisText(axis = {}) {
  const x = Math.abs(num(axis.x, 0));
  const y = Math.abs(num(axis.y, 0));
  const z = Math.abs(num(axis.z, 0));
  if (x >= y && x >= z) return 'X';
  if (y >= x && y >= z) return 'Y';
  return 'Z';
}

function pipeAxisAtNode(model, nodeId) {
  const key = String(Number(nodeId));
  const element = (model.elements || []).find((item) => String(Number(item.fromNode)) === key || String(Number(item.toNode)) === key);
  return tangentForElement(element || {});
}

function boreAtNode(model, nodeId) {
  const key = String(Number(nodeId));
  const element = (model.elements || []).find((item) => String(Number(item.fromNode)) === key || String(Number(item.toNode)) === key);
  return formatMm(element?.props?.bore ?? element?.props?.boreMm, 100);
}

function supportKindFromRestraint(restraint = {}, model) {
  const typeText = clean(restraint.typeCode || restraint.rawType).toUpperCase();
  if (/ANCHOR|FIX|^0$/.test(typeText)) return 'ANCHOR';
  if (/GUIDE|\bGUI\b|^7$/.test(typeText)) return 'GUIDE';
  if (/LINE\s*STOP|LINESTOP|STOP|^10$/.test(typeText)) return 'LINESTOP';
  if (/LIMIT|\bLIM\b/.test(typeText)) return 'LIMIT';
  if (/SPRING|HANGER/.test(typeText)) return 'SPRING';
  if (/REST|SHOE|^17$|^2$/.test(typeText)) return 'REST';

  const axis = { x: num(restraint.xCos, 0), y: num(restraint.yCos, 0), z: num(restraint.zCos, 0) };
  if (Math.abs(axis.y) > 0.75) return 'REST';
  const pipeAxis = pipeAxisAtNode(model, restraint.node);
  const alignment = Math.abs(axis.x * pipeAxis.x + axis.y * pipeAxis.y + axis.z * pipeAxis.z);
  if (alignment > 0.72) return 'LINESTOP';
  if (Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z) > 0.2) return 'GUIDE';
  return 'REST';
}

function supportAxisFromKind(kind, pipeAxis) {
  if (kind === 'REST' || kind === 'SPRING') return 'Y';
  if (kind === 'GUIDE') return 'PIPE_NORMAL';
  if (kind === 'LINESTOP' || kind === 'LIMIT') return `PIPE_AXIS_${axisText(pipeAxis)}`;
  if (kind === 'ANCHOR') return 'XYZ';
  return 'SUPPORT';
}

function componentNodeFromElement(element, owner, index) {
  const type = normalizeType(element);
  const attrs = {
    TYPE: type,
    RAW_TYPE: clean(element.rawType || element.type || type),
    NAME: clean(element.props?.refNo || element.id || `${type}-${index + 1}`),
    REF: clean(element.props?.id || element.id || `${index + 1}`),
    OWNER: owner,
    SOURCE_FORMAT: 'INPUTXML_BASIC_GLB_STAGED',
    SOURCE_CONVERTER: 'INPUTXML->GLB',
    SOURCE_ELEMENT_ID: clean(element.id),
    LINE_NO: clean(element.props?.lineNo || ''),
    LINE_NO_SOURCE: clean(element.props?.lineNoSource || ''),
    FROM_NODE: clean(element.fromNode),
    TO_NODE: clean(element.toNode),
    APOS: point(element.from),
    LPOS: point(element.to),
    ABORE: formatMm(element.props?.bore ?? element.props?.boreMm, 100),
    LBORE: formatMm(element.props?.bore ?? element.props?.boreMm, 100),
    BORE: formatMm(element.props?.bore ?? element.props?.boreMm, 100),
    DIAMETER: formatMm(element.props?.bore ?? element.props?.boreMm, 100),
    DTXR: clean(element.props?.type || element.rawType || type),
    MATERIAL: clean(element.props?.material?.value ?? element.props?.material ?? ''),
    WALL_THICK: clean(element.props?.wallThickness?.value ?? element.props?.wallThickness ?? ''),
    PRESSURE1: clean(element.props?.pressure?.value ?? element.props?.pressure ?? ''),
    TEMP_EXP_C1: clean(element.props?.temp1?.value ?? element.props?.temp1 ?? ''),
    BEND_RADIUS: clean(element.props?.bendRadius || ''),
    BEND_ANGLE: clean(element.props?.bendAngle || ''),
  };
  return {
    name: `${type} ${attrs.NAME}`.trim(),
    type,
    attributes: attrs,
  };
}

function supportNodeFromRestraint(restraint, model, owner, index) {
  const node = model.nodes?.get?.(String(Number(restraint.node))) || null;
  const pos = point(node);
  if (!pos) return null;
  const kind = supportKindFromRestraint(restraint, model);
  const pipeAxis = pipeAxisAtNode(model, restraint.node);
  const pipeBore = boreAtNode(model, restraint.node);
  const tag = `INPUTXML-${String(restraint.node).replace(/\D+/g, '') || index + 1}-${kind}`;
  const attrs = {
    TYPE: 'ATTA',
    RAW_TYPE: 'ATTA',
    NAME: tag,
    REF: clean(restraint.id || tag),
    OWNER: owner,
    SOURCE_FORMAT: 'INPUTXML_BASIC_GLB_STAGED',
    SOURCE_CONVERTER: 'INPUTXML->GLB',
    SOURCE_RESTRAINT_ID: clean(restraint.id),
    SOURCE_RESTRAINT_TYPE: clean(restraint.typeCode || restraint.rawType),
    SUPPORT_TAG: tag,
    SUPPORT_KIND: kind,
    SUPPORT_MAPPER_KIND: kind,
    SUPPORT_TYPE: kind,
    CMPSUPTYPE: kind,
    MDSSUPPTYPE: kind,
    NODE: clean(restraint.node),
    POS: pos,
    SUPPORTCOORD: pos,
    SUPPORT_COORD: pos,
    LBOP: directionalPoint(pos),
    PIPE_AXIS: axisText(pipeAxis),
    ROUTE_AXIS: axisText(pipeAxis),
    SUPPORT_DIRECTION: supportAxisFromKind(kind, pipeAxis),
    ATTACHED_PIPE_BORE: pipeBore,
    ATTACHED_PIPE_OD: pipeBore,
    SUPPORT_GAP_MM: restraint.gapMm ?? '',
    GAP: restraint.gapMm ?? '',
    X_COSINE: restraint.xCos ?? '',
    Y_COSINE: restraint.yCos ?? '',
    Z_COSINE: restraint.zCos ?? '',
  };
  return {
    name: `SUPPORT ${tag}`,
    type: 'ATTA',
    attributes: attrs,
  };
}

export function buildInputXmlManagedStageJson(model, options = {}) {
  const sourceName = clean(options.sourceName || 'input.xml');
  const owner = branchNameForModel(sourceName);
  const children = [];

  for (const [index, element] of (model?.elements || []).entries()) {
    children.push(componentNodeFromElement(element, owner, index));
  }

  for (const [index, restraint] of (model?.restraints || []).entries()) {
    const support = supportNodeFromRestraint(restraint, model, owner, index);
    if (support) children.push(support);
  }

  const firstElement = model?.elements?.[0];
  const lastElement = model?.elements?.[model.elements.length - 1];
  const hierarchy = [{
    name: owner,
    type: 'BRANCH',
    attributes: {
      TYPE: 'BRAN',
      NAME: owner,
      OWNER: '/INPUTXML',
      SOURCE_FORMAT: 'INPUTXML_BASIC_GLB_STAGED',
      SOURCE_CONVERTER: 'INPUTXML->GLB',
      SOURCE_FILE: sourceName,
      HPOS: point(firstElement?.from),
      TPOS: point(lastElement?.to),
      HBORE: formatMm(firstElement?.props?.bore ?? firstElement?.props?.boreMm, 100),
      TBORE: formatMm(lastElement?.props?.bore ?? lastElement?.props?.boreMm, 100),
    },
    children,
  }];

  return {
    schema: 'inputxml-managed-stage/v1',
    profile: 'AVEVA_JSON_FOR_3D_RVM_VIEWER',
    source: sourceName,
    converter: 'INPUTXML->GLB',
    generatedAt: new Date().toISOString(),
    units: { length: 'mm' },
    stats: {
      components: model?.elements?.length || 0,
      restraints: model?.restraints?.length || 0,
      branches: 1,
      children: children.length,
    },
    hierarchy,
  };
}
