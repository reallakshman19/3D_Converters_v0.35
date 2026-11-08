/**
 * Source-backed property audit. CII displayability is not reversibility.
 * No writable registry entry is promoted until the real converter has
 * demonstrated its inverse, dependency closure and read-back parity.
 */
export const SOURCE_BACKED_PROPERTY_CANDIDATES = Object.freeze([
  ['NODE.number', 'NODE', 'Original/generated identity may diverge.'],
  ['NODE.originalSourceIdentity', 'SOURCE', 'Renumbering/deletion history unavailable.'],
  ['ELEMENT.dxDyDz', 'ELEMENT', 'Topology and split geometry may be transformed.'],
  ['ELEMENT.outsideDiameter', 'ELEMENT', 'Upstream masters/defaults and sharing unqualified.'],
  ['ELEMENT.wallThickness', 'ELEMENT', 'Missing wall may be replaced by converter default.'],
  ['ELEMENT.corrosionAllowance', 'ELEMENT', 'Branch/node fallback and dependencies unqualified.'],
  ['ELEMENT.insulationThickness', 'ELEMENT', 'Process/branch mapping not inverted.'],
  ['ELEMENT.temperatures', 'ELEMENT', 'T1-T9 mapping and cases not inverted.'],
  ['ELEMENT.pressures', 'ELEMENT', 'P1-P9 mapping and cases not inverted.'],
  ['ELEMENT.fluidDensity', 'ELEMENT', 'Unit convention and branch ownership not qualified.'],
  ['ELEMENT.materialId', 'ELEMENT', 'Carry-forward and material mapping not qualified.'],
  ['RIGID.weight', 'AUXILIARY', 'Candidate only: mass owner, allocation and downstream overrides unqualified.'],
  ['RIGID.type', 'AUXILIARY', 'Writer-specific type field not source-invertible.'],
  ['RESTRANT.data', 'AUXILIARY', 'Synthetic/open-end support mapping not inverted.'],
  ['SOURCE.componentRefNo', 'SOURCE', 'Source-only identity, not reconstructible from CII alone.'],
  ['SOURCE.rating', 'SOURCE', 'Source/branch metadata, not a direct RIGID field.'],
  ['SOURCE.dtxr', 'SOURCE', 'Source-only annotation/derived support interpretation.'],
]);
export function auditRoundtripReversibility(lineage) {
  if (lineage?.schema !== 'xml-cii-roundtrip-lineage/v1')
    throw new Error('ROUNDTRIP_REVERSIBILITY_REQUIRES_LINEAGE');
  const rows = SOURCE_BACKED_PROPERTY_CANDIDATES.map(([propertyId, displayLevel, reason]) => ({
    propertyId, displayLevel,
    reversibility: 'UNRESOLVED', access: 'READ_ONLY',
    reason, // No status is elevated from inferred CII content.
  }));
  return {
    schema: 'xml-cii-roundtrip-reversibility/v1',
    runIdentity: lineage.runIdentity,
    rows,
    counts: { fieldsAudited: rows.length, LOSSLESS: 0, LOSSLESS_WITH_PROVENANCE: 0,
      LOSSY: 0, UNRESOLVED: rows.length },
    editableRecords: 0,
    reason: 'Foundation only: exact converter replay plus source-level inverse/read-back not yet qualified.',
  };
}
