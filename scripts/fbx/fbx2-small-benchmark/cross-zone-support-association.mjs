import { createHash } from 'node:crypto';
import {
  FBX2_BENCHMARK_COORDINATE_PROFILE,
  FBX2_BENCHMARK_COORDINATE_PROFILE_DIGEST,
  managedToSourcePosition,
} from './coordinate-profile.mjs';
import { buildFbx2SupportNameInventory } from './support-name-authority.mjs';

function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(compareText)
    .map((key) => [key, canonical(value[key])]));
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function distance(left, right) {
  return Math.hypot(
    left[0] - right[0], left[1] - right[1], left[2] - right[2],
  );
}

function pointSegmentDistance(point, start, end) {
  const axis = end.map((value, index) => value - start[index]);
  const lengthSquared = axis.reduce((sum, value) => sum + value * value, 0);
  if (lengthSquared === 0) return distance(point, start);
  const projection = point.reduce((sum, value, index) => (
    sum + (value - start[index]) * axis[index]
  ), 0) / lengthSquared;
  const parameter = Math.max(0, Math.min(1, projection));
  const closest = start.map((value, index) => value + parameter * axis[index]);
  return distance(point, closest);
}

function upperSet(values) {
  return new Set((values || []).filter(Boolean).map((value) => String(value).toUpperCase()));
}

function recordById(globalIndex) {
  return new Map((globalIndex?.records || [])
    .map((record) => [record.sourceOccurrenceId, record]));
}

function candidateRecord(candidate, globalById, selectedZoneId) {
  const anchor = globalById.get(candidate.anchorOccurrenceId);
  const structure = candidate.structureAnchorOccurrenceId
    ? globalById.get(candidate.structureAnchorOccurrenceId) : null;
  const descendants = candidate.selectedDescendantOccurrenceIds
    .map((id) => globalById.get(id)).filter(Boolean);
  const assignedZoneIds = [...new Set(descendants
    .map((record) => record.assignedZoneId).filter(Boolean))].sort(compareText);
  const exactTags = upperSet([
    candidate.supportLabel, candidate.structureLabel,
    ...(anchor?.exactTagValues || []), ...(structure?.exactTagValues || []),
  ]);
  return Object.freeze({
    candidateId: `cross-zone-support:${candidate.anchorOccurrenceId}`,
    sourceOccurrenceId: candidate.anchorOccurrenceId,
    sourceModelObjectId: anchor?.sourceModelObjectId ?? null,
    supportToken: candidate.supportToken, supportLabel: candidate.supportLabel,
    structureAnchorOccurrenceId: candidate.structureAnchorOccurrenceId,
    structureToken: candidate.structureToken, structureLabel: candidate.structureLabel,
    selectedDescendantOccurrenceIds: candidate.selectedDescendantOccurrenceIds,
    selectedGeometryObjectIds: candidate.selectedGeometryObjectIds,
    assignedZoneIds: Object.freeze(assignedZoneIds),
    outsideSelectedZone: assignedZoneIds.length > 0
      && assignedZoneIds.every((zoneId) => zoneId !== selectedZoneId),
    worldPositionMm: anchor?.worldOriginMm ?? null,
    exactTagValues: Object.freeze([...exactTags].sort(compareText)),
  });
}

function candidateRecords(sourceGraph, globalIndex, selectedZoneId) {
  const globalById = recordById(globalIndex);
  const renderable = (globalIndex?.records || [])
    .filter((record) => record.geometryObjectIds.length)
    .map((record) => record.sourceOccurrenceId);
  const inventory = buildFbx2SupportNameInventory({
    sourceGraph, selectedOccurrenceIds: renderable,
  });
  return inventory.candidates
    .map((candidate) => candidateRecord(candidate, globalById, selectedZoneId))
    .filter((candidate) => candidate.outsideSelectedZone && candidate.worldPositionMm)
    .sort((left, right) => compareText(left.candidateId, right.candidateId));
}

function componentPositionResidual(position, component) {
  if (component.managedEndpointAMm && component.managedEndpointBMm) {
    return pointSegmentDistance(position,
      component.managedEndpointAMm, component.managedEndpointBMm);
  }
  if (component.managedPositionMm) return distance(position, component.managedPositionMm);
  return Number.POSITIVE_INFINITY;
}

