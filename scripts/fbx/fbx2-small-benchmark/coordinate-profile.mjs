import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export const FBX2_BENCHMARK_COORDINATE_PROFILE = Object.freeze({
  schema: 'FbxBenchmarkCoordinateProfile.v1',
  profileId: 'FBX2-GLRD-STAGED-TO-SOURCE-20260731',
  sourceCoordinateSystem: 'FBX_WORLD_MM',
  targetCoordinateSystem: 'MANAGED_STAGED_JSON_MM',
  axisOrder: Object.freeze(['X', 'Y', 'Z']),
  unit: 'mm',
  managedToSourceTranslationMm: Object.freeze([0, 0, 100000]),
  managedToSourceScale: 1,
  positionToleranceMm: 0.01,
  hostAxisToleranceMm: 0.01,
  oneToOneRequired: true,
  authoritySource: 'FBX2_BENCHMARK_GOVERNED_DATUM',
});

export const FBX2_BENCHMARK_COORDINATE_PROFILE_DIGEST = digest(
  FBX2_BENCHMARK_COORDINATE_PROFILE,
);

export function managedToSourcePosition(positionMm,
  profile = FBX2_BENCHMARK_COORDINATE_PROFILE) {
  if (!Array.isArray(positionMm) || positionMm.length !== 3
      || positionMm.some((value) => !Number.isFinite(value))) {
    throw new TypeError('FBX2_COORDINATE_PROFILE_POSITION_INVALID');
  }
  const scale = Number(profile.managedToSourceScale);
  const offset = profile.managedToSourceTranslationMm;
  if (!Number.isFinite(scale) || !Array.isArray(offset) || offset.length !== 3) {
    throw new TypeError('FBX2_COORDINATE_PROFILE_INVALID');
  }
  return positionMm.map((value, index) => {
    const transformed = value * scale + offset[index];
    return Object.is(transformed, -0) ? 0 : transformed;
  });
}
