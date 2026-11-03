/**
 * Matches support anchors to route edges and splits accepted edges. Explicit
 * ATTACHED_COMPONENT_REF/COMPRE evidence outranks coordinate proximity. Without
 * that evidence, branch ownership and the configured projection limit remain
 * mandatory. Global proximity is diagnostic only.
 */

import { pointSegmentDistance } from './topology-geometry-distance.js';
import { cleanText, pointDistance, strictPoint, uniqueText } from './topology-values.js';

const TOPOLOGY_SOURCE_POSITION_FIELD = 'TOPOLOGY_SOURCE_POSITION';
const TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH_FIELD = 'TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH';

/** @param {{x:number,y:number,z:number}|null} point @returns {string} */
function pointText(point) {
  if (!point) return '(none)';
  return `${point.x.toFixed(3)},${point.y.toFixed(3)},${point.z.toFixed(3)}`;
}

/** @param {number|undefined} value @returns {string} */
function distanceText(value) {
  return Number.isFinite(value) ? Number(value).toFixed(3) : 'unbounded';
}

/** @param {Record<string, unknown>} support @returns {void} */
function applySupportPositionEvidence(support) {
  const attributes = support.component?.attributes;
  if (!attributes) return;
  const hasSourcePosition = Object.hasOwn(attributes, TOPOLOGY_SOURCE_POSITION_FIELD);
  const hasCarrierPath = Object.hasOwn(attributes, TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH_FIELD);
  if (!hasSourcePosition && !hasCarrierPath) return;
  if (hasSourcePosition !== hasCarrierPath) {
    throw new TypeError(
      `Support ${support.tag || support.id} dual-position evidence requires both `
      + `${TOPOLOGY_SOURCE_POSITION_FIELD} and ${TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH_FIELD}.`,
    );
  }
  const sourcePosition = strictPoint(attributes[TOPOLOGY_SOURCE_POSITION_FIELD]);
  if (!sourcePosition) {
    throw new TypeError(`Support ${support.tag || support.id} has invalid ${TOPOLOGY_SOURCE_POSITION_FIELD} evidence.`);
  }
  const carrierPath = cleanText(attributes[TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH_FIELD]);
  if (!carrierPath) {
    throw new TypeError(`Support ${support.tag || support.id} has invalid ${TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH_FIELD} evidence.`);
  }
  support.sourcePosition = sourcePosition;
  support.positionAuthority = `ATTRIBUTE:${TOPOLOGY_SOURCE_POSITION_FIELD}`;
  support.topologyPositionOverride = true;
  support.topologyAttachmentEdgeSourcePath = carrierPath;
}

/** @param {Record<string, unknown>[]} edgeSpecs @param {Record<string, unknown>} support @param {'owning'|'referenced'|'all'} scope @returns {Record<string, unknown>[]} */
function rankedSupportCandidates(edgeSpecs, support, scope) {
  const attached = new Set(support.attachedComponentEntityIds ?? []);
  return edgeSpecs.flatMap((edge, index) => {
    const owns = support.sourceBranchEntityIds.some((id) => edge.sourceEntityIds.includes(id));
    const referenced = edge.sourceEntityIds.some((id) => attached.has(id));
    if (scope === 'owning' && !owns) return [];
    if (scope === 'referenced' && !referenced) return [];
    const proximity = pointSegmentDistance(support.sourcePosition, edge.fromPort.position, edge.toPort.position);
    return [{ edge, index, owns, referenced, ...proximity }];
  }).sort((left, right) => left.distanceMm - right.distanceMm || left.index - right.index);
}

/** @param {Record<string, unknown>[]} edgeSpecs @param {Record<string, unknown>} support @returns {Record<string, unknown>|null} */
function authoritativeSupportCandidate(edgeSpecs, support) {
  const carrierPath = cleanText(support.topologyAttachmentEdgeSourcePath);
  if (!carrierPath) return null;
  const candidates = rankedSupportCandidates(edgeSpecs, support, 'all')
    .filter((candidate) => cleanText(candidate.edge.sourcePath) === carrierPath);
  if (!candidates.length) {
    throw new Error(
      `Support ${support.tag || support.id} cannot resolve carrier ${carrierPath}. `
      + '[TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH_NOT_FOUND]',
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `Support ${support.tag || support.id} carrier ${carrierPath} resolves to ${candidates.length} edges. `
      + '[TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH_AMBIGUOUS]',
    );
  }
  const selected = candidates[0];
  if (!selected.owns && !selected.referenced) {
    throw new Error(
      `Support ${support.tag || support.id} carrier ${carrierPath} is neither on its owning branch nor explicitly referenced. `
      + '[TOPOLOGY_ATTACHMENT_EDGE_SOURCE_PATH_OUTSIDE_AUTHORITY]',
    );
  }
  if (support.attachmentReferences.length && !selected.referenced) {
    throw unresolvedReferenceError(support);
  }
  return selected;
}

