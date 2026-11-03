/** Exact edge and node parity comparisons. */
import { cleanText } from './topology-values.js';
import {
  canonicalNodeMap, decisionTrace, deltaAt, mismatch, pointAt, rowMap, same, sortedText,
} from './topology-parity-values.js';

export function compareCanonicalEdgeNodeToInputXml(canonical, parsed, ledger = { records: [] }) {
  const mismatches = [];
  const canonicalNodes = canonicalNodeMap(canonical);
  const inputNodes = rowMap(parsed.nodes, (row) => row.canonicalNodeId);
  const canonicalEdges = rowMap(canonical.edges, (row) => row.id);
  const inputEdges = rowMap(parsed.elements, (row) => row.canonicalEdgeId);
  for (const edge of canonical.edges ?? []) {
    const actual = inputEdges.get(edge.id);
    const sourceEntities = sortedText(edge.sourceEntityIds ?? []);
    const trace = decisionTrace(ledger, sourceEntities, [edge.id, edge.fromNodeId, edge.toNodeId]);
    if (!actual) {
      mismatches.push(mismatch({ category: 'MISSING_IN_INPUTXML_EDGE', canonicalIdentity: edge.id,
        expected: edge.inputXmlElementIds?.[0] ?? edge.id, actual: null, sourceEntities,
        sourcePaths: edge.sourcePaths, decisionTrace: trace, recommendedOwnerModule: 'topology-inputxml-writer.js',
        message: `Canonical edge ${edge.id} has no InputXML PIPINGELEMENT.` }));
      continue;
    }
    const expectedIncidence = { from: edge.fromNodeId, to: edge.toNodeId };
    const actualIncidence = { from: actual.fromCanonicalNodeId, to: actual.toCanonicalNodeId };
    if (!same(expectedIncidence, actualIncidence)) mismatches.push(mismatch({
      category: 'INCIDENCE_MISMATCH_INPUTXML_EDGE', canonicalIdentity: edge.id, inputXmlIdentity: actual.id,
      expected: expectedIncidence, actual: actualIncidence, sourceEntities, sourcePaths: edge.sourcePaths,
      decisionTrace: trace, recommendedOwnerModule: 'topology-inputxml-writer.js',
      message: `InputXML incidence for ${edge.id} does not match canonical FROM/TO.` }));
    const from = canonicalNodes.get(edge.fromNodeId), to = canonicalNodes.get(edge.toNodeId);
    const expectedGeometry = { from: pointAt(from?.position), to: pointAt(to?.position), delta: from && to ? deltaAt(from.position, to.position) : null };
    const actualGeometry = { from: actual.fromPosition, to: actual.toPosition, delta: actual.delta };
    if (!same(expectedGeometry, actualGeometry)) mismatches.push(mismatch({
      category: 'COORDINATE_MISMATCH_INPUTXML_EDGE', canonicalIdentity: edge.id, inputXmlIdentity: actual.id,
      expected: expectedGeometry, actual: actualGeometry, sourceEntities, sourcePaths: edge.sourcePaths,
      decisionTrace: trace, recommendedOwnerModule: 'topology-inputxml-writer.js',
      message: `InputXML world geometry for ${edge.id} differs after writer-precision normalization.` }));
    const expectedIdentity = {
      sourceEntityIds: sortedText(edge.sourceEntityIds), sourcePortIds: sortedText(edge.sourcePortIds),
      branchIds: sortedText(edge.branchIds), topologyOperation: cleanText(edge.topologyOperation ?? edge.segmentRole),
      projectionCardinality: cleanText(edge.projectionCardinality || 'ONE_TO_ONE'), mergeAuthority: cleanText(edge.projectionMergeAuthority),
    };
    const actualIdentity = {
      sourceEntityIds: sortedText(actual.sourceEntityIds), sourcePortIds: sortedText(actual.sourcePortIds),
      branchIds: sortedText(actual.branchIds), topologyOperation: cleanText(actual.topologyOperation),
      projectionCardinality: cleanText(actual.projectionCardinality), mergeAuthority: cleanText(actual.mergeAuthority),
    };
    if (!same(expectedIdentity, actualIdentity)) mismatches.push(mismatch({
      category: 'IDENTITY_MISMATCH_INPUTXML_EDGE', canonicalIdentity: edge.id, inputXmlIdentity: actual.id,
      expected: expectedIdentity, actual: actualIdentity, sourceEntities, sourcePaths: edge.sourcePaths,
      decisionTrace: trace, recommendedOwnerModule: 'topology-inputxml-trace-attributes.js',
      message: `InputXML trace identity for ${edge.id} differs from canonical topology.` }));
  }
  for (const element of parsed.elements ?? []) if (!canonicalEdges.has(element.canonicalEdgeId)) mismatches.push(mismatch({
    category: 'EXTRA_IN_INPUTXML_EDGE', inputXmlIdentity: element.id, expected: null,
    actual: element.canonicalEdgeId || element.id, sourceEntities: element.sourceEntityIds,
    recommendedOwnerModule: 'topology-inputxml-writer.js', message: `InputXML element ${element.id} has no canonical edge.` }));
  for (const node of canonical.nodes ?? []) {
    const actual = inputNodes.get(node.id);
    const sourceEntities = sortedText(node.sourceEntityIds ?? []);
    if (!actual) {
      mismatches.push(mismatch({ category: 'MISSING_IN_INPUTXML_NODE', canonicalIdentity: node.id,
        expected: node.inputXmlNodeIds?.[0] ?? node.id, actual: null, sourceEntities, sourcePaths: node.sourcePaths,
        decisionTrace: decisionTrace(ledger, sourceEntities, [node.id]), recommendedOwnerModule: 'topology-inputxml-writer.js',
        message: `Canonical node ${node.id} is not recoverable from InputXML.` }));
      continue;
    }
    const expected = { inputXmlNodeId: cleanText(node.inputXmlNodeIds?.[0]), position: pointAt(node.position),
      sourceEntityIds: sortedText(node.sourceEntityIds), sourcePortIds: sortedText(node.sourcePortIds) };
    const actualValue = { inputXmlNodeId: cleanText(actual.inputXmlNodeId), position: actual.position,
      sourceEntityIds: sortedText(actual.sourceEntityIds), sourcePortIds: sortedText(actual.sourcePortIds) };
    if (!same(expected, actualValue)) mismatches.push(mismatch({
      category: same(expected.position, actualValue.position) ? 'IDENTITY_MISMATCH_INPUTXML_NODE' : 'COORDINATE_MISMATCH_INPUTXML_NODE',
      canonicalIdentity: node.id, inputXmlIdentity: actual.inputXmlNodeId, expected, actual: actualValue,
      sourceEntities, sourcePaths: node.sourcePaths, decisionTrace: decisionTrace(ledger, sourceEntities, [node.id]),
      recommendedOwnerModule: 'topology-inputxml-trace-attributes.js',
      message: `InputXML node ${actual.inputXmlNodeId} does not exactly match canonical node ${node.id}.` }));
  }
  for (const node of parsed.nodes ?? []) if (!canonicalNodes.has(node.canonicalNodeId)) mismatches.push(mismatch({
    category: 'EXTRA_IN_INPUTXML_NODE', inputXmlIdentity: node.inputXmlNodeId, expected: null,
    actual: node.canonicalNodeId, sourceEntities: node.sourceEntityIds,
    recommendedOwnerModule: 'topology-inputxml-topology-parser.js',
    message: `InputXML node ${node.inputXmlNodeId} references unknown canonical node ${node.canonicalNodeId}.` }));
  return mismatches;
}

