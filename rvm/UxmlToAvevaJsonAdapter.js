import { resolveKindDescriptor } from '../support/SupportKindResolver.js';

const SUPPORT_TYPES = new Set(['SUPPORT', 'PIPE_SUPPORT', 'PIPESUPPORT', 'ATTA', 'ANCI']);
const BORE_FIELD_BY_ROLE = Object.freeze({
  START: 'ABORE',
  APOS: 'ABORE',
  HEAD: 'HBOR',
  HPOS: 'HBOR',
  END: 'LBORE',
  LPOS: 'LBORE',
  TAIL: 'TBOR',
  TPOS: 'TBOR',
  BRANCH: 'BBORE',
  BPOS: 'BBORE',
  CENTER: 'BORE',
  POS: 'BORE',
});

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boreNumber(value) {
  const n = Number.parseFloat(String(value ?? '').replace(/mm\b/gi, '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clonePoint(point) {
  if (!isObject(point)) return null;
  const x = finiteNumber(point.x ?? point.X);
  const y = finiteNumber(point.y ?? point.Y);
  const z = finiteNumber(point.z ?? point.Z);
  return x == null || y == null || z == null ? null : { x, y, z };
}

function parseCoordinateText(value) {
  const text = clean(value);
  if (!text) return null;
  const tokens = text.split(/\s+/g);
  const p = { x: null, y: null, z: null };
  let parsed = false;
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = upper(tokens[i]);
    const n = Number.parseFloat(String(tokens[i + 1]).replace(/mm\b/gi, ''));
    if (!Number.isFinite(n)) continue;
    if (axis === 'E') { p.x = n; parsed = true; }
    else if (axis === 'W') { p.x = -n; parsed = true; }
    else if (axis === 'N') { p.y = n; parsed = true; }
    else if (axis === 'S') { p.y = -n; parsed = true; }
    else if (axis === 'U') { p.z = n; parsed = true; }
    else if (axis === 'D') { p.z = -n; parsed = true; }
  }
  if (parsed && [p.x, p.y, p.z].every((n) => Number.isFinite(n))) return p;
  const nums = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return nums.length >= 3 ? { x: nums[0], y: nums[1], z: nums[2] } : null;
}

function pointFromValue(value) {
  return clonePoint(value) || parseCoordinateText(value);
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5,
  };
}

function safeName(value, fallback = 'UXML') {
  const text = clean(value) || fallback;
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function normalizeType(type) {
  const t = upper(type).replace(/_/g, '-');
  if (!t) return 'UNKNOWN';
  if (t === 'BEND') return 'ELBOW';
  if (t === 'ELBO') return 'ELBOW';
  if (t === 'VALV') return 'VALVE';
  if (t === 'FLAN') return 'FLANGE';
  if (t === 'GASKET') return 'GASK';
  if (t === 'REDU' || t.startsWith('REDUCER')) return 'REDUCER';
  if (t === 'WELDOLET' || t === 'SOCKOLET') return 'OLET';
  if (SUPPORT_TYPES.has(t)) return 'SUPPORT';
  return t;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return '';
}

function toPointIndex(items = []) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.id) map.set(String(item.id), item);
  }
  return map;
}

function pointFromAnchor(anchor) {
  return clonePoint(anchor?.point);
}

function pointFromPort(port, anchorById) {
  const direct = clonePoint(port?.point);
  if (direct) return direct;
  return pointFromAnchor(anchorById.get(String(port?.anchorId || '')));
}

function roleLooksLikeStart(role) {
  const r = upper(role);
  return r === 'START' || r === 'HEAD' || r === 'APOS' || r === 'EP1' || r === 'PIPE_END_1' || r.endsWith('_END_1');
}

function roleLooksLikeEnd(role) {
  const r = upper(role);
  return r === 'END' || r === 'TAIL' || r === 'LPOS' || r === 'TPOS' || r === 'EP2' || r === 'PIPE_END_2' || r.endsWith('_END_2');
}

