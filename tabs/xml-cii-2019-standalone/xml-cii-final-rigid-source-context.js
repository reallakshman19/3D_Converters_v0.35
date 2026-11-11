/**
 * Read-only, run-pinned CII RIGID -> source XML engineering context.
 * A catalog suggestion is never an authority for component ownership.
 * Branch + exact numbered edge + final geometry + owner ComponentRefNo
 * must agree. Synthetic/renumbered edges without an explicit source
 * identity are reported unresolved instead of being guessed by length.
 */
import { collectXmlCiiWeightMatchRows, xmlCiiForwardElementLengths, qualifiedXmlCiiNominalBoreFromOd } from '../../converters/xml-cii2019-core/weight-match-model.js';
import { buildDtxrContext, resolveDtxrForXmlNode } from '../../converters/xml-cii2019-core/dtxr-resolver.js';
import { resolveStandaloneWeightReviewRating } from './ui-adapted/xml-cii-adapted-weight-rating-authority.js';
import { buildFinalRigidEngineeringFallbacks } from './xml-cii-final-rigid-context-fallback.js';

const clean = (v) => String(v ?? '').trim();
const tag = (n) => clean(n?.localName || n?.nodeName).replace(/^.*:/, '');
const child = (n, key) => [...(n?.childNodes || [])].find((x) => x.nodeType === 1 && tag(x) === key);
const value = (n, key) => clean(child(n, key)?.textContent);
const ref = (x) => clean(x).replace(/^=/, '').toUpperCase();
const id = (x) => Number.isSafeInteger(Number(x)) && Number(x) > 0 ? String(Number(x)) : '';
const triple = (branch, from, to) => JSON.stringify([branch, from, to]);
const ownerKey = (branch, number, component) => JSON.stringify([branch, number, ref(component)]);
const finite = (x) => clean(x) && Number.isFinite(Number(x)) ? Number(x) : null;
const positive = (x) => { const n = finite(x); return n !== null && n > 0 ? n : null; };
const observed = (val, sourceNode, basis, details = {}) =>
  ({ value: val || null, sourceNode: sourceNode || null, basis, ...details });
