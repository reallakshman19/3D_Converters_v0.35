/**
 * Read-only four-level CII/source projection. This does NOT establish XML
 * edit authority: current source-context evidence lacks an XML byte selector,
 * complete split/deletion lineage and a full downstream weight dependency set.
 */
function mappingOutcome(row, context) {
  if (!row.linkedElements?.length || !context) return 'UNMATCHED';
  if (row.linkedElements.length > 1) return 'AMBIGUOUS';
  if (context.status === 'CONFLICT_REVIEW' || context.conflicts?.length) return 'CONFLICT';
  if (context.status !== 'VERIFIED' || !context.mapping) return 'UNMATCHED';
  return 'EXACT_UNIQUE';
}
function key(parts) { return JSON.stringify(parts); }

export function buildRoundtripReadOnlyLineage(snapshot, inventory, contexts = []) {
  if (snapshot?.schema !== 'xml-cii-roundtrip-snapshot/v1')
    throw new Error('ROUNDTRIP_LINEAGE_REQUIRES_PINNED_SNAPSHOT');
  if (inventory?.schema !== 'xml-cii-final-rigid-inventory/v1' || !Array.isArray(inventory.rows))
    throw new Error('ROUNDTRIP_LINEAGE_REQUIRES_VALIDATED_CII_INVENTORY');
  if (!Array.isArray(contexts) || contexts.length !== inventory.rows.length)
    throw new Error('ROUNDTRIP_LINEAGE_CONTEXT_COUNT_MISMATCH');

  const nodeMap = new Map(), elementMap = new Map(), sourceMap = new Map();
  const auxiliaryRecords = [];
  const counts = { EXACT_UNIQUE: 0, TRANSFORMED_WITH_LINEAGE: 0,
    AMBIGUOUS: 0, UNMATCHED: 0, CONFLICT: 0 };
  if (!Array.isArray(inventory.elements) ||
      inventory.elements.length !== inventory.declared?.elements)
    throw new Error('ROUNDTRIP_LINEAGE_ALL_ELEMENTS_UNAVAILABLE');
  // All emitted ELEMENT records matter, including ordinary pipe segments with
  // RIGID pointer zero. RIGID-owned elements alone are not a complete graph.
  for (const el of inventory.elements) {
    if (!Number.isSafeInteger(el.index) || el.index <= 0)
      throw new Error('ROUNDTRIP_LINEAGE_INVALID_ELEMENT_INDEX');
    const elementIdentity = key([snapshot.runIdentity, 'ELEMENT', el.index]);
    if (elementMap.has(elementIdentity)) throw new Error('ROUNDTRIP_LINEAGE_DUPLICATE_ELEMENT_INDEX');
    elementMap.set(elementIdentity, {
      kind: 'ELEMENT', identity: elementIdentity, elementIndex: el.index,
      branchName: el.branchName, fromNode: el.fromNode, toNode: el.toNode,
      lengthMm: el.lengthMm, outsideDiameterMm: el.outsideDiameterMm,
      rigidPointer: el.rigidPointer,
    });
    for (const nodeNumber of [el.fromNode, el.toNode]) {
      const nodeIdentity = key([snapshot.runIdentity, 'NODE', el.branchName, nodeNumber]);
      const existing = nodeMap.get(nodeIdentity) || {
        kind: 'NODE', identity: nodeIdentity, branchName: el.branchName,
        generatedNodeNumber: nodeNumber, sourceNodeIdentity: null,
        originalOrGenerated: 'UNRESOLVED', connectedElementIndices: [],
      };
      if (!existing.connectedElementIndices.includes(el.index))
        existing.connectedElementIndices.push(el.index);
      nodeMap.set(nodeIdentity, existing);
    }
  }
  for (let i = 0; i < inventory.rows.length; i += 1) {
    const row = inventory.rows[i], context = contexts[i];
    if (context.rigidPointer !== row.rigidPointer) throw new Error('ROUNDTRIP_LINEAGE_POINTER_ORDER_MISMATCH');
    const outcome = mappingOutcome(row, context);
    counts[outcome] += 1;
    const mapping = outcome === 'EXACT_UNIQUE' ? context.mapping : null;
    const sourceCandidate = mapping ? {
      branchName: mapping.branchName,
      sourceNodeOrdinal: mapping.sourceNodeIndex,
      sourceNodeNumber: mapping.sourceNode,
      componentRefNo: mapping.componentRefNo,
      componentType: mapping.componentType,
      sourceNodeSide: mapping.sourceNodeSide,
    } : null;
    if (sourceCandidate) {
      const sourceIdentity = key([snapshot.manifest.engineInputSha256,
        sourceCandidate.branchName, sourceCandidate.sourceNodeOrdinal, sourceCandidate.sourceNodeNumber,
        sourceCandidate.componentRefNo]);
      sourceMap.set(sourceIdentity, { kind: 'ENRICHEDXML_SOURCE', identity: sourceIdentity,
        ...sourceCandidate, sourceFieldSelector: null,
        sourceByteSpan: null, originalSourceXmlSha256: snapshot.manifest.upstreamSourceSha256,
        reversibility: 'UNRESOLVED', editable: false });
    }
    auxiliaryRecords.push({
      kind: 'AUXILIARY', section: 'RIGID', recordPointer: row.rigidPointer,
      value: row.weight, rawValue: row.rawWeight,
      linkedElementIndices: (row.linkedElements || []).map((el) => el.index),
      mappingOutcome: outcome,
      sourceCandidate, sourceOwnerVerifiedForEditing: false,
      reversibility: 'UNRESOLVED', editable: false,
      reason: outcome === 'EXACT_UNIQUE'
        ? 'Source edge candidate only: XML byte selector, complete transformation lineage, allocation and override checks pending.'
        : (context?.reason || 'Source lineage unavailable.'),
    });
  }
  return {
    schema: 'xml-cii-roundtrip-lineage/v1',
    runIdentity: snapshot.runIdentity, sourceXmlSha256: snapshot.manifest.upstreamSourceSha256,
    engineInputSha256: snapshot.manifest.engineInputSha256,
    originalCiiSha256: snapshot.manifest.originalCiiSha256,
    nodes: [...nodeMap.values()], elements: [...elementMap.values()],
    auxiliaryRecords, sourceComponents: [...sourceMap.values()],
    coverage: { totalElements: inventory.elements.length, totalRigids: inventory.rows.length, ...counts, editable: 0 },
    policy: 'READ_ONLY_UNTIL_COMPLETE_TRANSFORMATION_PROVENANCE',
  };
}
