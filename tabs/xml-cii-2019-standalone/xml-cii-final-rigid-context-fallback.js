/**
 * Non-authoritative, read-only engineering metadata for final CII RIGID rows.
 *
 * CII ELEMENTS line 1 is FROM, TO, DX, DY, DZ, OD. Its OD may establish a
 * qualified nominal DN even when converter splitting created node 10000+
 * with no source XML node identity. The CII branch label may independently
 * select an EXACT run-pinned XML branch rating. Neither proves which physical
 * component owns a RIGID pointer; never use these values for catalog auto
 * selection, edited weights, mass approval or final CII patch authority.
 */
import { qualifiedXmlCiiNominalBoreFromOd, resolveXmlCiiRigidReviewBranchContext } from '../../converters/xml-cii2019-core/weight-match-model.js';
import { normalizeXmlCiiRating } from '../../converters/xml-cii2019-core/dtxr-rating-resolver.js';
import { buildPipingClassIndex } from '../../converters/xml-cii2019-core/piping-class-resolver.js';

const clean = (v) => String(v ?? '').trim();
const tag = (n) => clean(n?.localName || n?.nodeName).replace(/^.*:/, '');
const elementsOf = (n, tagName) => [...(n?.childNodes || [])]
  .filter((item) => item.nodeType === 1 && tag(item) === tagName);
const value = (n, name) => clean(elementsOf(n, name)[0]?.textContent);
const evidenceOf = (valueOrNull, basis, extra = {}) =>
  ({ value: valueOrNull ?? null, sourceNode: null, basis, ...extra });
const noValue = (basis, extra = {}) => evidenceOf(null, basis, extra);
const normalize = (raw) => {
  const normalized = normalizeXmlCiiRating(raw);
  return /^\d{2,5}$/.test(normalized) && Number(normalized) > 0 ? normalized : '';
};
const exactValues = (raw) => [...new Set(raw.map(normalize).filter(Boolean))];

function boreFromFinalElements(elements) {
  if (!elements.length) return noValue('No final CII ELEMENTS reference for this RIGID pointer.', { source: 'none' });
  const ods = elements.map((element) => ({
    elementIndex: element.index,
    od: Number(element.outsideDiameterMm),
    valid: Number.isFinite(Number(element.outsideDiameterMm)) &&
      element.outsideDiameterMm !== null && element.outsideDiameterMm !== undefined &&
      Number(element.outsideDiameterMm) > 0,
  }));
  if (ods.some((entry) => !entry.valid))
    return noValue('CII ELEMENTS outside diameter missing, zero or invalid.', {
      source: 'cii-od-unresolved', elements: ods, conflict: false,
    });
  const mapped = ods.map((entry) => ({ ...entry, dn: qualifiedXmlCiiNominalBoreFromOd(entry.od) }));
  const unique = [...new Set(mapped.map((entry) => entry.dn))];
  if (unique.length !== 1 || unique[0] === null) {
    const disputed = unique.length > 1;
    return noValue(disputed
      ? 'CII RIGID links have conflicting OD / nominal DN.'
      : 'CII outside diameter has no qualified OD-to-DN conversion.', {
      source: disputed ? 'cii-od-conflict' : 'cii-od-unresolved',
      conflict: disputed, elements: mapped,
    });
  }
  const odText = [...new Set(mapped.map((entry) => entry.od))].join(', ');
  return evidenceOf(unique[0], 'Final CII ELEMENTS OD ' + odText + ' mm → DN ' + unique[0], {
    source: 'cii-od-dn', original: odText, originalField: 'ELEMENTS.firstLine.OD',
    elements: mapped, conversion: 'qualifiedXmlCiiNominalBoreFromOd', nominal: true,
  });
}

function directOverride(config, name) {
  const rating = config?.overrides?.rating;
  const process = config?.overrides?.processData;
  const direct = rating && !Array.isArray(rating) && typeof rating === 'object'
    ? rating[name] : '';
  const processRating = process && !Array.isArray(process) && typeof process === 'object'
    ? process[name]?.rating : '';
  const results = exactValues([direct, processRating]);
  return results;
}

