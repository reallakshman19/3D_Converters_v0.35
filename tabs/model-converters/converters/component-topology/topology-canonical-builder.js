/**
 * Canonical component-topology builder.
 * Inputs: identified source model plus explicit connection evidence. Output:
 * CanonicalTopology.v2 with stable, number-free source-order IDs. Zero-length route objects
 * become point features; supports are excluded from route continuity.
 */

import { portForRole } from './topology-connectivity.js';
import {
  assignRigidEdges,
  splitEdgeSpecsAtSupports,
} from './topology-engineering-projection.js';
import {
  TOPOLOGY_TOLERANCE_MM,
  cleanText,
  componentCategory,
  pointDistance,
  sequenceId,
  uniqueText,
} from './topology-values.js';

/** @param {Record<string, unknown>} component @param {Record<string, unknown>|null} overlap @returns {Record<string, unknown>[]} */
function componentEdgeSpecs(component, overlap) {
  if (overlap?.secondary.sourceEntityId === component.sourceEntityId) return [];
  const category = componentCategory(component.sourceType);
  const finite = component.geometryClassification === 'FINITE' || (category === 'TEE' && component.finiteSpan === true);
  if (!finite) return [];
  if (category === 'OLET' || category === 'SUPPORT') return [];
  const start = portForRole(component, 'A'), end = portForRole(component, 'L');
  if (!start || !end) return [];
  const participants = overlap?.sourceEntityIds ?? [component.sourceEntityId];
  const participantTypes = overlap
    ? [overlap.primary.sourceType, overlap.secondary.sourceType]
    : [component.sourceType];
  const base = {
    sourceEntityIds: [...participants, component.sourceBranchEntityId],
    sourceTypes: [...participantTypes, 'BRANCH'],
    sourcePath: component.sourcePath,
    connectionAuthority: 'SOURCE_COMPONENT_GEOMETRY',
    projectionCardinality: overlap ? 'MANY_TO_ONE' : 'ONE_TO_ONE',
    projectionMergeAuthority: overlap?.authority ?? '',
    mergeSourceEntityIds: overlap?.sourceEntityIds ?? [],
  };
  if (category === 'ELBO/BEND' || category === 'TEE') {
    const centre = portForRole(component, 'P');
    if (!centre) return [];
    return [
      { ...base, fromPort: start, toPort: centre, segmentRole: `${category}_RUN_IN` },
      { ...base, fromPort: centre, toPort: end, segmentRole: `${category}_RUN_OUT` },
    ];
  }
  return [{ ...base, fromPort: start, toPort: end, segmentRole: category }];
}

/** @param {Record<string, unknown>[]} connections @returns {Record<string, unknown>[]} */
function crefEdgeSpecs(connections) {
  return connections.filter((connection) => !connection.merged).map((connection) => ({
    fromPort: connection.junctionPort,
    toPort: connection.targetPort,
    sourceEntityIds: [connection.component.sourceEntityId, connection.component.sourceBranchEntityId, connection.targetBranch.sourceEntityId],
    sourceTypes: [connection.component.sourceType, 'BRANCH'],
    sourcePath: connection.component.sourcePath,
    segmentRole: 'CREF_BRANCH_CONNECTION',
    connectionAuthority: `CREF/${connection.targetRole}REF`,
    connectionResidual: connection.residualMm,
  }));
}

/** @param {Record<string, unknown>} model @returns {Record<string, unknown>[]} */
function pointFeatureSpecs(model) {
  return model.components.flatMap((component) => {
    const category = componentCategory(component.sourceType);
    if (component.geometryClassification !== 'POINT' || ['TEE', 'OLET', 'SUPPORT'].includes(category)) return [];
    const port = portForRole(component, 'P') ?? portForRole(component, 'A') ?? portForRole(component, 'L');
    return port ? [{ component, port, kind: category }] : [];
  });
}

/** @param {Record<string, unknown>} model @returns {Record<string, unknown>[]} */
function junctionSpecs(model) {
  return model.components.flatMap((component) => {
    const kind = componentCategory(component.sourceType);
    if (!['TEE', 'OLET'].includes(kind)) return [];
    const port = portForRole(component, 'P');
    return port ? [{ component, port, kind }] : [];
  });
}

/** @param {Record<string, unknown>} model @returns {Record<string, unknown>[]} */
function boundarySpecs(model) {
  const branchNames = new Set(model.branches.map((branch) => cleanText(branch.name)));
  const componentAliases = new Set(model.components.flatMap((component) => [component.sourceRef, component.name]).map(cleanText).filter(Boolean));
  const branchBoundaries = model.branches.flatMap((branch) => [['HREF', 'H'], ['TREF', 'T']].flatMap(([field, role]) => {
    const reference = cleanText(branch.attributes[field]);
    if (!reference || branchNames.has(reference) || componentAliases.has(reference)) return [];
    const port = portForRole(branch, role);
    return port ? [{ port, sourceEntityIds: [branch.sourceEntityId], relationship: `${field}:${reference}`, sourcePath: branch.sourcePath }] : [];
  }));
  const teeBoundaries = model.components.flatMap((component) => {
    if (componentCategory(component.sourceType) !== 'TEE' || cleanText(component.attributes.CREF)) return [];
    const port = portForRole(component, 'P');
    return port ? [{ port, sourceEntityIds: [component.sourceEntityId], relationship: 'TEE_BRANCH_PORT:EXTERNAL_OR_UNMODELED', sourcePath: component.sourcePath }] : [];
  });
  return [...branchBoundaries, ...teeBoundaries];
}

