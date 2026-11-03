/** Exact support, deferred-attachment, and rigid parity comparisons. */
import { cleanText } from './topology-values.js';
import {
  canonicalRigidGroups, decisionTrace, deferredRecords, DELTA_DECIMALS,
  mismatch, numberAt, pointAt, rowMap, same, sortedText,
} from './topology-parity-values.js';

export function compareSupportsToInput(canonical, parsed, ledger) {
  const rows = [], bySupport = new Map();
  for (const restraint of parsed.restraints ?? []) bySupport.set(restraint.supportId, [...(bySupport.get(restraint.supportId) ?? []), restraint]);
  const canonicalIds = new Set((canonical.supports ?? []).map((row) => row.id));
  for (const support of canonical.supports ?? []) {
    const actual = bySupport.get(support.id) ?? [], first = actual[0] ?? {};
    const expected = { canonicalNodeId: support.nodeId, inputXmlNodeId: cleanText(support.inputXmlNodeId),
      restraintCount: support.restraints?.length ?? 0, tag: cleanText(support.tag), sourceEntityIds: sortedText(support.sourceEntityIds),
      attachmentAuthority: cleanText(support.attachmentAuthority), attachmentReferences: sortedText(support.attachmentReferences),
      sourcePosition: pointAt(support.sourcePosition, DELTA_DECIMALS), attachmentPosition: pointAt(support.attachmentPosition ?? support.position, DELTA_DECIMALS),
      connectionResidual: numberAt(support.connectionResidual, DELTA_DECIMALS) };
    const actualValue = { canonicalNodeId: cleanText(first.canonicalNodeId), inputXmlNodeId: cleanText(first.inputXmlNodeId),
      restraintCount: actual.length, tag: cleanText(first.tag), sourceEntityIds: sortedText(actual.flatMap((row) => row.sourceEntityIds ?? [])),
      attachmentAuthority: cleanText(first.attachmentAuthority), attachmentReferences: sortedText(first.attachmentReferences),
      sourcePosition: first.sourcePosition ?? null, attachmentPosition: first.attachmentPosition ?? null,
      connectionResidual: first.connectionResidual ?? null };
    if (!same(expected, actualValue)) rows.push(mismatch({ category: 'SUPPORT_MISMATCH_INPUTXML', canonicalIdentity: support.id,
      inputXmlIdentity: actual.map((row) => row.id), expected, actual: actualValue, sourceEntities: support.sourceEntityIds,
      sourcePaths: support.sourcePaths, decisionTrace: decisionTrace(ledger, support.sourceEntityIds ?? [], [support.nodeId]),
      recommendedOwnerModule: 'topology-inputxml-writer.js',
      message: `InputXML restraint projection for support ${support.id} does not match canonical attachment evidence.` }));
  }
  for (const [supportId, actual] of bySupport) if (!canonicalIds.has(supportId)) rows.push(mismatch({
    category: 'EXTRA_IN_INPUTXML_SUPPORT', inputXmlIdentity: actual.map((row) => row.id), expected: null,
    actual: supportId, sourceEntities: actual.flatMap((row) => row.sourceEntityIds ?? []),
    recommendedOwnerModule: 'topology-inputxml-writer.js', message: `InputXML support ${supportId} has no canonical support.` }));
  return rows;
}