function explicitHost(record, components) {
  if (!record.explicitHostReference) return null;
  const folded = record.explicitHostReference.toUpperCase();
  const matches = components.filter((component) => (
    component.reference?.toUpperCase() === folded
    || component.managedRecordId.toUpperCase() === folded
  ));
  return matches.length === 1 ? {
    status: 'PASS', component: matches[0], residualMm: null, authority: 'EXPLICIT_HOST_REFERENCE',
  } : {
    status: 'BLOCKED', component: null, residualMm: null,
    authority: matches.length ? 'AMBIGUOUS_EXPLICIT_HOST_REFERENCE' : 'HOST_REFERENCE_NOT_FOUND',
  };
}

function spatialHost(record, components, profile) {
  if (!record.managedPositionMm) {
    return { status: 'BLOCKED', component: null, residualMm: null,
      authority: 'HOST_POSITION_MISSING' };
  }
  const candidates = components.filter((component) => component.family === 'PIPE')
    .map((component) => ({ component,
      residualMm: componentPositionResidual(record.managedPositionMm, component) }))
    .filter((item) => item.residualMm <= profile.hostAxisToleranceMm)
    .sort((left, right) => left.residualMm - right.residualMm
      || compareText(left.component.managedRecordId, right.component.managedRecordId));
  if (candidates.length !== 1) {
    return { status: 'BLOCKED', component: null,
      residualMm: candidates[0]?.residualMm ?? null,
      authority: candidates.length ? 'AMBIGUOUS_BRANCH_HOST' : 'HOST_COMPONENT_UNRESOLVED' };
  }
  return { status: 'PASS', component: candidates[0].component,
    residualMm: candidates[0].residualMm, authority: 'UNIQUE_BRANCH_PIPE_AXIS' };
}

function hostFor(record, managedInventory, profile) {
  const branchComponents = managedInventory.components.filter((component) => (
    component.branchId === record.branchId && component.family !== 'SUPPORT'
  ));
  const explicit = explicitHost(record, branchComponents);
  return explicit ?? spatialHost(record, branchComponents, profile);
}

function candidateMatches(record, candidates, profile) {
  if (!record.managedPositionMm) return [];
  const sourcePosition = managedToSourcePosition(record.managedPositionMm, profile);
  const tags = upperSet(record.matchingTags);
  const positionMatches = candidates.map((candidate) => {
    const matchedTags = candidate.exactTagValues.filter((tag) => tags.has(tag));
    return {
      candidate,
      transformedManagedPositionMm: sourcePosition,
      positionResidualMm: distance(sourcePosition, candidate.worldPositionMm),
      matchedTags,
    };
  }).filter((item) => item.positionResidualMm <= profile.positionToleranceMm);
  const tagCorroborated = positionMatches.filter((item) => item.matchedTags.length > 0);
  return (tagCorroborated.length ? tagCorroborated : positionMatches)
    .sort((left, right) => left.positionResidualMm - right.positionResidualMm
      || compareText(left.candidate.candidateId, right.candidate.candidateId));
}

function proposedAssociation(record, candidates, managedInventory, profile) {
  const host = hostFor(record, managedInventory, profile);
  if (!record.managedPositionMm) {
    return { record, host, status: 'BLOCKED', disposition: 'COORDINATE_PROFILE_MISMATCH',
      candidates: [], match: null };
  }
  const matches = candidateMatches(record, candidates, profile);
  if (matches.length !== 1) {
    return { record, host, status: 'BLOCKED',
      disposition: matches.length ? 'AMBIGUOUS_MATCH' : 'SOURCE_RECORD_NOT_FOUND',
      candidates: matches, match: null };
  }
  if (host.status !== 'PASS') {
    return { record, host, status: 'BLOCKED', disposition: host.authority,
      candidates: matches, match: matches[0] };
  }
  return { record, host, status: 'PASS', disposition: 'MATCHED_CROSS_ZONE_SUPPORT',
    candidates: matches, match: matches[0] };
}

function enforceOneToOne(proposals) {
  const claims = new Map();
  for (const proposal of proposals.filter((item) => item.match)) {
    const id = proposal.match.candidate.candidateId;
    const values = claims.get(id) || [];
    values.push(proposal.record.managedRecordId); claims.set(id, values);
  }
  return proposals.map((proposal) => {
    if (!proposal.match) return proposal;
    const values = claims.get(proposal.match.candidate.candidateId) || [];
    return values.length === 1 ? proposal : {
      ...proposal, status: 'BLOCKED', disposition: 'AMBIGUOUS_MATCH',
    };
  });
}

