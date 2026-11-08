/**
 * R1 read-only four-level ledger.
 * The existing context resolver can establish a unique engine-input candidate;
 * it does NOT prove physical-mass ownership or an inverse through Python.
 * Hence editable is ALWAYS false in this foundation release.
 */
const identity = (parts) => JSON.stringify(parts);
function classification(context) {
  if (!context || context.status === 'NOT_RESOLVED') return 'UNMATCHED';
  if (context.status === 'CONFLICT_REVIEW') return 'CONFLICT';
  if (context.status !== 'VERIFIED' || !context.mapping) return 'UNMATCHED';
  return 'EXACT_UNIQUE';
}
export function buildRoundtripLineage({ snapshot, inventory, contexts = [], sourceNodes = [] } = {}) {
  if (snapshot?.schema !== 'xml-cii-roundtrip-snapshot/v1') throw new Error('ROUNDTRIP_INVALID_SNAPSHOT');
  if (inventory?.schema !== 'xml-cii-final-rigid-inventory/v1' || !Array.isArray(inventory.elements))
    throw new Error('ROUNDTRIP_FINAL_ELEMENTS_NOT_AVAILABLE');
  if (!Array.isArray(inventory.rows) || !Array.isArray(contexts) || !Array.isArray(sourceNodes))
    throw new Error('ROUNDTRIP_LINEAGE_INPUT_INVALID');
  const byPointer = new Map();
  for (const context of contexts) {
    if (!Number.isSafeInteger(context?.rigidPointer) || byPointer.has(context.rigidPointer))
      throw new Error('ROUNDTRIP_DUPLICATE_OR_INVALID_CONTEXT_POINTER');
    byPointer.set(context.rigidPointer, context);
  }
  const sourceLookup = new Map();
  for (const source of sourceNodes) {
    if (source.engineInputSha256 !== snapshot.hashes.engineInputSha256)
      throw new Error('ROUNDTRIP_STALE_SOURCE_INDEX');
    const key = identity([source.branchName, source.nodeOrdinal, source.nodeNumber, source.componentRefNo]);
    if (!sourceLookup.has(key)) sourceLookup.set(key, []);
    sourceLookup.get(key).push(source);
  }
  const elements = inventory.elements.map((e) => ({
    kind: 'ELEMENT', identity: identity([snapshot.runIdentity, e.index]),
    elementIndex: e.index, branchName: e.branchName,
    fromNode: e.fromNode, toNode: e.toNode,
    lengthMm: e.lengthMm, outsideDiameterMm: e.outsideDiameterMm,
    rigidPointer: e.rigidPointer,
    sourceEdgeIdentity: null,
    sourceOwnerIdentity: null,
    sourceMatchStatus: 'UNRESOLVED',
  }));
  const nodes = [];
  const nodeKeys = new Set();
  for (const element of elements) {
    for (const nodeNumber of [element.fromNode, element.toNode]) {
      const key = identity([snapshot.runIdentity, element.branchName, nodeNumber]);
      if (nodeKeys.has(key)) continue;
      nodeKeys.add(key);
      nodes.push({ kind: 'NODE', identity: key, branchName: element.branchName,
        generatedNodeNumber: nodeNumber, originalNodeNumber: null,
        originalSourceIdentity: null, generationStatus: 'UNKNOWN',
        connectedElements: elements.filter((e) => e.branchName === element.branchName &&
          (e.fromNode === nodeNumber || e.toNode === nodeNumber)).map((e) => e.elementIndex) });
    }
  }
  const auxiliaries = inventory.rows.map((rigid) => {
    const context = byPointer.get(rigid.rigidPointer);
    const preliminary = classification(context);
    const m = context?.mapping;
    let sourceCandidates = [];
    let mappingStatus = preliminary;
    if (preliminary === 'EXACT_UNIQUE') {
      sourceCandidates = sourceLookup.get(identity([
        m.branchName, m.sourceNodeIndex, String(m.sourceNode), String(m.componentRefNo).toUpperCase(),
      ])) || [];
      mappingStatus = sourceCandidates.length === 1 ? 'EXACT_UNIQUE'
        : sourceCandidates.length > 1 ? 'AMBIGUOUS' : 'UNMATCHED';
    }
    // Deliberate: context.metadata/nearest suggestions are NOT source-mass authority.
    const candidate = sourceCandidates.length === 1 ? sourceCandidates[0] : null;
    return {
      kind: 'AUXILIARY', section: 'RIGID', recordPointer: rigid.rigidPointer,
      identity: identity([snapshot.runIdentity, 'RIGID', rigid.rigidPointer]),
      propertyId: 'RIGID.weight', ciiValue: rigid.weight,
      ciiUnit: 'CII_OUTPUT_WEIGHT',
      linkedElements: rigid.linkedElements.map((e) => ({
        elementIndex: e.index, fromNode: e.fromNode, toNode: e.toNode,
        branchName: e.branchName, lengthMm: e.lengthMm,
      })),
      sourceCandidates: sourceCandidates.map((s) => s.sourceNodeIdentity),
      engineInputSourceCandidate: candidate?.sourceNodeIdentity || null,
      componentRefNoCandidate: candidate?.componentRefNo || null,
      mappingStatus, // engine-input correlation only
      verifiedSourceOwner: null,
      originalUploadedXmlIdentity: null,
      transformationHistory: [],
      completeOutputDependencies: false,
      physicalMassOwnerVerified: false,
      reversibility: 'UNRESOLVED',
      editable: false,
      reason: mappingStatus !== 'EXACT_UNIQUE'
        ? String(context?.reason || 'No unique engine-input source candidate.')
        : 'Engine-input candidate correlated; Python transforms, source mass ownership and allocation not proven.',
    };
  });
  const statuses = ['EXACT_UNIQUE', 'TRANSFORMED_WITH_LINEAGE', 'AMBIGUOUS', 'UNMATCHED', 'CONFLICT'];
  const coverage = Object.fromEntries(statuses.map((status) =>
    [status, auxiliaries.filter((record) => record.mappingStatus === status).length]));
  return {
    schema: 'xml-cii-roundtrip-lineage/v1',
    runIdentity: snapshot.runIdentity,
    baseline: {
      sourceXmlSha256: snapshot.hashes.originalXmlSha256,
      engineInputSha256: snapshot.hashes.engineInputSha256,
      ciiSha256: snapshot.hashes.originalCiiSha256,
      configSha256: snapshot.hashes.configSha256,
      engineIdentity: snapshot.engineIdentity, weightScale: snapshot.weightScale,
    },
    nodes, elements, auxiliaries,
    sources: sourceNodes,
    coverage, editEnabled: false,
    qualification: 'READ_ONLY_CANDIDATES_NO_PHYSICAL_MASS_AUTHORITY',
  };
}
