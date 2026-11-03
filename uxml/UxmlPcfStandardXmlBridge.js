/**
 * UxmlPcfStandardXmlBridge.js
 *
 * Converts PCF text into Standard XML for UXML normalization.
 *
 * Boundary:
 * - Does not generate PCF.
 * - Does not resolve masters.
 * - Does not run topology.
 * - Does not pretend PCF is CAESAR InputXML.
 */

export const UXML_PCF_STANDARD_XML_BRIDGE_SCHEMA =
  'uxml-pcf-standardxml-bridge/v1';

export const UXML_PCF_STANDARD_XML_PROFILE =
  'standard-xml/pcf-bridge/v1';

const COMPONENT_TAG_BY_PCF_KEY = Object.freeze({
  PIPE: 'Pipe',
  BEND: 'Bend',
  ELBOW: 'Elbow',
  VALVE: 'Valve',
  FLANGE: 'Flange',
  GASKET: 'Gasket',
  GASK: 'Gasket',
  REDUCER: 'Reducer',
  'REDUCER-CONCENTRIC': 'ReducerConcentric',
  'REDUCER-ECCENTRIC': 'ReducerEccentric',
  TEE: 'Tee',
  OLET: 'Olet',
  WELDOLET: 'Weldolet',
  SOCKOLET: 'Sockolet',
  CAP: 'Cap',
  SUPPORT: 'Support',
});

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function pad(value) {
  return String(value).padStart(5, '0');
}

