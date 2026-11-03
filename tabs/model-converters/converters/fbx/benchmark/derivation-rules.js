const TYPE_ALIASES = Object.freeze({
  FBLI: 'FLAN', FBLIND: 'FLAN', BLIND: 'FLAN', FLANGE: 'FLAN', GASKET: 'GASK',
  ELBOW: 'ELBO', BEND: 'ELBO', REDUCER: 'REDU', SUPPORT: 'SUPPORT', SUPP: 'SUPPORT',
  SUPC: 'SUPPORT', SUPPO: 'SUPPORT', ANCI: 'SUPPORT', ATTA: 'SUPPORT',
});
const SUPPORT_KINDS = new Set(['REST', 'GUIDE', 'LINESTOP', 'LIMIT', 'ANCHOR', 'SPRING']);
const SUPPORT_TAG_RE = /\bPS[-_\s]?[A-Z0-9][A-Z0-9._/\-]*\b/i;
const ROUTE_TIERS = new Set(['STRICT', 'LEGACY', 'RAY', 'BRANCH_HEAD', 'BRANCH_TAIL']);

function text(value) { return String(value ?? '').trim(); }
function upper(value) { return text(value).toUpperCase(); }
function claim(claimType, producerId, ruleId, fields, conformance, authorityState, reasons = []) {
  return { claimType, producerId, ruleId, fields: [...fields].sort(), conformance, authorityState, reasons };
}
export function canonicalComponentType(value) {
  const raw = upper(value);
  return TYPE_ALIASES[raw] || raw;
}
function finitePoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x), y = Number(value.y), z = Number(value.z);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}
function pointDistance(a, b) {
  const left = finitePoint(a), right = finitePoint(b);
  if (!left || !right) return null;
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}
function normalizedSupportType(attrs, fallback = '') {
  const source = [attrs.CMPSUPTYPE, attrs.MDSSUPPFUNC, attrs.DTXR, attrs.SUPPORT_TYPE,
    attrs.SUPTYPE, attrs.SKEY, attrs.SPRE, attrs.NAME, attrs.TAG, attrs.DESCRIPTION, attrs.DESC, fallback]
    .map(upper).join(' ');
  if (/\bGUIDE\b/.test(source)) return 'GUIDE';
  if (/\bLINE\s*STOP\b|\bLINESTOP\b|\bSTOPPER\b|\bSTOP\b/.test(source)) return 'LINESTOP';
  if (/\bLIMIT\s*STOP\b|\bLIMIT\b/.test(source)) return 'LIMIT';
  if (/\bRESTING\b|\bREST\b|\bSHOE\b|\bBP\b|\bBASE\s*PLATE\b/.test(source)) return 'REST';
  if (/\bANCHOR\b|\bFIXED\b/.test(source)) return 'ANCHOR';
  return '';
}
function supportTag(attrs, fallback) {
  const values = [attrs.CMPSUPREFN, attrs.NAME, attrs.TAG, attrs.TAGNO, attrs.ITEMCODE,
    attrs.PARTNO, attrs.REF, attrs.REFNO, attrs.DBREF, attrs.COMPONENTREFNO, attrs.CA97,
    attrs.CA98, attrs.SKEY, attrs.SPRE, attrs.DESCRIPTION, attrs.DESC, fallback];
  for (const value of values) {
    const match = SUPPORT_TAG_RE.exec(text(value));
    if (match) return match[0].replace(/\s+/g, '-');
  }
  return text(attrs.CMPSUPREFN || attrs.NAME || fallback || 'SUPPORT');
}
export function directIdentityClaim(isDirect) {
  if (!isDirect) return null;
  return claim('DIRECT_IDENTITY', 'STAGE2_EXACT_IDENTITY', 'EXACT_TOKEN_ONE_TO_ONE', [],
    'PASS', 'BOUND_BY_STAGE2');
}
export function typeNormalizationClaim(record) {
  const attrs = record?.attributes || {}, raw = upper(attrs.RAW_TYPE);
  if (!raw) return null;
  const expected = canonicalComponentType(raw), actual = upper(record.type);
  const ok = expected === actual;
  return claim('TYPE_NORMALIZATION', 'RMSS_ATTRIBUTE_PARSER', 'TYPE_ALIASES', ['RAW_TYPE', 'type'],
    ok ? 'PASS' : 'FAIL', 'PINNED_RULE_RUN_UNBOUND', ok ? [] : [`expected ${expected}, received ${actual}`]);
}
export function syntheticPipeClaim(record) {
  const attrs = record?.attributes || {};
  if (attrs.AUTO_GENERATED_PIPE !== 'true') return null;
  const reasons = [], gap = Number(attrs.GAP_MM), measured = pointDistance(attrs.APOS, attrs.LPOS);
  if (upper(record.type) !== 'PIPE') reasons.push('synthetic record type is not PIPE');
  if (!upper(record.name).startsWith('PIPE AUTO')) reasons.push('synthetic record name lacks PIPE AUTO prefix');
  if (!ROUTE_TIERS.has(upper(attrs.ROUTE_TIER))) reasons.push('ROUTE_TIER is not admitted');
  if (!Number.isFinite(gap) || gap <= 1) reasons.push('GAP_MM is not greater than routing threshold');
  if (!Number.isFinite(measured)) reasons.push('APOS/LPOS are not finite points');
  else if (Number.isFinite(gap) && Math.abs(measured - gap) > 0.0015) reasons.push('GAP_MM differs from APOS/LPOS distance');
  if (!text(attrs.BORE_SOURCE)) reasons.push('BORE_SOURCE is absent');
  return claim('SYNTHETIC_PIPE', 'RMSS_ATTRIBUTE_PARSER', 'ROUTE_BRANCH_PIPES',
    ['APOS', 'AUTO_GENERATED_PIPE', 'BORE_SOURCE', 'GAP_MM', 'LPOS', 'ROUTE_TIER', 'name', 'type'],
    reasons.length ? 'FAIL' : 'PASS', 'PINNED_RULE_RUN_UNBOUND', reasons);
}
export function supportShapingClaim(record) {
  if (upper(record?.type) !== 'SUPPORT') return null;
  const attrs = record.attributes || {}, expectedType = normalizedSupportType(attrs, record.name);
  const expectedTag = supportTag(attrs, record.name), reasons = [];
  if (expectedType && upper(attrs.SUPPORT_TYPE) !== expectedType) reasons.push(`SUPPORT_TYPE expected ${expectedType}`);
  if (text(attrs.SUPPORT_TAG) && text(attrs.SUPPORT_TAG) !== expectedTag) reasons.push(`SUPPORT_TAG expected ${expectedTag}`);
  return claim('SUPPORT_SHAPING', 'RMSS_ATTRIBUTE_PARSER', 'TO_NODE_SUPPORT',
    ['CMPSUPREFN', 'CMPSUPTYPE', 'DTXR', 'SUPPORT_TAG', 'SUPPORT_TYPE', 'type'],
    reasons.length ? 'FAIL' : 'PASS', 'PINNED_RULE_RUN_UNBOUND', reasons);
}
export function supportKindClaim(record) {
  if (upper(record?.type) !== 'SUPPORT') return null;
  const attrs = record.attributes || {}, kind = upper(attrs.SUPPORT_KIND), mapper = upper(attrs.SUPPORT_MAPPER_KIND);
  if (!kind && !mapper) return claim('SUPPORT_KIND_MAPPING', 'SUPPORT_KIND_RESOLVER',
    'SUPPORT_KIND_PIPELINE', ['SUPPORT_KIND', 'SUPPORT_MAPPER_KIND'], 'NOT_APPLICABLE',
    'PINNED_RULE_CONFIG_UNBOUND', ['no mapped kind fields are present']);
  const reasons = [];
  if (kind && !SUPPORT_KINDS.has(kind)) reasons.push('SUPPORT_KIND is not admitted');
  if (mapper && !SUPPORT_KINDS.has(mapper)) reasons.push('SUPPORT_MAPPER_KIND is not admitted');
  if (kind && mapper && kind !== mapper) reasons.push('support kind fields disagree');
  return claim('SUPPORT_KIND_MAPPING', 'SUPPORT_KIND_RESOLVER', 'SUPPORT_KIND_PIPELINE',
    ['SUPPORT_KIND', 'SUPPORT_MAPPER_KIND'], reasons.length ? 'FAIL' : 'PASS',
    'PINNED_RULE_CONFIG_UNBOUND', reasons);
}
export function branchOwnerSiteClaim(record) {
  if (upper(record?.type) !== 'BRANCH' || !text(record?.attributes?.OWNER_SITE)) return null;
  return claim('BRANCH_OWNER_SITE', 'RMSS_ATTRIBUTE_PARSER', 'FIND_SITE_ANCESTOR', ['OWNER_SITE'],
    'PASS', 'PINNED_RULE_RUN_UNBOUND');
}
export function unresolvedClaim() {
  return claim('UNRESOLVED_RECORD', 'UNRESOLVED', 'NO_ADMITTED_RULE', [], 'NOT_APPLICABLE', 'UNRESOLVED');
}
