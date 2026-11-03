export const FBX2_SUPPORT_NAME_TOKENS = Object.freeze([
  'REST', 'GUIDE', 'STOP', 'WP', 'BP', 'SPR',
]);
export const FBX2_SUPPORT_STRUCTURE_TOKENS = Object.freeze(['PS', 'SL']);

const compare = (a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
const clean = (value) => String(value ?? '').replace(/^[^:]+::/, '').trim();

function segments(source) {
  return [source?.displayName, source?.domSourceName]
    .flatMap((value) => clean(value).split(/[\\/]+/))
    .map((value) => value.trim()).filter(Boolean);
}

function matchToken(source, tokens) {
  for (const segment of segments(source)) {
    const upper = segment.toUpperCase();
    const token = tokens.find((item) => (
      new RegExp(`^${item}(?:$|[-_.:#\\s0-9])`).test(upper)
    ));
    if (token) return { token, label: upper };
  }
  return null;
}

function chainFrom(occurrence, occurrences) {
  const chain = [], seen = new Set();
  let current = occurrence;
  while (current) {
    const id = String(current.sourceOccurrenceId);
    if (seen.has(id)) throw new TypeError(`FBX2_SUPPORT_NAME_ANCESTRY_CYCLE ${id}`);
    seen.add(id); chain.push(current);
    current = current.parentOccurrenceId
      ? occurrences.get(String(current.parentOccurrenceId)) : null;
  }
  return chain;
}

function nearest(chain, sources, tokens, start = 0) {
  for (let index = start; index < chain.length; index += 1) {
    const occurrence = chain[index];
    const source = sources.get(String(occurrence.sourceModelObjectId));
    const match = matchToken(source, tokens);
    if (match) return { occurrence, index, ...match };
  }
  return null;
}

function counts(records, field, tokens) {
  return Object.fromEntries(tokens.map((token) => [
    token, records.filter((record) => record[field] === token).length,
  ]));
}

export function buildFbx2SupportNameInventory({ sourceGraph, selectedOccurrenceIds } = {}) {
  if (sourceGraph?.schema !== 'FbxSourceGraph.v2'
      || !Array.isArray(sourceGraph.sourceObjects)
      || !Array.isArray(sourceGraph.occurrences)
      || !Array.isArray(selectedOccurrenceIds)) {
    throw new TypeError('FBX2_SUPPORT_NAME_INPUT_INVALID');
  }
  const occurrences = new Map(sourceGraph.occurrences.map((item) => (
    [String(item.sourceOccurrenceId), item]
  )));
  const sources = new Map(sourceGraph.sourceObjects.map((item) => (
    [String(item.sourceObjectId), item]
  )));
  const grouped = new Map();
  for (const selectedId of [...new Set(selectedOccurrenceIds.map(String))].sort(compare)) {
    const selected = occurrences.get(selectedId);
    if (!selected) throw new TypeError(`FBX2_SUPPORT_NAME_SELECTED_MISSING ${selectedId}`);
    const chain = chainFrom(selected, occurrences);
    const support = nearest(chain, sources, FBX2_SUPPORT_NAME_TOKENS);
    if (!support) continue;
    const structure = nearest(chain, sources, FBX2_SUPPORT_STRUCTURE_TOKENS, support.index + 1);
    const anchorId = String(support.occurrence.sourceOccurrenceId);
    const record = grouped.get(anchorId) || {
      anchorOccurrenceId: anchorId,
      supportToken: support.token,
      supportLabel: support.label,
      structureAnchorOccurrenceId: structure
        ? String(structure.occurrence.sourceOccurrenceId) : null,
      structureToken: structure?.token ?? null,
      structureLabel: structure?.label ?? null,
      selectedDescendantOccurrenceIds: new Set(),
      selectedGeometryObjectIds: new Set(),
    };
    record.selectedDescendantOccurrenceIds.add(selectedId);
    for (const geometryId of selected.geometryObjectIds || []) {
      record.selectedGeometryObjectIds.add(String(geometryId));
    }
    grouped.set(anchorId, record);
  }
  const candidates = [...grouped.values()].map((record) => Object.freeze({
    ...record,
    selectedDescendantOccurrenceIds: Object.freeze(
      [...record.selectedDescendantOccurrenceIds].sort(compare)),
    selectedGeometryObjectIds: Object.freeze(
      [...record.selectedGeometryObjectIds].sort(compare)),
  })).sort((a, b) => compare(a.anchorOccurrenceId, b.anchorOccurrenceId));
  return Object.freeze({
    schema: 'Fbx2SupportNameInventory.v1',
    candidateCount: candidates.length,
    structureContextCount: candidates.filter((item) => item.structureToken).length,
    supportTokenCounts: Object.freeze(counts(
      candidates, 'supportToken', FBX2_SUPPORT_NAME_TOKENS)),
    structureTokenCounts: Object.freeze(counts(
      candidates, 'structureToken', FBX2_SUPPORT_STRUCTURE_TOKENS)),
    candidates: Object.freeze(candidates),
    authority: Object.freeze({
      supportTokensIdentifyGenericCandidatesOnly: true,
      structureTokensCountedAsSupports: false,
      restraintSubtypeParityClaimed: false,
      pipeContactStillRequiredForParityPass: true,
      proximityUsed: false,
    }),
  });
}
