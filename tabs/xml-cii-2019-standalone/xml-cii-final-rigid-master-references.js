import {
  collectXmlCiiWeightMatchRows,
  xmlCiiForwardElementLengths,
} from '../../converters/xml-cii2019-core/weight-match-model.js';
import { buildFinalRigidSourceContexts } from './xml-cii-final-rigid-source-context.js';
import { rankXmlCiiWeightCandidates } from '../../converters/xml-cii2019-core/weight-valve-hints.js';

const clean = (v) => String(v ?? '').trim();
const localName = (node) => clean(node?.localName || node?.nodeName).replace(/^.*:/, '');
const children = (node, name) => [...(node?.childNodes || [])]
  .filter((item) => item.nodeType === 1 && localName(item) === name);
const value = (node, tag) => clean(children(node, tag)[0]?.textContent);
const normalizeRef = (ref) => clean(ref).replace(/^=/, '').toUpperCase();
const positive = (v) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
const numericId = (value) => {
  const number = Number(clean(value));
  return Number.isSafeInteger(number) && number > 0 ? String(number) : '';
};
const pairKey = (branch, from, to) => JSON.stringify([branch, from, to]);
const ownerKey = (branch, to) => JSON.stringify([branch, to]);

function sourceEdges(xml, forwardLengths = xmlCiiForwardElementLengths) {
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const result = [];
  const all = [...doc.getElementsByTagName('*')];
  const branches = all.length ? all.filter((n) => localName(n) === 'Branch')
    : [...doc.getElementsByTagName('Branch')];
  for (const branch of branches) {
    const branchName = value(branch, 'Branchname');
    if (!branchName) continue;
    const nodes = children(branch, 'Node');
    const lengths = forwardLengths(nodes);
    for (let i = 1; i < nodes.length; i += 1) {
      const from = numericId(value(nodes[i - 1], 'NodeNumber'));
      const to = numericId(value(nodes[i], 'NodeNumber'));
      if (!from || !to) continue;
      const owner = nodes[i];
      const predecessor = nodes[i - 1];
      const type = value(owner, 'ComponentType').toUpperCase();
      const ownsRigid = Number(value(owner, 'Rigid')) === 2
        || (Number(value(predecessor, 'Rigid')) === 2 && type === 'FLAN');
      if (!ownsRigid || !(lengths[i] > 0)) continue;
      result.push({
        branchName, from, to, lengthMm: lengths[i], node: owner,
        componentType: type, componentRefNo: normalizeRef(value(owner, 'ComponentRefNo')),
        nodeName: value(owner, 'NodeName'), endpoint: value(owner, 'Endpoint'),
      });
    }
  }
  return result;
}

function normalizeCandidate(candidate, issue, scale, rank) {
  const weightKg = positive(candidate?.selectedWeight ?? candidate?.suggestedWeight ?? candidate?.weight);
  if (!weightKg || !candidate?.ratingExact || !(Number(candidate.boreDelta) < 1)) return null;
  if (candidate.zeroFallback) return null;
  const approximate = Boolean(candidate.inferredWeight || candidate.fallbackSuggestion
    || candidate.flangeWeightFallback || candidate.lengthQualified !== true);
  // Existing same-bore/rating interpolation/factor fallback may be offered to a
  // human, never auto-selected. Unqualified arbitrary catalog rows are refused.
  if (candidate.lengthQualified !== true && !candidate.fallbackSuggestion
      && !candidate.flangeWeightFallback) return null;
  const method = clean(candidate.weightMethod || candidate.method || 'master');
  const label = clean(candidate.typeDesc || candidate.valveType || candidate.type || 'Catalog row');
  const source = clean(candidate.rowData?.id || candidate.rowData?.ID || candidate.rowData?.RowId
    || candidate.rowData?.rowId || candidate.rowData?.Source || candidate.rowData?.source || '');
  const masterLength = Number(candidate.rowLength);
  const semantic = clean(candidate.semanticReason);
  const weight = weightKg * scale;
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const basis = [
    'Master candidate', label,
    `Bore ${issue.boreMm} mm`, `rating ${issue.rating}`,
    Number.isFinite(masterLength) ? `master length ${masterLength} mm` : '',
    `physical span ${Number(issue.lengthMm).toFixed(3)} mm`,
    `method ${method}`, approximate ? 'APPROXIMATE / REVIEW REQUIRED' : 'DIRECT QUALIFIED MASTER',
    clean(candidate.weightWarning), semantic, source ? `row ${source}` : '',
    `${weightKg} kg × ${scale} = ${weight} exported units`,
  ].filter(Boolean).join(' · ');
  return {
    rank, referenceWeight: weight, masterWeightKg: weightKg,
    title: label, method, source, masterLengthMm: masterLength,
    basis, preferred: candidate.preferred === true, approximate,
    semanticTier: Number(candidate.semanticTier) || 0,
    direct: !approximate && ['master', 'exact'].includes(method.toLowerCase()),
  };
}