/** @param {Record<string, unknown>} support @param {Record<string, unknown>|undefined} owning @param {Record<string, unknown>|undefined} global @param {number} toleranceMm @returns {Error} */
function supportProjectionError(support, owning, global, toleranceMm) {
  const classification = global && global.distanceMm <= toleranceMm
    ? 'POSSIBLE_WRONG_BRANCH_OWNERSHIP' : 'SOURCE_SUPPORT_POSITION_OR_ROUTE_INVALID';
  const owningText = owning
    ? `${owning.edge.sourcePath}/${owning.edge.segmentRole}@${pointText(owning.projected)}` : '(none)';
  const globalText = global
    ? `${global.edge.sourcePath}/${global.edge.segmentRole}@${pointText(global.projected)}:${distanceText(global.distanceMm)}mm` : '(none)';
  return new Error(
    `Support ${support.tag || support.id} is ${distanceText(owning?.distanceMm)} mm from its owning branch; limit is ${distanceText(toleranceMm)} mm. `
    + `[${classification}] sourcePath=${support.sourcePaths.join('|')}; branches=${support.sourceBranchNames.join('|')}; `
    + `positionAuthority=${support.positionAuthority}; position=${pointText(support.sourcePosition)}; nearestOwning=${owningText}; nearestAny=${globalText}.`,
  );
}

/** @param {Record<string, unknown>} support @param {Record<string, unknown>} match @param {number} toleranceMm @returns {Record<string, unknown>|null} */
function editedTopologyPosition(support, match, toleranceMm) {
  if (support.topologyPositionOverride !== true) return null;
  const projection = pointSegmentDistance(support.position, match.edge.fromPort.position, match.edge.toPort.position);
  if (projection.distanceMm > toleranceMm) {
    throw new Error(
      `Support ${support.tag || support.id} edited topology position is ${distanceText(projection.distanceMm)} mm from `
      + `carrier ${match.edge.sourcePath}; limit is ${distanceText(toleranceMm)} mm. `
      + `[TOPOLOGY_EDITED_SUPPORT_POSITION_OFF_CARRIER] position=${pointText(support.position)}; `
      + `nearest=${pointText(projection.projected)}.`,
    );
  }
  return projection;
}

/** @param {Record<string, unknown>} support @returns {Error} */
function unresolvedReferenceError(support) {
  return new Error(
    `Support ${support.tag || support.id} has unresolved attachment reference(s): `
    + `${support.unresolvedAttachmentReferences.join(', ')}. sourcePath=${support.sourcePaths.join('|')}.`,
  );
}

/** @param {Record<string, unknown>} support @param {Record<string, unknown>} match @param {string} authority @param {number} toleranceMm @returns {void} */
function acceptMatch(support, match, authority, toleranceMm) {
  const topologyProjection = editedTopologyPosition(support, match, toleranceMm);
  support.connectionResidual = match.distanceMm;
  support.edgeParameter = topologyProjection?.parameter ?? match.parameter;
  support.attachmentPosition = match.projected;
  support.attachmentAuthority = authority;
  support.attachmentEdgeSourcePath = match.edge.sourcePath;
  support.attachmentPort = {
    ...support.port,
    position: topologyProjection ? { ...support.position } : match.projected,
    sourcePath: `${support.port.sourcePath}:PROJECTED_ATTACHMENT`,
    canonicalPositionAuthority: true,
    attachmentAuthority: authority,
    sourcePosition: support.sourcePosition,
  };
}

