export const XML_CII_JSON_TRACE_TREE_SCHEMA = 'xml-cii-json-trace-tree/v3';

const clean = (value) => String(value ?? '').trim();
const upper = (value) => clean(value).toUpperCase();
const jsonValue = (value) => (value && typeof value === 'object' ? JSON.stringify(value) : clean(value));
const uniq = (items = []) => [...new Set(items.map(clean).filter(Boolean))];

function parseMaybeObject(value) {
  if (value && typeof value === 'object') return value;
  try { const parsed = JSON.parse(clean(value)); return parsed && typeof parsed === 'object' ? parsed : null; } catch { return null; }
}

function componentPath(value) {
  const raw = clean(value), idx = raw.indexOf('.attributes');
  return idx >= 0 ? raw.slice(0, idx) : raw;
}

function mapKey(value) {
  return clean(value).replace(/\s+/g, ' ');
}

function pickAxis(source, names) {
  const keys = Object.keys(source || {});
  const hit = keys.find((key) => names.includes(upper(key)));
  return hit ? source[hit] : '';
}

function axisText(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return clean(value);
  return String(Math.round(num * 1000) / 1000);
}

function positionFromValue(value) {
  // Try JSON object (object or parseable JSON) first
  const source = parseMaybeObject(value);
  if (source) {
    const e = axisText(pickAxis(source, ['E', 'EAST', 'EASTING', 'X']));
    const n = axisText(pickAxis(source, ['N', 'NORTH', 'NORTHING', 'Y']));
    const el = axisText(pickAxis(source, ['EL', 'ELEV', 'ELEVATION', 'Z']));
    if (e || n || el) {
      const label = `E=${e || '?'} N=${n || '?'} EL=${el || '?'}`;
      return Object.freeze({ key: label.replace(/\s+/g, ''), label });
    }
  }
  // Fallback: parse space-/comma-separated "X Y Z" coordinate string
  // (format used by staged JSON from XML <Position> elements)
  const str = clean(value);
  if (str) {
    const nums = str.split(/[\s,]+/).map(Number).filter(Number.isFinite);
    if (nums.length >= 3) {
      const [x, y, z] = nums;
      const e = axisText(x), n = axisText(y), el = axisText(z);
      const label = `E=${e} N=${n} EL=${el}`;
      return Object.freeze({ key: label.replace(/\s+/g, ''), label });
    }
  }
  return null;
}

function isPositionRow(row = {}) {
  const text = upper(`${row.field || ''} ${row.sourceAttributeName || ''} ${row.sourcePath || ''}`);
  return /(^|[^A-Z])(POS|APOS|LPOS|BPOS|HPOS|TPOS|SPOS|EPOS|POSITION)([^A-Z]|$)/.test(text);
}

function setPositionKey(map, key, pos) {
  const cleanKey = mapKey(key);
  if (!cleanKey || !pos) return;
  const current = map.get(cleanKey);
  if (!current) {
    map.set(cleanKey, pos);
    return;
  }
  if (current.key !== pos.key) map.set(cleanKey, null);
}

function positionLookupKeys(row = {}) {
  const keys = [];
  const path = componentPath(row.sourcePath || row.jsonPath);
  const branch = traceTreeBranchKey(row);
  const nodeNumber = clean(row.nodeNumber);
  if (path) keys.push(path);
  if (branch && nodeNumber) keys.push(`branch-node:${branch}:${nodeNumber}`);
  if (nodeNumber) keys.push(`node:${nodeNumber}`);
  return uniq(keys);
}

function buildPositionIndex(traceRows = []) {
  const map = new Map();
  for (const row of traceRows || []) {
    if (!isPositionRow(row)) continue;
    const pos = positionFromValue(row.finalValue || row.sourceRawValue || row.value);
    for (const key of positionLookupKeys(row)) setPositionKey(map, key, pos);
  }
  return map;
}

function positionFromIndex(positionMap, row = {}) {
  for (const key of positionLookupKeys(row)) {
    const pos = positionMap.get(mapKey(key));
    if (pos) return pos;
  }
  return null;
}

function psTokenFromRow(row = {}) {
  const direct = clean(row.matchedToken || row.matchedText);
  if (direct) return direct;
  const text = `${row.nodeName || ''} ${row.sourceAttributeName || ''} ${row.field || ''} ${row.sourcePath || ''} ${row.jsonPath || ''} ${row.finalValue || ''} ${row.sourceRawValue || ''} ${row.value || ''}`;
  const match = text.match(/PS-\d+(?:\.\d+)?/i);
  return match ? match[0].toUpperCase() : '';
}

export function traceTreeBucketKey(row = {}) {
  const scope = clean(row.xmlTraceScope);
  if (/^DTXR_POS/.test(scope)) return 'DTXR-POS';
  if (/^DTXR_PS/.test(scope)) return 'DTXR-PS';
  if (/^BRANCH_/.test(scope)) return 'Branch';
  return scope || 'Other';
}