function indexBranchRatings(evidence) {
  const result = new Map();
  if (evidence.sourceKind !== 'xml' || !clean(evidence.engineInputText))
    return { branches: result, reason: 'Exact run-pinned enriched XML unavailable for branch Rating.' };
  if (typeof DOMParser === 'undefined')
    return { branches: result, reason: 'XML DOM parser unavailable for run-pinned Rating.' };
  let config = {};
  try {
    config = JSON.parse(clean(evidence.supportConfigJson) || '{}');
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid config');
  } catch {
    return { branches: result, reason: 'Run-pinned Rating configuration malformed.' };
  }
  try {
    const doc = new DOMParser().parseFromString(evidence.engineInputText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Parser error');
    const all = [...doc.getElementsByTagName('*')];
    const branches = all.length
      ? all.filter((item) => tag(item) === 'Branch')
      : [...doc.getElementsByTagName('Branch')];
    // Construct only one verified branch context per exact CII branch label.
    const classIndex = buildPipingClassIndex(config?.pipingClass?.masterRows || []);
    for (const branch of branches) {
      const name = value(branch, 'Branchname');
      if (!name) continue;
      const matches = result.get(name) || [];
      const nodeRatings = elementsOf(branch, 'Node').map((node) => value(node, 'Rating')).filter(Boolean);
      const nodeValues = exactValues(nodeRatings);
      const branchRaw = value(branch, 'Rating');
      const directBranchRating = normalize(branchRaw);
      const overrides = directOverride(config, name);
      let resolved = null;
      try { resolved = resolveXmlCiiRigidReviewBranchContext(branch, config, classIndex); }
      catch { /* explicit exact XML Rating can still be read without a master */ }
      const contextRating = normalize(resolved?.rating);
      matches.push({
        branchName: name, nodeValues, nodeRatings,
        directBranchRating, branchRaw, overrides, contextRating,
        contextLineKey: clean(resolved?.lineKey),
        requestedPipingClass: clean(resolved?.requestedPipingClass),
        resolvedPipingClass: clean(resolved?.resolvedPipingClass),
        pipingClassNeedsReview: resolved?.pipingClassNeedsReview === true,
        pipingClassMatchMethod: clean(resolved?.pipingClassMatchMethod),
      });
      result.set(name, matches);
    }
    return { branches: result, reason: '' };
  } catch {
    return { branches: new Map(), reason: 'Run-pinned enriched XML could not be parsed.' };
  }
}
function ratingFromBranch(elements, indexed, digest) {
  if (!elements.length) return noValue('No final CII element links; branch cannot be established.', { source: 'none' });
  const names = [...new Set(elements.map((e) => clean(e.branchName)))];
  if (names.length !== 1 || !names[0]) return noValue('Final CII RIGID branch identities are missing or ambiguous.', {
    source: 'cii-branch-conflict', conflict: names.length > 1, branchNames: names,
  });
  const name = names[0];
  if (indexed.reason) return noValue(indexed.reason, { source: 'run-evidence-unavailable', branchName: name });
  const matches = indexed.branches.get(name) || [];
  if (matches.length !== 1) return noValue(matches.length
    ? 'Multiple enriched XML branches have the same CII branch label.'
    : 'Exact CII branch label is absent from run-pinned enriched XML.', {
    source: 'xml-branch-unresolved', branchName: name, conflict: matches.length > 1,
  });
  const branch = matches[0];
  const allDirect = [
    ...branch.overrides,
    ...(branch.directBranchRating ? [branch.directBranchRating] : []),
    ...branch.nodeValues,
  ];
  const distinct = [...new Set(allDirect)];
  const conflicting = distinct.length > 1 || branch.nodeValues.length > 1 ||
    branch.overrides.length > 1;
  const provenance = {
    source: 'enriched-xml-branch-rating',
    branchName: name, engineInputDigest: clean(digest),
    exactBranchMatch: true, branchRaw: branch.branchRaw,
    nodeRatings: branch.nodeRatings, overrides: branch.overrides,
    lineKey: branch.contextLineKey, requestedPipingClass: branch.requestedPipingClass,
    resolvedPipingClass: branch.resolvedPipingClass,
    pipingClassMatchMethod: branch.pipingClassMatchMethod,
  };
  if (conflicting) return noValue('Conflicting run-pinned branch / node / override Rating; review required.', {
    ...provenance, conflict: true, conflictingRatings: distinct,
  });
  if (branch.overrides.length === 1) return evidenceOf(branch.overrides[0],
    'Approved run-pinned branch Rating override', { ...provenance, source: 'branch-rating-override' });
  if (branch.directBranchRating) return evidenceOf(branch.directBranchRating,
    'Run-pinned enriched XML branch Rating', provenance);
  if (branch.nodeValues.length === 1) return evidenceOf(branch.nodeValues[0],
    'Consistent Rating across run-pinned enriched XML branch nodes', {
      ...provenance, source: 'enriched-xml-branch-node-rating',
    });
  if (branch.contextRating && !branch.pipingClassNeedsReview)
    return evidenceOf(branch.contextRating,
      'Shared branch/line-list/piping-class Rating resolver', {
        ...provenance, source: 'configured-branch-rating',
      });
  return noValue(branch.contextRating ? 'Piping-class Rating needs review.' :
    'No exact branch Rating or qualified branch rating resolution.', {
    ...provenance, source: 'xml-branch-unresolved',
  });
}

/** Never mutate the inventory, source XML, configuration or final CII. */
export function buildFinalRigidEngineeringFallbacks(inventory, evidence = {}) {
  const rows = Array.isArray(inventory?.rows) ? inventory.rows : [];
  const indexed = indexBranchRatings(evidence);
  return rows.map((row) => {
    const elements = Array.isArray(row.linkedElements) ? row.linkedElements : [];
    return {
      rigidPointer: row.rigidPointer,
      bore: boreFromFinalElements(elements),
      rating: ratingFromBranch(elements, indexed, evidence.engineInputDigest),
      authority: 'read-only-engineering-context-not-physical-component-ownership',
    };
  });
}