/** @param {Record<string, unknown>[]} edgeSpecs @param {Record<string, unknown>[]} supports @param {number} toleranceMm @returns {Map<number,Record<string, unknown>[]>} */
function matchSupportsToEdges(edgeSpecs, supports, toleranceMm) {
  const matches = new Map();
  for (const support of supports) {
    applySupportPositionEvidence(support);
    const authoritative = authoritativeSupportCandidate(edgeSpecs, support);
    const referenced = rankedSupportCandidates(edgeSpecs, support, 'referenced');
    if (!authoritative && support.attachmentReferences.length && !referenced.length) throw unresolvedReferenceError(support);
    const owning = rankedSupportCandidates(edgeSpecs, support, 'owning');
    const global = rankedSupportCandidates(edgeSpecs, support, 'all');
    const match = authoritative ?? referenced[0] ?? owning[0];
    const matchIsReferenced = Boolean(match?.referenced && support.attachmentReferences.length);
    if (!match || (!matchIsReferenced && match.distanceMm > toleranceMm)) {
      throw supportProjectionError(support, match?.owns ? match : owning[0], global[0], toleranceMm);
    }
    const authority = matchIsReferenced
      ? `${support.attachmentAuthorities.join('+') || 'ATTACHED_COMPONENT_REF/COMPRE'}:${support.attachmentReferences.join('|')}`
      : 'OWNING_BRANCH_PROXIMITY';
    acceptMatch(support, match, authority, toleranceMm);
    matches.set(match.index, [...(matches.get(match.index) ?? []), support]);
  }
  return matches;
}

/** @param {Record<string, unknown>} support @returns {Record<string, unknown>} */
function effectivePort(support) {
  return support.attachmentPort ?? support.port;
}

/** @param {Record<string, unknown>} spec @param {Record<string, unknown>[]} supports @param {Readonly<Record<string, unknown>>} set @param {number} topologyToleranceMm @returns {Record<string, unknown>[]} */
function splitOneEdge(spec, supports, set, topologyToleranceMm) {
  const ordered = [...supports].sort((left, right) => left.edgeParameter - right.edgeParameter || left.order - right.order);
  const interior = [], atStart = [], atEnd = [];
  for (const support of ordered) {
    const port = effectivePort(support);
    if (pointDistance(port.position, spec.fromPort.position) <= topologyToleranceMm) {
      set.unite(port.key, spec.fromPort.key);
      atStart.push(support);
    } else if (pointDistance(port.position, spec.toPort.position) <= topologyToleranceMm) {
      set.unite(port.key, spec.toPort.key);
      atEnd.push(support);
    } else interior.push(support);
  }
  const interiorPoints = [];
  for (const support of interior) {
    const port = effectivePort(support);
    const previous = interiorPoints.at(-1);
    if (previous && pointDistance(previous.port.position, port.position) <= topologyToleranceMm) {
      set.unite(previous.port.key, port.key);
      previous.supports.push(support);
    } else interiorPoints.push({ port, supports: [support] });
  }
  const points = [{ port: spec.fromPort, supports: atStart }, ...interiorPoints, { port: spec.toPort, supports: atEnd }];
  return points.slice(1).map((point, index) => {
    const attachments = uniqueText([...points[index].supports, ...point.supports].flatMap((row) => row.sourceEntityIds));
    return {
      ...spec,
      fromPort: points[index].port,
      toPort: point.port,
      sourceEntityIds: uniqueText([...spec.sourceEntityIds, ...attachments]),
      sourceTypes: attachments.length ? uniqueText([...spec.sourceTypes, 'SUPPORT']) : spec.sourceTypes,
      segmentRole: interior.length ? `${spec.segmentRole}_SUPPORT_SPLIT` : spec.segmentRole,
    };
  });
}

/** @param {Record<string, unknown>[]} specs @param {Record<string, unknown>[]} supports @param {Record<string, unknown>} connectivity @param {number} topologyToleranceMm @param {number} projectionToleranceMm @returns {Record<string, unknown>[]} */
export function splitEdgeSpecsAtSupports(specs, supports, connectivity, topologyToleranceMm, projectionToleranceMm) {
  const matches = matchSupportsToEdges(specs, supports, projectionToleranceMm);
  return specs.flatMap((spec, index) => {
    const assigned = matches.get(index) ?? [];
    return assigned.length ? splitOneEdge(spec, assigned, connectivity.set, topologyToleranceMm) : [spec];
  });
}

export const _test = Object.freeze({
  applySupportPositionEvidence,
  rankedSupportCandidates,
  authoritativeSupportCandidate,
  supportProjectionError,
  editedTopologyPosition,
  unresolvedReferenceError,
});