function roleLooksLikeBranch(role) {
  const r = upper(role);
  return r === 'BRANCH' || r === 'BPOS' || r.includes('BRANCH') || r.includes('TEE_BRANCH') || r.includes('OLET_BRANCH');
}

function roleLooksLikeCenter(role) {
  const r = upper(role);
  return r === 'CENTER' || r === 'POS' || r === 'CP' || r === 'BBOX_CENTER' || r.includes('CENTER');
}

function collectComponentPorts(component, portById) {
  return (Array.isArray(component?.portIds) ? component.portIds : [])
    .map((id) => portById.get(String(id)))
    .filter(Boolean);
}

function collectComponentAnchors(component, anchorById) {
  return (Array.isArray(component?.anchorIds) ? component.anchorIds : [])
    .map((id) => anchorById.get(String(id)))
    .filter(Boolean);
}

function findPortPoint(component, portById, anchorById, predicate) {
  for (const port of collectComponentPorts(component, portById)) {
    if (!predicate(port.role)) continue;
    const point = pointFromPort(port, anchorById);
    if (point) return point;
  }
  for (const anchor of collectComponentAnchors(component, anchorById)) {
    if (!predicate(anchor.role || anchor.sourceField)) continue;
    const point = pointFromAnchor(anchor);
    if (point) return point;
  }
  return null;
}

function firstAnyPoint(component, portById, anchorById) {
  for (const port of collectComponentPorts(component, portById)) {
    const point = pointFromPort(port, anchorById);
    if (point) return point;
  }
  for (const anchor of collectComponentAnchors(component, anchorById)) {
    const point = pointFromAnchor(anchor);
    if (point) return point;
  }
  return null;
}

function resolveSegmentPoints(component, segmentById, anchorById) {
  const segmentIds = Array.isArray(component?.segmentIds) ? component.segmentIds : [];
  for (const id of segmentIds) {
    const segment = segmentById.get(String(id));
    if (!segment) continue;
    const a = pointFromAnchor(anchorById.get(String(segment.startAnchorId || '')));
    const b = pointFromAnchor(anchorById.get(String(segment.endAnchorId || '')));
    if (a && b) return { apos: a, lpos: b, segment };
  }
  return { apos: null, lpos: null, segment: null };
}

function resolveComponentGeometry(component, indexes) {
  const { portById, anchorById, segmentById } = indexes;
  const fromSegment = resolveSegmentPoints(component, segmentById, anchorById);
  const apos = fromSegment.apos || findPortPoint(component, portById, anchorById, roleLooksLikeStart);
  const lpos = fromSegment.lpos || findPortPoint(component, portById, anchorById, roleLooksLikeEnd);
  const bpos = findPortPoint(component, portById, anchorById, roleLooksLikeBranch);
  const cpos = findPortPoint(component, portById, anchorById, roleLooksLikeCenter);
  const pos = cpos || bpos || midpoint(apos, lpos) || firstAnyPoint(component, portById, anchorById);
  return { apos, lpos, bpos, cpos, pos, segment: fromSegment.segment };
}

function normalizeSupportKindForViewer(kind) {
  const k = upper(kind).replace(/[\s_\-]+/g, '');
  if (k === 'LINESTOP' || k === 'LIMITSTOP' || k === 'STOPPER' || k === 'STOP') return 'LINESTOP';
  if (k === 'REST' || k === 'GUIDE' || k === 'LIMIT' || k === 'ANCHOR' || k === 'SPRING') return k;
  return '';
}

