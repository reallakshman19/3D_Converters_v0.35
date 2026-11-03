import assert from 'node:assert/strict';
import {
  FBX2_SMALL_BENCHMARK_PROFILE,
  validateFbx2SmallBenchmarkPopulation,
  validateFbx2SmallBenchmarkSources,
} from '../../scripts/fbx/fbx2-small-benchmark/profile.mjs';

const profile = FBX2_SMALL_BENCHMARK_PROFILE;
assert.equal(profile.selectedZoneLabel, '/GLRD-1000-CU-PI-P');
assert.equal(profile.targets.terminalCoverageRatio, 1);
assert.equal(profile.targets.exactParityRatio, 1);

const identity = (value) => ({ byteLength: value.byteLength, sha256: value.sha256 });
assert.equal(validateFbx2SmallBenchmarkSources({
  sourceArchive: identity(profile.sourceArchive),
  sourceFbx: identity(profile.sourceFbx),
  managedArchive: identity(profile.managedArchive),
  managedJson: identity(profile.managedJson),
}), profile);

assert.throws(() => validateFbx2SmallBenchmarkSources({
  sourceArchive: { ...identity(profile.sourceArchive), byteLength: 1 },
  sourceFbx: identity(profile.sourceFbx),
  managedArchive: identity(profile.managedArchive),
  managedJson: identity(profile.managedJson),
}), /SOURCE_IDENTITY_MISMATCH/);

const sourceGraph = {
  schema: profile.expectedSourceGraph.schema,
  sourceObjects: Array(profile.expectedSourceGraph.sourceObjectCount),
  occurrences: Array(profile.expectedSourceGraph.occurrenceCount),
  geometries: Array(profile.expectedSourceGraph.geometryCount),
};
const selectedZone = {
  label: profile.selectedZoneLabel,
  selectedOccurrenceCount: profile.expectedSelectedZone.occurrenceCount,
  selectedGeometryCount: profile.expectedSelectedZone.geometryCount,
};
assert.equal(validateFbx2SmallBenchmarkPopulation({ sourceGraph, selectedZone }), selectedZone);
assert.throws(() => validateFbx2SmallBenchmarkPopulation({
  sourceGraph: { ...sourceGraph, occurrences: [] }, selectedZone,
}), /SOURCE_POPULATION_MISMATCH/);
assert.throws(() => validateFbx2SmallBenchmarkPopulation({
  sourceGraph, selectedZone: { ...selectedZone, selectedGeometryCount: 437 },
}), /SELECTED_ZONE_MISMATCH/);

console.log('test-fbx2-small-benchmark-profile: PASS');