export function compareSupportsToScene(canonical, scene, ledger) {
  const rows = [], map = rowMap(scene.supports, (row) => row.canonicalSupportId);
  const canonicalIds = new Set((canonical.supports ?? []).map((row) => row.id));
  for (const support of canonical.supports ?? []) {
    const actual = map.get(support.id);
    const expected = { canonicalNodeId: support.nodeId, inputXmlNodeId: cleanText(support.inputXmlNodeId),
      position: pointAt(support.position, DELTA_DECIMALS), sourcePosition: pointAt(support.sourcePosition, DELTA_DECIMALS),
      attachmentPosition: pointAt(support.attachmentPosition ?? support.position, DELTA_DECIMALS),
      sourceEntityIds: sortedText(support.sourceEntityIds), sourcePaths: sortedText(support.sourcePaths), branchIds: sortedText(support.branchIds),
      attachmentAuthority: cleanText(support.attachmentAuthority), attachmentReferences: sortedText(support.attachmentReferences),
      connectionResidual: numberAt(support.connectionResidual, DELTA_DECIMALS), restraintCount: support.restraints?.length ?? 0 };
    const actualValue = actual ? { canonicalNodeId: actual.canonicalNodeId, inputXmlNodeId: cleanText(actual.inputXmlNodeId),
      position: pointAt(actual.position, DELTA_DECIMALS), sourcePosition: pointAt(actual.sourcePosition, DELTA_DECIMALS),
      attachmentPosition: pointAt(actual.attachmentPosition, DELTA_DECIMALS), sourceEntityIds: sortedText(actual.sourceEntityIds),
      sourcePaths: sortedText(actual.sourcePaths), branchIds: sortedText(actual.branchIds), attachmentAuthority: cleanText(actual.attachmentAuthority),
      attachmentReferences: sortedText(actual.attachmentReferences), connectionResidual: numberAt(actual.connectionResidual, DELTA_DECIMALS),
      restraintCount: Number(actual.restraintCount ?? 0) } : null;
    if (!same(expected, actualValue)) rows.push(mismatch({ category: actual ? 'SUPPORT_MISMATCH_SVG' : 'MISSING_IN_SVG_SUPPORT',
      canonicalIdentity: support.id, svgIdentity: actual?.id ?? null, expected, actual: actualValue,
      sourceEntities: support.sourceEntityIds, sourcePaths: support.sourcePaths,
      decisionTrace: decisionTrace(ledger, support.sourceEntityIds ?? [], [support.nodeId]),
      recommendedOwnerModule: 'topology-svg-scene-builder.js',
      message: `SVG support projection for ${support.id} does not match canonical attachment evidence.` }));
  }
  for (const support of scene.supports ?? []) if (!canonicalIds.has(support.canonicalSupportId)) rows.push(mismatch({
    category: 'EXTRA_IN_SVG_SUPPORT', svgIdentity: support.id, expected: null, actual: support.canonicalSupportId,
    sourceEntities: support.sourceEntityIds, recommendedOwnerModule: 'topology-svg-scene-builder.js',
    message: `SVG support ${support.id} has no canonical support.` }));
  return rows;
}

export function compareRigidsToInput(canonical, parsed, ledger) {
  const rows = [], expectedMap = canonicalRigidGroups(canonical), actualMap = rowMap(parsed.rigids, (row) => row.canonicalEdgeId);
  for (const [edgeId, expected] of expectedMap) {
    const actual = actualMap.get(edgeId);
    const actualValue = actual ? { canonicalEdgeId: actual.canonicalEdgeId, sourceEntityIds: sortedText(actual.sourceEntityIds),
      assignmentAuthorities: sortedText(actual.assignmentAuthorities), sourceBodyCount: Number(actual.sourceBodyCount) } : null;
    if (!same(expected, actualValue)) rows.push(mismatch({ category: 'RIGID_MISMATCH_INPUTXML', canonicalIdentity: edgeId,
      inputXmlIdentity: actual?.id ?? null, expected, actual: actualValue, sourceEntities: expected.sourceEntityIds,
      decisionTrace: decisionTrace(ledger, expected.sourceEntityIds, [edgeId]), recommendedOwnerModule: 'topology-inputxml-writer.js',
      message: `InputXML rigid assignment on ${edgeId} differs from canonical assignment.` }));
  }
  for (const rigid of parsed.rigids ?? []) if (!expectedMap.has(rigid.canonicalEdgeId)) rows.push(mismatch({
    category: 'EXTRA_IN_INPUTXML_RIGID', inputXmlIdentity: rigid.id, expected: null, actual: rigid.canonicalEdgeId,
    sourceEntities: rigid.sourceEntityIds, recommendedOwnerModule: 'topology-inputxml-writer.js',
    message: `InputXML RIGID ${rigid.id} has no canonical rigid assignment.` }));
  return rows;
}

