/**
 * Vendored subset of third_party/pipe-component-data for use inside the
 * deployed viewer artifact (only viewer/ is published to GitHub Pages).
 *
 * Source: third_party/pipe-component-data/src/parse/fromUxmlXml.js
 * and its transitive local dependencies.
 *
 * Keep in sync with third_party/pipe-component-data when that source changes.
 */

// ── adapterGraphKeys ────────────────────────────────────────────────────────

const ADAPTER_GRAPH_KEYS = Object.freeze([
  'adapter', 'anchors', 'components', 'diagnostics', 'header',
  'lossContract', 'mappings', 'pipelines', 'ports', 'profile',
  'rayEvidence', 'schemaVersion', 'segments', 'sources', 'supports',
  'topologyHints', 'units',
]);

// ── sectionNames ─────────────────────────────────────────────────────────────

const ARRAY_SECTION_KEYS = Object.freeze([
  'sources', 'mappings', 'pipelines', 'components', 'anchors', 'ports',
  'segments', 'supports', 'topologyHints', 'rayEvidence', 'lossContract',
  'diagnostics',
]);

const SECTION_TAGS = Object.freeze({
  sources: 'Sources', mappings: 'Mappings', pipelines: 'Pipelines',
  components: 'Components', anchors: 'Anchors', ports: 'Ports',
  segments: 'Segments', supports: 'Supports', topologyHints: 'TopologyHints',
  rayEvidence: 'RayEvidence', lossContract: 'LossContract',
  diagnostics: 'Diagnostics',
});

// ── xmlEscapes ────────────────────────────────────────────────────────────────

function unescapeXml(value) {
  return String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

// ── namespaceImportedIds ──────────────────────────────────────────────────────

const REF_FIELDS = Object.freeze([
  'id', 'componentId', 'anchorId', 'startAnchorId', 'endAnchorId',
  'supportAnchorId', 'supportId',
]);
const REF_ARRAY_FIELDS = Object.freeze(['anchorIds', 'portIds', 'segmentIds']);

function namespaceImportedIds(graph, namespace = '') {
  if (!namespace) return graph;
  const idMap = buildIdMap(graph, namespace);
  return rewriteValue(graph, idMap);
}

function buildIdMap(graph, namespace) {
  const idMap = new Map();
  for (const key of ['components', 'anchors', 'ports', 'segments', 'supports']) {
    for (const item of graph?.[key] || []) {
      if (item?.id) idMap.set(item.id, `${namespace}:${item.id}`);
    }
  }
  return idMap;
}

function rewriteValue(value, idMap, key = '') {
  if (Array.isArray(value)) return value.map((item) => rewriteValue(item, idMap, key));
  if (!value || typeof value !== 'object') return rewriteScalar(value, idMap, key);
  const next = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    next[childKey] = rewriteField(childKey, childValue, idMap);
  }
  return next;
}

function rewriteField(key, value, idMap) {
  if (REF_ARRAY_FIELDS.includes(key) && Array.isArray(value)) {
    return value.map((id) => idMap.get(id) || id);
  }
  if (REF_FIELDS.includes(key)) return rewriteScalar(value, idMap, key);
  return rewriteValue(value, idMap, key);
}

function rewriteScalar(value, idMap) {
  return typeof value === 'string' ? idMap.get(value) || value : value;
}

// ── createAdapterGraph ────────────────────────────────────────────────────────

const DEFAULT_PROFILE = 'UXML-TOPOLOGY-FULL';
const SCHEMA_VERSION = 'uxml-topology-v1';

function createAdapterGraph(options = {}) {
  const { now, profile, header, units, adapter, ...overrides } = options || {};
  const graph = makeBaseGraph({ now, profile, header, units, adapter });
  for (const [key, value] of Object.entries(overrides)) {
    if (!ADAPTER_GRAPH_KEYS.includes(key)) {
      throw new Error(`Unknown AdapterGraph top-level key: ${key}`);
    }
    graph[key] = value;
  }
  return graph;
}

function makeBaseGraph({ now, profile, header, units, adapter }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: profile || DEFAULT_PROFILE,
    header: makeHeader(now, header),
    sources: [],
    mappings: [],
    units: makeUnits(units),
    pipelines: [],
    components: [],
    anchors: [],
    ports: [],
    segments: [],
    supports: [],
    topologyHints: [],
    rayEvidence: [],
    lossContract: [],
    diagnostics: [],
    adapter: makeAdapter(adapter),
  };
}

