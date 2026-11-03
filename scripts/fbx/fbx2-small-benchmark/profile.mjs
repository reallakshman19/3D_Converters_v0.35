export const FBX2_SMALL_BENCHMARK_PROFILE = Object.freeze({
  profileId: 'FBX2-SMALL-GLRD-20260731',
  selectedZoneLabel: '/GLRD-1000-CU-PI-P',
  sourceArchive: Object.freeze({
    fileName: 'STF_2026Jul23-1554_binary.zip',
    byteLength: 3126315,
    sha256: '18758c5283b852efb2a1154fd07dcd9982c088b793e4ffe63b1a9ab2f11e6131',
  }),
  sourceFbx: Object.freeze({
    fileName: 'STF_2026Jul23-1554_binary.fbx',
    byteLength: 10066688,
    sha256: '7f198ce867ea33ce98b6d4f73f5a06c3c0e9a2f1a8e35412a63e38c504c83c1b',
  }),
  managedArchive: Object.freeze({
    fileName: 'ATTRIBUTE_GL_managed_stage.zip',
    byteLength: 73205,
    sha256: 'e0dbbc42ddedd17e96c3eadced2a4d65e10a333552c791dea4e725b9feea4cd8',
  }),
  managedJson: Object.freeze({
    fileName: 'ATTRIBUTE_GL_managed_stage.json',
    byteLength: 1687826,
    sha256: '5b7430e371442c9b24d8eba87edbbfb5c3c52761a13c743fa2bcff94418c6f1e',
  }),
  expectedSourceGraph: Object.freeze({
    schema: 'FbxSourceGraph.v2',
    sourceObjectCount: 5608,
    occurrenceCount: 2052,
    geometryCount: 1540,
  }),
  expectedSelectedZone: Object.freeze({
    occurrenceCount: 438,
    geometryCount: 438,
  }),
  targets: Object.freeze({
    terminalCoverageRatio: 1,
    exactParityRatio: 1,
  }),
});

function identityMismatch(label, actual, expected) {
  if (actual.byteLength !== expected.byteLength || actual.sha256 !== expected.sha256) {
    throw new Error(`FBX2_SMALL_SOURCE_IDENTITY_MISMATCH ${label}`);
  }
}

export function validateFbx2SmallBenchmarkSources({
  sourceArchive,
  sourceFbx,
  managedArchive,
  managedJson,
} = {}) {
  identityMismatch('source archive', sourceArchive, FBX2_SMALL_BENCHMARK_PROFILE.sourceArchive);
  identityMismatch('source FBX', sourceFbx, FBX2_SMALL_BENCHMARK_PROFILE.sourceFbx);
  identityMismatch('managed archive', managedArchive, FBX2_SMALL_BENCHMARK_PROFILE.managedArchive);
  identityMismatch('managed JSON', managedJson, FBX2_SMALL_BENCHMARK_PROFILE.managedJson);
  return FBX2_SMALL_BENCHMARK_PROFILE;
}

export function validateFbx2SmallBenchmarkPopulation({ sourceGraph, selectedZone } = {}) {
  const expectedGraph = FBX2_SMALL_BENCHMARK_PROFILE.expectedSourceGraph;
  if (sourceGraph?.schema !== expectedGraph.schema
      || sourceGraph.sourceObjects?.length !== expectedGraph.sourceObjectCount
      || sourceGraph.occurrences?.length !== expectedGraph.occurrenceCount
      || sourceGraph.geometries?.length !== expectedGraph.geometryCount) {
    throw new Error('FBX2_SMALL_SOURCE_POPULATION_MISMATCH');
  }
  const expectedZone = FBX2_SMALL_BENCHMARK_PROFILE.expectedSelectedZone;
  if (selectedZone?.label !== FBX2_SMALL_BENCHMARK_PROFILE.selectedZoneLabel
      || selectedZone.selectedOccurrenceCount !== expectedZone.occurrenceCount
      || selectedZone.selectedGeometryCount !== expectedZone.geometryCount) {
    throw new Error('FBX2_SMALL_SELECTED_ZONE_MISMATCH');
  }
  return selectedZone;
}