export function compareCanonicalEdgeNodeToSvgScene(canonical, scene, ledger = { records: [] }) {
  const mismatches = [];
  const canonicalNodes = canonicalNodeMap(canonical);
  const sceneNodes = rowMap(scene.nodes, (row) => row.canonicalNodeId);
  const canonicalEdges = rowMap(canonical.edges, (row) => row.id);
  const sceneEdges = rowMap(scene.edges, (row) => row.canonicalEdgeId);
  for (const edge of canonical.edges ?? []) {
    const actual = sceneEdges.get(edge.id);
    const sourceEntities = sortedText(edge.sourceEntityIds ?? []);
    if (!actual) {
      mismatches.push(mismatch({ category: 'MISSING_IN_SVG_EDGE', canonicalIdentity: edge.id,
        expected: edge.id, actual: null, sourceEntities, sourcePaths: edge.sourcePaths,
        decisionTrace: decisionTrace(ledger, sourceEntities, [edge.id]), recommendedOwnerModule: 'topology-svg-scene-builder.js',
        message: `Canonical edge ${edge.id} has no TopologySvgScene edge.` }));
      continue;
    }
    const expected = { fromCanonicalNodeId: edge.fromNodeId, toCanonicalNodeId: edge.toNodeId,
      fromPosition: pointAt(canonicalNodes.get(edge.fromNodeId)?.position), toPosition: pointAt(canonicalNodes.get(edge.toNodeId)?.position),
      inputXmlElementId: cleanText(edge.inputXmlElementIds?.[0]), sourceEntityIds: sortedText(edge.sourceEntityIds),
      sourcePortIds: sortedText(edge.sourcePortIds), branchIds: sortedText(edge.branchIds),
      topologyOperation: cleanText(edge.topologyOperation ?? edge.segmentRole),
      projectionCardinality: cleanText(edge.projectionCardinality || 'ONE_TO_ONE'), mergeAuthority: cleanText(edge.projectionMergeAuthority) };
    const actualValue = { fromCanonicalNodeId: actual.fromCanonicalNodeId, toCanonicalNodeId: actual.toCanonicalNodeId,
      fromPosition: pointAt(actual.fromPosition), toPosition: pointAt(actual.toPosition), inputXmlElementId: cleanText(actual.inputXmlElementId),
      sourceEntityIds: sortedText(actual.sourceEntityIds), sourcePortIds: sortedText(actual.sourcePortIds), branchIds: sortedText(actual.branchIds),
      topologyOperation: cleanText(actual.topologyOperation), projectionCardinality: cleanText(actual.projectionCardinality), mergeAuthority: cleanText(actual.mergeAuthority) };
    if (!same(expected, actualValue)) mismatches.push(mismatch({
      category: !same([expected.fromCanonicalNodeId, expected.toCanonicalNodeId], [actualValue.fromCanonicalNodeId, actualValue.toCanonicalNodeId])
        ? 'INCIDENCE_MISMATCH_SVG_EDGE' : !same([expected.fromPosition, expected.toPosition], [actualValue.fromPosition, actualValue.toPosition])
          ? 'COORDINATE_MISMATCH_SVG_EDGE' : 'IDENTITY_MISMATCH_SVG_EDGE',
      canonicalIdentity: edge.id, svgIdentity: actual.id, expected, actual: actualValue, sourceEntities, sourcePaths: edge.sourcePaths,
      decisionTrace: decisionTrace(ledger, sourceEntities, [edge.id]), recommendedOwnerModule: 'topology-svg-scene-builder.js',
      message: `SVG scene edge ${actual.id} does not exactly match canonical edge ${edge.id}.` }));
  }
  for (const edge of scene.edges ?? []) if (!canonicalEdges.has(edge.canonicalEdgeId)) mismatches.push(mismatch({
    category: 'EXTRA_IN_SVG_EDGE', svgIdentity: edge.id, expected: null, actual: edge.canonicalEdgeId || edge.id,
    sourceEntities: edge.sourceEntityIds, sourcePaths: edge.sourcePaths, recommendedOwnerModule: 'topology-svg-scene-builder.js',
    message: `SVG scene edge ${edge.id} has no canonical edge.` }));
  for (const node of canonical.nodes ?? []) {
    const actual = sceneNodes.get(node.id);
    if (!actual) {
      mismatches.push(mismatch({ category: 'MISSING_IN_SVG_NODE', canonicalIdentity: node.id, expected: node.id, actual: null,
        sourceEntities: node.sourceEntityIds, sourcePaths: node.sourcePaths, decisionTrace: decisionTrace(ledger, node.sourceEntityIds ?? [], [node.id]),
        recommendedOwnerModule: 'topology-svg-scene-builder.js', message: `Canonical node ${node.id} has no TopologySvgScene node.` }));
      continue;
    }
    const expected = { position: pointAt(node.position), inputXmlNodeId: cleanText(node.inputXmlNodeIds?.[0]),
      sourceEntityIds: sortedText(node.sourceEntityIds), sourcePortIds: sortedText(node.sourcePortIds), branchIds: sortedText(node.branchIds) };
    const actualValue = { position: pointAt(actual.position), inputXmlNodeId: cleanText(actual.inputXmlNodeId),
      sourceEntityIds: sortedText(actual.sourceEntityIds), sourcePortIds: sortedText(actual.sourcePortIds), branchIds: sortedText(actual.branchIds) };
    if (!same(expected, actualValue)) mismatches.push(mismatch({
      category: same(expected.position, actualValue.position) ? 'IDENTITY_MISMATCH_SVG_NODE' : 'COORDINATE_MISMATCH_SVG_NODE',
      canonicalIdentity: node.id, svgIdentity: actual.id, expected, actual: actualValue,
      sourceEntities: node.sourceEntityIds, sourcePaths: node.sourcePaths, decisionTrace: decisionTrace(ledger, node.sourceEntityIds ?? [], [node.id]),
      recommendedOwnerModule: 'topology-svg-scene-builder.js', message: `SVG scene node ${actual.id} does not exactly match canonical node ${node.id}.` }));
  }
  for (const node of scene.nodes ?? []) if (!canonicalNodes.has(node.canonicalNodeId)) mismatches.push(mismatch({
    category: 'EXTRA_IN_SVG_NODE', svgIdentity: node.id, expected: null, actual: node.canonicalNodeId,
    sourceEntities: node.sourceEntityIds, recommendedOwnerModule: 'topology-svg-scene-builder.js',
    message: `SVG scene node ${node.id} has no canonical node.` }));
  return mismatches;
}