function makeHeader(now, header = {}) {
  return {
    projectId: '', modelId: '', createdBy: 'piping-adapter',
    createdAt: now || new Date().toISOString(),
    purpose: 'cross-repo-piping-exchange', notes: '',
    ...header,
  };
}

function makeUnits(units = {}) {
  return {
    coordinates: 'MM', bore: 'MM', length: 'MM',
    weight: 'KG', pressure: 'kPa',
    ...units,
  };
}

function makeAdapter(adapter = {}) {
  return { name: '', version: '', ...adapter };
}

// ── fromUxmlXml ───────────────────────────────────────────────────────────────

export function fromUxmlXml(xmlText, options = {}) {
  const text = String(xmlText || '').trim();
  const root = text.match(/^<UXML\b([^>]*)>/i);
  if (!root) throw new Error('UXML root element not found');
  const rootAttrs = parseAttributes(root[1]);
  const graph = createAdapterGraph({
    now: options.now,
    schemaVersion: rootAttrs.schemaVersion || 'uxml-topology-v1',
    profile: rootAttrs.profile || 'UXML-TOPOLOGY-FULL',
    header: readObject(text, 'Header', defaultHeader(options.now)),
    units: readObject(text, 'Units', undefined),
    adapter: readObject(text, 'Adapter', undefined),
  });
  for (const key of ARRAY_SECTION_KEYS) graph[key] = readArray(text, SECTION_TAGS[key]);
  if (!graph.components.length) graph.components = readLegacyComponents(text);
  return namespaceImportedIds(graph, options.idNamespace || '');
}

function defaultHeader(now) {
  return {
    projectId: '', modelId: '', createdBy: 'piping-adapter',
    createdAt: now || '1970-01-01T00:00:00.000Z',
    purpose: 'cross-repo-piping-exchange', notes: '',
  };
}

function readObject(text, tag, fallback) {
  const attrs = readElementAttributes(text, tag);
  if (attrs.data) return JSON.parse(unescapeXml(attrs.data));
  const plain = readPlainAttributes(attrs);
  if (!plain) return fallback;
  return fallback ? { ...fallback, ...plain } : plain;
}

function readPlainAttributes(attrs) {
  const entries = Object.entries(attrs).filter(([key]) => key !== 'data');
  return entries.length ? Object.fromEntries(entries) : null;
}

function readArray(text, tag) {
  const body = readElementBody(text, tag);
  if (!body) return [];
  return [...body.matchAll(/<Item\b([^>]*?)\/>/gi)]
    .map((match) => parseAttributes(match[1]).data)
    .filter((data) => data != null)
    .map((data) => JSON.parse(unescapeXml(data)));
}

function readLegacyComponents(text) {
  return [...text.matchAll(/<Component\b([^>]*?)\/>/gi)].map((match) => {
    const attrs = parseAttributes(match[1]);
    return {
      id: attrs.id || '', sourceRefs: [],
      type: attrs.type || 'UNKNOWN',
      normalizedType: attrs.normalizedType || attrs.type || 'UNKNOWN',
      pipelineRef: attrs.pipelineRef || '',
      lineKey: '', refNo: '', seqNo: '',
      name: attrs.name || attrs.id || '',
      bore: null, branchBore: null, boreUnit: 'MM', sizeRaw: '', skey: '',
      ca: {}, rawAttributes: {}, normalized: {}, derived: {},
      anchorIds: [], portIds: [], segmentIds: [], supportId: '',
      confidence: 'EXACT_SOURCE', diagnostics: [],
    };
  });
}

function readElementBody(text, name) {
  const match = text.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1] : '';
}

function readElementAttributes(text, name) {
  const match = text.match(new RegExp(`<${name}\\b([^>]*)\\/?>(?:</${name}>)?`, 'i'));
  return match ? parseAttributes(match[1]) : {};
}

function parseAttributes(text) {
  const attrs = {};
  for (const match of String(text || '').matchAll(/([A-Za-z_:][A-Za-z0-9_:.-]*)="([^"]*)"/g)) {
    attrs[match[1]] = unescapeXml(match[2]);
  }
  return attrs;
}