function escXml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function safeId(value, fallback) {
  return clean(value || fallback)
    .replace(/[^\w:.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function firstToken(line) {
  return upper(clean(line).split(/\s+/)[0] || '');
}

function parseNumbers(value) {
  return clean(value)
    .split(/[\s,|/]+/)
    .map(Number)
    .filter(Number.isFinite);
}

function parsePoint(value) {
  const nums = parseNumbers(value);
  if (nums.length < 3) return null;
  return {
    x: nums[0],
    y: nums[1],
    z: nums[2],
    bore: Number.isFinite(nums[3]) ? nums[3] : null,
  };
}

function pointValue(point) {
  if (!point) return '';
  return `${point.x},${point.y},${point.z}`;
}

function isComponentLine(line) {
  return Boolean(COMPONENT_TAG_BY_PCF_KEY[firstToken(line)]);
}

function componentTag(line) {
  return COMPONENT_TAG_BY_PCF_KEY[firstToken(line)] || 'Component';
}

function componentType(line) {
  return firstToken(line) || 'COMPONENT';
}

function parsePipelineReference(line) {
  const match = clean(line).match(/^PIPELINE-REFERENCE\s+(.+)$/i);
  return match ? clean(match[1]) : '';
}

function parseAttributeLine(line) {
  const text = clean(line);
  const match = text.match(/^([A-Z0-9_.-]+)\s+(.+)$/i);
  if (!match) return null;

  const key = upper(match[1]);
  const value = clean(match[2]);

  if (!key || !value) return null;

  return { key, value };
}

function createComponent({ line, index, pipelineRef }) {
  const type = componentType(line);

  return {
    id: `PCF-${safeId(type, 'COMP')}-${pad(index)}`,
    tag: componentTag(line),
    type,
    name: clean(line),
    pipelineRef,
    bore: null,
    branchBore: null,
    ep1: null,
    ep2: null,
    cp: null,
    bp: null,
    endPoints: [],
    supportCoord: null,
    attributes: {},
    rawLines: [line],
  };
}

function assignEndpoint(component, point) {
  if (!point) return;
  component.endPoints.push(point);

  const componentHasBore = Number.isFinite(Number(component.bore)) && Number(component.bore) > 0;
  if (!componentHasBore && Number.isFinite(Number(point.bore)) && Number(point.bore) > 0) {
    component.bore = Number(point.bore);
  }
}

function assignSpecialPoint(component, role, point) {
  if (!point) return;

  if (role === 'CP') component.cp = point;
  else if (role === 'BP') {
    component.bp = point;
    if (Number.isFinite(Number(point.bore))) {
      component.branchBore = Number(point.bore);
    }
  }
  else if (role === 'SUPPORT') component.supportCoord = point;
  else assignEndpoint(component, point);
}

function isBranchType(type) {
  const t = upper(type || '');
  return t === 'TEE' || t === 'OLET' || t.includes('TEE') || t.includes('OLET');
}

function finalizeComponent(component) {
  const points = Array.isArray(component.endPoints) ? component.endPoints.filter(Boolean) : [];
  component.ep1 = points[0] || component.ep1 || null;
  component.ep2 = points[1] || component.ep2 || null;

  if (!component.bp && isBranchType(component.type) && points.length >= 3) {
    component.bp = points[2];
    if (Number.isFinite(Number(points[2].bore))) {
      component.branchBore = Number(points[2].bore);
    }
  }

  const componentHasBore = Number.isFinite(Number(component.bore)) && Number(component.bore) > 0;
  if (!componentHasBore && Number.isFinite(Number(component.ep1?.bore)) && Number(component.ep1.bore) > 0) {
    component.bore = Number(component.ep1.bore);
  }
}

function pointAttrs(component) {
  const attrs = [];

  if (component.ep1) attrs.push(`ep1="${escXml(pointValue(component.ep1))}"`);
  if (component.ep2) attrs.push(`ep2="${escXml(pointValue(component.ep2))}"`);
  if (component.cp) attrs.push(`cp="${escXml(pointValue(component.cp))}"`);
  if (component.bp) attrs.push(`bp="${escXml(pointValue(component.bp))}"`);
  if (component.supportCoord) attrs.push(`supportCoord="${escXml(pointValue(component.supportCoord))}"`);

  return attrs;
}

function pointChildren(component) {
  const children = [];

  if (component.ep1) {
    children.push(`<EndPoint role="EP1" x="${component.ep1.x}" y="${component.ep1.y}" z="${component.ep1.z}"${Number.isFinite(Number(component.ep1.bore)) ? ` bore="${component.ep1.bore}"` : ''}/>`);
  }

  if (component.ep2) {
    children.push(`<EndPoint role="EP2" x="${component.ep2.x}" y="${component.ep2.y}" z="${component.ep2.z}"${Number.isFinite(Number(component.ep2.bore)) ? ` bore="${component.ep2.bore}"` : ''}/>`);
  }

  if (component.cp) {
    children.push(`<CentrePoint role="CP" x="${component.cp.x}" y="${component.cp.y}" z="${component.cp.z}"/>`);
  }

  if (component.bp) {
    children.push(`<BranchPoint role="BP" x="${component.bp.x}" y="${component.bp.y}" z="${component.bp.z}"${Number.isFinite(Number(component.bp.bore)) ? ` bore="${component.bp.bore}"` : ''}/>`);
  }

  if (component.supportCoord) {
    children.push(`<SupportPoint role="SUPPORT_POINT" x="${component.supportCoord.x}" y="${component.supportCoord.y}" z="${component.supportCoord.z}"/>`);
  }

  return children;
}

function attributesChildren(component) {
  return Object.entries(component.attributes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `<Attribute key="${escXml(key)}" value="${escXml(value)}"/>`);
}

function componentToStandardXml(component) {
  const bore = Number(component.bore);
  const branchBore = Number(component.branchBore);
  const attrs = [
    `id="${escXml(component.id)}"`,
    `type="${escXml(component.type)}"`,
    `name="${escXml(component.name)}"`,
    `pipelineRef="${escXml(component.pipelineRef)}"`,
    ...pointAttrs(component),
  ];
  if (Number.isFinite(bore) && bore > 0) attrs.push(`bore="${bore}"`);
  if (Number.isFinite(branchBore) && branchBore > 0) attrs.push(`branchBore="${branchBore}"`);

  const children = [
    ...pointChildren(component),
    ...attributesChildren(component),
  ];

  return `<${component.tag} ${attrs.join(' ')}>${children.join('')}</${component.tag}>`;
}

export function convertPcfTextToStandardXml(pcfText, options = {}) {
  const text = String(pcfText || '');
  const lines = text.split(/\r?\n/);
  const fileName = clean(options.fileName || '');

  let pipelineRef = clean(options.defaultPipelineRef || '/PCF-IMPORT');
  const components = [];
  let current = null;

  for (const rawLine of lines) {
    const line = clean(rawLine);
    if (!line) continue;

    const parsedPipelineRef = parsePipelineReference(line);
    if (parsedPipelineRef) {
      pipelineRef = parsedPipelineRef;
      if (current && !current.pipelineRef) current.pipelineRef = pipelineRef;
      continue;
    }

    if (isComponentLine(line)) {
      if (current) {
        finalizeComponent(current);
        components.push(current);
      }
      current = createComponent({
        line,
        index: components.length + 1,
        pipelineRef,
      });
      continue;
    }

    if (!current) continue;

    current.rawLines.push(line);

    if (/^END-POINT\b/i.test(line)) {
      assignSpecialPoint(current, 'EP', parsePoint(line.replace(/^END-POINT\b/i, '')));
      continue;
    }

    if (/^(CENTRE-POINT|CENTER-POINT)\b/i.test(line)) {
      assignSpecialPoint(current, 'CP', parsePoint(line.replace(/^(CENTRE-POINT|CENTER-POINT)\b/i, '')));
      continue;
    }

    if (/^(BRANCH1-POINT|BRANCH-POINT|BRANCH_POINT|BRANCH1_POINT)\b/i.test(line)) {
      assignSpecialPoint(current, 'BP', parsePoint(line.replace(/^(BRANCH1-POINT|BRANCH-POINT|BRANCH_POINT|BRANCH1_POINT)\b/i, '')));
      continue;
    }

    if (/^(SUPPORT-POINT|SUPPORT-COORD|SUPPORT-COORDINATE|CO-ORDS|CO_ORDS)\b/i.test(line)) {
      assignSpecialPoint(current, 'SUPPORT', parsePoint(line.replace(/^(SUPPORT-POINT|SUPPORT-COORD|SUPPORT-COORDINATE|CO-ORDS|CO_ORDS)\b/i, '')));
      continue;
    }

    const attr = parseAttributeLine(line);
    if (attr) current.attributes[attr.key] = attr.value;
  }

  if (current) {
    finalizeComponent(current);
    components.push(current);
  }

  const standardXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Project schema="${UXML_PCF_STANDARD_XML_PROFILE}" sourceFormat="PCF" sourceFile="${escXml(fileName)}">`,
    `  <Pipeline id="P-00001" pipelineRef="${escXml(pipelineRef)}">`,
    components.map(component => `    ${componentToStandardXml(component)}`).join('\n'),
    '  </Pipeline>',
    '</Project>',
  ].join('\n');

  return {
    schema: UXML_PCF_STANDARD_XML_BRIDGE_SCHEMA,
    ok: true,
    sourceFormat: 'PCF',
    targetProfile: 'STANDARD_XML',
    pipelineRef,
    componentCount: components.length,
    components,
    standardXml,
    generatedPcf: false,
    pcfTextByPipelineRef: undefined,
    masterResolution: undefined,
    masterResolutionRequests: undefined,
  };
}

export const bridgePcfToStandardXml = convertPcfTextToStandardXml;
