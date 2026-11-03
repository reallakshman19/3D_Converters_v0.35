import { createWorkflowDiagnostics } from './xml-cii-workflow-types.js';
import { mutateRestraintType, normalizeRestraintTypeValue } from '../../converters/xml-cii2019-core/restraint-type-mutation.js';
const ENRICH_FIELDS = Object.freeze(['DTXR_POS', 'DTXR_PS', 'ComponentType', 'PipingClass', 'Rating', 'Position']);
const ATTR_FIELDS = Object.freeze(['LINE_ID', 'FROM_NAME', 'TO_NAME']);
const CONTEXT_FIELDS = Object.freeze(['DIAMETER', 'WALL_THICK', 'INSUL_THICK', 'CORR_ALLOW', 'MATERIAL_NUM', 'FLUID_DENSITY', 'INSUL_DENSITY', 'HYDRO_PRESSURE', ...Array.from({ length: 9 }, (_, i) => `TEMP_EXP_C${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `PRESSURE_C${i + 1}`)]);
const NUMERIC_ATTRS = Object.freeze(['FROM_NODE', 'TO_NODE', 'DELTA_X', 'DELTA_Y', 'DELTA_Z', ...CONTEXT_FIELDS]);
const RESTRAINT_NUMERIC_ATTRS = Object.freeze(['NUM', 'NODE', 'TYPE', 'STIFFNESS', 'GAP', 'FRIC_COEF', 'CNODE', 'XCOSINE', 'YCOSINE', 'ZCOSINE']);
const DEFAULT_INPUTXML_RATING_BY_PIPING_CLASS = Object.freeze({ 91261: '900' });
const MAX_RESTRAINT_SLOTS_PER_ELEMENT = 6;
function text(value) { return value === undefined || value === null ? '' : String(value); }
function own(object, key) { return Object.prototype.hasOwnProperty.call(object || {}, key); }
function localName(node) { return text(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function safeStem(name) { const safe = text(name || 'inputxml').replace(/[\\/:*?"|]/g, '_'); const idx = safe.lastIndexOf('.'); return idx > 0 ? safe.slice(0, idx) : safe; }
function isSentinel(value) { const n = Number(text(value).trim()); return Number.isFinite(n) && Math.abs(n + 1.0101) < 0.000001; }
function isMissing(value) { const v = text(value).trim(); return !v || isSentinel(v); }
function normalizeNode(value) { return normalizeNumberText(value); }
function numberFromConfig(config, key, fallback) { const n = Number(config?.[key]); return Number.isFinite(n) ? normalizeNumberText(n) : normalizeNumberText(fallback); }
function numberFromValue(value, fallback) { const n = Number(value); return Number.isFinite(n) ? normalizeNumberText(n) : normalizeNumberText(fallback); }
function normalizeNumberText(value) {
  const raw = text(value).trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return raw;
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : raw.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}
function parseConfig(raw) {
  try {
    const parsed = JSON.parse(text(raw) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function findChildren(root, name) {
  const out = [];
  const wanted = name.toUpperCase();
  const visit = (node) => { for (const child of Array.from(node.children || [])) { if (localName(child).toUpperCase() === wanted) out.push(child); visit(child); } };
  visit(root);
  return out;
}
function normalizeElementKey(raw) {
  const value = text(raw).trim();
  const named = value.match(/FROM_NODE\s*=\s*([^\s]+).*?TO_NODE\s*=\s*([^\s]+)/i);
  if (named) return `${normalizeNode(named[1])}->${normalizeNode(named[2])}`;
  const arrow = value.match(/^([^\s>-]+)\s*(?:->|-)\s*([^\s>]+)$/);
  return arrow ? `${normalizeNode(arrow[1])}->${normalizeNode(arrow[2])}` : '';
}
function sideLoadSet(map, key, field, value) {
  const normalizedKey = normalizeElementKey(key);
  if (!normalizedKey || !field) return;
  const row = map.get(normalizedKey) || {};
  row[field] = text(value).trim();
  map.set(normalizedKey, row);
}
export function parseInputXmlElementSideLoad(sideLoadText) {
  const map = new Map();
  let currentKey = '';
  for (const line of text(sideLoadText).split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const element = trimmed.match(/^ELEMENT\s+(.+)$/i);
    if (element) { currentKey = normalizeElementKey(element[1]); continue; }
    const namedKey = /^FROM_NODE\s*=.*?TO_NODE\s*=/i.test(trimmed) ? normalizeElementKey(trimmed) : '';
    if (namedKey) { currentKey = namedKey; continue; }
    const pair = trimmed.match(/^([A-Za-z_][\w.-]*)\s*=\s*(.*)$/);
    if (pair && currentKey) { sideLoadSet(map, currentKey, pair[1], pair[2]); continue; }
    const tag = trimmed.match(/^<([A-Za-z_][\w.-]*)>([\s\S]*)<\/\1>$/);
    if (tag && currentKey) { sideLoadSet(map, currentKey, tag[1], tag[2]); continue; }
    const bareKey = normalizeElementKey(trimmed);
    if (bareKey) currentKey = bareKey;
  }
  return map;
}
function parseInputXml(sourceText) {
  const parser = new DOMParser();
  let source = text(sourceText).trim();
  const withoutDecl = source.replace(/^\s*<\?xml[^>]*>\s*/i, '');
  if (!/^\s*<\s*CAESARII\b/i.test(withoutDecl)) source = `<CAESARII XML_TYPE="Input" VERSION="2019" SOURCE="XML-&gt;CII enriched InputXML debug export"><PIPINGMODEL JOBNAME="InputXML Fragment" NUMELEMENTS="0" NUMREST="0">${withoutDecl}</PIPINGMODEL></CAESARII>`;
  const doc = parser.parseFromString(source, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error(parseError.textContent || 'InputXML parse failed.');
  return doc;
}
function findChild(element, name) {
  return Array.from(element.children || []).find((child) => localName(child) === name) || null;
}
function hasMeaningfulChild(element, name) {
  const child = findChild(element, name);
  return !!child && text(child.textContent).trim() !== '';
}
function setChildText(doc, element, name, value) {
  const existing = findChild(element, name);
  const child = existing || doc.createElement(name);
  child.textContent = text(value);
  if (!existing) element.appendChild(child);
}
function normalizePressureAliases(element) {
  for (let i = 1; i <= 9; i += 1) {
    const alias = `PRESSURE${i}`;
    const canonical = `PRESSURE_C${i}`;
    if (element.hasAttribute(alias) && !element.hasAttribute(canonical)) element.setAttribute(canonical, element.getAttribute(alias));
    if (element.hasAttribute(alias)) element.removeAttribute(alias);
  }
}
function normalizeNumericAttributes(element) {
  for (const attr of NUMERIC_ATTRS) if (element.hasAttribute(attr)) element.setAttribute(attr, normalizeNumberText(element.getAttribute(attr)));
}
function fillFromContext(element, context) {
  let inherited = 0;
  let sentinel = 0;
  for (const field of CONTEXT_FIELDS) {
    const current = element.getAttribute(field);
    if (isSentinel(current)) sentinel += 1;
    if (isMissing(current) && !isMissing(context[field])) { element.setAttribute(field, context[field]); inherited += 1; }
    const updated = element.getAttribute(field);
    if (!isMissing(updated)) context[field] = updated;
  }
  return { inherited, sentinel };
}
function restraintRules(config) {
  const fromConfig = config.inputXmlDtxrRestraintRules || config.dtxrRestraintRules;
  if (Array.isArray(fromConfig) && fromConfig.length) return fromConfig;
  return [
    { label: 'Y/restraint support', typeCode: 14, patterns: ['PIPE REST', 'SHOE', 'SUPPORT TYPE-103', 'REST'] },
    { label: 'guide restraint', typeCode: 9, friction: -1.0101, patterns: ['GUIDE', 'PDO-TYPE-603'] },
    { label: 'line stop / directional anchor', typeCode: 8, friction: -1.0101, patterns: ['DIRECTIONAL ANCHOR', 'ANCHOR', 'LINE STOP'] },
  ];
}
export function deriveRestraints(sideLoad, config = {}) {
  const dtxr = `${text(sideLoad?.DTXR_POS)} ${text(sideLoad?.DTXR_PS)}`.toUpperCase();
  const seen = new Set();
  const derived = [];
  if (!dtxr.trim()) return derived;
  for (const rule of restraintRules(config)) {
    const typeCode = Number(rule.typeCode || 14);
    const patterns = Array.isArray(rule.patterns) ? rule.patterns : [];
    if (!Number.isFinite(typeCode) || seen.has(typeCode)) continue;
    if (!patterns.some((pattern) => dtxr.includes(text(pattern).toUpperCase()))) continue;
    seen.add(typeCode);
    derived.push({ typeCode, label: rule.label || 'DTXR-derived', friction: rule.friction });
  }
  return derived;
}
function extractLeadingDigitsOrRaw(value) {
  const raw = text(value).trim();
  const digits = raw.match(/^(\d+)/);
  return digits ? digits[1] : raw;
}
export function extractPipingClassFromLineId(lineId, config = {}) {
  const rawLineId = text(lineId).trim();
  if (!rawLineId) return '';
  const cfg = config.inputXmlPipingClass && typeof config.inputXmlPipingClass === 'object' ? config.inputXmlPipingClass : {};
  if (cfg.regex) {
    try {
      const match = rawLineId.match(new RegExp(String(cfg.regex)));
      const group = Number.isInteger(Number(cfg.group)) ? Number(cfg.group) : 1;
      if (match && match[group] !== undefined) return extractLeadingDigitsOrRaw(match[group]);
    } catch {}
  }
  const delimiter = cfg.tokenDelimiter == null ? '-' : String(cfg.tokenDelimiter);
  const tokenPosition = Number.isInteger(Number(cfg.tokenPosition)) ? Number(cfg.tokenPosition) : 5;
  const normalized = rawLineId.replace(/^\/+/, '').replace(/\/B\d+\s*$/i, '');
  const tokens = delimiter ? normalized.split(delimiter) : [normalized];
  const index = tokenPosition <= 0 ? tokenPosition : tokenPosition - 1;
  return extractLeadingDigitsOrRaw(tokens[index] || '');
}
function ratingByPipingClass(pipingClass, config = {}) {
  const map = config.inputXmlRatingByPipingClass && typeof config.inputXmlRatingByPipingClass === 'object'
    ? config.inputXmlRatingByPipingClass
    : DEFAULT_INPUTXML_RATING_BY_PIPING_CLASS;
  return text(map[text(pipingClass).trim()]).trim();
}
function applySideLoadAttributes(element, row) {
  for (const attr of ATTR_FIELDS) if (own(row, attr)) element.setAttribute(attr, row[attr]);
}
function applySideLoadChildren(doc, element, row) {
  for (const field of ENRICH_FIELDS) {
    if (!own(row, field) || !text(row[field]).trim()) continue;
    setChildText(doc, element, field, row[field]);
  }
}
function applyLineDerivedFields(doc, element, row, config) {
  const sideLoadedPipingClass = text(row.PipingClass).trim();
  const sideLoadedRating = text(row.Rating).trim();
  const lineId = text(row.LINE_ID || element.getAttribute('LINE_ID')).trim();
  const derivedClass = !sideLoadedPipingClass && lineId && !hasMeaningfulChild(element, 'PipingClass')
    ? extractPipingClassFromLineId(lineId, config)
    : '';
  if (derivedClass) setChildText(doc, element, 'PipingClass', derivedClass);
  const classForRating = sideLoadedPipingClass || derivedClass || text(findChild(element, 'PipingClass')?.textContent).trim();
  const derivedRating = !sideLoadedRating && classForRating && !hasMeaningfulChild(element, 'Rating')
    ? ratingByPipingClass(classForRating, config)
    : '';
  if (derivedRating) setChildText(doc, element, 'Rating', derivedRating);
}
function removeRestraints(element) {
  for (const child of Array.from(element.children || [])) if (localName(child).toUpperCase() === 'RESTRAINT') child.remove();
}
function nextFreeRestraintSlot(used) {
  for (let slot = 1; slot <= MAX_RESTRAINT_SLOTS_PER_ELEMENT; slot += 1) if (!used.has(slot)) return slot;
  return null;
}
function normalizeRestraintSlot(value) {
  const n = Number(text(value).trim());
  if (!Number.isFinite(n)) return null;
  const slot = Math.round(n);
  return Math.abs(n - slot) < 1e-9 ? slot : null;
}
function restraintTypeMutationConfig(config) {
  return config.inputXmlRestraintTypeMutation || config.restraintTypeMutation || {};
}
function normalizeExistingRestraints(element, config, options = {}) {
  const restraints = Array.from(element.children || []).filter((child) => localName(child).toUpperCase() === 'RESTRAINT');
  const used = new Set();
  let mutatedTypes = 0;
  for (const restraint of restraints) {
    for (const attr of RESTRAINT_NUMERIC_ATTRS) {
      if (attr === 'TYPE') continue;
      if (restraint.hasAttribute(attr)) restraint.setAttribute(attr, normalizeNumberText(restraint.getAttribute(attr)));
    }
    if (restraint.hasAttribute('TYPE')) {
      const originalType = restraint.getAttribute('TYPE');
      const normalizedType = options.mutateTypes
        ? mutateRestraintType(originalType, restraintTypeMutationConfig(config))
        : normalizeNumberText(originalType);
      if (options.mutateTypes && normalizedType !== normalizeRestraintTypeValue(originalType)) mutatedTypes += 1;
      restraint.setAttribute('TYPE', normalizedType);
    }
    const currentSlot = normalizeRestraintSlot(restraint.getAttribute('NUM'));
    if (currentSlot && currentSlot >= 1 && currentSlot <= MAX_RESTRAINT_SLOTS_PER_ELEMENT && !used.has(currentSlot)) {
      used.add(currentSlot);
      continue;
    }
    const nextSlot = nextFreeRestraintSlot(used);
    if (!nextSlot) {
      restraint.remove();
      continue;
    }
    restraint.setAttribute('NUM', String(nextSlot));
    used.add(nextSlot);
  }
  return { mutatedTypes };
}
function frictionForDerivedRestraint(derived, config) {
  if (derived?.friction !== undefined && derived?.friction !== null && derived?.friction !== '') return numberFromValue(derived.friction, -1.0101);
  return Number(derived?.typeCode) === 14 ? numberFromConfig(config, 'defaultFriction', 0.3) : '-1.0101';
}
function appendDerivedRestraint(doc, element, derived, config) {
  const existing = Array.from(element.children || []).filter((child) => localName(child).toUpperCase() === 'RESTRAINT').length;
  if (existing >= MAX_RESTRAINT_SLOTS_PER_ELEMENT) return false;
  const restraint = doc.createElement('RESTRAINT');
  for (const [name, value] of Object.entries(createDerivedRestraintAttrs(element, derived, config, existing))) restraint.setAttribute(name, value);
  element.appendChild(restraint);
  return true;
}
function createDerivedRestraintAttrs(element, derived, config, existing) {
  return { NUM: String(existing + 1), NODE: normalizeNode(element.getAttribute('TO_NODE')), TYPE: normalizeNumberText(derived.typeCode), STIFFNESS: numberFromConfig(config, 'defaultStiffness', 1751270000000), GAP: numberFromConfig(config, 'defaultGap', 0), FRIC_COEF: frictionForDerivedRestraint(derived, config), CNODE: '0', XCOSINE: '-1.0101', YCOSINE: '-1.0101', ZCOSINE: '-1.0101', TAG: 'ANCI/DTXR-derived', GUID: '' };
}
function serializeFragment(elements) {
  const serializer = new XMLSerializer();
  return elements.map((element) => serializer.serializeToString(element)).join('\n');
}
function sideLoadLineKey(element, row) {
  return text(row?.LINE_ID || element.getAttribute('LINE_ID') || '__global__');
}
function applyRestraintPolicy(doc, element, row, config, policy) {
  const derived = row ? deriveRestraints(row, config) : [];
  if (policy === 'replace-with-dtxr-derived-restraints') removeRestraints(element);
  let restraintStats = { mutatedTypes: 0 };
  if (policy === 'preserve-existing-restraints') restraintStats = normalizeExistingRestraints(element, config, { mutateTypes: false });
  if (policy === 'convert-existing-restraints' || policy === 'merge-existing-and-dtxr-derived-restraints') restraintStats = normalizeExistingRestraints(element, config, { mutateTypes: true });
  if (policy !== 'replace-with-dtxr-derived-restraints' && policy !== 'merge-existing-and-dtxr-derived-restraints') return restraintStats;
  for (const restraint of derived) appendDerivedRestraint(doc, element, restraint, config);
  return restraintStats;
}
function enrichElement(doc, element, row, config, options, lineContexts) {
  if (row) applySideLoadAttributes(element, row);
  const context = lineContexts.get(sideLoadLineKey(element, row)) || {};
  const fill = options.fillSentinelFromLineContext !== false ? fillFromContext(element, context) : { inherited: 0, sentinel: 0 };
  lineContexts.set(sideLoadLineKey(element, row), context);
  if (row) {
    applySideLoadChildren(doc, element, row);
    applyLineDerivedFields(doc, element, row, config);
    setChildText(doc, element, 'Point_properties_basis', options.pointPropertiesBasis === 'FROM' ? 'FROM' : 'TO');
  }
  return fill;
}
function normalizeInputElement(element, options) {
  if (options.normalizePressureCaseNames !== false) normalizePressureAliases(element);
  normalizeNumericAttributes(element);
}
function createResult(job, doc, elements, counters, unmatched) {
  const root = doc.documentElement;
  const model = findChildren(doc, 'PIPINGMODEL')[0];
  if (model) {
    model.setAttribute('NUMELEMENTS', String(elements.length));
    model.setAttribute('NUMREST', String(Array.from(doc.getElementsByTagName('RESTRAINT')).length));
  }
  root.setAttribute('XML_TYPE', 'Input');
  root.setAttribute('VERSION', root.getAttribute('VERSION') || '2019');
  root.setAttribute('SOURCE', root.getAttribute('SOURCE') || 'XML->CII enriched InputXML debug export');
  const serializer = new XMLSerializer();
  const enrichedText = job.options?.inputXmlOutputMode === 'fragment' ? serializeFragment(elements) : serializer.serializeToString(doc);
  return createInputXmlWorkflowResult(job, doc, elements, enrichedText, counters, unmatched);
}
function createInputXmlWorkflowResult(job, doc, elements, enrichedText, counters, unmatched) {
  const restraintCount = Array.from(doc.getElementsByTagName('RESTRAINT')).length;
  const diagnostics = createWorkflowDiagnostics({ sourceKind: 'inputxml', outputKind: 'enrichedInputXML', branch: 'direct-inputxml-enrichment', elementCount: elements.length, enrichedElementCount: counters.enriched, restraintCount, sideLoadMatched: counters.matched.size, sideLoadUnmatched: unmatched, inheritedFieldCount: counters.inherited, sentinelFieldCount: counters.sentinel, restraintTypeMutationCount: counters.restraintTypeMutations, warnings: unmatched.length ? [`${unmatched.length} side-load element key(s) did not match InputXML elements.`] : [] });
  return { ok: true, sourceKind: 'inputxml', outputKind: 'enrichedInputXML', enrichedText, enrichedName: `${safeStem(job.sourceName)}_enriched.input.xml`, ciiText: null, ciiName: null, diagnostics, logs: [`InputXML enrichment completed for ${elements.length} PIPINGELEMENT record(s).`, `Side-load matched ${counters.matched.size} element(s).`], error: null };
}
export function enrichInputXmlDocument(job) {
  const options = job.options || {};
  const config = parseConfig(job.supportConfigJson);
  const doc = parseInputXml(job.sourceText);
  const elements = findChildren(doc, 'PIPINGELEMENT');
  const sideLoad = parseInputXmlElementSideLoad(job.elementSideLoadText || '');
  const counters = { enriched: 0, inherited: 0, sentinel: 0, restraintTypeMutations: 0, matched: new Set() };
  const lineContexts = new Map();
  for (const element of elements) {
    const key = `${normalizeNode(element.getAttribute('FROM_NODE'))}->${normalizeNode(element.getAttribute('TO_NODE'))}`;
    const row = sideLoad.get(key);
    normalizeInputElement(element, options);
    const fill = enrichElement(doc, element, row, config, options, lineContexts);
    counters.inherited += fill.inherited;
    counters.sentinel += fill.sentinel;
    if (row) { counters.matched.add(key); counters.enriched += 1; }
    const restraintStats = applyRestraintPolicy(doc, element, row, config, options.inputXmlRestraintPolicy || 'merge-existing-and-dtxr-derived-restraints') || {};
    counters.restraintTypeMutations += Number(restraintStats.mutatedTypes || 0);
  }
  const unmatched = Array.from(sideLoad.keys()).filter((key) => !counters.matched.has(key));
  return createResult({ ...job, options }, doc, elements, counters, unmatched);
}
