/**
 * Converts 3DV "Conv JSON" selection payloads into the Custom Input model rows
 * consumed by XML->CII. Parameters: rvm-converter-stage/v1 JSON text/object,
 * or the 3DV viewer selection wrapper with top-level source/selected rows, and
 * explicit converter options. Outputs: branch/coordinate/weight/restraint/DTXR
 * rows plus trace diagnostics. Fallback: non-route geometry is skipped with an
 * audit row unless includeNonRouteGeometry is enabled.
 */

const SCHEMA = 'rvm-converter-stage/v1';
const TRACE_COLUMNS = Object.freeze(['status', 'reason', 'sourceKind', 'sourceFile', 'sourceRef', 'nativeKind', 'componentType', 'branchName', 'nodeNumber', 'position', 'elementLengthMm', 'message']);

function t(value) { return String(value ?? '').trim(); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function cleanNumber(value) { const n = finite(value); return n === null ? '' : String(Number(n.toFixed(6))); }
function pointText(point) { return [point.x, point.y, point.z].map(cleanNumber).join(' '); }
function basename(name) { return t(name).replace(/[\\/]+/g, '/').split('/').pop().replace(/\.[^.]+$/, '') || 'seljson'; }
function safePathToken(value) { return t(value).replace(/[^\w./" -]+/g, '').replace(/\s+/g, ' ').trim(); }
function pushRow(rows, key, row) { rows[key].push(row); }
function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }
function scalePoint(point, scale) { return { x: point.x * scale, y: point.y * scale, z: point.z * scale }; }
function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }; }
function supportKindFromText(...values) {
  const upper = values.map(t).filter(Boolean).join(' ').toUpperCase();
  if (/\b(LINE\s*STOP|LINESTOP|LIMIT|LIM|DIRECTIONAL\s+ANCHOR|AXIAL\s+STOP|XST\d+|ST0?6)\b/.test(upper)) return 'LINESTOP';
  if (/\b(GUIDE|GUI|PDO-TYPE-603|GT\d+|PG-)\b/.test(upper)) return 'GUIDE';
  if (/\b(ANCHOR|ANC)\b/.test(upper)) return 'ANCHOR';
  if (/\b(SPRING|HANGER)\b/.test(upper)) return 'SPRING';
  if (/\b(REST|SHOE|SUPPORT|SADDLE|WEAR\s+PLATE|PAD|XRT\d*)\b/.test(upper)) return 'REST';
  return '';
}
function directionForSupportKind(kind) {
  const value = t(kind).toUpperCase();
  if (value === 'GUIDE') return 'GUI';
  if (value === 'LINESTOP' || value === 'LIMIT') return 'LIM';
  if (value === 'ANCHOR') return 'A';
  if (value === 'SPRING') return 'Y';
  return '+Y';
}
function pt(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const x = finite(value.x ?? value.X), y = finite(value.y ?? value.Y), z = finite(value.z ?? value.Z);
    return x === null || y === null || z === null ? null : { x, y, z };
  }
  if (Array.isArray(value) && value.length >= 3) {
    const x = finite(value[0]), y = finite(value[1]), z = finite(value[2]);
    return x === null || y === null || z === null ? null : { x, y, z };
  }
  return null;
}
function bbox(value) {
  if (!Array.isArray(value) || value.length < 6) return null;
  const n = value.slice(0, 6).map(finite);
  if (n.some((entry) => entry === null)) return null;
  return [Math.min(n[0], n[3]), Math.min(n[1], n[4]), Math.min(n[2], n[5]), Math.max(n[0], n[3]), Math.max(n[1], n[4]), Math.max(n[2], n[5])];
}
function bboxCenter(value) { const b = bbox(value); return b ? { x: (b[0] + b[3]) / 2, y: (b[1] + b[4]) / 2, z: (b[2] + b[5]) / 2 } : null; }
function bboxExtent(value) { const b = bbox(value); return b ? Math.max(Math.abs(b[3] - b[0]), Math.abs(b[4] - b[1]), Math.abs(b[5] - b[2])) : null; }
function matrix(item) {
  const candidate = item?.geometry?.transform3x4 || item?.nativeGeometry?.transform3x4 || item?.transform?.matrix3x4 || item?.transform3x4;
  return Array.isArray(candidate) && candidate.length === 12 && candidate.every((entry) => finite(entry) !== null) ? candidate.map(Number) : null;
}
function transformPoint(m, point) {
  return { x: m[0] * point.x + m[3] * point.y + m[6] * point.z + m[9], y: m[1] * point.x + m[4] * point.y + m[7] * point.z + m[10], z: m[2] * point.x + m[5] * point.y + m[8] * point.z + m[11] };
}
function axisName(item, localBbox) {
  const explicit = t(item?.nativeParams?.localAxis || item?.geometry?.nativeParams?.localAxis).toLowerCase();
  if (['x', 'y', 'z'].includes(explicit)) return explicit;
  const b = bbox(localBbox);
  if (!b) return 'z';
  const dims = { x: Math.abs(b[3] - b[0]), y: Math.abs(b[4] - b[1]), z: Math.abs(b[5] - b[2]) };
  return dims.x >= dims.y && dims.x >= dims.z ? 'x' : dims.y >= dims.x && dims.y >= dims.z ? 'y' : 'z';
}
function localAxisEndpoints(item) {
  const localBbox = bbox(item?.geometry?.localBbox || item?.nativeGeometry?.bboxLocal || item?.transform?.bboxLocal || item?.bboxLocal);
  const m = matrix(item);
  if (!localBbox || !m) return null;
  const axis = axisName(item, localBbox);
  const center = bboxCenter(localBbox);
  const start = { ...center }, end = { ...center };
  if (axis === 'x') { start.x = localBbox[0]; end.x = localBbox[3]; }
  if (axis === 'y') { start.y = localBbox[1]; end.y = localBbox[4]; }
  if (axis === 'z') { start.z = localBbox[2]; end.z = localBbox[5]; }
  return { start: transformPoint(m, start), end: transformPoint(m, end), source: `transform.localBbox.${axis}` };
}
function sourceUnits(payload) {
  return t(payload?.source?.stageSource?.units || payload?.source?.units || '').toLowerCase();
}
function scaleToMm(payload, options) {
  const explicit = finite(options?.coordScaleToMm);
  if (explicit !== null && explicit > 0) return explicit;
  return sourceUnits(payload) === 'm' ? 1000 : 1;
}
function sourceKind(payload) {
  return t(payload?.source?.stageSource?.kind || payload?.source?.kind || payload?.source?.stageSource?.semanticSource || 'unknown');
}
function nativeKind(item) {
  return t(item?.native?.kind || item?.nativeKind || item?.renderKind || item?.nativeParams?.role || 'unknown');
}
function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function itemAttrs(item) {
  return { ...objectValue(item?.sourceAttributes), ...objectValue(item?.attributes) };
}
function attrValue(attrs, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(attrs, key) && t(attrs[key])) return attrs[key];
  }
  const lookup = new Map(Object.entries(attrs).map(([key, value]) => [String(key).toUpperCase(), value]));
  for (const key of keys) {
    const value = lookup.get(String(key).toUpperCase());
    if (t(value)) return value;
  }
  return '';
}
function supportKindForItem(item) {
  const attrs = itemAttrs(item);
  return supportKindFromText(
    attrValue(attrs, 'SUPPORT_KIND', 'SUPPORTKIND'),
    attrValue(attrs, 'SUPPORT_TYPE', 'SUPPORTTYPE'),
    attrValue(attrs, 'CMPSUPTYPE', 'CMP_SUP_TYPE'),
    attrValue(attrs, 'MDSSUPPTYPE', 'MDS_SUPP_TYPE'),
    attrValue(attrs, 'DTXR'),
    attrValue(attrs, 'SPRE', 'LSTU', 'ISONOTE')
  );
}
function supportComponent(item) {
  return { type: 'SUPPORT', rigid: '0', route: true, restraint: supportKindForItem(item) || 'REST' };
}
function supportRestraintArgs(item, restraintType) {
  const attrs = itemAttrs(item);
  return {
    nodeName: t(attrValue(attrs, 'SUPPORT_TAG', 'PSNO', 'PS_NO', 'NAME')),
    gap: t(attrValue(attrs, 'NODEGAP', 'CMPSUPGAP', 'GAP')),
    stiffness: t(attrValue(attrs, 'NODESTIFF', 'STIFFNESS')),
    friction: t(attrValue(attrs, 'NODEFRICTION', 'FRICTION')),
    direction: t(attrValue(attrs, 'SUPPORT_DIRECTION', 'RESTRAINT_DIRECTION', 'DIRECTION', 'DIR')) || directionForSupportKind(restraintType),
  };
}
function supportComponentRef(item, fallbackRef) {
  const attrs = itemAttrs(item);
  return t(attrValue(attrs, 'SUPPORT_TAG', 'PSNO', 'PS_NO')) || fallbackRef;
}
function componentDtxrForItem(item, component, ref, kind) {
  if (component.type === 'PIPE') return '';
  const attrs = itemAttrs(item);
  const base = t(attrValue(attrs, 'DTXR', 'DESCRIPTION', 'SPRE')) || `${component.type} ${kind} ${ref}`.trim();
  if (component.type !== 'SUPPORT') return base;
  const meta = [
    ['SUPPORT_TAG', attrValue(attrs, 'SUPPORT_TAG', 'PSNO', 'PS_NO')],
    ['CMPSUPTYPE', attrValue(attrs, 'CMPSUPTYPE', 'CMP_SUP_TYPE')],
    ['SUPPORT_KIND', attrValue(attrs, 'SUPPORT_KIND', 'SUPPORTKIND')],
    ['SUPPORT_TYPE', attrValue(attrs, 'SUPPORT_TYPE', 'SUPPORTTYPE')],
    ['NODEGAP', attrValue(attrs, 'NODEGAP', 'CMPSUPGAP', 'GAP')],
  ].filter((entry) => t(entry[1])).map((entry) => `${entry[0]}=${t(entry[1])}`);
  return meta.length ? `${base} (${meta.join(',')})` : base;
}
function itemPath(item) {
  return t(item?.source?.parentPath || item?.semantic?.parentPath || item?.semantic?.linePath);
}
function cleanPath(value) {
  return t(value).replace(/\s+\/+/g, '/').replace(/\s+/g, ' ').replace(/\/$/, '');
}
function branchBase(path) {
  const parts = cleanPath(path).split('/').filter(Boolean);
  const exact = parts.findIndex((part) => /^B\d+$/i.test(part));
  if (exact >= 0) return `/${parts.slice(0, exact + 1).join('/')}`;
  const loose = parts.findIndex((part) => /^B\d+/i.test(part));
  return loose >= 0 ? `/${parts.slice(0, loose + 1).join('/')}` : '';
}
function branchPathFromAttrs(item) {
  const attrs = itemAttrs(item);
  const explicit = t(attrValue(attrs, 'BRANCH_PATH', 'OWNER_BRANCH', 'LINE_PATH', 'PARENT_PATH'));
  if (explicit) return branchBase(explicit) || cleanPath(explicit);
  const owner = t(attrValue(attrs, 'OWNER'));
  if (owner) return branchBase(owner) || cleanPath(owner);
  return '';
}
function attachmentOwnerPath(path) {
  const marker = cleanPath(path).toUpperCase().indexOf('/ATTACHMENT ');
  return marker >= 0 ? cleanPath(path).slice(0, marker) : '';
}
function isAttachmentItem(item) {
  return Boolean(attachmentOwnerPath(itemPath(item)));
}
function classifyComponent(item, options) {
  const kind = nativeKind(item).toLowerCase();
  if (isAttachmentItem(item)) return supportComponent(item);
  if (kind.includes('segment') || kind === 'cylinder') return { type: 'PIPE', rigid: '0', route: true };
  if (kind.includes('reducer') || kind === 'snout') return { type: 'REDU', rigid: '0', route: true };
  if (kind.includes('gasket')) return { type: 'GASK', rigid: '2', route: true };
  if (kind.includes('flange') || kind.includes('weldneck') || kind.includes('raisedface')) return { type: 'FLAN', rigid: '2', route: true };
  if (kind.includes('valve') || kind.includes('seat')) return { type: 'VALV', rigid: '2', route: true };
  if (kind.includes('supportshoe') || kind.includes('support')) return supportComponent(item);
  if (options?.includeNonRouteGeometry === true && (kind === 'box' || kind === 'facetgroup')) return { type: 'OTHER', rigid: '2', route: true };
  return { type: '', rigid: '0', route: false };
}
function diameterMm(item, scale) {
  const params = item?.nativeParams || item?.geometry?.nativeParams || {};
  const radius = finite(params.radius ?? params.radiusTop ?? params.radiusBottom);
  if (radius !== null && radius > 0) return cleanNumber(radius * 2 * scale);
  const extent = bboxExtent(item?.transform?.bboxWorld || item?.geometry?.worldBbox || item?.nativeGeometry?.bboxWorld || item?.bboxWorld);
  return extent === null ? '' : cleanNumber(extent * scale);
}
function pointsForItem(item, scale) {
  const params = item?.nativeParams || {};
  const start = pt(params.startPoint), end = pt(params.endPoint);
  if (start && end) return { points: [scalePoint(start, scale), scalePoint(end, scale)], method: 'nativeParams.startPoint/endPoint' };
  const axis = localAxisEndpoints(item);
  if (axis) return { points: [scalePoint(axis.start, scale), scalePoint(axis.end, scale)], method: axis.source };
  const center = pt(params.center) || bboxCenter(item?.transform?.bboxWorld || item?.geometry?.worldBbox || item?.nativeGeometry?.bboxWorld || item?.bboxWorld);
  if (center) return { points: [scalePoint(center, scale)], method: pt(params.center) ? 'nativeParams.center' : 'bbox.center' };
  return { points: [], method: 'missing-position' };
}
function supportPointForItem(item, scale) {
  const center = pt(item?.nativeParams?.center) || bboxCenter(item?.transform?.bboxWorld || item?.geometry?.worldBbox || item?.nativeGeometry?.bboxWorld || item?.bboxWorld);
  return center ? { points: [scalePoint(center, scale)], method: 'support.center' } : pointsForItem(item, scale);
}
function branchForItem(payload, item, options) {
  const path = t(item?.source?.parentPath || item?.semantic?.parentPath || item?.semantic?.linePath);
  if (path) {
    const ownerPath = attachmentOwnerPath(path);
    if (ownerPath) return branchBase(ownerPath) || ownerPath;
    let parts = path.split('/').filter(Boolean);
    const primitiveIndex = parts.findIndex((part) => /^(CYLINDER|BOX|FACET|SNOUT|CIRCULAR|RECTANGULAR|TORUS|DISH|CONE|SPHERE)\b/i.test(part));
    if (primitiveIndex > 0) parts = parts.slice(0, primitiveIndex);
    const last = parts[parts.length - 1] || '';
    if (/^(CYLINDER|BOX|FACET|SNOUT|CIRCULAR|RECTANGULAR|TORUS|DISH|CONE|SPHERE)\b/i.test(last)) parts.pop();
    return `/${parts.map(safePathToken).filter(Boolean).join('/')}` || '/SELJSON/RVM';
  }
  const attrBranch = branchPathFromAttrs(item);
  if (attrBranch) return attrBranch;
  return t(options?.fallbackBranchName) || `/SELJSON/${safePathToken(basename(payload?.source?.fileName || payload?.source?.stageSource?.fileName))}/SELECTION`;
}
function lineKey(branchName) {
  const parts = t(branchName).split('/').filter(Boolean);
  return parts[parts.length - 1] || 'SELJSON';
}
function trace(out, row) {
  out.trace.push({ status: t(row.status), reason: t(row.reason), sourceKind: t(row.sourceKind), sourceFile: t(row.sourceFile), sourceRef: t(row.sourceRef), nativeKind: t(row.nativeKind), componentType: t(row.componentType), branchName: t(row.branchName), nodeNumber: t(row.nodeNumber), position: t(row.position), elementLengthMm: t(row.elementLengthMm), message: t(row.message) });
}
function sourceRef(row, item) {
  return t(row?.ref?.id || item?.id || item?.nativeRecord?.recordOffset || item?.source?.recordOffset || '');
}
function supportCandidateRows(payload) {
  return Array.isArray(payload?.rvmAttContext?.supportCandidates) ? payload.rvmAttContext.supportCandidates : [];
}
function supportCandidatePoint(candidate, scale) {
  const point = pt(candidate?.position || candidate?.pos || candidate?.center);
  return point ? scalePoint(point, scale) : null;
}
function supportCandidateRef(candidate) {
  return t(candidate?.sourceRef || candidate?.primitiveId || candidate?.id);
}
function supportCandidateKind(candidate) {
  return supportKindFromText(candidate?.supportKind, candidate?.supportType, candidate?.cmpSupType, candidate?.mdsSuppType, candidate?.dtxr, candidate?.restraintType) || t(candidate?.restraintType || 'REST');
}
function supportCandidateDtxr(candidate, ref) {
  const main = t(candidate?.dtxr) || `SUPPORT ${t(candidate?.method || 'rvmAttContext.supportCandidates')} ${ref}`.trim();
  const meta = [
    ['PS', candidate?.psNo],
    ['LINE', candidate?.lineNo],
    ['CMPSUPGAP', candidate?.cmpSupGap],
    ['CMPSUPTYPE', candidate?.cmpSupType],
    ['SUPPORT_KIND', candidate?.supportKind],
    ['SUPPORT_TYPE', candidate?.supportType],
    ['MDSSUPPTYPE', candidate?.mdsSuppType],
  ].filter((entry) => t(entry[1])).map((entry) => `${entry[0]}=${t(entry[1])}`);
  return meta.length ? `${main} (${meta.join(',')})` : main;
}
function addNode(out, payload, state, args) {
  const nodeNumber = String(state.nextNode);
  state.nextNode += state.nodeStep;
  const common = { branchName: args.branchName, nodeNumber, boreMm: args.boreMm, wallThickness: state.wallThickness, pipingClass: state.pipingClass, rating: state.rating, lineKey: lineKey(args.branchName), p1: state.p1, t1: state.t1, t2: state.t2, t3: state.t3, fluidDensity: state.fluidDensity };
  pushRow(out.rows, 'branchRows', common);
  pushRow(out.rows, 'coordinateRows', { branchName: args.branchName, nodeNumber, pos: pointText(args.point) });
  pushRow(out.rows, 'weightRows', { branchName: args.branchName, nodeNumber, componentType: args.componentType, rigid: args.rigid, endpoint: args.endpoint, weight: '0', componentRefNo: args.componentRefNo, elementLengthMm: args.elementLengthMm });
  if (args.dtxr) pushRow(out.rows, 'dtxrRows', { branchName: args.branchName, nodeNumber, dtxr: args.dtxr });
  if (args.restraintType) pushRow(out.rows, 'restraintRows', { branchName: args.branchName, nodeNumber, nodeName: args.nodeName || args.componentRefNo, restraintType: args.restraintType, gap: t(args.gap), stiffness: t(args.stiffness || state.defaultStiffness), friction: t(args.friction || state.defaultFriction), direction: t(args.direction) || directionForSupportKind(args.restraintType) });
  trace(out, { status: 'accepted', reason: args.method, sourceKind: sourceKind(payload), sourceFile: payload?.source?.fileName, sourceRef: args.componentRefNo, nativeKind: args.nativeKind, componentType: args.componentType, branchName: args.branchName, nodeNumber, position: pointText(args.point), elementLengthMm: args.elementLengthMm, message: 'emitted custom input node' });
}
function addSupportCandidate(out, payload, state, candidate, scale, branchNames) {
  const point = supportCandidatePoint(candidate, scale);
  if (!point) return false;
  const branchName = t(candidate?.branchName || candidate?.ownerBranchPath || candidate?.linePath || candidate?.attachmentPath || '/SELJSON/RVM/SUPPORTS');
  const ref = supportCandidateRef(candidate);
  const kind = supportCandidateKind(candidate);
  branchNames.add(branchName);
  out.summary.emittedItems += 1;
  out.summary.emittedNodes += 1;
  addNode(out, payload, state, { branchName, point, componentType: 'SUPPORT', rigid: '0', endpoint: '1', componentRefNo: t(candidate?.psNo || ref || `SUPPORT-${out.summary.emittedItems}`), nodeName: t(candidate?.psNo || ref), elementLengthMm: t(candidate?.elementLengthMm), boreMm: t(candidate?.boreMm), dtxr: supportCandidateDtxr(candidate, ref), restraintType: kind, gap: t(candidate?.cmpSupGap || candidate?.gap || candidate?.nodeGap), friction: t(candidate?.friction || candidate?.nodeFriction), direction: t(candidate?.direction) || directionForSupportKind(kind), nativeKind: t(candidate?.nativeKind || 'rvm-support-candidate'), method: t(candidate?.method || 'rvmAttContext.supportCandidates') });
  trace(out, { status: 'accepted', reason: 'support-candidate', sourceKind: sourceKind(payload), sourceFile: payload?.source?.fileName, sourceRef: ref, nativeKind: t(candidate?.nativeKind || 'rvm-support-candidate'), componentType: 'SUPPORT', branchName, position: pointText(point), elementLengthMm: t(candidate?.elementLengthMm), message: 'support emitted from rvmAttContext.supportCandidates' });
  return true;
}
function normalizeOptions(options) {
  return {
    nodeStart: finite(options?.nodeStart) ?? 10,
    nodeStep: finite(options?.nodeStep) ?? 10,
    wallThickness: t(options?.wallThicknessMm ?? options?.wallThickness),
    pipingClass: t(options?.pipingClass || options?.defaultPipingClass),
    rating: t(options?.rating || options?.defaultRating),
    p1: t(options?.p1 || options?.pressure1),
    t1: t(options?.t1 || options?.temperature1),
    t2: t(options?.t2 || options?.temperature2),
    t3: t(options?.t3 || options?.temperature3),
    fluidDensity: t(options?.fluidDensity),
    defaultStiffness: t(options?.defaultStiffness || '1.751270E+12'),
    defaultFriction: t(options?.defaultFriction || '0.3'),
  };
}
function parsePayload(raw) {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!payload || typeof payload !== 'object') throw new Error('SelJson input is empty or not a JSON object.');
  if (isViewerSelectionPayload(payload)) return normalizeViewerSelectionPayload(payload);
  if (payload.schema !== SCHEMA) throw new Error(`SelJson schema must be ${SCHEMA}; received ${t(payload.schema) || 'missing'}.`);
  return payload;
}

