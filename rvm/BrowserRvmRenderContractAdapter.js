export const BROWSER_RVM_RENDER_INSTRUCTION_SCHEMA = 'rvm-browser-render-instructions/v6-rvm-support-runtime-retired';

const INTERNAL_ATTRIBUTE_PREFIXES = Object.freeze([
  'BROWSER_RVM_',
  'RVM_BROWSER_',
  'RVM_BINARY_',
  'RVM_GEOMETRY_',
  'RVM_RECORD_',
  'RVM_PRIMITIVE_',
  'RVM_OWNER_',
  'RVM_SOURCE_'
]);

const INTERNAL_ATTRIBUTE_NAMES = Object.freeze(new Set([
  'TYPE',
  'RVM_BROWSER_ATT_ENRICHED',
  'RVM_BROWSER_ATT_ENRICHER_SCHEMA',
  'RVM_BROWSER_ATT_OWNER_QUERY',
  'RVM_BROWSER_ATT_ATTRIBUTE_COUNT'
]));

const EMBEDDED_INPUTXML_MARKER_RE = /\bINPUTXML[-_ ]?\d+[-_ ]?(REST|GUIDE|LINE\s*STOP|LINESTOP|STOP|LIMIT|LIM|SUPPORT|SHOE)\b/i;
const EMBEDDED_INPUTXML_MARKER_DEBUG_KEY = 'rvm.debug.showEmbeddedInputXmlSupportMarkers';

export function collectBrowserRvmRenderInstructions(roots = []) {
  const list = [];
  const diagnostics = {
    embeddedInputXmlSupportMarkerSkippedCount: 0,
    embeddedInputXmlSupportMarkerDebugEnabled: embeddedInputXmlMarkerDebugEnabled()
  };

  const walk = (node, path = '') => {
    if (!node || typeof node !== 'object') return;
    const name = String(node.name || node.id || 'RVM Node').trim() || 'RVM Node';
    const nodePath = path ? `${path}/${name}` : name;
    const attrs = node.attributes || {};
    const primitive = String(attrs.RVM_BROWSER_RENDER_PRIMITIVE || '').trim();

    if (primitive && primitive !== 'UNSUPPORTED') {
      const attributes = cloneSerializableAttributes(attrs);
      const att = summarizeBrowserRvmAtt(attrs);
      const attAttributes = extractBrowserRvmAttAttributes(attrs, att.enriched);
      const markerPolicy = embeddedInputXmlMarkerPolicyFor({ node, attrs, attAttributes, nodePath });
      if (markerPolicy.hide) {
        diagnostics.embeddedInputXmlSupportMarkerSkippedCount += 1;
      } else {
        const sourceType = String(attrs.TYPE || node.type || 'UNKNOWN');
        const sourceKind = String(attrs.RVM_PRIMITIVE_KIND || attrs.RVM_BROWSER_PRIMITIVE_CLASS || attrs.TYPE || node.type || 'UNKNOWN');
        list.push({
          schemaVersion: BROWSER_RVM_RENDER_INSTRUCTION_SCHEMA,
          sourcePath: nodePath,
          sourceName: name,
          displayName: displayNameForNode(name, attrs, attAttributes),
          type: sourceType,
          kind: sourceKind,
          renderPrimitive: primitive,
          renderSource: String(attrs.RVM_BROWSER_RENDER_SOURCE || 'unknown'),
          contractVersion: String(attrs.RVM_BROWSER_GEOMETRY_CONTRACT_VERSION || ''),
          center: parseVec3(attrs.RVM_BROWSER_CENTER),
          axisStart: parseVec3(attrs.RVM_BROWSER_AXIS_START),
          axisEnd: parseVec3(attrs.RVM_BROWSER_AXIS_END),
          length: finiteNumber(attrs.RVM_BROWSER_LENGTH),
          radius: finiteNumber(attrs.RVM_BROWSER_RADIUS),
          diameter: finiteNumber(attrs.RVM_BROWSER_DIAMETER),
          bbox: attrs.RVM_BROWSER_BBOX || attrs.RVM_BROWSER_RAW_BBOX || '',
          attributes,
          att,
          attAttributes
        });
      }
    }

    for (const child of Array.isArray(node.children) ? node.children : []) walk(child, nodePath);
  };

  for (const root of Array.isArray(roots) ? roots : [roots]) walk(root, '');
  return {
    schemaVersion: BROWSER_RVM_RENDER_INSTRUCTION_SCHEMA,
    count: list.length,
    instructions: list,
    diagnostics: summarize(list, diagnostics)
  };
}

