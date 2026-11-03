import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';

export const SUPPORT_HOST_PROFILE = deepFreeze({
  profile: 'FBX_SUPPORT_HOST_CONTACT_V1',
  coordinateUnit: 'millimetre',
  maximumCandidates: 20000,
  maximumAdmittedPipes: 20000,
  maximumCandidateHostPairs: 200000,
  maximumPolygonsPerCandidate: 250000,
  maximumVertexReferencesPerCandidate: 500000,
  maximumTrianglesPerCandidate: 500000,
  maximumTrianglesPerZone: 5000000,
  maximumPipeSearchRadiusMm: 1500,
  contactClearanceAbsoluteMm: 2,
  contactClearanceDiameterRatio: 0.01,
  contactClearanceMaximumMm: 20,
  contactNormalToleranceDegrees: 30,
  minimumContactWitnessCount: 3,
  minimumContactTriangleCount: 1,
  minimumAxialContactOverlapAbsoluteMm: 10,
  minimumAxialContactOverlapDiameterRatio: 0.05,
  minimumAxialContactOverlapMaximumMm: 100,
  minimumStructuralContinuationAbsoluteMm: 15,
  minimumStructuralContinuationDiameterRatio: 0.10,
  minimumStructuralContinuationMaximumMm: 150,
  polygonPlanarityAbsoluteMm: 0.01,
  polygonPlanarityRatio: 0.000001,
  degenerateTriangleAreaMm2Inclusive: 0.00000001,
  duplicateCylinderPositionToleranceMm: 0.000001,
  duplicateCylinderDirectionTolerance: 0.000000000001,
});

export function scaledBound(absolute, maximum, ratio, scale) {
  return Math.max(absolute, Math.min(maximum, ratio * scale));
}

export async function supportHostProfileDigest(profile = SUPPORT_HOST_PROFILE) {
  return sha256Hex(canonicalJson(profile));
}

export function supportHostPolicyText(profile = SUPPORT_HOST_PROFILE) {
  return [
    'Support host proof uses admitted PIPE classifications only.',
    `Contact clearance = max(${profile.contactClearanceAbsoluteMm} mm, `
      + `${profile.contactClearanceDiameterRatio} × diameter), capped at `
      + `${profile.contactClearanceMaximumMm} mm.`,
    `Triangle normal tolerance: ${profile.contactNormalToleranceDegrees}°.`,
    `Minimum contact witnesses: ${profile.minimumContactWitnessCount}.`,
    'Nearest-pipe and name-based fallback: disabled.',
  ].join(' ');
}
