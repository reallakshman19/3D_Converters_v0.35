/**
 * Native CAESAR engineering projection for component topology.
 * Inputs: real managed-stage JSON, identified source model, and explicit
 * projection tolerance. Outputs: resolved component records, grouped supports,
 * split edge specifications, and one rigid assignment per rigid source object.
 * Invalid lineage or an unprojectable engineering object raises explicitly.
 */

import { runEnrichment } from '../../../stagedjson-to-enrichxml/sj-enrichment-engine.js';
import { bestPosition, formatPosition } from '../../../stagedjson-to-enrichxml/sj-point-resolver.js';
import { isRigidType, isSupportType } from '../../../stagedjson-to-enrichxml/sj-type-mapper.js';
import { portForRole } from './topology-connectivity.js';
import { pointSegmentDistance } from './topology-geometry-distance.js';
import { buildSupportAttachmentIndex, resolveSupportAttachment } from './topology-support-reference.js';
import { splitEdgeSpecsAtSupports } from './topology-support-edge-splitter.js';
import { cleanText, pointDistance, uniqueText } from './topology-values.js';

function componentKey(path) {
  const branchIndex = Number(path[0]);
  const childrenIndex = path.indexOf('children');
  const sourceIndex = Number(path[childrenIndex + 1]);
  if (!Number.isInteger(branchIndex) || !Number.isInteger(sourceIndex)) {
    throw new TypeError(`Enrichment record has an invalid source path: ${JSON.stringify(path)}.`);
  }
  return `${branchIndex}:${sourceIndex}`;
}

function supportPortOrNull(component) {
  return portForRole(component, 'P') ?? portForRole(component, 'A') ?? portForRole(component, 'L') ?? null;
}

function supportPort(component) {
  const port = supportPortOrNull(component);
  if (!port) throw new Error(`Support ${component.sourcePath} has no usable source position port.`);
  return port;
}

function componentRecordIndex(model, records) {
  const byPath = new Map(model.components.map((component) => [`${component.branchIndex}:${component.sourceIndex}`, component]));
  const entries = records.map((record) => {
    const path = componentKey(record.path);
    const component = byPath.get(path);
    if (!component) throw new Error(`Enrichment record ${path} has no source-model component.`);
    return { component, record };
  });
  return {
    entries,
    recordBySourceEntityId: new Map(entries.map(({ component, record }) => [component.sourceEntityId, record])),
  };
}

/** @param {Record<string, unknown>} component @returns {boolean} */
function hasManagedStageEngineeringAuthority(component) {
  const enriched = component.enrichedAttributes ?? {};
  return cleanText(enriched.schema) === 'stagedjson-cii2019-enriched-attributes/v1'
    && cleanText(enriched.componentType).toUpperCase() === 'SUPPORT'
    && cleanText(enriched.status).toLowerCase() === 'resolved'
    && enriched.needsReview === false;
}

function isOnOwningRoute(component, model, toleranceMm) {
  const position = supportPortOrNull(component)?.position ?? null;
  if (!position) return false;
  return model.components.some((candidate) => (
    candidate.sourceBranchEntityId === component.sourceBranchEntityId
    && candidate.isRouteComponent === true
    && candidate.positions.APOS
    && candidate.positions.LPOS
    && pointSegmentDistance(position, candidate.positions.APOS, candidate.positions.LPOS).distanceMm <= toleranceMm
  ));
}

/** Generic enrichment needs explicit carrier or owning-route geometry evidence. */
function isProjectedSupport(component, model, attachmentIndex, toleranceMm) {
  if (!isSupportType(component.sourceType)) return false;
  if (cleanText(component.supportProjection?.disposition) !== 'DEFER_SUPPORT') return true;
  if (!hasManagedStageEngineeringAuthority(component)) return false;
  const attachment = resolveSupportAttachment(component, attachmentIndex);
  return attachment.sourceEntityIds.length > 0 || isOnOwningRoute(component, model, toleranceMm);
}

function mergeAttachment(anchor, attachment) {
  anchor.attachmentReferences.push(...attachment.references);
  anchor.attachedComponentEntityIds.push(...attachment.sourceEntityIds);
  anchor.attachedComponentSourcePaths.push(...attachment.sourcePaths);
  anchor.unresolvedAttachmentReferences.push(...attachment.unresolvedReferences);
  if (attachment.authority) anchor.attachmentAuthorities.push(attachment.authority);
}

