/**
 * Config profiles for table-driven XML->CII trace imports.
 * Inputs: parsed table headers/rows. Outputs: detected profile, profile field
 * hints, and default matching rules. Fallback: generic support-detail behavior.
 */
export const TRACE_TABLE_PROFILE_IDS = Object.freeze({
  AUTO: 'auto',
  SUPPORT_DETAIL: 'support-detail',
  FCSG_COMPONENT: 'fcsg-component-report',
});

export const TRACE_AMBIGUITY_POLICIES = Object.freeze([
  { id: 'reject-duplicates', label: 'Reject duplicate-key matches' },
  { id: 'manual-review', label: 'Mark duplicate-key matches for review' },
  { id: 'accept-first', label: 'Accept first duplicate candidate' },
]);

export const DEFAULT_TRACE_MATCH_RULES = Object.freeze([
  { id: 'componentRefNo+nodeName', label: 'ComponentRefNo + NodeName', enabled: true },
  { id: 'componentRefNo+position', label: 'ComponentRefNo + Position', enabled: true },
  { id: 'nodeName', label: 'NodeName only', enabled: true },
  { id: 'position+componentType', label: 'Position + ComponentType', enabled: true },
  { id: 'componentRefNo', label: 'ComponentRefNo only', enabled: false },
]);

const PROFILE_DEFS = Object.freeze([
  {
    id: TRACE_TABLE_PROFILE_IDS.SUPPORT_DETAIL,
    label: 'Support Detail Report',
    requiredHeaders: ['Reference of the element', 'RTEXT of detailing text'],
    fieldHints: {
      componentRefNo: 'Reference of the element',
      dtxrPos: 'RTEXT of detailing text',
      nodeName: 'Name of the element',
      dtxrPs: 'ISOMETRIC NOTES',
      cmpSupGap: 'SUPPORT GAP',
      branchName: 'PIPE',
      supportReference: 'ANCILIARY SUPPORT REFERENCE',
      componentSpec: 'Component spec reference',
    },
  },
  {
    id: TRACE_TABLE_PROFILE_IDS.FCSG_COMPONENT,
    label: 'FCSG Component Report',
    requiredHeaders: ['TYPE', 'REF', 'NAME', 'POS WRT /*', 'SPRE'],
    fieldHints: {
      componentType: 'TYPE',
      componentRefNo: 'REF',
      nodeName: 'NAME',
      position: 'POS WRT /*',
      dtxrPos: 'SPRE',
      componentSpec: 'SPRE',
      branchName: 'PIPE OF COMPREF',
      site: 'SITE',
    },
  },
]);

function text(value) { return String(value ?? '').trim(); }
function compact(value) { return text(value).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

export function createDefaultTraceTableConfig() {
  return {
    profileId: TRACE_TABLE_PROFILE_IDS.AUTO,
    coordinateTolerance: 6,
    ambiguityPolicy: 'reject-duplicates',
    matchRules: DEFAULT_TRACE_MATCH_RULES.map((rule) => ({ ...rule })),
  };
}

export function getTraceTableProfiles() {
  return [{ id: TRACE_TABLE_PROFILE_IDS.AUTO, label: 'Auto-detect' }, ...PROFILE_DEFS.map((profile) => ({ id: profile.id, label: profile.label }))];
}

export function traceProfileById(profileId) {
  return PROFILE_DEFS.find((profile) => profile.id === profileId) || null;
}

export function detectTraceTableProfile(headers) {
  const normalized = new Set((headers || []).map(compact));
  let best = { id: TRACE_TABLE_PROFILE_IDS.SUPPORT_DETAIL, label: 'Support Detail Report', confidence: 0, fieldHints: {} };
  for (const profile of PROFILE_DEFS) {
    const required = profile.requiredHeaders.map(compact);
    const matched = required.filter((header) => normalized.has(header)).length;
    const confidence = required.length ? Math.round((matched / required.length) * 100) : 0;
    if (confidence > best.confidence) best = { id: profile.id, label: profile.label, confidence, fieldHints: profile.fieldHints };
  }
  return best;
}

function headerLookup(headers) {
  const lookup = new Map();
  for (const header of headers || []) lookup.set(compact(header), header);
  return lookup;
}

export function profileFieldMap(headers, profileId) {
  const profile = traceProfileById(profileId);
  if (!profile) return {};
  const lookup = headerLookup(headers);
  const fieldMap = {};
  for (const [fieldName, wantedHeader] of Object.entries(profile.fieldHints || {})) {
    fieldMap[fieldName] = lookup.get(compact(wantedHeader)) || '';
  }
  return fieldMap;
}

export function normalizeTraceTableConfig(config) {
  const safe = config || {};
  const defaultConfig = createDefaultTraceTableConfig();
  const rules = Array.isArray(safe.matchRules) && safe.matchRules.length ? safe.matchRules : defaultConfig.matchRules;
  return {
    profileId: safe.profileId || defaultConfig.profileId,
    coordinateTolerance: Number.isFinite(Number(safe.coordinateTolerance)) ? Number(safe.coordinateTolerance) : defaultConfig.coordinateTolerance,
    ambiguityPolicy: safe.ambiguityPolicy || defaultConfig.ambiguityPolicy,
    matchRules: DEFAULT_TRACE_MATCH_RULES.map((rule) => {
      const existing = rules.find((item) => item.id === rule.id);
      return { ...rule, enabled: existing ? existing.enabled !== false : rule.enabled };
    }),
  };
}

export function activeProfileFor(headers, config) {
  const normalizedConfig = normalizeTraceTableConfig(config);
  if (normalizedConfig.profileId === TRACE_TABLE_PROFILE_IDS.AUTO) return detectTraceTableProfile(headers);
  const profile = traceProfileById(normalizedConfig.profileId);
  return profile ? { id: profile.id, label: profile.label, confidence: 100, fieldHints: profile.fieldHints } : detectTraceTableProfile(headers);
}