function isViewerSelectionPayload(payload) {
  return payload?.schema == null && Array.isArray(payload?.selected);
}

function viewerSelectionSource(source) {
  if (source && typeof source === 'object') return source;
  const fileName = t(source) || 'viewer-selection.json';
  return { fileName, kind: 'viewer-selection', stageSource: { kind: 'viewer-selection', fileName } };
}

function normalizeViewerSelectionPayload(payload) {
  return {
    ...payload,
    schema: SCHEMA,
    source: viewerSelectionSource(payload.source),
    selection: {
      ...(payload.selection || {}),
      items: payload.selected,
    },
  };
}

export function parseSelJsonToInputSource(raw, options) {
  const payload = parsePayload(raw);
  const selectedItems = Array.isArray(payload?.selection?.items) ? payload.selection.items : [];
  const cfg = normalizeOptions(options || {});
  const out = { rows: { branchRows: [], coordinateRows: [], weightRows: [], restraintRows: [], dtxrRows: [] }, trace: [], diagnostics: [], summary: { schema: 'seljson-custom-input-source/v1', sourceKind: sourceKind(payload), sourceFile: t(payload?.source?.fileName), units: sourceUnits(payload) || 'unknown', selectedItems: selectedItems.length, emittedItems: 0, emittedNodes: 0, skippedItems: 0, branches: 0 } };
  const state = { ...cfg, nextNode: cfg.nodeStart, nodeStep: cfg.nodeStep };
  const scale = scaleToMm(payload, options || {});
  const branchNames = new Set();
  const emittedSupportRefs = new Set();
  const preferredSupportRefs = new Set(supportCandidateRows(payload).map(supportCandidateRef).filter(Boolean));
  for (const selected of selectedItems) {
    const item = selected?.item || {};
    const kind = nativeKind(item);
    const component = classifyComponent(item, options || {});
    const ref = sourceRef(selected, item);
    if (component.type === 'SUPPORT' && preferredSupportRefs.has(ref)) {
      trace(out, { status: 'skipped', reason: 'support-candidate-preferred', sourceKind: sourceKind(payload), sourceFile: payload?.source?.fileName, sourceRef: ref, nativeKind: kind, componentType: component.type, message: 'selected support primitive is emitted from enriched supportCandidates instead' });
      continue;
    }
    if (!component.route) {
      out.summary.skippedItems += 1;
      trace(out, { status: 'skipped', reason: 'unsupported-native-kind', sourceKind: sourceKind(payload), sourceFile: payload?.source?.fileName, sourceRef: ref, nativeKind: kind, message: 'geometry is not route-safe for initial SelJson->InputXML conversion' });
      continue;
    }
    const extracted = component.type === 'SUPPORT' ? supportPointForItem(item, scale) : pointsForItem(item, scale);
    if (!extracted.points.length) {
      out.summary.skippedItems += 1;
      trace(out, { status: 'skipped', reason: 'missing-position', sourceKind: sourceKind(payload), sourceFile: payload?.source?.fileName, sourceRef: ref, nativeKind: kind, componentType: component.type, message: 'no start/end, center, or bbox position found' });
      continue;
    }
    const branchName = branchForItem(payload, item, options || {});
    const boreMm = diameterMm(item, scale);
    const length = extracted.points.length > 1 ? cleanNumber(dist(extracted.points[0], extracted.points[1])) : cleanNumber(bboxExtent(item?.transform?.bboxWorld || item?.geometry?.worldBbox || item?.nativeGeometry?.bboxWorld || item?.bboxWorld) * scale);
    const dtxr = componentDtxrForItem(item, component, ref, kind);
    const points = extracted.points.length > 1 ? extracted.points : [extracted.points[0]];
    const supportArgs = component.type === 'SUPPORT' ? supportRestraintArgs(item, component.restraint || 'REST') : {};
    branchNames.add(branchName);
    out.summary.emittedItems += 1;
    const fallbackRef = `${component.type}-${out.summary.emittedItems}`;
    const componentRefNo = component.type === 'SUPPORT' ? supportComponentRef(item, ref || fallbackRef) : ref || fallbackRef;
    for (let index = 0; index < points.length; index += 1) {
      addNode(out, payload, state, { branchName, point: points[index], componentType: component.type, rigid: component.rigid, endpoint: String(index + 1), componentRefNo, elementLengthMm: length, boreMm, dtxr, restraintType: component.restraint || '', nativeKind: kind, method: extracted.method, ...supportArgs });
      out.summary.emittedNodes += 1;
    }
    if (extracted.points.length === 1 && component.type === 'SUPPORT') {
      const p = extracted.points[0];
      emittedSupportRefs.add(ref);
      trace(out, { status: 'accepted', reason: 'support-restraint', sourceKind: sourceKind(payload), sourceFile: payload?.source?.fileName, sourceRef: ref, nativeKind: kind, componentType: component.type, branchName, position: pointText(p), message: 'support emitted as node with CustomRestraint' });
    }
  }
  for (const candidate of supportCandidateRows(payload)) {
    const ref = supportCandidateRef(candidate);
    if (ref && emittedSupportRefs.has(ref)) continue;
    if (addSupportCandidate(out, payload, state, candidate, scale, branchNames) && ref) emittedSupportRefs.add(ref);
  }
  out.summary.branches = branchNames.size;
  if (!out.summary.emittedNodes) out.diagnostics.push({ severity: 'error', code: 'SELJSON_NO_ROUTE_NODES', message: 'No route-safe nodes were emitted from the selected converter JSON.' });
  if (!payload?.rvmAttContext?.branches?.length) out.diagnostics.push({ severity: 'warning', code: 'SELJSON_MISSING_LINE_CONTEXT', message: 'Conv JSON rvmAttContext.branches is empty; branch grouping uses source paths or a fallback branch.' });
  return out;
}

export function selJsonTraceToCsv(traceRows) {
  const rows = Array.isArray(traceRows) ? traceRows : [];
  return [TRACE_COLUMNS.join(','), ...rows.map((row) => TRACE_COLUMNS.map((key) => `"${t(row?.[key]).replace(/"/g, '""')}"`).join(','))].join('\n');
}