export function compareRigidsToScene(canonical, scene, ledger) {
  const rows = [], expectedMap = canonicalRigidGroups(canonical), actualMap = rowMap(scene.rigids, (row) => row.canonicalEdgeId);
  for (const [edgeId, expected] of expectedMap) {
    const actual = actualMap.get(edgeId);
    const actualValue = actual ? { canonicalEdgeId: actual.canonicalEdgeId, sourceEntityIds: sortedText(actual.sourceEntityIds),
      assignmentAuthorities: sortedText(actual.assignmentAuthorities), sourceBodyCount: Number(actual.sourceBodyCount) } : null;
    if (!same(expected, actualValue)) rows.push(mismatch({ category: 'RIGID_MISMATCH_SVG', canonicalIdentity: edgeId,
      svgIdentity: actual?.id ?? null, expected, actual: actualValue, sourceEntities: expected.sourceEntityIds,
      decisionTrace: decisionTrace(ledger, expected.sourceEntityIds, [edgeId]), recommendedOwnerModule: 'topology-svg-scene-builder.js',
      message: `SVG rigid overlay on ${edgeId} differs from canonical assignment.` }));
  }
  return rows;
}

export function compareDeferredToInput(canonical, parsed, ledger) {
  const rows = [];
  for (const record of deferredRecords(ledger)) {
    const canonicalSupport = (canonical.supports ?? []).find((support) => (support.sourceEntityIds ?? []).includes(record.sourceEntityId));
    const restraints = (parsed.restraints ?? []).filter((restraint) => (restraint.sourceEntityIds ?? []).includes(record.sourceEntityId));
    if (canonicalSupport || restraints.length) rows.push(mismatch({ category: 'SUPPORT_MISMATCH_DEFERRED_INPUTXML',
      canonicalIdentity: canonicalSupport?.id ?? null, inputXmlIdentity: restraints.map((row) => row.id),
      expected: { canonicalSupport: null, restraints: 0, disposition: 'DEFER_SUPPORT' },
      actual: { canonicalSupport: canonicalSupport?.id ?? null, restraints: restraints.length },
      sourceEntities: [record.sourceEntityId], sourcePaths: [record.sourcePath], decisionTrace: [record],
      recommendedOwnerModule: 'topology-inputxml-writer.js',
      message: `Deferred support ${record.sourceRef || record.sourceEntityId} emitted forbidden topology.` }));
  }
  return rows;
}

export function compareDeferredToScene(_canonical, scene, ledger) {
  const rows = [], sceneBySource = new Map((scene.deferredSupports ?? []).map((row) => [row.sourceEntityId, row]));
  for (const record of deferredRecords(ledger)) {
    const actual = sceneBySource.get(record.sourceEntityId);
    const expected = { sourceEntityId: record.sourceEntityId, sourcePath: record.sourcePath, sourceRef: record.sourceRef,
      primaryDisposition: 'DEFER_SUPPORT', projectionCardinality: 'DEFERRED',
      lossClassification: 'DEFERRED_NON_RESTRAINT_ATTACHMENT', topologyBearing: false };
    const actualValue = actual ? { sourceEntityId: actual.sourceEntityId, sourcePath: actual.sourcePath, sourceRef: actual.sourceRef,
      primaryDisposition: actual.primaryDisposition, projectionCardinality: actual.projectionCardinality,
      lossClassification: actual.lossClassification, topologyBearing: actual.topologyBearing } : null;
    if (!same(expected, actualValue)) rows.push(mismatch({
      category: actual ? 'SUPPORT_MISMATCH_DEFERRED_SVG' : 'MISSING_IN_SVG_DEFERRED_SUPPORT', svgIdentity: actual?.id ?? null,
      expected, actual: actualValue, sourceEntities: [record.sourceEntityId], sourcePaths: [record.sourcePath], decisionTrace: [record],
      recommendedOwnerModule: 'topology-svg-scene-builder.js',
      message: `Deferred support ${record.sourceRef || record.sourceEntityId} is not represented correctly in the SVG scene.` }));
  }
  return rows;
}
