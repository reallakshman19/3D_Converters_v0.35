/**
 * Managed-stage source identity projection.
 * Inputs: original JSON text and explicit source options. Output: an immutable
 * branch/component/port model whose IDs use SourceEnvelope.v1 and the existing
 * UniversalSourceGraph.v1 entity identity contract. Invalid source data raises.
 */

import { createSourceEnvelope } from '../../../universal-enrichment-workbench/source-envelope.js';
import { createSourceEntityId } from '../../../universal-enrichment-workbench/graph-identity.js';
import { classifySupportProjection } from './topology-support-policy.js';
import {
  ROUTE_TYPES,
  cleanText,
  componentCategory,
  geometryClass,
  pointDistance,
  strictPoint,
} from './topology-values.js';

const COMPONENT_PORTS = Object.freeze([
  ['APOS', 'A'], ['POS', 'P'], ['LPOS', 'L'],
]);
const BRANCH_PORTS = Object.freeze([
  ['HPOS', 'H'], ['TPOS', 'T'],
]);

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value) : {};
}

/** @param {Record<string, unknown>} owner @param {string} sourcePath @param {readonly (readonly string[])[]} definitions @param {number} orderStart @returns {Record<string, unknown>[]} */
function portDescriptors(owner, sourcePath, definitions, orderStart) {
  const attributes = record(owner.attributes);
  return definitions.flatMap(([field, role], index) => {
    const position = strictPoint(attributes[field]);
    if (!position) return [];
    return [{
      field, role, position, order: orderStart + index,
      sourcePath: `${sourcePath}.attributes.${field}`,
    }];
  });
}

/** @param {Record<string, unknown>} child @param {number} branchIndex @param {number} sourceIndex @param {number} order @param {number} toleranceMm @param {string} branchSourcePath @returns {Record<string, unknown>} */
function componentDescriptor(child, branchIndex, sourceIndex, order, toleranceMm, branchSourcePath) {
  const sourcePath = `${branchSourcePath}.children[${sourceIndex}]`;
  const attributes = record(child.attributes);
  const sourceType = cleanText(child.type ?? attributes.TYPE).toUpperCase();
  const positions = {
    APOS: strictPoint(attributes.APOS),
    POS: strictPoint(attributes.POS),
    LPOS: strictPoint(attributes.LPOS),
  };
  const spanLengthMm = pointDistance(positions.APOS, positions.LPOS);
  const supportProjection = componentCategory(sourceType) === 'SUPPORT'
    ? classifySupportProjection(attributes) : null;
  return {
    sourcePath, sourceType, branchIndex, sourceIndex, order,
    name: cleanText(child.name ?? attributes.NAME),
    sourceRef: cleanText(attributes.REF),
    attributes,
    enrichedAttributes: record(child.enrichedAttributes),
    positions,
    supportProjection,
    geometryClassification: geometryClass(sourceType, positions, toleranceMm),
    finiteSpan: Number.isFinite(spanLengthMm) && spanLengthMm > toleranceMm,
    spanLengthMm,
    isRouteComponent: ROUTE_TYPES.includes(sourceType),
    ports: portDescriptors(child, sourcePath, COMPONENT_PORTS, order * 10),
  };
}

/** @param {Record<string, unknown>} branch @param {number} branchIndex @param {number} order @param {number} toleranceMm @param {string} rootPath @returns {Record<string, unknown>} */
function branchDescriptor(branch, branchIndex, order, toleranceMm, rootPath) {
  const sourcePath = `${rootPath}[${branchIndex}]`;
  const attributes = record(branch.attributes);
  const children = Array.isArray(branch.children) ? branch.children : [];
  return {
    sourcePath, sourceType: 'BRANCH', branchIndex, order,
    name: cleanText(branch.name ?? attributes.NAME),
    sourceRef: cleanText(attributes.REF),
    attributes,
    ports: portDescriptors(branch, sourcePath, BRANCH_PORTS, order * 10),
    components: children.map((child, sourceIndex) => componentDescriptor(
      record(child), branchIndex, sourceIndex, order + sourceIndex + 1, toleranceMm, sourcePath,
    )),
  };
}

/** @param {Record<string, unknown>[]} entities @param {string} sourceFileId @returns {Promise<Record<string, unknown>[]>} */
async function assignEntityIds(entities, sourceFileId) {
  const ids = await Promise.all(entities.map((entity) => createSourceEntityId(
    sourceFileId, 'stagedjson', cleanText(entity.sourcePath), 'json-object',
  )));
  return entities.map((entity, index) => ({ ...entity, sourceEntityId: ids[index] }));
}