function embeddedInputXmlMarkerPolicyFor({ node, attrs = {}, attAttributes = {}, nodePath = '' } = {}) {
  const text = [
    nodePath,
    node?.name,
    node?.id,
    node?.type,
    attrs.NAME,
    attrs.TYPE,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_PRIMITIVE_KIND,
    attrs.RVM_BROWSER_PRIMITIVE_CLASS,
    attAttributes.NAME,
    attAttributes.TAG,
    attAttributes.CMPSUPTYPE,
    attAttributes.MDSSUPPTYPE,
    attAttributes.DTXR,
    attAttributes.SKEY,
    attAttributes.DESCRIPTION,
    attAttributes.DESC,
  ].map((value) => String(value || '')).join(' ');
  const matched = EMBEDDED_INPUTXML_MARKER_RE.test(text);
  // Embedded InputXML/support markers now render by DEFAULT. Hiding is opt-in only (set
  // localStorage 'rvm.debug.hideEmbeddedInputXmlSupportMarkers' === 'true'); the legacy
  // default-hide behaviour dropped real, valid support geometry from the scene.
  return {
    matched,
    hide: matched && embeddedInputXmlMarkerForceHideEnabled(),
    debugKey: EMBEDDED_INPUTXML_MARKER_DEBUG_KEY
  };
}

function embeddedInputXmlMarkerDebugEnabled() {
  try {
    return globalThis?.localStorage?.getItem?.(EMBEDDED_INPUTXML_MARKER_DEBUG_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function embeddedInputXmlMarkerForceHideEnabled() {
  try {
    return globalThis?.localStorage?.getItem?.('rvm.debug.hideEmbeddedInputXmlSupportMarkers') === 'true';
  } catch (_) {
    return false;
  }
}

function summarize(list, seed = {}) {
  const contractCounts = {};
  const kindCounts = {};
  const sourceCounts = {};
  const attCounts = { enriched: 0, plain: 0 };
  for (const item of list) {
    bump(contractCounts, item.renderPrimitive);
    bump(kindCounts, item.kind);
    bump(sourceCounts, item.renderSource);
    if (item.att?.enriched) attCounts.enriched += 1;
    else attCounts.plain += 1;
  }
  return {
    schemaVersion: BROWSER_RVM_RENDER_INSTRUCTION_SCHEMA,
    instructionCount: list.length,
    contractCounts,
    kindCounts,
    sourceCounts,
    attCounts,
    embeddedInputXmlSupportMarkerSkippedCount: Number(seed.embeddedInputXmlSupportMarkerSkippedCount || 0),
    embeddedInputXmlSupportMarkerDebugEnabled: seed.embeddedInputXmlSupportMarkerDebugEnabled === true,
    embeddedInputXmlSupportMarkerDebugKey: EMBEDDED_INPUTXML_MARKER_DEBUG_KEY,
    supportRuntimeRetired: true
  };
}

function summarizeBrowserRvmAtt(attrs = {}) {
  const enriched = String(attrs.RVM_BROWSER_ATT_ENRICHED || '').toLowerCase() === 'true';
  return {
    enriched,
    schemaVersion: String(attrs.RVM_BROWSER_ATT_ENRICHER_SCHEMA || ''),
    ownerQuery: String(attrs.RVM_BROWSER_ATT_OWNER_QUERY || ''),
    attributeCount: finiteNumber(attrs.RVM_BROWSER_ATT_ATTRIBUTE_COUNT) || 0
  };
}

function cloneSerializableAttributes(attrs = {}) {
  const out = {};
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
    }
  }
  return out;
}

function extractBrowserRvmAttAttributes(attrs = {}, enriched = false) {
  if (!enriched) return {};
  const out = {};
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === '') continue;
    if (INTERNAL_ATTRIBUTE_NAMES.has(key)) continue;
    if (INTERNAL_ATTRIBUTE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
    }
  }
  return out;
}

function displayNameForNode(defaultName, attrs = {}, attAttributes = {}) {
  const candidates = [
    attAttributes.TAG,
    attAttributes.TAG_NO,
    attAttributes.TAGNO,
    attAttributes.LINE,
    attAttributes.LINE_NO,
    attAttributes.LINENO,
    attAttributes.EQUI,
    attAttributes.NAME,
    attrs.NAME,
    defaultName
  ];
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (text) return text;
  }
  return 'RVM Node';
}

function bump(target, key) {
  const name = String(key || '').trim() || 'UNKNOWN';
  target[name] = (target[name] || 0) + 1;
}

function finiteNumber(value) {
  const n = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseVec3(value) {
  const parts = String(value || '').split(/[\s,]+/g).filter((entry) => entry.trim() !== '').map((entry) => Number(entry)).filter(Number.isFinite);
  if (parts.length < 3) return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
}
