import { canonicalJson } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function rewriteCrefs(value, references) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => rewriteCrefs(item, references));
    return;
  }
  if (typeof value.CREF === 'string' && references.has(value.CREF)) {
    value.CREF = references.get(value.CREF);
  }
  Object.values(value).forEach((item) => rewriteCrefs(item, references));
}
async function namespaceZoneBranches(zone) {
  const namespace = (await sha256Hex(
    canonicalJson({ zoneId: zone.zoneId }))).slice(0, 12);
  const references = new Map();
  const branches = zone.branches.map((input, index) => {
    const branch = structuredClone(input);
    const oldId = String(branch.id || branch.attributes?.REF || '');
    const oldName = String(branch.name || '');
    const suffix = String(index + 1).padStart(4, '0');
    const id = `FBX-ZONE-${namespace}-BRANCH-${suffix}`;
    const name = `FBX Zone ${namespace} Branch ${index + 1}`;
    if (oldId) references.set(oldId, id);
    if (oldName) references.set(oldName, name);
    branch.id = id;
    branch.name = name;
    branch.attributes = {
      ...(branch.attributes || {}), REF: id, sourceZoneId: zone.zoneId,
      sourceBranchId: oldId || null, sourceBranchName: oldName || null,
    };
    return branch;
  });
  branches.forEach((branch) => rewriteCrefs(branch, references));
  return branches;
}
function identityCollector() {
  const identities = new Map(), duplicates = new Set();
  const branchReferences = new Set(), unresolvedCrefs = new Set();
  return { identities, duplicates, branchReferences, unresolvedCrefs };
}
function recordIdentity(state, value, label) {
  const text = String(value || '');
  if (!text) { state.duplicates.add(`<missing:${label}>`); return; }
  if (state.identities.has(text)) state.duplicates.add(text);
  else state.identities.set(text, label);
}
function scanIdentities(node, label, state) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item, index) => scanIdentities(item, `${label}[${index}]`, state));
    return;
  }
  const id = String(node.id || ''), ref = String(node.attributes?.REF || '');
  if (node.type === 'BRANCH') {
    if (id && ref && id !== ref) state.duplicates.add(`MISMATCH:${id}:${ref}`);
    recordIdentity(state, id || ref, `${label}.identity`);
    if (id) state.branchReferences.add(id);
    if (ref) state.branchReferences.add(ref);
    if (typeof node.name === 'string' && node.name) state.branchReferences.add(node.name);
  } else if (typeof node.id === 'string' || typeof node.attributes?.REF === 'string') {
    if (id && ref && id !== ref) state.duplicates.add(`MISMATCH:${id}:${ref}`);
    recordIdentity(state, id || ref, `${label}.identity`);
  }
  Object.values(node).forEach((item) => scanIdentities(item, label, state));
}
function scanCrefs(node, state) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((item) => scanCrefs(item, state)); return; }
  if (typeof node.CREF === 'string' && !state.branchReferences.has(node.CREF)) {
    state.unresolvedCrefs.add(node.CREF);
  }
  Object.values(node).forEach((item) => scanCrefs(item, state));
}
function identityReport(branches) {
  const state = identityCollector();
  branches.forEach((branch, index) => scanIdentities(branch, `branch[${index}]`, state));
  branches.forEach((branch) => scanCrefs(branch, state));
  return {
    duplicateIdentifiers: [...state.duplicates].sort(compareText),
    unresolvedCrefs: [...state.unresolvedCrefs].sort(compareText),
  };
}
export async function mergeWholeModelBranches(zoneResults) {
  const merged = [];
  for (const zone of zoneResults) {
    if (zone.status === 'STAGEDJSON_PASS') {
      merged.push(...await namespaceZoneBranches(zone));
    }
  }
  return { merged, ...identityReport(merged) };
}