/** @param {Record<string, unknown>[]} ports @param {{x:number,y:number,z:number}} origin @returns {number} */
function maximumResidual(ports, origin) {
  if (ports.length < 2) return 0;
  return Math.max(...ports.map((port) => pointDistance(origin, port.position)));
}

/** @param {Record<string, unknown>[]} ports @returns {Record<string, unknown>} */
function canonicalPort(ports) {
  return ports.find((port) => port.canonicalPositionAuthority === true) ?? ports[0];
}

/** @param {Record<string, unknown>} model @param {Record<string, unknown>} connectivity @param {Record<string, unknown>[]} edgeSpecs @param {Record<string, unknown>[]} junctions @param {Record<string, unknown>[]} boundaries @returns {Record<string, unknown>} */
function buildNodes(model, connectivity, edgeSpecs, junctions, boundaries) {
  const projectedPorts = edgeSpecs.flatMap((edge) => [edge.fromPort, edge.toPort]);
  const terminalPorts = [...junctions.map((row) => row.port), ...boundaries.map((row) => row.port)];
  const portByKey = new Map(model.sourcePorts.map((port) => [port.key, port]));
  for (const port of [...projectedPorts, ...terminalPorts]) portByKey.set(port.key, port);
  const usedKeys = new Set([...projectedPorts, ...terminalPorts].map((port) => port.key));
  const usedRoots = new Set([...usedKeys].map(connectivity.set.find));
  const groups = new Map();
  for (const port of portByKey.values()) {
    const root = connectivity.set.find(port.key);
    if (!usedRoots.has(root)) continue;
    groups.set(root, [...(groups.get(root) ?? []), port]);
  }
  const ordered = [...groups.entries()].map(([root, ports]) => ({
    root,
    ports: ports.sort((left, right) => left.order - right.order),
  })).sort((left, right) => left.ports[0].order - right.ports[0].order);

  const nodes = ordered.map((group, index) => {
    const authority = canonicalPort(group.ports);
    return {
      id: `CN-${sequenceId(index + 1)}`,
      position: { ...authority.position },
      sourcePortIds: uniqueText(group.ports.map((port) => port.sourcePortId)),
      sourceEntityIds: uniqueText(group.ports.map((port) => port.sourceEntityId)),
      numberingAuthoritySourceEntityId: authority.sourceEntityId,
      positionAuthority: authority.attachmentAuthority || authority.sourcePath,
      connectionAuthority: uniqueText(group.ports.map((port) => port.sourcePath)),
      connectionResidual: maximumResidual(group.ports, authority.position),
    };
  });
  return {
    nodes,
    rootToNode: new Map(ordered.map((group, index) => [group.root, nodes[index]])),
  };
}

/** @param {Record<string, unknown>[]} specs @param {Record<string, unknown>} connectivity @param {Map<string,Record<string,unknown>>} rootToNode @param {Record<string, unknown>[]} issues @returns {Record<string, unknown>[]} */
function buildEdges(specs, connectivity, rootToNode, issues) {
  return specs.flatMap((spec, index) => {
    const from = rootToNode.get(connectivity.set.find(spec.fromPort.key));
    const to = rootToNode.get(connectivity.set.find(spec.toPort.key));
    if (!from || !to) throw new Error(`Canonical edge endpoint is missing for ${spec.sourcePath}.`);
    if (from.id === to.id) {
      issues.push({ code: 'CANONICAL_ZERO_LENGTH_EDGE_BLOCKED', blocking: true, sourcePath: spec.sourcePath, segmentRole: spec.segmentRole });
      return [];
    }
    const id = `CE-${sequenceId(index + 1)}`, inputId = `PE-${sequenceId(index + 1)}`;
    return [{
      id, fromNodeId: from.id, toNodeId: to.id,
      sourceEntityIds: uniqueText(spec.sourceEntityIds),
      sourcePortIds: uniqueText([spec.fromPort.sourcePortId, spec.toPort.sourcePortId]),
      sourceTypes: uniqueText(spec.sourceTypes),
      inputXmlElementIds: [inputId],
      segmentRole: spec.segmentRole,
      connectionAuthority: spec.connectionAuthority,
      connectionResidual: Number(spec.connectionResidual ?? 0),
      projectionCardinality: spec.projectionCardinality ?? 'ONE_TO_ONE',
      projectionMergeAuthority: spec.projectionMergeAuthority ?? '',
      mergeSourceEntityIds: uniqueText(spec.mergeSourceEntityIds ?? []),
    }];
  });
}

