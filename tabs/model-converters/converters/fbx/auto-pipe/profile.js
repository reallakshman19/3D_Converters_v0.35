export const AUTO_PIPE_PROFILE = Object.freeze({
  schema: 'FbxAutoPipeProfile.v1',
  minimumSpanMm: 1e-6,
  normalDotTolerance: 1e-8,
  roleOrdering: 'world-centre-lexicographic',
  radiusAbsoluteMm: 0.05,
  radiusRatio: 0.001,
  axialAbsoluteMm: 0.01,
  axialSpanRatio: 0.0001,
  radialAbsoluteMm: 0.05,
  radialRadiusRatio: 0.001,
});

export const AUTO_PIPE_CONNECTIVITY_PROFILE = Object.freeze({
  schema: 'FbxAutoPipeConnectivityProfile.v1',
  centreAbsoluteMm: 1e-6,
  normalDotTolerance: 1e-8,
  radiusAbsoluteMm: 0.05,
  radiusRatio: 0.001,
});

export const AUTO_PIPE_RESOURCE_LIMITS = Object.freeze({
  schema: 'FbxAutoPipeResourceLimits.v1',
  maximumPipeOccurrences: 1024,
  maximumPorts: 2048,
  maximumConnectionPairs: 2096128,
});

export function scaledTolerance(absolute, ratio, scale) {
  return Math.max(absolute, ratio * scale);
}