function supportNameIndex(model) {
  const index = new Map();
  for (const component of model.components) {
    const name = cleanText(component.attributes.NAME || component.name);
    if (!name) continue;
    index.set(name, [...(index.get(name) ?? []), component]);
  }
  return index;
}

function referenceTarget(current, reference, byName) {
  const candidates = byName.get(reference) ?? [];
  return candidates.find((row) => row.sourceBranchEntityId === current.sourceBranchEntityId)
    ?? (candidates.length === 1 ? candidates[0] : null);
}

function buildSupportAnchors(model, supportEntries, attachmentIndex, projectedSupport) {
  const anchors = supportEntries.map(({ component, record }, order) => {
    const port = supportPort(component);
    const enrichmentPosition = bestPosition(record.attrs);
    const anchor = {
      id: `SA-${String(order + 1).padStart(6, '0')}`,
      order, component, record, port,
      position: port.position,
      sourcePosition: port.position,
      positionAuthority: `SOURCE_PORT:${port.role}`,
      positionAuthorityResidualMm: enrichmentPosition ? pointDistance(enrichmentPosition, port.position) : null,
      sourceEntityIds: [component.sourceEntityId],
      sourceBranchEntityIds: [component.sourceBranchEntityId],
      sourceBranchNames: [component.sourceBranchName],
      sourcePaths: [component.sourcePath],
      tag: cleanText(record.supportTag || record.cmpSupRefN || record.name),
      restraints: Array.isArray(record.resolved?.restraint)
        ? record.resolved.restraint : [record.resolved?.restraint].filter(Boolean),
      attachmentReferences: [], attachedComponentEntityIds: [], attachedComponentSourcePaths: [],
      unresolvedAttachmentReferences: [], attachmentAuthorities: [],
    };
    mergeAttachment(anchor, resolveSupportAttachment(component, attachmentIndex));
    return anchor;
  });
  const byPosition = new Map(anchors.map((anchor) => [formatPosition(anchor.position), anchor]));
  const supportComponents = model.components.filter(projectedSupport);
  const byName = supportNameIndex(model);
  for (const component of supportComponents) {
    const anchor = findSupportAnchor(component, byPosition, byName);
    if (!anchor) throw new Error(`Support ${component.sourcePath} was not retained by the engineering grouping contract.`);
    anchor.sourceEntityIds.push(component.sourceEntityId);
    anchor.sourceBranchEntityIds.push(component.sourceBranchEntityId);
    anchor.sourceBranchNames.push(component.sourceBranchName);
    anchor.sourcePaths.push(component.sourcePath);
    mergeAttachment(anchor, resolveSupportAttachment(component, attachmentIndex));
  }
  return anchors.map((anchor) => ({
    ...anchor,
    sourceEntityIds: uniqueText(anchor.sourceEntityIds),
    sourceBranchEntityIds: uniqueText(anchor.sourceBranchEntityIds),
    sourceBranchNames: uniqueText(anchor.sourceBranchNames),
    sourcePaths: uniqueText(anchor.sourcePaths),
    attachmentReferences: uniqueText(anchor.attachmentReferences),
    attachedComponentEntityIds: uniqueText(anchor.attachedComponentEntityIds),
    attachedComponentSourcePaths: uniqueText(anchor.attachedComponentSourcePaths),
    unresolvedAttachmentReferences: uniqueText(anchor.unresolvedAttachmentReferences),
    attachmentAuthorities: uniqueText(anchor.attachmentAuthorities),
  }));
}

function findSupportAnchor(component, byPosition, byName) {
  let current = component;
  const visited = new Set();
  while (current && !visited.has(current.sourceEntityId)) {
    visited.add(current.sourceEntityId);
    const position = supportPortOrNull(current)?.position ?? null;
    const direct = position ? byPosition.get(formatPosition(position)) : null;
    if (direct) return direct;
    const currentName = cleanText(current.attributes.NAME || current.name);
    const reference = ['MDSSREF', 'MDSGUIDEREF', 'PREV-NAME']
      .map((field) => cleanText(current.attributes[field]))
      .find((value) => value && value !== currentName && referenceTarget(current, value, byName));
    current = reference ? referenceTarget(current, reference, byName) : null;
  }
  return null;
}