function mapSupportKind(component = {}, uxml = {}) {
  const support = uxml.supportByComponentId?.get?.(String(component.id || '')) || null;
  const text = [
    support?.type,
    support?.skey,
    component?.rawAttributes?.CMPSUPTYPE,
    component?.rawAttributes?.MDSSUPPTYPE,
    component?.rawAttributes?.DTXR,
    component?.rawAttributes?.SKEY,
    component?.rawAttributes?.SPRE,
    component?.name,
  ].map((value) => clean(value).toUpperCase()).join(' ');
  if (/GUIDE/.test(text)) return 'GUIDE';
  if (/LINE\s*STOP|LINESTOP|LIMIT|STOPPER|\bSTOP\b/.test(text)) return 'LINESTOP';
  if (/ANCHOR|FIXED/.test(text)) return 'ANCHOR';
  if (/SPRING|HANGER/.test(text)) return 'SPRING';
  if (/REST|SHOE|BASE\s*PLATE|BEARING\s*PLATE|WEAR\s*PAD|\bBP\b|\bWP\b|ANCI/.test(text)) return 'REST';
  return normalizeSupportKindForViewer(support?.type || component?.type || '') || '';
}

function sourceTypeForComponent(component, normType, rawAttrs = {}) {
  // managed_stage.json consumers are sensitive to AVEVA short type names
  // (ELBO/FLAN/REDU/VALV). Preserve the staged source type and carry the
  // canonical UXML type separately instead of replacing the existing contract.
  return firstNonEmpty(rawAttrs.TYPE, rawAttrs.RAW_TYPE, component.type, normType) || normType;
}

function formatBore(value) {
  const n = boreNumber(value);
  if (n == null || n <= 0) return '';
  return `${Number.isInteger(n) ? n : Number(n.toFixed(3))}mm`;
}

function boreFieldForRole(role, fallback = '') {
  const normalized = upper(role);
  return BORE_FIELD_BY_ROLE[normalized] || fallback || '';
}

function setBoreIfMissing(attrs, field, value) {
  if (!field || attrs[field] != null && clean(attrs[field]) !== '') return;
  const text = formatBore(value);
  if (text) attrs[field] = text;
}

function applyDerivedEndpointBores(attrs, component) {
  const endpointBores = component?.derived?.endpointBores;
  if (!isObject(endpointBores)) return;
  for (const [portKey, info] of Object.entries(endpointBores)) {
    const field = clean(info?.field) || BORE_FIELD_BY_ROLE[upper(portKey)] || '';
    setBoreIfMissing(attrs, field, info?.value);
  }
}

function applyPortBores(attrs, component, indexes) {
  const ports = collectComponentPorts(component, indexes.portById);
  for (const port of ports) {
    const role = upper(port.role);
    const field = clean(port.boreField) || boreFieldForRole(role);
    setBoreIfMissing(attrs, field, port.bore);
    if (roleLooksLikeBranch(role)) {
      setBoreIfMissing(attrs, clean(port.branchBoreField) || 'BBORE', port.branchBore ?? port.bore);
    }
  }
}

function applySegmentBores(attrs, component, indexes) {
  const segmentIds = Array.isArray(component?.segmentIds) ? component.segmentIds : [];
  for (const id of segmentIds) {
    const segment = indexes.segmentById.get(String(id));
    if (!segment) continue;
    setBoreIfMissing(attrs, clean(segment.startBoreField) || 'ABORE', segment.startBore);
    setBoreIfMissing(attrs, clean(segment.endBoreField) || 'LBORE', segment.endBore);
    if (segment.type === 'BRANCH') setBoreIfMissing(attrs, 'BBORE', segment.branchBore ?? segment.endBore);
  }
}

function applyUxmlBoreContract(attrs, component, indexes) {
  // Preserve raw AVEVA fields first. Only restore fields that UXML explicitly
  // carries on ports/segments/derived endpoint metadata. Never expand a single
  // component.bore into HBOR/TBOR/ABORE/LBORE, because OLET/TEE/reducer branch
  // components use different run and branch/end bores.
  applyDerivedEndpointBores(attrs, component);
  applyPortBores(attrs, component, indexes);
  applySegmentBores(attrs, component, indexes);

  const scalarBore = boreNumber(component.bore);
  if (scalarBore != null && scalarBore > 0 && !attrs.BORE) attrs.BORE = scalarBore;
  const branchBore = boreNumber(component.branchBore);
  if (branchBore != null && branchBore > 0) setBoreIfMissing(attrs, 'BBORE', branchBore);
}

