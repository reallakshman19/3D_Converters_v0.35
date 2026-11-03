import { buildNodeMarkerDiagnostics, markerWarning, stableHash } from './NodeMarkerDiagnostics.js';

export const NODE_MARKER_SCHEMA = 'non-primitive-node-marker/v1';
export const NODE_MARKER_RESOLVER_VERSION = 'node-marker-resolver/v1';

const SUPPORT_RE = /SUPPORT|REST|GUIDE|LINE.?STOP|ANCHOR|HOLD|PS\b|ATTA|ANCI/i;
const POINT_KEYS = ['APOS', 'LPOS', 'POS', 'START', 'END'];

export function detectNodeMarkerSourceKind(source, options = {}) {
  const sourceKind = String(options.sourceKind || source?.sourceKind || source?.kind || 'json').toLowerCase();
  let sourceSubKind = 'unknown';
  if (Array.isArray(source?.branches) || Array.isArray(source?.supportRecords)) sourceSubKind = 'staged-json-export';
  else if (/managed[-_ ]?stage/i.test(String(source?.schema || source?.name || source?.type || ''))) sourceSubKind = 'managed-stage';
  else if (source?.uxml || source?.document?.uxml || /inputxml|uxml/i.test(String(source?.schema || ''))) sourceSubKind = 'inputxml-family';
  return { sourceKind, sourceSubKind };
}

export function resolveNodeMarkersFromSource(source, options = {}) {
  const kind = detectNodeMarkerSourceKind(source, options);
  const sourceFile = options.sourceFile || source?.sourceFile || source?.fileName || '';
  const toleranceMm = Number.isFinite(Number(options.toleranceMm)) ? Number(options.toleranceMm) : 2;
  const records = collectElementRecords(source);
  const sourceRevision = stableHash({ kind, records: records.map((r) => ({ p: r.path, t: r.type, points: r.points, attributes: r.attributes })) });
  const groups = groupInterfacePoints(records, toleranceMm);
  const markers = groups.map((group, index) => buildMarker(group, index, { ...options, ...kind, sourceFile, sourceRevision, toleranceMm }));
  const diagnostics = buildNodeMarkerDiagnostics(markers, { ...kind, sourceFile, sourceRevision, toleranceMm, resolverVersion: NODE_MARKER_RESOLVER_VERSION });
  return { schema: 'non-primitive-node-marker-build/v1', markers, tables: null, diagnostics };
}

export function collectElementRecords(source) {
  if (!source) return [];
  if (Array.isArray(source?.branches)) return collectStructuredBranches(source);
  const roots = Array.isArray(source) ? source : [source];
  const out = [];
  roots.forEach((root, index) => walkSourceNode(root, { path: String(root?.name || root?.schema || `root-${index}`), branchName: branchNameOf(root), order: out.length }, out));
  return out;
}

function collectStructuredBranches(source) {
  const out = [];
  for (const branch of source.branches || []) {
    const branchName = branch.branchName || branch.BranchName || branch.name || branch.branch || '';
    const children = branch.children || branch.elements || branch.components || branch.items || [];
    for (const child of children) walkSourceNode(child, { path: `${branchName}/${child?.name || child?.id || out.length}`, branchName, order: out.length }, out);
  }
  for (const support of source.supportRecords || []) walkSourceNode(support, { path: `support/${support.supportNo || support.name || out.length}`, branchName: support.branchName || support.BranchName || '', order: out.length }, out);
  return out;
}

function walkSourceNode(node, ctx, out) {
  if (!node || typeof node !== 'object') return;
  const attrs = { ...(node.attributes || node.attrs || node) };
  const type = normalizeType(node.type || node.kind || attrs.TYPE || attrs.ComponentType || attrs.componentType || node.name);
  const branchName = branchNameOf(node) || ctx.branchName || attrs.BranchName || attrs.branchName || attrs.BRANCH_ID || attrs.BRANCH || '';
  const points = extractPoints(attrs);
  if (points.length) out.push({
    order: out.length,
    path: ctx.path,
    name: node.name || attrs.NAME || attrs.Name || attrs.supportNo || attrs.SupportNo || attrs.ComponentRefNo || attrs.COMPONENT_REF_NO || ctx.path,
    type,
    sourceType: String(node.type || node.kind || type),
    branchName,
    attributes: attrs,
    points,
    isSupport: SUPPORT_RE.test(`${type} ${node.name || attrs.supportNo || attrs.SUPPORT_KIND || ''}`),
  });
  const kids = node.children || node.items || node.components || node.hierarchy || [];
  kids.forEach((child, i) => walkSourceNode(child, { path: `${ctx.path}/${child?.name || child?.id || i}`, branchName, order: out.length }, out));
}

function extractPoints(attrs) {
  const out = [];
  for (const key of POINT_KEYS) {
    const point = toPoint(attrs[key] ?? attrs[key.toLowerCase()]);
    if (point) out.push({ key, point });
  }
  if (!out.length) {
    const a = toPoint([attrs.X1, attrs.Y1, attrs.Z1]);
    const b = toPoint([attrs.X2, attrs.Y2, attrs.Z2]);
    const p = toPoint([attrs.X, attrs.Y, attrs.Z]);
    if (a) out.push({ key: 'APOS', point: a });
    if (b) out.push({ key: 'LPOS', point: b });
    if (p) out.push({ key: 'POS', point: p });
  }
  return out;
}

