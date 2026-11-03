// Configurable JSON extraction aliases for XML -> CII(2019) side-load workflows.
// This module is deliberately side-effect free. It does not mutate XML or converter state.

const DEFAULT_PROFILE_NAME = 'PDMS/E3D staged JSON - XML to CII';

export const DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG = Object.freeze({
  version: 1,
  profileName: DEFAULT_PROFILE_NAME,
  scope: { branchArray: '$', childrenPath: 'children', attributesPath: 'attributes' },
  basisResolvers: {
    NODE: { enabled: true, fieldAliases: ['NodeNumber', 'NODE', 'node', 'nodeNo'] },
    PS: {
      enabled: true,
      // PREV-NAME is intentionally excluded. It is an old support name and must not be used as a DTXR_PS mapping basis.
      fieldAliases: ['SUPPORT_TAG', 'CMPSTRESSN', 'CMPSUPREFN', 'NAME', 'STEX', 'MDSGUIDEREF'],
      regexExtractors: ['PS[-]?\\d+(?:\\.\\d+)?(?:/DATUM|/SREF)?'],
      normalization: { uppercase: true, stripLeadingSlash: true, stripSuffixes: ['/DATUM', '/SREF', '(REF)'], preserveDotSuffixForExact: true, alsoTryBasePsWithoutDotSuffix: true },
    },
    POS: { enabled: true, objectFieldAliases: ['POS', 'APOS', 'LPOS', 'BPOS', 'HPOS', 'TPOS'], textFieldAliases: ['POSI', 'ABOP', 'LBOP'], exactToleranceMm: 1, nearestToleranceMm: 5, axisConvention: 'JSON object POS uses x/y/z. E/S/U text maps to x/y/z; S is normalized negative.' },
  },
  itemExtractors: {
    RESTRAINT: { enabled: true, sourceFieldAliases: ['SUPPORT_KIND', 'SUPPORT_MAPPER_KIND', 'SUPPORT_TYPE', 'CMPSUPTYPE', 'NODETYPE', 'DTXR', 'MDSSUPPTYPE'], basisPriority: ['PS', 'POS', 'NODE'], includeOnlyTypes: ['SUPPORT', 'ATTA'], keywordMap: { REST: ['REST', 'PIPE REST', 'XRT01', 'SHOE', 'SH-'], GUIDE: ['GUIDE', 'GT01', 'PG-', 'MDSGUIDEREF'], LINESTOP: ['LINESTOP', 'LINE STOP', 'ST06', 'LS-', 'DIRECTIONAL ANCHOR'], ANCHOR: ['ANCHOR', 'ANCI', 'FIXED'], HANGER: ['HANGER', 'HANG', 'ROD'], SPRING: ['SPRING', 'VARIABLE SPRING', 'SPR'] } },
    DTXR_PS: { enabled: true, sourceFieldAliases: ['DTXR'], basisPriority: ['PS'] },
    DTXR_POS: { enabled: true, sourceFieldAliases: ['DTXR'], basisPriority: ['POS'] },
    WEIGHT: { enabled: true, sourceFieldAliases: ['WEIGHT', 'PSIWEIGHT', 'CMPWEIGHTDRY', 'NWEI'], basisPriority: ['PS', 'POS'] },
    RATING: { enabled: true, sourceFieldAliases: ['RATING', 'CLASS', 'PRESSURE_CLASS', 'MESC OF SPREF', 'SPRE', 'DTXR'], ratingRegex: '(?:^|\\s)(150|300|600|900|1500|2500)\\s*#?', basisPriority: ['PS', 'POS'] },
    RESTRAINT_META: { enabled: true, sourceFieldAliases: ['NODEGAP', 'NODESTIFF', 'NODEFRICTION', 'ORI', 'LAXE', 'MDSMOVEX', 'MDSMOVEY', 'MDSMOVEZ', 'USTDISTROD'], basisPriority: ['PS', 'POS'] },
  },
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function asArray(value, fallback = []) { if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null).map(String); if (value === undefined || value === null || value === '') return [...fallback]; return [String(value)]; }
function mergeSection(defaultSection, customSection) { const out = { ...(defaultSection || {}), ...(customSection || {}) }; for (const key of Object.keys(defaultSection || {})) { if (Array.isArray(defaultSection[key])) out[key] = asArray(customSection?.[key], defaultSection[key]); else if (defaultSection[key] && typeof defaultSection[key] === 'object' && !Array.isArray(defaultSection[key])) out[key] = { ...defaultSection[key], ...(customSection?.[key] || {}) }; } if (out.fieldAliases) out.fieldAliases = out.fieldAliases.filter((alias) => !/^PREV[-_ ]?NAME$/i.test(String(alias || ''))); return out; }
export function normalizeXmlCiiSideloadJsonConfig(rawConfig = {}) { const defaults = clone(DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG); const cfg = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? rawConfig : {}; const merged = { ...defaults, ...cfg, scope: { ...defaults.scope, ...(cfg.scope || {}) }, basisResolvers: { ...defaults.basisResolvers }, itemExtractors: { ...defaults.itemExtractors } }; for (const key of Object.keys(defaults.basisResolvers)) merged.basisResolvers[key] = mergeSection(defaults.basisResolvers[key], cfg.basisResolvers?.[key]); for (const key of Object.keys(defaults.itemExtractors)) merged.itemExtractors[key] = mergeSection(defaults.itemExtractors[key], cfg.itemExtractors?.[key]); return merged; }
export function parseXmlCiiSideloadJsonConfig(rawText) { const text = String(rawText || '').trim(); if (!text) return normalizeXmlCiiSideloadJsonConfig(); try { return normalizeXmlCiiSideloadJsonConfig(JSON.parse(text)); } catch { return normalizeXmlCiiSideloadJsonConfig(); } }
export function getJsonAttributes(row, config = DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG) { const attrsPath = config?.scope?.attributesPath || 'attributes'; return row?.[attrsPath] && typeof row[attrsPath] === 'object' ? row[attrsPath] : (row?.attributes || row || {}); }
export function getConfiguredAttribute(attrs, aliases = []) { for (const alias of aliases || []) { const value = attrs?.[alias]; if (value !== undefined && value !== null && String(value).trim() !== '') return value; } return ''; }
export function getAllConfiguredAttributes(attrs, aliases = []) { const out = []; for (const alias of aliases || []) { const value = attrs?.[alias]; if (value !== undefined && value !== null && String(value).trim() !== '') out.push({ alias, value }); } return out; }
export function normalizePositionObject(value) { if (!value || typeof value !== 'object') return null; const x = Number(value.x ?? value.X ?? value.e ?? value.E); const y = Number(value.y ?? value.Y ?? value.s ?? value.S); const z = Number(value.z ?? value.Z ?? value.u ?? value.U); if (![x, y, z].every(Number.isFinite)) return null; return { x, y, z }; }
export function parsePositionText(value) { const text = String(value || '').trim(); if (!text) return null; const esu = text.match(/E\s*([-+]?\d+(?:\.\d+)?)\s*mm\s*S\s*([-+]?\d+(?:\.\d+)?)\s*mm\s*U\s*([-+]?\d+(?:\.\d+)?)\s*mm/i); if (esu) return { x: Number(esu[1]), y: -Math.abs(Number(esu[2])), z: Number(esu[3]) }; const nums = text.match(/[-+]?\d+(?:\.\d+)?/g)?.map(Number) || []; if (nums.length < 3 || nums.slice(0, 3).some((n) => !Number.isFinite(n))) return null; return { x: nums[0], y: nums[1], z: nums[2] }; }
export function getConfiguredPositions(attrs, posConfig = DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG.basisResolvers.POS) { const out = []; for (const alias of posConfig.objectFieldAliases || []) { const point = normalizePositionObject(attrs?.[alias]); if (point) out.push({ alias, value: point, raw: attrs[alias], sourceType: 'object' }); } for (const alias of posConfig.textFieldAliases || []) { const point = parsePositionText(attrs?.[alias]); if (point) out.push({ alias, value: point, raw: attrs[alias], sourceType: 'text' }); } return out; }
export function getConfiguredPsKeys(attrs, psConfig = DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG.basisResolvers.PS) { const out = []; const patterns = (psConfig.regexExtractors || []).map((pattern) => new RegExp(pattern, 'ig')); for (const alias of psConfig.fieldAliases || []) { if (/^PREV[-_ ]?NAME$/i.test(String(alias || ''))) continue; const text = String(attrs?.[alias] || '').trim(); if (!text) continue; for (const re of patterns) for (const match of text.matchAll(re)) out.push({ alias, value: match[0], raw: text }); if (/^\/?PS[-]?\d+/i.test(text)) out.push({ alias, value: text, raw: text }); } return out; }
export function classifyConfiguredRestraint(attrs, restraintConfig = DEFAULT_XML_CII_SIDELOAD_JSON_CONFIG.itemExtractors.RESTRAINT) { const values = getAllConfiguredAttributes(attrs, restraintConfig.sourceFieldAliases || []); const keywordMap = restraintConfig.keywordMap || {}; for (const { alias, value } of values) { const text = String(value || '').toUpperCase(); for (const [kind, needles] of Object.entries(keywordMap)) if ((needles || []).some((needle) => text.includes(String(needle).toUpperCase()))) return { kind, alias, raw: value }; } return { kind: '', alias: '', raw: '' }; }
