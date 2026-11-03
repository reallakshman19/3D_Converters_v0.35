import { normalizeLineNoValue } from '../../../utils/line-no-metadata.js';

const BM_CII_LINE_NO_SIDELOAD_URL = 'benchmarks/bm-cii/BM_CII_LINE_NO_sideload.json';

const state = {
  loaded: false,
  loading: null,
  error: null,
  byNode: new Map(),
  topologyRoot: null,
  componentLineByKey: new Map(),
};

function text(value) {
  return String(value ?? '').trim();
}

function normalizeNodeId(value) {
  const raw = text(value);
  if (!raw) return '';
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : raw;
}

function first(source, keys, fallback = '') {
  for (const key of keys) {
    const value = text(source?.[key]);
    if (value) return value;
  }
  return text(fallback);
}

function firstNode(source, keys = []) {
  return normalizeNodeId(first(source, keys));
}

function identityText(item = {}, meta = {}) {
  const parts = [
    item?.id,
    item?.type,
    item?.refNo,
    item?.name,
    meta?.id,
    meta?.pcfId,
    meta?.name,
    meta?.supportRecordId,
    meta?.recordId,
    meta?.labelText,
    meta?.sourceXml,
    meta?.benchmarkName,
  ];
  let current = item?.object3D || null;
  while (current) {
    parts.push(current.name, current.uuid);
    current = current.parent || null;
  }
  return parts.map(text).filter(Boolean).join(' ');
}

function nodeFromIdentity(item = {}, meta = {}) {
  const raw = identityText(item, meta);
  if (!raw) return '';
  const patterns = [
    /(?:^|[_\s:;-])node[_\s:;-]*([0-9]+(?:\.[0-9]+)?)/i,
    /(?:^|[_\s:;-])support[_\s:;-]*node[_\s:;-]*([0-9]+(?:\.[0-9]+)?)/i,
    /\bN(?:ODE)?\s*([0-9]+(?:\.[0-9]+)?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const node = normalizeNodeId(match?.[1]);
    if (node) return node;
  }
  return '';
}

function nodePairFromMeta(meta = {}) {
  return {
    from: normalizeNodeId(first(meta, ['fromNode', 'FROM_NODE', 'From Node'])),
    to: normalizeNodeId(first(meta, ['toNode', 'TO_NODE', 'To Node'])),
  };
}

function directNodeFromMeta(item = {}, meta = {}) {
  return firstNode(meta, ['NODE', 'node', 'supportNode', 'sourceNode', 'CAESAR_NODE', 'NodeNumber', 'nodeNumber'])
    || nodeFromIdentity(item, meta);
}

function rootOf(object3D) {
  let current = object3D || null;
  while (current?.parent) current = current.parent;
  return current;
}

function objectMeta(object3D) {
  const chain = [];
  let current = object3D || null;
  while (current) {
    const raw = current?.userData && typeof current.userData === 'object' ? current.userData : {};
    const trace = raw.bmCiiTrace && typeof raw.bmCiiTrace === 'object' ? raw.bmCiiTrace : {};
    if (Object.keys(raw).length || Object.keys(trace).length) chain.unshift({ ...trace, ...raw });
    current = current.parent || null;
  }
  return Object.assign({}, ...chain);
}

function componentKey(meta = {}, object3D = null) {
  return first(meta, ['pcfId', 'id', 'refNo', 'REF_NO', 'name'], object3D?.name || object3D?.uuid || '');
}

function looksLikeSupport(meta = {}, type = '') {
  const trace = meta.bmCiiTrace && typeof meta.bmCiiTrace === 'object' ? meta.bmCiiTrace : {};
  const raw = `${type || ''} ${meta?.id || ''} ${meta?.name || ''} ${meta?.supportRecordId || ''} ${meta?.recordId || ''}`.toUpperCase();
  return trace.entity === 'support'
    || trace.semanticCategory === 'support'
    || Boolean(meta.supportRecordId || meta.supportKind || meta.supportSource)
    || raw.includes('SUPPORT')
    || raw.includes('RESTRAINT')
    || raw.includes('BM_CII_BAKED_SUPPORT');
}

function looksLikeBmCiiComponent(item = {}, meta = {}) {
  const pair = nodePairFromMeta(meta);
  if (pair.from || pair.to) return true;
  const raw = identityText(item, meta).toUpperCase();
  return raw.includes('BM_CII') || raw.includes('INPUTXML') || raw.includes('PE_');
}

function resolveRuntimeUrl(url) {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (typeof window !== 'undefined' && window.location) {
    return new URL(url.replace(/^\/+/, ''), `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}`).toString();
  }
  return url;
}

function applyRecords(records) {
  state.byNode = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const node = normalizeNodeId(record?.node ?? record?.NODE ?? record?.Node);
    const lineNo = normalizeLineNoValue(record?.lineNo ?? record?.LINE_NO ?? record?.['Line No'] ?? record?.lineNumber);
    if (!node || !lineNo) continue;
    state.byNode.set(node, {
      lineNo,
      anchorNode: node,
      source: record?.source || 'BM_CII line-no sideload',
      scope: record?.scope || 'node-wise sideload',
    });
  }
  state.topologyRoot = null;
  state.componentLineByKey = new Map();
}