function groupInterfacePoints(records, toleranceMm) {
  const map = new Map();
  for (const record of records) {
    for (const point of record.points) {
      const key = quantize(point.point, toleranceMm);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ record, point });
    }
  }
  return [...map.values()].filter((items) => items.length > 1).map((items) => items.sort((a, b) => a.record.order - b.record.order));
}

function buildMarker(group, index, options) {
  const upstream = chooseUpstream(group);
  const downstream = group.find((item) => item !== upstream) || group[0];
  const position = upstream.point.point;
  const nodeNumber = Number(options.startNodeNumber || 10000) + index * Number(options.nodeStep || 10);
  const warnings = group.length > 2 ? [markerWarning('multi-interface', 'More than two source elements share this marker point.', { count: group.length })] : [];
  const markerKind = markerKindOf(upstream.record, downstream.record);
  const upstreamHash = stableHash(upstream.record.attributes || {});
  const downstreamHash = stableHash(downstream.record.attributes || {});
  return {
    schema: NODE_MARKER_SCHEMA,
    markerId: `NODE-${String(index + 1).padStart(5, '0')}`,
    markerKind,
    branchName: upstream.record.branchName || downstream.record.branchName || '',
    nodeNumber,
    nodeNumberSource: 'generated',
    componentType: markerKind.includes('SUPPORT') ? 'SUPPORT' : preferredComponentType(upstream.record, downstream.record),
    componentRefNo: firstValue(upstream.record.attributes.ComponentRefNo, upstream.record.attributes.componentRefNo, upstream.record.attributes.COMPONENT_REF_NO, upstream.record.attributes.COMPONENT_ID, downstream.record.attributes.ComponentRefNo, downstream.record.attributes.COMPONENT_REF_NO),
    componentRefNoSource: firstValue(upstream.record.attributes.ComponentRefNo, upstream.record.attributes.componentRefNo, upstream.record.attributes.COMPONENT_REF_NO, upstream.record.attributes.COMPONENT_ID) ? 'upstream' : 'downstream',
    positionSource: upstream.point.key,
    sourceKind: options.sourceKind,
    sourceSubKind: options.sourceSubKind,
    sourceFile: options.sourceFile,
    sourcePath: upstream.record.path,
    sourceObjectType: upstream.record.sourceType,
    sourceName: upstream.record.name,
    sourceType: upstream.record.type,
    position,
    upstreamRef: elementRef(upstream.record),
    downstreamRef: elementRef(downstream.record),
    connectedElementIds: group.map((item) => item.record.path),
    confidence: warnings.length ? 0.75 : 1,
    status: warnings.length ? 'approximate' : 'exact',
    warnings,
    sourceRevision: options.sourceRevision,
    toleranceMm: options.toleranceMm,
    upstreamPropertyHash: upstreamHash,
    downstreamPropertyHash: downstreamHash,
    upstreamProperties: upstream.record.attributes || {},
    downstreamProperties: downstream.record.attributes || {},
  };
}

function chooseUpstream(group) {
  const pipe = group.find((item) => item.record.type === 'PIPE');
  return pipe || group[0];
}

function markerKindOf(a, b) {
  if (a.isSupport || b.isSupport) return 'PIPE_TO_SUPPORT';
  return `${a.type || 'ELEMENT'}_TO_${b.type || 'ELEMENT'}`.replace(/[^A-Z0-9_]+/g, '_');
}

function preferredComponentType(a, b) {
  if (b.type && b.type !== 'PIPE') return b.type;
  return a.type || b.type || 'NODE';
}

function elementRef(record) {
  return { sourcePath: record.path, canonicalObjectId: record.attributes.canonicalObjectId || record.attributes.id || record.path, sourceObjectId: record.attributes.sourceObjectId || record.attributes.ID || record.path, type: record.type, name: record.name };
}

function branchNameOf(node) {
  return node?.branchName || node?.BranchName || node?.attributes?.BranchName || node?.attributes?.branchName || node?.attributes?.BRANCH_ID || node?.attributes?.NAME || '';
}

function firstValue(...values) { return values.find((v) => v !== undefined && v !== null && String(v) !== '') || ''; }
function normalizeType(value) {
  const raw = String(value || 'ELEMENT').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (raw === 'TUBI') return 'PIPE';
  if (raw === 'FLAN') return 'FLANGE';
  if (raw === 'VALV') return 'VALVE';
  if (raw === 'ELBO' || raw === 'ELBOW') return 'BEND';
  if (raw === 'ATTA' || raw === 'ANCI') return 'SUPPORT';
  return raw;
}
function toPoint(value) {
  if (Array.isArray(value) && value.length >= 3) return { x: Number(value[0]), y: Number(value[1]), z: Number(value[2]) };
  if (value && typeof value === 'object') return { x: Number(value.x ?? value.X), y: Number(value.y ?? value.Y), z: Number(value.z ?? value.Z) };
  if (typeof value === 'string') return toPoint(value.split(/[,\s]+/).filter(Boolean));
  return null;
}
function quantize(p, tol) { return [p.x, p.y, p.z].map((v) => Math.round(Number(v) / tol)).join(':'); }