function pointDistanceToSegment(point, start, end) {
  if (!point || !start || !end) return Number.POSITIVE_INFINITY;
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const vz = end.z - start.z;
  const wx = point.x - start.x;
  const wy = point.y - start.y;
  const wz = point.z - start.z;
  const lenSq = (vx * vx) + (vy * vy) + (vz * vz);
  if (lenSq <= 1e-9) {
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const dz = point.z - start.z;
    return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
  }
  const t = Math.max(0, Math.min(1, ((wx * vx) + (wy * vy) + (wz * vz)) / lenSq));
  const px = start.x + (t * vx);
  const py = start.y + (t * vy);
  const pz = start.z + (t * vz);
  const dx = point.x - px;
  const dy = point.y - py;
  const dz = point.z - pz;
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function dominantAxisName(start, end) {
  if (!start || !end) return '';
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const az = Math.abs(dz);
  if (ax >= ay && ax >= az && ax > 1e-9) return 'X';
  if (ay >= ax && ay >= az && ay > 1e-9) return 'Y';
  if (az > 1e-9) return 'Z';
  return '';
}

function segmentBoreForHost(component, segment, attrs = {}) {
  return boreNumber(segment?.bore)
    ?? boreNumber(segment?.startBore)
    ?? boreNumber(segment?.endBore)
    ?? boreNumber(attrs.ABORE)
    ?? boreNumber(attrs.HBOR)
    ?? boreNumber(attrs.BORE)
    ?? boreNumber(component?.bore)
    ?? boreNumber(component?.branchBore)
    ?? null;
}

function segmentInfosForComponent(component, indexes) {
  const attrs = isObject(component?.rawAttributes) ? component.rawAttributes : {};
  const out = [];
  for (const id of Array.isArray(component?.segmentIds) ? component.segmentIds : []) {
    const segment = indexes.segmentById.get(String(id));
    if (!segment) continue;
    const start = pointFromAnchor(indexes.anchorById.get(String(segment.startAnchorId || '')));
    const end = pointFromAnchor(indexes.anchorById.get(String(segment.endAnchorId || '')));
    if (!start || !end) continue;
    out.push({
      component,
      segment,
      start,
      end,
      bore: segmentBoreForHost(component, segment, attrs),
    });
  }
  return out;
}

function supportPointFromAttributes(attrs) {
  for (const key of ['SUPPORTCOORD', 'SUPPORT_COORD', 'SCOORD', 'SUPPORT_POINT', 'SUPPORT_POS', 'LBOP', 'LBOS', 'LBOPOS', 'LBOPOINT', 'POS', 'BPOS', 'APOS', 'LPOS']) {
    const p = pointFromValue(attrs?.[key]);
    if (p) return p;
  }
  return null;
}

function supportPoint(component, support, geom, indexes) {
  const rawAttrs = isObject(component?.rawAttributes) ? component.rawAttributes : {};
  const supportRaw = isObject(support?.rawAttributes) ? support.rawAttributes : {};
  const fromAttributes = supportPointFromAttributes({ ...rawAttrs, ...supportRaw });
  if (fromAttributes) return fromAttributes;
  const fromSupport = pointFromAnchor(indexes.anchorById.get(String(support?.supportAnchorId || '')));
  return fromSupport || geom?.pos || firstAnyPoint(component, indexes.portById, indexes.anchorById);
}

function nearestHostSegmentForSupport(component, support, geom, indexes, uxml) {
  const point = supportPoint(component, support, geom, indexes);
  if (!point) return null;

  const hostIds = new Set();
  for (const candidate of Array.isArray(support?.hostCandidates) ? support.hostCandidates : []) {
    const id = clean(candidate?.componentId || candidate?.id || candidate);
    if (id) hostIds.add(id);
  }

  let best = null;
  const samePipeline = clean(component.pipelineRef || component.lineKey);
  for (const candidate of Array.isArray(uxml.components) ? uxml.components : []) {
    if (!candidate || candidate === component) continue;
    const norm = normalizeType(candidate.normalizedType || candidate.type);
    if (norm === 'SUPPORT') continue;
    if (hostIds.size && !hostIds.has(clean(candidate.id))) continue;
    if (!hostIds.size && samePipeline && clean(candidate.pipelineRef || candidate.lineKey) !== samePipeline) continue;

    for (const info of segmentInfosForComponent(candidate, indexes)) {
      const distance = pointDistanceToSegment(point, info.start, info.end);
      if (!best || distance < best.distance) best = { ...info, distance, point };
    }
  }

  return best;
}

function supportTag(component, support, attrs) {
  return firstNonEmpty(
    attrs.SUPPORT_TAG,
    attrs.CMPSUPREFN,
    attrs.TAG,
    attrs.TAGNO,
    support?.tag,
    support?.id,
    component.refNo,
    component.name,
    component.id,
  );
}

function applyUxmlSupportParity(attrs, component, geom, indexes, uxml) {
  const support = uxml.supportByComponentId?.get?.(String(component.id || '')) || null;
  const supportRaw = isObject(support?.rawAttributes) ? support.rawAttributes : {};
  const resolverAttrs = {
    ...supportRaw,
    ...attrs,
    TYPE: attrs.TYPE || component.type || 'SUPPORT',
    RAW_TYPE: attrs.RAW_TYPE || component.rawAttributes?.RAW_TYPE,
    SUPPORT_TYPE: support?.type || attrs.SUPPORT_TYPE || component.type || 'SUPPORT',
    SUPPORT_KIND: attrs.SUPPORT_KIND || support?.kind || support?.type || attrs.CMPSUPTYPE,
    SUPPORT_MAPPER_KIND: attrs.SUPPORT_MAPPER_KIND || attrs.SUPPORT_KIND || support?.type || attrs.CMPSUPTYPE,
    SKEY: firstNonEmpty(attrs.SKEY, support?.skey),
    SPRE: firstNonEmpty(attrs.SPRE, support?.spre),
    DTXR: firstNonEmpty(attrs.DTXR, support?.dtxr),
    NAME: firstNonEmpty(attrs.NAME, support?.name, component.name),
    DESCRIPTION: firstNonEmpty(attrs.DESCRIPTION, support?.description),
  };

  const descriptor = resolveKindDescriptor(resolverAttrs, { defaultKind: 'REST' });
  const kind = normalizeSupportKindForViewer(descriptor.primaryKind)
    || normalizeSupportKindForViewer(mapSupportKind(component, uxml))
    || 'REST';

  attrs.SUPPORT_KIND = kind;
  attrs.SUPPORT_MAPPER_KIND = kind;
  attrs.CMPSUPTYPE = attrs.CMPSUPTYPE || kind;
  attrs.SUPPORT_TYPE = attrs.SUPPORT_TYPE || kind;
  attrs.SUPPORT_TAG = supportTag(component, support, attrs);
  attrs.UXML_SUPPORT_PARITY = 'true';
  attrs.UXML_SUPPORT_KIND_DESCRIPTOR = descriptor.kinds?.join('+') || kind;
  attrs.UXML_SUPPORT_DOFS = descriptor.dofs ? Object.keys(descriptor.dofs).filter((key) => descriptor.dofs[key]).join(',') : '';

  const point = supportPoint(component, support, geom, indexes);
  if (point) {
    attrs.SUPPORTCOORD = attrs.SUPPORTCOORD || point;
    attrs.SUPPORT_COORD = attrs.SUPPORT_COORD || point;
    attrs.POS = attrs.POS || point;
  }

  const host = nearestHostSegmentForSupport(component, support, geom, indexes, uxml);
  if (host) {
    attrs.ATTACHED_COMPONENT_ID = clean(host.component?.id);
    attrs.ATTACHED_PIPE_SEGMENT_ID = clean(host.segment?.id);
    attrs.ATTACHED_PIPE_DISTANCE_MM = Number(host.distance.toFixed(3));
    attrs.APOS = attrs.APOS || host.start;
    attrs.LPOS = attrs.LPOS || host.end;
    attrs.PIPE_AXIS = attrs.PIPE_AXIS || dominantAxisName(host.start, host.end);
    attrs.ROUTE_AXIS = attrs.ROUTE_AXIS || attrs.PIPE_AXIS;
    if (host.bore) {
      const boreText = formatBore(host.bore);
      attrs.ATTACHED_PIPE_BORE = attrs.ATTACHED_PIPE_BORE || boreText;
      attrs.ATTACHED_PIPE_OD = attrs.ATTACHED_PIPE_OD || boreText;
    }
  }

  const gap = boreNumber(attrs.GAP_MM ?? attrs.SUPPORT_GAP_MM ?? support?.gapMm ?? support?.gap);
  if (gap != null) attrs.SUPPORT_GAP_MM = gap;
}

function buildComponentNode(component, branchName, indexes, uxml) {
  const normType = normalizeType(component.normalizedType || component.type);
  const geom = resolveComponentGeometry(component, indexes);
  const name = safeName(component.name || component.refNo || component.id, `${normType} ${component.id || ''}`);
  const rawAttrs = isObject(component.rawAttributes) ? { ...component.rawAttributes } : {};
  const sourceType = sourceTypeForComponent(component, normType, rawAttrs);
  const attrs = {
    ...rawAttrs,
    TYPE: sourceType,
    NAME: firstNonEmpty(rawAttrs.NAME, component.refNo, name),
    REF: firstNonEmpty(rawAttrs.REF, component.refNo, component.seqNo, component.id, name),
    OWNER: branchName,
    SOURCE_FORMAT: 'UXML',
    UXML_COMPONENT_ID: clean(component.id),
    UXML_PIPELINE_REF: clean(component.pipelineRef),
    UXML_LINE_KEY: clean(component.lineKey),
    UXML_NORMALIZED_TYPE: normType,
  };

  if (geom.apos) attrs.APOS = geom.apos;
  if (geom.lpos) attrs.LPOS = geom.lpos;
  if (geom.bpos) attrs.BPOS = geom.bpos;
  if (geom.cpos) attrs.CPOS = geom.cpos;
  if (geom.pos) attrs.POS = geom.pos;

  applyUxmlBoreContract(attrs, component, indexes);

  if (normType === 'SUPPORT') {
    applyUxmlSupportParity(attrs, component, geom, indexes, uxml);
  }

  return {
    name,
    type: sourceType,
    attributes: attrs,
  };
}

function pipelineName(pipeline, fallback) {
  return safeName(
    pipeline?.pipelineRef || pipeline?.lineNo || pipeline?.lineKey || pipeline?.id,
    fallback,
  );
}

function parseTrailingOrderToken(value) {
  const text = clean(value);
  if (!text) return null;
  const match = text.match(/(?:^|:)(\d{1,9})$/);
  return match ? finiteNumber(match[1]) : null;
}

function sourceOrder(component) {
  return finiteNumber(component?.seqNo)
    ?? finiteNumber(component?.rawAttributes?.SEQ)
    ?? finiteNumber(component?.rawAttributes?.SEQUENCE)
    ?? finiteNumber(component?.rawAttributes?.SOURCE_INDEX)
    ?? finiteNumber(component?.rawAttributes?.UXML_SOURCE_INDEX)
    ?? parseTrailingOrderToken(component?.id)
    ?? parseTrailingOrderToken(component?.sourceRefs?.[0]?.id)
    ?? null;
}

function compareBySourceOrder(a, b) {
  const aSeq = sourceOrder(a);
  const bSeq = sourceOrder(b);
  if (aSeq != null && bSeq != null && aSeq !== bSeq) return aSeq - bSeq;
  if (aSeq != null && bSeq == null) return -1;
  if (aSeq == null && bSeq != null) return 1;
  return 0;
}

export function isUxmlDocument(value) {
  return isObject(value)
    && (
      String(value.schemaVersion || '').toLowerCase().includes('uxml')
      || String(value.profile || '').toUpperCase().startsWith('UXML')
      || (Array.isArray(value.components) && Array.isArray(value.anchors) && Array.isArray(value.segments))
    );
}

export function convertUxmlDocumentToAvevaHierarchy(doc, options = {}) {
  if (!isUxmlDocument(doc)) {
    throw new Error('Unsupported UXML document. Expected schemaVersion/profile/components/anchors/segments.');
  }

  const anchorById = toPointIndex(doc.anchors);
  const portById = toPointIndex(doc.ports);
  const segmentById = toPointIndex(doc.segments);
  const pipelineById = toPointIndex(doc.pipelines);
  const supportByComponentId = new Map();
  for (const support of Array.isArray(doc.supports) ? doc.supports : []) {
    if (support?.componentId) supportByComponentId.set(String(support.componentId), support);
  }

  const indexes = { anchorById, portById, segmentById };
  const uxmlContext = { supportByComponentId, components: doc.components };
  const components = Array.isArray(doc.components) ? doc.components.filter(isObject) : [];
  const grouped = new Map();
  const fallbackPipeline = 'uxml:default-pipeline';

  for (const component of components) {
    const key = clean(component.pipelineRef || component.lineKey || fallbackPipeline) || fallbackPipeline;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(component);
  }

  const hierarchy = [];
  let branchIndex = 0;
  for (const [pipelineRef, groupComponents] of grouped.entries()) {
    branchIndex += 1;
    const pipeline = pipelineById.get(pipelineRef) || null;
    const branchName = pipelineName(pipeline, `UXML_BRANCH_${String(branchIndex).padStart(3, '0')}`);
    const sorted = [...groupComponents].sort(compareBySourceOrder);
    const children = sorted.map((component) => buildComponentNode(component, branchName, indexes, uxmlContext));

    const rawPipelineAttrs = isObject(pipeline?.rawAttributes) ? { ...pipeline.rawAttributes } : {};
    const branchAttrs = {
      ...rawPipelineAttrs,
      TYPE: firstNonEmpty(rawPipelineAttrs.TYPE, 'BRAN'),
      NAME: firstNonEmpty(rawPipelineAttrs.NAME, branchName),
      OWNER: firstNonEmpty(rawPipelineAttrs.OWNER, pipeline?.system, pipeline?.area, doc.header?.modelId, options.fileName, 'UXML'),
      // UXML sidecars already preserve the staged route-bearing PIPE entries.
      // Mark the branch as pre-routed so AvevaJsonLoader does not discard those
      // pipes and regenerate connectors using upstream fitting bores (the OLET
      // parent-bore regression).
      SOURCE_FORMAT: 'REV_XML',
      UXML_SOURCE_FORMAT: 'UXML',
      UXML_ROUTE_PRESERVE: 'true',
      UXML_PIPELINE_ID: clean(pipeline?.id || pipelineRef),
      UXML_LINE_KEY: clean(pipeline?.lineKey || pipelineRef),
      SOURCE_FILE: clean(options.fileName || ''),
    };

    const first = children.find((child) => child?.attributes?.APOS || child?.attributes?.POS);
    const last = [...children].reverse().find((child) => child?.attributes?.LPOS || child?.attributes?.POS);
    if (!branchAttrs.HPOS && (first?.attributes?.APOS || first?.attributes?.POS)) branchAttrs.HPOS = first.attributes.APOS || first.attributes.POS;
    if (!branchAttrs.TPOS && (last?.attributes?.LPOS || last?.attributes?.POS)) branchAttrs.TPOS = last.attributes.LPOS || last.attributes.POS;

    hierarchy.push({
      name: branchName,
      type: 'BRANCH',
      attributes: branchAttrs,
      children,
    });
  }

  if (!hierarchy.length) {
    throw new Error('UXML import produced no branch hierarchy. Check components/pipelines in the UXML sidecar.');
  }

  return hierarchy;
}