export function traceTreeBranchKey(row = {}) {
  return clean(row.branchName || row.stagedBranchKey || row.xmlBranchKey || 'Unassigned branch');
}

/**
 * Returns the group key/label for a trace row.
 * `resolved` is true only when the group maps to a concrete coordinate (DTXR-POS)
 * or a matched PS token (DTXR-PS) — i.e. a 100% positional match.
 * Unresolved fallback groups carry resolved=false and never receive a concatValue badge.
 */
export function traceTreeGroupKey(row = {}, positionMap = new Map()) {
  const bucket = traceTreeBucketKey(row);
  const explicitLabel = clean(row.xmlTraceGroupLabel);
  if ((bucket === 'DTXR-POS' || bucket === 'DTXR-PS') && explicitLabel) {
    const explicitKey = clean(row.xmlTraceGroupKey || explicitLabel).replace(/\s+/g, '');
    return Object.freeze({ key: explicitKey, label: explicitLabel, resolved: row.xmlTraceGroupResolved !== false });
  }
  if (bucket === 'DTXR-POS') {
    const explicitPosition = positionFromValue(row.position || row.xmlPosition || row.matchedKey);
    if (explicitPosition) return Object.freeze({ key: explicitPosition.key, label: explicitPosition.label, resolved: true });
    const pos = positionFromIndex(positionMap, row);
    if (pos) return Object.freeze({ key: pos.key, label: pos.label, resolved: true });
    return Object.freeze({ key: `NODE-${clean(row.nodeNumber) || 'UNKNOWN'}`, label: `POS unresolved; node ${clean(row.nodeNumber) || '?'}`, resolved: false });
  }
  if (bucket === 'DTXR-PS') {
    const token = psTokenFromRow(row);
    return Object.freeze({ key: token || `NODE-${clean(row.nodeNumber) || 'UNKNOWN'}`, label: token ? `PS=${token}` : `PS unresolved; node ${clean(row.nodeNumber) || '?'}`, resolved: !!token });
  }
  return Object.freeze({ key: bucket, label: bucket, resolved: false });
}

/**
 * Builds one leaf node for the tree.
 * `dtxrValue` is the annotated text (DTXR_desc(NAME=x,CMPSUPGAP=y)) aggregated into the group's concatValue.
 */
export function traceTreeBoreKey(row = {}) {
  const bore = clean(row.boreMm || row.bore || '');
  if (!bore) return '';
  const num = parseFloat(bore);
  return Number.isFinite(num) ? `${Math.round(num)} mm` : bore;
}
export function createTraceTreeLeaf(row = {}, index = 0, positionMap = new Map()) {
  const pos = positionFromIndex(positionMap, row);
  const rawDtxr = clean(row.finalValue || row.sourceRawValue || row.value);
  const name = clean(row.name || '');
  const cmpSupGap = clean(row.cmpSupGap || '');
  const annotation = buildDtxrAnnotation(name, cmpSupGap);
  return Object.freeze({
    jsonNodeNo: clean(row.jsonNodeNo || row._jsonNodeNo || index + 1),
    matchType: clean(row.xmlTraceScope),
    nodeNumber: clean(row.nodeNumber),
    objectType: clean(row.sourceObjectType || row.objectType),
    field: clean(row.field || row.sourceAttributeName),
    value: jsonValue(row.finalValue || row.sourceRawValue || row.value),
    dtxrValue: rawDtxr ? `${rawDtxr}${annotation}` : '',
    name,
    cmpSupGap,
    sourcePath: clean(row.sourcePath || row.jsonPath),
    positionLabel: clean(row.positionLabel || row.xmlTraceGroupLabel) || pos?.label || '',
    boreMm: clean(row.boreMm || ''),
  });
}

function buildDtxrAnnotation(name, cmpSupGap) {
  const parts = [];
  if (name) parts.push(`NAME=${name}`);
  if (cmpSupGap) parts.push(`CMPSUPGAP=${cmpSupGap}`);
  return parts.length ? `(${parts.join(',')})` : '';
}
function emptyGroup(label, resolved = false) { return { label, resolved, count: 0, rows: [] }; }
function emptyBucket(label) { return { label, count: 0, groups: new Map() }; }
function emptyBoreGroup(label) { return { label, count: 0, buckets: new Map() }; }

/**
 * Finalises groups, computing concatValue.
 *
 * delimiterOpts = { useDelimiter: bool, delimiter: string, joinMode: 'unique'|'first'|'all' }
 *
 * concatValue rules:
 *  - Only computed for resolved=true groups (100% coordinate / PS-token match).
 *  - When useDelimiter=false (default): first non-empty unique value (backward-compatible).
 *  - When useDelimiter=true:
 *      joinMode='unique' (default) → unique values joined with delimiter (splittable back to hierarchy)
 *      joinMode='first'            → first unique value only
 *      joinMode='all'              → all values including duplicates
 */