export function ensureBmCiiLineNoSideloadLoaded() {
  if (state.loaded || state.loading) return state.loading;
  if (typeof fetch !== 'function') {
    state.loaded = true;
    return null;
  }
  state.loading = fetch(resolveRuntimeUrl(BM_CII_LINE_NO_SIDELOAD_URL), { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`${response.status}`);
      return response.json();
    })
    .then((payload) => {
      applyRecords(payload?.records || payload?.lineNoRecords || []);
      state.loaded = true;
      state.error = null;
    })
    .catch((err) => {
      state.loaded = true;
      state.error = err?.message || String(err);
      applyRecords([]);
    });
  return state.loading;
}

function buildTopology(root) {
  state.topologyRoot = root || null;
  state.componentLineByKey = new Map();
  if (!root || typeof root.traverse !== 'function' || state.byNode.size === 0) return;

  const adjacency = new Map();
  root.traverse((object3D) => {
    const meta = objectMeta(object3D);
    const pair = nodePairFromMeta(meta);
    const key = componentKey(meta, object3D);
    if (!pair.from || !pair.to || !key) return;
    const type = first(meta, ['pcfType', 'type'], object3D?.type || object3D?.name || '');
    if (looksLikeSupport(meta, type)) return;
    const edge = { from: pair.from, to: pair.to, key };
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from).push(edge);
    adjacency.get(edge.to).push(edge);
  });

  const nodeLine = new Map();
  const queue = [];
  for (const [node, detail] of state.byNode.entries()) {
    nodeLine.set(node, detail);
    queue.push(node);
  }

  for (let i = 0; i < queue.length; i += 1) {
    const node = queue[i];
    const detail = nodeLine.get(node);
    for (const edge of adjacency.get(node) || []) {
      if (!state.componentLineByKey.has(edge.key)) {
        state.componentLineByKey.set(edge.key, {
          ...detail,
          source: `${detail.source}; propagated through component topology`,
        });
      }
      const other = edge.from === node ? edge.to : edge.from;
      if (!nodeLine.has(other)) {
        nodeLine.set(other, detail);
        queue.push(other);
      }
    }
  }
}

function directLineFromNode(node) {
  const detail = state.byNode.get(normalizeNodeId(node));
  if (!detail) return null;
  return {
    value: detail.lineNo,
    source: detail.source,
    anchorNode: detail.anchorNode,
    scope: 'node-wise sideload direct',
    pending: false,
  };
}

function singleAnchorLineForComponent(item = {}, meta = {}) {
  if (state.byNode.size !== 1 || !looksLikeBmCiiComponent(item, meta)) return null;
  const detail = Array.from(state.byNode.values())[0];
  return {
    value: detail.lineNo,
    source: `${detail.source}; single-anchor BM_CII component fallback`,
    anchorNode: detail.anchorNode,
    scope: 'single-anchor component fallback',
    pending: false,
  };
}

export function bmCiiLineNoFromSideload(item, meta, supportLike = false) {
  if (!state.loaded) return { value: '', pending: true };
  if (state.byNode.size === 0) return { value: '', pending: false };

  // Supports/restraints are record-scoped and must not receive topology or
  // single-anchor carry-forward. A direct node-wise line value is allowed only
  // when the selected support itself is on the sideload node.
  if (supportLike) {
    return directLineFromNode(directNodeFromMeta(item, meta)) || { value: '', pending: false };
  }

  const pair = nodePairFromMeta(meta);
  for (const node of [pair.from, pair.to, directNodeFromMeta(item, meta)]) {
    const direct = directLineFromNode(node);
    if (direct) return direct;
  }

  const root = rootOf(item?.object3D);
  if (state.topologyRoot !== root) buildTopology(root);
  const propagated = state.componentLineByKey.get(componentKey(meta, item?.object3D));
  if (propagated) {
    return {
      value: propagated.lineNo,
      source: propagated.source,
      anchorNode: propagated.anchorNode,
      scope: 'node-wise sideload topology carry-forward',
      pending: false,
    };
  }

  return singleAnchorLineForComponent(item, meta) || { value: '', pending: false };
}