/** @param {Record<string, unknown>[]} edges @returns {Map<string,number>} */
function nodeDegrees(edges) {
  const degrees = new Map();
  for (const edge of edges) for (const id of [edge.fromNodeId, edge.toNodeId]) degrees.set(id, (degrees.get(id) ?? 0) + 1);
  return degrees;
}

/** @param {Record<string, unknown>} model @param {Record<string, unknown>} connectivity @param {number} toleranceMm @returns {Readonly<Record<string, unknown>>} */
export function buildCanonicalTopology(model, connectivity, engineering, toleranceMm, supportProjectionToleranceMm) {
  const issues = [...connectivity.issues];
  const overlapBySource = new Map(connectivity.overlapGroups.flatMap((group) => [
    [group.primary.sourceEntityId, group], [group.secondary.sourceEntityId, group],
  ]));
  const componentEdges = model.components.flatMap((component) => componentEdgeSpecs(
    component, overlapBySource.get(component.sourceEntityId) ?? null,
  ));
  const rawEdgeSpecs = [...componentEdges, ...crefEdgeSpecs(connectivity.crefConnections)];
  const edgeSpecs = splitEdgeSpecsAtSupports(
    rawEdgeSpecs, engineering.supports, connectivity, toleranceMm, supportProjectionToleranceMm,
  );
  const pointSpecs = pointFeatureSpecs(model), rawJunctions = junctionSpecs(model), rawBoundaries = boundarySpecs(model);
  const { nodes, rootToNode } = buildNodes(model, connectivity, edgeSpecs, rawJunctions, rawBoundaries);
  const edges = buildEdges(edgeSpecs, connectivity, rootToNode, issues);
  const degrees = nodeDegrees(edges);
  const pointFeatures = pointSpecs.map((spec, index) => ({
    id: `PF-${sequenceId(index + 1)}`, kind: spec.kind, position: { ...spec.port.position },
    sourceEntityIds: uniqueText([spec.component.sourceEntityId, spec.component.sourceBranchEntityId]),
    sourceTypes: [spec.component.sourceType, 'BRANCH'],
  }));
  const junctions = rawJunctions.map((spec, index) => {
    const node = rootToNode.get(connectivity.set.find(spec.port.key));
    const targetBranches = connectivity.crefConnections
      .filter((connection) => connection.component.sourceEntityId === spec.component.sourceEntityId)
      .map((connection) => connection.targetBranch.sourceEntityId);
    return {
      id: `CJ-${sequenceId(index + 1)}`, kind: spec.kind, nodeId: node.id,
      position: { ...node.position }, expectedDegree: degrees.get(node.id) ?? 0,
      sourceEntityIds: uniqueText([spec.component.sourceEntityId, spec.component.sourceBranchEntityId, ...targetBranches]),
      sourceTypes: [spec.component.sourceType, 'BRANCH'],
      sourceRelationship: cleanText(spec.component.attributes.CREF) ? `CREF:${spec.component.attributes.CREF}` : 'EXTERNAL_OR_UNMODELED',
    };
  });
  const boundaries = rawBoundaries.map((spec, index) => {
    const node = rootToNode.get(connectivity.set.find(spec.port.key));
    return {
      id: `CB-${sequenceId(index + 1)}`, nodeId: node.id, position: { ...node.position },
      sourceEntityIds: spec.sourceEntityIds, relationship: spec.relationship, sourceRelationship: spec.relationship,
    };
  });
  const supports = engineering.supports.map((support) => {
    const port = support.attachmentPort ?? support.port;
    const node = rootToNode.get(connectivity.set.find(port.key));
    if (!node) throw new Error(`Support ${support.id} has no canonical attachment node.`);
    return {
      id: support.id,
      nodeId: node.id,
      position: { ...node.position },
      sourcePosition: { ...support.sourcePosition },
      attachmentPosition: { ...support.attachmentPosition },
      attachmentAuthority: support.attachmentAuthority,
      attachmentReferences: support.attachmentReferences,
      attachedComponentEntityIds: support.attachedComponentEntityIds,
      attachmentEdgeSourcePath: support.attachmentEdgeSourcePath,
      tag: support.tag,
      sourceEntityIds: support.sourceEntityIds,
      sourcePaths: support.sourcePaths,
      restraints: support.restraints,
      connectionResidual: support.connectionResidual,
    };
  });
  const rigids = assignRigidEdges(edges, nodes, engineering.rigids, supportProjectionToleranceMm);
  return Object.freeze({
    schema: 'CanonicalTopology.v2',
    sourceIdentity: model.sourceIdentity,
    coordinateFrame: Object.freeze({ schema: 'ManagedStage.XYZ.v1', unit: 'mm', axisFabrication: false }),
    toleranceMm: toleranceMm ?? TOPOLOGY_TOLERANCE_MM,
    nodes: Object.freeze(nodes), edges: Object.freeze(edges),
    pointFeatures: Object.freeze(pointFeatures), junctions: Object.freeze(junctions), boundaries: Object.freeze(boundaries),
    supports: Object.freeze(supports), rigids: Object.freeze(rigids),
    buildIssues: Object.freeze(issues),
  });
}