function orderedGroups(groupMap, rowLimit, groupLimit, delimiterOpts = {}) {
  const groups = [...groupMap.values()].slice(0, groupLimit);
  const delim = delimiterOpts.delimiter || '|';
  const mode = delimiterOpts.joinMode || 'unique';
  const useDelim = delimiterOpts.useDelimiter === true;
  return Object.freeze(groups.map((group) => {
    const rawValues = group.rows.map((r) => clean(r.dtxrValue)).filter(Boolean);
    const uniqueValues = [...new Set(rawValues)];
    let concatValue = '';
    if (group.resolved) {
      // Only 100%-resolved groups get a concatValue that propagates to <DTXR_POS>/<DTXR_PS>
      concatValue = useDelim
        ? (mode === 'first' ? (uniqueValues[0] || '')
          : mode === 'all'  ? rawValues.join(delim)
          :                   uniqueValues.join(delim))   // 'unique' — deduplicated, splittable
        : (uniqueValues[0] || '');                        // OFF: first value only
    }
    return Object.freeze({
      label: group.label,
      resolved: group.resolved,
      count: group.count,
      truncated: Math.max(0, group.rows.length - rowLimit),
      rows: Object.freeze(group.rows.slice(0, rowLimit)),
      concatValue,
    });
  }));
}

function orderedBoreGroups(boreMap, rowLimit, groupLimit, delimiterOpts) {
  return [...boreMap.values()].map((bore) => Object.freeze({
    boreKey: bore.label,
    count: bore.count,
    buckets: Object.freeze(orderedBuckets(bore.buckets, rowLimit, groupLimit, delimiterOpts)),
  }));
}
function orderedBuckets(bucketMap, rowLimit, groupLimit, delimiterOpts) {
  return ['DTXR-POS', 'DTXR-PS', 'Branch', 'Other'].map((label) => {
    const bucket = bucketMap.get(label) || emptyBucket(label);
    const groups = orderedGroups(bucket.groups, rowLimit, groupLimit, delimiterOpts);
    const samples = uniq(groups.flatMap((group) => group.rows.slice(0, 3).map((row) => `#${row.jsonNodeNo} ${row.objectType} node ${row.nodeNumber} — ${row.field}: ${row.value}`))).slice(0, 3);
    return Object.freeze({ label, count: bucket.count, groupCount: bucket.groups.size, groups, samples: Object.freeze(samples) });
  }).filter((bucket) => bucket.count > 0);
}

export function buildJsonTraceTree(traceRows = [], options = {}) {
  const rowLimit = Number.isFinite(options.rowLimit) ? Math.max(1, options.rowLimit) : 40;
  const groupLimit = Number.isFinite(options.groupLimit) ? Math.max(1, options.groupLimit) : 120;
  const delimiterOpts = {
    useDelimiter: options.useDelimiter === true,
    delimiter: options.delimiter || '|',
    joinMode: options.joinMode || 'unique',
  };
  const positionMap = buildPositionIndex(traceRows);
  const branchMap = new Map();
  for (const [index, row] of (traceRows || []).entries()) {
    const branchName = traceTreeBranchKey(row);
    const boreKey = traceTreeBoreKey(row) || 'Unknown Bore';
    const bucketKey = traceTreeBucketKey(row);
    const group = traceTreeGroupKey(row, positionMap);
    if (!branchMap.has(branchName)) branchMap.set(branchName, { branchName, count: 0, bores: new Map() });
    const branch = branchMap.get(branchName);
    if (!branch.bores.has(boreKey)) branch.bores.set(boreKey, emptyBoreGroup(boreKey));
    const boreNode = branch.bores.get(boreKey);
    if (!boreNode.buckets.has(bucketKey)) boreNode.buckets.set(bucketKey, emptyBucket(bucketKey));
    const bucket = boreNode.buckets.get(bucketKey);
    if (!bucket.groups.has(group.key)) bucket.groups.set(group.key, emptyGroup(group.label, group.resolved));
    const groupNode = bucket.groups.get(group.key);
    branch.count += 1; boreNode.count += 1; bucket.count += 1; groupNode.count += 1;
    groupNode.rows.push(createTraceTreeLeaf(row, index, positionMap));
  }
  const branches = [...branchMap.values()].map((branch) => Object.freeze({
    branchName: branch.branchName,
    count: branch.count,
    bores: Object.freeze(orderedBoreGroups(branch.bores, rowLimit, groupLimit, delimiterOpts)),
  }));
  return Object.freeze({ schema: XML_CII_JSON_TRACE_TREE_SCHEMA, totalRows: traceRows.length || 0, branches: Object.freeze(branches) });
}