export function compareInputXmlEdgeNodeToSvgScene(parsed, scene) {
  const mismatches = [];
  const sceneEdges = rowMap(scene.edges, (row) => row.canonicalEdgeId);
  for (const element of parsed.elements ?? []) {
    const edge = sceneEdges.get(element.canonicalEdgeId);
    if (!edge) continue;
    const inputValue = { inputXmlElementId: element.id, fromCanonicalNodeId: element.fromCanonicalNodeId,
      toCanonicalNodeId: element.toCanonicalNodeId, fromPosition: element.fromPosition, toPosition: element.toPosition,
      sourceEntityIds: sortedText(element.sourceEntityIds), sourcePortIds: sortedText(element.sourcePortIds),
      branchIds: sortedText(element.branchIds), topologyOperation: cleanText(element.topologyOperation),
      projectionCardinality: cleanText(element.projectionCardinality), mergeAuthority: cleanText(element.mergeAuthority) };
    const svgValue = { inputXmlElementId: cleanText(edge.inputXmlElementId), fromCanonicalNodeId: edge.fromCanonicalNodeId,
      toCanonicalNodeId: edge.toCanonicalNodeId, fromPosition: pointAt(edge.fromPosition), toPosition: pointAt(edge.toPosition),
      sourceEntityIds: sortedText(edge.sourceEntityIds), sourcePortIds: sortedText(edge.sourcePortIds),
      branchIds: sortedText(edge.branchIds), topologyOperation: cleanText(edge.topologyOperation),
      projectionCardinality: cleanText(edge.projectionCardinality), mergeAuthority: cleanText(edge.mergeAuthority) };
    if (!same(inputValue, svgValue)) mismatches.push(mismatch({
      category: 'INPUTXML_SVG_EDGE_MISMATCH', inputXmlIdentity: element.id, svgIdentity: edge.id,
      expected: inputValue, actual: svgValue, sourceEntities: element.sourceEntityIds,
      recommendedOwnerModule: 'topology-svg-scene-builder.js',
      message: `InputXML and SVG scene disagree for canonical edge ${element.canonicalEdgeId}.` }));
  }
  return mismatches;
}
