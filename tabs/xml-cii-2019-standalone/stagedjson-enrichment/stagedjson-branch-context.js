/**
 * Functionality: extracts element-aware contexts from stagedJson while
 * retaining stable hierarchy paths and geometry evidence. Parameters:
 * stagedJson hierarchy and visible resolver config. Outputs: flat immutable
 * context rows. Fallback: absent optional fields remain null or empty.
 */

const CONTAINER_TYPES = new Set(['BRANCH', 'SITE', 'ZONE', 'GROUP', 'WORLD']);

export function collectStagedJsonBranchContexts(stagedJson, config) {
  const rows = [];
  walk(Array.isArray(stagedJson) ? stagedJson : [stagedJson], [], [], '', rows, config);
  return rows;
}

export function stagedJsonGeometrySnapshot(stagedJson) {
  return collectGeometry(Array.isArray(stagedJson) ? stagedJson : [stagedJson], []);
}

function walk(nodes, indexPath, namePath, inheritedBranch, rows, config) {
  nodes.forEach((node, index) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const type = text(node.type).toUpperCase() || 'UNKNOWN';
    const nodePath = [...indexPath, index];
    const names = [...namePath, text(node.name) || `${type}-${index}`];
    const branch = type === 'BRANCH' ? names.join('/') : inheritedBranch;
    if (!CONTAINER_TYPES.has(type) || type === 'BRANCH') rows.push(buildContext(node, type, nodePath, names, branch, config));
    walk(Array.isArray(node.children) ? node.children : [], [...nodePath, 'children'], names, branch, rows, config);
  });
}

function buildContext(node, type, indexPath, names, branch, config) {
  const attributes = plain(node.attributes);
  const sourceAttributes = plain(node.sourceAttributes);
  const attrs = { ...attributes, ...sourceAttributes };
  const start = point(attrs.APOS);
  const end = point(attrs.LPOS);
  return Object.freeze({
    indexPath: Object.freeze(indexPath),
    nodeId: text(node.id) || names.join('/'),
    name: text(node.name),
    type,
    hierarchyPath: names.join('/'),
    branchName: branch || names.slice(0, -1).join('/'),
    attributes: Object.freeze(attrs),
    lineHints: Object.freeze(lineHints(node, attrs, names, branch, config)),
    nominalBoreMm: bore(attrs),
    componentLengthMm: length(attrs, start, end),
    rating: firstText(attrs, ['RATING', 'PRESSURE_RATING', 'CLASS']),
    schedule: firstText(attrs, ['SCHEDULE', 'SCH']),
    start,
    end,
    center: point(attrs.POS) || point(attrs.CENTER) || midpoint(start, end),
  });
}

function lineHints(node, attrs, names, branch, config) {
  const attributeHints = [...(config?.lineKeyAttributeNames || []), ...(config?.branchAttributeNames || [])].map((key) => attrs[key]).filter(hasText);
  return [...new Set([...attributeHints, node.path, node.name, branch, ...names].map(text).filter(Boolean))];
}

function collectGeometry(nodes, path) {
  return nodes.flatMap((node, index) => {
    if (!node || typeof node !== 'object') return [];
    const attrs = plain(node.attributes);
    const row = { path: [...path, index].join('/'), type: node.type, APOS: attrs.APOS ?? null, LPOS: attrs.LPOS ?? null, POS: attrs.POS ?? null, CENTER: attrs.CENTER ?? null };
    return [row, ...collectGeometry(Array.isArray(node.children) ? node.children : [], [...path, index, 'children'])];
  });
}

function bore(attrs) { return number(firstValue(attrs, ['ABORE', 'HBORE', 'HBOR', 'LBORE', 'LBORE', 'BORE', 'NOMINAL_BORE_MM', 'NPS'])); }
function length(attrs, start, end) { const direct = number(firstValue(attrs, ['LENGTH_MM', 'LENGTH', 'COMPONENT_LENGTH_MM'])); return direct ?? (start && end ? distance(start, end) : null); }
function point(value) { if (!value) return null; let source = value; if (typeof source === 'string' && source.trim().startsWith('{')) { try { source = JSON.parse(source); } catch { return null; } } if (!source || typeof source !== 'object') return null; const x = number(source.x ?? source.X), y = number(source.y ?? source.Y), z = number(source.z ?? source.Z); return x !== null && y !== null && z !== null ? Object.freeze({ x, y, z }) : null; }
function midpoint(left, right) { return left && right ? Object.freeze({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 }) : left || right || null; }
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z); }
function firstValue(row, keys) { for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== '') return row[key]; return null; }
function firstText(row, keys) { return text(firstValue(row, keys)); }
function number(value) { if (value === null || value === undefined || value === '') return null; const match = String(value).replace(/,/g, '').match(/[-+]?\d*\.?\d+/); const parsed = match ? Number(match[0]) : NaN; return Number.isFinite(parsed) ? parsed : null; }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function hasText(value) { return text(value) !== ''; }
function text(value) { return String(value ?? '').trim(); }