function empty(pointer, reason) {
  return { rigidPointer: pointer, status: 'NOT_RESOLVED', reason, mapping: null,
    bore: observed(null, null, 'Not resolved'),
    rating: observed(null, null, 'Not resolved'),
    dtxr: observed(null, null, 'Not resolved'), conflicts: [],
    eligibleForAutomaticReference: false };
}
function parseConfig(evidence) {
  try {
    const config = JSON.parse(clean(evidence.supportConfigJson) || '{}');
    return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  } catch { return null; }
}
function rowOf(node, branchName, index) {
  return { node, branchName, index, number: id(value(node, 'NodeNumber')),
    rawNumber: value(node, 'NodeNumber'), componentRefNo: ref(value(node, 'ComponentRefNo')),
    componentType: value(node, 'ComponentType').toUpperCase(),
    rigid: Number(value(node, 'Rigid')) === 2,
    endpoint: value(node, 'Endpoint'), nodeName: value(node, 'NodeName'),
    boreRaw: value(node, 'BoreMm'), odRaw: value(node, 'OutsideDiameter'),
    ratingRaw: value(node, 'Rating'),
    dtxrRaw: value(node, 'DTXR_POS') || value(node, 'DtxrPos') ||
      value(node, 'DTXR_PS') || value(node, 'DtxrPs') };
}
function weightBearing(node) {
  return Boolean(node?.rigid || /^(RIGID|FLAN|VALV|VLV|INST)/.test(node?.componentType || ''));
}
function sourceIndex(xmlText, forwardLengths) {
  if (typeof DOMParser === 'undefined') throw new Error('XML DOM parser unavailable.');
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Malformed run-pinned XML.');
  const edges = new Map();
  const all = [...doc.getElementsByTagName('*')];
  const branches = all.length ? all.filter((n) => tag(n) === 'Branch') : [...doc.getElementsByTagName('Branch')];
  for (const branch of branches) {
    const branchName = value(branch, 'Branchname');
    if (!branchName) continue;
    const nodes = [...(branch.childNodes || [])].filter((n) => n.nodeType === 1 && tag(n) === 'Node');
    const lengths = forwardLengths(nodes);
    const qualifiedBranchBores = nodes.map((node) => {
      const od = positive(value(node, 'OutsideDiameter'));
      return od !== null ? qualifiedXmlCiiNominalBoreFromOd(od)
        : positive(value(node, 'BoreMm'));
    }).filter((x) => x !== null);
    const uniqueBranchBores = [...new Set(qualifiedBranchBores)];
    const branchBore = uniqueBranchBores.length === 1 ? uniqueBranchBores[0] : null;
    let prev = null;
    nodes.forEach((node, index) => {
      const current = rowOf(node, branchName, index);
      if (!current.number) return;
      if (prev) {
        const lengthMm = finite(lengths[index]);
        if (lengthMm !== null && lengthMm > 0) {
          const key = triple(branchName, prev.number, current.number);
          const list = edges.get(key) || [];
          list.push({ from: prev, to: current, branchName, lengthMm, branchBore });
          edges.set(key, list);
        }
      }
      prev = current;
    });
  }
  return edges;
}
function authoritativeOwner(edge) {
  const to = edge.to, from = edge.from;
  if (to.componentRefNo && weightBearing(to)) {
    // Adjacent distinct weight-bearing components are not proof of which
    // physical component owns the CII span; refuse automatic association.
    if (from.componentRefNo && from.componentRefNo !== to.componentRefNo && weightBearing(from))
      return { reason: 'FROM/TO are different weight-bearing source components; ownership conflict.' };
    return { node: to, side: 'TO' };
  }
  if (from.componentRefNo && weightBearing(from) && from.componentRefNo === to.componentRefNo)
    return { node: from, side: 'FROM' };
  return { reason: 'No verified TO owner or same-component FROM fallback for this edge.' };
}
function issueIndex(issues) {
  const index = new Map();
  for (const issue of issues) {
    const key = ownerKey(issue.branchName, id(issue.nodeNumber), issue.componentRefNo);
    const list = index.get(key) || [];
    list.push(issue);
    index.set(key, list);
  }
  return index;
}
function metadataFor(node, issue, config, dtxrContext, branchBore) {
  const selectedBore = positive(issue?.boreMm);
  const explicitBore = positive(node.boreRaw);
  const nominalFromOd = qualifiedXmlCiiNominalBoreFromOd(node.odRaw);
  const branchFallback = !node.odRaw && branchBore !== null && selectedBore === branchBore;
  const bore = nominalFromOd !== null
    ? observed(nominalFromOd, node.number, 'qualified Weight Match OD-to-DN', {
      source:'node-outside-diameter',original:node.odRaw,
      originalField:'OutsideDiameter',
      staleSourceBoreMm: explicitBore !== null && explicitBore !== nominalFromOd
        ? explicitBore : null })
    : (!node.odRaw && explicitBore !== null)
      ? observed(explicitBore, node.number, 'source BoreMm', { original: node.boreRaw })
      : branchFallback
        ? observed(branchBore, node.number, 'single verified branch Bore / Weight Match context', {
          originalField: 'branch', original: String(branchBore) })
        : observed(null, node.number,
          node.odRaw ? 'Unknown OD-to-DN mapping; nominal bore refused' :
            'No verified component or unique branch bore', { original: node.odRaw || '' });
  // Use the actual shared rating-authority resolver, including approved
  // overrides and DTXR disagreement. Never use DTXR rating as a replacement.
  let dtxrResult;
  if (issue) {
    dtxrResult = { canonicalText: issue.dtxr || '', source: issue.dtxrSource || '',
      matchedBy: issue.dtxrMatchedBy || '', matchedKey: issue.dtxrMatchedKey || '',
      _sourcePath: issue.dtxrSourcePath || '', suppressed: issue.dtxrSuppressed === true,
      suppressionReason: issue.dtxrSuppressionReason || '' };
  } else {
    dtxrResult = resolveDtxrForXmlNode({ xmlNode: node.node, context: dtxrContext,
      purpose: 'weight-review', config, trustExistingXmlDtxr: false });
  }
  const dtxrValue = !dtxrResult?.suppressed ? clean(dtxrResult?.canonicalText) : '';
  const ratingAuth = resolveStandaloneWeightReviewRating({
    ...(issue || {}), key: issue?.key || node.branchName,
    branchName: node.branchName, nodeNumber: node.rawNumber,
    rating: issue?.rating || node.ratingRaw, dtxr: dtxrValue,
    dtxrRating: issue?.dtxrRating || '',
  }, config);
  const rating = observed(ratingAuth.rating || null, node.number, ratingAuth.resolvedSource,
    { rawSourceRating: node.ratingRaw, dtxrRating: ratingAuth.dtxrRating,
      conflict: ratingAuth.conflict, authority: ratingAuth });
  const dtxr = observed(dtxrValue || null, node.number, dtxrResult?.source || 'not-found',
    { matchedBy: dtxrResult?.matchedBy || '', matchedKey: dtxrResult?.matchedKey || '',
      sourcePath: dtxrResult?._sourcePath || '',
      suppressed: dtxrResult?.suppressed === true,
      suppressionReason: dtxrResult?.suppressionReason || '' });
  return { bore, rating, dtxr };
}
export function buildFinalRigidSourceContexts(inventory, evidence = {}, authorities = {}) {
  const rows = Array.isArray(inventory?.rows) ? inventory.rows : [];
  // Engineering context is distinct from physical mass ownership. A synthetic
  // final CII node can still carry a pipe OD and an exact branch label.
  // Never turn those two metadata observations into a ComponentRefNo mapping.
  const fallbacks = buildFinalRigidEngineeringFallbacks(inventory, evidence);
  const mergeReadOnly = (context, index) => {
    const fallback = fallbacks[index];
    if (!fallback) return context;
    const missingBore = context.bore?.value === null || context.bore?.value === undefined;
    const missingRating = context.rating?.value === null || context.rating?.value === undefined;
    // Final exported CII ELEMENT OD is the authoritative size for the
    // particular emitted edge. It may be downstream of a reducer while source
    // XML still contains an obsolete branch-wide nominal BoreMm.
    const ciiBore = fallback.bore?.source === 'cii-od-dn' ? fallback.bore : null;
    const staleBore = ciiBore && context.bore?.value != null &&
      Number(context.bore.value) !== Number(ciiBore.value)
        ? {sourceValue:context.bore.value,ciiNominalBore:ciiBore.value,
          reason:'Source BoreMm disagrees with emitted CII OD: final edge DN controls review'} : null;
    const bore = ciiBore || (missingBore ? fallback.bore : context.bore);
    const rating = missingRating ? fallback.rating : context.rating;
    const newConflicts = [
      ...(context.conflicts || []),
      ...(missingBore && fallback.bore.conflict ? ['CII_BORE_CONFLICT'] : []),
      ...(missingRating && fallback.rating.conflict ? ['BRANCH_RATING_CONFLICT'] : []),
    ];
    const sourceUnresolved = !context.mapping;
    return {
      ...context, bore, rating,
      ...(staleBore ? {boreEvidenceMismatch:staleBore} : {}),
      conflicts: [...new Set(newConflicts)],
      status: context.status === 'VERIFIED' && newConflicts.length ? 'CONFLICT_REVIEW' : context.status,
      // The existing mass / catalog authority is never elevated by CII or
      // branch-level metadata alone. Unresolved components remain unresolved.
      eligibleForAutomaticReference: !sourceUnresolved && context.eligibleForAutomaticReference &&
        newConflicts.length === 0 && !staleBore,
      fallbackEvidence: fallback,
    };
  };
  const finish = (contexts) => contexts.map(mergeReadOnly);
  const unresolved = (reason) => finish(rows.map((r) => empty(r.rigidPointer, reason)));
  if (evidence.sourceKind !== 'xml' || !clean(evidence.engineInputText))
    return unresolved('Exact run-pinned converter input XML unavailable.');
  const config = parseConfig(evidence);
  if (!config) return unresolved('Run-pinned configuration is malformed.');
  let edges, issues, dtxrContext;
  try {
    edges = sourceIndex(evidence.engineInputText, authorities.forwardLengths || xmlCiiForwardElementLengths);
    issues = authorities.issues || (authorities.collectWeightRows || collectXmlCiiWeightMatchRows)(
      evidence.engineInputText, evidence.stagedJsonText || '', config);
    dtxrContext = buildDtxrContext(evidence.stagedJsonText || '', config);
  } catch (error) {
    return unresolved('Source indexing / engineering authority failed: ' + (error?.message || String(error)));
  }
  const issueByOwner = issueIndex(issues);
  return finish(rows.map((row) => {
    if (row.linkedElements?.length !== 1)
      return empty(row.rigidPointer, 'Final RIGID pointer references zero/multiple ELEMENTS records.');
    const element = row.linkedElements[0];
    if (!clean(element.branchName)) return empty(row.rigidPointer, 'Final CII branch is unavailable.');
    const candidates = edges.get(triple(element.branchName, element.fromNode, element.toNode)) || [];
    if (candidates.length !== 1)
      return empty(row.rigidPointer, 'Exact branch/FROM/TO source edge count is ' + candidates.length + '.');
    const edge = candidates[0];
    if (Math.abs(edge.lengthMm - Number(element.lengthMm)) > 0.03)
      return empty(row.rigidPointer, 'Final CII length disagrees with exact source edge (>0.03 mm).');
    const chosen = authoritativeOwner(edge);
    if (!chosen.node) return empty(row.rigidPointer, chosen.reason);
    const owner = chosen.node;
    const matches = issueByOwner.get(ownerKey(owner.branchName, owner.number, owner.componentRefNo)) || [];
    if (matches.length > 1)
      return empty(row.rigidPointer, 'Ambiguous Weight Match rows for verified component and source node.');
    const metadata = metadataFor(owner, matches[0], config, dtxrContext, edge.branchBore);
    const conflicts = [];
    if (metadata.rating.conflict) conflicts.push('RATING_CONFLICT');
    if (metadata.bore.value !== null && positive(matches[0]?.boreMm) !== null &&
      metadata.bore.value !== positive(matches[0]?.boreMm)) conflicts.push('BORE_AUTHORITY_CONFLICT');
    // A shared physical ComponentRefNo must not silently carry contradictory
    // values between FROM and TO even when endpoint priority selects TO.
    if (edge.from.componentRefNo && edge.from.componentRefNo === edge.to.componentRefNo) {
      for (const [key, raw] of [['bore', 'boreRaw'], ['rating', 'ratingRaw'], ['dtxr', 'dtxrRaw']]) {
        const a = clean(edge.from[raw]), b = clean(edge.to[raw]);
        if (a && b && (key === 'bore' ? Number(a) !== Number(b) : a.toUpperCase() !== b.toUpperCase()))
          conflicts.push(key.toUpperCase() + '_SOURCE_CONFLICT');
      }
    }
    const mapping = {
      branchName: edge.branchName, fromNode: edge.from.number, toNode: edge.to.number,
      componentRefNo: owner.componentRefNo, componentType: owner.componentType,
      sourceNode: owner.number, sourceNodeSide: chosen.side, sourceNodeIndex: owner.index,
      endpoint: owner.endpoint, sourceNodeName: owner.nodeName,
      sourceLengthMm: edge.lengthMm, ciiLengthMm: Number(element.lengthMm),
      elementIndex: element.index, engineInputDigest: clean(evidence.engineInputDigest),
    };
    return { rigidPointer: row.rigidPointer,
      status: conflicts.length ? 'CONFLICT_REVIEW' : 'VERIFIED',
      reason: conflicts.length ? conflicts.join(', ') : 'Exact run/branch/edge/geometry/source-component evidence.',
      mapping, ...metadata, conflicts,
      eligibleForAutomaticReference: conflicts.length === 0 &&
        metadata.bore.value !== null && Boolean(metadata.rating.value) && !metadata.dtxr.suppressed };
  }));
}