function rigidWeight(record) {
  if (Number.isFinite(record.resolved?.weightKg)) {
    return { weightKg: Number(record.resolved.weightKg), weightAuthority: 'RESOLVED_WEIGHT_KG' };
  }
  if (Number.isFinite(record.sourceWeightKg)) {
    return { weightKg: Number(record.sourceWeightKg), weightAuthority: 'SOURCE_WEIGHT_KG' };
  }
  return { weightKg: null, weightAuthority: 'MISSING' };
}

export function assignRigidEdges(edges, nodes, rigids, toleranceMm) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return rigids.map((rigid) => {
    const natural = edges.filter((edge) => edge.sourceEntityIds.includes(rigid.component.sourceEntityId));
    const branch = edges.filter((edge) => edge.sourceEntityIds.includes(rigid.component.sourceBranchEntityId));
    const naturalIds = new Set(natural.map((edge) => edge.id));
    const branchIds = new Set(branch.map((edge) => edge.id));
    const pool = [
      ...natural,
      ...branch.filter((edge) => !naturalIds.has(edge.id)),
      ...edges.filter((edge) => !naturalIds.has(edge.id) && !branchIds.has(edge.id)),
    ];
    const ranked = pool.map((edge) => ({
      edge,
      authorityRank: naturalIds.has(edge.id) ? 0 : branchIds.has(edge.id) ? 1 : 2,
      distanceMm: pointSegmentDistance(
        rigid.position, nodeById.get(edge.fromNodeId).position, nodeById.get(edge.toNodeId).position,
      ).distanceMm,
    })).sort((left, right) => left.authorityRank - right.authorityRank
      || left.distanceMm - right.distanceMm || left.edge.id.localeCompare(right.edge.id));
    const selected = ranked[0];
    if (!selected) throw new Error(`Rigid ${rigid.component.sourcePath} has no unique InputXML element assignment.`);
    if (selected.authorityRank === 2 && selected.distanceMm > toleranceMm) {
      throw new Error(`Rigid ${rigid.component.sourcePath} is ${selected.distanceMm} mm from the nearest connected InputXML element; limit is ${toleranceMm} mm.`);
    }
    return {
      sourceEntityId: rigid.component.sourceEntityId,
      sourcePath: rigid.component.sourcePath,
      edgeId: selected.edge.id,
      inputXmlElementId: selected.edge.inputXmlElementIds[0],
      connectionResidual: selected.distanceMm,
      componentType: rigid.record.componentType,
      ...rigidWeight(rigid.record),
    };
  });
}

export function buildTopologyEngineeringProjection(sourceText, model, options) {
  const enrichment = runEnrichment({ stagedJsonText: sourceText, config: options.enrichmentConfig });
  const index = componentRecordIndex(model, enrichment.records);
  const attachmentIndex = buildSupportAttachmentIndex(model);
  const projectedSupport = (component) => isProjectedSupport(
    component, model, attachmentIndex, options.supportProjectionToleranceMm,
  );
  const supportEntries = index.entries.filter(({ component, record }) => (
    isSupportType(record.componentType) && projectedSupport(component)
  ));
  const supports = buildSupportAnchors(model, supportEntries, attachmentIndex, projectedSupport);
  const deferredSupports = model.components.filter((component) => (
    isSupportType(component.sourceType)
    && !projectedSupport(component)
  ));
  const rigids = index.entries.filter(({ record }) => isRigidType(record.componentType)).map(({ component, record }) => ({
    component, record, position: bestPosition(record.attrs),
  }));
  if (rigids.some((rigid) => !rigid.position)) throw new Error('At least one rigid source component has no valid position.');
  return Object.freeze({
    recordBySourceEntityId: index.recordBySourceEntityId,
    supports: Object.freeze(supports),
    deferredSupports: Object.freeze(deferredSupports.map((component) => Object.freeze({
      sourceEntityId: component.sourceEntityId,
      sourcePath: component.sourcePath,
      sourceBranchEntityId: component.sourceBranchEntityId,
      sourceBranchName: component.sourceBranchName,
      sourceRef: component.sourceRef,
      policy: component.supportProjection,
    }))),
    rigids: Object.freeze(rigids),
    metrics: Object.freeze({
      supports: supports.length,
      restraints: supports.reduce((sum, row) => sum + row.restraints.length, 0),
      rigids: rigids.length,
    }),
  });
}

export { splitEdgeSpecsAtSupports };
export const _test = Object.freeze({ rigidWeight });
