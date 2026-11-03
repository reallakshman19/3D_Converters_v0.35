/** Exact junction, boundary, and point-feature parity comparisons. */
import { cleanText } from './topology-values.js';
import { decisionTrace, mismatch, parsedIncidentEdges, pointAt, rowMap, same, sortedText } from './topology-parity-values.js';

export function compareJunctionsToInput(canonical, parsed, ledger) {
  return (canonical.junctions ?? []).flatMap((junction) => {
    const expected = sortedText(junction.participatingEdgeIds ?? (canonical.edges ?? []).filter((edge) => (
      edge.fromNodeId === junction.nodeId || edge.toNodeId === junction.nodeId
    )).map((edge) => edge.id));
    const actual = parsedIncidentEdges(parsed, junction.nodeId);
    return same(expected, actual) ? [] : [mismatch({
      category: 'JUNCTION_MISMATCH_INPUTXML', canonicalIdentity: junction.id,
      expected: { canonicalNodeId: junction.nodeId, participatingEdgeIds: expected },
      actual: { canonicalNodeId: junction.nodeId, participatingEdgeIds: actual },
      sourceEntities: junction.sourceEntityIds, sourcePaths: junction.sourcePaths,
      decisionTrace: decisionTrace(ledger, junction.sourceEntityIds ?? [], [junction.id, junction.nodeId, ...expected]),
      recommendedOwnerModule: 'topology-inputxml-writer.js',
      message: `InputXML graph participation for junction ${junction.id} differs from canonical topology.` } )];
  });
}

export function compareJunctionsToScene(canonical, scene, ledger) {
  const sceneMap = rowMap(scene.junctions, (row) => row.canonicalJunctionId);
  return (canonical.junctions ?? []).flatMap((junction) => {
    const actual = sceneMap.get(junction.id);
    const expectedValue = { canonicalNodeId: junction.nodeId, kind: cleanText(junction.kind),
      participatingEdgeIds: sortedText(junction.participatingEdgeIds), sourceEntityIds: sortedText(junction.sourceEntityIds) };
    const actualValue = actual ? { canonicalNodeId: actual.canonicalNodeId, kind: cleanText(actual.kind),
      participatingEdgeIds: sortedText(actual.participatingCanonicalEdgeIds), sourceEntityIds: sortedText(actual.sourceEntityIds) } : null;
    return same(expectedValue, actualValue) ? [] : [mismatch({
      category: 'JUNCTION_MISMATCH_SVG', canonicalIdentity: junction.id, svgIdentity: actual?.id ?? null,
      expected: expectedValue, actual: actualValue, sourceEntities: junction.sourceEntityIds, sourcePaths: junction.sourcePaths,
      decisionTrace: decisionTrace(ledger, junction.sourceEntityIds ?? [], [junction.id, junction.nodeId]),
      recommendedOwnerModule: 'topology-svg-scene-builder.js',
      message: `SVG junction ${junction.id} differs from canonical junction participation.` } )];
  });
}

export function compareBoundariesToInput(canonical, parsed, ledger) {
  return (canonical.boundaries ?? []).flatMap((boundary) => {
    const expected = sortedText(boundary.participatingEdgeIds ?? (canonical.edges ?? []).filter((edge) => (
      edge.fromNodeId === boundary.nodeId || edge.toNodeId === boundary.nodeId
    )).map((edge) => edge.id));
    const actual = parsedIncidentEdges(parsed, boundary.nodeId);
    return same(expected, actual) ? [] : [mismatch({
      category: 'BOUNDARY_MISMATCH_INPUTXML', canonicalIdentity: boundary.id,
      expected: { canonicalNodeId: boundary.nodeId, participatingEdgeIds: expected, relationship: boundary.relationship },
      actual: { canonicalNodeId: boundary.nodeId, participatingEdgeIds: actual },
      sourceEntities: boundary.sourceEntityIds, sourcePaths: boundary.sourcePaths,
      decisionTrace: decisionTrace(ledger, boundary.sourceEntityIds ?? [], [boundary.id, boundary.nodeId]),
      recommendedOwnerModule: 'topology-inputxml-writer.js',
      message: `InputXML terminal incidence for boundary ${boundary.id} differs from canonical topology.` } )];
  });
}

export function compareBoundariesToScene(canonical, scene, ledger) {
  const map = rowMap(scene.boundaries, (row) => row.canonicalBoundaryId);
  return (canonical.boundaries ?? []).flatMap((boundary) => {
    const actual = map.get(boundary.id);
    const expected = { canonicalNodeId: boundary.nodeId, position: pointAt(boundary.position),
      relationship: cleanText(boundary.relationship), participatingEdgeIds: sortedText(boundary.participatingEdgeIds) };
    const actualValue = actual ? { canonicalNodeId: actual.canonicalNodeId, position: pointAt(actual.position),
      relationship: cleanText(actual.relationship), participatingEdgeIds: sortedText(actual.participatingCanonicalEdgeIds) } : null;
    return same(expected, actualValue) ? [] : [mismatch({
      category: actual ? 'BOUNDARY_MISMATCH_SVG' : 'MISSING_IN_SVG_BOUNDARY', canonicalIdentity: boundary.id,
      svgIdentity: actual?.id ?? null, expected, actual: actualValue, sourceEntities: boundary.sourceEntityIds,
      sourcePaths: boundary.sourcePaths, decisionTrace: decisionTrace(ledger, boundary.sourceEntityIds ?? [], [boundary.id, boundary.nodeId]),
      recommendedOwnerModule: 'topology-svg-scene-builder.js',
      message: `SVG boundary ${boundary.id} differs from canonical boundary.` } )];
  });
}

export function comparePointFeaturesToScene(canonical, scene, ledger) {
  const map = rowMap(scene.pointFeatures, (row) => row.canonicalPointFeatureId);
  return (canonical.pointFeatures ?? []).flatMap((feature) => {
    const actual = map.get(feature.id);
    const expected = { kind: feature.kind, position: pointAt(feature.position), sourceEntityIds: sortedText(feature.sourceEntityIds) };
    const actualValue = actual ? { kind: actual.kind, position: pointAt(actual.position), sourceEntityIds: sortedText(actual.sourceEntityIds) } : null;
    return same(expected, actualValue) ? [] : [mismatch({
      category: actual ? 'POINT_FEATURE_MISMATCH_SVG' : 'MISSING_IN_SVG_POINT_FEATURE', canonicalIdentity: feature.id,
      svgIdentity: actual?.id ?? null, expected, actual: actualValue, sourceEntities: feature.sourceEntityIds,
      sourcePaths: feature.sourcePaths, decisionTrace: decisionTrace(ledger, feature.sourceEntityIds ?? [], [feature.id]),
      recommendedOwnerModule: 'topology-svg-scene-builder.js',
      message: `SVG point feature ${feature.id} differs from canonical point-feature disposition.` } )];
  });
}
