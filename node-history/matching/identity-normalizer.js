const KIND_ALIASES = Object.freeze({
  SOURCE_PORT: 'STABLE_SOURCE_PORT',
  SOURCE_PORT_ID: 'STABLE_SOURCE_PORT',
  STABLE_PORT: 'STABLE_SOURCE_PORT',
  STABLE_SOURCE_PORT: 'STABLE_SOURCE_PORT',
  SOURCE_ENTITY: 'STABLE_SOURCE_ENTITY',
  SOURCE_ENTITY_ID: 'STABLE_SOURCE_ENTITY',
  STABLE_ENTITY: 'STABLE_SOURCE_ENTITY',
  STABLE_SOURCE_ENTITY: 'STABLE_SOURCE_ENTITY',
  REF: 'APPROVED_ALIAS',
  TAG: 'APPROVED_ALIAS',
  SOURCE_REF: 'APPROVED_ALIAS',
  DURABLE_TAG: 'APPROVED_ALIAS',
  APPROVED_ALIAS: 'APPROVED_ALIAS',
  REVIEWED_ALIAS: 'REVIEWED_ALIAS',
  PREVIOUSLY_REVIEWED_ALIAS: 'REVIEWED_ALIAS',
  TOPOLOGY_ANCHOR: 'TOPOLOGY_ANCHOR',
  ANCHOR: 'TOPOLOGY_ANCHOR',
  HISTORY_NODE_ID: 'SAME_HISTORY_REACTIVATION',
  SAME_HISTORY: 'SAME_HISTORY_REACTIVATION',
  SAME_HISTORY_REACTIVATION: 'SAME_HISTORY_REACTIVATION',
});
const TIERS = Object.freeze({
  STABLE_SOURCE_PORT: 1,
  STABLE_SOURCE_ENTITY: 1,
  APPROVED_ALIAS: 2,
  REVIEWED_ALIAS: 3,
  TOPOLOGY_ANCHOR: 4,
  SAME_HISTORY_REACTIVATION: 5,
});
export const EXACT_EVIDENCE_KINDS = Object.freeze(Object.keys(TIERS));
export function normalizeIdentityEvidence(raw, context = {}, policy = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rawKind = clean(raw.kind || raw.type || raw.identityKind).toUpperCase();
  const kind = KIND_ALIASES[rawKind];
  if (!kind) return null;
  const aliasType = aliasTypeFor(kind, rawKind, raw);
  const namespace = normalizeNamespace(raw, context, policy);
  const value = normalizeValue(raw.value ?? raw.id ?? raw.alias, kind, aliasType, policy);
  if (!namespace || !value) return null;
  const authority = clean(raw.authority || raw.authorityRecordId || raw.reviewId);
  const approval = approvalState(kind, raw, authority);
  return Object.freeze({
    kind,
    tier: TIERS[kind],
    namespace,
    aliasType,
    value,
    rawValue: clean(raw.value ?? raw.id ?? raw.alias),
    authority,
    approval,
    sourcePath: clean(raw.sourcePath || context.sourcePath),
  });
}
export function collectCurrentIdentityEvidence(node, sourceInventory = {}, policy = {}) {
  const context = evidenceContext(node, sourceInventory, policy);
  const raw = [...directNodeEvidence(node), ...inventoryEvidence(node, sourceInventory)];
  return normalizeEvidenceSet(raw, context, policy);
}
export function collectHistoricalIdentityEvidence(history, parent = {}, policy = {}) {
  const context = evidenceContext(history, parent, policy);
  const raw = [...directHistoryEvidence(history), ...(history.identityEvidence || [])];
  return normalizeEvidenceSet(raw, context, policy);
}
export function evidenceToken(evidence) {
  const domain = ['APPROVED_ALIAS', 'REVIEWED_ALIAS'].includes(evidence.kind) ? 'ALIAS' : evidence.kind;
  return [domain, evidence.namespace, evidence.aliasType, evidence.value].join('\u0000');
}
export function strongestEvidence(evidence) {
  return [...evidence].sort(compareEvidence)[0] || null;
}
export function compareEvidence(left, right) {
  return left.tier - right.tier
    || evidenceToken(left).localeCompare(evidenceToken(right))
    || left.authority.localeCompare(right.authority)
    || left.sourcePath.localeCompare(right.sourcePath);
}
export function stableEvidenceTokens(evidence) {
  return new Set(evidence
    .filter((row) => row.kind === 'STABLE_SOURCE_PORT' || row.kind === 'STABLE_SOURCE_ENTITY')
    .map(evidenceToken));
}
export function hasAutomaticAuthority(evidence) {
  return evidence.approval === 'APPROVED';
}
function normalizeEvidenceSet(rawEvidence, context, policy) {
  const byToken = new Map();
  for (const raw of rawEvidence) {
    const normalized = normalizeIdentityEvidence(raw, context, policy);
    if (!normalized) continue;
    const key = `${evidenceToken(normalized)}\u0000${normalized.approval}`;
    const current = byToken.get(key);
    if (!current || compareEvidence(normalized, current) < 0) byToken.set(key, normalized);
  }
  return Object.freeze([...byToken.values()].sort(compareEvidence));
}
function directNodeEvidence(node) {
  const rows = [];
  addScalar(rows, 'STABLE_SOURCE_ENTITY', node.stableSourceEntityId ?? node.sourceEntityId);
  addScalar(rows, 'STABLE_SOURCE_PORT', node.stableSourcePortId ?? node.sourcePortId);
  addMany(rows, 'STABLE_SOURCE_ENTITY', node.sourceEntityIds);
  addMany(rows, 'STABLE_SOURCE_PORT', node.sourcePortIds);
  rows.push(...asArray(node.identityEvidence));
  rows.push(...aliasRows(node.aliases, 'APPROVED_ALIAS'));
  rows.push(...aliasRows(node.reviewedAliases, 'REVIEWED_ALIAS'));
  rows.push(...aliasRows(node.topologyAnchors, 'TOPOLOGY_ANCHOR'));
  rows.push(...aliasRows(node.sameHistoryEvidence, 'SAME_HISTORY_REACTIVATION'));
  return rows;
}
function directHistoryEvidence(history) {
  const rows = [];
  addScalar(rows, 'STABLE_SOURCE_ENTITY', history.stableSourceEntityId ?? history.sourceEntityId);
  addScalar(rows, 'STABLE_SOURCE_PORT', history.stableSourcePortId ?? history.sourcePortId);
  addMany(rows, 'STABLE_SOURCE_ENTITY', history.sourceEntityIds);
  addMany(rows, 'STABLE_SOURCE_PORT', history.sourcePortIds);
  addScalar(rows, 'SAME_HISTORY_REACTIVATION', history.historyNodeId, 'REGISTRY_IDENTITY');
  rows.push(...aliasRows(history.sourceAliases, 'APPROVED_ALIAS', 'REGISTRY_SOURCE_ALIAS'));
  rows.push(...aliasRows(history.aliases, 'APPROVED_ALIAS'));
  rows.push(...aliasRows(history.reviewedAliases, 'REVIEWED_ALIAS'));
  rows.push(...aliasRows(history.topologyAnchors, 'TOPOLOGY_ANCHOR'));
  return rows;
}
function inventoryEvidence(node, inventory) {
  const logicalNodeId = clean(node.logicalNodeId);
  const entityIds = new Set(asArray(node.sourceEntityIds).map(clean).filter(Boolean));
  const portIds = new Set(asArray(node.sourcePortIds).map(clean).filter(Boolean));
  if (node.sourceEntityId) entityIds.add(clean(node.sourceEntityId));
  if (node.sourcePortId) portIds.add(clean(node.sourcePortId));
  const entities = asArray(inventory.entities).filter((row) => entityBelongsToNode(row, logicalNodeId, entityIds));
  for (const row of entities) if (row.sourceEntityId) entityIds.add(clean(row.sourceEntityId));
  const rows = [];
  for (const entity of entities) {
    addScalar(rows, 'STABLE_SOURCE_ENTITY', entity.sourceEntityId, 'SOURCE_INVENTORY');
    rows.push(...asArray(entity.identityEvidence));
  }
  for (const port of asArray(inventory.ports)) {
    if (!portBelongsToNode(port, logicalNodeId, portIds)) continue;
    addScalar(rows, 'STABLE_SOURCE_PORT', port.sourcePortId, 'SOURCE_INVENTORY');
    rows.push(...asArray(port.identityEvidence));
  }
  return rows;
}
function entityBelongsToNode(row, logicalNodeId, entityIds) {
  if (!row || typeof row !== 'object') return false;
  if (clean(row.logicalNodeId) === logicalNodeId) return true;
  if (asArray(row.logicalNodeIds).map(clean).includes(logicalNodeId)) return true;
  return entityIds.has(clean(row.sourceEntityId));
}
function portBelongsToNode(row, logicalNodeId, portIds) {
  if (!row || typeof row !== 'object') return false;
  if (clean(row.logicalNodeId) === logicalNodeId) return true;
  if (asArray(row.logicalNodeIds).map(clean).includes(logicalNodeId)) return true;
  return portIds.has(clean(row.sourcePortId));
}
function aliasRows(values, kind, fallbackAuthority = '') {
  return asArray(values).map((value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return { kind, ...value };
    return { kind, value, authority: fallbackAuthority, approved: Boolean(fallbackAuthority) };
  });
}
function addScalar(rows, kind, value, authority = 'SOURCE_INVENTORY') {
  if (clean(value)) rows.push({ kind, value, authority, approved: true });
}
function addMany(rows, kind, values) {
  for (const value of asArray(values)) addScalar(rows, kind, value);
}
function evidenceContext(owner, fallback, policy) {
  return {
    namespace: clean(owner.identityNamespace || owner.sourceSystem || fallback.sourceSystem
      || fallback.sourceIdentity?.systemId || policy.defaultNamespace),
    sourcePath: clean(owner.sourcePath),
  };
}
function normalizeNamespace(raw, context, policy) {
  const value = clean(raw.namespace || raw.sourceSystem || context.namespace || policy.defaultNamespace);
  return value.normalize('NFC');
}
function normalizeValue(value, kind, aliasType, policy) {
  let normalized = clean(value).normalize('NFC');
  const insensitive = new Set(asArray(policy.caseInsensitiveKinds).map((row) => clean(row).toUpperCase()));
  if (insensitive.has(kind) || insensitive.has(aliasType)) normalized = normalized.toUpperCase();
  return normalized;
}
function aliasTypeFor(kind, rawKind, raw) {
  if (!['APPROVED_ALIAS', 'REVIEWED_ALIAS'].includes(kind)) return '';
  return clean(raw.aliasType || raw.tagType || (['REF', 'TAG', 'SOURCE_REF', 'DURABLE_TAG'].includes(rawKind) ? rawKind : 'ALIAS')).toUpperCase();
}
function approvalState(kind, raw, authority) {
  if (kind.startsWith('STABLE_SOURCE_')) return 'APPROVED';
  if (kind === 'TOPOLOGY_ANCHOR') return raw.approved === true && Boolean(authority) ? 'APPROVED' : 'REVIEW_REQUIRED';
  if (raw.approved === false || raw.reviewed === false) return 'REVIEW_REQUIRED';
  if (raw.approved === true || raw.reviewed === true || authority) return 'APPROVED';
  return 'REVIEW_REQUIRED';
}
function clean(value) { return String(value ?? '').trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