function failed(pointer, reason) {
  return { rigidPointer: pointer, mapping: null, candidates: [], autoIndex: -1, reason };
}

export function buildFinalRigidReferencePlans(inventory, evidence = {}, authorities = {}) {
  const finalRows = Array.isArray(inventory?.rows) ? inventory.rows : [];
  // Resolve engineering context separately: a missing master must not erase a
  // verified source component's Bore, Rating, DTXR or provenance.
  const contexts = buildFinalRigidSourceContexts(inventory, evidence, authorities);
  const finish = (rows) => rows.map((plan, index) => {
    const context = contexts[index];
    if (!context) return plan;
    const verified = Boolean(context.mapping);
    const consistent = !plan.mapping || !context.mapping ||
      (plan.mapping.branchName === context.mapping.branchName &&
       plan.mapping.componentRefNo === context.mapping.componentRefNo);
    const candidates = verified && consistent ? plan.candidates : [];
    const autoIndex = context.eligibleForAutomaticReference && consistent ? plan.autoIndex : -1;
    const restriction = context.status === 'CONFLICT_REVIEW'
      ? 'Source metadata conflict: automatic reference selection disabled.'
      : !verified ? context.reason : !consistent
        ? 'Source-component identities disagree: catalog evidence refused.' : '';
    return { ...plan, sourceContext: context,
      mapping: context.mapping || null, candidates, autoIndex,
      reason: [restriction, plan.reason].filter(Boolean).join(' · ') };
  });
  const missing = (reason) => finish(finalRows.map((row) => failed(row.rigidPointer, reason)));
  if (evidence.sourceKind !== 'xml' || !clean(evidence.engineInputText))
    return missing('No exact run-pinned XML engine input; re-run XML conversion for master evidence.');
  if (![1, 10].includes(Number(evidence.weightScale)))
    return missing('Emitted weight unit scale was not captured for this run.');
  if (!clean(evidence.supportConfigJson)) return missing('Run-pinned weight master configuration unavailable.');
  let config;
  try { config = JSON.parse(evidence.supportConfigJson); }
  catch { return missing('Run-pinned weight configuration cannot be parsed.'); }
  if (!Array.isArray(config?.weight?.masterRows) || !config.weight.masterRows.length)
    return missing('No weight master rows were loaded at conversion time.');
  const edges = sourceEdges(evidence.engineInputText, authorities.forwardLengths || xmlCiiForwardElementLengths);
  if (!edges.length) return missing('No qualified source rigid edges in exact converter XML.');

  let issues;
  try {
    issues = (authorities.collectWeightRows || collectXmlCiiWeightMatchRows)(
      evidence.engineInputText, evidence.stagedJsonText || '', config);
  } catch {
    return missing('Weight Match candidate authority could not evaluate source XML.');
  }
  const byPair = new Map();
  for (const edge of edges) {
    const key = pairKey(edge.branchName, edge.from, edge.to);
    const list = byPair.get(key) || [];
    list.push(edge);
    byPair.set(key, list);
  }
  const byOwner = new Map();
  for (const issue of issues) {
    const key = ownerKey(issue.branchName, numericId(issue.nodeNumber));
    const list = byOwner.get(key) || [];
    list.push(issue);
    byOwner.set(key, list);
  }

  const plans = finalRows.map((row) => {
    if (row.linkedElements?.length !== 1)
      return failed(row.rigidPointer, 'Pointer has zero/multiple final elements; mass allocation ambiguous.');
    const element = row.linkedElements[0];
    if (!element.branchName)
      return failed(row.rigidPointer, 'Final CII element has no verified branch label.');
    const matches = byPair.get(pairKey(element.branchName, element.fromNode, element.toNode)) || [];
    if (matches.length !== 1)
      return failed(row.rigidPointer, `Final branch and node pair has ${matches.length} source matches.`);
    const edge = matches[0];
    if (Math.abs(edge.lengthMm - element.lengthMm) > 0.03)
      return failed(row.rigidPointer, 'Final CII element length disagrees with source edge (>0.03 mm).');
    const ownerIssues = byOwner.get(ownerKey(edge.branchName, edge.to)) || [];
    const matching = ownerIssues.filter((issue) =>
      normalizeRef(issue.componentRefNo) === edge.componentRefNo);
    if (matching.length !== 1)
      return failed(row.rigidPointer, 'Component/owner has zero or ambiguous master review rows.');

    const issue = matching[0];
    const context = contexts[row.rigidPointer - 1];
    // Real Weight Match authority re-ranks against the resolved, run-pinned
    // source component. Injected suites can supply their own ranked issues.
    const reRanked = authorities.collectWeightRows ? issue.candidates :
      rankXmlCiiWeightCandidates({
        boreMm: context?.bore?.value, rating: context?.rating?.value,
        dtxr: context?.dtxr?.value || '',
        lengthMm: issue.lengthMm, nodeName: issue.nodeName,
        componentType: issue.componentType, componentRefNo: issue.componentRefNo,
      }, config, { includeRejected: true }).candidates;
    const candidates = (reRanked || []).map((item, index) =>
      normalizeCandidate(item, { ...issue, boreMm: context?.bore?.value,
        rating: context?.rating?.value }, Number(evidence.weightScale), index))
      .filter(Boolean).slice(0, 5);
    const mapping = {
      branchName: edge.branchName, fromNode: edge.from, toNode: edge.to,
      componentRefNo: edge.componentRefNo, componentType: edge.componentType,
      sourceLengthMm: edge.lengthMm, ciiLengthMm: element.lengthMm,
      sourceNodeName: edge.nodeName, endpoint: edge.endpoint,
      engineInputDigest: clean(evidence.engineInputDigest),
    };
    return {
      rigidPointer: row.rigidPointer, mapping, candidates,
      autoIndex: -1,
      reason: candidates.length ? 'Qualified catalog alternatives available.' : 'No exact qualified catalog reference.',
    };
  });

  // A physical source ComponentRefNo spanning multiple final RIGID pointers
  // cannot have its full master mass auto-applied to every split segment.
  const groupCounts = new Map();
  for (const plan of plans) {
    const m = plan.mapping;
    if (!m?.componentRefNo) continue;
    const key = JSON.stringify([m.branchName, m.componentRefNo]);
    groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
  }
  for (const plan of plans) {
    if (!plan.mapping) continue;
    const m = plan.mapping;
    const count = groupCounts.get(JSON.stringify([m.branchName, m.componentRefNo])) || 1;
    const qualified = plan.candidates.filter((candidate) =>
      candidate.preferred && candidate.direct && candidate.semanticTier > 0);
    // Unique, semantic, exact master basis; no sharing of a physical ref.
    if (count === 1 && m.componentRefNo && plan.candidates.length === 1 && qualified.length === 1) {
      plan.autoIndex = plan.candidates.indexOf(qualified[0]);
      plan.reason = 'Unique exact semantic catalog match; source branch/nodes/geometry verified.';
    } else if (count > 1) {
      plan.reason = `${count} final rigids share physical ComponentRefNo ${m.componentRefNo}; manual reference choice only.`;
    } else if (plan.candidates.length) {
      plan.reason = 'Multiple or non-authoritative catalog candidates; select a reference explicitly.';
    }
  }
  return finish(plans);
}