function associationRecord(proposal) {
  const match = proposal.match;
  const reasons = [];
  if (match?.matchedTags.length) reasons.push('EXACT_SUPPORT_TAG_CORROBORATED');
  if (match) reasons.push('GOVERNED_POSITION_CORROBORATED');
  if (proposal.host.status === 'PASS') reasons.push(proposal.host.authority);
  if (proposal.status === 'BLOCKED') reasons.push(proposal.disposition);
  return Object.freeze({
    managedRecordId: proposal.record.managedRecordId,
    branchId: proposal.record.branchId,
    managedReference: proposal.record.reference,
    status: proposal.status,
    disposition: proposal.disposition,
    sourceOccurrenceId: match?.candidate.sourceOccurrenceId ?? null,
    sourceModelObjectId: match?.candidate.sourceModelObjectId ?? null,
    supportToken: match?.candidate.supportToken ?? null,
    supportLabel: match?.candidate.supportLabel ?? null,
    structureAnchorOccurrenceId: match?.candidate.structureAnchorOccurrenceId ?? null,
    structureLabel: match?.candidate.structureLabel ?? null,
    assignedZoneIds: match?.candidate.assignedZoneIds ?? Object.freeze([]),
    selectedDescendantOccurrenceIds: match?.candidate.selectedDescendantOccurrenceIds
      ?? Object.freeze([]),
    selectedGeometryObjectIds: match?.candidate.selectedGeometryObjectIds
      ?? Object.freeze([]),
    transformedManagedPositionMm: match?.transformedManagedPositionMm ?? null,
    sourcePositionMm: match?.candidate.worldPositionMm ?? null,
    positionResidualMm: match?.positionResidualMm ?? null,
    matchedTags: Object.freeze([...(match?.matchedTags || [])]),
    hostManagedRecordId: proposal.host.component?.managedRecordId ?? null,
    hostAuthority: proposal.host.authority,
    hostResidualMm: proposal.host.residualMm,
    candidateSourceOccurrenceIds: Object.freeze(proposal.candidates
      .map((item) => item.candidate.sourceOccurrenceId).sort(compareText)),
    reasons: Object.freeze(reasons),
  });
}

function count(associations, status) {
  return associations.filter((item) => item.status === status).length;
}

function validateAssociationInputs(input) {
  if (input.sourceGraph?.schema !== 'FbxSourceGraph.v2'
      || !Array.isArray(input.managedInventory?.components)
      || input.globalOccurrenceIndex?.schema !== 'FbxGlobalOccurrenceIndex.v1'
      || !input.selectedZoneId) {
    throw new TypeError('FBX2_CROSS_ZONE_SUPPORT_INPUT_INVALID');
  }
}

function associationPayload(input, supports, candidates, associations) {
  return {
    schema: 'FbxCrossZoneSupportAssociationEvidence.v1',
    selectedZoneId: input.selectedZoneId,
    coordinateProfile: input.coordinateProfile,
    coordinateProfileDigest: FBX2_BENCHMARK_COORDINATE_PROFILE_DIGEST,
    expectedManagedSupportCount: supports.length,
    eligibleCrossZoneCandidateCount: candidates.length,
    matchedCount: count(associations, 'PASS'), blockedCount: count(associations, 'BLOCKED'),
    ambiguousCount: associations.filter((item) => item.disposition === 'AMBIGUOUS_MATCH').length,
    associations: Object.freeze(associations),
    authority: Object.freeze({
      selectedZonePopulationChanged: false, siblingGeometryImported: false,
      exactTagsAreCorroborationOnly: true, governedCoordinateProfileRequired: true,
      uniqueBranchHostRequired: true, oneToOneSourceClaimRequired: true,
      restraintSubtypeParityClaimed: false,
    }),
  };
}

export function buildFbx2CrossZoneSupportAssociation(input = {}) {
  const normalized = { ...input,
    coordinateProfile: input.coordinateProfile ?? FBX2_BENCHMARK_COORDINATE_PROFILE };
  validateAssociationInputs(normalized);
  const supports = normalized.managedInventory.components
    .filter((record) => record.family === 'SUPPORT');
  const candidates = candidateRecords(normalized.sourceGraph,
    normalized.globalOccurrenceIndex, normalized.selectedZoneId);
  const proposals = enforceOneToOne(supports.map((record) => proposedAssociation(
    record, candidates, normalized.managedInventory, normalized.coordinateProfile,
  )));
  const associations = proposals.map(associationRecord)
    .sort((left, right) => compareText(left.managedRecordId, right.managedRecordId));
  const payload = associationPayload(normalized, supports, candidates, associations);
  return Object.freeze({ ...payload, evidenceDigest: sha256(payload) });
}