/** @param {Record<string, unknown>[]} entities @param {string} sourceFileId @returns {Promise<Record<string, unknown>[]>} */
async function assignPortIds(entities, sourceFileId) {
  const descriptors = entities.flatMap((entity) => entity.ports.map((port) => ({
    ...port,
    sourceEntityId: entity.sourceEntityId,
    sourceType: entity.sourceType,
  })));
  const ids = await Promise.all(descriptors.map((port) => createSourceEntityId(
    sourceFileId, 'stagedjson', cleanText(port.sourcePath), 'json-object',
  )));
  return descriptors.map((port, index) => ({
    ...port,
    key: `${port.sourceEntityId}:${port.role}`,
    sourcePortId: ids[index],
  }));
}

/** @param {Record<string, unknown>[]} entities @param {Record<string, unknown>[]} ports @returns {Record<string, unknown>[]} */
function attachPorts(entities, ports) {
  const byEntity = new Map();
  for (const port of ports) byEntity.set(port.sourceEntityId, [...(byEntity.get(port.sourceEntityId) ?? []), port]);
  return entities.map((entity) => ({ ...entity, ports: Object.freeze(byEntity.get(entity.sourceEntityId) ?? []) }));
}

/** @param {string} sourceText @param {{sourceName:string,sourceRevision?:number,toleranceMm:number}} options @returns {Promise<Readonly<Record<string, unknown>>>} */
export async function buildTopologySourceModel(sourceText, options) {
  const revision = Number(options.sourceRevision ?? 1);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new TypeError('Managed-stage sourceRevision must be a positive integer.');
  }
  const envelope = await createSourceEnvelope({
    sourceText,
    sourceKind: 'stagedjson',
    sourceName: options.sourceName,
    origin: 'file',
    revision,
  });
  if (!envelope.validation.ok) throw new TypeError(`Invalid managed-stage source: ${envelope.validation.errors.join('; ')}`);
  const parsed = JSON.parse(envelope.sourceText);
  const parsedRecord = record(parsed);
  const rawBranches = Array.isArray(parsed) ? parsed : (
    Array.isArray(parsedRecord.objects) ? parsedRecord.objects
      : Array.isArray(parsedRecord.hierarchy) ? parsedRecord.hierarchy : parsedRecord.branches
  );
  if (!Array.isArray(rawBranches) || !rawBranches.length) throw new TypeError('Managed-stage source must contain a non-empty branch array.');
  const rootPath = Array.isArray(parsed) ? '$' : Array.isArray(parsedRecord.objects) ? '$.objects'
    : Array.isArray(parsedRecord.hierarchy) ? '$.hierarchy' : '$.branches';
  let order = 0;
  const bareBranches = rawBranches.map((branch, branchIndex) => {
    const descriptor = branchDescriptor(record(branch), branchIndex, order, options.toleranceMm, rootPath);
    order += descriptor.components.length + 1;
    return descriptor;
  });
  const bareEntities = bareBranches.flatMap((branch) => [branch, ...branch.components]);
  const identifiedEntities = await assignEntityIds(bareEntities, envelope.sourceFileId);
  const ports = await assignPortIds(identifiedEntities, envelope.sourceFileId);
  const entities = attachPorts(identifiedEntities, ports);
  const entityByPath = new Map(entities.map((entity) => [entity.sourcePath, entity]));
  const branches = bareBranches.map((branch) => {
    const identified = entityByPath.get(branch.sourcePath);
    const components = branch.components.map((component) => ({
      ...entityByPath.get(component.sourcePath),
      sourceBranchEntityId: identified.sourceEntityId,
      sourceBranchName: identified.name,
    }));
    return Object.freeze({ ...identified, components: Object.freeze(components) });
  });
  return Object.freeze({
    schema: 'ComponentTopologySourceModel.v1',
    sourceIdentity: Object.freeze({
      schema: 'SourceEnvelope.v1',
      entityIdentitySchema: 'UniversalSourceGraph.v1',
      sourceFileId: envelope.sourceFileId,
      contentHash: envelope.contentHash,
      sourceName: envelope.sourceName,
      sourceKind: envelope.sourceKind,
      sourceRevision: envelope.revision,
    }),
    branches: Object.freeze(branches),
    components: Object.freeze(branches.flatMap((branch) => branch.components)),
    entities: Object.freeze(branches.flatMap((branch) => [branch, ...branch.components])),
    sourcePorts: Object.freeze(ports),
  });
}
